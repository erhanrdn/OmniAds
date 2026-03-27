import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/DATABASE_URL="([^"]+)"/);
const sql = neon(m[1]);
const businesses = {
  iwastore: 'f8a3b5ac-588c-462f-8702-11cd24ff3cd2',
  bilsem: '6c690fa4-6395-40b5-9755-e99b34d69bc3'
};
for (const [name, id] of Object.entries(businesses)) {
  const coverage = await sql.query(`select min(date)::text as first_date, max(date)::text as last_date, count(distinct date)::int as day_count from meta_account_daily where business_id = '${id}'`);
  const jobs = await sql.query(`select sync_type, scope, status, progress_percent, trigger_source, start_date, end_date, triggered_at, started_at, finished_at, last_error from meta_sync_jobs where business_id = '${id}' order by triggered_at desc limit 15`);
  const integrations = await sql.query(`select provider, status, connected_at, updated_at from provider_integrations where business_id = '${id}' and provider = 'meta'`);
  const assignments = await sql.query(`select provider_account_id, updated_at from provider_account_assignments where business_id = '${id}' and provider = 'meta' order by updated_at desc`);
  console.log('\nBUSINESS', name.toUpperCase());
  console.log('COVERAGE', JSON.stringify(coverage, null, 2));
  console.log('INTEGRATION', JSON.stringify(integrations, null, 2));
  console.log('ASSIGNMENTS', JSON.stringify(assignments, null, 2));
  console.log('JOBS', JSON.stringify(jobs, null, 2));
}
