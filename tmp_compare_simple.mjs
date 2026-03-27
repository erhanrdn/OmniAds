import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/DATABASE_URL="([^"]+)"/);
const sql = neon(m[1]);
const ids = {
  IwaStore: 'f8a3b5ac-588c-462f-8702-11cd24ff3cd2',
  'Bilsem Zeka': '6c690fa4-6395-40b5-9755-e99b34d69bc3'
};
for (const [name, id] of Object.entries(ids)) {
  const coverage = await sql.query(`select min(date)::text as first_date, max(date)::text as last_date, count(distinct date)::int as day_count from meta_account_daily where business_id = '${id}'`);
  const jobs = await sql.query(`select sync_type, status, progress_percent, trigger_source, start_date, end_date, triggered_at, finished_at from meta_sync_jobs where business_id = '${id}' order by triggered_at desc limit 12`);
  console.log('\n' + name);
  console.log('coverage=', JSON.stringify(coverage, null, 2));
  console.log('jobs=', JSON.stringify(jobs, null, 2));
}
