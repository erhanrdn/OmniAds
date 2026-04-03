import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);

if (!match) throw new Error("DATABASE_URL missing");

const sql = neon(match[1]);

const rows = await sql.query(`
  select id,
         business_id,
         provider_account_id as account_id,
         lane,
         scope,
         partition_date,
         status,
         attempt_count,
         lease_owner,
         last_error,
         updated_at
  from google_ads_sync_partitions
  where status = 'queued'
  order by updated_at desc
`);

console.log(JSON.stringify(rows, null, 2));
