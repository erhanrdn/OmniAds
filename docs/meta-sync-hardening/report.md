# 1. Phase

hotfix: remediate Meta worker liveness

This incident did not uncover a new repo-owned scheduler or Postgres bug that explains the live stalled business. The live Meta business is still stalled because no Meta worker heartbeat or runner lease is visible at all. The repo-owned bug fixed here is narrower and important: the compact Meta card truth path was dropping worker-health context and could keep rendering generic queue waiting even when the backend already knew the condition was `worker_unavailable`.

# 2. Files Reviewed

- Runtime and deploy path: `docker-compose.yml`, `.github/workflows/deploy-hetzner.yml`, `scripts/sync-worker-healthcheck.ts`, `lib/sync/worker-health.ts`, `lib/sync/worker-runtime.ts`, `scripts/sync-worker.ts`
- Meta status truth and card path: `lib/sync/provider-status-truth.ts`, `app/api/meta/status/route.ts`, `lib/meta/status-types.ts`, `lib/meta/integration-summary.ts`, `lib/meta/integration-progress.ts`, `lib/meta/ui-status.ts`, `components/integrations/meta-integration-progress.tsx`
- Admin/operator truth path: `lib/admin-operations-health.ts`, `app/api/admin/sync-health/route.ts`, `app/admin/sync-health/page.tsx`
- Incident docs: `docs/meta-sync-hardening/report.md`, `docs/meta-sync-hardening/release-acceptance.md`
- Exact search-path consumers reviewed for the incident terms: `app/api/meta/status/route.ts`, `lib/meta/integration-summary.ts`, `lib/meta/integration-progress.ts`, `lib/admin-operations-health.ts`, `app/admin/sync-health/page.tsx`, `lib/admin-db-diagnostics.ts`, `app/api/meta/status/route.test.ts`, `lib/meta/integration-summary.test.ts`, `lib/meta/integration-progress.test.ts`

# 3. Live Evidence

- Live access was available. The acceptance business from the current report remained `TheSwaf` (`172d0ab8-495b-4679-a4c6-ffa404c389d3`).
- `node --import tsx scripts/sync-worker-healthcheck.ts --provider-scope meta --online-window-minutes 5 --min-online-workers 1` at `2026-04-15T03:38Z` returned `pass=false`, `reason=insufficient_online_workers`, `onlineWorkers=0`, `workerInstances=0`, `lastHeartbeatAt=null`.
- `npm run meta:readiness-snapshot -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/meta-readiness-hotfix.json` captured at `2026-04-15T03:38:59.535Z` showed:
  - `progressState=partial_stuck`
  - `activityState=stalled`
  - `stallFingerprints=[historical_starvation, worker_unavailable, checkpoint_not_advancing]`
  - `workerOnline=false`
  - `workerLastHeartbeatAt=null`
  - `dbConstraint=worker_unavailable`
  - `queueDepth=11`
  - `leasedPartitions=0`
  - `lastSuccessfulPublishAt=null`
  - user-facing recent core still at `14%`, ready-through still `2026-04-13`
- `npm run meta:drain-rate -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --window-minutes 15 --out /tmp/meta-drain-hotfix.json` captured at `2026-04-15T03:38:59.549Z` showed `queueDepth=11`, `leasedPartitions=0`, `completedLastWindow=0`, `createdLastWindow=0`, `reclaimedLastWindow=0`, `netDrainEstimate=0`, `drainState=large_and_not_draining`.
- `npm run meta:db:diagnostics -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/meta-db-hotfix.json` captured at `2026-04-15T03:38:59.437Z` showed no worker heartbeats, no active runner leases, no blocked locks, no long transactions, and only web-process DB activity.
- `npm run meta:state-check -- 172d0ab8-495b-4679-a4c6-ffa404c389d3` captured at `2026-04-15T03:44:50.128Z` showed `queued=11`, `leased=0`, `published=0`, `repairBacklog=4`, `sourceManifestCounts.total=0`, and `d1FinalizeSla.breachedAccounts=2`.
- `npm run meta:verify-day` and `npm run meta:verify-publish` for both breached accounts on `2026-04-13` re-confirmed `sourceManifestState=missing`, `verificationState=processing`, detector reason `authoritative_retry_pending`, `queued=1`, `leased=0`, `repairBacklog=1`, and guidance `refresh_state_then_reschedule`.
- `npm run meta:benchmark -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --samples 4 --interval-seconds 300 --window-minutes 15 --out /tmp/meta-benchmark-hotfix.json` ran from `2026-04-15T03:43:51.415Z` to `2026-04-15T03:58:51.904Z` and finished with:
  - `observedState=stalled`
  - `progressObserved=false`
  - `queueDepthDelta=0`
  - `leasedPartitionsDelta=0`
  - `terminalPartitionsDuringSample=0`
  - `createdPartitionsDuringSample=0`
  - `finalOperatorProgressState=partial_stuck`
  - `finalOperatorActivityState=stalled`
  - `finalDrainState=large_and_not_draining`

# 4. Root Cause

- Exact live blocker classification: `worker_unavailable`.
- Evidence for that classification:
  - no Meta worker heartbeat rows
  - no active Meta runner leases
  - queue backlog present
  - no terminal progress over the maintained benchmark window
  - no DB lock or long-transaction signature
- Repo-owned cause fixed in this hotfix: `/api/meta/status` was computing worker-unavailable truth in `operations`, but the compact `integrationSummary` path dropped that worker-health context before building the Meta card stages. That let the card degrade to generic queue waiting instead of explicitly surfacing worker unavailability.
- Remaining non-repo blocker after the fix: the separately deployed Meta worker runtime is still absent, down, or not publishing heartbeats into the current environment. From repo evidence alone this is an external worker/service/host failure, not a missing worker code path in the repository.

# 5. Files Changed

- `app/api/meta/status/route.ts`
- `lib/meta/integration-summary.ts`
- `lib/meta/integration-progress.ts`
- `app/api/meta/status/route.test.ts`
- `lib/meta/integration-summary.test.ts`
- `lib/meta/integration-progress.test.ts`
- `docs/meta-sync-hardening/report.md`

# 6. Runtime / Worker Findings

- `docker-compose.yml` already defines a separate `worker` service next to `web`, with `SYNC_WORKER_MODE=1`.
- `.github/workflows/deploy-hetzner.yml` already pulls and recreates both `web` and `worker`, verifies exact SHA images, and waits for the worker healthcheck.
- `scripts/sync-worker.ts` correctly boots `runDurableWorkerRuntime()` with the durable worker adapters.
- `lib/sync/worker-runtime.ts` emits heartbeats through `heartbeatSyncWorker()` and acquires per-business runner leases through `acquireSyncRunnerLease()`.
- `scripts/sync-worker-healthcheck.ts` correctly reports the current live worker absence. It is not a false-negative from stale classification; the DB currently shows zero Meta worker instances.
- The incident evidence does not support `worker alive but blocked on DB / locks / connection pressure`. The live DB diagnostics showed no worker sessions, no blocked locks, and no long transactions.

# 7. Operator Truth Changes

- `/api/meta/status` now passes the full `operations` truth into the compact Meta integration summary instead of stripping worker-health fields.
- `buildMetaIntegrationSummary()` now marks the queue stage as `blocked` when backlog exists with `workerHealthy=false` and `leasedPartitions=0`.
- `resolveMetaIntegrationProgress()` now renders that queue stage as explicit worker unavailability, with detail text stating that no fresh heartbeat or active lease is visible and that queued work is not draining.
- This stays within the existing status system. It does not invent synthetic progress or a second parallel truth model.

# 8. Test Commands Run

- `npx vitest run lib/meta/integration-summary.test.ts lib/meta/integration-progress.test.ts app/api/meta/status/route.test.ts`
- `npx vitest run lib/meta/integration-summary.test.ts lib/meta/integration-progress.test.ts app/api/meta/status/route.test.ts lib/admin-operations-health.test.ts lib/sync/provider-status-truth.test.ts`
- `npx tsc --noEmit`
- `node --import tsx scripts/sync-worker-healthcheck.ts --provider-scope meta --online-window-minutes 5 --min-online-workers 1`
- `npm run meta:readiness-snapshot -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/meta-readiness-hotfix.json`
- `npm run meta:drain-rate -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --window-minutes 15 --out /tmp/meta-drain-hotfix.json`
- `npm run meta:db:diagnostics -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/meta-db-hotfix.json`
- `npm run meta:state-check -- 172d0ab8-495b-4679-a4c6-ffa404c389d3`
- `npm run meta:verify-day -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_822913786458311 2026-04-13`
- `npm run meta:verify-day -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_921275999286619 2026-04-13`
- `npm run meta:verify-publish -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_822913786458311 2026-04-13`
- `npm run meta:verify-publish -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_921275999286619 2026-04-13`
- `npm run meta:benchmark -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --samples 4 --interval-seconds 300 --window-minutes 15 --out /tmp/meta-benchmark-hotfix.json`

# 9. Test Results

- All touched Meta route/card tests passed.
- The broader related truth/status subset passed.
- `npx tsc --noEmit` passed.
- Live evidence was re-captured successfully in this environment.
- The business did not start draining. The maintained benchmark remained `stalled`.
- The repo-owned result of this hotfix is explicit operator truth: the Meta queue/card path now reports worker unavailable/blocked for this condition instead of generic waiting.

# 10. Remaining Risks

- The live business remains not market-ready until the external worker runtime is restored and starts publishing heartbeats and leasing work.
- This hotfix improves truth only; it does not repair a missing or failing worker service outside the repo.
- Because the production-like environment currently has zero Meta worker heartbeats, no code-only validation from this workspace can prove live drain without a host-level worker recovery.

# 11. Recommended Next Steps

- Restore the deployed Meta `worker` service or worker host first. Confirm fresh rows appear in `sync_worker_heartbeats` for provider scope `meta`.
- After worker heartbeat returns, rerun the exact maintained acceptance set for `TheSwaf` and require the benchmark to move from `stalled` to `busy` or `ready`.
- If heartbeat returns but `leasedPartitions` still stay at zero, use the existing admin health and verify-day/verify-publish outputs to distinguish lease denial from authoritative publish lag before changing queue state.
- Do not tune Postgres for this incident until the primary constraint stops reading `worker_unavailable`.
