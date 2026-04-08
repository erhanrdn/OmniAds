# Google Ads Decision Engine V2

## Current architecture summary

The current Google Ads advisor is built on top of existing warehouse-backed reporting, advisor readiness, snapshot generation, and serving infrastructure. The main production path is:

- warehouse and readiness surfaces establish whether Google Ads data is usable
- serving builds a canonical advisor response from selected and support windows
- the growth advisor synthesizes typed recommendations from campaign, query, product, geo, device, and asset inputs
- advisor snapshots cache canonical outputs for operator consumption
- advisor memory and mutate routes track recommendation state and, where legacy code exists, can execute or roll back mutate flows

Phase 1 does not replace that architecture. It formalizes the Decision Engine V2 foundation inside those existing surfaces.

## What the isolated pre-phase drift changed

Before Phase 1 was explicitly authorized, isolated pre-phase drift introduced partial V2 concepts:

- moved advisor support windows away from `last3/last7/last14/last30/last90` toward `alarm_1d/3d/7d`, `operational_28d`, `query_governance_56d`, and `baseline_84d`
- added operator-first recommendation narrative fields such as what happened, why it happened, and rollback guidance
- added execution-surface metadata that downgraded the UI toward manual-plan behavior
- changed snapshot and serving metadata toward a V2 analysis version
- fixed one concrete bad behavior where branded queries could be recommended as negative keywords just because ROAS was low

That drift was useful context, but it was not treated as approved Phase 1 work by itself. Phase 1 deliberately formalizes the approved artifacts, flags, types, and gates.

## Why we are moving away from the single 90-day brain

The single 90-day operating model over-compresses different decision types into one window. That causes several failures:

- short-term alarms are diluted by longer periods
- operational decisions can be driven by overly stale context
- query governance needs longer observation than budget and pacing decisions
- baseline comparison should exist, but it should not be the same window as the main operational decision
- operator review becomes harder because the system cannot state which evidence window justified a recommendation

Decision Engine V2 separates these jobs explicitly so recommendations can say what happened, why it happened, and which window supports the claim.

## Approved V2 decision families

The approved Decision Engine V2 decision families are:

- `measurement_trust`
- `waste_control`
- `demand_capture`
- `budget_bidding`
- `creative_feed`
- `structure_governance`
- `brand_governance`

These families are typed and intended to be stable across recommendation rendering, serving metadata, and policy logic.

## Approved lane model

The approved Phase 1 lane model is:

- `review`
- `test`
- `watch`
- `suppressed`
- `auto_hidden`

Interpretation:

- `review` means operator review is required before any change
- `test` means the recommendation is a candidate for a controlled experiment
- `watch` means the recommendation should be monitored rather than acted on immediately
- `suppressed` means it is intentionally hidden because an integrity or memory rule has suppressed it
- `auto_hidden` means the recommendation is hidden because Decision Engine V2 itself is disabled

Phase 1 formalizes the typed lane model and lane derivation behavior. It does not expand into broader automation policy.

## Approved window policy

Decision Engine V2 uses distinct windows for distinct purposes:

- health/alarm windows: 1 day, 3 days, 7 days
- primary operational decision window: 28 days
- query governance window: 56 days
- baseline window: 84 days

The maturity cutoff for historical stability in Phase 1 is 84 days.

This policy is exposed through a dedicated helper so the window model is explicit and testable rather than scattered across inline constants.

## Why V1 is operator-first

V1 is operator-first because the system is intended to be a decision surface before it becomes an execution surface. In practice that means:

- recommendations must explain what happened, why it happened, what to do, risk, validation, and rollback
- operators remain responsible for final action choice
- UI affordances should reflect manual-plan behavior where execution is not explicitly enabled
- backend capability boundaries must default to no write-back

Operator-first is not only a presentation choice. It is a product and safety boundary.

## Why write-back is not considered verified

Write-back is not considered verified in Phase 1 because the repo contains legacy mutate and rollback codepaths, but that does not prove production safety. Phase 1 assumes:

- mutate availability is not proof of mutate safety
- rollback availability is not proof of rollback safety
- UI hiding alone is not a sufficient safety boundary
- typed metadata alone is not a sufficient safety boundary

For that reason, Phase 1 introduces an explicit write-back capability gate tied to `GOOGLE_ADS_WRITEBACK_ENABLED`, and the approved default remains `false`.

## Phase 1 non-goals

Phase 1 explicitly does not include:

- a broader Phase 2 serving redesign
- warehouse redesign or new warehouse dependencies
- full query-governance guardrail expansion beyond the already isolated brand-negative fix
- major UI redesign
- treating write-back as verified or production-safe
- removing all legacy mutate codepaths
- introducing autonomous write-back behavior

Phase 1 is the approved foundation: explicit design documentation, explicit flags, explicit typed schema, explicit window policy, and an explicit write-back capability boundary.
