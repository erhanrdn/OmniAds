import { loadEnvConfig } from "@next/env";
import { getConnectedAssignedGoogleAccounts } from "@/lib/google-ads-gaql";
import { getGoogleAdsAssetsReport } from "@/lib/google-ads/reporting";
import { getDb } from "@/lib/db";
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
  interactionRate?: number | null;
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
    interactionRate: input.interactionRate ?? null,
  };
}

async function getCoveredDates(businessId: string, startDate: string, endDate: string) {
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT date::text AS date
    FROM google_ads_asset_daily
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
      "usage: node --import tsx scripts/google-ads-fill-missing-asset-days.ts <businessId> <startDate> <endDate>"
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
  const coveredSet = new Set(coveredBefore);
  const missingDates = enumerateDays(startDate, endDate).filter((date) => !coveredSet.has(date));

  const results: Array<Record<string, unknown>> = [];

  for (const date of missingDates) {
    const report = await getGoogleAdsAssetsReport({
      businessId,
      accountId,
      dateRange: "custom",
      customStart: date,
      customEnd: date,
      debug: false,
      source: "google_ads_manual_fill_assets",
      executionMode: "warehouse_sync",
    });

    const aggregated = (report.rows ?? []).reduce<Map<string, GoogleAdsWarehouseDailyRow>>(
      (rows, row) => {
        const assetId =
          typeof row.assetId === "string"
            ? row.assetId
            : typeof row.id === "string"
              ? row.id
              : "";
        if (!assetId) return rows;
        const spend = Number(row.spend ?? 0);
        const revenue = Number(row.revenue ?? 0);
        const conversions = Number(row.conversions ?? 0);
        const impressions = Number(row.impressions ?? 0);
        const clicks = Number(row.clicks ?? 0);
        const derived = deriveMetrics({
          spend,
          revenue,
          conversions,
          impressions,
          clicks,
          interactionRate:
            typeof row.interactionRate === "number" ? row.interactionRate : null,
        });

        const current = rows.get(assetId);
        const next: GoogleAdsWarehouseDailyRow = {
          businessId,
          providerAccountId: accountId,
          date,
          accountTimezone,
          accountCurrency,
          entityKey: assetId,
          entityLabel:
            typeof row.assetName === "string" && row.assetName.trim().length > 0
              ? row.assetName
              : typeof row.assetText === "string" && row.assetText.trim().length > 0
                ? row.assetText
                : typeof row.preview === "string" && row.preview.trim().length > 0
                  ? row.preview
                  : typeof row.assetGroupName === "string"
                    ? row.assetGroupName
                    : null,
          campaignId: typeof row.campaignId === "string" ? row.campaignId : null,
          campaignName:
            typeof row.campaignName === "string"
              ? row.campaignName
              : typeof row.campaign === "string"
                ? row.campaign
                : null,
          adGroupId:
            typeof row.assetGroupId === "string"
              ? row.assetGroupId
              : typeof row.assetGroupIdString === "string"
                ? row.assetGroupIdString
                : null,
          adGroupName:
            typeof row.assetGroupName === "string"
              ? row.assetGroupName
              : typeof row.assetGroup === "string"
                ? row.assetGroup
                : null,
          status: null,
          channel: null,
          classification:
            typeof row.performanceLabel === "string"
              ? row.performanceLabel
              : typeof row.classification === "string"
                ? row.classification
                : null,
          payloadJson: row,
          spend: current ? current.spend + spend : spend,
          revenue: current ? current.revenue + revenue : revenue,
          conversions: current ? current.conversions + conversions : conversions,
          impressions: current ? current.impressions + impressions : impressions,
          clicks: current ? current.clicks + clicks : clicks,
          ctr: derived.ctr,
          cpc: derived.cpc,
          cpa: derived.cpa,
          roas: derived.roas,
          conversionRate: derived.conversionRate,
          interactionRate: derived.interactionRate,
          sourceSnapshotId: null,
        };
        rows.set(assetId, next);
        return rows;
      },
      new Map()
    );
    const warehouseRows = Array.from(aggregated.values()).map((row) => {
      const derived = deriveMetrics({
        spend: row.spend,
        revenue: row.revenue,
        conversions: row.conversions,
        impressions: row.impressions,
        clicks: row.clicks,
        interactionRate: row.interactionRate,
      });
      return {
        ...row,
        ctr: derived.ctr,
        cpc: derived.cpc,
        cpa: derived.cpa,
        roas: derived.roas,
        conversionRate: derived.conversionRate,
        interactionRate: derived.interactionRate,
      };
    });

    if (warehouseRows.length > 0) {
      await upsertGoogleAdsDailyRows("asset_daily", warehouseRows);
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
    scopes: ["asset_daily"],
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
