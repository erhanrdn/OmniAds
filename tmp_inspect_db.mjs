import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);

if (!match) throw new Error("DATABASE_URL missing");

const sql = neon(match[1]);

const activity = await sql.query(`
  select pid,
         state,
         wait_event_type,
         wait_event,
         now() - query_start as duration,
         query
  from pg_stat_activity
  where state != 'idle'
  order by duration desc
  limit 15
`);

const googleCounts = await sql.query(`
  select 'checkpoints' as table_name, count(*)::int as row_count
  from google_ads_sync_checkpoints
  union all
  select 'partitions' as table_name, count(*)::int as row_count
  from google_ads_sync_partitions
`);

console.log(JSON.stringify({ activity, googleCounts }, null, 2));
