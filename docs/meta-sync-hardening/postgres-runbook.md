# Meta Sync Postgres Runbook

This runbook is for the self-hosted PostgreSQL path behind Meta sync. It is intentionally split between repo-owned controls and manual host-level steps so operators can measure first, change one thing at a time, and prove that a small Hetzner-class box is improving.

## Measure First

Start with repo-owned evidence before changing Postgres server knobs:

```bash
npm run meta:db:diagnostics
npm run meta:drain-rate
```

If a single business is suspect:

```bash
npm run meta:db:diagnostics -- --business <businessId>
npm run meta:drain-rate -- --business <businessId> --window-minutes 15
```

Also inspect the existing operator surface:

- `/admin/sync-health`
- `DB pressure` panel for web pressure, worker pressure, and Meta backlog state
- `Worker runtime` panel for active workers, leases, and consume stage

Measure these first:

- Meta queue depth and oldest queued partition
- Meta leased partitions
- Worker DB waiters, timeout count, retryable DB failures, connection errors
- Whether the backlog is `draining` or `stalled`
- Whether the likely primary constraint is `db`, `worker_unavailable`, `scheduler_or_queue`, or `mixed`

If the acceptance business has backlog, `leasedPartitions=0`, no matched worker heartbeat, and no active runner lease, treat that as a worker-runtime availability problem before tuning Postgres. The repo deploys a separate `worker` runtime alongside `web`; restore the worker service or host first, then retest DB pressure.

## Repo-Owned Controls

The repo now exposes explicit app-level DB tuning for web and worker runtimes in `lib/db.ts`.

Shared envs:

- `DB_QUERY_TIMEOUT_MS`
- `DB_POOL_MAX`
- `DB_CONNECTION_TIMEOUT_MS`
- `DB_IDLE_TIMEOUT_MS`
- `DB_MAX_LIFETIME_SECONDS`
- `DB_STATEMENT_TIMEOUT_MS`
- `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`
- `DB_RETRY_ATTEMPTS`
- `DB_RETRY_BACKOFF_MS`
- `DB_RETRY_MAX_BACKOFF_MS`
- `DB_APPLICATION_NAME`

Role-specific overrides:

- `DB_WEB_QUERY_TIMEOUT_MS`
- `DB_WORKER_QUERY_TIMEOUT_MS`
- `DB_WEB_POOL_MAX`
- `DB_WORKER_POOL_MAX`
- `DB_WEB_CONNECTION_TIMEOUT_MS`
- `DB_WORKER_CONNECTION_TIMEOUT_MS`
- `DB_WEB_IDLE_TIMEOUT_MS`
- `DB_WORKER_IDLE_TIMEOUT_MS`
- `DB_WEB_RETRY_ATTEMPTS`
- `DB_WORKER_RETRY_ATTEMPTS`
- `DB_WEB_APPLICATION_NAME`
- `DB_WORKER_APPLICATION_NAME`

Current defaults:

- Web pool max: `10`
- Worker pool max: `12`
- Web query timeout: `8000`
- Worker query timeout: `30000`
- Connection timeout: `10000`
- Idle timeout: `30000`
- Retry attempts: `4`
- Retry backoff base/max: `400` / `4000`

Notes:

- `DB_STATEMENT_TIMEOUT_MS` is a hard cap on the server connection session. If it is lower than a `getDbWithTimeout(...)` override, the lower statement timeout still wins.
- Worker connections now identify themselves separately from web connections through `application_name`, so `pg_stat_activity` can distinguish `omniads-web` from `omniads-worker`.
- Worker heartbeats now carry DB runtime diagnostics, so `/admin/sync-health` can show worker DB pressure directly instead of only web-process pressure.

## Connection Budget Guidance

For a small `2 vCPU / 8 GB RAM` box, connection budget matters more than theoretical max throughput.

Start with this posture:

- Keep one durable worker process per host unless DB evidence proves a second worker is warranted.
- Keep `WORKER_GLOBAL_DB_CONCURRENCY=4` unless queue drain evidence shows the DB is healthy and the worker is starved elsewhere.
- Keep the combined app pool budget modest. A practical starting point is `DB_WEB_POOL_MAX=8-10` per web process and `DB_WORKER_POOL_MAX=10-12` per worker process.
- Lower pool sizes before raising PostgreSQL `max_connections` when you see waiting clients, connection churn, or timeout pressure.

Rule of thumb:

- App pool budget = `(web process count * DB_WEB_POOL_MAX) + (worker process count * DB_WORKER_POOL_MAX) + admin/migration headroom`
- On a single web + single worker host, try to keep that app budget roughly in the `24-32` connection range before `psql`, migrations, and maintenance sessions.
- Avoid setting PostgreSQL `max_connections` to a large round number just because it is available. On a small box, `50-80` is usually more realistic than `200+`.

## Backlog Drain Snapshot

Use the repo script first:

```bash
npm run meta:drain-rate -- --window-minutes 15
```

Interpret it like this:

- `clear`: no queue backlog
- `large_but_draining`: queue exists, but active leases or recent completions show forward motion
- `large_and_not_draining`: queue exists without leases or recent progress

The script reports:

- current queue depth
- leased partitions
- retryable failed partitions
- dead-letter partitions
- completed rows in the last window
- newly created queued rows in the last window
- reclaim counts in the last window
- a simple `netDrainEstimate`

## Lease And Reclaim Snapshot

Use the repo diagnostic snapshot:

```bash
npm run meta:db:diagnostics -- --business <businessId>
```

It includes:

- active `sync_runner_leases`
- recent `sync_reclaim_events`
- recent `sync_worker_heartbeats`
- per-business Meta queue breakdown

If you need raw SQL:

```sql
SELECT
  business_id,
  lease_owner,
  lease_expires_at,
  updated_at
FROM sync_runner_leases
WHERE provider_scope = 'meta'
  AND lease_expires_at > now()
ORDER BY lease_expires_at DESC;
```

```sql
SELECT
  business_id,
  event_type,
  COUNT(*)::int AS count,
  MAX(created_at) AS latest_at
FROM sync_reclaim_events
WHERE provider_scope = 'meta'
  AND created_at >= now() - interval '24 hours'
GROUP BY business_id, event_type
ORDER BY count DESC, business_id ASC, event_type ASC;
```

## Safe Production Inspection Queries

Current activity by application and wait state:

```sql
SELECT
  COALESCE(application_name, '') AS application_name,
  COALESCE(state, 'unknown') AS state,
  COALESCE(wait_event_type, '') AS wait_event_type,
  COALESCE(wait_event, '') AS wait_event,
  COUNT(*)::int AS connection_count
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY application_name, state, wait_event_type, wait_event
ORDER BY connection_count DESC, application_name ASC;
```

Long transactions:

```sql
SELECT
  pid,
  COALESCE(application_name, '') AS application_name,
  state,
  now() - xact_start AS xact_age,
  now() - query_start AS query_age,
  COALESCE(wait_event_type, '') AS wait_event_type,
  COALESCE(wait_event, '') AS wait_event,
  LEFT(regexp_replace(query, '\s+', ' ', 'g'), 220) AS query
FROM pg_stat_activity
WHERE datname = current_database()
  AND xact_start IS NOT NULL
  AND now() - xact_start > interval '5 minutes'
ORDER BY xact_start ASC;
```

Blocked locks:

```sql
SELECT
  blocked_activity.pid AS blocked_pid,
  blocked_activity.application_name AS blocked_application_name,
  blocker_activity.pid AS blocker_pid,
  blocker_activity.application_name AS blocker_application_name,
  now() - blocked_activity.query_start AS blocked_query_age,
  LEFT(regexp_replace(blocked_activity.query, '\s+', ' ', 'g'), 160) AS blocked_query,
  LEFT(regexp_replace(blocker_activity.query, '\s+', ' ', 'g'), 160) AS blocker_query
FROM pg_locks blocked_lock
JOIN pg_stat_activity blocked_activity
  ON blocked_activity.pid = blocked_lock.pid
JOIN pg_locks blocker_lock
  ON blocker_lock.locktype = blocked_lock.locktype
 AND blocker_lock.database IS NOT DISTINCT FROM blocked_lock.database
 AND blocker_lock.relation IS NOT DISTINCT FROM blocked_lock.relation
 AND blocker_lock.page IS NOT DISTINCT FROM blocked_lock.page
 AND blocker_lock.tuple IS NOT DISTINCT FROM blocked_lock.tuple
 AND blocker_lock.virtualxid IS NOT DISTINCT FROM blocked_lock.virtualxid
 AND blocker_lock.transactionid IS NOT DISTINCT FROM blocked_lock.transactionid
 AND blocker_lock.classid IS NOT DISTINCT FROM blocked_lock.classid
 AND blocker_lock.objid IS NOT DISTINCT FROM blocked_lock.objid
 AND blocker_lock.objsubid IS NOT DISTINCT FROM blocked_lock.objsubid
 AND blocker_lock.pid <> blocked_lock.pid
JOIN pg_stat_activity blocker_activity
  ON blocker_activity.pid = blocker_lock.pid
WHERE NOT blocked_lock.granted
  AND blocker_lock.granted;
```

Relation and index sizes for Meta sync tables:

```sql
SELECT
  stat.relname AS relation_name,
  stat.n_live_tup::bigint AS live_rows,
  pg_size_pretty(pg_total_relation_size(stat.relid)) AS total_size,
  pg_size_pretty(pg_relation_size(stat.relid)) AS table_size,
  pg_size_pretty(pg_total_relation_size(stat.relid) - pg_relation_size(stat.relid)) AS index_size
FROM pg_stat_user_tables stat
WHERE stat.relname = ANY(ARRAY[
  'meta_sync_jobs',
  'meta_sync_partitions',
  'meta_sync_runs',
  'meta_sync_checkpoints',
  'meta_sync_state',
  'sync_runner_leases',
  'sync_worker_heartbeats',
  'sync_reclaim_events',
  'meta_raw_snapshots',
  'meta_account_daily',
  'meta_campaign_daily',
  'meta_adset_daily',
  'meta_ad_daily',
  'meta_creative_daily',
  'meta_authoritative_source_manifests',
  'meta_authoritative_slice_versions',
  'meta_authoritative_publication_pointers'
]::text[])
ORDER BY pg_total_relation_size(stat.relid) DESC;
```

## `pg_stat_statements`

Enable it on self-hosted Postgres:

1. Add this to `postgresql.conf` or the relevant managed include file:

```conf
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.max = 10000
pg_stat_statements.track = all
```

2. Restart PostgreSQL.

3. In the target database:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Verify it:

```sql
SELECT extname FROM pg_extension WHERE extname = 'pg_stat_statements';
SELECT COUNT(*) FROM pg_stat_statements;
```

Then inspect Meta-heavy statements:

```sql
SELECT
  queryid::text AS query_id,
  calls::bigint AS calls,
  ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
  ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
  rows::bigint AS rows,
  shared_blks_hit::bigint AS shared_blks_hit,
  shared_blks_read::bigint AS shared_blks_read,
  LEFT(regexp_replace(query, '\s+', ' ', 'g'), 220) AS query
FROM pg_stat_statements
WHERE query ILIKE '%meta_sync_%'
   OR query ILIKE '%meta\_%daily%' ESCAPE '\'
   OR query ILIKE '%sync_runner_leases%'
   OR query ILIKE '%sync_worker_heartbeats%'
ORDER BY total_exec_time DESC
LIMIT 10;
```

## Manual Host-Level Steps

The repo cannot do these automatically:

- set PostgreSQL `shared_preload_libraries`
- restart PostgreSQL
- tune `max_connections`, `shared_buffers`, `effective_cache_size`, `work_mem`, checkpoint settings, or autovacuum
- resize the box or move PostgreSQL off-host
- grant access to `pg_stat_activity` or `pg_stat_statements` views if your DB role is restricted

Host-level knobs that still matter most:

- `max_connections`
- `shared_buffers`
- `effective_cache_size`
- `work_mem`
- `checkpoint_timeout`
- autovacuum cadence and scale factors on the sync tables if they churn heavily

Change one host-level knob at a time, then rerun the repo-managed measurements before making the next change.

## Verify Improvement

Use the same commands before and after every change:

```bash
npm run meta:db:diagnostics -- --out /tmp/meta-db-before.json
npm run meta:drain-rate -- --window-minutes 15 --out /tmp/meta-drain-before.json
```

Apply one change, let the worker run, then:

```bash
npm run meta:db:diagnostics -- --out /tmp/meta-db-after.json
npm run meta:drain-rate -- --window-minutes 15 --out /tmp/meta-drain-after.json
```

Improvement should show up as some combination of:

- lower worker pool waiters
- fewer query timeouts
- fewer retryable or connection errors
- backlog staying `draining` instead of `stalled`
- better `netDrainEstimate`
- smaller lag between queue depth and leased partitions
- cleaner `pg_stat_activity` wait-state summary
