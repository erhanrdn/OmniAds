import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/DATABASE_URL="([^"]+)"/);
const sql = neon(m[1]);
const rows = await sql.query("select sync_type, scope, status, progress_percent, start_date, end_date, triggered_at, started_at, finished_at, last_error from meta_sync_jobs where business_id = '6c690fa4-6395-40b5-9755-e99b34d69bc3' and status in ('running','pending','failed','cancelled') order by triggered_at desc limit 20");
console.log(JSON.stringify(rows, null, 2));
