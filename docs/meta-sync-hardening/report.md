# 1. Phase

P6: remediate Meta acceptance stall

This phase did not find a repo-owned queue or Postgres bottleneck that explains the live acceptance stall. The live acceptance business remained stalled because the separately deployed Meta worker runtime was not visible at all for that business: no `sync_worker_heartbeats`, no active `sync_runner_leases`, no terminal drain, and no authoritative publish progress. The repo-owned fix in this phase is stronger business-specific worker truth, explicit `worker_unavailable` classification, and clearer operator remediation for the external worker-runtime failure mode.

# 2. Files Reviewed

- Docs and release context: `docs/meta-sync-hardening/report.md`, `docs/meta-sync-hardening/release-acceptance.md`, `docs/meta-sync-hardening/postgres-runbook.md`, `README.md`
- Meta runtime and status truth: `lib/sync/meta-sync.ts`, `lib/sync/provider-status-truth.ts`, `lib/sync/provider-worker-adapters.ts`, `lib/sync/worker-runtime.ts`, `lib/sync/worker-health.ts`, `lib/meta/status-types.ts`, `lib/meta/status-operations.ts`, `app/api/meta/status/route.ts`, `components/meta/meta-sync-progress.tsx`
- Admin health and diagnostics: `lib/admin-operations-health.ts`, `lib/admin-db-diagnostics.ts`, `app/api/admin/sync-health/route.ts`, `app/admin/sync-health/page.tsx`, `lib/db.ts`, `lib/startup-diagnostics.ts`
- Operational scripts: `scripts/_operational-runtime.ts`, `scripts/sync-worker.ts`, `scripts/sync-worker-healthcheck.ts`, `scripts/meta-sync-readiness-snapshot.ts`, `scripts/meta-sync-drain-rate.ts`, `scripts/meta-sync-benchmark.ts`, `scripts/meta-sync-db-diagnostics.ts`, `scripts/meta-state-check.ts`, `scripts/meta-terminal-running-runs-report.ts`, `scripts/sync-hardening-acceptance.ts`
- Supporting runtime and deploy topology: `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`, `.github/workflows/ci.yml`, `.github/workflows/deploy-hetzner.yml`
- Tests read completely before edits: `lib/sync/meta-sync.test.ts`, `lib/sync/provider-status-truth.test.ts`, `lib/sync/provider-worker-adapters.test.ts`, `lib/admin-operations-health.test.ts`, `app/api/meta/status/route.test.ts`, `lib/sync/meta-sync-lease-epoch.test.ts`, `lib/sync/meta-sync-scheduled-work.test.ts`, `lib/meta-sync-benchmark.test.ts`, `lib/db.test.ts`, `lib/admin-db-diagnostics.test.ts`, `lib/sync/worker-health.test.ts`

# 3. Recent Relevant Commits Reviewed

- `a125606` `P5: benchmark Meta sync and close release readiness`
- `0dd5fed` `fixup(P4): finalize report closure`
- `1c1a462` `P4: harden self-hosted Postgres path`
- `204ce94` `P3: harden Meta sync throughput`
- `a6ff37e` `P2: add compact Meta UI summary contract`
- `5f89deb` `feat: add Meta integration progress components and tests`
- `071af76` `docs(meta): add comprehensive report on Meta sync architecture and improvement phases`
- `f98fbcb` `fix(meta): resolve live sync bottleneck holding readiness near zero`
- `c1d455f` `fix(ops): tighten live sync verification findings`
- `dcfc4d1` `Optimize production logging and retention`
- `a7210a4` `feat(dev): automate local postgres and incremental subset sync`
- `73886da` `feat(dev): add local business subset sync`

# 4. Live Acceptance Evidence

- Live access was available in this Codex environment. The acceptance business from the existing report was `TheSwaf` (`172d0ab8-495b-4679-a4c6-ffa404c389d3`).
- Pre-fix live readiness snapshot at `2026-04-15T03:01:02.674Z` showed `progressState=partial_stuck`, `activityState=stalled`, `queueDepth=11`, `leasedPartitions=0`, `workerOnline=false`, `workerLastHeartbeatAt=null`, `stallFingerprints=[historical_starvation, checkpoint_not_advancing]`, `dbBacklogState=stalled`, and no `lastSuccessfulPublishAt`.
- Pre-fix drain-rate at `2026-04-15T03:01:02.685Z` showed `drainState=large_and_not_draining`, `completedLastWindow=0`, `createdLastWindow=0`, `reclaimedLastWindow=0`, and `netDrainEstimate=0`.
- Pre-fix DB diagnostics at `2026-04-15T03:01:02.573Z` showed no active runner leases, no worker heartbeats, no blocked locks, no long transactions, and no worker DB diagnostics. The database did not present a blocking lock or saturation signature for the acceptance business.
- Authoritative fallback checks showed the business was not blocked by dead letters or publication mismatch. `meta:state-check` and `meta:verify-day`/`meta:verify-publish` for both breached accounts on `2026-04-13` reported `sourceManifestState=missing`, `verificationState=processing`, detector reason `authoritative_retry_pending`, `repairBacklog=1` per account, and operator guidance `refresh_state_then_reschedule`.
- Post-fix readiness snapshot at `2026-04-15T03:11:50.589Z` still showed the same live backlog, but now classified it more explicitly: `stallFingerprints=[historical_starvation, worker_unavailable, checkpoint_not_advancing]`, `workerOnline=false`, `workerLastHeartbeatAt=null`, and `dbConstraint=worker_unavailable`.
- Post-fix drain-rate at `2026-04-15T03:11:50.604Z` was unchanged: `queueDepth=11`, `leasedPartitions=0`, `netDrainEstimate=0`, `drainState=large_and_not_draining`.
- Post-fix state-check at `2026-04-15T03:12:02.990Z` still showed zero source manifests, zero publishes, `repairBacklog=4`, `d1FinalizeSla.breachedAccounts=2`, and no active partitions beyond queued work.
- Post-fix benchmark series (`4` samples, `300` second interval) ran from `2026-04-15T03:12:03.056Z` to `2026-04-15T03:27:03.498Z` and finished with `observedState=stalled`, `progressObserved=false`, `queueDepthDelta=0`, `leasedPartitionsDelta=0`, `terminalPartitionsDuringSample=0`, `createdPartitionsDuringSample=0`, `finalOperatorProgressState=partial_stuck`, `finalOperatorActivityState=stalled`, and `finalDrainState=large_and_not_draining`.

# 5. Root Cause Classification

- Primary remaining blocker: external worker-runtime / host-operations failure. The live acceptance business has queued Meta work but no visible worker heartbeat and no active runner lease, so the business is not actually being worked.
- Repo-owned truth gap fixed in this phase: business-specific worker classification previously allowed unrelated provider worker summary to leak into business-level truth, and the DB/benchmark path could stop at `unknown` instead of stating that the worker was unavailable.
- Evidence against a repo-owned DB/index bottleneck: no blocked locks, no long-running transactions, no dead letters, no stale leases, no active runner leases, and no worker heartbeat diagnostics at all.
- Evidence against a repo-owned “web-only deploy” bug: the repo already defines and deploys a dedicated worker image and service. The missing signal is not “the code forgot the worker runtime”; it is “the current host/runtime is not delivering a live worker for this business.”

# 6. Files Changed

- `lib/sync/worker-health.ts`: stopped falling back to unrelated workers for business matching and added business-specific worker observation helpers.
- `lib/sync/worker-health.test.ts`: added regression coverage for the no-unrelated-worker fallback rule.
- `lib/sync/provider-status-truth.ts`: added `worker_unavailable` as an existing stall-fingerprint extension.
- `lib/sync/provider-status-truth.test.ts`: added fingerprint coverage for the worker-unavailable stall path.
- `lib/admin-operations-health.ts`: threaded business-matched Meta worker truth into per-business health rows and sharpened queue-waiting-worker detail.
- `lib/admin-operations-health.test.ts`: added coverage that a globally online but unrelated Meta worker does not make the stalled business look healthy.
- `lib/admin-db-diagnostics.ts`: added `worker_unavailable` as an explicit primary constraint when stalled backlog has no matched worker heartbeat or lease.
- `lib/admin-db-diagnostics.test.ts`: added coverage for the new `worker_unavailable` DB primary constraint.
- `lib/meta-sync-benchmark.ts`: switched benchmark operator worker fields from global summary truth to business-specific worker truth.
- `app/api/meta/status/route.ts`: passed worker health into stall-fingerprint derivation so the public Meta status contract can surface `worker_unavailable`.
- `app/admin/sync-health/page.tsx`: exposed business-matched worker heartbeat/worker/stage details and the new `worker unavailable` signal on the admin surface.
- `docs/meta-sync-hardening/release-acceptance.md`: codified `worker_unavailable` acceptance handling and the separate worker-runtime expectation.
- `docs/meta-sync-hardening/postgres-runbook.md`: clarified that backlog with no worker heartbeat or lease is a worker-runtime availability issue before Postgres tuning.

# 7. Runtime / Deploy Findings

- `Dockerfile` already defines both `web-runner` and `worker-runner` images. The worker path is repo-owned and distinct from the web path.
- `docker-compose.yml` already defines a dedicated `worker` service alongside `web` and `migrate`, and the worker service runs with `SYNC_WORKER_MODE=1`.
- The worker service healthcheck already uses `scripts/sync-worker-healthcheck.ts` to require live worker evidence.
- `.github/workflows/ci.yml` already builds and publishes both web and worker images for runtime-affecting changes.
- `.github/workflows/deploy-hetzner.yml` already pulls both exact-SHA images, recreates both services, verifies exact image SHAs, and waits for the worker healthcheck when available.
- Conclusion: this phase did not find a repo-owned omission where the deployed runtime only starts the web process. The live no-heartbeat/no-lease state is consistent with the separate worker runtime being absent, failing, or not attached to the current host environment, not with the repo failing to define that runtime.

# 8. Operator Truth Improvements

- Business-level worker truth is now matched to the business instead of falling back to the newest unrelated worker heartbeat row.
- Stalled backlog with no matched worker heartbeat or lease now surfaces `worker_unavailable` as a stall fingerprint and as the DB diagnostics primary constraint.
- `meta-sync-benchmark` now reports business-specific `workerOnline` and `workerLastHeartbeatAt`, so acceptance output no longer depends on provider-global worker summary.
- `/admin/sync-health` now shows business-matched worker heartbeat time, worker id, and consume stage on the Meta business row, plus a `Worker unavailable` signal when the queue is stalled without a matched worker.
- The release-acceptance and Postgres runbook docs now state plainly that Meta requires the separate worker runtime and that backlog plus no matched heartbeat/lease is a worker-service remediation path, not proof of hidden progress.

# 9. Test Commands Run

- `npx vitest run lib/sync/worker-health.test.ts`
- `npx vitest run lib/sync/provider-status-truth.test.ts`
- `npx vitest run lib/admin-db-diagnostics.test.ts`
- `npx vitest run lib/admin-operations-health.test.ts`
- `npx vitest run app/api/meta/status/route.test.ts`
- `npx vitest run lib/sync/meta-sync.test.ts lib/sync/provider-worker-adapters.test.ts lib/sync/meta-sync-lease-epoch.test.ts lib/sync/meta-sync-scheduled-work.test.ts`
- `npx vitest run lib/meta-sync-benchmark.test.ts lib/db.test.ts lib/admin-db-diagnostics.test.ts lib/admin-operations-health.test.ts lib/sync/provider-status-truth.test.ts lib/sync/worker-health.test.ts`
- `npx tsc --noEmit`
- `npm run meta:readiness-snapshot -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/meta-readiness.json`
- `npm run meta:drain-rate -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --window-minutes 15 --out /tmp/meta-drain.json`
- `npm run meta:db:diagnostics -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/meta-db.json`
- `npm run meta:state-check -- 172d0ab8-495b-4679-a4c6-ffa404c389d3`
- `npm run meta:verify-day -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_822913786458311 2026-04-13`
- `npm run meta:verify-day -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_921275999286619 2026-04-13`
- `npm run meta:verify-publish -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_822913786458311 2026-04-13`
- `npm run meta:verify-publish -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_921275999286619 2026-04-13`
- `npm run meta:benchmark -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --samples 4 --interval-seconds 300 --window-minutes 15 --out /tmp/meta-benchmark.json`

# 10. Test Results

- All touched-area and broader sync/admin test suites listed above passed.
- `npx tsc --noEmit` passed.
- Live acceptance evidence was re-captured successfully in this environment.
- The business remained stalled after the repo fix, but the patched outputs now classify the stall explicitly as worker unavailability rather than leaving the operator with only a generic non-draining backlog.
- No repo-owned code path change in this phase drained the live backlog because the remaining blocker is outside the repo-owned scheduler logic and inside the external worker-runtime availability path.

# 11. Remaining Risks

- The live acceptance business is still not market-ready. It remains stalled until the external worker runtime is restored and begins emitting heartbeats and leasing partitions.
- The repo cannot heal a missing Hetzner worker service by itself. This phase improves proof and remediation guidance, not host orchestration outside the repository.
- `pg_stat_statements` is still disabled in the live environment, which reduces DB forensics depth, though it is not the primary blocker in this incident.
- If a future environment again runs only the web runtime or loses worker DB connectivity, the business will still stall; this phase makes that truth explicit, but it does not remove the need for host-level worker reliability.

# 12. Recommended Next Steps

- Restore the deployed Meta worker runtime for the current environment first. Confirm the `worker` service/container is running the exact release SHA, passes `scripts/sync-worker-healthcheck.ts`, and writes fresh rows into `sync_worker_heartbeats`.
- Once a live worker heartbeat is present, rerun the same maintained acceptance command set on `TheSwaf` and require the benchmark to move from `stalled` to `busy` or `ready` before making any market-facing claim.
- If heartbeat returns but the business still shows `leasedPartitions=0`, use the new business-specific worker truth in `/admin/sync-health`, `meta:state-check`, `meta:verify-day`, and `meta:verify-publish` to distinguish lease denial from publish lag before changing queue state.
- Treat Postgres tuning as secondary for this incident. Only move into `docs/meta-sync-hardening/postgres-runbook.md` knob changes after the worker runtime is visibly back and the primary constraint stops reading `worker_unavailable`.
