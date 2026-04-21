# Legacy Rule Engine Auditor

## Bottom Line

Adsecute no longer has one standalone legacy creative rule engine as the source of truth. What remains is a compatibility stack around the current Creative Decision OS:

- `lib/meta/creative-score-service.ts` still serves a snapshot-backed selected-window scoring contract.
- `lib/ai/generate-creative-decisions.ts` now wraps `buildCreativeDecisionOs(...)` and maps current OS output back into the old `scale_hard | scale | watch | test_more | pause | kill` vocabulary.
- `app/api/meta/recommendations/route.ts` still contains the only live fallback path that can rebuild recommendations from selected-range heuristics when Decision OS is unavailable.

The current policy direction is correct: selected reporting range is analysis-only, while decision authority should come from stable operator windows anchored to `decisionAsOf` and `primary30d` (`docs/operator-policy/phase-2/reports/creative-performance-analyst.md:33-48`, `docs/operator-policy/phase-2/reports/code-data-contract-auditor.md:27-36`).

## Where The Legacy Logic Lives

- `lib/meta/creative-score-service.ts:15-17, 223-257, 260-474`
  - Selected-window creative score snapshot service.
  - Reads and writes `meta_creative_score_snapshots`.
  - Keys cache identity by `businessId + selectedStartDate + selectedEndDate + ruleVersion`.
  - Persists `window_metrics`, `selected_row_json`, `weighted_score`, `label`, `computedAt`, and `freshnessState`.

- `app/api/meta/recommendations/route.ts:121-170, 172-296`
  - Tries current Decision OS first.
  - Falls back to snapshot-backed recommendations when Decision OS is unavailable.
  - The fallback still builds selected-span windows from the user-selected `startDate/endDate`.

- `lib/ai/generate-creative-decisions.ts:767-820, 967-1022, 1105-1110`
  - Compatibility wrapper around current Creative Decision OS.
  - Converts current OS output back into the older creative decision vocabulary.
  - Provides old-style score, confidence, reasons, and nextStep fields.

- `app/api/ai/creatives/decisions/route.ts:212-345`
  - Cache-backed deterministic creative decision endpoint.
  - Uses `analysisKey`, `locale`, `currency`, `source`, and `warning` in the cache contract.

- `app/api/ai/creatives/commentary/route.ts:43-57, 204-279`
  - Commentary layer over the deterministic rule-engine report.
  - Explicitly says it is interpreting a deterministic report, not re-classifying it.

- `lib/meta/creative-intelligence.ts:123-160, 163-280`
  - Downstream summarizer that consumes heuristic creative decisions.
  - Not the authority layer, but still part of the old evaluation trail.

- `docs/phase-04-creative-action-contract.md:83-95`
  - States the legacy route is a compatibility surface only and that the Decision OS engine is the source of truth.

## What It Did Better

- It was more explicit about cache replay and staleness. The snapshot path records `computedAt`, `freshnessState`, `ruleVersion`, and selected-window identifiers in the table contract (`lib/meta/creative-score-service.ts:191-220`, `lib/migrations.ts:2861-2888`).
- It exposed a compact, operator-readable report envelope: score, label/action, confidence, factors/reasons, and nextStep. That is easier to inspect quickly than the broader Decision OS object graph (`app/api/ai/creatives/decisions/route.ts:164-207`, `app/api/ai/creatives/commentary/route.ts:204-279`).
- It made the compatibility boundary obvious. `buildHeuristicCreativeDecisions(...)` now translates current OS output into the legacy surface instead of pretending the old vocabulary is authoritative (`lib/ai/generate-creative-decisions.ts:767-820`, `lib/creative-decision-os.ts:3239-3252`).
- It preserved a clean separation between deterministic output and narration. The commentary route interprets a rule report rather than inventing the decision object itself (`app/api/ai/creatives/commentary/route.ts:43-57`).

## What It Did Worse

- It let selected reporting range participate in decision identity. `getCreativeScoreSnapshot(...)` keys and fetches by selected `startDate/endDate`, and the fallback route in recommendations rebuilds selected-span windows from the user-selected end date (`lib/meta/creative-score-service.ts:223-257`, `app/api/meta/recommendations/route.ts:172-296`).
- It had weaker authority separation. The fallback recommendation path can still produce selected-range-driven guidance when Decision OS is unavailable, which conflicts with the current analysis-only boundary (`docs/operator-policy/phase-2/reports/code-data-contract-auditor.md:45-46`, `docs/operator-policy/phase-2/reports/creative-performance-analyst.md:33-48`).
- It carried no stable per-decision provenance contract. The current policy audit already calls out missing `decisionAsOf`, `sourceWindowKey`, source window dates, evidence hash, and stable decision id for action surfaces (`docs/operator-policy/phase-2/reports/code-data-contract-auditor.md:117-128`).
- Its legacy score/action vocabulary is too coarse to be treated as policy authority. The old `scale_hard | scale | watch | test_more | pause | kill` mapping is now just compatibility translation, not the underlying truth model (`lib/ai/generate-creative-decisions.ts:967-1022`, `lib/creative-decision-os.ts:3239-3252`).

## Preserve

- Keep selected-period historical analysis as descriptive context only. The current Creative Decision OS already does this correctly (`lib/creative-decision-os-source.ts:376-407`, `docs/v2-08-historical-intelligence.md:16-20`).
- Keep snapshot freshness metadata, but only for replay/debugging and not for action authority (`lib/meta/creative-score-service.ts:191-220`, `lib/migrations.ts:2861-2888`).
- Keep the narrow compatibility layer that lets old consumers read stable deterministic decisions, but keep it downstream of the current Creative Decision OS (`lib/creative-decision-os.ts:3239-3252`).
- Keep the commentary split. Interpretation should remain a bounded narration layer, not a second decision engine (`app/api/ai/creatives/commentary/route.ts:43-57`).
- Keep the human-readable `score`/`factors`/`nextStep` envelope as report output, because it is useful for review and operator education.

## Reject

- Reject any use of selected `startDate/endDate` as decision authority for creative scale, pause, or refresh.
- Reject the snapshot fallback as an action-core surface. If Decision OS is unavailable, the legacy path should be report-only context at most.
- Reject treating `meta-creative-score-v1` as a policy source of truth. It is a historical scoring/versioning contract, not the governing creative policy.
- Reject using the legacy score or action label without current-window evidence, commercial truth, and provenance fields.
- Reject any workflow that blurs narration, score translation, and decision authority into one step.

## Stable Window Relationship

The legacy logic mixes two different concepts that the current policy work now separates:

- Stable operator decision windows: `decisionAsOf`, `primary30d`, `recent7d`, and `baseline90d` should anchor current authority (`docs/operator-policy/phase-2/reports/creative-performance-analyst.md:13, 33-48`, `docs/operator-policy/phase-2/reports/code-data-contract-auditor.md:27-36`).
- Selected reporting range: useful for inspection, exports, and descriptive historical analysis, but not for authorizing today’s action (`docs/operator-policy/phase-2/reports/budget-pacing-specialist.md:84-103`, `docs/operator-policy/phase-2/reports/learning-delivery-specialist.md:48-63`).

The legacy score service and Meta recommendation fallback still blur that line because selected range remains part of their cache identity and fallback data fetches (`lib/meta/creative-score-service.ts:223-257`, `app/api/meta/recommendations/route.ts:172-296`).

The current Creative Decision OS path is the correct model: primary rows come from `decisionWindows.primary30d`, and selected-period analysis is attached separately without changing deterministic decision signals (`lib/creative-decision-os-source.ts:296-407`, `lib/creative-decision-os.ts:3229-3234`).

## Missing From Current Policy Work

Current policy documents cover the action classes and the selected-range firewall, but they do not yet formalize several legacy transport/cache/report contracts that still exist in code:

- `ruleVersion`, `computedAt`, and `freshnessState` for snapshot replay and staleness handling.
- `selected_start_date`, `selected_end_date`, `window_metrics`, `selected_row_json`, `weighted_score`, and `label` for the snapshot-backed score table.
- `analysisKey`, `locale`, `currency`, `source`, and `warning` for the deterministic decision cache contract.
- `analysisSource` / `sourceModel` for telling operators whether a response came from Decision OS or a fallback path.
- `accountContext`, `factors`, `summary`, `confidence`, and `nextStep` for the commentary/report envelope.
- A formal compatibility contract for when legacy outputs are allowed to appear as report-only context and when they must be suppressed entirely.

Those fields are present in code today (`lib/meta/creative-score-service.ts:44-50`, `app/api/ai/creatives/decisions/route.ts:23-28`, `app/api/ai/creatives/commentary/route.ts:23-29`), but they are not yet spelled out as explicit policy artifacts in the current Phase 2 work.

## Final Assessment

The legacy creative evaluation logic should be treated as a compatibility and historical-reporting layer only. The ideas worth preserving are the replay metadata, the descriptive factorization, and the commentary split. The ideas that should be rejected are any selected-range-driven authority, any fallback recommendation path that can still drive action surfaces, and any attempt to make the old score vocabulary canonical again.
