# Phase 03 - Meta Decision OS V1

## Goal

Phase 03 turns the Meta page from a read-only reporting view into a deterministic operator decision center.

The shipped surface must answer:

- what do we do today
- where should budget move
- what role each campaign plays
- which ad sets should scale, hold, recover, rebuild, reduce, or pause
- which GEOs should scale, validate, pool, isolate, cut, or monitor
- what should remain no-touch

## Guardrails

- The surface is read-only. No write-back, queue persistence, or action execution is introduced in this phase.
- `Operating Mode` remains the top commercial-truth guardrail.
- `Recommendations`, `Decision Signals`, and `AI Commentary` wording remains unchanged. Decision OS does not relabel AI output as deterministic truth.
- Commercial truth remains soft-fail. Missing target pack or GEO economics lowers confidence and action aggressiveness rather than hard-failing the page.
- Reviewer seeded login and smoke-operator flows remain intact.

## Exact code path

- `app/api/meta/decision-os/route.ts`
- `lib/meta/decision-os.ts`
- `lib/meta/decision-os-config.ts`
- `lib/meta/adsets-source.ts`
- `components/meta/meta-decision-os.tsx`
- `components/meta/meta-campaign-list.tsx`
- `components/meta/meta-campaign-detail.tsx`
- `app/(dashboard)/platforms/meta/page.tsx`

## Contract summary

Decision OS ships as a versioned payload:

- `contractVersion`
- `generatedAt`
- `summary`
- `campaigns`
- `adSets`
- `budgetShifts`
- `geoDecisions`
- `placementAnomalies`
- `noTouchList`
- `commercialTruthCoverage`

The engine is deterministic and typed. It does not depend on AI generation.

## Decision logic

### Campaign roles

Role precedence is fixed:

1. `Promo / Clearance`
2. `Catalog / DPA`
3. `Retargeting`
4. `Existing Customer / LTV`
5. `Geo Expansion`
6. `Prospecting Scale`
7. `Prospecting Validation`
8. `Prospecting Test`

Inputs used:

- campaign naming
- objective and optimization goal
- existing campaign lane signals
- active promo overlap
- commercial truth context

### Ad set actions

Action precedence is fixed:

1. `pause`
2. `recover`
3. `rebuild`
4. `scale_budget`
5. `reduce_budget`
6. `hold`
7. `duplicate_to_new_geo_cluster`
8. `merge_into_pooled_geo`
9. `switch_optimization`
10. `tighten_bid`
11. `broaden`
12. `monitor_only`

Inputs used:

- current efficiency against configured target or conservative fallback
- signal depth
- recent config changes
- mixed config truth
- commercial constraints
- role context

### GEO OS

GEO decisions use:

- account-level Meta location rows
- country economics
- serviceability
- scale overrides
- signal depth

Outputs are:

- `scale`
- `validate`
- `pool`
- `isolate`
- `cut`
- `monitor`

### Placement anomalies

Placement stays automation-first.

- The page does not become a manual placement dashboard.
- The anomaly board only calls for exception review when spend concentration and underperformance persist together.

## Fallback semantics

- If `META_DECISION_OS_V1` is disabled, or the workspace is not in `META_DECISION_OS_CANARY_BUSINESSES`, the page falls back to the Phase 02 baseline and the route returns disabled.
- If commercial truth is missing, the engine switches to conservative fallback thresholds and prefers safer actions.
- If campaigns, ad sets, or breakdowns are thin or incomplete, the engine still returns a read-only payload but confidence drops and actions collapse toward `hold` or `monitor_only`.
