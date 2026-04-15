# Phase

Post-fix truth recapture.

# Files Reviewed

- `docs/meta-sync-hardening/runtime-remediation.md`
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
- Local HEAD at capture time: `36eedad2586b2dac38437bf0385e175426907cec`
- Relevant commits now in play:
  - `a125606` `P5: benchmark Meta sync and close release readiness`
  - `dbab28c` `P6: remediate Meta acceptance stall`
  - `5df8a0d` `hotfix: remediate Meta worker liveness`
  - `f05bda5` `evidence: recapture post-hotfix Meta truth`
  - `36eedad` `fix(runtime): harden Meta worker liveness topology`
- GitHub Actions truth observed through the public Actions API:
  - `f05bda5...`: CI `success`; no deploy run observed
  - `36eedad...`: CI `success`; deploy `success`
- Public runtime build info from `https://adsecute.com/api/build-info` and `https://www.adsecute.com/api/build-info` now reports deployed build `36eedad2586b2dac38437bf0385e175426907cec`.

Inference:

- The runtime-affecting Phase 2A SHA was actually published and deployed to the public runtime before this recapture began.

# Runtime Access Available

Observation:

- Public runtime identity access was available through `build-info`.
- DB-backed maintained scripts were available and returned live business truth.
- Direct host/container tooling was still unavailable from this workspace:
  - `docker ps` unavailable locally
  - `docker compose ps` unavailable locally
- Direct host log access remained unavailable.

Inference:

- This recapture verifies the deployed SHA through public build identity plus maintained scripts, not through direct host/container inspection.

# Businesses Measured

Observation:

- Acceptance business measured: `TheSwaf` (`172d0ab8-495b-4679-a4c6-ffa404c389d3`)
- Comparison business measured: `Grandmix` (`5dbc7147-f051-4681-a4d6-20617170074f`)
- `IwaStore` was not re-run in the post-fix recapture because `Grandmix` remained a sufficient materially different comparison business.

Inference:

- Two real businesses were fully re-measured after deployment.

# Container / Process Evidence

Observation:

- Direct container uptime / restart counts were still unavailable from this environment.
- The runtime-affecting deploy workflow for `36eedad...` completed `success`.
- Public build identity moved from `5df8a0d...` to `36eedad...`.
- Post-deploy local worker healthcheck from this workspace still reported:
  - `pass=false`
  - `reason=insufficient_online_workers`
  - `summary.onlineWorkers=0`
  - `summary.workerInstances=0`
  - `summary.lastHeartbeatAt=null`

Inference:

- The deployment completed on the target host, but the maintained external liveness surfaces available from this workspace still could not observe an online Meta worker after deployment.
- Because the deployed workflow now requires a fresh Meta heartbeat after worker health before deploy can pass, the post-deploy absence seen here indicates a runtime-truth mismatch that the current workspace cannot disambiguate further without host access.

# Worker Liveness Evidence

Observation:

- `TheSwaf` post-fix readiness snapshot reported:
  - `workerOnline=false`
  - `workerLastHeartbeatAt=null`
  - `queue.leasedPartitions=0`
  - `stallFingerprints` included `worker_unavailable`
- `Grandmix` post-fix readiness snapshot reported the same worker-liveness pattern:
  - `workerOnline=false`
  - `workerLastHeartbeatAt=null`
  - `queue.leasedPartitions=0`
  - `stallFingerprints` included `worker_unavailable`
- Post-fix DB diagnostics for both businesses reported:
  - `leaseAndReclaim.activeRunnerLeases=[]`
  - `leaseAndReclaim.workerHeartbeats=[]`
  - `sync_worker_heartbeats` live rows `0`
  - `sync_runner_leases` live rows `0`
- Post-fix worker healthcheck still reported zero online workers for Meta scope.

Inference:

- Maintained post-deploy truth still shows no fresh heartbeat and no active lease ownership.
- This is now in tension with the successful deployment gate, which should have required a fresh Meta heartbeat on the deployment host.

# Queue / Progress Evidence

Observation:

- `TheSwaf` post-fix:
  - `queueDepth=13`
  - `pendingByLane={maintenance:8, extended:5}`
  - `pendingByScope={account_daily:8, ad_daily:5}`
  - `retryableFailedPartitions=0`
  - `deadLetterPartitions=0`
  - `lastSuccessfulPublishAt=null`
  - `recent core readiness=14%`
  - `recent truth state=processing`
  - `priority-window truth state=processing`
  - `progressState=partial_stuck`
  - `activityState=stalled`
  - `stallFingerprints=[historical_starvation, worker_unavailable, checkpoint_not_advancing]`
  - drain summary `drainState=large_and_not_draining`, `netDrainEstimate=0`
  - benchmark summary:
    - `observedState=stalled`
    - `progressObserved=false`
    - `queueDepthDelta=0`
    - `leasedPartitionsDelta=0`
    - `terminalPartitionsDuringSample=0`
- `Grandmix` post-fix:
  - `queueDepth=2`
  - `pendingByLane={maintenance:2}`
  - `pendingByScope={account_daily:2}`
  - `retryableFailedPartitions=0`
  - `deadLetterPartitions=0`
  - `lastSuccessfulPublishAt=null`
  - `recent core readiness=14%`
  - `recent truth state=processing`
  - `priority-window truth state=processing`
  - `progressState=partial_stuck`
  - `activityState=stalled`
  - `stallFingerprints=[historical_starvation, worker_unavailable, checkpoint_not_advancing]`
  - drain summary `drainState=large_and_not_draining`, `netDrainEstimate=0`
  - benchmark summary:
    - `observedState=stalled`
    - `progressObserved=false`
    - `queueDepthDelta=0`
    - `leasedPartitionsDelta=0`
    - `terminalPartitionsDuringSample=0`

Inference:

- The post-fix deployment did not produce measurable queue drain or checkpoint/publish advancement for either measured business.
- The acceptance business `TheSwaf` remains stalled in the same operational shape as before the remediation branch.

# Script Outputs

Observation:

- Post-fix maintained commands executed for `TheSwaf`:
  - `meta:readiness-snapshot`
  - `meta:drain-rate`
  - `meta:benchmark`
  - `meta:db:diagnostics`
  - `meta:state-check`
  - `meta:verify-day` for:
    - `act_822913786458311` / `2026-04-14`
    - `act_921275999286619` / `2026-04-14`
  - `meta:verify-publish` for the same two account/day pairs
- Post-fix maintained commands executed for `Grandmix`:
  - `meta:readiness-snapshot`
  - `meta:drain-rate`
  - `meta:benchmark`
  - `meta:db:diagnostics`
  - `meta:state-check`
  - `meta:verify-day` for `act_805150454596350` / `2026-04-13`
  - `meta:verify-publish` for the same account/day pair
- Post-fix `TheSwaf` verify outputs still showed:
  - `sourceManifestState=missing`
  - `verificationState=processing`
  - `detectorReasonCodes=[authoritative_retry_pending]`
  - `publicationReady=false`
  - `activePublication=null`
  - publish go/no-go remained failed
- Post-fix `Grandmix` verify outputs showed the same qualitative pattern.

Inference:

- The maintained script layer still describes a non-draining stalled system after deployment, not a recovered or merely busy system.
- Publish/finalization remains blocked downstream, but the lack of fresh worker/lease truth is still upstream of the observed user-facing stall.

# Log Evidence

Observation:

- Direct runtime log access was still unavailable from this environment.
- Deploy workflow status was visible, but deploy log bodies were not accessible from this workspace.

Inference:

- There is still no direct host log evidence in this phase.

# Primary Classification

`mixed_runtime_issue`

Evidence supporting primary classification:

- The runtime-affecting deploy for `36eedad...` completed `success` and public build identity moved to that SHA.
- That deployed workflow now requires a fresh Meta heartbeat after worker health before the deploy step can pass.
- Despite that, post-deploy maintained scripts still showed `workerOnline=false`, `workerLastHeartbeatAt=null`, zero worker heartbeat rows, zero active runner leases, and benchmark `observedState=stalled` for both measured businesses.

Why this was selected over nearby alternatives:

- `no_fresh_heartbeat` is still directly supported by the maintained scripts, but it no longer captures the deploy-time success versus post-deploy absence mismatch.
- `worker_restarting` remains plausible but not provable without host/container/log access.
- `worker_not_running` remains plausible from the maintained surfaces, but the successful deploy-time heartbeat gate means outright absence is not the only supported explanation.

# Secondary Classification Candidates

- `no_fresh_heartbeat`
  - Supporting evidence:
    - post-deploy worker healthcheck still reported zero online workers
    - readiness snapshots still showed `workerOnline=false`
    - DB diagnostics still showed no worker heartbeat rows and no active runner leases
  - Why secondary:
    - it does not explain the successful deploy-time heartbeat verification.
- `worker_restarting`
  - Supporting evidence:
    - deploy-time heartbeat could have occurred and then disappeared before recapture
    - no maintained external heartbeat remained visible afterward
  - Why secondary:
    - restart behavior cannot be proven without host/container/log access.
- `worker_not_running`
  - Supporting evidence:
    - external maintained truth surfaces still show no active worker presence
  - Why secondary:
    - successful deploy-time heartbeat verification makes this too strict as the single best label.

# Recommended Next Phase

`Phase 3`

Reasoning:

- Under the single-pass recovery plan, the next step is acceptance closure with an honest market-readiness verdict rather than opening a second remediation branch.
- The post-fix recapture is sufficient to show that the system is still not passing acceptance.
