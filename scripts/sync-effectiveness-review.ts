import { loadEnvConfig } from "@next/env";
import { getAdminOperationsHealth } from "@/lib/admin-operations-health";
import { runMigrations } from "@/lib/migrations";

loadEnvConfig(process.cwd());

function printSignals(title: string, signals: string[]) {
  console.log(`${title}:`);
  if (signals.length === 0) {
    console.log("- none");
    return;
  }

  for (const signal of signals) {
    console.log(`- ${signal}`);
  }
}

function formatLag(value: number | null) {
  return value == null ? "n/a" : `${value}d`;
}

async function main() {
  const json = process.argv.includes("--json");

  await runMigrations();

  const { syncHealth } = await getAdminOperationsHealth();
  const review = syncHealth.syncEffectivenessReview;

  if (!review) {
    throw new Error("Sync effectiveness review is unavailable.");
  }

  if (json) {
    console.log(JSON.stringify(review, null, 2));
    return;
  }

  console.log("Global sync effectiveness review");
  console.log(`Captured at: ${review.capturedAt}`);
  console.log(`Workflow: ${review.workflow.adminSurface}`);
  console.log(`Review command: ${review.workflow.reviewCommand}`);
  console.log(`Ready means: ${review.workflow.readyMeans}`);
  console.log("");

  for (const [label, providerReview] of [
    ["Google Ads", review.googleAds],
    ["Meta", review.meta],
  ] as const) {
    console.log(label);
    console.log(`- Summary: ${providerReview.summaryState} (${providerReview.summary})`);
    console.log(
      `- Trusted day: ${providerReview.freshness.mostRecentTrustedDay ?? "none"} (lag ${formatLag(providerReview.freshness.lagDays)})`,
    );
    console.log(
      `- Warehouse through: ${providerReview.freshness.warehouseReadyThroughDay ?? "none"} (lag ${formatLag(providerReview.freshness.warehouseLagDays)})`,
    );
    console.log(
      `- Recent progress moved: ${providerReview.freshness.progressMovedRecently ? "yes" : "no"}${providerReview.freshness.latestProgressAt ? ` (${providerReview.freshness.latestProgressAt})` : ""}`,
    );
    console.log(
      `- Coverage: rebuild=${providerReview.coverage.rebuildState}, progressing=${providerReview.coverage.progressingBusinesses}/${providerReview.coverage.totalBusinesses}, stalled=${providerReview.coverage.stalledBusinesses}, ready=${providerReview.coverage.readyBusinesses}`,
    );
    console.log(
      `- Quota: visible=${providerReview.quota.quotaPressurePresent ? "yes" : "no"}, businesses=${providerReview.quota.quotaLimitedBusinesses}, suggests_stall=${providerReview.quota.suggestsQuotaStall ? "yes" : "no"}`,
    );
    if (providerReview.provider === "google_ads") {
      console.log(
        `- Truth health: ${providerReview.truthHealth.summary} support=${providerReview.truthHealth.currentHotWindowSupportBusinesses}/${providerReview.coverage.totalBusinesses}, readyThrough=${providerReview.truthHealth.supportReadyThroughDay ?? "none"}, lag=${formatLag(providerReview.truthHealth.supportLagDays)}`,
      );
    } else {
      console.log(
        `- Truth health: ${providerReview.truthHealth.summary} state=${providerReview.truthHealth.protectedPublishedTruthState}, rows=${providerReview.truthHealth.protectedPublishedRows}, pointers=${providerReview.truthHealth.activePublicationPointerRows}, latestDay=${providerReview.truthHealth.latestProtectedPublishedDay ?? "none"}, lag=${formatLag(providerReview.truthHealth.lagDays)}`,
      );
    }
    printSignals("Signals", providerReview.topSignals);
    console.log("");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
