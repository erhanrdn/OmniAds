# Phase 1.7 Reviewer Report: Meta Analysis Refetch Mismatch

## 1. Files inspected with line evidence

- `lib/meta/analysis-state.ts`
  - Lines 84-99 define `hasOwnString` and `normalizeDateOnly`, used to compare payload metadata safely.
  - Lines 101-122 define `responseRangeMismatch(response, expected)`, which checks `businessId`, `startDate`, and `endDate` against the active expected run range.
  - Lines 242-257 build `expectedRange` from the active selected `businessId/startDate/endDate` and compute recommendation/Decision OS range mismatch.
  - Lines 259-269 classify mismatched Decision OS payloads as `decisionOsStatus: "mismatch"`.
  - Lines 270-284 force mismatch into `presentationMode: "error"`.
  - Lines 308-317 return the safe error state/message when any analyzed response does not match the selected business or date range.
  - Lines 416-418 define refetch success as no `error`, `status !== "error"`, and `isError !== true`.
  - Lines 420-439 define usable schema checks only: recommendations require `status: "ok"` and an array `recommendations`; Decision OS requires `contractVersion: "meta-decision-os.v1"`.
  - Lines 441-453 define `didMetaAnalysisRefetchProduceUsableData`; it ORs successful usable recommendation/Decision OS responses and does not accept or compare the expected `businessId/startDate/endDate`.

- `app/(dashboard)/platforms/meta/page.tsx`
  - Lines 724-737 configure both manual analysis queries with keys containing `businessId/startDate/endDate`, but `enabled: false`.
  - Lines 740-754 call `deriveMetaAnalysisStatus` with the active selected `businessId/startDate/endDate` and current query data/errors.
  - Lines 792-797 clear last analyzed state when selected business or date range changes.
  - Lines 799-825 implement `handleAnalyze`; after both refetches resolve, lines 813-816 call `didMetaAnalysisRefetchProduceUsableData`, and lines 821-823 set `lastAnalyzedAt` and `lastAnalyzedRange` to the active selected range if that helper returns true.

- `lib/meta/analysis-state.test.ts`
  - Lines 211-225 cover `deriveMetaAnalysisStatus` returning error/mismatch when a Decision OS payload business id differs.
  - Lines 227-240 cover date normalization so ISO timestamps do not false-mismatch date-only active params.
  - Lines 242-256 cover the refetch helper rejecting error results.
  - Lines 258-272 cover the refetch helper accepting one successful usable response.
  - There is no test asserting that `didMetaAnalysisRefetchProduceUsableData` rejects successful usable-but-mismatched payloads.

- `app/(dashboard)/platforms/meta/page.test.tsx`
  - Lines 565-577 cover manual Decision OS being disabled by default and the header exposing `Run analysis`.
  - Lines 579-617 cover running-state rendering while manual analysis queries fetch.
  - Lines 619-648 cover Decision OS recommendation context rendering.
  - There is no page-level test for `handleAnalyze` refusing to stamp `lastAnalyzedAt` / `lastAnalyzedRange` when refetch results are mismatched.

## 2. Whether the issue is real

Yes. The issue is real.

`didMetaAnalysisRefetchProduceUsableData` currently validates only:

1. Refetch result success (`refetchResultSucceeded`).
2. Coarse usable response shape (`isUsableMetaRecommendationsResponse` or `isUsableMetaDecisionOsResponse`).

It does not know the active selected run context and therefore cannot reject payloads whose `businessId`, `startDate`, or `endDate` belong to another business/range.

## 3. Exact contradiction/risk

The contradiction is between the manual analyze success stamp and the status derivation:

- `handleAnalyze` can mark analysis as successfully completed for the currently selected range by setting `lastAnalyzedAt` and `lastAnalyzedRange` after the helper returns true.
- The helper can return true for a stale or cross-range payload because schema and refetch success are enough.
- `deriveMetaAnalysisStatus`, using the same active selected range, can then classify that payload as `state: "error"`, `decisionOsStatus: "mismatch"`, `presentationMode: "error"`, with the message that the analysis response does not match the selected business/date range.

That can produce UI that simultaneously implies "analysis just completed for this selected range" via `lastAnalyzedAt` / analyzed range metadata while the actual analysis status says the loaded payload is mismatched and unsafe to use. The risk is stale/cross-business/cross-date data being treated as a successful manual analysis completion marker even though the display layer correctly rejects it.

## 4. Minimal patch recommendation

Change `didMetaAnalysisRefetchProduceUsableData` to accept the expected active run range:

```ts
didMetaAnalysisRefetchProduceUsableData({
  recommendationsResult,
  decisionOsResult,
  expectedRange: { businessId, startDate, endDate },
})
```

Then require each successful usable payload counted by the helper to match `expectedRange` using the same normalization semantics as `responseRangeMismatch`. A minimal implementation would reuse or extract the existing mismatch logic so `deriveMetaAnalysisStatus` and the manual refetch gate cannot diverge.

Recommended behavior: return true only when at least one successful usable payload matches the expected range, and do not treat a successful usable-but-mismatched payload as evidence that the active selected run completed successfully. If any successful usable payload is mismatched, prefer failing safely so the user reruns analysis for the active range rather than stamping success over unsafe data.

## 5. Tests that should be added/updated

- Add `lib/meta/analysis-state.test.ts` coverage where a successful usable recommendations response has a different `businessId`, `startDate`, or `endDate`; expect `didMetaAnalysisRefetchProduceUsableData` to return false for the active expected range.
- Add equivalent coverage for a successful usable Decision OS response with mismatched `businessId`, `startDate`, or `endDate`.
- Preserve the existing ISO timestamp/date-only normalization behavior in helper tests, so `2026-04-01T00:00:00.000Z` can still match `2026-04-01`.
- Add or update `app/(dashboard)/platforms/meta/page.test.tsx` coverage for `handleAnalyze`: when refetch returns successful usable-but-mismatched data, the page should not set/display a successful analyzed timestamp/range and should show the safe analysis error path.

## 6. Reviewer recommendation: blocking/non-blocking

Blocking.

This is a correctness issue in the manual analysis completion gate. Connected/live Meta validation remains blocked and not waived, so the code should not ship a path that can stamp a selected range as successfully analyzed while the status model simultaneously identifies the payload as mismatched and unsafe.
