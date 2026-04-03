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

const found = await q(`
  with active_google as (
    select distinct business_id, provider_account_id
    from integrations
    where provider = 'google_ads' and status <> 'disconnected'
  )
  select business_id,
         provider_account_id as account_id,
         count(*)::int as orphan_partitions
  from google_ads_sync_partitions p
  where not exists (
    select 1 from active_google a
    where a.business_id = p.business_id and a.provider_account_id = p.provider_account_id
  )
  group by 1, 2
  order by 1, 2
`);

const updated = await q(`
  with active_google as (
    select distinct business_id, provider_account_id
    from integrations
    where provider = 'google_ads' and status <> 'disconnected'
  ),
  changed as (
    update google_ads_sync_partitions p
    set status = 'dead_letter',
        lease_owner = null,
        lease_expires_at = null,
        started_at = null,
        finished_at = now(),
        next_retry_at = null,
        last_error = coalesce(last_error, 'orphaned google ads partition: no active integration'),
        updated_at = now()
    where not exists (
      select 1 from active_google a
      where a.business_id = p.business_id and a.provider_account_id = p.provider_account_id
    )
    returning business_id, provider_account_id
  )
  select business_id, provider_account_id as account_id, count(*)::int as updated_rows
  from changed
  group by 1, 2
  order by 1, 2
`);

const checkpoints = await q(`
  select count(*)::int as remaining_google_checkpoint_rows
  from google_ads_sync_checkpoints
`);

const remaining = await q(`
  with active_google as (
    select distinct business_id, provider_account_id
    from integrations
    where provider = 'google_ads' and status <> 'disconnected'
  )
  select business_id,
         provider_account_id as account_id,
         count(*) filter (where status = 'dead_letter')::int as dead_letter_rows,
         count(*)::int as total_rows
  from google_ads_sync_partitions p
  where not exists (
    select 1 from active_google a
    where a.business_id = p.business_id and a.provider_account_id = p.provider_account_id
  )
  group by 1, 2
  order by 1, 2
`);

console.log(JSON.stringify({ found, updated, checkpoints, remaining }, null, 2));
