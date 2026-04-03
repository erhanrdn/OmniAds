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

const cleanupTs = "2026-04-03T18:41:17.660Z";

const heartbeat = await q(`
  select worker_id,
         provider_scope,
         status,
         last_business_id,
         last_heartbeat_at,
         round(extract(epoch from (now() - last_heartbeat_at)) / 60.0, 2) as heartbeat_age_min
  from sync_worker_heartbeats
  order by last_heartbeat_at desc
`);

const staleCounts = await q(`
  select business_id,
         checkpoint_scope as scope,
         count(*)::int as stale_running_count,
         min(updated_at) as oldest_updated_at,
         max(updated_at) as newest_updated_at
  from meta_sync_checkpoints
  where status = 'running'
    and updated_at < now() - interval '15 minutes'
  group by business_id, checkpoint_scope
  order by stale_running_count desc, oldest_updated_at asc
`);

const errorSummary = await q(`
  with events as (
    select 'meta_sync_runs'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           error_message,
           attempt_count as retry_count
    from meta_sync_runs
    where status in ('failed', 'cancelled')
      and updated_at >= timestamptz '${cleanupTs}'
    union all
    select 'google_ads_sync_runs'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           error_message,
           attempt_count as retry_count
    from google_ads_sync_runs
    where status in ('failed', 'cancelled')
      and updated_at >= timestamptz '${cleanupTs}'
    union all
    select 'meta_sync_partitions'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           last_error as error_message,
           attempt_count as retry_count
    from meta_sync_partitions
    where status in ('failed', 'dead_letter', 'cancelled')
      and updated_at >= timestamptz '${cleanupTs}'
    union all
    select 'google_ads_sync_partitions'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           last_error as error_message,
           attempt_count as retry_count
    from google_ads_sync_partitions
    where status in ('failed', 'dead_letter', 'cancelled')
      and updated_at >= timestamptz '${cleanupTs}'
  )
  select error_message,
         count(*)::int as occurrences,
         max(event_at) as latest_event_at
  from events
  where nullif(error_message, '') is not null
  group by error_message
  order by occurrences desc, latest_event_at desc
  limit 20
`);

const latestErrors = await q(`
  with events as (
    select 'meta_sync_runs'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           error_message,
           attempt_count as retry_count
    from meta_sync_runs
    where status in ('failed', 'cancelled')
      and updated_at >= timestamptz '${cleanupTs}'
    union all
    select 'google_ads_sync_runs'::text as source_table,
           business_id,
           provider_account_id as account_id,
           scope,
           status,
           updated_at as event_at,
           error_message,
           attempt_count as retry_count
    from google_ads_sync_runs
    where status in ('failed', 'cancelled')
      and updated_at >= timestamptz '${cleanupTs}'
  )
  select *
  from events
  order by event_at desc
  limit 25
`);

console.log(JSON.stringify({ heartbeat, staleCounts, errorSummary, latestErrors }, null, 2));
