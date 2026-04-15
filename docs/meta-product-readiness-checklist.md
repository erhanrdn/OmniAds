# Meta Product Readiness Checklist

Use this checklist as the steady-state backend readiness and operating checklist for Meta.

Recorded historical rollout outcome:

- `docs/meta-rollout-record-2026-04-07.md`

## Current Operating Posture

- one global Meta behavior contract applies across all businesses
- rebuild truth must remain honest during warehouse rebuild
- `ready` means evidence only and does not auto-enable stronger execution
- business-scoped status is explanatory only because the data is business/account scoped

## CI Gate

1. Confirm GitHub Actions `CI` passed on the exact commit.
2. Confirm the workflow ran:
   - install
   - build
   - typecheck
   - tests
3. Do not treat deploy success as a substitute for CI success.

Go/no-go:

- `GO` only if CI is green on the exact release commit.
- `NO-GO` if build, typecheck, or tests fail.

## Deployment Gate

1. Confirm `web` health checks pass after deploy.
2. Confirm `worker` emits a fresh Meta heartbeat after deploy.
3. Confirm host cron still reaches `/api/sync/cron`.
4. Confirm explicit flags match the intended posture:
   - `META_AUTHORITATIVE_FINALIZATION_V2`
   - `META_RETENTION_EXECUTION_ENABLED`
   - `SYNC_DEPLOY_GATE_MODE`
   - `SYNC_RELEASE_GATE_MODE`
   - `SYNC_RELEASE_CANARY_BUSINESSES`

Go/no-go:

- `GO` only if deploy health is clean and the explicit runtime posture matches intent.
- `NO-GO` if operator posture is ambiguous or hidden behind stale assumptions.

Additional control-system rule:

- `deploy_gate` may pass while `release_gate` is still `measure_only` or `not_release_ready`
- never collapse these into one green signal

## Global Operator Review Gate

Before claiming stronger Meta trust, inspect the shared operator workflow:

1. Open `/admin/sync-health` or run `npm run ops:execution-readiness-review`.
2. Inspect:
   - Meta rebuild truth
   - Meta protected published truth
   - `globalRebuildReview.executionReadiness`
   - `globalRebuildReview.executionPostureReview`
3. Interpret the shared posture literally:
   - `not_ready`
   - `conditionally_ready`
   - `ready`
4. Interpret the explicit posture review literally:
   - `no_go`
   - `hold_manual`
   - `eligible_for_explicit_review`

Go/no-go:

- `GO` only if the posture review is `eligible_for_explicit_review` and operators still choose a stronger posture explicitly.
- `HOLD MANUAL` if the posture review is `hold_manual`.
- `NO-GO` if the posture review is `no_go` or if anyone is treating `ready` as auto-enable logic.

## Business-Scoped Evidence Gate

Use provider drilldown only to explain the global answer:

1. Open `/api/meta/status?businessId=<businessId>`.
2. Inspect:
   - `operatorTruth.rebuild`
   - `operatorTruth.reviewWorkflow`
   - `protectedPublishedTruth`
   - `retention`
3. Interpret protected published truth honestly:
   - `present`
   - `publication_missing`
   - `rebuild_incomplete`
   - `none_visible`
   - `unavailable`

Go/no-go:

- `GO` only if business-scoped evidence agrees with the global review.
- `NO-GO` if business-scoped evidence is being used to redefine posture business-by-business.

## Locked Meta Truth Checks

Confirm these contracts remain intact:

1. `today` remains live-only.
2. Non-today inside the authoritative horizon remains published verified truth only.
3. Non-today beyond the authoritative horizon keeps live fallback for:
   - `summary`
   - `campaigns`
   - `adsets`
   - `ad`
4. `breakdowns` outside `394` days remain `unsupported/degraded`.
5. Historical readiness does not become `ready` from warehouse coverage alone.
6. Finalize-like completion without publication remains `blocked` or `repair_required` when evidence supports it.

Go/no-go:

- `GO` only if the locked truth contract remains visible in status and serving behavior.
- `NO-GO` if raw warehouse presence can still masquerade as authoritative truth.

## Manual Control Checks

Confirm the manual-control contract is explicit:

1. `META_AUTHORITATIVE_FINALIZATION_V2` remains the explicit finalization posture control.
2. `META_RETENTION_EXECUTION_ENABLED` remains the explicit retention delete control.
3. The shared review workflow never flips flags automatically.
4. `ready` is interpreted as evidence only, not automatic execution.
5. `SYNC_RELEASE_CANARY_BUSINESSES` is separate from the legacy finalization canary env.

Go/no-go:

- `GO` only if these controls remain explicit and separate.
- `NO-GO` if wording or behavior implies that readiness enables execution automatically.

## Retention Proof Checks

Use retention only as operator-visible proof unless an explicit later decision says otherwise:

1. Inspect `/api/meta/status?businessId=<businessId>`:
   - `retention`
   - `retention.scopedExecution`
2. Confirm default posture:
   - `META_RETENTION_EXECUTION_ENABLED=false` unless deliberately changed
   - `retention.defaultExecutionDisabled=true`
3. Use the scoped proof command:
   - `npm run meta:retention-canary -- <businessId>`
4. Use scoped execute only when the global execution flag is intentionally on:
   - `npm run meta:retention-canary -- <businessId> --execute`
5. Confirm deletes, if any, remain limited to safe residue and stale orphan artifacts.

Go/no-go:

- `GO` only if retention proof is operator-visible and published truth remains protected.
- `NO-GO` if delete scope or protected truth remains ambiguous.

## Current Steady-State Assertions

The following statements should remain true:

- Meta finalization and Meta retention are explicit global controls.
- Protected published truth is first-class operator evidence.
- Rebuild truth remains conservative under cold bootstrap, backfill, quota pressure, partial coverage, `blocked`, and `repair_required`.
- The shared global review is the supported operator decision surface.
- Future posture changes are operational decisions, not missing architecture.

## Future Optional Operational Decisions

Optional future operations:

1. explicit review of stronger warehouse trust after the global posture review reports `eligible_for_explicit_review`
2. explicit review of Meta retention execute mode after protected published truth is visibly exercised on real rebuilt data
3. no posture change at all if the evidence does not justify it
