# Creative Taxonomy Simplification Resolver

Date: 2026-04-25  
Author: Codex

## Summary

Implemented an additive Creative primary-decision resolver as a parallel layer. The current 10-label Creative UI remains active; no filters, cards, policy gates, queue/push/apply rules, or segment thresholds were changed in this pass.

## Resolver Contract

New exported resolver:

```ts
resolveCreativeOperatorDecision(creative)
```

Returns:

```ts
{
  primary: "scale" | "test_more" | "protect" | "refresh" | "cut" | "diagnose",
  subTone: "default" | "review_only" | "queue_ready" | "revive" | "manual_review",
  reasons: CreativeOperatorReasonTag[]
}
```

Rules enforced:

- every creative resolves to exactly one primary decision
- no `watch` primary decision exists in the new resolver
- reason tags are deterministic and capped at two
- `diagnose` always carries a diagnostic reason tag
- `scale_review` maps to `scale` with `review_only`
- paused historical Retest rows map to `refresh` with `revive`
- old-rule challenger output is not used
- queue/push/apply readiness is not changed

## Reason Tags

Supported reason tags:

- `strong_relative_winner`
- `business_validation_missing`
- `commercial_truth_missing`
- `weak_benchmark`
- `fatigue_pressure`
- `trend_collapse`
- `catastrophic_cpa`
- `below_baseline_waste`
- `mature_zero_purchase`
- `comeback_candidate`
- `paused_winner`
- `campaign_context_blocker`
- `low_evidence`
- `preview_missing`
- `creative_learning_incomplete`

## Mapping Notes

- `Scale Review` remains a current UI label, but the parallel resolver maps it to primary `scale` plus `review_only`.
- `Watch` dissolves into `test_more`, `refresh`, `cut`, or `diagnose` depending on existing policy state and evidence tags.
- `Retest` dissolves into `refresh` with `revive` and `paused_winner` or `comeback_candidate`.
- `Campaign Check` dissolves into `diagnose` with `campaign_context_blocker`.
- `Not Enough Data` dissolves into `diagnose` or `test_more` with low-evidence reason tags.

## Tests Added

Added deterministic coverage in `lib/creative-operator-surface.test.ts` for:

- Scale-ready row -> `scale`
- Scale Review row -> `scale` + `review_only` + `business_validation_missing`
- Test More row -> `test_more`
- Protect row -> `protect`
- Watch-like promising row -> not Watch
- Watch-like collapsed-trend row -> `refresh`
- Watch-like context-blocked row -> `diagnose` + `campaign_context_blocker`
- Refresh row -> `refresh`
- Retest / paused historical winner -> `refresh` + `revive`
- Cut row -> `cut`
- Campaign Check row -> `diagnose` + `campaign_context_blocker`
- Not Enough Data row -> diagnostic low-evidence handling
- Diagnose rows always have a diagnostic reason tag
- Scale Review remains queue/apply blocked
- fallback/non-live contextual rows remain blocked from push/apply
- sanitized live-firm audit fixture resolves across all rows into one of the six primary decisions

## Validation

Validation:

- `npx vitest run lib/creative-operator-surface.test.ts` passed
- `npm test` passed
- `npx tsc --noEmit` passed
- `npm run build` passed
- `git diff --check` passed
- hidden/bidi/control scan passed
- lint was not run because `package.json` has no lint script

## Next Recommended Action

Review and accept the parallel resolver first. Only after that should a separate UI swap pass replace the visible Creative filters/cards with the six primary decisions and reason tags.
