# Meta Global Operations Runbook

This file now describes the steady-state Meta operating model on the existing production shape. The historical rollout record remains:

- `docs/meta-rollout-record-2026-04-07.md`

## Current Operating Posture

- one global Meta behavior contract applies across all businesses
- the warehouse rebuild remains honest about cold bootstrap, backfill, quota pressure, partial coverage, blocked publication, and repair-required truth
- business-level status is explanatory only because the data is business/account scoped
- `ready` means evidence only; it does not auto-enable stronger execution

## Deployment Surface

Keep the production shape stable:

1. `web`
   - serves the Next.js application
   - must pass `/api/build-info` health checks after deploy
2. `worker`
   - runs `npm run worker:start`
   - must emit a fresh Meta worker heartbeat after deploy
3. `cron`
   - remains host-level cron calling `/api/sync/cron`
   - advances scheduled Meta maintenance and finalization work
4. `nginx`
   - remains the reverse proxy in front of `web`

## Runtime Controls

Only these controls matter for Meta finalization and retention posture:

1. `META_AUTHORITATIVE_FINALIZATION_V2`
   - `0`: Meta authoritative finalization v2 is globally disabled
   - `1`: Meta authoritative finalization v2 is globally enabled
2. `META_RETENTION_EXECUTION_ENABLED`
   - `0`: retention remains dry-run only
   - `1`: retention delete execution is globally enabled
3. `META_AUTHORITATIVE_FINALIZATION_CANARY_BUSINESSES`
   - legacy-only environment variable
   - no longer changes runtime behavior under the current global contract

## Global Operator Review Workflow

Use one workflow before changing trust or execution posture:

1. Open `/admin/sync-health` or run `npm run ops:execution-readiness-review`.
2. Read `Global rebuild truth review`.
3. Confirm the current Meta rebuild state:
   - `blocked`
   - `repair_required`
   - `quota_limited`
   - `cold_bootstrap`
   - `backfill_in_progress`
   - `partial_upstream_coverage`
   - `ready`
4. Read the shared global execution-readiness gate:
   - `not_ready`
   - `conditionally_ready`
   - `ready`
5. Read the explicit execution posture review:
   - `no_go`
   - `hold_manual`
   - `eligible_for_explicit_review`

Interpretation rules:

- provider drilldown explains evidence; it does not redefine posture per business
- `ready` means rebuild evidence is sufficient for explicit review, not automatic enablement
- the posture review never flips runtime flags automatically

## Provider Drilldown

Use business-scoped drilldown only to explain the global decision:

- `/api/meta/status?businessId=<businessId>`
  - `operatorTruth.rebuild`
  - `operatorTruth.reviewWorkflow`
  - `protectedPublishedTruth`
  - `retention`

Protected published truth interpretation:

- `present`
  - non-zero protected published truth is visible in rebuilt data
- `publication_missing`
  - finalized-like progress exists, but required publication is still missing
- `rebuild_incomplete`
  - absence is still explained by rebuild posture
- `none_visible`
  - no non-zero protected published truth is currently visible for that business
- `unavailable`
  - protected-truth review runtime is unavailable

## Locked Meta Truth Contracts

These contracts remain non-negotiable:

1. `today` is live-only.
2. Non-today inside the authoritative horizon serves published verified truth only.
3. Non-today outside the authoritative horizon keeps live fallback for:
   - `summary`
   - `campaigns`
   - `adsets`
   - `ad`
4. `breakdowns` outside `394` days remain `unsupported/degraded`.
5. Finalize-like completion without required publication is not success.
6. `blocked` and `repair_required` remain first-class operator truth.

## Finalization And Recovery Contract

Historical Meta success means published authoritative truth exists for the required surfaces on that account-day.

Operator interpretation:

- `blocked`
  - finalize-like work completed, but publication is missing or mismatched
- `repair_required`
  - a fresh authoritative retry is the correct next step
- `queued`, `running`, `pending`
  - still non-terminal while authoritative progress is justified

First recovery checks:

1. `npm run meta:state-check -- <businessId>`
2. `npm run meta:verify-day -- <businessId> <providerAccountId> <day>`
3. `npm run meta:verify-publish -- <businessId> <providerAccountId> <day>`
4. `npm run meta:refresh-state -- <businessId>`
5. `npm run meta:reschedule -- <businessId>`
6. `npm run meta:cleanup -- <businessId>`

## Retention Operating Posture

Meta retention is steady-state manual control:

- `META_RETENTION_EXECUTION_ENABLED` remains the only destructive execution gate
- `npm run meta:retention-canary -- <businessId>` remains the scoped proof command
- `npm run meta:retention-canary -- <businessId> --execute` is allowed only when the global execution gate is explicitly on
- the command name is historical; it is a scoped proof path, not a rollout ladder

Operators must verify:

1. `/api/meta/status?businessId=<businessId>`
   - `retention`
   - `retention.scopedExecution`
2. published truth remains protected
3. delete scope remains limited to horizon-outside residue or stale orphan artifacts
4. global posture stays manual unless an explicit later decision changes it

## Evidence Required Before Any Stronger Posture

Do not consider stronger posture until all of this is true:

1. the shared global review no longer reports Meta rebuild blockers
2. Meta protected published truth is visible on real rebuilt data
3. `blocked` and `repair_required` cases are cleared or understood
4. quota pressure and partial coverage are no longer holding the global gate back
5. retention dry-run or scoped proof still shows only safe delete scope

## Rollback And Safety

If Meta behavior is incorrect after a deploy or posture change:

1. keep provider truth contracts intact
2. revert explicit flags instead of improvising business-specific rollout
3. preserve publication, manifest, and reconciliation evidence
4. diagnose with the existing operator commands before re-enabling any stronger posture

## Optional Future Operational Decisions

These are optional operations, not missing architecture:

1. explicit review of stronger warehouse trust after the global posture review reports `eligible_for_explicit_review`
2. explicit review of global Meta retention execute mode after protected published truth is visibly exercised on real rebuilt data
3. continued steady-state finalization with no flag change if the evidence does not justify stronger posture
