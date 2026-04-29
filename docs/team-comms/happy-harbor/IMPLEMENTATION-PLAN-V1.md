# Creative Decision Engine Refactor Implementation Plan V1

## 1. Architecture Diagram

Evidence base: [CONSOLIDATED-FINDINGS.md](https://github.com/erhanrdn/OmniAds/blob/main/docs/team-comms/happy-harbor/CONSOLIDATED-FINDINGS.md) reports three internal engines with Fleiss kappa `-0.114`, triple agreement `0/75`, and Sys3 `diagnose=58/75`. External review is archived in [26-chatgpt-pro-review.md](./26-chatgpt-pro-review.md).

### 1.1 Current State

```text
Raw Meta metrics + benchmarks + business context
  |
  +--> Sys1 Legacy Decision OS
  |     file: lib/creative-decision-os.ts
  |     role today: lifecycle + fatigue/winner memory + primaryAction + buildScore()
  |     UI leak: lifecycleState / primaryAction used as primary decision labels
  |
  +--> Sys2 Operator Surface
  |     files:
  |       lib/creative-operator-surface.ts
  |       lib/creative-operator-policy.ts
  |       lib/creative-media-buyer-scoring.ts
  |     role today: scorecard/readiness + operator action
  |     UI leak: operatorPolicy state/segment/pushReadiness used as primary labels
  |
  +--> Sys3 V2 Preview
        file: lib/creative-decision-os-v2.ts
        role today: V2 verdict/problem/actionability
        UI leak: diagnostic output appears decision-like
```

### 1.2 Target State

```text
Raw metrics + delivery + history + commercial truth
  |
  +--> Feature extraction
  |     Sys1 reduced to lifecycle, fatigue memory, winner memory, buildScore()
  |
  +--> Shared score formulas
  |     lib/creative-score-formulas.ts
  |     Hook / Watch / Click / CTA / Offer / Convert
  |
  +--> Scorecard/readiness inputs
  |     Sys2 reduced to evidence, relative performance, readiness, reason inputs
  |
  +--> Diagnostic-only inputs
  |     Sys3 reduced to diagnosticFlags/trust warnings only
  |
  +--> Canonical resolver
  |     lib/creative-canonical-decision.ts
  |     output: CreativeCanonicalDecision
  |
  +--> Feature flag router
  |     lib/creative-decision-feature-flag.ts
  |     URL preview + cookie + sticky server cohort + allow/block + kill switch
  |
  +--> UI
        detail / table / top filters / overview / share all read canonicalDecision.action
        legacy fallback remains default-off path
```

### 1.3 Files Added, Modified, Deprecated

Added: `lib/creative-canonical-decision.ts`, `lib/creative-canonical-decision.test.ts`, `lib/creative-score-formulas.ts`, `lib/creative-decision-confidence.ts`, `lib/creative-calibration-store.ts`, `lib/creative-decision-feature-flag.ts`, `lib/creative-decision-feature-flag-store.ts`, calibration migration tables, `scripts/happy-harbor-faz-h-elrate-sample.ts`, `scripts/happy-harbor-faz-h-calibrate.ts`.

Modified: `lib/creative-decision-os.ts`, `lib/creative-operator-surface.ts`, `components/creatives/CreativeDetailExperience.tsx`, `components/creatives/CreativesTableSection.tsx`, `components/creatives/CreativesTopSection.tsx`, `components/creatives/creatives-top-section-support.ts`, `components/creatives/CreativeDecisionOsOverview.tsx`, `components/creatives/CreativeDecisionSupportSurface.tsx`, `components/creatives/CreativeDecisionOsDrawer.tsx`, `components/creatives/CreativeDecisionOsContent.tsx`, `app/(dashboard)/creatives/page.tsx`, `app/(dashboard)/creatives/page-support.tsx`.

Deprecated from primary role: `lib/creative-decision-os-v2.ts` and `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` as primary decision surfaces. They remain diagnostic.

## 2. File-Level Change Manifest

| File | Status | Change |
|---|---:|---|
| `lib/creative-decision-os.ts` | modify | Export/reuse `buildScore()` and keep lifecycle/fatigue/winner extraction. Deprecate legacy `primaryAction` as final UI action under canonical flag. |
| `lib/creative-operator-surface.ts` | modify | Keep scorecard/readiness/explanation, but support `{ useCanonical: true }` for operator item, quick filter, taxonomy count, and surface model generation. |
| `lib/creative-operator-policy.ts` | modify later | Policy facts remain; missing commercial truth is readiness context, not hard blocker. |
| `lib/creative-media-buyer-scoring.ts` | modify later | Keep scoring axes; no final action ownership. |
| `lib/creative-decision-os-v2.ts` | deprecate primary | Diagnostic only. No primary action ownership. |
| `lib/creative-score-formulas.ts` | new | Shared Hook / Watch / Click / CTA / Offer / Convert formulas used by both resolver and table. Closes Gap D. |
| `lib/creative-canonical-decision.ts` | new | Canonical resolver, decision tree, readiness, debug payload, LLM enrichment guard. Closes Gaps H/J/K/L in resolver contract. |
| `lib/creative-canonical-decision.test.ts` | new | Full 75-row regression, target-pack-missing test, deterministic repeatability, low-N shrinkage, LLM guard. Closes Gaps H/I/J/L. |
| `lib/creative-calibration-store.ts` | new | Calibration persistence API, explicit override severity matrix, multi-tenant calibration key, stale detection. Closes Gaps A/F/K. |
| `lib/creative-decision-feature-flag.ts` | new | URL/cookie preview, admin allow/block, kill switch, sticky assignment resolver. Closes Gap E. |
| `lib/creative-decision-feature-flag-store.ts` | new | Server-side sticky cohort persistence helpers. Closes Gap E. |
| `components/creatives/CreativeDecisionOsV2PreviewSurface.tsx` | modify | Diagnostic-only copy and tests. Closes Sys3 primary UI portion of Gap B. |
| `components/creatives/CreativeDetailExperience.tsx` | modify | Read canonical payload under flag; compute fallback for legacy snapshots and show re-run badge. Closes Gaps B/C. |
| `components/creatives/CreativesTableSection.tsx` | modify | Show canonical action under flag; sub-score columns call shared formulas. Closes Gaps B/D. |
| `components/creatives/CreativesTopSection.tsx` | modify | Filter suggestions/support surface use canonical action/readiness under flag. Closes Gap B. |
| `components/creatives/CreativeDecisionOsOverview.tsx` | modify | Counts, operator cards, family/pattern tones use canonical action under flag. Closes Gap B. |
| `app/(dashboard)/creatives/page.tsx` | modify | Feature flag plumbing, canonical quick filters and filter application where decision data is available. |
| DB migration | new | Calibration tables, override events, feature flag tables, calibration key columns. Closes Gaps E/F. |
| `scripts/happy-harbor-faz-h-elrate-sample.ts` | new | Enforced stratified 50-row sample with 20% ordinary random controls. Closes Gap G. |
| `scripts/happy-harbor-faz-h-calibrate.ts` | new | Cost-sensitive grid search using explicit severity semantics. |

## 3. Implementation Phases

### H1: UI Consolidation + Sys3 Deactivation

Tasks:

1. Define `CreativeCanonicalDecision` payload and adapter boundary.
2. Stop Sys3 from primary UI; retain only diagnostic flags/warnings.
3. Wire detail, table, top filters, overview, support surface, drawer, and share export to canonical action under `canonicalResolver=v1`.
4. Add compatibility for snapshots without canonical payload.

Deliverables:

- Canonical payload type.
- UI surfaces reading one primary action field under flag.
- Legacy fallback/default-off path.
- Snapshot fallback badge in detail.

Acceptance:

- No primary action label under the flag is derived from `lifecycleState`, `primaryAction`, `operatorPolicy.*`, or V2 verdict fields except legacy/debug context.
- Existing snapshots do not crash and never show an empty action.

Gap coverage: B, C, D partial, E preview plumbing, L guard stub.

Risk mitigation:

- Flag remains default off.
- Legacy path remains untouched.
- UI consistency tests cover top filters/overview.

### H2: Canonical Resolver v0.5 + Bayesian Confidence

Tasks:

1. Use `buildScore()` and shared six sub-score formulas as canonical resolver inputs.
2. Implement 9-step tree: measurement invalid, low evidence, fatigued winner, strong scale, protect, mature loser, funnel break, fatigue no winner, mixed default.
3. Enforce `targetPackMissing` as `needs_review`, never blocked blanket `diagnose`.
4. Add Bayesian confidence with explicit low-N shrinkage.
5. Add 75-row golden regression and named assertions.
6. Add explicit override severity matrix and LLM enrichment guard.

Deliverables:

- `lib/creative-canonical-decision.ts`.
- `lib/creative-decision-confidence.ts`.
- `lib/creative-calibration-store.ts`.
- Full golden tests.

Acceptance:

- Diagnose count `<=15`.
- Cut count and scale count both `>0`.
- `WoodenWallArtCatalog -> refresh`.
- `depth -> cut`.
- `WallArtCatalog -> protect/refresh/test_more + needs_review`, not blocked diagnose.
- `biterevise/restraintrevise -> scale/protect/test_more`.
- Missing target pack test passes.
- Enum-distance severity is not used for severity classification.

Gap coverage: A, D, H, I, J, K, L.

Risk mitigation:

- Thresholds are provisional without user el-rate data.
- Default remains legacy unless flag enabled.

### H3: User El-Rate Calibration Loop

Tasks:

1. Generate 50-row sample across predicted action, spend band, delivery, fatigue, format, and confidence.
2. Reserve at least 20% random ordinary cases.
3. Use cost-sensitive grid search with asymmetric severity penalties.
4. Add hierarchical Bayesian shrinkage stub: `personalWeight = n / (n + k)`.
5. Store overrides and calibration versions by `(businessId, adAccountId, objectiveFamily, formatFamily, calibrationVersion)`.

Deliverables:

- `scripts/happy-harbor-faz-h-elrate-sample.ts`.
- `scripts/happy-harbor-faz-h-calibrate.ts`.
- Calibration report format.

Acceptance:

- 50 user labels produce v1 threshold deltas.
- Severe-error count decreases against uncalibrated resolver.
- Threshold delta is clamped and low-N movement is heavily shrunk.

Gap coverage: F, G, H, K.

Risk mitigation:

- Holdout validation.
- Weekly batch updates, no true online threshold changes.

### H4: A/B Rollout + Observability

Tasks:

1. Rollout `0% -> 25% -> 50% -> 100%`.
2. Use server-side sticky cohort assignment plus URL engineer preview.
3. Add admin allowlist, blocklist, and kill switch.
4. Track override rate, severe override rate, action drift, diagnose rate, complaints, and time-to-decision.

Deliverables:

- Feature flag store.
- Rollout runbook.
- Dashboard/log queries.

Acceptance:

- 25% cohort runs 7 days without severe regression.
- Severe override rate `<=5%`.
- Action distribution drift `<=20pp` unless explicitly approved.
- Kill switch returns everyone to legacy in under 60 seconds.

Gap coverage: E plus rollout safety.

Risk mitigation:

- Instant flag rollback.
- Additive schema only; no migration rollback required.

## 4. Database Changes

Additive schema:

- `calibration_versions`: versioned thresholds/evaluation artifacts.
- `calibration_thresholds_by_business`: active threshold set keyed by business/account/objective/format.
- `decision_override_events`: immutable override trail and critical queue metadata.
- `creative_canonical_resolver_flags`: sticky per-business assignment.
- `creative_canonical_resolver_admin_controls`: kill switch, allowlist, blocklist controls.

Migration order:

1. Calibration versions.
2. Active thresholds.
3. Override events.
4. Feature flag assignment/admin controls.
5. No backfill.

Backwards compatibility:

- Existing snapshots remain readable.
- Old code ignores additive tables.
- Missing canonical snapshot payload computes a fallback or shows re-run badge.

Retention:

- Override events: indefinite.
- Calibration versions: keep at least last 6 per key; do not delete versions referenced by overrides.

## 5. Testing Strategy

Golden fixtures:

- `docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/raw-metrics.json`.
- `docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/claude-rating.json`.
- `docs/team-comms/happy-harbor/audit-G-three-systems/three-systems.json`.
- `docs/team-comms/happy-harbor/audit-G-three-systems/agreement-matrix.json`.

Required CI assertions:

- 75 rows all resolve deterministically.
- `diagnose <=15`.
- `cut >0` and `scale >0`.
- No `diagnose:blocked` unless true measurement/blocker criteria apply.
- Named row assertions listed in H2 pass.
- Target-pack-missing cannot create blocked diagnose.
- Shared table/resolver sub-score formulas stay in one module.
- UI filter/overview tests prove canonical path ignores legacy primary labels under flag.
- LLM enrichment cannot modify action/readiness/confidence.

Metrics:

- Weighted kappa and pair-wise weighted agreement.
- Per-action precision/recall.
- Severe-error count.
- Diagnose rate.
- Scale/cut contradiction count.

PR blocking:

- Any hard row assertion failure.
- Severe-error regression.
- Sys3 reintroduced as primary action.
- Target-pack-missing blocked diagnose.
- UI surface action inconsistency.

## 6. Rollout Safety

Flag precedence:

1. Kill switch.
2. Admin blocklist.
3. Admin allowlist.
4. URL preview `?canonicalResolver=v1|legacy`.
5. Cookie preview.
6. Sticky server assignment.
7. Server rollout percent.
8. Default legacy.

Rollback:

1. Flip kill switch or rollout percent to `0`.
2. Keep additive DB tables.
3. Confirm detail/table/top filters/overview return to legacy action path.
4. If needed, deploy previous known-good SHA through existing production workflow.

Observability:

- Action distribution drift.
- Severe override rate.
- Override volume.
- Complaint volume.
- Diagnose/scale/cut rates.
- Low-confidence share.
- Stale calibration count.

Stop conditions:

- Severe override rate `>5%`.
- Action distribution shift `>20pp`.
- Complaint volume doubles.
- Blanket diagnose returns.
- UI consistency telemetry fails.

## 7. Open Questions

1. Should Hook / Watch / Click / CTA / Offer / Convert remain visible as default user columns, advanced diagnostics, or internal-only fields?
2. How should `Scale + needs_review` differ visually from `Scale + ready`: button text, color, info icon, or secondary badge?
3. Should LLM enrichment use a small/fast model asynchronously for low-confidence explanations, and when does it escalate to manual review?
4. Should persona selector launch in H4 or after stable production calibration?
5. Should calibrated feedback stay account-only by default, or roll up into anonymized segment defaults after sufficient sample size?
6. Exact v0.5 thresholds remain provisional until user el-rate data is available.

## 8. Effort Estimate

| Phase | Estimate |
|---|---:|
| H1 UI consolidation + Sys3 deactivation | 4-5 engineer-days |
| H2 canonical resolver v0.5 + Bayesian confidence | 6-8 engineer-days |
| H3 el-rate calibration loop | 7-9 engineer-days |
| H4 rollout + observability | 4-6 engineer-days |

Total: 21-28 engineer-days.

Critical path:

```text
H1 single canonical UI field
  -> H2 resolver + golden tests
    -> H3 user labels + calibration
      -> H4 staged rollout
```

Assumptions:

- Work starts from rollback SHA `96bd0386208868b18d9763d64917ab9d4aa22b53`.
- Happy Harbor verdict resolver is not reused.
- Audit datasets, tests, score-sim ideas, and safe utilities can be reused.
- First production exposure is flag-gated and default off.
- User calibration is mandatory before expecting `>=75%` user/Claude-style agreement.
