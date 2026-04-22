# Phase 4 Creative Operator Policy Handoff

Phase 4 must not start until Phase 3 Meta operator foundation is merged into `main`.

## What Phase 3 Completed

- Decision Range Firewall and Operator Provenance Contract are merged in PR #16.
- Meta actions use stable `decisionAsOf` / source-window provenance rather than selected reporting range as action identity.
- Meta campaign/ad set rows now carry deterministic `operator-policy.v1` assessments.
- Meta operator states are explicit: `do_now`, `do_not_touch`, `watch`, `investigate`, `blocked`, `contextual_only`.
- Meta push readiness is explicit: `read_only_insight`, `operator_review_required`, `safe_to_queue`, `eligible_for_push_when_enabled`, `blocked_from_push`.
- Missing provenance, missing commercial truth, low evidence, no-touch, campaign-owned budget allocation, and unproven budget binding block aggressive Meta action.
- Command Center keeps legacy `cc_...` workflow identity while enforcing provenance and policy blockers.

## What Remains For Creative

- Build a deterministic Creative operator policy layer.
- Do not reuse Meta budget/bid logic blindly; Creative decisions need creative-specific evidence floors.
- Preserve the Decision Range Firewall: selected reporting range may change visible metrics, but it must not authorize primary creative segment actions.
- Creative primary segments must expose provenance, evidence hash, action fingerprint, operator state, push readiness, and missing evidence.

## Creative Date-Window Flaws To Fix First

- Verify all Creative decision inputs separate `analyticsStartDate` / `analyticsEndDate` from `decisionAsOf`.
- Ensure omitted `decisionAsOf` uses provider-backed stable decision context, not analytics range end.
- Prove same business + same `decisionAsOf` + different reporting ranges produce stable primary creative fingerprints.
- Treat current-day partial data as contextual unless a future policy explicitly allows it.

## First Creative Scenario Fixtures

Start with deterministic fixtures for:

- Scale-ready creative with sufficient spend/conversions and stable campaign context.
- Promising but under-sampled creative.
- False winner from one lucky conversion.
- Fatigued winner with adequate evidence.
- Kill candidate with sufficient evidence.
- Low-evidence poor performer that must not be killed.
- Protected winner / no-touch creative.
- Creative in weak campaign context that should not be blamed.
- Missing commercial truth blocking aggressive promotion or kill.
- Demo/snapshot/non-live creative evidence blocked from push eligibility.

## What Must Not Be Copied Blindly From Meta

- Budget ownership and budget binding logic.
- Bid-control guardrails.
- Campaign/ad set delivery constraints as creative-quality conclusions.
- Provider push eligibility assumptions.
- CBO/ad set allocation semantics.

Creative needs its own deterministic model around spend, conversion depth, fatigue, frequency, CTR/CVR/hook signals when available, campaign context, asset age, deployment context, and commercial truth.

## Recommended Phase 4 Branch

`feature/adsecute-creative-operator-policy`

## Recommended Phase 4 Acceptance Criteria

- Creative operator policy is deterministic and testable.
- Selected reporting range does not authorize primary Creative actions.
- Creative rows include provenance, evidence hash, action fingerprint, operator state, and push readiness.
- Missing provenance blocks queue/push eligibility.
- Missing commercial truth blocks aggressive creative promotion or kill.
- Low evidence creates watch/investigate/context, not fake confidence.
- Creative UI exposes what to do, what not to touch, what to watch, what to investigate, why, evidence, missing data, and push readiness without a broad redesign.
- Command Center treats Creative actions as manual/contextual unless an explicit future provider-safe execution contract exists.
