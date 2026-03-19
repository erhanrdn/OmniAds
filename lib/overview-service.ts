import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoOverview, getDemoSparklines, isDemoBusinessId } from "@/lib/demo-business";
import { getGoogleAdsOverviewReport } from "@/lib/google-ads/reporting";
import {
  resolveGa4AnalyticsContext,
  runGA4Report,
} from "@/lib/google-analytics-reporting";
import { getIntegration } from "@/lib/integrations";
import { runMigrations } from "@/lib/migrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  enumerateDays,
  nDaysAgo,
  parseActionValue,
  round2,
  toISODate,
} from "@/lib/overview-service-support";
import {
  getCachedReport,
  getReportingDateRangeKey,
  setCachedReport,
} from "@/lib/reporting-cache";

interface TrendPoint {
  date: string;
  spend: number;
  revenue: number;
  purchases: number;
}

interface PlatformEfficiencyRow {
  platform: string;
  spend: number;
  revenue: number;
  roas: number;
  purchases: number;
  cpa: number;
}

export interface DailyTrendPoint {
  date: string;
  spend: number;
  revenue: number;
  purchases: number;
}

export interface OverviewTrendBundle {
  combined: DailyTrendPoint[];
  providerTrends: Partial<Record<"meta" | "google", DailyTrendPoint[]>>;
}

export interface OverviewResponse {
  businessId: string;
  dateRange: { startDate: string; endDate: string };
  status?: string;
  kpis: {
    spend: number;
    revenue: number;
    roas: number;
    purchases: number;
    cpa: number;
    aov: number;
  };
  kpiSources: Partial<
    Record<
      keyof OverviewResponse["kpis"],
      {
        source: "shopify" | "ga4_fallback" | "ad_platforms" | "unavailable";
        label: string;
      }
    >
  >;
  totals: {
    impressions: number;
    clicks: number;
    purchases: number;
    spend: number;
    conversions: number;
    revenue: number;
    ctr: number;
    cpm: number;
    cpc: number;
    cpa: number;
    roas: number;
  };
  platformEfficiency: PlatformEfficiencyRow[];
  providerTrends?: Partial<Record<"meta" | "google", TrendPoint[]>>;
  trends: {
    "7d": TrendPoint[];
    "14d": TrendPoint[];
    "30d": TrendPoint[];
    custom: TrendPoint[];
  };
}

interface Ga4EcommerceFallback {
  revenue: number;
  purchases: number;
  averageOrderValue: number | null;
}

interface MetaOverviewFragment {
  spend: number;
  revenue: number;
  purchases: number;
  rows: PlatformEfficiencyRow[];
}

interface GoogleOverviewFragment {
  spend: number;
  revenue: number;
  purchases: number;
  clicks: number;
  impressions: number;
  row: PlatformEfficiencyRow | null;
}

interface DailyTrendsBundle {
  combined: TrendPoint[];
  providerTrends: Partial<Record<"meta" | "google", TrendPoint[]>>;
}

const META_OVERVIEW_CACHE_TTL_MINUTES = 15;
const GOOGLE_OVERVIEW_CACHE_TTL_MINUTES = 15;
const GA4_FALLBACK_CACHE_TTL_MINUTES = 15;
const GA4_FALLBACK_ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const ga4FallbackFailureUntilByBusiness = new Map<string, number>();

function buildEmptyOverview(
  businessId: string,
  startDate: string,
  endDate: string,
  status?: string
): OverviewResponse {
  const kpis = { spend: 0, revenue: 0, roas: 0, purchases: 0, cpa: 0, aov: 0 };
  return {
    businessId,
    dateRange: { startDate, endDate },
    ...(status ? { status } : {}),
    kpis,
    kpiSources: {
      spend: { source: "ad_platforms", label: "Ad platforms" },
      revenue: { source: "unavailable", label: "Unavailable" },
      roas: { source: "unavailable", label: "Unavailable" },
      purchases: { source: "unavailable", label: "Unavailable" },
      cpa: { source: "ad_platforms", label: "Ad platforms" },
      aov: { source: "unavailable", label: "Unavailable" },
    },
    totals: {
      impressions: 0,
      clicks: 0,
      purchases: 0,
      spend: 0,
      conversions: 0,
      revenue: 0,
      ctr: 0,
      cpm: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
    },
    platformEfficiency: [],
    trends: { "7d": [], "14d": [], "30d": [], custom: [] },
  };
}

async function getGa4EcommerceFallback(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<Ga4EcommerceFallback | null> {
  const failureUntil = ga4FallbackFailureUntilByBusiness.get(businessId) ?? 0;
  if (failureUntil > Date.now()) return null;

  const dateRangeKey = getReportingDateRangeKey(startDate, endDate);
  const cached = await getCachedReport<Ga4EcommerceFallback>({
    businessId,
    provider: "ga4",
    reportType: "ecommerce_fallback",
    dateRangeKey,
    maxAgeMinutes: GA4_FALLBACK_CACHE_TTL_MINUTES,
  });
  if (cached) return cached;

  try {
    const context = await resolveGa4AnalyticsContext(businessId, {
      requireProperty: true,
    });
    if (!context.propertyId) return null;

    const report = await runGA4Report({
      propertyId: context.propertyId,
      accessToken: context.accessToken,
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
        { name: "averagePurchaseRevenuePerPayingUser" },
      ],
    });

    const totalsRow = report.totals?.[0] ?? report.rows[0];
    if (!totalsRow) return null;

    const purchases = parseFloat(totalsRow.metrics[0] ?? "0") || 0;
    const revenue = parseFloat(totalsRow.metrics[1] ?? "0") || 0;
    const averageOrderValueMetric = parseFloat(totalsRow.metrics[2] ?? "0") || 0;

    const payload = {
      purchases,
      revenue,
      averageOrderValue:
        averageOrderValueMetric > 0
          ? averageOrderValueMetric
          : purchases > 0
            ? revenue / purchases
            : null,
    };

    await setCachedReport({
      businessId,
      provider: "ga4",
      reportType: "ecommerce_fallback",
      dateRangeKey,
      payload,
    });

    ga4FallbackFailureUntilByBusiness.delete(businessId);

    return payload;
  } catch (error) {
    ga4FallbackFailureUntilByBusiness.set(
      businessId,
      Date.now() + GA4_FALLBACK_ERROR_COOLDOWN_MS
    );
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[overview] ga4 ecommerce fallback unavailable", { businessId, message });
    return null;
  }
}

async function getMetaOverviewFragment(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaOverviewFragment> {
  const dateRangeKey = getReportingDateRangeKey(input.startDate, input.endDate);
  const cached = await getCachedReport<MetaOverviewFragment>({
    businessId: input.businessId,
    provider: "meta",
    reportType: "overview",
    dateRangeKey,
    maxAgeMinutes: META_OVERVIEW_CACHE_TTL_MINUTES,
  });
  if (cached) return cached;

  let assignedAccountIds: string[] = [];
  try {
    const row = await getProviderAccountAssignments(input.businessId, "meta");
    assignedAccountIds = row?.account_ids ?? [];
  } catch (firstError: unknown) {
    const message = firstError instanceof Error ? firstError.message : String(firstError);
    const isMissingTable = message.includes("does not exist") || message.includes("relation");

    if (isMissingTable) {
      try {
        await runMigrations();
        const row = await getProviderAccountAssignments(input.businessId, "meta");
        assignedAccountIds = row?.account_ids ?? [];
      } catch (retryError: unknown) {
        const retryMessage =
          retryError instanceof Error ? retryError.message : String(retryError);
        console.error("[overview] assignment read failed after migration", {
          businessId: input.businessId,
          message: retryMessage,
        });
        assignedAccountIds = [];
      }
    } else {
      console.error("[overview] assignment read failed", {
        businessId: input.businessId,
        message,
      });
      assignedAccountIds = [];
    }
  }

  let accessToken: string | null = null;
  try {
    const integration = await getIntegration(input.businessId, "meta");
    accessToken = integration?.access_token ?? null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[overview] integration read failed", {
      businessId: input.businessId,
      message,
    });
  }

  if (!accessToken || assignedAccountIds.length === 0) {
    return { spend: 0, revenue: 0, purchases: 0, rows: [] };
  }

  const metaResults = await Promise.allSettled(
    assignedAccountIds.map(async (accountId) => {
      const insightsUrl = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
      insightsUrl.searchParams.set(
        "fields",
        "spend,actions,action_values,purchase_roas"
      );
      insightsUrl.searchParams.set(
        "time_range",
        JSON.stringify({ since: input.startDate, until: input.endDate })
      );
      insightsUrl.searchParams.set("access_token", accessToken);

      const response = await fetch(insightsUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(`Meta insights ${response.status}: ${raw.slice(0, 200)}`);
      }

      const json = (await response.json()) as {
        data?: Array<{
          spend?: string;
          actions?: Array<{ action_type: string; value: string }>;
          action_values?: Array<{ action_type: string; value: string }>;
          purchase_roas?: Array<{ action_type: string; value: string }>;
        }>;
      };

      const data = json.data?.[0];
      if (!data) return null;

      const spend = parseFloat(data.spend ?? "0") || 0;
      const purchases = parseActionValue(data.actions, "purchase");
      const revenueFromActionValues = parseActionValue(data.action_values, "purchase");
      const purchaseRoasValue = parseActionValue(
        data.purchase_roas as Array<{ action_type: string; value: string }> | undefined,
        "omni_purchase"
      );
      const revenue =
        revenueFromActionValues > 0 ? revenueFromActionValues : spend * purchaseRoasValue;

      return {
        platform: "meta",
        spend,
        revenue,
        purchases,
        cpa: purchases > 0 ? spend / purchases : 0,
        roas: spend > 0 ? revenue / spend : 0,
      } satisfies PlatformEfficiencyRow;
    })
  );

  let totalSpend = 0;
  let totalRevenue = 0;
  let totalPurchases = 0;
  const rows: PlatformEfficiencyRow[] = [];

  for (const [index, result] of metaResults.entries()) {
    if (result.status === "fulfilled" && result.value) {
      totalSpend += result.value.spend;
      totalRevenue += result.value.revenue;
      totalPurchases += result.value.purchases;
      rows.push(result.value);
      continue;
    }

    const message =
      result.status === "rejected"
        ? result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
        : "empty_meta_response";
    console.warn("[overview] meta insights fetch failed for account", {
      businessId: input.businessId,
      accountId: assignedAccountIds[index],
      message,
    });
  }

  const payload: MetaOverviewFragment = {
    spend: totalSpend,
    revenue: totalRevenue,
    purchases: totalPurchases,
    rows,
  };

  await setCachedReport({
    businessId: input.businessId,
    provider: "meta",
    reportType: "overview",
    dateRangeKey,
    payload,
  });

  return payload;
}

async function getGoogleOverviewFragment(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<GoogleOverviewFragment> {
  const dateRangeKey = getReportingDateRangeKey(input.startDate, input.endDate);
  const cached = await getCachedReport<GoogleOverviewFragment>({
    businessId: input.businessId,
    provider: "google_ads",
    reportType: "overview",
    dateRangeKey,
    maxAgeMinutes: GOOGLE_OVERVIEW_CACHE_TTL_MINUTES,
  });
  if (cached) return cached;

  const googleOverview = await getGoogleAdsOverviewReport({
    businessId: input.businessId,
    accountId: null,
    dateRange: "custom",
    customStart: input.startDate,
    customEnd: input.endDate,
    compareMode: "none",
    compareStart: null,
    compareEnd: null,
    debug: false,
    source: "overview_aggregation_route",
  });

  const spend = Number(googleOverview.kpis.spend ?? 0);
  const revenue = Number(googleOverview.kpis.revenue ?? 0);
  const purchases = Number(googleOverview.kpis.conversions ?? 0);
  const clicks = Number(googleOverview.kpis.clicks ?? 0);
  const impressions = Number(googleOverview.kpis.impressions ?? 0);

  const payload: GoogleOverviewFragment = {
    spend,
    revenue,
    purchases,
    clicks,
    impressions,
    row:
      spend > 0 || revenue > 0 || purchases > 0 || clicks > 0 || impressions > 0
        ? {
            platform: "google",
            spend,
            revenue,
            roas: Number(googleOverview.kpis.roas ?? 0),
            purchases,
            cpa: Number(googleOverview.kpis.cpa ?? 0),
          }
        : null,
  };

  await setCachedReport({
    businessId: input.businessId,
    provider: "google_ads",
    reportType: "overview",
    dateRangeKey,
    payload,
  });

  return payload;
}

function applyEcommerceSourcePriority(
  overview: OverviewResponse,
  options: {
    ga4Fallback: Ga4EcommerceFallback | null;
  }
) {
  const { ga4Fallback } = options;

  if (ga4Fallback) {
    const revenue = round2(ga4Fallback.revenue);
    const purchases = Math.round(ga4Fallback.purchases);
    const aov =
      ga4Fallback.averageOrderValue !== null
        ? round2(ga4Fallback.averageOrderValue)
        : purchases > 0
          ? round2(ga4Fallback.revenue / ga4Fallback.purchases)
          : 0;
    const roas = overview.kpis.spend > 0 ? round2(ga4Fallback.revenue / overview.kpis.spend) : 0;

    overview.kpis.revenue = revenue;
    overview.kpis.purchases = purchases;
    overview.kpis.aov = aov;
    overview.kpis.roas = roas;

    overview.totals.revenue = revenue;
    overview.totals.purchases = purchases;
    overview.totals.conversions = purchases;
    overview.totals.roas = roas;

    overview.kpiSources.revenue = { source: "ga4_fallback", label: "GA4" };
    overview.kpiSources.purchases = { source: "ga4_fallback", label: "GA4" };
    overview.kpiSources.aov = { source: "ga4_fallback", label: "GA4" };
    overview.kpiSources.roas = { source: "ga4_fallback", label: "GA4" };
    return;
  }

  overview.kpiSources.revenue = { source: "unavailable", label: "Unavailable" };
  overview.kpiSources.purchases = { source: "unavailable", label: "Unavailable" };
  overview.kpiSources.aov = { source: "unavailable", label: "Unavailable" };
  overview.kpiSources.roas = { source: "unavailable", label: "Unavailable" };
}

// Cap concurrent per-day fetches to avoid overwhelming upstream providers.
const DAILY_TREND_BATCH_SIZE = 7;

async function fetchDaySnapshot(businessId: string, date: string) {
  const [metaResult, googleResult, ga4Result] = await Promise.allSettled([
    getMetaOverviewFragment({ businessId, startDate: date, endDate: date }),
    getGoogleOverviewFragment({ businessId, startDate: date, endDate: date }),
    getGa4EcommerceFallback(businessId, date, date),
  ]);

  const metaSpend =
    metaResult.status === "fulfilled" ? Number(metaResult.value.spend ?? 0) : 0;
  const metaRevenue =
    metaResult.status === "fulfilled" ? Number(metaResult.value.revenue ?? 0) : 0;
  const metaPurchases =
    metaResult.status === "fulfilled" ? Number(metaResult.value.purchases ?? 0) : 0;

  const googleSpend =
    googleResult.status === "fulfilled" ? Number(googleResult.value.spend ?? 0) : 0;
  const googleRevenue =
    googleResult.status === "fulfilled" ? Number(googleResult.value.revenue ?? 0) : 0;
  const googlePurchases =
    googleResult.status === "fulfilled" ? Number(googleResult.value.purchases ?? 0) : 0;

  const spend = metaSpend + googleSpend;

  const revenue =
    ga4Result.status === "fulfilled" && ga4Result.value
      ? Number(ga4Result.value.revenue ?? 0)
      : metaRevenue + googleRevenue;

  const purchases =
    ga4Result.status === "fulfilled" && ga4Result.value
      ? Number(ga4Result.value.purchases ?? 0)
      : metaPurchases + googlePurchases;

  return {
    combined: { date, spend: round2(spend), revenue: round2(revenue), purchases: Math.round(purchases) },
    meta: { date, spend: round2(metaSpend), revenue: round2(metaRevenue), purchases: Math.round(metaPurchases) },
    google: { date, spend: round2(googleSpend), revenue: round2(googleRevenue), purchases: Math.round(googlePurchases) },
  };
}

async function buildDailyTrends(params: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<DailyTrendsBundle> {
  const dates = enumerateDays(params.startDate, params.endDate);

  const snapshots: Awaited<ReturnType<typeof fetchDaySnapshot>>[] = [];
  for (let i = 0; i < dates.length; i += DAILY_TREND_BATCH_SIZE) {
    const batch = dates.slice(i, i + DAILY_TREND_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((date) => fetchDaySnapshot(params.businessId, date))
    );
    snapshots.push(...batchResults);
  }

  return {
    combined: snapshots.map((s) => s.combined),
    providerTrends: {
      meta: snapshots.map((s) => s.meta),
      google: snapshots.map((s) => s.google),
    },
  };
}

/**
 * Returns only the batched daily trend data. Used by the /api/overview-sparklines
 * endpoint so the main summary response can return KPIs immediately.
 */
export async function getOverviewTrendBundle(params: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<OverviewTrendBundle> {
  if (isDemoBusinessId(params.businessId)) {
    return getDemoSparklines();
  }
  return buildDailyTrends(params);
}

export async function getOverviewData(params: {
  businessId: string;
  startDate?: string | null;
  endDate?: string | null;
  /**
   * When false the expensive daily-trend batching is skipped. The returned
   * OverviewResponse will have all `trends` arrays empty. Use this flag when
   * sparkline data will be fetched separately via getOverviewTrendBundle().
   * Defaults to true for backwards compatibility.
   */
  includeTrends?: boolean;
}): Promise<OverviewResponse> {
  const { businessId } = params;
  const resolvedStart = params.startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = params.endDate ?? toISODate(new Date());

  if (await isDemoBusiness(businessId)) {
    return getDemoOverview() as unknown as OverviewResponse;
  }

  await getIntegration(businessId, "shopify");

  let totalSpend = 0;
  let totalRevenue = 0;
  let totalPurchases = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  const platformEfficiency: PlatformEfficiencyRow[] = [];

  const [metaResult, googleResult] = await Promise.allSettled([
    getMetaOverviewFragment({
      businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
    }),
    getGoogleOverviewFragment({
      businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
    }),
  ]);

  if (metaResult.status === "fulfilled") {
    totalSpend += metaResult.value.spend;
    totalRevenue += metaResult.value.revenue;
    totalPurchases += metaResult.value.purchases;
    platformEfficiency.push(...metaResult.value.rows);
  } else {
    const message =
      metaResult.reason instanceof Error
        ? metaResult.reason.message
        : String(metaResult.reason);
    console.warn("[overview] meta overview unavailable", { businessId, message });
  }

  if (googleResult.status === "fulfilled") {
    totalSpend += googleResult.value.spend;
    totalRevenue += googleResult.value.revenue;
    totalPurchases += googleResult.value.purchases;
    totalClicks += googleResult.value.clicks;
    totalImpressions += googleResult.value.impressions;
    if (googleResult.value.row) {
      platformEfficiency.push(googleResult.value.row);
    }
  } else {
    const message =
      googleResult.reason instanceof Error
        ? googleResult.reason.message
        : String(googleResult.reason);
    console.warn("[overview] google ads overview unavailable", { businessId, message });
  }

  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const cpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const aov = totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

  const overview: OverviewResponse = {
    businessId,
    dateRange: { startDate: resolvedStart, endDate: resolvedEnd },
    ...(platformEfficiency.length === 0 ? { status: "no_data" } : {}),
    kpis: {
      spend: round2(totalSpend),
      revenue: round2(totalRevenue),
      roas: round2(roas),
      purchases: Math.round(totalPurchases),
      cpa: round2(cpa),
      aov: round2(aov),
    },
    kpiSources: {
      spend: { source: "ad_platforms", label: "Ad platforms" },
      revenue: { source: "unavailable", label: "Unavailable" },
      roas: { source: "unavailable", label: "Unavailable" },
      purchases: { source: "unavailable", label: "Unavailable" },
      cpa: { source: "ad_platforms", label: "Ad platforms" },
      aov: { source: "unavailable", label: "Unavailable" },
    },
    totals: {
      impressions: Math.round(totalImpressions),
      clicks: Math.round(totalClicks),
      purchases: Math.round(totalPurchases),
      spend: round2(totalSpend),
      conversions: Math.round(totalPurchases),
      revenue: round2(totalRevenue),
      ctr: totalImpressions > 0 ? round2((totalClicks / totalImpressions) * 100) : 0,
      cpm: totalImpressions > 0 ? round2((totalSpend / totalImpressions) * 1000) : 0,
      cpc: totalClicks > 0 ? round2(totalSpend / totalClicks) : 0,
      cpa: round2(cpa),
      roas: round2(roas),
    },
    platformEfficiency: platformEfficiency.map((row) => ({
      ...row,
      spend: round2(row.spend),
      revenue: round2(row.revenue),
      roas: round2(row.roas),
      purchases: Math.round(row.purchases),
      cpa: round2(row.cpa),
    })),
    providerTrends: {},
    trends: { "7d": [], "14d": [], "30d": [], custom: [] },
  };

  const skipTrends = params.includeTrends === false;

  const [ga4Fallback, dailyTrends] = await Promise.all([
    getGa4EcommerceFallback(businessId, resolvedStart, resolvedEnd),
    skipTrends
      ? Promise.resolve(null)
      : buildDailyTrends({ businessId, startDate: resolvedStart, endDate: resolvedEnd }),
  ]);

  applyEcommerceSourcePriority(overview, { ga4Fallback });

  if (dailyTrends) {
    overview.providerTrends = dailyTrends.providerTrends;
    overview.trends.custom = dailyTrends.combined;
    overview.trends["7d"] = dailyTrends.combined.slice(-7);
    overview.trends["14d"] = dailyTrends.combined.slice(-14);
    overview.trends["30d"] = dailyTrends.combined.slice(-30);
  }

  if (overview.status === "no_data" && ga4Fallback) {
    delete overview.status;
  }

  return overview;
}
