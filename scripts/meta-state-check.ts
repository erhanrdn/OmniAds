import { loadEnvConfig } from "@next/env";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { getMetaQueueComposition } from "@/lib/meta/warehouse";
import { getMetaAuthoritativeBusinessOpsSnapshot } from "@/lib/meta/warehouse";
import { buildMetaStateCheckOutput } from "@/lib/meta/authoritative-ops";

loadEnvConfig(process.cwd());

const SCOPES = ["account_daily", "adset_daily", "creative_daily", "ad_daily"] as const;

function normalizeDateValue(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTimestampValue(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

async function main() {
  const businessId = process.argv[2];
  if (!businessId) {
    console.error("usage: node --import tsx scripts/meta-state-check.ts <businessId>");
    process.exit(1);
  }

  await runMigrations();
  const sql = getDb();
  const [queueComposition, authoritativeSnapshot, results] = await Promise.all([
    getMetaQueueComposition({ businessId }).catch(() => null),
    getMetaAuthoritativeBusinessOpsSnapshot({ businessId }).catch(() => null),
    Promise.all(
      SCOPES.map(async (scope) => {
        const [stateRows, partitionRows] = (await Promise.all([
          sql`
            SELECT provider_account_id, completed_days, ready_through_date, latest_background_activity_at
            FROM meta_sync_state
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
            FROM meta_sync_partitions
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
              readyThroughDate: normalizeDateValue(stateRow.ready_through_date),
              latestBackgroundActivityAt: normalizeTimestampValue(stateRow.latest_background_activity_at),
              activePartitionCount: Number(partitionRow?.active_partition_count ?? 0),
              deadLetterCount: Number(partitionRow?.dead_letter_count ?? 0),
              latestPartitionActivityAt: normalizeTimestampValue(partitionRow?.latest_partition_activity_at),
            };
          }),
        };
      })
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        businessId,
        capturedAt: new Date().toISOString(),
        queueComposition,
        authoritative: authoritativeSnapshot
          ? buildMetaStateCheckOutput(authoritativeSnapshot)
          : null,
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
