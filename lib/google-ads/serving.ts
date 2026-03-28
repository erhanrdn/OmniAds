import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getDateRangeForQuery } from "@/lib/google-ads-gaql";
import { getComparisonWindow, pctDelta } from "@/lib/google-ads/reporting-support";
import { buildGoogleAdsAdvisorWindows } from "@/lib/google-ads/advisor-windows";
import { getCampaignBadges, generateOverviewInsights, type GadsCampaignRow } from "@/lib/google-ads-intelligence";
import { buildGoogleGrowthAdvisor } from "@/lib/google-ads/growth-advisor";
import { buildGoogleAdsOpportunityEngine, type GoogleAdsOpportunity } from "@/lib/google-ads/opportunity-engine";
import { buildCrossEntityIntelligence } from "@/lib/google-ads/cross-entity-intelligence";
import {
  analyzeAssetGroups,
  analyzeAssets,
  analyzeBudgetScaling,
  analyzeKeywords,
  analyzeProducts,
  analyzeSearchIntelligence,
} from "@/lib/google-ads/tab-analysis";
import type { GoogleAdsReportMeta } from "@/lib/google-ads/normalizers";
import {
  createGoogleAdsWarehouseFreshness,
  readGoogleAdsAggregatedRange,
  getGoogleAdsCoveredDates,
  getGoogleAdsDailyCoverage,
  getLatestGoogleAdsSyncHealth,
} from "@/lib/google-ads/warehouse";
import type {
  GoogleAdsWarehouseDailyRow,
  GoogleAdsWarehouseFreshness,
  GoogleAdsWarehouseScope,
} from "@/lib/google-ads/warehouse-types";
import type { BaseReportParams, ComparativeReportParams, ReportResult, OverviewReportResult } from "@/lib/google-ads/reporting-core";

type WarehouseMeta = GoogleAdsReportMeta & GoogleAdsWarehouseFreshness;

type GenericRow = Record<string, unknown>;
type WarehouseContextCacheEntry = {
  expiresAt: number;
  value: Promise<{
    integration: Awaited<ReturnType<typeof getIntegration>> | null;
    providerAccountIds: string[];
    startDate: string;
    endDate: string;
    dataState: GoogleAdsWarehouseFreshness["dataState"];
  }>;
};

const warehouseContextCache = new Map<string, WarehouseContextCacheEntry>();
const WAREHOUSE_CONTEXT_CACHE_TTL_MS = 30 * 1000;

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeDate(value: string) {
  return value.slice(0, 10);
}

function enumerateDays(startDate: string, endDate: string) {
  const rows: string[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    rows.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

async function resolveWarehouseContext(input: {
  businessId: string;
  accountId?: string | null;
  dateRange: BaseReportParams["dateRange"];
  customStart?: string | null;
  customEnd?: string | null;
}) {
  const cacheKey = [
    input.businessId,
    input.accountId ?? "all",
    input.dateRange,
    input.customStart ?? "",
    input.customEnd ?? "",
  ].join(":");
  const cached = warehouseContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = (async () => {
    const [integration, assignment] = await Promise.all([
      getIntegration(input.businessId, "google").catch(() => null),
      getProviderAccountAssignments(input.businessId, "google").catch(() => null),
    ]);
    const providerAccountIds =
      input.accountId && input.accountId !== "all"
        ? [input.accountId]
        : assignment?.account_ids ?? [];
    const { startDate, endDate } = getDateRangeForQuery(
      input.dateRange,
      input.customStart ?? undefined,
      input.customEnd ?? undefined
    );

    let dataState: GoogleAdsWarehouseFreshness["dataState"] = "ready";
    if (!integration?.access_token || integration.status !== "connected") dataState = "not_connected";
    else if (providerAccountIds.length === 0) dataState = "connected_no_assignment";

    return {
      integration,
      providerAccountIds,
      startDate,
      endDate,
      dataState,
    };
  })();

  warehouseContextCache.set(cacheKey, {
    expiresAt: Date.now() + WAREHOUSE_CONTEXT_CACHE_TTL_MS,
    value,
  });
  return value;
}

function buildMeta(input: {
  freshness: GoogleAdsWarehouseFreshness;
  rowCounts?: Record<string, number>;
}): WarehouseMeta {
  return {
    ...input.freshness,
    partial: input.freshness.isPartial || input.freshness.dataState !== "ready",
    failed_queries: [],
    unavailable_metrics: [],
    query_names: [],
    row_counts: input.rowCounts ?? {},
    report_families: {},
  };
}

async function buildFreshness(input: {
  businessId: string;
  scope: GoogleAdsWarehouseScope;
  providerAccountIds: string[];
  startDate: string;
  endDate: string;
  rows: GoogleAdsWarehouseDailyRow[];
}) {
  const latestSync = await getLatestGoogleAdsSyncHealth({
    businessId: input.businessId,
    providerAccountId: input.providerAccountIds.length === 1 ? input.providerAccountIds[0] : null,
  }).catch(() => null);
  const coverage = await getGoogleAdsDailyCoverage({
    scope: input.scope,
    businessId: input.businessId,
    providerAccountId: input.providerAccountIds.length === 1 ? input.providerAccountIds[0] : null,
    startDate: input.startDate,
    endDate: input.endDate,
  }).catch(() => null);
  const coveredDates = new Set(
    await getGoogleAdsCoveredDates({
      scope: input.scope,
      businessId: input.businessId,
      providerAccountId: input.providerAccountIds.length === 1 ? input.providerAccountIds[0] : null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => [])
  );
  const missingWindows = enumerateDays(input.startDate, input.endDate).filter(
    (date) => !coveredDates.has(date)
  );
  return createGoogleAdsWarehouseFreshness({
    dataState:
      input.providerAccountIds.length === 0
        ? "connected_no_assignment"
        : missingWindows.length > 0
        ? "partial"
        : "ready",
    lastSyncedAt:
      input.rows.reduce<string | null>((latest, row) => {
        if (!row.updatedAt) return latest;
        return !latest || row.updatedAt > latest ? row.updatedAt : latest;
      }, null) ??
      (coverage?.latest_updated_at ?? null),
    liveRefreshedAt:
      input.endDate >= new Date().toISOString().slice(0, 10) ? new Date().toISOString() : null,
    isPartial: missingWindows.length > 0,
    missingWindows,
    warnings: latestSync && latestSync.last_error ? [String(latestSync.last_error)] : [],
  });
}

function aggregateWarehouseRows(rows: GoogleAdsWarehouseDailyRow[]) {
  const map = new Map<string, GenericRow & { __updatedAt?: string }>();
  for (const row of rows) {
    const payload = asObject(row.payloadJson);
    const current = map.get(row.entityKey) ?? {
      ...payload,
      id: payload.id ?? row.entityKey,
      name: payload.name ?? row.entityLabel ?? row.entityKey,
      campaignId: payload.campaignId ?? row.campaignId,
      campaignName: payload.campaignName ?? row.campaignName,
      adGroupId: payload.adGroupId ?? row.adGroupId,
      adGroupName: payload.adGroupName ?? row.adGroupName,
      status: payload.status ?? row.status,
      channel: payload.channel ?? row.channel,
      classification: payload.classification ?? row.classification,
      spend: 0,
      revenue: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
      __updatedAt: row.updatedAt,
    };
    current.spend = toNumber(current.spend) + row.spend;
    current.revenue = toNumber(current.revenue) + row.revenue;
    current.conversions = toNumber(current.conversions) + row.conversions;
    current.impressions = toNumber(current.impressions) + row.impressions;
    current.clicks = toNumber(current.clicks) + row.clicks;
    if (!current.status && row.status) current.status = row.status;
    if (!current.channel && row.channel) current.channel = row.channel;
    if (!current.campaignId && row.campaignId) current.campaignId = row.campaignId;
    if (!current.campaignName && row.campaignName) current.campaignName = row.campaignName;
    if (!current.adGroupId && row.adGroupId) current.adGroupId = row.adGroupId;
    if (!current.adGroupName && row.adGroupName) current.adGroupName = row.adGroupName;
    if ((!current.__updatedAt || (row.updatedAt && row.updatedAt > current.__updatedAt)) && row.updatedAt) {
      Object.assign(current, payload);
      current.__updatedAt = row.updatedAt;
    }
    map.set(row.entityKey, current);
  }

  return Array.from(map.values()).map((row) => {
    const spend = toNumber(row.spend);
    const revenue = toNumber(row.revenue);
    const conversions = toNumber(row.conversions);
    const impressions = toNumber(row.impressions);
    const clicks = toNumber(row.clicks);
    return {
      ...row,
      spend,
      revenue,
      conversions,
      impressions,
      clicks,
      roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : 0,
      cpa: conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0,
      ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
      cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : null,
      conversionRate: clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(2)) : null,
    };
  });
}

async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
) {
  if (tasks.length === 0) return [] as T[];
  const results = new Array<T>(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
    }
  }

  const workerCount = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function readAggregatedScope(input: {
  businessId: string;
  providerAccountIds: string[];
  scope: GoogleAdsWarehouseScope;
  startDate: string;
  endDate: string;
}) {
  const rows = await readGoogleAdsAggregatedRange({
    scope: input.scope,
    businessId: input.businessId,
    providerAccountIds: input.providerAccountIds,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return {
    dailyRows: [] as GoogleAdsWarehouseDailyRow[],
    rows,
  };
}

function toCampaignRows(
  rows: GenericRow[],
  previousRows: GenericRow[] = []
): Array<Record<string, unknown>> {
  const totals = rows.reduce<{ spend: number; revenue: number }>(
    (acc, row) => {
      acc.spend += toNumber(row.spend);
      acc.revenue += toNumber(row.revenue);
      return acc;
    },
    { spend: 0, revenue: 0 }
  );
  const avgRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const avgCpa =
    rows.reduce((sum, row) => sum + toNumber(row.spend), 0) /
      Math.max(1, rows.reduce((sum, row) => sum + Math.max(0, toNumber(row.conversions)), 0)) || 0;
  const previousById = new Map(previousRows.map((row) => [String(row.id), row]));
  return rows
    .map((row) => {
      const previous = previousById.get(String(row.id));
      const spend = toNumber(row.spend);
      const revenue = toNumber(row.revenue);
      const conversions = toNumber(row.conversions);
      const spendShare = totals.spend > 0 ? Number(((spend / totals.spend) * 100).toFixed(1)) : 0;
      const revenueShare = totals.revenue > 0 ? Number(((revenue / totals.revenue) * 100).toFixed(1)) : 0;
      let actionState: "scale" | "optimize" | "test" | "reduce" = "optimize";
      if (conversions === 0 && spend > 20) actionState = "test";
      else if (row.roas && toNumber(row.roas) >= avgRoas && revenueShare >= spendShare) actionState = "scale";
      else if (row.roas && toNumber(row.roas) < avgRoas && spendShare > revenueShare) actionState = "reduce";
      return {
        ...row,
        id: String(row.id),
        name: String(row.name ?? row.campaignName ?? row.id),
        status: String(row.status ?? "enabled"),
        channel: String(row.channel ?? "Unknown"),
        spendShare,
        revenueShare,
        actionState,
        roasChange: previous ? pctDelta(toNumber(row.roas), toNumber(previous.roas)) : undefined,
        spendChange: previous ? pctDelta(spend, toNumber(previous.spend)) : undefined,
        revenueChange: previous ? pctDelta(revenue, toNumber(previous.revenue)) : undefined,
        conversionsChange: previous ? pctDelta(conversions, toNumber(previous.conversions)) : undefined,
        badges: getCampaignBadges(
          {
            id: String(row.id),
            name: String(row.name ?? row.campaignName ?? row.id),
            status: String(row.status ?? "enabled"),
            channel: String(row.channel ?? "Unknown"),
            spend,
            conversions,
            revenue,
            roas: toNumber(row.roas),
            cpa: toNumber(row.cpa),
            ctr: toNumber(row.ctr),
            impressions: toNumber(row.impressions),
            clicks: toNumber(row.clicks),
            impressionShare: row.impressionShare == null ? undefined : toNumber(row.impressionShare),
            lostIsBudget: row.lostIsBudget == null ? undefined : toNumber(row.lostIsBudget),
          },
          avgRoas,
          avgCpa
        ),
      };
    })
    .sort((a, b) => toNumber((b as Record<string, unknown>).spend) - toNumber((a as Record<string, unknown>).spend));
}

async function buildScopeResponse(input: {
  params: BaseReportParams;
  scope: GoogleAdsWarehouseScope;
}) {
  const context = await resolveWarehouseContext(input.params);
  if (context.dataState === "not_connected" || context.dataState === "connected_no_assignment") {
    const freshness = createGoogleAdsWarehouseFreshness({
      dataState: context.dataState,
      warnings:
        context.dataState === "not_connected"
          ? ["Google Ads integration is not connected."]
          : ["No Google Ads account is assigned to this business."],
    });
    return { context, freshness, rows: [], dailyRows: [] as GoogleAdsWarehouseDailyRow[] };
  }
  const { rows, dailyRows } = await readAggregatedScope({
    businessId: input.params.businessId,
    providerAccountIds: context.providerAccountIds,
    scope: input.scope,
    startDate: context.startDate,
    endDate: context.endDate,
  });
  const freshness = await buildFreshness({
    businessId: input.params.businessId,
    scope: input.scope,
    providerAccountIds: context.providerAccountIds,
    startDate: context.startDate,
    endDate: context.endDate,
    rows: dailyRows,
  });
  return { context, freshness, rows, dailyRows };
}

export async function getGoogleAdsCampaignsReport(
  params: ComparativeReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  const current = await buildScopeResponse({ params, scope: "campaign_daily" });
  const compareWindow = getComparisonWindow({
    compareMode: params.compareMode,
    startDate: current.context.startDate,
    endDate: current.context.endDate,
    compareStart: params.compareStart,
    compareEnd: params.compareEnd,
  });
  const previousRows = compareWindow
    ? (
        await readAggregatedScope({
          businessId: params.businessId,
          providerAccountIds: current.context.providerAccountIds,
          scope: "campaign_daily",
          startDate: compareWindow.startDate,
          endDate: compareWindow.endDate,
        })
      ).rows
    : [];
  const campaignRows = toCampaignRows(current.rows, previousRows);
  const accountAvgRoas =
    campaignRows.reduce((sum, row) => sum + toNumber(row.revenue), 0) /
      Math.max(1, campaignRows.reduce((sum, row) => sum + toNumber(row.spend), 0)) || 0;
  return {
    rows: campaignRows,
    summary: {
      accountAvgRoas: Number(accountAvgRoas.toFixed(2)),
      totalSpend: Number(campaignRows.reduce((sum, row) => sum + toNumber(row.spend), 0).toFixed(2)),
      totalRevenue: Number(campaignRows.reduce((sum, row) => sum + toNumber(row.revenue), 0).toFixed(2)),
    },
    meta: buildMeta({
      freshness: current.freshness,
      rowCounts: { campaign_daily: campaignRows.length },
    }),
  };
}

export async function getGoogleAdsOverviewReport(
  params: ComparativeReportParams
): Promise<OverviewReportResult> {
  const campaigns = await getGoogleAdsCampaignsReport(params);
  const campaignRows = campaigns.rows as Array<Record<string, unknown>>;
  const totalSpend = campaignRows.reduce((sum, row) => sum + toNumber(row.spend), 0);
  const totalRevenue = campaignRows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
  const totalConversions = campaignRows.reduce((sum, row) => sum + toNumber(row.conversions), 0);
  const totalClicks = campaignRows.reduce((sum, row) => sum + toNumber(row.clicks), 0);
  const totalImpressions = campaignRows.reduce((sum, row) => sum + toNumber(row.impressions), 0);
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  const compareWindow = getComparisonWindow({
    compareMode: params.compareMode,
    startDate: (await resolveWarehouseContext(params)).startDate,
    endDate: (await resolveWarehouseContext(params)).endDate,
    compareStart: params.compareStart,
    compareEnd: params.compareEnd,
  });
  let previousTotals: Record<string, number> | null = null;
  if (compareWindow) {
    const previous = await getGoogleAdsCampaignsReport({
      ...params,
      dateRange: "custom",
      customStart: compareWindow.startDate,
      customEnd: compareWindow.endDate,
      compareMode: "none",
    });
    previousTotals = {
      spend: previous.rows.reduce((sum, row) => sum + toNumber(row.spend), 0),
      revenue: previous.rows.reduce((sum, row) => sum + toNumber(row.revenue), 0),
      conversions: previous.rows.reduce((sum, row) => sum + toNumber(row.conversions), 0),
      roas:
        previous.rows.reduce((sum, row) => sum + toNumber(row.spend), 0) > 0
          ? previous.rows.reduce((sum, row) => sum + toNumber(row.revenue), 0) /
            previous.rows.reduce((sum, row) => sum + toNumber(row.spend), 0)
          : 0,
      cpa:
        previous.rows.reduce((sum, row) => sum + toNumber(row.conversions), 0) > 0
          ? previous.rows.reduce((sum, row) => sum + toNumber(row.spend), 0) /
            previous.rows.reduce((sum, row) => sum + toNumber(row.conversions), 0)
          : 0,
      clicks: previous.rows.reduce((sum, row) => sum + toNumber(row.clicks), 0),
      impressions: previous.rows.reduce((sum, row) => sum + toNumber(row.impressions), 0),
    };
  }

  const topCampaigns = campaignRows
    .slice(0, 8)
    .map((row) => ({ ...row, badges: Array.isArray(row.badges) ? row.badges : [] })) as Array<
      GadsCampaignRow & { badges: string[] }
    >;
  const insights = generateOverviewInsights({
    campaigns: topCampaigns,
    totalSpend,
    totalConversions,
    totalRevenue,
    roas,
    cpa,
  });

  return {
    kpis: {
      spend: Number(totalSpend.toFixed(2)),
      conversions: Number(totalConversions.toFixed(2)),
      revenue: Number(totalRevenue.toFixed(2)),
      roas: Number(roas.toFixed(2)),
      cpa: Number(cpa.toFixed(2)),
      cpc: Number(cpc.toFixed(2)),
      ctr: Number(ctr.toFixed(2)),
      impressions: totalImpressions,
      clicks: totalClicks,
      convRate: totalClicks > 0 ? Number(((totalConversions / totalClicks) * 100).toFixed(2)) : 0,
    },
    kpiDeltas: previousTotals
      ? {
          spend: pctDelta(totalSpend, previousTotals.spend),
          revenue: pctDelta(totalRevenue, previousTotals.revenue),
          conversions: pctDelta(totalConversions, previousTotals.conversions),
          roas: pctDelta(roas, previousTotals.roas),
          cpa: pctDelta(cpa, previousTotals.cpa),
          ctr: pctDelta(ctr, previousTotals.impressions > 0 ? (previousTotals.clicks / previousTotals.impressions) * 100 : 0),
        }
      : undefined,
    topCampaigns,
    insights,
    summary: {
      accountAvgRoas: Number(roas.toFixed(2)),
      totalCampaigns: campaignRows.length,
    },
    meta: campaigns.meta as unknown as WarehouseMeta,
  };
}

async function buildSimpleEntityReport(
  params: BaseReportParams,
  scope: GoogleAdsWarehouseScope
): Promise<ReportResult<Record<string, unknown>>> {
  const current = await buildScopeResponse({ params, scope });
  return {
    rows: current.rows,
    summary: { total: current.rows.length },
    meta: buildMeta({
      freshness: current.freshness,
      rowCounts: { [scope]: current.rows.length },
    }),
  };
}

export async function getGoogleAdsSearchTermsReport(
  params: BaseReportParams & { filter?: string }
): Promise<ReportResult<Record<string, unknown>>> {
  const report = await buildSimpleEntityReport(params, "search_term_daily");
  const filter = params.filter?.toLowerCase().trim();
  const rows = filter
    ? report.rows.filter((row) => String(row.searchTerm ?? "").toLowerCase().includes(filter))
    : report.rows;
  return {
    rows,
    summary: { total: rows.length },
    meta: {
      ...report.meta,
      row_counts: { search_term_daily: rows.length },
    },
  };
}

export async function getGoogleAdsSearchIntelligenceReport(
  params: BaseReportParams & { filter?: string }
): Promise<ReportResult<Record<string, unknown>>> {
  const terms = await getGoogleAdsSearchTermsReport(params);
  const rows = params.filter
    ? terms.rows.filter((row) =>
        String(row.classification ?? row.intentClass ?? "")
          .toLowerCase()
          .includes(params.filter!.toLowerCase())
      )
    : terms.rows;
  const analysis = analyzeSearchIntelligence(rows);
  return {
    rows,
    summary: {
      wastefulSpend: rows
        .filter((row) => Boolean(row.wasteFlag))
        .reduce((sum, row) => sum + toNumber(row.spend), 0),
      keywordOpportunityCount: rows.filter((row) => Boolean(row.keywordOpportunityFlag)).length,
      negativeKeywordCount: rows.filter((row) => Boolean(row.negativeKeywordFlag)).length,
      promotionSuggestionCount: analysis.summary.emergingThemeCount ?? 0,
    },
    insights: analysis.insights,
    meta: terms.meta,
  };
}

export async function getGoogleAdsKeywordsReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  const report = await buildSimpleEntityReport(params, "keyword_daily");
  const analysis = analyzeKeywords(report.rows);
  return {
    rows: analysis.rows,
    summary: analysis.summary,
    insights: analysis.insights,
    meta: report.meta,
  };
}

export async function getGoogleAdsAdsReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  return buildSimpleEntityReport(params, "ad_daily");
}

export async function getGoogleAdsAssetsReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  const report = await buildSimpleEntityReport(params, "asset_daily");
  const analysis = analyzeAssets(report.rows);
  return {
    rows: analysis.rows,
    summary: analysis.summary,
    insights: analysis.insights,
    meta: report.meta,
  };
}

export async function getGoogleAdsAssetGroupsReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  const report = await buildSimpleEntityReport(params, "asset_group_daily");
  const analysis = analyzeAssetGroups(report.rows);
  return {
    rows: analysis.rows,
    summary: analysis.summary,
    insights: analysis.insights,
    meta: report.meta,
  };
}

export async function getGoogleAdsProductsReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  const report = await buildSimpleEntityReport(params, "product_daily");
  const analysis = analyzeProducts(report.rows);
  return {
    rows: analysis.rows,
    summary: analysis.summary,
    insights: analysis.insights,
    meta: report.meta,
  };
}

export async function getGoogleAdsAudiencesReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  const report = await buildSimpleEntityReport(params, "audience_daily");
  const byType = new Map<string, { type: string; spend: number; conversions: number; revenue: number; roas: number }>();
  for (const row of report.rows) {
    const type = String(row.audienceType ?? row.type ?? "Unknown");
    const current = byType.get(type) ?? { type, spend: 0, conversions: 0, revenue: 0, roas: 0 };
    current.spend += toNumber(row.spend);
    current.conversions += toNumber(row.conversions);
    current.revenue += toNumber(row.revenue);
    current.roas = current.spend > 0 ? Number((current.revenue / current.spend).toFixed(2)) : 0;
    byType.set(type, current);
  }
  return {
    rows: report.rows,
    summary: { byType: Array.from(byType.values()) },
    meta: report.meta,
  };
}

export async function getGoogleAdsGeoReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  return buildSimpleEntityReport(params, "geo_daily");
}

export async function getGoogleAdsDevicesReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  return buildSimpleEntityReport(params, "device_daily");
}

export async function getGoogleAdsBudgetReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  const campaigns = await getGoogleAdsCampaignsReport({
    ...params,
    compareMode: "none",
  });
  const analysis = analyzeBudgetScaling(campaigns.rows);
  return {
    rows: analysis.rows,
    summary: analysis.summary,
    insights: analysis.insights,
    meta: campaigns.meta,
  };
}

export async function getGoogleAdsCreativesReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  return getGoogleAdsAssetsReport(params);
}

export async function getGoogleAdsOpportunitiesReport(
  params: BaseReportParams
): Promise<ReportResult<GoogleAdsOpportunity>> {
  const [campaigns, keywords, searchIntelligence, assets, assetGroups, products, geo, devices, audiences] =
    await Promise.all([
      getGoogleAdsCampaignsReport({ ...params, compareMode: "none" }),
      getGoogleAdsKeywordsReport(params),
      getGoogleAdsSearchIntelligenceReport(params),
      getGoogleAdsAssetsReport(params),
      getGoogleAdsAssetGroupsReport(params),
      getGoogleAdsProductsReport(params),
      getGoogleAdsGeoReport(params),
      getGoogleAdsDevicesReport(params),
      getGoogleAdsAudiencesReport(params),
    ]);

  const opportunityResult = buildGoogleAdsOpportunityEngine({
    campaigns: campaigns.rows,
    products: products.rows,
    assets: assets.rows,
    assetGroups: assetGroups.rows,
    searchTerms: searchIntelligence.rows,
    keywords: keywords.rows,
    audiences: audiences.rows,
    geo: geo.rows,
    devices: devices.rows,
  });
  const crossEntity = buildCrossEntityIntelligence({
    campaigns: campaigns.rows,
    products: products.rows,
    assets: assets.rows,
    assetGroups: assetGroups.rows,
    searchTerms: searchIntelligence.rows,
  });
  const crossRows = crossEntity.rows
    .filter((row) => ["scale_path", "waste_concentration", "asset_theme_alignment"].includes(String(row.type)))
    .map((row) => ({
      id: String(row.id),
      type: String(row.type).includes("waste") ? "reduce" : "scale",
      entityType: "campaign",
      entityId: String(row.relatedEntities?.[0]?.entityId ?? row.id),
      title: String(row.title),
      description: String(row.description),
      reasoning: String(row.reasoning),
      expectedImpact: row.impact === "high" ? "high" : row.impact === "medium" ? "medium" : "low",
      confidence: toNumber(row.confidence),
      metrics: row.metrics ?? {},
    })) as GoogleAdsOpportunity[];
  const rows = [...crossRows, ...opportunityResult.rows].sort(
    (a, b) => toNumber(b.confidence) - toNumber(a.confidence)
  );
  return {
    rows,
    summary: {
      scale: rows.filter((row) => row.type === "scale").length,
      reduce: rows.filter((row) => row.type === "reduce").length,
      fix: rows.filter((row) => row.type === "fix").length,
      test: rows.filter((row) => row.type === "test").length,
      total: rows.length,
      crossEntity: crossRows.length,
    },
    meta: campaigns.meta,
  };
}

export async function getGoogleAdsDiagnosticsReport(
  params: BaseReportParams
): Promise<ReportResult<Record<string, unknown>>> {
  const reports = await Promise.all([
    getGoogleAdsOverviewReport({ ...params, compareMode: "none" }),
    getGoogleAdsCampaignsReport({ ...params, compareMode: "none" }),
    getGoogleAdsSearchIntelligenceReport(params),
    getGoogleAdsKeywordsReport(params),
    getGoogleAdsAssetsReport(params),
    getGoogleAdsAssetGroupsReport(params),
    getGoogleAdsProductsReport(params),
    getGoogleAdsAudiencesReport(params),
    getGoogleAdsGeoReport(params),
    getGoogleAdsDevicesReport(params),
    getGoogleAdsBudgetReport(params),
    getGoogleAdsOpportunitiesReport(params),
  ]);
  const sections = [
    { label: "Overview", meta: reports[0].meta, rows: 1 },
    { label: "Campaigns", meta: reports[1].meta, rows: reports[1].rows.length },
    { label: "Search Intelligence", meta: reports[2].meta, rows: reports[2].rows.length },
    { label: "Keywords", meta: reports[3].meta, rows: reports[3].rows.length },
    { label: "Assets", meta: reports[4].meta, rows: reports[4].rows.length },
    { label: "Asset Groups", meta: reports[5].meta, rows: reports[5].rows.length },
    { label: "Products", meta: reports[6].meta, rows: reports[6].rows.length },
    { label: "Audience Intelligence", meta: reports[7].meta, rows: reports[7].rows.length },
    { label: "Geo", meta: reports[8].meta, rows: reports[8].rows.length },
    { label: "Devices", meta: reports[9].meta, rows: reports[9].rows.length },
    { label: "Budget & Scaling", meta: reports[10].meta, rows: reports[10].rows.length },
    { label: "Opportunities", meta: reports[11].meta, rows: reports[11].rows.length },
  ].map((section) => ({
    ...section,
    partial: section.meta.partial,
    warningCount: section.meta.warnings.length,
    failureCount: section.meta.failed_queries.length,
    unavailableMetricCount: section.meta.unavailable_metrics.length,
  }));
  return {
    rows: sections,
    summary: {
      loadedSections: sections.length,
      healthySections: sections.filter((section) => !section.partial && section.warningCount === 0).length,
      totalWarnings: sections.reduce((sum, section) => sum + section.warningCount, 0),
      totalFailures: 0,
      coreBlockers: 0,
      optionalFailures: 0,
      apiLimitations: 0,
      generatedAt: new Date().toISOString(),
    },
    insights: {
      reportFamilies: [],
      issueInventory: [],
      groupedIssues: {
        coreBlockers: [],
        optionalFailures: [],
        permissionContext: [],
        apiLimitations: [],
      },
      limitations: ["Google Ads is now served from the DB warehouse; route-level request caches are disabled."],
    },
    meta: reports[0].meta,
  };
}

export async function getGoogleAdsAdvisorReport(
  params: BaseReportParams
) {
  const { requestedDays, selectedWindow, supportWindows } = buildGoogleAdsAdvisorWindows({
    dateRange: params.dateRange,
    customStart: params.customStart,
    customEnd: params.customEnd,
  });
  const [last3, last7, last14, last30, last90, allHistory] = supportWindows;

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
  ] = await runWithConcurrencyLimit(
    [
      () => getGoogleAdsCampaignsReport({ ...params, dateRange: "custom", customStart: selectedWindow.customStart, customEnd: selectedWindow.customEnd, compareMode: "none" }),
      () => getGoogleAdsSearchIntelligenceReport({ ...params, dateRange: "custom", customStart: selectedWindow.customStart, customEnd: selectedWindow.customEnd }),
      () => getGoogleAdsProductsReport({ ...params, dateRange: "custom", customStart: selectedWindow.customStart, customEnd: selectedWindow.customEnd }),
      () => getGoogleAdsAssetsReport({ ...params, dateRange: "custom", customStart: selectedWindow.customStart, customEnd: selectedWindow.customEnd }),
      () => getGoogleAdsAssetGroupsReport({ ...params, dateRange: "custom", customStart: selectedWindow.customStart, customEnd: selectedWindow.customEnd }),
      () => getGoogleAdsGeoReport({ ...params, dateRange: "custom", customStart: selectedWindow.customStart, customEnd: selectedWindow.customEnd }),
      () => getGoogleAdsDevicesReport({ ...params, dateRange: "custom", customStart: selectedWindow.customStart, customEnd: selectedWindow.customEnd }),
      () => getGoogleAdsCampaignsReport({ ...params, dateRange: "custom", customStart: last3.customStart, customEnd: last3.customEnd, compareMode: "none" }),
      () => getGoogleAdsSearchIntelligenceReport({ ...params, dateRange: "custom", customStart: last3.customStart, customEnd: last3.customEnd }),
      () => getGoogleAdsProductsReport({ ...params, dateRange: "custom", customStart: last3.customStart, customEnd: last3.customEnd }),
      () => getGoogleAdsCampaignsReport({ ...params, dateRange: "custom", customStart: last7.customStart, customEnd: last7.customEnd, compareMode: "none" }),
      () => getGoogleAdsSearchIntelligenceReport({ ...params, dateRange: "custom", customStart: last7.customStart, customEnd: last7.customEnd }),
      () => getGoogleAdsProductsReport({ ...params, dateRange: "custom", customStart: last7.customStart, customEnd: last7.customEnd }),
      () => getGoogleAdsCampaignsReport({ ...params, dateRange: "custom", customStart: last14.customStart, customEnd: last14.customEnd, compareMode: "none" }),
      () => getGoogleAdsSearchIntelligenceReport({ ...params, dateRange: "custom", customStart: last14.customStart, customEnd: last14.customEnd }),
      () => getGoogleAdsProductsReport({ ...params, dateRange: "custom", customStart: last14.customStart, customEnd: last14.customEnd }),
      () => getGoogleAdsCampaignsReport({ ...params, dateRange: "custom", customStart: last30.customStart, customEnd: last30.customEnd, compareMode: "none" }),
      () => getGoogleAdsSearchIntelligenceReport({ ...params, dateRange: "custom", customStart: last30.customStart, customEnd: last30.customEnd }),
      () => getGoogleAdsProductsReport({ ...params, dateRange: "custom", customStart: last30.customStart, customEnd: last30.customEnd }),
      () => getGoogleAdsCampaignsReport({ ...params, dateRange: "custom", customStart: last90.customStart, customEnd: last90.customEnd, compareMode: "none" }),
      () => getGoogleAdsSearchIntelligenceReport({ ...params, dateRange: "custom", customStart: last90.customStart, customEnd: last90.customEnd }),
      () => getGoogleAdsProductsReport({ ...params, dateRange: "custom", customStart: last90.customStart, customEnd: last90.customEnd }),
      () => getGoogleAdsCampaignsReport({ ...params, dateRange: "custom", customStart: allHistory.customStart, customEnd: allHistory.customEnd, compareMode: "none" }),
      () => getGoogleAdsSearchIntelligenceReport({ ...params, dateRange: "custom", customStart: allHistory.customStart, customEnd: allHistory.customEnd }),
      () => getGoogleAdsProductsReport({ ...params, dateRange: "custom", customStart: allHistory.customStart, customEnd: allHistory.customEnd }),
    ],
    4
  );

  const advisor = buildGoogleGrowthAdvisor({
    selectedLabel: selectedWindow.label,
    selectedCampaigns: selectedCampaigns.rows as never[],
    selectedSearchTerms: selectedSearch.rows as never[],
    selectedProducts: selectedProducts.rows as never[],
    selectedAssets: selectedAssets.rows as never[],
    selectedAssetGroups: selectedAssetGroups.rows as never[],
    selectedGeos: selectedGeos.rows as never[],
    selectedDevices: selectedDevices.rows as never[],
    windows: [
      { key: last3.key, label: last3.label, campaigns: last3Campaigns.rows as never[], searchTerms: last3Search.rows as never[], products: last3Products.rows as never[] },
      { key: last7.key, label: last7.label, campaigns: last7Campaigns.rows as never[], searchTerms: last7Search.rows as never[], products: last7Products.rows as never[] },
      { key: last14.key, label: last14.label, campaigns: last14Campaigns.rows as never[], searchTerms: last14Search.rows as never[], products: last14Products.rows as never[] },
      { key: last30.key, label: last30.label, campaigns: last30Campaigns.rows as never[], searchTerms: last30Search.rows as never[], products: last30Products.rows as never[] },
      { key: last90.key, label: last90.label, campaigns: last90Campaigns.rows as never[], searchTerms: last90Search.rows as never[], products: last90Products.rows as never[] },
      { key: allHistory.key, label: allHistory.label, campaigns: allCampaigns.rows as never[], searchTerms: allSearch.rows as never[], products: allProducts.rows as never[] },
    ],
  });

  return {
    ...advisor,
    meta: {
      selectedCampaigns: selectedCampaigns.rows.length,
      selectedSearchTerms: selectedSearch.rows.length,
      selectedProducts: selectedProducts.rows.length,
      selectedAssets: selectedAssets.rows.length,
      freshness: selectedCampaigns.meta,
    },
  };
}
