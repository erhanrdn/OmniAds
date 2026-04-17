import { getDb } from "@/lib/db";
import {
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
} from "./_operational-runtime";

const SCOPES = [
  "account_daily",
  "campaign_daily",
  "search_term_daily",
  "product_daily",
  "asset_group_daily",
  "asset_daily",
  "geo_daily",
  "device_daily",
  "audience_daily",
] as const;

async function main() {
  const runtime = configureOperationalScriptRuntime();
  const businessId = process.argv[2];
  if (!businessId) {
    console.error("usage: node --import tsx scripts/google-ads-state-consistency.ts <businessId>");
    process.exit(1);
  }

  await runOperationalMigrationsIfEnabled(runtime);
  const sql = getDb();

  const results = await Promise.all(
    SCOPES.map(async (scope) => {
      const [stateRows, partitionRows] = (await Promise.all([
        sql`
          SELECT
            provider_account_id,
            completed_days,
            ready_through_date,
            latest_background_activity_at
          FROM google_ads_sync_state
          WHERE business_id = ${businessId}
            AND scope = ${scope}
          ORDER BY provider_account_id
        `,
        sql`
          SELECT
            provider_account_id,
            COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter_count,
            COUNT(*) FILTER (WHERE status IN ('queued', 'leased', 'running'))::int AS active_partition_count,
            MAX(updated_at) AS latest_partition_activity_at
          FROM google_ads_sync_partitions
          WHERE business_id = ${businessId}
            AND scope = ${scope}
          GROUP BY provider_account_id
          ORDER BY provider_account_id
        `,
      ])) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

      const partitionsByAccount = new Map(
        partitionRows.map((row) => [String(row.provider_account_id), row])
      );

      return {
        scope,
        accounts: stateRows.map((stateRow) => {
          const accountId = String(stateRow.provider_account_id);
          const partitionRow = partitionsByAccount.get(accountId);
          return {
            providerAccountId: accountId,
            completedDays: Number(stateRow.completed_days ?? 0),
            readyThroughDate: stateRow.ready_through_date ? String(stateRow.ready_through_date).slice(0, 10) : null,
            latestBackgroundActivityAt: stateRow.latest_background_activity_at
              ? String(stateRow.latest_background_activity_at)
              : null,
            activePartitionCount: Number(partitionRow?.active_partition_count ?? 0),
            deadLetterCount: Number(partitionRow?.dead_letter_count ?? 0),
            latestPartitionActivityAt: partitionRow?.latest_partition_activity_at
              ? String(partitionRow.latest_partition_activity_at)
              : null,
          };
        }),
      };
    })
  );

  console.log(
    JSON.stringify(
      {
        businessId,
        capturedAt: new Date().toISOString(),
        results,
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
