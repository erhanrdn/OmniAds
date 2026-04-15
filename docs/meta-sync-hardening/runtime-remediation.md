# Phase

Worker liveness / deploy topology remediation.

# Files Reviewed

- `docs/meta-sync-hardening/runtime-remediation.md`
- `docs/meta-sync-hardening/incident-evidence.md`
- `docs/meta-sync-hardening/report.md`
- `docs/meta-sync-hardening/release-acceptance.md`
- `docker-compose.yml`
- `Dockerfile`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-hetzner.yml`
- `scripts/sync-worker-healthcheck.ts`
- `scripts/sync-worker.ts`
- `lib/sync/worker-health.ts`
- `lib/sync/worker-runtime.ts`
- `lib/sync/provider-status-truth.ts`
- `lib/admin-operations-health.ts`
- `app/api/admin/sync-health/route.ts`
- `app/admin/sync-health/page.tsx`
- `app/api/meta/status/route.ts`
- `lib/meta/status-types.ts`
- `lib/meta/integration-summary.ts`

# Trigger For This Branch

- Phase 1 primary classification: `no_fresh_heartbeat`
- Triggering evidence:
  - `TheSwaf` and `Grandmix` both showed `workerOnline=false`, `workerLastHeartbeatAt=null`, active runner leases `[]`, and benchmark `observedState=stalled`
  - `sync-worker-healthcheck.ts --provider-scope meta` reported `onlineWorkers=0` and `workerInstances=0`
  - DB diagnostics showed no blocked locks or long transactions, so worker liveness was the first branch to address

# Root Cause

Deploy topology verification only required the worker container to become healthy once. It did not require a fresh Meta heartbeat after that healthy transition, so deploy could complete without proving that worker liveness remained visible beyond initial startup.

# Files Changed

- `.github/workflows/deploy-hetzner.yml`
- `docs/meta-sync-hardening/runtime-remediation.md`

# Runtime / Deploy Changes

- Added a `current_utc_iso` helper in the remote deploy script.
- Added `verify_worker_fresh_heartbeat_after`, which repeatedly executes `scripts/sync-worker-healthcheck.ts` inside the worker container with:
  - `--provider-scope meta`
  - `--online-window-minutes 5`
  - `--min-online-workers 1`
  - `--min-heartbeat-after <worker healthy timestamp>`
- Updated deploy flow so that after `check_optional_health worker 40` succeeds, deploy now records the worker healthy timestamp and requires a new post-healthy Meta heartbeat before the deploy step can pass.
- Added extra worker diagnostics on repeated fresh-heartbeat verification failure by dumping `docker compose ps worker`, worker health state, and recent worker logs.

# Worker Truth Changes

- No worker-truth wording change was needed in app/admin surfaces for this branch.
- The remediation hardens liveness truth at deploy time instead:
  - healthy worker must now prove a fresh Meta heartbeat after the healthy check
  - deploy should fail rather than silently declaring success when worker liveness is not sustained

# Validation Evidence

- Local validation completed before push:
  - `npx tsc --noEmit` passed
  - targeted worker/admin truth tests passed
- Live business validation against the affected runtime will be re-run immediately after the runtime-affecting SHA is deployed:
  - `meta:readiness-snapshot`
  - `meta:drain-rate`
  - `meta:benchmark`
  - `meta:db:diagnostics`

# Test Commands Run

- `npx tsc --noEmit`
- `npx vitest run lib/sync/worker-health.lease.test.ts lib/sync/worker-health.test.ts lib/sync/worker-runtime-runtime.test.ts lib/sync/worker-runtime.test.ts lib/sync/provider-status-truth.test.ts lib/admin-operations-health.test.ts app/api/meta/status/route.test.ts`

# Test Results

- `npx tsc --noEmit`: passed
- targeted Vitest subset: passed
  - test files: `7`
  - tests: `71`
  - failures: `0`

# Recommended Next Phase

`Phase 1`

Reasoning:

- This branch changes runtime/deploy behavior. The next required step is post-fix truth recapture against the deployed SHA before making any acceptance claim.
