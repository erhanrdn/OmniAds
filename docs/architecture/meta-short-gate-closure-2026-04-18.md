# Meta Short-Gate Closure 2026-04-18

Status: `Meta short gate remains open`

Build under evaluation: `18617f2312a31927638836939e78c0efd753d4cb`

## Clean Signals

- Meta parity artifact is clean:
  - `blockingDiffs = 0`
  - `campaigns = 48`
  - `adsets = 94`
  - `breakdowns = 142`
  - `creatives = 0`
- Meta short-gate benchmark is clean:
  - `meta_creatives_30d`: `valid:fresh`, `p95 = 396.77ms`
  - `meta_campaigns_30d`: `valid`, `p95 = 7464.31ms`
  - `meta_adsets_30d`: `valid`, `p95 = 4239.76ms`
  - `meta_breakdowns_30d`: `valid`, `p95 = 4087.07ms`
  - no benchmark blockers were raised
- Targeted Meta smoke is clean on the evaluated build:
  - `summary`
  - `campaigns`
  - `adsets`
  - `breakdowns`
  - `status`
  - DB-backed `creatives`
- Control-plane deploy posture is clean:
  - `exactRowsPresent = true`
  - `deployGate = pass`
  - `deployGateMode = block`
  - `releaseGateMode = block`

## Blocking Signal

Meta does not close on this build because the live release gate is currently blocked for `TheSwaf`.

- `releaseGate.verdict = blocked`
- `repairPlan.recommendations.length = 1`
- blocker class: `queue_blocked`
- recommended guarded action: `stale_lease_reclaim`

Current blocker evidence for `TheSwaf`:

- `queueDepth = 2`
- `leasedPartitions = 1`
- `reclaimCandidateCount = 1`
- `truthReady = true`
- `deadLetterPartitions = 0`
- `staleLeasePartitions = 0`
- `validationFailures24h = 2`
- `retryableFailedPartitions = 0`

## Readiness Decision

The gate-led readiness policy in `docs/architecture/meta-short-gate-readiness-note.md` remains in force.

- `creative_daily.readyThrough = null` remains non-blocking because `creative_daily` is deprecated for Meta short-gate closure.
- `validationFailures24h` is not independently blocking here.
- The current state is blocking because the gate-led prerequisites for treating residuals as non-blocking are not satisfied:
  - `releaseGate = pass` is false
  - `repairPlan = []` is false

## Required Next Step

Run the guarded `stale_lease_reclaim` remediation for `TheSwaf`, then rerun:

```bash
node --import tsx scripts/meta-watch-window.ts --expected-build-id 18617f2312a31927638836939e78c0efd753d4cb --base-url https://adsecute.com --require-block-modes --attempts 1
node --import tsx scripts/sync-control-plane-verify.ts --build-id 18617f2312a31927638836939e78c0efd753d4cb --environment production --provider-scope meta --require-block-modes
node --import tsx scripts/meta-short-gate-benchmark.ts --business-id 172d0ab8-495b-4679-a4c6-ffa404c389d3 --start-date 2026-03-18 --end-date 2026-04-16 --iterations 2 --parity-file /tmp/meta-parity-2026-04-18.json
```

Meta cannot move to `Google Ads` until this artifact can be replaced by either:

- `Meta short gate closed`
- `Meta short gate closed with residual non-blocking readiness note`
