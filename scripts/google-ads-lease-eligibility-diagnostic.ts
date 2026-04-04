import { getDb } from "@/lib/db";
import {
  getGoogleAdsFullSyncPriorityState,
  getGoogleAdsIncidentPolicy,
  getGoogleAdsRecent90CompletionState,
  getGoogleAdsWorkerSchedulingState,
} from "@/lib/sync/google-ads-sync";
import { getGoogleAdsQueueHealth } from "@/lib/google-ads/warehouse";
import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const businessId = process.argv[2];
  if (!businessId) {
    console.error(
      "usage: node --import tsx scripts/google-ads-lease-eligibility-diagnostic.ts <businessId>",
    );
    process.exit(1);
  }

  const sql = getDb();
  const [queuedRows, queueHealth, fullSyncPriority, recent90State, workerState] =
    await Promise.all([
      sql.query(
        `
          SELECT
            lane,
            source,
            partition_date,
            priority,
            provider_account_id,
            attempt_count,
            next_retry_at,
            created_at,
            updated_at
          FROM google_ads_sync_partitions
          WHERE business_id = $1
            AND scope = 'campaign_daily'
            AND status = 'queued'
          ORDER BY lane ASC, source ASC, partition_date DESC, updated_at ASC
        `,
        [businessId],
      ),
      getGoogleAdsQueueHealth({ businessId }).catch(() => null),
      getGoogleAdsFullSyncPriorityState({ businessId }).catch(() => null),
      getGoogleAdsRecent90CompletionState({ businessId }).catch(() => null),
      getGoogleAdsWorkerSchedulingState({ businessId }).catch(() => null),
    ]);

  const incidentPolicy = await getGoogleAdsIncidentPolicy({
    businessId,
    queueHealth,
  }).catch(() => null);

  console.log(
    JSON.stringify(
      {
        businessId,
        queuedCampaignDailyRows: queuedRows,
        queueHealth,
        fullSyncPriority,
        recent90State,
        workerSchedulingState: workerState,
        incidentPolicy,
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
