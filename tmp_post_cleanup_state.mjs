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

const providerCheckpointCounts = await q(`
  with counts as (
    select 'meta'::text as provider, status, count(*)::int as count
    from meta_sync_checkpoints
    group by status
    union all
    select 'google_ads'::text as provider, status, count(*)::int as count
    from google_ads_sync_checkpoints
    group by status
  )
  select provider,
         coalesce(sum(count) filter (where status = 'queued'), 0)::int as queued,
         coalesce(sum(count) filter (where status = 'running'), 0)::int as running,
         coalesce(sum(count) filter (where status in ('succeeded', 'completed')), 0)::int as completed,
         coalesce(sum(count) filter (where status = 'failed'), 0)::int as failed
  from counts
  group by provider
  order by provider
`);

const providerPartitionCounts = await q(`
  with counts as (
    select 'meta'::text as provider, status, count(*)::int as count
    from meta_sync_partitions
    group by status
    union all
    select 'google_ads'::text as provider, status, count(*)::int as count
    from google_ads_sync_partitions
    group by status
  )
  select provider,
         coalesce(sum(count) filter (where status = 'queued'), 0)::int as queued,
         coalesce(sum(count) filter (where status in ('running', 'leased')), 0)::int as running,
         coalesce(sum(count) filter (where status = 'succeeded'), 0)::int as completed,
         coalesce(sum(count) filter (where status in ('failed', 'dead_letter', 'cancelled')), 0)::int as failed
  from counts
  group by provider
  order by provider
`);

const metaRunningSummary = await q(`
  select checkpoint_scope as scope,
         count(*)::int as running_count,
         min(updated_at) as oldest_updated_at,
         max(updated_at) as newest_updated_at
  from meta_sync_checkpoints
  where status = 'running'
  group by checkpoint_scope
  order by checkpoint_scope
`);

const metaRunningRecent = await q(`
  select business_id,
         provider_account_id as account_id,
         checkpoint_scope as scope,
         phase,
         updated_at,
         round(extract(epoch from (now() - updated_at)) / 60.0, 2) as minutes_since_updated
  from meta_sync_checkpoints
  where status = 'running'
  order by updated_at desc
  limit 20
`);

const pickupLast5m = await q(`
  select 'meta_checkpoints'::text as source,
         count(*)::int as transitioned_last_5m,
         max(updated_at) as latest_transition_at
  from meta_sync_checkpoints
  where status = 'running'
    and updated_at >= now() - interval '5 minutes'
  union all
  select 'meta_partitions'::text as source,
         count(*)::int as transitioned_last_5m,
         max(updated_at) as latest_transition_at
  from meta_sync_partitions
  where status in ('leased', 'running')
    and updated_at >= now() - interval '5 minutes'
  union all
  select 'google_checkpoints'::text as source,
         count(*)::int as transitioned_last_5m,
         max(updated_at) as latest_transition_at
  from google_ads_sync_checkpoints
  where status = 'running'
    and updated_at >= now() - interval '5 minutes'
  union all
  select 'google_partitions'::text as source,
         count(*)::int as transitioned_last_5m,
         max(updated_at) as latest_transition_at
  from google_ads_sync_partitions
  where status in ('leased', 'running')
    and updated_at >= now() - interval '5 minutes'
`);

const pgStatActivity = await q(`
  select pid,
         usename,
         application_name,
         client_addr,
         state,
         wait_event_type,
         wait_event,
         now() - query_start as duration,
         query
  from pg_stat_activity
  where state != 'idle'
  order by duration desc
  limit 20
`);

const pgSettings = await q(`
  select name, setting, unit
  from pg_settings
  where name in ('work_mem', 'max_parallel_workers', 'shared_buffers')
  order by name
`);

console.log(
  JSON.stringify(
    {
      providerCheckpointCounts,
      providerPartitionCounts,
      metaRunningSummary,
      metaRunningRecent,
      pickupLast5m,
      pgStatActivity,
      pgSettings,
    },
    null,
    2
  )
);
