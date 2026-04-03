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

const snapshots = await q(`
  select id,
         partition_id,
         checkpoint_id,
         endpoint_name,
         page_index,
         start_date,
         end_date,
         jsonb_array_length(payload_json) as row_count,
         response_headers,
         fetched_at
  from google_ads_raw_snapshots
  where business_id = 'f8a3b5ac-588c-462f-8702-11cd24ff3cd2'
    and provider_account_id = '524-145-5382'
    and endpoint_name = 'campaigns'
  order by fetched_at desc
  limit 20
`);

const checkpoints = await q(`
  select partition_id,
         checkpoint_scope,
         phase,
         status,
         page_index,
         rows_fetched,
         rows_written,
         progress_heartbeat_at,
         updated_at,
         raw_snapshot_ids
  from google_ads_sync_checkpoints
  where business_id = 'f8a3b5ac-588c-462f-8702-11cd24ff3cd2'
    and provider_account_id = '524-145-5382'
    and checkpoint_scope = 'campaign_daily'
  order by updated_at desc
  limit 20
`);

const rowCounts = await q(`
  select date,
         count(*)::int as warehouse_row_count
  from google_ads_campaign_daily
  where business_id = 'f8a3b5ac-588c-462f-8702-11cd24ff3cd2'
    and provider_account_id = '524-145-5382'
  group by date
  order by date desc
  limit 10
`);

const recentRunErrors = await q(`
  select partition_id,
         status,
         attempt_count,
         error_message,
         updated_at
  from google_ads_sync_runs
  where business_id = 'f8a3b5ac-588c-462f-8702-11cd24ff3cd2'
    and provider_account_id = '524-145-5382'
    and scope = 'campaign_daily'
  order by updated_at desc
  limit 15
`);

console.log(JSON.stringify({ snapshots, checkpoints, rowCounts, recentRunErrors }, null, 2));
