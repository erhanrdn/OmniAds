1. Phase

P3 hardened Meta sync throughput at the application layer. The worker now short-circuits productive backlog loops, recovers abandoned work faster by default, explicitly favors recent/core/maintenance work over historical tail work, and carries compact forward-progress evidence through the existing Meta status and admin truth pipeline.

2. Files Reviewed

- `docs/meta-sync-hardening/report.md`
- `lib/sync/meta-sync.ts`
- `lib/sync/provider-status-truth.ts`
- `lib/meta/status-operations.ts`
- `app/api/meta/status/route.ts`
- `lib/admin-operations-health.ts`
- `app/admin/sync-health/page.tsx`
- `components/meta/meta-sync-progress.tsx`
- `lib/meta/page-readiness.ts`
- `lib/meta/status-types.ts`
- `lib/db.ts`
- `package.json`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-hetzner.yml`
- `lib/sync/meta-sync.test.ts`
- `lib/sync/provider-status-truth.test.ts`
- `lib/meta/status-operations.test.ts`
- `app/api/meta/status/route.test.ts`
- `lib/admin-operations-health.test.ts`
- `lib/meta/page-readiness.test.ts`
- `lib/meta/ui-status.test.ts`
- `components/meta/meta-sync-progress.test.tsx` was requested but is not present in the repository
- Additional runtime-path review: `lib/sync/provider-worker-adapters.ts`
- Additional runtime-path review: `lib/sync/provider-worker-adapters.test.ts`
- Additional runtime-path review: `lib/sync/worker-runtime.ts`
- Additional runtime-path review: `scripts/sync-worker.ts`
- Additional lease-path review: `lib/meta/warehouse.ts`
- Additional regression coverage review: `lib/sync/meta-sync-lease-epoch.test.ts`

3. Recent Relevant Commits Reviewed

- `b7b0f9a` `fix(meta): enhance integration summary with detailed state and operations data`
- `a6ff37e` `P2: add compact Meta UI summary contract`
- `5f89deb` `feat: add Meta integration progress components and tests`
- `071af76` `docs(meta): add comprehensive report on Meta sync architecture and improvement phases`
- `0734889` `fix(meta): restore type-safe readiness split`
- `7bf5d76` `refactor(meta): split core readiness from breakdown completeness`
- `f98fbcb` `fix(meta): resolve live sync bottleneck holding readiness near zero`
- `dcfc4d1` `Optimize production logging and retention`
- `53f720f` `feat(ops): finalize global operator model and close remaining execution follow-ups`
- `5edd33d` `feat(ops): add global rebuild truth review workflow`
- `c31e70f` `feat(ops): replace business-specific rollout posture with global execution truth`
- `b7bc01f` `docs(meta): record retention canary review outcome`
- `f47c604` `feat(meta): add retention execute canary and staged rollout proof`
- `0f35e14` `refactor(meta): complete phase 10 legacy cleanup and hardening`
- `36a21be` `feat(db): support self-hosted postgres cutover`
- `b432043` `feat(meta): prepare phase 9 retention enforcement dry-run`
- `d66440c` `feat(meta): harden phase 8 detector and auto-heal outcomes`
- `8728f9a` `feat(meta): cut over executor completion to publication authority`
- `5e0a914` `feat(sync): finalize current implementation and update repo continuation plan`
- `a4854ed` `Fix Meta test fixtures for authoritative truth rollout`

4. Files Changed

- `docs/meta-sync-hardening/report.md`
- `lib/sync/meta-sync.ts`
- `lib/sync/provider-status-truth.ts`
- `lib/meta/status-types.ts`
- `lib/admin-operations-health.ts`
- `app/api/meta/status/route.ts`
- `app/admin/sync-health/page.tsx`
- `lib/sync/provider-worker-adapters.ts`
- `lib/sync/meta-sync.test.ts`
- `lib/sync/provider-status-truth.test.ts`
- `lib/admin-operations-health.test.ts`
- `app/api/meta/status/route.test.ts`
- `lib/sync/provider-worker-adapters.test.ts`
- `lib/sync/meta-sync-lease-epoch.test.ts`

5. Throughput Changes

- Added explicit adaptive loop delay selection in `lib/sync/meta-sync.ts`:
  - productive backlog with recent forward progress uses `META_BACKGROUND_BUSY_DELAY_MS`
  - pending backlog without fresh progress uses `META_BACKGROUND_WAITING_DELAY_MS`
  - empty/no-work loops use `META_BACKGROUND_IDLE_DELAY_MS`
  - repeated errors use bounded exponential backoff between `META_BACKGROUND_ERROR_BASE_DELAY_MS` and `META_BACKGROUND_ERROR_MAX_DELAY_MS`
- Extended `MetaSyncResult` so the worker path returns `hasPendingWork`, `hasForwardProgress`, and `nextDelayMs`, making loop behavior measurable instead of implicit.
- Changed in-process background scheduling to self-reschedule from the previous pass result instead of always waiting the old fixed idle delay.
- Added `resolveMetaWorkerRequestedLimit` so productive priority backlog can lease more than the base per-tick limit when recent forward progress is happening.
- Fixed the durable worker lease path in `lib/sync/provider-worker-adapters.ts` so Meta actually uses `plan.requestedLimit` instead of being pinned to the input limit, which previously suppressed the benefit of productive-batch planning.
- Tightened the durable lease plan so it only emits steps for lanes that actually have backlog, avoiding empty-lane lease probes.

6. Lease / Scheduling Changes

- Reduced the default Meta partition lease from 15 minutes to 6 minutes via `META_PARTITION_LEASE_MINUTES`, materially improving abandoned-worker recovery without changing schema or infrastructure.
- Preserved active-work heartbeats so live work keeps renewing while stale work becomes reclaimable faster.
- Reordered lease-plan priority to:
  - `maintenance`
  - `core_priority`
  - `extended_recent`
  - `core_fairness`
  - `extended_historical_fairness`
  - `historical_core`
  - `extended_historical`
- Restricted priority core leasing to recent/priority sources and restricted fairness/historical follow-up steps to historical sources, making prioritization explicit instead of inferred.
- Blocked historical core follow-up while maintenance or priority core backlog still exists.
- Blocked extended historical fairness/follow-up while maintenance or extended-recent backlog still exists.

7. New Tunables

- `META_BACKGROUND_IDLE_DELAY_MS` default `5000`
- `META_BACKGROUND_BUSY_DELAY_MS` default `150`
- `META_BACKGROUND_WAITING_DELAY_MS` default `1500`
- `META_BACKGROUND_ERROR_BASE_DELAY_MS` default `1000`
- `META_BACKGROUND_ERROR_MAX_DELAY_MS` default `15000`
- `META_PRIORITY_BACKLOG_LEASE_LIMIT` default `3`
- `META_FORWARD_PROGRESS_LEASE_LIMIT` default `2`
- `META_PRODUCTIVE_LEASE_LIMIT` default `6`
- `META_PARTITION_LEASE_MINUTES` default changed from `15` to `6`

8. New Operator Evidence

- Added `activityState` to the shared provider truth model: `ready`, `busy`, `waiting`, `stalled`, `blocked`.
- Added `activityState` and `progressEvidence` to the Meta status contract in `lib/meta/status-types.ts`.
- `/api/meta/status` now returns both the existing `progressState` and the new compact activity/forward-progress evidence derived from live queue and checkpoint truth.
- Admin health now derives Meta progress evidence from:
  - latest completed partition activity
  - ready-through advancement
  - checkpoint advancement
  - queue backlog and lease pressure already present in the payload
- The sync-health admin page now surfaces compact Meta evidence so operators can distinguish alive-but-busy, waiting, stalled/no-forward-progress, and blocked states without inventing a second status system.

9. Test Commands Run

- `npm test -- lib/sync/meta-sync.test.ts lib/sync/provider-status-truth.test.ts lib/meta/status-operations.test.ts app/api/meta/status/route.test.ts lib/admin-operations-health.test.ts lib/meta/page-readiness.test.ts lib/meta/ui-status.test.ts lib/sync/provider-worker-adapters.test.ts`
- `npx tsc --noEmit`
- `npm test -- lib/sync/meta-sync.test.ts lib/sync/meta-sync-scheduled-work.test.ts lib/sync/meta-sync-lease-epoch.test.ts lib/sync/meta-selected-range-truth.test.ts lib/sync/provider-status-truth.test.ts lib/sync/provider-worker-adapters.test.ts lib/sync/provider-repair-engine.test.ts lib/sync/worker-runtime.test.ts lib/sync/worker-runtime-runtime.test.ts lib/sync/worker-health.lease.test.ts`

10. Test Results

- Focused touched-area suite: `8` files passed, `113` tests passed.
- Typecheck: passed.
- Broader Meta/runtime regression suite: `10` files passed, `96` tests passed.
- Added deterministic coverage for:
  - productive backlog using a busy loop instead of the full idle delay
  - bounded error backoff
  - productive lease-limit expansion
  - priority/recent leasing ahead of historical tail work
  - operator activity/progress evidence flowing through status and admin health
  - durable worker use of `requestedLimit`
  - shorter default lease expectations in lease-epoch coverage

11. CI/Deploy Verification

This report is committed from local source-of-truth state before the post-push GitHub Actions closure loop runs. Final verification is performed against the exact pushed HEAD SHA, and the phase closeout records the exact branch, SHA, CI result, deploy result, and whether any repair commits were required.

12. Remaining Risks

- This phase does not change Postgres, OS, or Hetzner tuning, so very large backlogs can still be bounded by external throughput ceilings outside the application scheduler.
- The lease window is shorter by default; if a specific environment has unusually slow partitions and broken heartbeats, it may need explicit tuning rather than reverting to a long global lease.
- Operator truth is stronger, but it still depends on queue/checkpoint timestamps already recorded by the app; if downstream writers stop updating those timestamps, the system will honestly show degraded evidence rather than infer progress.

13. Recommended Next Phase

Measure sustained production drain rate and reclaim behavior on live backlog, then address infrastructure-side ceilings only where application scheduling is no longer the dominant limiter. The next phase should focus on observed bottlenecks such as database saturation, runtime concurrency ceilings, and host-level constraints, not more scheduling knobs.
