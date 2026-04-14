# 1. Phase

P4: harden self-hosted Postgres path

# 2. Files Reviewed

- `docs/meta-sync-hardening/report.md`
- `lib/db.ts`
- `lib/startup-diagnostics.ts`
- `lib/sync/meta-sync.ts`
- `lib/sync/provider-worker-adapters.ts`
- `lib/sync/provider-status-truth.ts`
- `lib/sync/worker-runtime.ts`
- `lib/meta/warehouse.ts`
- `lib/meta/status-types.ts`
- `app/api/meta/status/route.ts`
- `app/api/admin/sync-health/route.ts`
- `lib/admin-operations-health.ts`
- `app/admin/sync-health/page.tsx`
- `scripts/sync-worker.ts`
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-hetzner.yml`
- `README.md`
- `docs/self-hosted-db-ops.md`
- `docs/architecture/db-dependency-map.md`
- `docs/architecture/db-target-architecture.md`
- `docs/architecture/live-db-baseline-checks.sql`
- `lib/migrations.ts`
- `scripts/run-migrations.ts`
- `lib/sync/meta-sync.test.ts`
- `lib/sync/provider-worker-adapters.test.ts`
- `lib/sync/provider-status-truth.test.ts`
- `lib/admin-operations-health.test.ts`
- `app/api/meta/status/route.test.ts`
- `lib/sync/meta-sync-lease-epoch.test.ts`
- `lib/sync/meta-sync-scheduled-work.test.ts`
- `lib/db.test.ts`

# 3. Recent Relevant Commits Reviewed

- `204ce94` `P3: harden Meta sync throughput`
- `36a21be` `feat(db): support self-hosted postgres cutover`
- `0f35e14` `refactor(meta): complete phase 10 legacy cleanup and hardening`
- `071af76` `docs(meta): add comprehensive report on Meta sync architecture and improvement phases`

# 4. Files Changed

- `README.md`
- `app/admin/sync-health/page.tsx`
- `docs/meta-sync-hardening/postgres-runbook.md`
- `docs/meta-sync-hardening/report.md`
- `docs/self-hosted-db-ops.md`
- `lib/admin-db-diagnostics.test.ts`
- `lib/admin-db-diagnostics.ts`
- `lib/admin-operations-health.test.ts`
- `lib/admin-operations-health.ts`
- `lib/db.test.ts`
- `lib/db.ts`
- `lib/sync/worker-runtime.ts`
- `package.json`
- `scripts/meta-sync-db-diagnostics.ts`
- `scripts/meta-sync-drain-rate.ts`

# 5. DB Client / Pooling Changes

- `lib/db.ts` now resolves explicit web versus worker DB settings from repo-managed envs instead of relying on a few hard-coded defaults.
- Added role-aware env controls for pool size, query timeout, connection timeout, idle timeout, retry attempts, retry backoff, `application_name`, statement timeout, idle-in-transaction timeout, and max connection lifetime.
- Defaults now reflect the small self-hosted box more clearly: web keeps a smaller interactive pool and worker uses a tighter background pool budget instead of a broad default aimed at Neon-style elasticity.
- Connections are tagged as `omniads-web` or `omniads-worker` by default through `application_name`, which makes `pg_stat_activity` and `pg_stat_statements` separable by process role.
- The DB wrapper now tracks runtime evidence in-process: pool counts, waiter pressure, utilization, query totals, retryable failures, connection failures, timeouts, and last error metadata.
- Startup diagnostics now log compact resolved DB settings so operators can confirm the active runtime knobs without exposing secrets.
- `lib/sync/worker-runtime.ts` now includes DB runtime diagnostics in worker heartbeats so the admin health path can compare web-process and worker-process pressure from repo-owned data.

# 6. Query / Index Findings

- I audited the DB-heavy Meta paths before changing schema: queue claim and scheduling in `lib/sync/provider-worker-adapters.ts`, runner/lease reads in `lib/sync/meta-sync.ts`, warehouse reads in `lib/meta/warehouse.ts`, and admin/status readers that aggregate sync state.
- The hot queue claim path still filters on provider, status, availability, and lease state and orders by priority and timestamps. That shape already aligns with the existing queue-oriented index created in `lib/migrations.ts`.
- The lease recovery and reclaim paths still filter on provider, status, and lease-expiry columns. That shape already aligns with the existing lease-oriented index in `lib/migrations.ts`.
- Warehouse readers are still dominated by business/date/status filters that already have repo-owned indexes. I did not find a newly introduced query shape that justified another migration without live statement evidence.
- No new migration or index was added in this phase. The gap after P3 was measurability and tuning, not an obviously missing index in the inspected code paths. Adding speculative indexes before collecting `pg_stat_statements` evidence on the self-hosted box would have been guesswork.

# 7. New Diagnostics / Runbook

- Added `lib/admin-db-diagnostics.ts` to classify worker/web DB pressure, backlog drain state, and likely bottleneck from existing health inputs plus new DB runtime snapshots.
- Extended `lib/admin-operations-health.ts` and `app/admin/sync-health/page.tsx` so operators can distinguish healthy DB, elevated DB pressure, saturated DB pressure, large-but-draining backlog, and large-and-not-draining backlog without introducing a parallel status system.
- Added `scripts/meta-sync-db-diagnostics.ts` for a repo-managed production snapshot covering queue depth, lease state, worker heartbeat context, `pg_stat_activity`, blocked locks, long transactions, relation sizes, and `pg_stat_statements` top statements when available.
- Added `scripts/meta-sync-drain-rate.ts` for repeatable backlog drain snapshots with net-drain estimates and reclaim context.
- Added `docs/meta-sync-hardening/postgres-runbook.md` and linked it from `README.md` and `docs/self-hosted-db-ops.md`.

# 8. Manual Host-Level Steps

- Enable `pg_stat_statements` at the Postgres host level with `shared_preload_libraries = 'pg_stat_statements'`, restart Postgres, and run `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`.
- Size `max_connections` for the small box with an explicit budget for web processes, worker processes, and admin access instead of allowing the app to consume the entire server.
- Keep host-level visibility enabled for slow SQL and lock inspection. The runbook calls out the server settings and SQL needed to verify long statements, long transactions, and lock contention.
- Use the repo-owned scripts and runbook queries before changing server knobs so tuning stays evidence-based rather than anecdotal.

# 9. Test Commands Run

- `npx vitest run lib/db.test.ts lib/admin-db-diagnostics.test.ts lib/admin-operations-health.test.ts`
- `npx tsc --noEmit`
- `npx vitest run lib/db.test.ts lib/admin-db-diagnostics.test.ts lib/sync/meta-sync.test.ts lib/sync/provider-worker-adapters.test.ts lib/sync/provider-status-truth.test.ts lib/admin-operations-health.test.ts app/api/meta/status/route.test.ts lib/sync/meta-sync-lease-epoch.test.ts lib/sync/meta-sync-scheduled-work.test.ts`

# 10. Test Results

- Targeted DB/admin diagnostics tests passed: 3 files, 36 tests.
- Broad sync/admin subset passed: 9 files, 132 tests.
- `npx tsc --noEmit` passed.

# 11. Final CI/Deploy Closure

- Branch: `main`
- Green runtime-affecting SHA: `1c1a462ead8c86b5e1291794fc537f17bc0435be`
- CI workflow: `CI` run `#170` (`24423709194`) -> `success`
- Deploy workflow: `Deploy to Hetzner` run `#254` (`24423966197`) -> `success`
- Repair commits needed after the first push: `no`

# 12. Remaining Risks

- The new diagnostics expose strong evidence from app runtime and system views, but the final index decisions still depend on real `pg_stat_statements` data from the self-hosted production workload.
- Pool and timeout defaults are now explicit, but the correct long-term values still depend on actual concurrency split between web replicas, worker replicas, and background admin usage on the Hetzner host.
- If queue growth outpaces drain after DB tuning, the next bottleneck may be statement shape or warehouse write amplification rather than scheduler behavior.

# 13. Recommended Next Phase

- Capture one or two production baselines with the new scripts after peak backlog events, including `pg_stat_statements` output.
- Use that evidence to decide whether the next phase should add a targeted index, reduce a specific hot query's write/read cost, or further rebalance web versus worker connection budgets.
