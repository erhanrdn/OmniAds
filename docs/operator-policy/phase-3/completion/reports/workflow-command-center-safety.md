# Workflow / Command Center Safety Review

Role: Workflow / Command Center Safety Reviewer
Phase: Adsecute Phase 3 Completion
Branch reviewed: `feature/adsecute-decision-range-firewall`
Scope: inspection only. No app code changes.

## Files Inspected

- `src/types/operator-decision.ts`
- `lib/operator-decision-provenance.ts`
- `lib/operator-decision-metadata.ts`
- `lib/meta/operator-decision-source.ts`
- `lib/meta/decision-os-source.ts`
- `lib/meta/decision-os.ts`
- `app/api/meta/decision-os/route.ts`
- `app/api/meta/recommendations/route.ts`
- `components/meta/meta-decision-os.tsx`
- `components/meta/meta-campaign-detail.tsx`
- `components/meta/meta-action-queue.tsx`
- `lib/command-center.ts`
- `lib/command-center-service.ts`
- `lib/command-center-execution-capabilities.ts`
- `lib/command-center-execution-service.ts`
- `lib/command-center-store.ts`
- `app/api/command-center/route.ts`
- `app/api/command-center/actions/route.ts`
- `app/api/command-center/actions/batch/route.ts`
- `app/api/command-center/execution/route.ts`
- `app/api/command-center/execution/apply/route.ts`
- `app/api/command-center/execution/rollback/route.ts`
- `app/api/command-center/handoffs/route.ts`
- related Command Center tests

## Current Safety Findings

### 1. Provenance contract separates reporting context from action identity

Evidence:

- `OperatorDecisionProvenance` contains `decisionAsOf`, `analyticsWindow`, `reportingRange`, `sourceWindow`, `sourceRowScope`, `evidenceHash`, and `actionFingerprint` in `src/types/operator-decision.ts:69`.
- `buildOperatorDecisionProvenance` stores `analyticsWindow` and `reportingRange` on the provenance object, but the hash/fingerprint inputs use `businessId`, `decisionAsOf`, `sourceWindow`, `sourceRowScope`, `sourceDecisionId`, `recommendedAction`, and hash evidence, not reporting dates, in `lib/operator-decision-provenance.ts:61` and `lib/operator-decision-provenance.ts:70`.
- `buildOperatorDecisionMetadata` labels selected dates as an `analysis_only` analytics window and computes stable decision windows from `decisionAsOf` in `lib/operator-decision-metadata.ts:83`.

Result: Phase 3.1 provenance is structurally correct: selected reporting dates are metadata, not primary action identity.

### 2. Meta Decision OS source path uses stable decision windows

Evidence:

- `getMetaDecisionOsForRange` normalizes selected dates into `analyticsStartDate` / `analyticsEndDate`, resolves `decisionContext` through `getMetaDecisionWindowContext`, and fetches source rows from `decisionContext.decisionWindows` in `lib/meta/decision-os-source.ts:29` and `lib/meta/decision-os-source.ts:40`.
- `getMetaDecisionSourceSnapshot` reads campaigns, breakdowns, GEO, and ad sets from the `primary30d` decision window, not the selected reporting range, in `lib/meta/operator-decision-source.ts:28`.
- The Meta route passes selected dates as analytics/reporting inputs and passes `decisionAsOf` separately when present in `app/api/meta/decision-os/route.ts:50`.

Result: the provider-backed Meta Decision OS route is mostly behind the reporting-range firewall.

### 3. Command Center action identity is actionFingerprint-first

Evidence:

- Command Center actions carry `actionFingerprint` and optional provenance in `lib/command-center.ts:208`.
- `findCommandCenterActionForRange` resolves actions by `actionFingerprint`, not by selected dates, after rebuilding the current snapshot in `lib/command-center-service.ts:265`.
- Workflow mutations require `actionFingerprint` and use it to resolve the current action in `app/api/command-center/actions/route.ts:79`.
- Batch workflow mutations use `actionFingerprints` and reject unknown fingerprints in `app/api/command-center/actions/batch/route.ts:86`.
- Execution preview/apply/rollback routes require `actionFingerprint` in `app/api/command-center/execution/route.ts:21`, `app/api/command-center/execution/apply/route.ts:31`, and `app/api/command-center/execution/rollback/route.ts:30`.
- Command Center state persistence is keyed by `businessId` and `action.actionFingerprint` in `lib/command-center-store.ts:1257`.
- Handoffs link `linkedActionFingerprints`, not selected dates, in `app/api/command-center/handoffs/route.ts:129`.

Result: selected reporting dates are still passed around for snapshot rebuilds and deep links, but they are not the primary action identity.

### 4. Missing provenance blocks queue and push paths

Evidence:

- `buildOperatorDecisionPushEligibility` returns `blocked_from_push` when provenance is missing in `lib/operator-decision-provenance.ts:105`.
- Command Center queue decoration computes `defaultQueueEligible` through `buildCommandCenterActionPushEligibility`, which requires both actionable state and `provenance.actionFingerprint` in `lib/command-center.ts:1830`.
- Execution preview checks provenance before the provider-backed path and returns `manual_only` with provenance-specific copy when missing in `lib/command-center-execution-service.ts:958`.
- Existing tests cover missing-provenance queue blocking in `lib/command-center.test.ts:1310` and missing-provenance execution blocking in `lib/command-center-execution-service.test.ts:483`.

Result: missing provenance currently blocks queue eligibility and provider-backed apply.

### 5. Fallback / contextual recommendations do not feed Command Center as push actions

Evidence:

- Snapshot recommendations are explicitly labeled `analysisSource.system: "snapshot_fallback"` in `app/api/meta/recommendations/route.ts:269`.
- The campaign detail UI demotes snapshot fallback recommendations to context in `components/meta/meta-campaign-detail.tsx:202` and `components/meta/meta-campaign-detail.tsx:275`.
- Command Center snapshot construction pulls `metaDecisionOs` and `creativeDecisionOs`, not `/api/meta/recommendations`, in `lib/command-center-service.ts:67`.

Result: legacy snapshot fallback recommendations are not currently promoted into Command Center push/apply actions.

### 6. Unsupported action families are mostly manual-only

Evidence:

- Only selected Meta ad set actions have a supported capability path; other Meta ad set actions are manual-only in `lib/command-center-execution-capabilities.ts:113`.
- Budget shifts are manual-only in `lib/command-center-execution-capabilities.ts:183`.
- GEO actions are unsupported/read-only in `lib/command-center-execution-capabilities.ts:199`.
- Placement anomalies are unsupported in `lib/command-center-execution-capabilities.ts:215`.
- No-touch actions are unsupported and protective guidance only in `lib/command-center-execution-capabilities.ts:231`.
- Creative actions are unsupported in `lib/command-center-execution-capabilities.ts:246`.
- Execution preview hard-blocks non-Meta and non-`meta_adset_decision` rows into manual-only responses in `lib/command-center-execution-service.ts:1004` and `lib/command-center-execution-service.ts:1034`.

Result: provider-backed apply is currently limited to a narrow Meta ad set subset.

## Blocking Gaps for Phase 3 Meta Policy Layer

### Blocker 1. Queue/apply readiness does not yet require a Meta policy-approved state

Current behavior:

- `isCommandCenterActionActionable` checks `surfaceLane === "action_core"` and workflow status only in `lib/command-center.ts:1781`.
- Queue eligibility then requires provenance, but does not require `truthState === "live_confident"` or a deterministic policy approval flag in `lib/command-center.ts:1830`.
- Execution preview provenance eligibility similarly checks provenance, `surfaceLane === "action_core"`, and not `watchlistOnly`, but not `truthState`, `operatorDisposition`, evidence floors, or policy approval in `lib/command-center-execution-service.ts:958`.

Why this matters:

- Meta ad set trust can be `degraded_missing_truth` while still using `surfaceLane: "action_core"` for `review_reduce` fallback posture in `lib/meta/decision-os.ts:2171`.
- Meta campaign trust can also be `degraded_missing_truth` while retaining `surfaceLane: "action_core"` when related ad sets are degraded but not watchlist in `lib/meta/decision-os.ts:2444`.
- GEO decisions can become `queueEligible` from `surfaceLane === "action_core"` even when the truth state is degraded, because the row-level `queueEligible` uses only materiality and surface lane in `lib/meta/decision-os.ts:1476`.

Required Phase 3 closure:

- Introduce a deterministic Meta policy outcome for campaign/ad set action rows, for example `operatorState` plus `pushReadiness`.
- Command Center default queue and execution preview must require an explicit policy-approved state, not only `action_core + provenance`.
- Conservative rule: any `degraded_missing_truth`, `inactive_or_immaterial`, non-standard disposition, missing evidence floor, no-touch, or policy-blocked action must be contextual/review-required/manual-only.

### Blocker 2. Provider-backed apply is not bound to provenance decisionAsOf at the route boundary

Current behavior:

- Execution routes accept `startDate`, `endDate`, and `actionFingerprint`, but not `decisionAsOf` or the full provenance contract in `app/api/command-center/execution/route.ts:46`, `app/api/command-center/execution/apply/route.ts:70`, and `app/api/command-center/execution/rollback/route.ts:67`.
- `findCommandCenterActionForRange` rebuilds the live snapshot using the request range and then searches by `actionFingerprint` in `lib/command-center-service.ts:273`.

Safety impact:

- Because `actionFingerprint` includes `decisionAsOf`, stale actions should fail to resolve when the provider decision date rolls forward. That is safe for writes, but brittle for workflow continuity and handoffs.
- The system should make the intended provenance binding explicit so preview/apply can say whether it is resolving the same decision provenance, not just whether the fingerprint is present in the latest rebuilt snapshot.

Required Phase 3 closure:

- Carry `decisionAsOf` and/or provenance metadata through execution URLs and mutation payloads.
- Reject apply when the resolved action provenance does not match the submitted provenance.
- Keep selected reporting dates as optional reporting context only.

### Blocker 3. Demo/non-live evidence is blocked at execution preview, but not represented in queue readiness

Current behavior:

- Execution preview blocks demo or non-provider-accessible scopes after live state read in `lib/command-center-execution-service.ts:1209`.
- Queue readiness does not have a source evidence mode, demo/live marker, or provider-access marker; it relies on provenance/actionability in `lib/command-center.ts:1830`.

Safety impact:

- Demo or snapshot-style rows can appear queue-ready before execution preview blocks them. That is safer than apply, but it is not the intended product contract for push readiness.

Required Phase 3 closure:

- Add explicit source evidence mode to Meta policy output and Command Center action metadata, such as `live_provider`, `demo`, `snapshot`, `fallback`, `manual_context`.
- `demo`, `snapshot`, `fallback`, and non-live evidence must be `read_only_insight` or `blocked_from_push`, not default queue eligible.

### Blocker 4. Opportunity board queue eligibility is not a push/apply eligibility contract

Current behavior:

- Opportunity board eligibility is compiled with evidence floors and shared truth blockers in `lib/decision-trust/opportunity.ts:44`.
- Command Center maps opportunity board items into `CommandCenterOpportunityItem` but not action rows in `lib/command-center.ts:1198`.

Safety impact:

- This is safe today because opportunity board items are not provider apply actions. Phase 3 must not reuse opportunity `queue.eligible` as provider push eligibility without additional action policy approval.

Required Phase 3 closure:

- Keep opportunity board queue readiness separate from operational push readiness.
- Add tests proving opportunity board `queue_ready` does not imply provider-backed apply eligibility.

## Non-Blocking Observations

1. Source deep links still include selected `startDate` / `endDate` for navigation context in `lib/command-center.ts:1047` and `lib/command-center.ts:1378`. This is acceptable if treated as reporting context only.
2. The direct `buildMetaDecisionOs` helper still falls back `decisionAsOf` to `input.endDate` if called without source metadata in `lib/meta/decision-os.ts:3451`. The provider-backed source path supplies `decisionAsOf`, but tests and direct callers should avoid treating raw `endDate` as authority.
3. `MetaActionQueue` remains a legacy recommendation panel and still uses “Action Queue” language for recommendations in `components/meta/meta-action-queue.tsx:144`. Campaign detail demotion protects fallback context, but Phase 3 UI integration should avoid confusing this panel with Command Center queue/push readiness.

## Recommended Minimal Code Touch Points

1. `lib/meta/operator-policy.ts` or similar new pure module:
   - Define Meta operator states: `do_now`, `do_not_touch`, `watch`, `investigate`, `blocked`, `contextual_only`.
   - Define push readiness: `read_only_insight`, `operator_review_required`, `safe_to_queue`, `eligible_for_push_when_enabled`, `blocked_from_push`.
   - Gate on commercial truth, evidence floors, budget ownership, CBO/ABO ownership, bid/control constraints, sample size, conversion volume, delivery state, no-touch, provenance, and source evidence mode.

2. `lib/meta/decision-os.ts`:
   - Attach policy outcome to campaign/ad set action-bearing rows.
   - Do not change source-row decision logic beyond adding deterministic policy classification.
   - Ensure `degraded_missing_truth`, `inactive_or_immaterial`, `protected_watchlist`, and no-touch rows cannot be `safe_to_queue`.

3. `lib/command-center.ts`:
   - Update `isCommandCenterActionActionable` and queue decoration to require explicit policy approval/push readiness, not only `surfaceLane`.
   - Carry source evidence mode and policy outcome on `CommandCenterAction`.

4. `lib/command-center-execution-service.ts`:
   - Add a preflight check for explicit Meta policy push approval.
   - Reject provider-backed preview/apply if policy approval is absent, stale, degraded, contextual, fallback, demo, or non-live.
   - Compare submitted provenance/decisionAsOf with resolved action provenance before apply.

5. `app/api/command-center/execution/*`:
   - Accept and validate provenance binding fields where appropriate.
   - Keep selected dates as reporting context only.

6. `components/meta/meta-decision-os.tsx` and Command Center UI:
   - Surface policy outcome and push readiness labels without redesign.
   - Show `review-required` / `blocked` separately from `queue-ready`.

## Recommended Minimal Tests

1. Command Center queue safety:
   - `degraded_missing_truth + action_core + provenance` is not `defaultQueueEligible`.
   - `inactive_or_immaterial + provenance` is not `defaultQueueEligible`.
   - `protected_watchlist/noTouch + provenance` stays watchlist/manual-only.
   - `demo` or `snapshot` source evidence mode is not queue/push eligible.

2. Execution preview safety:
   - Meta ad set `scale_budget` with provenance but missing policy approval returns manual-only.
   - Meta ad set `reduce_budget` with `degraded_missing_truth` returns manual-only.
   - Missing provenance still returns manual-only.
   - Submitted provenance decisionAsOf mismatch returns stale/blocked preview.
   - Same action fingerprint with changed reporting range still resolves if provenance matches.

3. Workflow mutation safety:
   - Approve/reject/snooze can operate by fingerprint only.
   - Batch review excludes non-policy-approved rows.
   - Handoff can link action fingerprints but cannot make a blocked/contextual action push eligible.

4. Meta policy fixtures from Phase 2 scenario bank:
   - Budget not binding blocks budget increase.
   - CBO/campaign-owned budget blocks ad set budget mutation as primary push action.
   - Bid/control constrained delivery blocks budget increase and routes to investigate.
   - Low evidence winner blocks scale.
   - Low evidence poor performer blocks pause/kill.
   - Sufficient evidence poor performer can be review-required or safe-to-queue only when commercial truth and provenance are present.
   - Missing commercial truth blocks aggressive action.
   - No-touch/protected entity is contextual only.

## Verdict

Phase 3.1 provenance and fingerprint plumbing is directionally safe:

- selected reporting dates are not the primary action identity;
- missing provenance blocks queue/apply/push eligibility;
- snapshot fallback recommendations are not promoted into Command Center push actions;
- provider-backed apply is narrow and guarded by preview hash, approval, live state, canary, and provider checks.

Phase 3 is not complete yet. The remaining blocking work is a deterministic Meta policy layer that explicitly approves or blocks campaign/ad set actions before Command Center treats them as default-queue or push-ready. The highest-risk current gap is that `action_core + provenance` can still be enough for queue/apply readiness even when truth state or operator disposition should force review-only behavior.
