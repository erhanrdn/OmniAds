import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);

if (!match) {
  throw new Error("DATABASE_URL missing");
}

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

result.google_integrations = await q(`
  select business_id, provider_account_id as account_id, status, updated_at
  from integrations
  where provider = 'google_ads'
  order by business_id, provider_account_id
`);

result.step3_found = await q(`
  with active_google as (
    select distinct business_id, provider_account_id
    from integrations
    where provider = 'google_ads' and status <> 'disconnected'
  )
  select business_id, provider_account_id as account_id,
         count(*) filter (where src = 'checkpoint')::int as found_checkpoints,
         count(*) filter (where src = 'partition')::int as found_partitions
  from (
    select 'checkpoint' as src, business_id, provider_account_id
    from google_ads_sync_checkpoints c
    where not exists (
      select 1
      from active_google a
      where a.business_id = c.business_id
        and a.provider_account_id = c.provider_account_id
    )
    union all
    select 'partition' as src, business_id, provider_account_id
    from google_ads_sync_partitions p
    where not exists (
      select 1
      from active_google a
      where a.business_id = p.business_id
        and a.provider_account_id = p.provider_account_id
    )
  ) t
  group by 1, 2
  order by 1, 2
`);

result.deleted_checkpoint_rows = (
  await q(`
    with active_google as (
      select distinct business_id, provider_account_id
      from integrations
      where provider = 'google_ads' and status <> 'disconnected'
    )
    delete from google_ads_sync_checkpoints c
    where not exists (
      select 1
      from active_google a
      where a.business_id = c.business_id
        and a.provider_account_id = c.provider_account_id
    )
    returning 1
  `)
).length;

result.deleted_partition_rows = (
  await q(`
    with active_google as (
      select distinct business_id, provider_account_id
      from integrations
      where provider = 'google_ads' and status <> 'disconnected'
    )
    delete from google_ads_sync_partitions p
    where not exists (
      select 1
      from active_google a
      where a.business_id = p.business_id
        and a.provider_account_id = p.provider_account_id
    )
    returning 1
  `)
).length;

result.step3_remaining = await q(`
  with active_google as (
    select distinct business_id, provider_account_id
    from integrations
    where provider = 'google_ads' and status <> 'disconnected'
  )
  select business_id, provider_account_id as account_id,
         count(*) filter (where src = 'checkpoint')::int as remaining_checkpoints,
         count(*) filter (where src = 'partition')::int as remaining_partitions
  from (
    select 'checkpoint' as src, business_id, provider_account_id
    from google_ads_sync_checkpoints c
    where not exists (
      select 1
      from active_google a
      where a.business_id = c.business_id
        and a.provider_account_id = c.provider_account_id
    )
    union all
    select 'partition' as src, business_id, provider_account_id
    from google_ads_sync_partitions p
    where not exists (
      select 1
      from active_google a
      where a.business_id = p.business_id
        and a.provider_account_id = p.provider_account_id
    )
  ) t
  group by 1, 2
  order by 1, 2
`);

result.provider_counts = await q(`
  with provider_counts as (
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
  from provider_counts
  group by provider
  order by provider
`);

result.meta_running_summary = await q(`
  select checkpoint_scope as scope,
         count(*)::int as running_count,
         min(updated_at) as oldest_updated_at,
         max(updated_at) as newest_updated_at
  from meta_sync_checkpoints
  where status = 'running'
  group by checkpoint_scope
  order by checkpoint_scope
`);

result.meta_running_recent = await q(`
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

result.pickup_last_5m = await q(`
  select 'meta'::text as provider,
         count(*)::int as transitioned_last_5m,
         max(updated_at) as latest_transition_at
  from meta_sync_checkpoints
  where status = 'running'
    and updated_at >= now() - interval '5 minutes'
  union all
  select 'google_ads'::text as provider,
         count(*)::int as transitioned_last_5m,
         max(updated_at) as latest_transition_at
  from google_ads_sync_checkpoints
  where status = 'running'
    and updated_at >= now() - interval '5 minutes'
`);

result.pg_stat_activity = await q(`
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

result.pg_settings = await q(`
  select name, setting, unit
  from pg_settings
  where name in ('work_mem', 'max_parallel_workers', 'shared_buffers')
  order by name
`);

console.log(JSON.stringify(result, null, 2));
