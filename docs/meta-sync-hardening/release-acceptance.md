# Meta Sync Release Acceptance

This document is the repo-owned acceptance path for proving Meta sync is fast enough, transparent enough, and operable enough to market professionally. It is intentionally command-first and uses maintained scripts rather than one-off diagnostics.

## 1. Capture the baseline

Use one real business that represents current release risk.

```bash
npm run meta:readiness-snapshot -- --business <businessId> --out /tmp/meta-readiness.json
npm run meta:drain-rate -- --business <businessId> --window-minutes 15 --out /tmp/meta-drain.json
npm run meta:benchmark -- --business <businessId> --samples 4 --interval-seconds 300 --window-minutes 15 --out /tmp/meta-benchmark.json
npm run meta:db:diagnostics -- --business <businessId> --out /tmp/meta-db.json
```

When backlog or publication truth looks wrong, add the authoritative checks:

```bash
npm run meta:state-check -- <businessId>
npm run meta:verify-day -- <businessId> <providerAccountId> <day>
npm run meta:verify-publish -- <businessId> <providerAccountId> <day>
```

## 2. Metrics to capture

Capture these from the maintained JSON outputs:

- Queue depth, leased partitions, retryable failed partitions, dead-letter partitions, and oldest queued partition.
- Pending partition counts by lane and by scope from `pendingByLane`, `pendingByScope`, `laneSourceStatusCounts`, and `laneScopeStatusCounts`.
- Recent user-facing core readiness: summary coverage, campaign coverage, combined core percent, and combined ready-through date.
- Recent truth state and priority-window truth state, including detector reason codes.
- Operator progress state, activity state, stall fingerprints, repair backlog, D-1 finalize nonterminal count, and last successful publish time.
- Drain-rate evidence: completed, cancelled, dead-lettered, created, reclaimed, skipped-active-lease, and net drain estimate over the sample window.
- Benchmark-series deltas: queue depth delta, terminal partitions during sample, created partitions during sample, ready-through advancements, and final observed state.
- DB visibility: worker heartbeat presence, primary constraint classification, `pg_stat_activity` summary, blocked locks, long transactions, and `pg_stat_statements` availability.

## 3. Healthy enough to market

Treat Meta sync as market-ready only when all of these are true for the acceptance business:

- `recentCore.complete` is `true` and `recentSelectedRangeTruth.truthReady` is `true` for the recent window you intend to market.
- `priorityWindowTruth.state` is not `blocked`; if it is still `processing`, the benchmark series must show active forward progress and the operator state must be `busy`, not `stalled`.
- `summary.observedState` from `meta:benchmark` is `ready` or `busy`, never `blocked` or `stalled`.
- `meta:drain-rate` reports `clear` or `large_but_draining`, never `large_and_not_draining`.
- Dead-letter partitions and stale leases are zero for the acceptance business.
- `/admin/sync-health` and the readiness snapshot agree on the operator posture.
- If the current day is still live-only, detector reasons may include `current_day_live`, but marketing claims must still be based on the completed recent window, not unfinished current-day truth.

## 4. Acceptable progress expectations

Use these expectations when backlog still exists:

- Core or recent readiness must move across the sample. Evidence can be queue depth falling, terminal partitions increasing, or ready-through dates advancing.
- A queue that stays non-zero with no leases, no terminal progress, no ready-through advancement, and no worker heartbeat is failing acceptance.
- A queue can still pass while draining if the benchmark shows `observedState=busy`, `progressObserved=true`, and `drainState=large_but_draining`.
- If the queue is only maintenance work, that must still be visible by lane and must not be misreported as healthy readiness.

## 5. Busy vs waiting vs blocked vs stalled

Use the maintained outputs exactly this way:

- `busy`: benchmark `observedState=busy`, operator `activityState=busy`, or drain-rate `large_but_draining`. Work is actively moving.
- `waiting`: queue exists, leases are absent, truth is not blocked, and the operator surface says work is waiting rather than stuck. This is a scheduling or worker-presence question, not proof of progress.
- `blocked`: operator `progressState=blocked`, selected-range truth is `blocked`, or dead letters / stale leases are present. Do not market through this state.
- `stalled`: benchmark `observedState=stalled`, operator `activityState=stalled`, or drain-rate `large_and_not_draining`. This means the system is not merely busy.
- `worker_unavailable`: DB diagnostics show the primary constraint as `worker_unavailable`, or the acceptance business shows backlog with no matched worker heartbeat and no active lease. This is not a UI wording problem; it means the separately deployed worker runtime is absent, down, or not publishing heartbeats for the business.

## 6. Operator signals that must stay visible

These signals must remain available in `/admin/sync-health` and the maintained scripts:

- Worker online/offline posture and latest heartbeat.
- Business-matched worker heartbeat truth for the acceptance business, not just provider-global worker counts.
- Queue depth, leased partitions, dead letters, and oldest queued partition.
- Per-business Meta progress state, activity state, stall fingerprints, and repair backlog.
- D-1 finalize nonterminal count and last successful publish time.
- DB pressure summary and likely primary constraint when worker heartbeat diagnostics are present.
- Lane/source/scope queue composition so maintenance backlog cannot hide behind a generic queue number.

## 7. Failure handling

If acceptance fails:

- `blocked`: run `meta:state-check`, then `meta:verify-day` or `meta:verify-publish`, and use `/admin/sync-health` recovery actions before retesting.
- `waiting`: inspect worker health, runner lease state, and DB diagnostics. Do not call this healthy unless a follow-up benchmark turns it into `busy` or `ready`.
- `stalled`: treat it as a release stop. Capture `meta:benchmark`, `meta:drain-rate`, `meta:db:diagnostics`, then repair queue ownership, worker presence, or authoritative publish state before retesting.
- `worker_unavailable`: verify the deployed `worker` service or host first. This repo expects a separate worker runtime alongside the web runtime. If the acceptance business shows backlog, no matched worker heartbeat, and no active lease, restore the worker process before making DB or queue changes.
- `db` or `mixed` constraint: follow `docs/meta-sync-hardening/postgres-runbook.md` and change one DB or worker knob at a time, then rerun the same command set.

## 8. Evidence package to retain outside the repo

For each acceptance run, keep the JSON outputs from:

- `meta-readiness.json`
- `meta-drain.json`
- `meta-benchmark.json`
- `meta-db.json`

Keep them together with the tested business ID, sample window, and exact commit SHA so before/after comparisons stay reproducible without adding throwaway files back into the repository.
