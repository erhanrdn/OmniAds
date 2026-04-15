# 1. Phase

- Data collection / incident evidence only.
- Captured on 2026-04-15.
- Runtime code changes made in this phase: none.
- Acceptance business used from the current hardening report: `TheSwaf` (`172d0ab8-495b-4679-a4c6-ffa404c389d3`).

# 2. Files Reviewed

- Mandatory full reads completed before runtime collection:
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
- Additional targeted code paths inspected after the required read:
  - `lib/meta-sync-benchmark.ts`
  - `lib/meta/integration-progress.ts`
  - `lib/meta/status-operations.ts`
  - `app/admin/sync-health/page.tsx`
  - `lib/sync/meta-sync.ts`
- Search terms inspected across the repo:
  - `workerOnline`
  - `heartbeat`
  - `leasedPartitions`
  - `queueDepth`
  - `progressEvidence`
  - `stallFingerprints`
  - `queue_waiting`
  - `progress_stale`
  - `lastCompletedAt`
  - `lastCheckpointAdvancedAt`
  - `lastReadyThroughAdvancedAt`
  - `dbBacklogState`

# 3. Git / Pipeline Truth

Observed:

- Local branch: `main`
- Local HEAD: `5df8a0d3352b49f545a31a27deae6282279d3389`
- Local worktree before editing this report: clean
- Relevant commits in local history:
  - `a125606fa8c27dc69d7d2227dcc14e5208626131` at `2026-04-15T01:12:50+03:00` — `P5: benchmark Meta sync and close release readiness`
  - `dbab28c122740723e82247950ae580215659cc0c` at `2026-04-15T06:28:42+03:00` — `P6: remediate Meta acceptance stall`
  - `5df8a0d3352b49f545a31a27deae6282279d3389` at `2026-04-15T07:00:32+03:00` — `hotfix: remediate Meta worker liveness`
- GitHub Actions runs found via the public GitHub Actions API for the same SHAs:
  - `a125606...`
    - CI success: run `24425518413` — <https://github.com/erhanrdn/OmniAds/actions/runs/24425518413>
    - Deploy success: run `24425724801` — <https://github.com/erhanrdn/OmniAds/actions/runs/24425724801>
  - `dbab28c...`
    - CI success: run `24434880474` — <https://github.com/erhanrdn/OmniAds/actions/runs/24434880474>
    - Deploy success: run `24435010636` — <https://github.com/erhanrdn/OmniAds/actions/runs/24435010636>
  - `5df8a0d...`
    - CI success: run `24435678054` — <https://github.com/erhanrdn/OmniAds/actions/runs/24435678054>
    - Deploy success: run `24435834776` — <https://github.com/erhanrdn/OmniAds/actions/runs/24435834776>
- Public web build info at both `https://adsecute.com/api/build-info` and `https://www.adsecute.com/api/build-info` returned:
  - `buildId=5df8a0d3352b49f545a31a27deae6282279d3389`
  - `nodeEnv=production`
- The GitHub combined-status API returned no legacy commit statuses for these SHAs, so Actions run data was used for CI/deploy truth instead.

Inference:

- The public web runtime is serving the hotfix SHA `5df8a0d...`.
- CI and deploy workflows succeeded for P5, P6, and the hotfix commit.

# 4. Runtime Access Available

Observed:

- `docker` and `docker compose` are not available in this environment; both commands failed with `command not found`.
- DB-backed maintained scripts did run successfully against live business data.
- Public web endpoints were reachable.
- No deployed-host shell access, SSH session, or runtime log stream was available from this environment.

Inference:

- Production-like control-plane / DB access is available.
- Host-level container/process/log access is not available.

# 5. Container / Process Evidence

Observed:

- `docker ps` could not be collected because `docker` is not installed in this environment.
- `docker compose ps` could not be collected for the same reason.
- No container uptime, restart count, health status, or actual running worker image digest could be read from the deployed host.
- Public web build info shows the live web runtime build ID is `5df8a0d...`.

Inference:

- Web deploy truth is available through public build-info.
- Worker container/process truth is not directly observable from this environment.

# 6. Worker Liveness Evidence

Observed:

- `node --import tsx scripts/sync-worker-healthcheck.ts --provider-scope meta --online-window-minutes 5 --min-online-workers 1` at approximately `2026-04-15T04:32Z` returned:
  - `pass=false`
  - `reason=insufficient_online_workers`
  - `onlineWorkers=0`
  - `workerInstances=0`
  - `lastHeartbeatAt=null`
  - `workers=[]`
- Direct `getProviderWorkerHealthState()` read for `meta` and `TheSwaf` returned:
  - `workerHealthy=false`
  - `runnerLeaseActive=false`
  - `hasFreshHeartbeat=false`
  - `matchedWorkerId=null`
  - `ownerWorkerId=null`
  - `lastHeartbeatAt=null`
  - `workerFreshnessState=null`
  - `consumeStage=null`
- `npm run meta:db:diagnostics -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/meta-db.json` at `2026-04-15T04:32:33.871Z` showed:
  - `leaseAndReclaim.activeRunnerLeases=[]`
  - `leaseAndReclaim.workerHeartbeats=[]`
  - `metaQueue.queueDepth=13`
  - `metaQueue.leasedPartitions=0`
  - `metaQueue.staleLeases=0`
  - `pgStatActivity.summary` only showed `omniads-web` connections
  - `longTransactions=[]`
  - `blockedLocks=[]`
- `npm run meta:readiness-snapshot -- --business ... --out /tmp/meta-readiness.json` at `2026-04-15T04:32:12.504Z` showed:
  - `operator.workerOnline=false`
  - `operator.workerLastHeartbeatAt=null`
  - `operator.dbConstraint=worker_unavailable`
  - `operator.dbBacklogState=stalled`
- `node --import tsx scripts/meta-terminal-running-runs-report.ts 172d0ab8-495b-4679-a4c6-ffa404c389d3` at `2026-04-15T04:32:33.736Z` returned empty `sampleRows`, empty `groupedByWorkerAndParentStatus`, and empty `latestRows`.

Inference:

- For the DB/control-plane this workspace can see, the Meta worker is not currently alive for this business and is not merely idle with a fresh heartbeat.
- The evidence supports `no_fresh_heartbeat`.
- The evidence does not distinguish between:
  - worker process absent
  - worker process exiting/restarting after deploy
  - worker process connected to a different DB/environment

# 7. Queue / Progress Evidence

Observed:

- `npm run meta:readiness-snapshot -- --business ... --out /tmp/meta-readiness.json` at `2026-04-15T04:32:12.504Z` showed:
  - `queueDepth=13`
  - `leasedPartitions=0`
  - `retryableFailedPartitions=0`
  - `deadLetterPartitions=0`
  - `staleLeasePartitions=0`
  - `pendingByLane={ maintenance: 8, extended: 5 }`
  - `pendingByScope={ account_daily: 8, ad_daily: 5 }`
  - `recentCore.percent=14`
  - `recentCore.readyThroughDate=2026-04-13`
  - `recentSelectedRangeTruth.state=processing`
  - `priorityWindowTruth.state=processing`
  - `syncState.lastCheckpointUpdatedAt=2026-04-14T11:57:01.100Z`
- `npm run meta:drain-rate -- --business ... --window-minutes 15 --out /tmp/meta-drain.json` at `2026-04-15T04:32:33.962Z` showed:
  - `queueDepth=13`
  - `leasedPartitions=0`
  - `completedLastWindow=0`
  - `createdLastWindow=2`
  - `reclaimedLastWindow=4`
  - `netDrainEstimate=-2`
  - `drainState=large_but_draining`
- Admin sync-health row for `TheSwaf` at `2026-04-15T04:49:02.986Z` showed:
  - `queueDepth=13`
  - `leasedPartitions=0`
  - `progressState=partial_stuck`
  - `activityState=stalled`
  - `progressEvidence.lastCheckpointAdvancedAt=2026-04-14T11:57:01.100Z`
  - `progressEvidence.lastReadyThroughAdvancedAt=2026-04-14T11:57:01.100Z`
  - `progressEvidence.lastCompletedAt=2026-04-14T11:57:01.100Z`
  - `checkpointLagMinutes=1012`
  - `stallFingerprints=[historical_starvation, worker_unavailable, checkpoint_not_advancing]`
  - `queuedVsLeasedVsPublished={ queued: 13, leased: 0, published: 0, retryableFailed: 0, deadLetter: 0, staleLeases: 0, repairBacklog: 6 }`
  - `lastSuccessfulPublishAt=null`
- `npm run meta:benchmark -- --business ... --samples 4 --interval-seconds 300 --window-minutes 15 --out /tmp/meta-benchmark.json` sampled from `2026-04-15T04:32:54.300Z` to `2026-04-15T04:47:54.681Z` and finished with:
  - `observedState=stalled`
  - `progressObserved=false`
  - `queueDepthDelta=0`
  - `leasedPartitionsDelta=0`
  - `terminalPartitionsDuringSample=0`
  - `createdPartitionsDuringSample=0`
  - `recentCoreCompletedDaysDelta=0`
  - `readyThroughAdvancements=[]`
  - `finalOperatorProgressState=partial_stuck`
  - `finalOperatorActivityState=stalled`
  - `finalDrainState=large_and_not_draining`

Inference:

- The evidence supports `backlog_present_no_active_leases`.
- The evidence supports "visible progress does not materially move" across a full 15-minute sample window.
- The single early `large_but_draining` drain-rate snapshot is explained by very recent reclaim/create activity before the benchmark window settled; the multi-sample benchmark ended in `large_and_not_draining` with zero movement.

# 8. Script Outputs

Observed:

- Saved maintained outputs:
  - `/tmp/meta-readiness.json`
  - `/tmp/meta-drain.json`
  - `/tmp/meta-benchmark.json`
  - `/tmp/meta-db.json`
  - `/tmp/meta-state-check.txt`
  - `/tmp/meta-publish-check.txt`
- `meta:state-check` at `2026-04-15T04:32:33.895Z` showed:
  - `queueComposition.summary={ historicalCoreQueued: 0, maintenanceQueued: 8, extendedRecentQueued: 3, extendedHistoricalQueued: 2 }`
  - `sourceManifestCounts.total=0`
  - `progression={ queued: 13, leased: 0, published: 0, retryableFailed: 0, repairBacklog: 6, deadLetters: 0, staleLeases: 0 }`
  - `lastSuccessfulPublishAt=null`
  - `d1FinalizeSla.totalAccounts=2`
  - `d1FinalizeSla.breachedAccounts=2`
  - breached accounts:
    - `act_822913786458311`
    - `act_921275999286619`
- `meta:verify-day` for both breached accounts on `2026-04-13` showed:
  - `sourceManifestState=missing`
  - `validationState=processing`
  - `verificationState=processing`
  - `detectorReasonCodes=[authoritative_retry_pending]`
  - `progression={ queued: 1, leased: 0, deadLetters: 0, staleLeases: 0, repairBacklog: 1 }`
  - `operatorGuidance.recommendation=refresh_state_then_reschedule`
- `meta:verify-publish` for both breached accounts on `2026-04-13` showed:
  - `publicationReady=false`
  - `activePublication=null`
  - `sourceManifestState=missing`
  - `goNoGo.passed=false`
  - `goNoGo.reasons` included:
    - `core publication pointer missing or not finalized_verified`
    - `detector: authoritative_retry_pending`

Inference:

- The evidence supports `publish_stuck` as a real downstream symptom for D-1 authoritative publish/finalize work.
- The publish/finalize backlog appears queued but not executing, not dead-lettered and not actively leased.

# 9. Log Evidence

Observed:

- Host/container runtime logs were not accessible from this environment.
- No `docker logs`, `docker compose logs`, systemd logs, or SSH-accessed runtime logs could be collected.
- The only directly reachable runtime-adjacent evidence was:
  - worker health DB rows
  - queue/checkpoint/control tables via maintained scripts
  - public web build-info

Inference:

- There is insufficient access in this environment to prove:
  - worker startup messages
  - repeated worker restarts
  - lease-acquisition attempts in live logs
  - publish/completion log lines
  - runtime DB timeout/lock errors outside control-table evidence

# 10. Root Cause Candidates Ranked

1. `no_fresh_heartbeat` plus `backlog_present_no_active_leases`
   - Supporting observed evidence:
     - worker healthcheck: `onlineWorkers=0`, `workerInstances=0`, `lastHeartbeatAt=null`
     - business worker state: `workerHealthy=false`, `hasFreshHeartbeat=false`, `matchedWorkerId=null`, `runnerLeaseActive=false`
     - DB diagnostics: `workerHeartbeats=[]`, `activeRunnerLeases=[]`
     - queue backlog present: `queueDepth=13`, `leasedPartitions=0`
     - 15-minute benchmark: `queueDepthDelta=0`, `leasedPartitionsDelta=0`, `progressObserved=false`
   - Inference:
     - The current live blocker is absence of a fresh worker heartbeat and absence of active leasing in the DB the maintained scripts are reading.

2. `publish_stuck`
   - Supporting observed evidence:
     - `d1FinalizeSla.breachedAccounts=2`
     - both breached accounts show `sourceManifestState=missing`
     - both show `verificationState=processing`
     - both show `publicationReady=false`
     - both show `queued=1`, `leased=0`, `repairBacklog=1`
     - authoritative progression remains `published=0`
     - `lastSuccessfulPublishAt=null`
   - Inference:
     - Authoritative publish/finalize work is not completing for the acceptance business.
     - This looks downstream of the worker/lease failure, not independent proof of a separate publication-only defect.

3. `worker_not_running` or `worker_restarting` after deploy, or the worker is pointed at the wrong runtime/DB
   - Supporting observed evidence:
     - the hotfix deploy workflow succeeded
     - the public web runtime is already on the hotfix SHA
     - current DB evidence still shows zero worker heartbeat rows and zero worker instances
     - `sync_worker_heartbeats` has `liveRows=0` in DB diagnostics
   - Inference:
     - Because the deploy workflow includes a worker healthcheck that queries DB-backed heartbeat truth, the combination of deploy success and current zero-row heartbeat state suggests one of these:
       - the worker came up and then died/restarted after deploy
       - the deploy/healthcheck observed a different DB/runtime than the one the maintained scripts are now reading
       - the worker service was restored only transiently
     - This is an inference, not a verified fact, because host/container access is missing.

Current classification supported by collected evidence:

- `no_fresh_heartbeat`
- `backlog_present_no_active_leases`
- `publish_stuck`

Current classification not supported by collected evidence:

- `db_blocked`
- `db_timeout_pressure`
- `heartbeat_misclassified`
- `worker_alive_no_eligible_work`
- `ui_truth_wrong`

# 11. Confidence Level Per Candidate

- Candidate 1: High
  - Multiple independent maintained readers agree: worker heartbeat absent, no active lease, backlog present, no progress over time.
- Candidate 2: Medium
  - Publish/finalize symptoms are directly observed, but they likely depend on Candidate 1.
- Candidate 3: Low to medium
  - The deploy-success versus zero-heartbeat discrepancy is real, but the exact explanation needs host/container verification.

# 12. Gaps / Missing Access

- No host-level Docker access:
  - could not collect `docker ps`
  - could not collect `docker compose ps`
  - could not collect restart counts, health states, or image digests for the actual running worker container
- No runtime log access:
  - could not collect worker startup / heartbeat / lease-acquisition / publish log snippets
  - could not collect web/admin logs from the deployed host
- No direct host shell / SSH session:
  - could not verify whether the worker service is running but pointed at a different DB
  - could not verify whether the worker is crash-looping after a passing healthcheck

# 13. Recommended Next Action

- Follow-up remediation should target `worker runtime` first, with explicit `deploy topology` checks second.
- Recommended follow-up prompt scope:
  - verify the deployed `worker` service/process on the real host
  - verify the worker and the healthcheck are pointed at the same DB/environment the maintained scripts are reading
  - collect host-level worker logs around startup, heartbeat publication, and lease acquisition
  - only after worker/runtime topology is verified, re-run the exact maintained evidence set on `TheSwaf`
- Do not start with DB tuning, heartbeat-classification changes, or UI redesign:
  - current evidence does not support `db_blocked`, `db_timeout_pressure`, or `ui_truth_wrong`
  - the queue/card symptom still matches backend truth: backlog exists, no active lease is visible, and progress does not move
