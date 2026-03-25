import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoGoogleAdsAdvisor } from "@/lib/demo-business";
import { buildGoogleGrowthAdvisor } from "@/lib/google-ads/growth-advisor";
import { parseGoogleAdsRequestParams } from "@/lib/google-ads-request-params";
import {
  getGoogleAdsAssetGroupsReport,
  getGoogleAdsAssetsReport,
  getGoogleAdsCampaignsReport,
  getGoogleAdsDevicesReport,
  getGoogleAdsGeoReport,
  getGoogleAdsProductsReport,
  getGoogleAdsSearchIntelligenceReport,
} from "@/lib/google-ads/reporting";
import { getCachedRouteReport, setCachedRouteReport } from "@/lib/route-report-cache";

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function endDateFromRequest(customEnd?: string | null) {
  if (customEnd) {
    return new Date(`${customEnd}T00:00:00Z`);
  }
  return new Date();
}

function buildWindow(endDate: Date, days: number) {
  const end = new Date(endDate);
  const start = new Date(endDate);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    dateRange: "custom" as const,
    customStart: toIsoDate(start),
    customEnd: toIsoDate(end),
    label: `last${days}`,
  };
}

export async function GET(request: NextRequest) {
  const { businessId, accountId, customEnd, debug } = parseGoogleAdsRequestParams(
    request.nextUrl.searchParams
  );

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsAdvisor());
  }

  const cached = await getCachedRouteReport<Record<string, unknown>>({
    businessId,
    provider: "google_ads",
    reportType: "google_ads_growth_advisor_v2",
    searchParams: request.nextUrl.searchParams,
  });
  if (cached) return NextResponse.json(cached);

  const endDate = endDateFromRequest(customEnd);
  const selectedWindow = buildWindow(endDate, Number(request.nextUrl.searchParams.get("dateRange") ?? "14") || 14);
  const last3 = buildWindow(endDate, 3);
  const last7 = buildWindow(endDate, 7);
  const last14 = buildWindow(endDate, 14);
  const last30 = buildWindow(endDate, 30);
  const last90 = buildWindow(endDate, 90);
  const allHistoryStart = new Date(endDate);
  allHistoryStart.setUTCDate(allHistoryStart.getUTCDate() - 364);
  const allHistory = {
    dateRange: "custom" as const,
    customStart: toIsoDate(allHistoryStart),
    customEnd: toIsoDate(endDate),
    label: "all-history",
  };

  const selectedParams = {
    businessId,
    accountId,
    dateRange: selectedWindow.dateRange,
    customStart: selectedWindow.customStart,
    customEnd: selectedWindow.customEnd,
    debug,
  };

  const [
    selectedCampaigns,
    selectedSearch,
    selectedProducts,
    selectedAssets,
    selectedAssetGroups,
    selectedGeos,
    selectedDevices,
    last3Campaigns,
    last3Search,
    last3Products,
    last7Campaigns,
    last7Search,
    last7Products,
    last14Campaigns,
    last14Search,
    last14Products,
    last30Campaigns,
    last30Search,
    last30Products,
    last90Campaigns,
    last90Search,
    last90Products,
    allCampaigns,
    allSearch,
    allProducts,
  ] = await Promise.all([
    getGoogleAdsCampaignsReport(selectedParams),
    getGoogleAdsSearchIntelligenceReport(selectedParams),
    getGoogleAdsProductsReport(selectedParams),
    getGoogleAdsAssetsReport(selectedParams),
    getGoogleAdsAssetGroupsReport(selectedParams),
    getGoogleAdsGeoReport(selectedParams),
    getGoogleAdsDevicesReport(selectedParams),
    getGoogleAdsCampaignsReport({ businessId, accountId, dateRange: last3.dateRange, customStart: last3.customStart, customEnd: last3.customEnd, debug }),
    getGoogleAdsSearchIntelligenceReport({ businessId, accountId, dateRange: last3.dateRange, customStart: last3.customStart, customEnd: last3.customEnd, debug }),
    getGoogleAdsProductsReport({ businessId, accountId, dateRange: last3.dateRange, customStart: last3.customStart, customEnd: last3.customEnd, debug }),
    getGoogleAdsCampaignsReport({ businessId, accountId, dateRange: last7.dateRange, customStart: last7.customStart, customEnd: last7.customEnd, debug }),
    getGoogleAdsSearchIntelligenceReport({ businessId, accountId, dateRange: last7.dateRange, customStart: last7.customStart, customEnd: last7.customEnd, debug }),
    getGoogleAdsProductsReport({ businessId, accountId, dateRange: last7.dateRange, customStart: last7.customStart, customEnd: last7.customEnd, debug }),
    getGoogleAdsCampaignsReport({ businessId, accountId, dateRange: last14.dateRange, customStart: last14.customStart, customEnd: last14.customEnd, debug }),
    getGoogleAdsSearchIntelligenceReport({ businessId, accountId, dateRange: last14.dateRange, customStart: last14.customStart, customEnd: last14.customEnd, debug }),
    getGoogleAdsProductsReport({ businessId, accountId, dateRange: last14.dateRange, customStart: last14.customStart, customEnd: last14.customEnd, debug }),
    getGoogleAdsCampaignsReport({ businessId, accountId, dateRange: last30.dateRange, customStart: last30.customStart, customEnd: last30.customEnd, debug }),
    getGoogleAdsSearchIntelligenceReport({ businessId, accountId, dateRange: last30.dateRange, customStart: last30.customStart, customEnd: last30.customEnd, debug }),
    getGoogleAdsProductsReport({ businessId, accountId, dateRange: last30.dateRange, customStart: last30.customStart, customEnd: last30.customEnd, debug }),
    getGoogleAdsCampaignsReport({ businessId, accountId, dateRange: last90.dateRange, customStart: last90.customStart, customEnd: last90.customEnd, debug }),
    getGoogleAdsSearchIntelligenceReport({ businessId, accountId, dateRange: last90.dateRange, customStart: last90.customStart, customEnd: last90.customEnd, debug }),
    getGoogleAdsProductsReport({ businessId, accountId, dateRange: last90.dateRange, customStart: last90.customStart, customEnd: last90.customEnd, debug }),
    getGoogleAdsCampaignsReport({ businessId, accountId, dateRange: allHistory.dateRange, customStart: allHistory.customStart, customEnd: allHistory.customEnd, debug }),
    getGoogleAdsSearchIntelligenceReport({ businessId, accountId, dateRange: allHistory.dateRange, customStart: allHistory.customStart, customEnd: allHistory.customEnd, debug }),
    getGoogleAdsProductsReport({ businessId, accountId, dateRange: allHistory.dateRange, customStart: allHistory.customStart, customEnd: allHistory.customEnd, debug }),
  ]);

  const advisor = buildGoogleGrowthAdvisor({
    selectedLabel: `selected ${request.nextUrl.searchParams.get("dateRange") ?? "14"}d`,
    selectedCampaigns: selectedCampaigns.rows,
    selectedSearchTerms: selectedSearch.rows,
    selectedProducts: selectedProducts.rows,
    selectedAssets: selectedAssets.rows,
    selectedAssetGroups: selectedAssetGroups.rows,
    selectedGeos: selectedGeos.rows,
    selectedDevices: selectedDevices.rows,
    windows: [
      { key: "last3", label: "last 3d", campaigns: last3Campaigns.rows, searchTerms: last3Search.rows, products: last3Products.rows },
      { key: "last7", label: "last 7d", campaigns: last7Campaigns.rows, searchTerms: last7Search.rows, products: last7Products.rows },
      { key: "last14", label: "last 14d", campaigns: last14Campaigns.rows, searchTerms: last14Search.rows, products: last14Products.rows },
      { key: "last30", label: "last 30d", campaigns: last30Campaigns.rows, searchTerms: last30Search.rows, products: last30Products.rows },
      { key: "last90", label: "last 90d", campaigns: last90Campaigns.rows, searchTerms: last90Search.rows, products: last90Products.rows },
      { key: "all_history", label: "all history", campaigns: allCampaigns.rows, searchTerms: allSearch.rows, products: allProducts.rows },
    ],
  });

  const payload = {
    ...advisor,
    meta: {
      selectedCampaigns: selectedCampaigns.rows.length,
      selectedSearchTerms: selectedSearch.rows.length,
      selectedProducts: selectedProducts.rows.length,
      selectedAssets: selectedAssets.rows.length,
    },
  };

  await setCachedRouteReport({
    businessId,
    provider: "google_ads",
    reportType: "google_ads_growth_advisor_v2",
    searchParams: request.nextUrl.searchParams,
    payload,
  });

  return NextResponse.json(payload);
}
