# Phase
Documentation and planning only, based on repository code reviewed on 2026-04-14. No runtime behavior changed in this phase.

## Files Reviewed
- `app/api/meta/status/route.ts`
- `lib/meta/page-readiness.ts`
- `lib/meta/status-types.ts`
- `lib/meta/ui.ts`
- `lib/meta/ui-status.ts`
- `lib/sync/sync-status-pill.ts`
- `app/admin/sync-health/page.tsx`
- `lib/admin-operations-health.ts`
- `app/(dashboard)/integrations/page.tsx`
- `components/integrations/integrations-card.tsx`
- `components/meta/meta-sync-progress.tsx`
- `lib/meta/status-operations.ts`
- `lib/sync/provider-status-truth.ts`
- `lib/sync/meta-sync.ts`
- `lib/db.ts`
- `package.json`
- `lib/meta/page-readiness.test.ts`
- `lib/meta/ui-status.test.ts`
- `lib/meta/ui.test.ts`
- `lib/meta/status-operations.test.ts`
- `lib/sync/sync-status-pill.test.ts`
- `lib/sync/meta-sync.test.ts`

## Current Meta Sync Architecture Summary
- `/api/meta/status` already builds a rich `MetaStatusResponse` from integration state, warehouse coverage, queue health/composition, checkpoint health, worker health, selected-range truth, D-1 finalize verification, retention review, and protected published truth review.
- `lib/meta/page-readiness.ts` explicitly separates page usability from completeness: `pageReadiness`, `coreReadiness`, and `extendedCompleteness` are different layers.
- The integrations surface does not use most of that detail. [`app/(dashboard)/integrations/page.tsx`](/Users/harmelek/Adsecute/app/(dashboard)/integrations/page.tsx:1) fetches Meta status, but the card only receives a sync notice plus a compact pill from [`components/integrations/integrations-card.tsx`](/Users/harmelek/Adsecute/components/integrations/integrations-card.tsx:1).
- [`components/meta/meta-sync-progress.tsx`](/Users/harmelek/Adsecute/components/meta/meta-sync-progress.tsx:1) already exists to render title, description, caption, and progress, but it is not mounted anywhere.
- [`lib/sync/meta-sync.ts`](/Users/harmelek/Adsecute/lib/sync/meta-sync.ts:1) owns scheduling and worker execution: refresh state, enqueue historical core work, enqueue maintenance/recent auto-heal, lease by lane/fairness, process partitions, recover D-1 finalize work, and enqueue extended follow-up work.
- [`lib/admin-operations-health.ts`](/Users/harmelek/Adsecute/lib/admin-operations-health.ts:1) and [`app/admin/sync-health/page.tsx`](/Users/harmelek/Adsecute/app/admin/sync-health/page.tsx:1) already expose much deeper operator detail than the end-user integrations surface.

## Ranked Root Causes
### UI transparency gaps
1. `[UX-only]` The integrations card reduces Meta sync to four static rows, one notice, and one pill, so users cannot see phase, queue pressure, D-1 finalize state, selected-range completeness, or core-vs-extended lag.
2. `[UX-only]` `MetaSyncProgress` already exists but is unused, so richer progress/title/caption copy never reaches the card.
3. `[UX-only]` `resolveMetaSyncStatusPill` compresses materially different states into `Active`, `Core ready`, `Needs attention`, or `% Preparing range`, which hides why the state exists.
4. `[UX-only]` `getMetaStatusNotice` returns one string, not a compact structured summary; the card cannot show layered context without re-deriving it.
5. `[UX-only]` The current integrations page does not visibly distinguish `core ready but extended lagging` from `fully ready`, even though the route and tests already model that distinction.

### status-contract / route-shaping gaps
1. `[Status-contract]` The route returns rich low-level fields, but no compact UI-facing summary object. Clients must combine `state`, `pageReadiness`, `coreReadiness`, `extendedCompleteness`, `jobHealth`, `operations`, `selectedRangeTruth`, `d1FinalizeState`, and `latestSync`.
2. `[Status-contract]` [`lib/meta/ui.ts`](/Users/harmelek/Adsecute/lib/meta/ui.ts:66) relies on string matching against `latestSync.phaseLabel` such as `Preparing today's data` and `Backfilling historical data`, which is brittle route-to-client coupling.
3. `[Status-contract]` `latestSync.progressPercent` is route-shaped coverage progress, not true worker throughput. It can read `100` while backlog, retries, or operator issues still exist.
4. `[Status-contract]` The top-level `state` can be `ready` while `pageReadiness` is still partial or `coreReadiness` is ready but `extendedCompleteness` is not. That is a valid model, but it needs an explicit summary contract so UI does not guess.
5. `[Status-contract]` Progress/title/notice logic is duplicated across `route.ts`, `ui.ts`, `ui-status.ts`, and `sync-status-pill.ts`, increasing drift risk.

### worker/scheduler throughput risks
1. `[Backend throughput]` [`consumeMetaQueuedWork`](/Users/harmelek/Adsecute/lib/sync/meta-sync.ts:3595) leases multiple partitions across lanes, then processes them in a single sequential loop. That caps one worker process to one active partition at a time while other leases sit idle.
2. `[Backend throughput]` [`enqueueMetaHistoricalCorePartitions`](/Users/harmelek/Adsecute/lib/sync/meta-sync.ts:1827) effectively queues only one next incomplete historical day per account, even though `META_HISTORICAL_ENQUEUE_DAYS_PER_RUN` exists.
3. `[Backend throughput]` [`buildMetaFollowupLeasePlan`](/Users/harmelek/Adsecute/lib/sync/meta-sync.ts:817) blocks `extendedHistoricalLimit` whenever maintenance backlog or extended recent backlog exists, which can starve deep extended history indefinitely.
4. `[Backend throughput]` The same follow-up plan blocks recent extended leasing while maintenance backlog exists. Because maintenance work is continuously re-enqueued (`today_observe`, recent repair/finalize), recent extended work can be delayed longer than necessary.
5. `[Backend throughput + DB load]` [`refreshMetaSyncStateForBusiness`](/Users/harmelek/Adsecute/lib/sync/meta-sync.ts:2563) runs many per-account, per-scope coverage and partition-health queries before and after consume loops, increasing DB pressure and worker overhead.

### self-hosted Postgres / DB risks
1. `[DB/infra]` [`lib/db.ts`](/Users/harmelek/Adsecute/lib/db.ts:1) only exposes pool size and timeout envs. It does not emit query latency, pool wait, timeout rate, retry rate, or concurrency saturation metrics.
2. `[DB/infra]` The Meta status route and admin operations health code issue many aggregate coverage and queue queries, including large CTEs over `meta_sync_partitions`, `meta_sync_state`, `meta_sync_checkpoints`, `meta_sync_runs`, `sync_reclaim_events`, and warehouse daily tables. Self-hosted performance will depend heavily on indexes, bloat, autovacuum, and I/O.
3. `[DB/infra]` Default pool sizing is process-local (`10` app, `20` worker). In self-hosted deployments, total app+worker process count must be measured before increasing concurrency or pool size.
4. `[DB/infra]` The timeout wrapper is client-side. A timed-out app request does not prove PostgreSQL stopped doing work, so slow-query diagnosis is incomplete without server-side measurement.
5. `[DB/infra]` `package.json` shows the active DB path is now `pg`, so the move off Neon is real from an application client perspective; tuning must now be tied to the actual self-hosted instance rather than inherited hosted defaults.

### observability gaps
1. `[Observability]` Worker logs in `meta-sync.ts` are detailed, but there is no compact surfaced summary for end users and no DB telemetry loop for operators.
2. `[Observability]` Admin sync health is rich, but it is admin-only and not translated into a compact workspace-level summary on the integrations card.
3. `[Observability]` No route payload currently exposes drain rate, partitions/minute, days/hour, oldest queue age bucket, or lease idle ratio.
4. `[Observability]` No DB health snapshot is attached to Meta status/admin health for connections, slow queries, autovacuum lag, or pool pressure.
5. `[Observability]` Existing UI percent bars reflect coverage completion, not scheduler throughput or queue drain effectiveness.

## Proposed Phase Plan
### P1 visibility on Integrations card
- Mount a compact Meta progress block on the integrations card using existing `MetaStatusResponse` fields before changing worker behavior.
- Show phase, percent, selected-range mode, core-vs-extended state, and only the highest-signal attention marker when relevant.
- Make `Core ready` visibly different from `Page ready` and from `Blocked/Paused/Stale`.
- Keep this phase UI-focused and low-risk.

### P2 compact UI-facing status summary
- Add one typed compact summary in the Meta status contract so clients no longer need to string-match `phaseLabel` or recompute state from many nested fields.
- Centralize title/description/caption/pill inputs around that summary while keeping existing operator fields intact.
- Remove or sharply reduce client heuristics that currently infer status from scattered fields.

### P3 worker/scheduler throughput hardening
- Stop leasing materially more work than one worker process can execute concurrently, or add bounded concurrent partition execution with safe heartbeats and completion semantics.
- Make historical core enqueue honor a real batch size per account while preserving authoritative day ordering.
- Rebalance follow-up leasing so maintenance work cannot permanently starve recent extended or historical extended work.
- Add explicit throughput metrics: partitions/loop, days/hour, oldest queued age, and lease idle ratio.

### P4 Postgres + DB tuning + observability
- Baseline first on self-hosted Postgres: route latency, admin health latency, pool usage, retry count, timeout count, active connections, table sizes, autovacuum lag, and top SQL by total time and p95.
- Instrument `lib/db.ts` so app and worker paths emit query timing and pool-pressure data.
- Review query plans and indexes for the Meta status/admin tables named above before changing pool sizes or worker concurrency.
- Tune worker count, pool max, and timeouts only after the baseline is captured.

### P5 soak / benchmark / release acceptance
- Run repeated queue/status checks, local-db tests, and soak snapshots before release.
- Compare before/after throughput and latency against the captured baseline.
- Only release if visibility improved and throughput/DB regressions are absent.

## Acceptance Criteria
### measurable completion criteria
- A before/after baseline exists for Meta status route latency, admin sync-health latency, queue depth drain rate, retry/dead-letter counts, worker stale-lease count, and DB pool/query metrics.
- P3 is not accepted unless measured throughput improves over baseline with no increase in dead-letter partitions or stale leases.
- P4 is not accepted unless self-hosted Postgres measurements identify the current bottleneck class before any pool/concurrency increase is merged.

### user-facing criteria
- The integrations card visibly distinguishes `preparing`, `partially ready`, `core ready`, `blocked`, and `fully ready`.
- Users can see whether the issue is current-day preparation, selected-range truth, extended lag, or operational blockage without opening admin tools.
- A `ready` state no longer hides `core-only` readiness.

### operator-facing criteria
- Admin/operator surfaces and user-facing compact status agree on the dominant state for the same workspace.
- D-1 finalize problems, retryable failed backlog, dead letters, and worker-offline/lease problems remain operator-visible.
- DB tuning decisions are backed by captured self-hosted Postgres evidence, not guessed defaults.

## Exact Files To Read First In Next Phase
1. `app/(dashboard)/integrations/page.tsx`
2. `components/integrations/integrations-card.tsx`
3. `components/meta/meta-sync-progress.tsx`
4. `lib/meta/ui.ts`
5. `lib/meta/ui-status.ts`
6. `lib/sync/sync-status-pill.ts`
7. `app/api/meta/status/route.ts`
8. `lib/meta/status-types.ts`
9. `lib/meta/page-readiness.ts`

## Exact Tests / Scripts To Use In Later Phases
- UI/status tests: `npx vitest run lib/meta/page-readiness.test.ts lib/meta/ui-status.test.ts lib/meta/ui.test.ts lib/sync/sync-status-pill.test.ts`
- Worker/status tests: `npx vitest run lib/meta/status-operations.test.ts lib/sync/meta-sync.test.ts`
- Local DB test pass: `npm run test:local-db`
- Meta state/queue inspection: `npm run meta:state-check`, `npm run meta:progress-diff`, `npm run meta:refresh-state`
- Meta recovery scripts: `npm run meta:reschedule`, `npm run meta:replay-dead-letter`, `npm run meta:verify-day`, `npm run meta:verify-publish`
- Soak and acceptance: `npm run meta:soak-snapshot`, `npm run sync:hardening-acceptance`
- DB baseline: `npm run db:architecture:baseline`

## Risks / Open Questions
- The code shows strong evidence of sequential worker execution, but the practical severity depends on how many worker processes are running in production.
- The code reviewed does not show current query plans or index definitions for the heavy Meta status/admin SQL; those must be measured directly on the self-hosted Postgres instance.
- The route already exposes many useful fields; P1 may be UI-only, but P2 becomes necessary if the card still needs string matching or too much client-side assembly.
- The cost of `refreshMetaSyncStateForBusiness` scales with assigned account count; production account cardinality needs to be measured before throughput tuning.
- Continuous maintenance enqueueing is intentional; starvation fixes must preserve D-1 and recent-truth guarantees while allowing extended catch-up to progress.

## Recommended Next Phase
P1 visibility on Integrations card.

Reason: the highest user-facing problem is transparency, and the code already contains enough route data plus an unused `MetaSyncProgress` component to improve clarity before touching scheduler behavior. The next phase should modify the integrations UI first, then only extend into P2 contract shaping if the existing status payload still forces brittle client heuristics.
