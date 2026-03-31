import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoOverview, getDemoSparklines, isDemoBusinessId } from "@/lib/demo-business";
import { getGoogleAdsOverviewReport } from "@/lib/google-ads/serving";
import {
  resolveGa4AnalyticsContext,
  runGA4Report,
} from "@/lib/google-analytics-reporting";
import { getIntegration, getIntegrationMetadata } from "@/lib/integrations";
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
  applyEcommerceSourcePriority,
  buildOverviewResponse,
} from "@/lib/overview-response-support";
import {
  getCachedReport,
  getReportingDateRangeKey,
  setCachedReport,
} from "@/lib/reporting-cache";
import { getMetaWarehouseSummary } from "@/lib/meta/serving";
import { getShopifyOverviewAggregate } from "@/lib/shopify/overview";

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

interface MetaAccessContext {
  assignedAccountIds: string[];
  connected: boolean;
}

const META_OVERVIEW_CACHE_TTL_MINUTES = 15;
const GA4_FALLBACK_CACHE_TTL_MINUTES = 15;
const GA4_FALLBACK_ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const ga4FallbackFailureUntilByBusiness = new Map<string, number>();
const DAILY_TREND_BATCH_SIZE = Number(process.env.OVERVIEW_DAILY_TREND_BATCH_SIZE ?? 3);
const META_ACCESS_CACHE_TTL_MS = 30 * 1000;
const metaAccessCache = new Map<string, { expiresAt: number; value: Promise<MetaAccessContext> }>();

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

async function getMetaAccessContext(businessId: string): Promise<MetaAccessContext> {
  const cached = metaAccessCache.get(businessId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = (async () => {
    let assignedAccountIds: string[] = [];
    try {
      const row = await getProviderAccountAssignments(businessId, "meta");
      assignedAccountIds = row?.account_ids ?? [];
    } catch (firstError: unknown) {
      const message = firstError instanceof Error ? firstError.message : String(firstError);
      const isMissingTable = message.includes("does not exist") || message.includes("relation");

      if (isMissingTable) {
        try {
          await runMigrations();
          const row = await getProviderAccountAssignments(businessId, "meta");
          assignedAccountIds = row?.account_ids ?? [];
        } catch (retryError: unknown) {
          const retryMessage =
            retryError instanceof Error ? retryError.message : String(retryError);
          console.error("[overview] assignment read failed after migration", {
            businessId,
            message: retryMessage,
          });
        }
      } else {
        console.error("[overview] assignment read failed", {
          businessId,
          message,
        });
      }
    }

    let connected = false;
    try {
      const integration = await getIntegrationMetadata(businessId, "meta");
      connected = Boolean(integration?.status === "connected");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[overview] integration read failed", {
        businessId,
        message,
      });
    }

    return { assignedAccountIds, connected };
  })();

  metaAccessCache.set(businessId, {
    expiresAt: Date.now() + META_ACCESS_CACHE_TTL_MS,
    value,
  });
  return value;
}

async function getMetaOverviewFragment(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaOverviewFragment> {
  const { assignedAccountIds, connected } = await getMetaAccessContext(input.businessId);

  if (!connected || assignedAccountIds.length === 0) {
    return { spend: 0, revenue: 0, purchases: 0, rows: [] };
  }

  try {
    const warehouseSummary = await getMetaWarehouseSummary({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      providerAccountIds: assignedAccountIds,
    });
    if (warehouseSummary.accounts.length > 0) {
      const payload: MetaOverviewFragment = {
        spend: warehouseSummary.totals.spend,
        revenue: warehouseSummary.totals.revenue,
        purchases: warehouseSummary.totals.conversions,
        rows: warehouseSummary.accounts.map((account) => ({
          platform: "meta",
          spend: account.spend,
          revenue: account.revenue,
          purchases: account.conversions,
          cpa: account.conversions > 0 ? account.spend / account.conversions : 0,
          roas: account.roas,
        })),
      };
      return payload;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[overview] meta warehouse summary unavailable", {
      businessId: input.businessId,
      message,
    });
  }
  return { spend: 0, revenue: 0, purchases: 0, rows: [] };
}

async function getGoogleOverviewFragment(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<GoogleOverviewFragment> {
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

  return payload;
}

async function fetchDaySnapshot(businessId: string, date: string) {
  const [metaResult, googleResult, shopifyResult, ga4Result] = await Promise.allSettled([
    getMetaOverviewFragment({ businessId, startDate: date, endDate: date }),
    getGoogleOverviewFragment({ businessId, startDate: date, endDate: date }),
    getShopifyOverviewAggregate({ businessId, startDate: date, endDate: date }),
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
  const shopifyRevenue =
    shopifyResult.status === "fulfilled" && shopifyResult.value
      ? Number(shopifyResult.value.revenue ?? 0)
      : 0;
  const shopifyPurchases =
    shopifyResult.status === "fulfilled" && shopifyResult.value
      ? Number(shopifyResult.value.purchases ?? 0)
      : 0;

  const revenue =
    shopifyRevenue > 0 || shopifyPurchases > 0
      ? shopifyRevenue
      : ga4Result.status === "fulfilled" && ga4Result.value
      ? Number(ga4Result.value.revenue ?? 0)
      : metaRevenue + googleRevenue;

  const purchases =
    shopifyRevenue > 0 || shopifyPurchases > 0
      ? shopifyPurchases
      : ga4Result.status === "fulfilled" && ga4Result.value
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
  const shopifyAggregate = await getShopifyOverviewAggregate(params).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[overview] shopify daily trends unavailable", {
      businessId: params.businessId,
      message,
    });
    return null;
  });
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
    combined: snapshots.map((s) => {
      const shopifyDay = shopifyAggregate?.dailyTrends.find((entry) => entry.date === s.combined.date);
      return {
        date: s.combined.date,
        spend: s.combined.spend,
        revenue: round2(shopifyDay?.revenue ?? s.combined.revenue),
        purchases: Math.round(shopifyDay?.purchases ?? s.combined.purchases),
      };
    }),
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

  await getIntegration(businessId, "shopify").catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[overview] shopify integration warmup failed", { businessId, message });
  });

  let totalSpend = 0;
  let totalRevenue = 0;
  let totalPurchases = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  const platformEfficiency: PlatformEfficiencyRow[] = [];

  const [metaResult, googleResult, shopifyResult] = await Promise.allSettled([
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
    getShopifyOverviewAggregate({
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

  const shopifyAggregate = shopifyResult.status === "fulfilled" ? shopifyResult.value : null;
  if (shopifyResult.status === "rejected") {
    const message =
      shopifyResult.reason instanceof Error
        ? shopifyResult.reason.message
        : String(shopifyResult.reason);
    console.warn("[overview] shopify overview unavailable", { businessId, message });
  }

  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const cpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const aov = totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

  const overview = buildOverviewResponse({
    businessId,
    startDate: resolvedStart,
    endDate: resolvedEnd,
    totalSpend,
    totalRevenue,
    totalPurchases,
    totalClicks,
    totalImpressions,
    roas,
    cpa,
    aov,
    platformEfficiency,
  });

  const skipTrends = params.includeTrends === false;

  const [ga4Fallback, dailyTrends] = await Promise.all([
    shopifyAggregate
      ? Promise.resolve(null)
      : getGa4EcommerceFallback(businessId, resolvedStart, resolvedEnd),
    skipTrends
      ? Promise.resolve(null)
      : buildDailyTrends({ businessId, startDate: resolvedStart, endDate: resolvedEnd }),
  ]);

  applyEcommerceSourcePriority(overview, {
    shopify: shopifyAggregate,
    ga4Fallback,
  });

  if (dailyTrends) {
    overview.providerTrends = dailyTrends.providerTrends;
    overview.trends.custom = dailyTrends.combined;
    overview.trends["7d"] = dailyTrends.combined.slice(-7);
    overview.trends["14d"] = dailyTrends.combined.slice(-14);
    overview.trends["30d"] = dailyTrends.combined.slice(-30);
  }

  if (overview.status === "no_data" && (ga4Fallback || shopifyAggregate)) {
    delete overview.status;
  }

  return overview;
}
