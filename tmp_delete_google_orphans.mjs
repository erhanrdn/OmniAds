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

const before = await q(`
  with active_google as (
    select distinct business_id, provider_account_id
    from integrations
    where provider = 'google_ads' and status <> 'disconnected'
  )
  select business_id, provider_account_id as account_id,
         count(*) filter (where src = 'checkpoint')::int as orphan_checkpoints,
         count(*) filter (where src = 'partition')::int as orphan_partitions
  from (
    select 'checkpoint' as src, business_id, provider_account_id
    from google_ads_sync_checkpoints c
    where not exists (
      select 1 from active_google a
      where a.business_id = c.business_id and a.provider_account_id = c.provider_account_id
    )
    union all
    select 'partition' as src, business_id, provider_account_id
    from google_ads_sync_partitions p
    where not exists (
      select 1 from active_google a
      where a.business_id = p.business_id and a.provider_account_id = p.provider_account_id
    )
  ) t
  group by 1, 2
  order by 1, 2
`);

await q(`
  with active_google as (
    select distinct business_id, provider_account_id
    from integrations
    where provider = 'google_ads' and status <> 'disconnected'
  )
  delete from google_ads_sync_checkpoints c
  where not exists (
    select 1 from active_google a
    where a.business_id = c.business_id and a.provider_account_id = c.provider_account_id
  )
`);

await q(`
  with active_google as (
    select distinct business_id, provider_account_id
    from integrations
    where provider = 'google_ads' and status <> 'disconnected'
  )
  delete from google_ads_sync_partitions p
  where not exists (
    select 1 from active_google a
    where a.business_id = p.business_id and a.provider_account_id = p.provider_account_id
  )
`);

const after = await q(`
  with active_google as (
    select distinct business_id, provider_account_id
    from integrations
    where provider = 'google_ads' and status <> 'disconnected'
  )
  select business_id, provider_account_id as account_id,
         count(*) filter (where src = 'checkpoint')::int as orphan_checkpoints,
         count(*) filter (where src = 'partition')::int as orphan_partitions
  from (
    select 'checkpoint' as src, business_id, provider_account_id
    from google_ads_sync_checkpoints c
    where not exists (
      select 1 from active_google a
      where a.business_id = c.business_id and a.provider_account_id = c.provider_account_id
    )
    union all
    select 'partition' as src, business_id, provider_account_id
    from google_ads_sync_partitions p
    where not exists (
      select 1 from active_google a
      where a.business_id = p.business_id and a.provider_account_id = p.provider_account_id
    )
  ) t
  group by 1, 2
  order by 1, 2
`);

const totals = await q(`
  select 'checkpoints' as table_name, count(*)::int as row_count from google_ads_sync_checkpoints
  union all
  select 'partitions' as table_name, count(*)::int as row_count from google_ads_sync_partitions
`);

console.log(JSON.stringify({ before, after, totals }, null, 2));
