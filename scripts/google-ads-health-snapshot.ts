import { loadEnvConfig } from "@next/env";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

loadEnvConfig(process.cwd());

async function main() {
  const businessId = process.argv[2];
  if (!businessId) {
    console.error("usage: node --import tsx scripts/google-ads-health-snapshot.ts <businessId>");
    process.exit(1);
  }

  await runMigrations();
  const sql = getDb();

  const [partitions, states] = (await Promise.all([
    sql`
      SELECT
        lane,
        scope,
        status,
        COUNT(*)::int AS count,
        MIN(partition_date) AS oldest_partition_date,
        MAX(updated_at) AS latest_activity_at
      FROM google_ads_sync_partitions
      WHERE business_id = ${businessId}
      GROUP BY lane, scope, status
      ORDER BY lane, scope, status
    `,
    sql`
      SELECT
        scope,
        provider_account_id,
        ready_through_date,
        completed_days,
        dead_letter_count,
        latest_background_activity_at,
        latest_successful_sync_at
      FROM google_ads_sync_state
      WHERE business_id = ${businessId}
      ORDER BY scope, provider_account_id
    `,
  ])) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

  console.log(
    JSON.stringify(
      {
        businessId,
        capturedAt: new Date().toISOString(),
        partitions,
        states,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
