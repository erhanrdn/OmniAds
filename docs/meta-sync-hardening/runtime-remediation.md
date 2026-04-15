# Phase

Post-hotfix truth recapture.

# Files Reviewed

- `docs/meta-sync-hardening/incident-evidence.md`
- `docs/meta-sync-hardening/report.md`
- `docs/meta-sync-hardening/release-acceptance.md`
- `docker-compose.yml`
- `.github/workflows/deploy-hetzner.yml`
- `scripts/sync-worker-healthcheck.ts`
- `scripts/sync-worker.ts`
- `scripts/meta-sync-readiness-snapshot.ts`
- `scripts/meta-sync-drain-rate.ts`
- `scripts/meta-sync-benchmark.ts`
- `scripts/meta-sync-db-diagnostics.ts`
- `scripts/meta-state-check.ts`
- `scripts/meta-terminal-running-runs-report.ts`
- `scripts/sync-hardening-acceptance.ts`
- `lib/sync/worker-health.ts`
- `lib/sync/worker-runtime.ts`
- `lib/sync/provider-status-truth.ts`
- `lib/admin-operations-health.ts`
- `app/api/admin/sync-health/route.ts`
- `app/api/meta/status/route.ts`
- `lib/meta/integration-summary.ts`
- `lib/meta/status-types.ts`

# Git / Pipeline Truth

Observation:

- Current branch: `main`
- Local HEAD at capture time: `10cd8337d6bacbe1a4a1ada292d98c7f81230a0c`
- Relevant commits from current history:
  - `a125606` `P5: benchmark Meta sync and close release readiness`
  - `dbab28c` `P6: remediate Meta acceptance stall`
  - `5df8a0d` `hotfix: remediate Meta worker liveness`
  - `10cd833` `incident: capture Meta sync evidence`
- Public runtime build info from `https://adsecute.com/api/build-info` and `https://www.adsecute.com/api/build-info` reported deployed build `5df8a0d3352b49f545a31a27deae6282279d3389`.
- GitHub Actions truth observed through the public Actions API:
  - `a125606...`: CI `success`, deploy `success`
  - `dbab28c...`: CI `success`, deploy `success`
  - `5df8a0d...`: CI `success`, deploy `success`
  - `10cd833...`: CI `success`; no deploy run observed

Inference:

- Repo `main` has moved past the live runtime. The latest deployed runtime visible from public build info is still the hotfix SHA `5df8a0d...`.
- The most recent local commit before this phase (`10cd833`) was docs-only or otherwise non-runtime-affecting in deployment behavior.

# Runtime Access Available

Observation:

- Public runtime identity access was available through `build-info`.
- DB-backed maintained scripts were available and returned live business truth.
- Local host/container access was not available from this environment:
  - `docker ps` failed with `command not found`
  - `docker compose ps` failed with `command not found`
- No direct runtime log stream or host shell access was available.

Inference:

- Runtime verification in this phase is based on live application/database truth and public deploy identity, not direct container inspection on the host.

# Businesses Measured

Observation:

- Acceptance business measured: `TheSwaf` (`172d0ab8-495b-4679-a4c6-ffa404c389d3`)
- Comparison candidates probed:
  - `Grandmix` (`5dbc7147-f051-4681-a4d6-20617170074f`)
  - `IwaStore` (`f8a3b5ac-588c-462f-8702-11cd24ff3cd2`)
- `Grandmix` was selected as the comparison business because it returned valid Meta truth and was materially different from `TheSwaf` while remaining safely comparable.

Inference:

- Only two businesses were fully measured in this phase: `TheSwaf` and `Grandmix`.
- `IwaStore` probe corroborated the comparison pattern but was not used as the primary comparison business in the artifact.

# Container / Process Evidence

Observation:

- Direct `docker ps` / `docker compose ps` evidence was unavailable in this workspace.
- No container uptime, restart count, health, or image SHA could be collected from host tooling.
- `scripts/sync-worker-healthcheck.ts --provider-scope meta --online-window-minutes 5 --min-online-workers 1` returned:
  - `pass=false`
  - `reason=insufficient_online_workers`
  - `summary.onlineWorkers=0`
  - `summary.workerInstances=0`
  - `summary.lastHeartbeatAt=null`

Inference:

- There was no maintained-script evidence of a currently online Meta worker at capture time.
- This does not distinguish between worker absent, worker repeatedly dying, or runtime topologies writing truth elsewhere; host/container access would be needed for that distinction.

# Worker Liveness Evidence

Observation:

- `TheSwaf` readiness snapshot reported:
  - `workerOnline=false`
  - `workerLastHeartbeatAt=null`
  - `queue.leasedPartitions=0`
  - `stallFingerprints` included `worker_unavailable`
- `Grandmix` readiness snapshot reported the same worker-liveness pattern:
  - `workerOnline=false`
  - `workerLastHeartbeatAt=null`
  - `queue.leasedPartitions=0`
  - `stallFingerprints` included `worker_unavailable`
- DB diagnostics for both measured businesses reported:
  - `leaseAndReclaim.activeRunnerLeases=[]`
  - `leaseAndReclaim.workerHeartbeats=[]`
  - relation stats showed `sync_worker_heartbeats` live rows `0`
  - relation stats showed `sync_runner_leases` live rows `0`
- Terminal running runs report for both measured businesses returned no active rows.
- No stale lease evidence was observed:
  - `staleLeasePartitions=0`
  - `blockedLocks=[]`
  - `longTransactions=[]`

Inference:

- Fresh Meta worker liveness was not observable through the maintained runtime truth surfaces at capture time.
- The maintained evidence supports “no fresh heartbeat / no active lease ownership” more directly than “general DB slowness.”
- With no host access, the worker cannot be cleanly distinguished as absent versus restarting; only stale-or-missing liveness is directly supported.

# Queue / Progress Evidence

Observation:

- `TheSwaf`:
  - `queueDepth=13`
  - `pendingByLane={maintenance:8, extended:5}`
  - `pendingByScope={account_daily:8, ad_daily:5}`
  - `oldestQueuedPartition=2024-04-13`
  - `retryableFailedPartitions=0`
  - `deadLetterPartitions=0`
  - `lastCompletedAt=null`
  - `lastCheckpointAdvancedAt=2026-04-14T11:57:01.100Z`
  - `lastReadyThroughAdvancedAt=2026-04-14T11:57:01.100Z`
  - `lastSuccessfulPublishAt=null`
  - `recent core readiness=14%`
  - `recent truth state=processing`
  - `priority-window truth state=processing`
  - `progressState=partial_stuck`
  - `activityState=stalled`
  - `stallFingerprints=[historical_starvation, worker_unavailable, checkpoint_not_advancing]`
  - `dbBacklogState=stalled`
  - drain output: `drainState=large_and_not_draining`, `completedLastWindow=0`, `netDrainEstimate=0`
  - benchmark summary: `observedState=stalled`, `queueDepthDelta=0`, `leasedPartitionsDelta=0`, `terminalPartitionsDuringSample=0`
- `Grandmix`:
  - `queueDepth=2`
  - `pendingByLane={maintenance:2}`
  - `pendingByScope={account_daily:2}`
  - `oldestQueuedPartition=2024-04-13`
  - `retryableFailedPartitions=0`
  - `deadLetterPartitions=0`
  - `lastCompletedAt=null`
  - `lastCheckpointAdvancedAt=2026-04-14T11:57:01.100Z`
  - `lastReadyThroughAdvancedAt=2026-04-14T11:57:01.100Z`
  - `lastSuccessfulPublishAt=null`
  - `recent core readiness=14%`
  - `recent truth state=processing`
  - `priority-window truth state=processing`
  - `progressState=partial_stuck`
  - `activityState=stalled`
  - `stallFingerprints=[historical_starvation, worker_unavailable, checkpoint_not_advancing]`
  - `dbBacklogState=stalled`
  - drain output: `drainState=large_and_not_draining`, `completedLastWindow=0`, `netDrainEstimate=0`
  - benchmark summary: `observedState=stalled`, `queueDepthDelta=0`, `leasedPartitionsDelta=0`, `terminalPartitionsDuringSample=0`

Inference:

- Both measured businesses showed persistent queue with zero lease acquisition and zero terminal progress over the full benchmark window.
- `TheSwaf` remains the higher-severity acceptance case; `Grandmix` shows the same failure shape at smaller backlog size.
- The failure signature is consistent across comparison data rather than being isolated to one business.

# Script Outputs

Observation:

- Maintained commands executed for `TheSwaf`:
  - `meta:readiness-snapshot`
  - `meta:drain-rate`
  - `meta:benchmark`
  - `meta:db:diagnostics`
  - `meta:state-check`
  - `meta:verify-day` for:
    - `act_822913786458311` / `2026-04-14`
    - `act_921275999286619` / `2026-04-14`
  - `meta:verify-publish` for the same two account/day pairs
- Maintained commands executed for `Grandmix`:
  - `meta:readiness-snapshot`
  - `meta:drain-rate`
  - `meta:benchmark`
  - `meta:db:diagnostics`
  - `meta:state-check`
  - `meta:verify-day` for `act_805150454596350` / `2026-04-13`
  - `meta:verify-publish` for the same account/day pair
- `TheSwaf` state-check / verify outputs showed:
  - D-1 finalize SLA breached for 2 of 2 accounts
  - `sourceManifestState=missing`
  - `verificationState=processing`
  - `detectorReasonCodes=[authoritative_retry_pending]`
  - `publicationReady=false`
  - `activePublication=null`
- `Grandmix` state-check / verify outputs showed:
  - D-1 finalize SLA breached for 1 of 1 accounts
  - `sourceManifestState=missing`
  - `verificationState=processing`
  - `detectorReasonCodes=[authoritative_retry_pending]`
  - `publicationReady=false`
  - `activePublication=null`

Inference:

- The maintained script layer consistently describes non-draining queue with no active liveness, not a merely slow-but-progressing system.
- Publish/finalization truth is also non-advancing, but the scripts do not show that as an isolated publish-only failure; it coexists with missing worker/lease truth.

# Log Evidence

Observation:

- Direct runtime log access was not available from this environment.
- No worker startup, heartbeat, lease acquisition, completion, publish, or DB error snippets could be collected from host logs.

Inference:

- This phase has no direct log evidence. Classification is based on maintained script outputs, database-backed truth, and public deploy identity only.

# Primary Classification

`no_fresh_heartbeat`

Evidence supporting primary classification:

- Both measured businesses reported `workerOnline=false` and `workerLastHeartbeatAt=null`.
- Worker healthcheck reported `onlineWorkers=0`, `workerInstances=0`, and `lastHeartbeatAt=null` for Meta scope.
- DB diagnostics showed no `sync_worker_heartbeats` rows, no active runner leases, and no leased partitions while queue persisted and benchmark stayed `stalled`.

Why higher-priority alternatives were not selected:

- `ready_or_busy`: not supported because both benchmarks ended `observedState=stalled` and drain state remained non-draining.
- `db_blocked`: not supported because blocked locks and long transactions were absent.
- `db_timeout_pressure`: not supported because diagnostics did not show timeout or connection-pressure evidence.
- `worker_restarting`: possible but not provable without host/container/log access.
- `worker_not_running`: possible but stricter than the direct evidence. The direct maintained truth only proves missing fresh heartbeat / lease presence.

# Secondary Classification Candidates

- `worker_not_running`
  - Supporting evidence:
    - zero worker heartbeat rows
    - zero active runner leases
    - healthcheck saw zero worker instances
  - Why secondary:
    - host/container/log access was unavailable, so absence versus rapid restart could not be proven directly.
- `backlog_present_no_active_leases`
  - Supporting evidence:
    - queue persisted for both businesses
    - no leases were acquired during the benchmark window
    - no terminal progress occurred
  - Why secondary:
    - the stronger first-order signal is that worker liveness itself is missing.
- `publish_stuck`
  - Supporting evidence:
    - `lastSuccessfulPublishAt=null`
    - verify commands remained `processing`
    - finalize SLA breaches remained open
  - Why secondary:
    - publish truth appears downstream of the missing worker/lease signal rather than as an independent primary bottleneck.

# Recommended Next Phase

`Phase 2A`

Reasoning:

- The strongest supported branch is worker liveness / deploy topology / heartbeat truth.
- The current maintained evidence does not support starting with DB tuning or lease fairness before the worker-presence signal is made truthful and durable.
