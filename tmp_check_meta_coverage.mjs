import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/DATABASE_URL="([^"]+)"/);
const sql = neon(m[1]);
const rows = await sql.query("select min(date)::text as first_date, max(date)::text as last_date, count(distinct date)::int as day_count from meta_account_daily where business_id = '6c690fa4-6395-40b5-9755-e99b34d69bc3'");
console.log(JSON.stringify(rows, null, 2));
