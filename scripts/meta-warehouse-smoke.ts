import { getMetaWarehouseCampaigns, getMetaWarehouseSummary, getMetaWarehouseTrends } from "@/lib/meta/serving";
import { getLatestMetaSyncHealth } from "@/lib/meta/warehouse";
import { syncMetaRecent, syncMetaToday } from "@/lib/sync/meta-sync";

export async function main() {
  const businessId = process.argv[2];
  const startDate = process.argv[3];
  const endDate = process.argv[4];
  const shouldSyncRecent = process.argv.includes("--sync-recent");
  const shouldSyncToday = process.argv.includes("--sync-today");

  if (!businessId || !startDate || !endDate) {
    console.error("Usage: npx tsx scripts/meta-warehouse-smoke.ts <businessId> <startDate> <endDate> [--sync-recent] [--sync-today]");
    process.exit(1);
  }

  if (shouldSyncRecent) {
    const result = await syncMetaRecent(businessId);
    console.log("sync_recent", JSON.stringify(result, null, 2));
  }

  if (shouldSyncToday) {
    const result = await syncMetaToday(businessId);
    console.log("sync_today", JSON.stringify(result, null, 2));
  }

  const [summary, trends, campaigns, health] = await Promise.all([
    getMetaWarehouseSummary({ businessId, startDate, endDate }),
    getMetaWarehouseTrends({ businessId, startDate, endDate }),
    getMetaWarehouseCampaigns({ businessId, startDate, endDate }),
    getLatestMetaSyncHealth({ businessId, providerAccountId: null }),
  ]);

  console.log(
    JSON.stringify(
      {
        businessId,
        startDate,
        endDate,
        summary: {
          freshness: summary.freshness,
          totals: summary.totals,
          accountCount: summary.accounts.length,
        },
        trends: {
          freshness: trends.freshness,
          pointCount: trends.points.length,
          firstPoint: trends.points[0] ?? null,
          lastPoint: trends.points.at(-1) ?? null,
        },
        campaigns: {
          freshness: campaigns.freshness,
          rowCount: campaigns.rows.length,
          topRow: campaigns.rows[0] ?? null,
        },
        latestSync: health,
      },
      null,
      2
    )
  );
}

if (process.argv[1] && process.argv[1].endsWith("meta-warehouse-smoke.ts")) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exit(1);
  });
}
