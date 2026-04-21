import { loadEnvConfig } from "@next/env";
import { getDb } from "@/lib/db";
import { getConnectedAssignedGoogleAccounts } from "@/lib/google-ads-gaql";
import { getGoogleAdsProductsReport } from "@/lib/google-ads/reporting";
import { upsertGoogleAdsDailyRows } from "@/lib/google-ads/warehouse";
import type { GoogleAdsWarehouseDailyRow } from "@/lib/google-ads/warehouse-types";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";
import { refreshGoogleAdsSyncStateForBusiness } from "@/lib/sync/google-ads-sync";

loadEnvConfig(process.cwd());

function enumerateDays(startDate: string, endDate: string) {
  const days: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function deriveMetrics(input: {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
}) {
  return {
    ctr:
      input.impressions > 0
        ? Number(((input.clicks / input.impressions) * 100).toFixed(2))
        : null,
    cpc: input.clicks > 0 ? Number((input.spend / input.clicks).toFixed(2)) : null,
    cpa:
      input.conversions > 0
        ? Number((input.spend / input.conversions).toFixed(2))
        : null,
    roas: input.spend > 0 ? Number((input.revenue / input.spend).toFixed(2)) : 0,
    conversionRate:
      input.clicks > 0
        ? Number(((input.conversions / input.clicks) * 100).toFixed(2))
        : null,
  };
}

async function getCoveredDates(businessId: string, startDate: string, endDate: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT date::text AS date
    FROM google_ads_product_daily
    WHERE business_id = ${businessId}
      AND date BETWEEN ${startDate}::date AND ${endDate}::date
    ORDER BY date
  ` as Array<{ date: string }>;
  return rows.map((row) => row.date);
}

async function main() {
  const businessId = process.argv[2];
  const startDate = process.argv[3];
  const endDate = process.argv[4];

  if (!businessId || !startDate || !endDate) {
    console.error(
      "usage: node --import tsx scripts/google-ads-fill-missing-product-days.ts <businessId> <startDate> <endDate>"
    );
    process.exit(1);
  }

  const [accountId] = await getConnectedAssignedGoogleAccounts(businessId);
  if (!accountId) {
    throw new Error("No assigned Google Ads account found.");
  }

  const snapshot = await readProviderAccountSnapshot({
    businessId,
    provider: "google",
  }).catch(() => null);
  const account = snapshot?.accounts.find((item) => item.id === accountId);
  const accountTimezone = account?.timezone ?? "UTC";
  const accountCurrency = account?.currency ?? "USD";

  const coveredBefore = await getCoveredDates(businessId, startDate, endDate);
  const missingDates = enumerateDays(startDate, endDate).filter(
    (date) => !new Set(coveredBefore).has(date)
  );

  const results: Array<Record<string, unknown>> = [];

  for (const date of missingDates) {
    const report = await getGoogleAdsProductsReport({
      businessId,
      accountId,
      dateRange: "custom",
      customStart: date,
      customEnd: date,
      debug: false,
      source: "google_ads_manual_fill_products",
      executionMode: "warehouse_sync",
    });

    const warehouseRows = (report.rows ?? []).reduce<GoogleAdsWarehouseDailyRow[]>(
      (rows, row) => {
        const productItemId =
          typeof row.productItemId === "string"
            ? row.productItemId
            : typeof row.itemId === "string"
              ? row.itemId
              : "";
        if (!productItemId) return rows;
        const spend = Number(row.spend ?? 0);
        const revenue = Number(row.revenue ?? 0);
        const conversions = Number(row.conversions ?? row.orders ?? 0);
        const impressions = Number(row.impressions ?? 0);
        const clicks = Number(row.clicks ?? 0);
        const derived = deriveMetrics({
          spend,
          revenue,
          conversions,
          impressions,
          clicks,
        });
        rows.push({
          businessId,
          providerAccountId: accountId,
          date,
          accountTimezone,
          accountCurrency,
          entityKey: productItemId,
          entityLabel:
            typeof row.productTitle === "string"
              ? row.productTitle
              : typeof row.title === "string"
                ? row.title
                : null,
          campaignId: null,
          campaignName: null,
          adGroupId: null,
          adGroupName: null,
          status: null,
          channel: null,
          classification:
            typeof row.scaleState === "string"
              ? row.scaleState
              : typeof row.statusLabel === "string"
                ? row.statusLabel
                : null,
          payloadJson: row,
          spend,
          revenue,
          conversions,
          impressions,
          clicks,
          ctr: derived.ctr,
          cpc: derived.cpc,
          cpa: derived.cpa,
          roas: derived.roas,
          conversionRate: derived.conversionRate,
          interactionRate: null,
          sourceSnapshotId: null,
        } satisfies GoogleAdsWarehouseDailyRow);
        return rows;
      },
      []
    );

    if (warehouseRows.length > 0) {
      await upsertGoogleAdsDailyRows("product_daily", warehouseRows);
    }

    results.push({
      date,
      fetchedRows: report.rows?.length ?? 0,
      writtenRows: warehouseRows.length,
      warnings: report.meta?.warnings ?? [],
    });
  }

  await refreshGoogleAdsSyncStateForBusiness({
    businessId,
    scopes: ["product_daily"],
  }).catch(() => null);

  const coveredAfter = await getCoveredDates(businessId, startDate, endDate);

  console.log(
    JSON.stringify(
      {
        businessId,
        startDate,
        endDate,
        coveredBefore,
        coveredAfter,
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
