import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/DATABASE_URL="([^"]+)"/);
const sql = neon(m[1]);
const cols = await sql.query("select column_name from information_schema.columns where table_name = 'meta_sync_jobs' order by ordinal_position");
console.log('COLUMNS', JSON.stringify(cols, null, 2));
const rows = await sql.query("select * from meta_sync_jobs where business_id = '6c690fa4-6395-40b5-9755-e99b34d69bc3' order by triggered_at desc limit 10");
console.log('ROWS', JSON.stringify(rows, null, 2));
