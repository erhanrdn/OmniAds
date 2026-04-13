import { createSqlClient } from "./sql-client.mjs";

const sql = createSqlClient(process.env.DATABASE_URL);

try {
  const integrations = await sql.query(
    "SELECT provider, status, count(*)::int AS count FROM integrations WHERE provider='google' GROUP BY provider, status ORDER BY status"
  );
  const assignments = await sql.query(
    "SELECT count(*)::int AS count FROM provider_account_assignments WHERE provider='google'"
  );
  const snapshots = await sql.query(
    "SELECT count(*)::int AS count FROM provider_account_snapshots WHERE provider='google'"
  );
  const legacySnapshots = await sql.query(
    "SELECT count(*)::int AS count FROM provider_reporting_snapshots WHERE provider IN ('google_ads','google_ads_gaql')"
  );
  const legacyJobs = await sql.query(
    "SELECT count(*)::int AS count FROM provider_sync_jobs WHERE provider='google_ads'"
  );
  const warehouseSyncJobs = await sql.query(
    "SELECT count(*)::int AS count FROM google_ads_sync_jobs"
  );

  console.log(
    JSON.stringify(
      {
        integrations,
        assignments: assignments[0],
        snapshots: snapshots[0],
        legacySnapshots: legacySnapshots[0],
        legacyJobs: legacyJobs[0],
        warehouseSyncJobs: warehouseSyncJobs[0],
      },
      null,
      2
    )
  );
} finally {
  await sql.end();
}
