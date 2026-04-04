import { getDb } from "@/lib/db";
import { queueGoogleAdsSyncPartition } from "@/lib/google-ads/warehouse";
import {
  decideGoogleAdsHistoricalFrontier,
  getGoogleAdsFullSyncPriorityState,
  getGoogleAdsRecent90CompletionState,
} from "@/lib/sync/google-ads-sync";
import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const businessId = process.argv[2];
  if (!businessId) {
    console.error(
      "usage: node --import tsx scripts/google-ads-requeue-stale-core-frontier.ts <businessId>",
    );
    process.exit(1);
  }

  const [fullSyncPriority, recent90State] = await Promise.all([
    getGoogleAdsFullSyncPriorityState({ businessId }),
    getGoogleAdsRecent90CompletionState({ businessId }),
  ]);
  const frontierStart = decideGoogleAdsHistoricalFrontier({
    historicalStart: fullSyncPriority.historicalStart,
    recent90Start: recent90State.recent90Start,
    recent90Complete: recent90State.complete,
  });

  const sql = getDb();
  const staleRows = (await sql.query(
    `
      SELECT
        id,
        provider_account_id,
        lane,
        scope,
        partition_date,
        priority,
        attempt_count,
        source
      FROM google_ads_sync_partitions
      WHERE business_id = $1
        AND lane = 'core'
        AND scope = 'campaign_daily'
        AND status = 'queued'
        AND partition_date < $2::date
      ORDER BY partition_date ASC, updated_at ASC
    `,
    [businessId, frontierStart],
  )) as Array<Record<string, unknown>>;

  const results = [];
  for (const row of staleRows) {
    const providerAccountId = String(row.provider_account_id);
    const stalePartitionId = String(row.id);
    const queued = await queueGoogleAdsSyncPartition({
      businessId,
      providerAccountId,
      lane: "core",
      scope: "campaign_daily",
      partitionDate: frontierStart,
      status: "queued",
      priority: Math.max(120, Number(row.priority ?? 0)),
      source: "selected_range",
      attemptCount: 0,
    });

    const cancelledRows = await sql.query(
      `
        UPDATE google_ads_sync_partitions
        SET
          status = 'cancelled',
          lease_owner = NULL,
          lease_expires_at = NULL,
          finished_at = COALESCE(finished_at, now()),
          last_error = $2,
          updated_at = now()
        WHERE id = $1
          AND status = 'queued'
        RETURNING id
      `,
      [
        stalePartitionId,
        `requeued to frontier ${frontierStart} via selected_range operational fix`,
      ],
    );
    const stalePartitionCancelled =
      Array.isArray(cancelledRows) && cancelledRows.length > 0;

    results.push({
      stalePartitionId,
      stalePartitionDate: String(row.partition_date),
      providerAccountId,
      frontierStart,
      queuedFrontierPartitionId: queued?.id ?? null,
      stalePartitionCancelled,
    });
  }

  console.log(
    JSON.stringify(
      {
        businessId,
        frontierStart,
        matchedCount: staleRows.length,
        rows: results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
