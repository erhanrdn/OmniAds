# Phase

Acceptance closure / market-readiness verdict.

# Files Reviewed

- `docs/meta-sync-hardening/runtime-remediation.md`
- `docs/meta-sync-hardening/incident-evidence.md`
- `docs/meta-sync-hardening/report.md`
- `docs/meta-sync-hardening/release-acceptance.md`
- `docs/meta-sync-hardening/postgres-runbook.md`
- `app/api/meta/status/route.ts`
- `app/api/admin/sync-health/route.ts`
- `lib/admin-operations-health.ts`
- `lib/sync/provider-status-truth.ts`
- `scripts/meta-sync-readiness-snapshot.ts`
- `scripts/meta-sync-drain-rate.ts`
- `scripts/meta-sync-benchmark.ts`
- `scripts/meta-sync-db-diagnostics.ts`
- `scripts/meta-state-check.ts`
- `scripts/sync-hardening-acceptance.ts`

# Businesses Tested

- `TheSwaf` (`172d0ab8-495b-4679-a4c6-ffa404c389d3`)
- `Grandmix` (`5dbc7147-f051-4681-a4d6-20617170074f`)
- `IwaStore` (`f8a3b5ac-588c-462f-8702-11cd24ff3cd2`)

# Final Evidence Matrix

| Business | Benchmark observedState | Drain state | Queue depth | Worker online | Active leases | Recent core | Truth state | D-1 finalize breaches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TheSwaf | `stalled` | `large_and_not_draining` | `13` | `false` | `0` | `14%` | `processing` | `2/2` |
| Grandmix | `stalled` | `large_and_not_draining` | `2` | `false` | `0` | `14%` | `processing` | `1/1` |
| IwaStore | `stalled` | `large_and_not_draining` | `2` | `false` | `0` | `14%` | `processing` | `1/1` |

Supporting observations:

- All three final benchmarks ended with:
  - `progressObserved=false`
  - `queueDepthDelta=0`
  - `leasedPartitionsDelta=0`
  - `terminalPartitionsDuringSample=0`
- All three final readiness snapshots showed:
  - `activityState=stalled`
  - `progressState=partial_stuck`
  - `stallFingerprints` including `worker_unavailable`
  - `lastSuccessfulPublishAt=null`
- All three final DB diagnostics showed:
  - `activeRunnerLeases=[]`
  - `workerHeartbeats=[]`
  - `sync_worker_heartbeats` live rows `0`
  - `blockedLocks=[]`
  - `longTransactions=[]`
- Final verify outputs remained nonterminal:
  - `sourceManifestState=missing`
  - `verificationState=processing`
  - `publicationReady=false`
  - publish go/no-go failed with missing finalized publication pointers plus `authoritative_retry_pending`
- Public runtime identity still served deployed runtime SHA `36eedad2586b2dac38437bf0385e175426907cec` during this closure phase, while the docs-only closure work remained on later local `main`.

# Market-Readiness Verdict

`blocked_by_external_runtime_issue`

Why:

- Release acceptance requires benchmark `ready` or `busy`; every tested business remained `stalled`.
- Release acceptance requires drain state `clear` or `large_but_draining`; every tested business remained `large_and_not_draining`.
- Operator truth did not contradict the maintained scripts. It also reported `worker_unavailable`, stalled activity, zero active leases, and non-advancing publish/checkpoint truth.
- TheSwaf, the mandatory acceptance business, still fails the acceptance bar on every required axis.

# Remaining Blockers

- Primary blocker:
  - deployed runtime still does not produce sustained externally visible Meta worker liveness or queue drain
- Evidence:
  - final benchmarks stayed `stalled`
  - final worker truth stayed `workerOnline=false` with no heartbeat rows and no active leases
  - final publish verification remained blocked with missing source manifests / publication pointers
- Repo-owned vs external assessment:
  - The latest runtime-affecting SHA `36eedad...` deployed successfully and public build info moved to that SHA.
  - That deployed workflow now requires a fresh Meta heartbeat after worker health before the deploy step can pass.
  - Post-deploy maintained truth still shows no sustained heartbeat or drain.
  - Based on the available evidence, the unresolved blocker is presently best classified as an external runtime / host-side issue or inaccessible deployment-side mismatch rather than a newly demonstrated repo-owned code regression.
- Residual risk:
  - without host/container/log access, a fast post-deploy worker crash or other host/runtime behavior cannot be ruled out more precisely.

# Repo-Owned Changes This Phase

- None.
- Operator truth already honestly described the failure as stalled / worker unavailable, so no additional runtime or script patch was applied in the closure phase.

# Test Commands Run

- `npm run meta:readiness-snapshot -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/theswaf-final-readiness.json`
- `npm run meta:drain-rate -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --window-minutes 15 --out /tmp/theswaf-final-drain.json`
- `npm run meta:benchmark -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --samples 4 --interval-seconds 300 --window-minutes 15 --out /tmp/theswaf-final-benchmark.json`
- `npm run meta:db:diagnostics -- --business 172d0ab8-495b-4679-a4c6-ffa404c389d3 --out /tmp/theswaf-final-db.json`
- `npm run meta:state-check -- 172d0ab8-495b-4679-a4c6-ffa404c389d3`
- `npm run meta:verify-day -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_822913786458311 2026-04-14`
- `npm run meta:verify-day -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_921275999286619 2026-04-14`
- `npm run meta:verify-publish -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_822913786458311 2026-04-14`
- `npm run meta:verify-publish -- 172d0ab8-495b-4679-a4c6-ffa404c389d3 act_921275999286619 2026-04-14`
- `npm run meta:readiness-snapshot -- --business 5dbc7147-f051-4681-a4d6-20617170074f --out /tmp/grandmix-final-readiness.json`
- `npm run meta:drain-rate -- --business 5dbc7147-f051-4681-a4d6-20617170074f --window-minutes 15 --out /tmp/grandmix-final-drain.json`
- `npm run meta:benchmark -- --business 5dbc7147-f051-4681-a4d6-20617170074f --samples 4 --interval-seconds 300 --window-minutes 15 --out /tmp/grandmix-final-benchmark.json`
- `npm run meta:db:diagnostics -- --business 5dbc7147-f051-4681-a4d6-20617170074f --out /tmp/grandmix-final-db.json`
- `npm run meta:state-check -- 5dbc7147-f051-4681-a4d6-20617170074f`
- `npm run meta:verify-day -- 5dbc7147-f051-4681-a4d6-20617170074f act_805150454596350 2026-04-13`
- `npm run meta:verify-publish -- 5dbc7147-f051-4681-a4d6-20617170074f act_805150454596350 2026-04-13`
- `npm run meta:readiness-snapshot -- --business f8a3b5ac-588c-462f-8702-11cd24ff3cd2 --out /tmp/iwastore-final-readiness.json`
- `npm run meta:drain-rate -- --business f8a3b5ac-588c-462f-8702-11cd24ff3cd2 --window-minutes 15 --out /tmp/iwastore-final-drain.json`
- `npm run meta:benchmark -- --business f8a3b5ac-588c-462f-8702-11cd24ff3cd2 --samples 4 --interval-seconds 300 --window-minutes 15 --out /tmp/iwastore-final-benchmark.json`
- `npm run meta:db:diagnostics -- --business f8a3b5ac-588c-462f-8702-11cd24ff3cd2 --out /tmp/iwastore-final-db.json`
- `npm run meta:state-check -- f8a3b5ac-588c-462f-8702-11cd24ff3cd2`
- `npm run meta:verify-day -- f8a3b5ac-588c-462f-8702-11cd24ff3cd2 act_1087566732415606 2026-04-13`
- `npm run meta:verify-publish -- f8a3b5ac-588c-462f-8702-11cd24ff3cd2 act_1087566732415606 2026-04-13`

# Test Results

- All maintained closure commands completed successfully.
- Per-business benchmark result:
  - `TheSwaf`: `stalled`
  - `Grandmix`: `stalled`
  - `IwaStore`: `stalled`
- Per-business drain result:
  - `TheSwaf`: `large_and_not_draining`
  - `Grandmix`: `large_and_not_draining`
  - `IwaStore`: `large_and_not_draining`
- The post-fix recapture docs-only CI run completed `success`, with:
  - `publish-images`: `skipped`
  - `dispatch-deploy`: `skipped`
  - public build remaining on deployed runtime SHA `36eedad...`

# Recommended Operating Posture

- Do not market Meta sync as release-ready.
- Treat the current state as a blocked runtime incident, not a soft slowdown.
- Use host/container/log access on the deployed environment as the next operator step to determine why deploy-time worker heartbeat proof does not persist into externally visible runtime truth.
