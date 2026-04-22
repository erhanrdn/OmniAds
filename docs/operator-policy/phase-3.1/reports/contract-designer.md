# Contract Designer Report

Date: 2026-04-21
Repo: `/Users/harmelek/Adsecute`
Scope: contract design only. No implementation changes were made.

## Executive summary

The current code already separates operator authority from reporting context in a few places:

- `src/types/operator-decision.ts` defines `analyticsWindow` as `analysis_only`.
- `lib/operator-decision-metadata.ts` already derives `recent7d`, `primary30d`, and `baseline90d` from `decisionAsOf`.
- Meta and Creative Decision OS both build primary decision rows from the stable `primary30d` window.

The gap is that the contract is not yet named and enforced consistently across the API, queue, and execution layers. `startDate` and `endDate` still behave like primary identity in several query paths, while provenance is mostly response-level instead of per-decision. That is the part that needs to be codified in Phase 3.1.

## Minimal shared contract

The smallest shared contract that satisfies the Phase 3.1 boundary is:

```ts
interface OperatorDecisionContext {
  decisionAsOf: string;
  analyticsStartDate: string;
  analyticsEndDate: string;
  reportingRange: {
    startDate: string;
    endDate: string;
    kind: "selected" | "comparison" | "historical";
  };
  sourceWindowKey: "recent7d" | "primary30d" | "baseline90d";
  sourceWindowDates: {
    startDate: string;
    endDate: string;
  };
  provenance: {
    evidenceHash: string;
    sourceDecisionId: string;
    sourceQueryKey: string;
  };
  pushEligibility: {
    queueEligible: boolean;
    canApply: boolean;
    canRollback: boolean;
    blockedReason: string | null;
  };
}
```

Recommended invariants:

- `decisionAsOf` is the authority anchor.
- `analyticsStartDate` / `analyticsEndDate` are reporting dates only.
- `reportingRange` is descriptive context and may vary without changing authority.
- `sourceWindowKey` and `sourceWindowDates` identify the stable decision window used to generate the action.
- `evidenceHash` is the stable proof that the action was generated from a specific decision payload.
- `actionFingerprint` must be derived from provenance, not from selected analytics dates.
- Missing provenance blocks `queueEligible`, `canApply`, and `canRollback`.
- Legacy fallback recommendations are report-only selected-range context; they are not action authority.

## Contract rules by surface

### Meta and Creative Decision OS

- Keep the existing response-level `startDate` / `endDate` fields for backward compatibility, but treat them as aliases for `analyticsStartDate` / `analyticsEndDate`.
- Add `operatorDecisionContext` to each decision row, not just to the top-level response.
- Populate `sourceWindowKey` from the actual stable window used to fetch rows.
- Populate `sourceWindowDates` from that window, not from the visible reporting range.
- Emit `provenance.evidenceHash` per decision row and use it to decide queue/apply eligibility.
- Keep selected-period historical analysis separate from the primary decision surface.

### Recommendations fallback

- `/api/meta/recommendations` may still return selected-range heuristics, but only as `selectedRangeContext`.
- When Decision OS is absent, the fallback response must be explicitly non-authoritative.
- Fallback output may describe the selected range, but it must not become queue-ready or apply-ready.

### Command Center / workflow / execution

- Queue selection must consume decision provenance, not selected analytics dates.
- `actionFingerprint` should include provenance and evidence hash.
- `previewHash` / apply / rollback must reject stale or missing provenance.
- If provenance is missing, the action stays visible as context but is not push-eligible.

## Exact files to update later

### Shared types and builders

- `src/types/operator-decision.ts`
  - Add `OperatorDecisionContext`, `OperatorDecisionReportingRange`, `OperatorDecisionSourceWindow`, `OperatorDecisionProvenance`, and `OperatorDecisionPushEligibility`.
  - Preserve the current `OperatorAnalyticsWindow` shape for compatibility.
- `lib/operator-decision-metadata.ts`
  - Return the shared `operatorDecisionContext`.
  - Keep `decisionAsOf` separate from analytics/reporting dates.
  - Derive `sourceWindowKey` / `sourceWindowDates` from the stable decision window, not the visible range.

### Decision OS surfaces

- `lib/meta/decision-os-source.ts`
- `lib/creative-decision-os-source.ts`
  - Thread the shared `operatorDecisionContext` into the source snapshot.
  - Make the source fetch identity stable on `decisionAsOf` and source window.
- `lib/meta/decision-os.ts`
- `lib/creative-decision-os.ts`
  - Attach per-row provenance.
  - Compute `evidenceHash`.
  - Set push eligibility from provenance and trust, not from selected dates.
- `app/api/meta/decision-os/route.ts`
- `app/api/creatives/decision-os/route.ts`
  - Treat `startDate` / `endDate` as analytics/reporting dates only.
  - Do not let analytics dates become the primary identity for the decision surface.
- `app/api/meta/recommendations/route.ts`
  - Keep legacy fallback selected-range context only.
  - Do not let fallback heuristics enter queue/apply eligibility.

### Command Center / queue / execution

- `lib/command-center.ts`
- `lib/command-center-service.ts`
- `src/services/data-service-command-center.ts`
  - Re-key queue and workflow lookups on provenance.
  - Stop forwarding selected analytics dates as identity.
- `lib/command-center-execution.ts`
- `lib/command-center-execution-service.ts`
  - Include provenance and evidence hash in preview hashing.
  - Make missing provenance a hard block for apply and rollback.
- `app/api/command-center/execution/route.ts`
- `app/api/command-center/execution/apply/route.ts`
- `app/api/command-center/execution/rollback/route.ts`
  - Accept analytics dates only as reporting context.
  - Require provenance for any replayable execution.

## Exact tests to add or update

### Shared contract tests

- `lib/operator-decision-metadata.test.ts`
  - Verify `decisionAsOf` drives `primary30d` and `baseline90d`.
  - Verify analytics/reporting dates do not alter the authority windows.

### Meta Decision OS

- `lib/meta/decision-os.test.ts`
  - Verify the same `decisionAsOf` with different analytics ranges yields identical primary decisions.
  - Verify provenance and evidence hash stay stable when only the reporting range changes.
- `app/api/meta/decision-os/route.test.ts`
  - Verify the route treats selected dates as reporting context only.
- `app/api/meta/recommendations/route.test.ts`
  - Verify fallback responses are marked non-authoritative and remain selected-range context only.

### Creative Decision OS

- `lib/creative-decision-os.test.ts`
  - Verify primary creative decisions remain stable when only analytics/reporting range changes.
  - Verify selected-period historical analysis may vary without mutating primary action identity.
- `app/api/creatives/decision-os/route.test.ts`
  - Verify route-level selected dates are reporting context only.

### Command Center / execution

- `lib/command-center-execution-service.test.ts`
  - Verify missing provenance blocks queue/apply/rollback eligibility.
  - Verify stale evidence hashes are rejected.
- `app/api/command-center/execution/route.test.ts`
- `app/api/command-center/execution/apply/route.test.ts`
- `app/api/command-center/execution/rollback/route.test.ts`
  - Verify execution endpoints resolve actions from provenance, not from selected analytics dates.
- `app/api/command-center/actions/route.test.ts`
- `app/api/command-center/actions/batch/route.test.ts`
  - Verify queue mutations remain tied to stable action identity.

## Recommended contract decision

Use this rule set:

1. `decisionAsOf` is the only authority anchor.
2. `analyticsStartDate` / `analyticsEndDate` are visible reporting dates only.
3. `reportingRange` may explain context but never authorizes action.
4. `sourceWindowKey`, `sourceWindowDates`, `provenance`, and `evidenceHash` define the actual decision identity.
5. `actionFingerprint` is a derived execution key, not a reporting key.
6. Missing provenance means no queueing, no apply, no rollback, and no push eligibility.
7. Legacy fallback recommendations remain readable, but they are report-only selected-range context.

That is the minimal shared contract that keeps Phase 3.1 backward compatible while preventing selected dashboard dates from masquerading as decision authority.
