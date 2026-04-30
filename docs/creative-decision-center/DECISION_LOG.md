# Decision Log

## D001 — Use V2 As Base And Evolve To V2.1

Decision: use existing `creative-decision-os-v2` as the base decision engine and evolve it to V2.1.

Reason: V2 already has a concise primary decision vocabulary and safety posture.

Rejected alternative: create a new standalone decision core.

Risk: V2 may need input expansion and problem-class refinements before it can support buyer-facing actions safely.

## D002 — Keep `primaryDecision` Separate From `buyerAction`

Decision: engine root remains `primaryDecision`; buyer language is produced by an adapter.

Engine `primaryDecision`:

- `Scale`
- `Cut`
- `Refresh`
- `Protect`
- `Test More`
- `Diagnose`

Buyer action:

- `scale`
- `cut`
- `refresh`
- `protect`
- `test_more`
- `watch_launch`
- `fix_delivery`
- `fix_policy`
- `diagnose_data`

Risk: collapsing these fields would mix engine semantics, UI labels, and safety posture.

## D003 — Use Deterministic Table-Driven Buyer Adapter

Decision: use a transparent adapter from engine output to buyer-facing action.

Reason: UI needs specific action language without turning UI into a decision engine.

Constraint: adapter must not become a hidden second decision engine.

## D004 — No Row-Level `brief_variation`

Decision: `brief_variation` is aggregate/page/family-level only.

Reason: variation needs often come from family/supply gaps, not one row.

Risk: row-level variation would mislead buyers and corrupt row action semantics.

## D005 — UI Must Not Compute Decisions

Decision: UI renders `decisionCenter`.

Reason: decision authority must be testable and reproducible.

Risk: UI-side meaning drift and duplicate vocabularies.

## D006 — Old Snapshots Must Remain Renderable

Decision: old V1/operator snapshots remain renderable through read-time adapters if needed.

Reason: historical reports and existing UI consumers must not break.

Risk: additive response design is required; do not rename routes initially.

## D007 — Missing Data Means `diagnose_data` Or Capped Confidence

Decision: required data gaps must produce `diagnose_data`, disabled action, or capped confidence.

Reason: fake certainty is worse than a conservative diagnostic.

Risk: buyer trust loss if `fix_delivery`, `fix_policy`, scale, or cut are emitted without proof.

## D008 — Minimal Detail Drawer Belongs In MVP

Decision: Minimal Detail Drawer is part of MVP.

Reason: Today Brief without "why" will not earn trust.

Risk: users will ignore recommendations if the engine root and evidence are hidden.

## D009 — Config-As-Data Is Required

Decision: thresholds must live in config, not scattered resolver branches.

Reason: launch windows, maturity, fatigue, and scale/cut thresholds need account/business tuning.

Risk: hard-coded thresholds cause silent drift and hard-to-review AI edits.

## D010 — Golden Cases And Invariants Before Resolver Changes

Decision: golden cases and invariants must land before behavior changes.

Reason: AI-generated resolver drift must be controlled.

Risk: plausible but inconsistent resolver rewrites.

