import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);

if (!match) throw new Error("DATABASE_URL missing");

const sql = neon(match[1]);

async function q(query) {
  let lastError;
  for (let i = 0; i < 8; i += 1) {
    try {
      return await sql.query(query);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

const result = {};

result.snapshot_time = await q(`select now() as snapshot_time`);

result.velocity = await q(`
  with meta_queued_to_running as (
    select count(*)::int as count
    from meta_sync_checkpoints
    where status = 'running'
      and started_at >= now() - interval '5 minutes'
  ),
  meta_running_to_completed as (
    select count(*)::int as count
    from meta_sync_checkpoints
    where status = 'succeeded'
      and finished_at >= now() - interval '5 minutes'
  ),
  google_queued_to_running as (
    select count(*)::int as count
    from google_ads_sync_checkpoints
    where status = 'running'
      and started_at >= now() - interval '5 minutes'
  ),
  google_running_to_completed as (
    select count(*)::int as count
    from google_ads_sync_checkpoints
    where status = 'succeeded'
      and finished_at >= now() - interval '5 minutes'
  )
  select 'meta'::text as provider,
         (select count from meta_queued_to_running) as queued_to_running_last_5m,
         (select count from meta_running_to_completed) as running_to_completed_last_5m
  union all
  select 'google_ads'::text as provider,
         (select count from google_queued_to_running) as queued_to_running_last_5m,
         (select count from google_running_to_completed) as running_to_completed_last_5m
`);

result.queue_depth_per_business = await q(`
  with target_businesses as (
    select * from (
      values
        ('Grandmix', '5dbc7147-f051-4681-a4d6-20617170074f'),
        ('Halıcızade', '75f65b18-97e5-426c-a791-a8f693d34c84'),
        ('IwaStore', 'f8a3b5ac-588c-462f-8702-11cd24ff3cd2')
    ) as t(business_name, business_id)
  ),
  checkpoint_counts as (
    select business_id,
           count(*) filter (where status = 'pending')::int as queued_count,
           count(*) filter (where status = 'running')::int as running_count,
           count(*) filter (where status = 'succeeded')::int as completed_count,
           count(*) filter (where status in ('failed', 'cancelled'))::int as failed_count,
           max(updated_at) filter (where status = 'running') as last_running_updated_at
    from meta_sync_checkpoints
    where business_id in (select business_id from target_businesses)
    group by business_id
  )
  select tb.business_name,
         tb.business_id,
         coalesce(cc.queued_count, 0) as queued_count,
         coalesce(cc.running_count, 0) as running_count,
         coalesce(cc.completed_count, 0) as completed_count,
         coalesce(cc.failed_count, 0) as failed_count,
         case
           when coalesce(cc.queued_count, 0) + coalesce(cc.running_count, 0) + coalesce(cc.completed_count, 0) + coalesce(cc.failed_count, 0) = 0
             then null
           else round(
             100.0 * coalesce(cc.completed_count, 0)
             / (coalesce(cc.queued_count, 0) + coalesce(cc.running_count, 0) + coalesce(cc.completed_count, 0) + coalesce(cc.failed_count, 0)),
             2
           )
         end as completion_pct,
         cc.last_running_updated_at,
         round(extract(epoch from (now() - cc.last_running_updated_at)) / 60.0, 2) as last_running_touch_min
  from target_businesses tb
  left join checkpoint_counts cc on cc.business_id = tb.business_id
  order by tb.business_name
`);

result.stale_running_over_15m = await q(`
  select business_id,
         provider_account_id as account_id,
         checkpoint_scope as scope,
         phase,
         updated_at,
         round(extract(epoch from (now() - updated_at)) / 60.0, 2) as minutes_since_updated
  from meta_sync_checkpoints
  where status = 'running'
    and updated_at < now() - interval '15 minutes'
  order by updated_at asc
`);

result.heartbeat = await q(`
  select worker_id,
         provider_scope,
         status,
         last_business_id,
         last_heartbeat_at,
         round(extract(epoch from (now() - last_heartbeat_at)) / 60.0, 2) as heartbeat_age_min
  from sync_worker_heartbeats
  order by last_heartbeat_at desc
`);

result.new_failures_since_cleanup = await q(`
  with cleanup_cutoff as (
    select timestamptz '2026-04-03T18:41:17.660Z' as ts
  )
  select source_table,
         business_id,
         account_id,
         scope,
         status,
         event_at,
         error_message,
         retry_count
  from (
    select 'meta_sync_partitions'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           last_error as error_message,
           attempt_count as retry_count
    from meta_sync_partitions, cleanup_cutoff
    where status in ('failed', 'dead_letter', 'cancelled')
      and updated_at >= cleanup_cutoff.ts
    union all
    select 'google_ads_sync_partitions'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           last_error as error_message,
           attempt_count as retry_count
    from google_ads_sync_partitions, cleanup_cutoff
    where status in ('failed', 'dead_letter', 'cancelled')
      and updated_at >= cleanup_cutoff.ts
    union all
    select 'meta_sync_runs'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           error_message,
           attempt_count as retry_count
    from meta_sync_runs, cleanup_cutoff
    where status in ('failed', 'cancelled')
      and updated_at >= cleanup_cutoff.ts
    union all
    select 'google_ads_sync_runs'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           error_message,
           attempt_count as retry_count
    from google_ads_sync_runs, cleanup_cutoff
    where status in ('failed', 'cancelled')
      and updated_at >= cleanup_cutoff.ts
  ) x
  order by event_at desc
  limit 100
`);

result.dead_letter_counts = await q(`
  select 'meta'::text as provider,
         count(*)::int as dead_letter_count
  from meta_sync_partitions
  where status = 'dead_letter'
  union all
  select 'google_ads'::text as provider,
         count(*)::int as dead_letter_count
  from google_ads_sync_partitions
  where status = 'dead_letter'
`);

console.log(JSON.stringify(result, null, 2));
