import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoOverview, getDemoSparklines, isDemoBusinessId } from "@/lib/demo-business";
import { getGoogleAdsOverviewSummaryAggregate } from "@/lib/google-ads/serving";
import { readGoogleAdsDailyRange } from "@/lib/google-ads/warehouse";
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
import { getMetaAccountDailyRange } from "@/lib/meta/warehouse";
import { logPerfEvent, measurePerf } from "@/lib/perf";
import {
  getShopifyOverviewReadCandidate,
  getShopifyOverviewSummaryReadCandidate,
  type ShopifyOverviewServingMetadata,
} from "@/lib/shopify/read-adapter";

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
        source:
          | "shopify_ledger"
          | "shopify_warehouse"
          | "shopify_live_fallback"
          | "ga4_fallback"
          | "ad_platforms"
          | "unavailable";
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
  shopifyServing?: ShopifyOverviewServingMetadata | null;
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

interface TimedResult<T> {
  durationMs: number;
  result: T;
}

interface MetaAccessContext {
  assignedAccountIds: string[];
  connected: boolean;
}

const META_OVERVIEW_CACHE_TTL_MINUTES = 15;
const GA4_FALLBACK_CACHE_TTL_MINUTES = 15;
const GA4_FALLBACK_ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const ga4FallbackFailureUntilByBusiness = new Map<string, number>();
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
  const { assignedAccountIds } = await getMetaAccessContext(input.businessId);

  if (assignedAccountIds.length === 0) {
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
  const googleOverview = await getGoogleAdsOverviewSummaryAggregate({
    businessId: input.businessId,
    accountId: null,
    dateRange: "custom",
    customStart: input.startDate,
    customEnd: input.endDate,
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

async function measureComponent<T>(operation: () => Promise<T>): Promise<TimedResult<T>> {
  const startedAt = Date.now();
  const result = await operation();
  return {
    durationMs: Date.now() - startedAt,
    result,
  };
}

async function resolveShopifyOverviewAggregateForRead(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  purpose?: "summary" | "full";
}) {
  const candidate =
    input.purpose === "summary"
      ? await getShopifyOverviewSummaryReadCandidate(input)
      : await getShopifyOverviewReadCandidate(input);
  const liveDailyByDate = new Map(
    (candidate.live?.dailyTrends ?? []).map((row) => [row.date, row])
  );

  if (candidate.preferredSource === "warehouse" && candidate.warehouse) {
    console.info("[overview] shopify warehouse read canary selected", {
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      revenueDeltaPercent: candidate.divergence?.revenueDeltaPercent ?? null,
      purchaseDelta: candidate.divergence?.purchaseDelta ?? null,
    });

    return {
      aggregate: {
        revenue: candidate.warehouse.revenue,
        purchases: candidate.warehouse.purchases,
        averageOrderValue: candidate.warehouse.averageOrderValue,
        grossRevenue: candidate.warehouse.grossRevenue,
        refundedRevenue: candidate.warehouse.refundedRevenue,
        returnEvents: candidate.warehouse.returnEvents,
        sessions: candidate.live?.sessions ?? null,
        conversionRate: candidate.live?.conversionRate ?? null,
        newCustomers: candidate.live?.newCustomers ?? null,
        returningCustomers: candidate.live?.returningCustomers ?? null,
        dailyTrends: candidate.warehouse.daily.map((row) => {
          const liveRow = liveDailyByDate.get(row.date);
          return {
            date: row.date,
            revenue: row.netRevenue,
            grossRevenue: row.orderRevenue,
            refundedRevenue: row.refundedRevenue,
            returnEvents: row.returnEvents,
            purchases: row.orders,
            sessions: liveRow?.sessions ?? null,
            conversionRate: liveRow?.conversionRate ?? null,
            newCustomers: liveRow?.newCustomers ?? null,
            returningCustomers: liveRow?.returningCustomers ?? null,
          };
        }),
      },
      serving: candidate.servingMetadata,
    };
  }

  if (candidate.preferredSource === "ledger" && candidate.ledger) {
    console.info("[overview] shopify ledger read canary selected", {
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      revenueDeltaPercent: candidate.divergence?.revenueDeltaPercent ?? null,
      purchaseDelta: candidate.divergence?.purchaseDelta ?? null,
      ledgerRevenueDeltaPercent:
        typeof candidate.ledgerConsistency?.revenueDeltaPercent === "number"
          ? candidate.ledgerConsistency.revenueDeltaPercent
          : null,
    });

    return {
      aggregate: {
        revenue: candidate.ledger.revenue,
        purchases: candidate.ledger.purchases,
        averageOrderValue: candidate.ledger.averageOrderValue,
        grossRevenue: candidate.ledger.grossRevenue,
        refundedRevenue: candidate.ledger.refundedRevenue,
        returnEvents: candidate.ledger.returnEvents,
        sessions: candidate.live?.sessions ?? null,
        conversionRate: candidate.live?.conversionRate ?? null,
        newCustomers: candidate.live?.newCustomers ?? null,
        returningCustomers: candidate.live?.returningCustomers ?? null,
        dailyTrends: candidate.ledger.daily.map((row) => {
          const liveRow = liveDailyByDate.get(row.date);
          return {
            date: row.date,
            revenue: row.netRevenue,
            grossRevenue: row.orderRevenue,
            refundedRevenue: row.refundedRevenue,
            returnEvents: row.returnEvents,
            purchases: row.orders,
            sessions: liveRow?.sessions ?? null,
            conversionRate: liveRow?.conversionRate ?? null,
            newCustomers: liveRow?.newCustomers ?? null,
            returningCustomers: liveRow?.returningCustomers ?? null,
          };
        }),
      },
      serving: candidate.servingMetadata,
    };
  }

  if (candidate.canaryEnabled) {
    console.info("[overview] shopify warehouse read canary blocked", {
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      status: candidate.status.state,
      preferredSource: candidate.preferredSource,
      reasons: candidate.decisionReasons,
      revenueDeltaPercent: candidate.divergence?.revenueDeltaPercent ?? null,
      maxDailyRevenueDeltaPercent: candidate.divergence?.maxDailyRevenueDeltaPercent ?? null,
      purchaseDelta: candidate.divergence?.purchaseDelta ?? null,
      maxDailyPurchaseDelta: candidate.divergence?.maxDailyPurchaseDelta ?? null,
    });
  }

  return {
    aggregate: candidate.live,
    serving: candidate.servingMetadata,
  };
}

export async function getShopifyOverviewServingData(params: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  return resolveShopifyOverviewAggregateForRead({ ...params, purpose: "full" });
}

async function buildDailyTrends(params: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<DailyTrendsBundle> {
  return measurePerf(
    "overview_daily_trends_build",
    {
      businessId: params.businessId,
      startDate: params.startDate,
      endDate: params.endDate,
    },
    async () => {
      const [metaContext, shopifyResult, googleAssignment] = await Promise.all([
        getMetaAccessContext(params.businessId),
        resolveShopifyOverviewAggregateForRead(params).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn("[overview] shopify daily trends unavailable", {
            businessId: params.businessId,
            message,
          });
          return null;
        }),
        getProviderAccountAssignments(params.businessId, "google").catch(() => null),
      ]);

      const [metaRows, googleRows] = await Promise.all([
        metaContext.assignedAccountIds.length > 0
          ? getMetaAccountDailyRange({
              businessId: params.businessId,
              startDate: params.startDate,
              endDate: params.endDate,
              providerAccountIds: metaContext.assignedAccountIds,
            }).catch(() => [])
          : Promise.resolve([]),
        googleAssignment && googleAssignment.account_ids.length > 0
          ? readGoogleAdsDailyRange({
              scope: "account_daily",
              businessId: params.businessId,
              providerAccountIds: googleAssignment.account_ids,
              startDate: params.startDate,
              endDate: params.endDate,
            }).catch(() => [])
          : Promise.resolve([]),
      ]);

      const dates = enumerateDays(params.startDate, params.endDate);
      const metaByDate = new Map<string, DailyTrendPoint>();
      const googleByDate = new Map<string, DailyTrendPoint>();

      for (const row of metaRows) {
        const current = metaByDate.get(row.date) ?? { date: row.date, spend: 0, revenue: 0, purchases: 0 };
        current.spend += Number(row.spend ?? 0);
        current.revenue += Number(row.revenue ?? 0);
        current.purchases += Number(row.conversions ?? 0);
        metaByDate.set(row.date, current);
      }

      for (const row of googleRows) {
        const current = googleByDate.get(row.date) ?? { date: row.date, spend: 0, revenue: 0, purchases: 0 };
        current.spend += Number(row.spend ?? 0);
        current.revenue += Number(row.revenue ?? 0);
        current.purchases += Number(row.conversions ?? 0);
        googleByDate.set(row.date, current);
      }

      const shopifyByDate = new Map(
        (shopifyResult?.aggregate?.dailyTrends ?? []).map((row) => [row.date, row]),
      );
      const metaTrend = dates.map((date) => {
        const row = metaByDate.get(date);
        return {
          date,
          spend: round2(row?.spend ?? 0),
          revenue: round2(row?.revenue ?? 0),
          purchases: Math.round(row?.purchases ?? 0),
        };
      });
      const googleTrend = dates.map((date) => {
        const row = googleByDate.get(date);
        return {
          date,
          spend: round2(row?.spend ?? 0),
          revenue: round2(row?.revenue ?? 0),
          purchases: Math.round(row?.purchases ?? 0),
        };
      });

      return {
        combined: dates.map((date, index) => {
          const shopifyDay = shopifyByDate.get(date);
          const spend = metaTrend[index]!.spend + googleTrend[index]!.spend;
          const warehouseRevenue = metaTrend[index]!.revenue + googleTrend[index]!.revenue;
          const warehousePurchases = metaTrend[index]!.purchases + googleTrend[index]!.purchases;
          return {
            date,
            spend: round2(spend),
            revenue: round2(shopifyDay?.revenue ?? warehouseRevenue),
            purchases: Math.round(shopifyDay?.purchases ?? warehousePurchases),
          };
        }),
        providerTrends: {
          meta: metaTrend,
          google: googleTrend,
        },
      };
    },
  );
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
  const orchestrationStartedAt = Date.now();
  const dateSpanDays = enumerateDays(resolvedStart, resolvedEnd).length;
  const perfContext = {
    businessId,
    startDate: resolvedStart,
    endDate: resolvedEnd,
    dateSpanDays,
    includeTrends: params.includeTrends !== false,
  };

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
    measureComponent(() =>
      getMetaOverviewFragment({
        businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
      }),
    ),
    measureComponent(() =>
      getGoogleOverviewFragment({
        businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
      }),
    ),
    measureComponent(() =>
      resolveShopifyOverviewAggregateForRead({
        businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
        purpose: params.includeTrends === false ? "summary" : "full",
      }),
    ),
  ]);

  const componentPerf: Record<string, number | null> = {
    metaDurationMs: metaResult.status === "fulfilled" ? metaResult.value.durationMs : null,
    googleDurationMs: googleResult.status === "fulfilled" ? googleResult.value.durationMs : null,
    shopifyDurationMs: shopifyResult.status === "fulfilled" ? shopifyResult.value.durationMs : null,
    ga4FallbackDurationMs: null,
    aggregationDurationMs: null,
  };

  if (metaResult.status === "fulfilled") {
    totalSpend += metaResult.value.result.spend;
    totalRevenue += metaResult.value.result.revenue;
    totalPurchases += metaResult.value.result.purchases;
    platformEfficiency.push(...metaResult.value.result.rows);
  } else {
    const message =
      metaResult.reason instanceof Error
        ? metaResult.reason.message
        : String(metaResult.reason);
    console.warn("[overview] meta overview unavailable", { businessId, message });
  }

  if (googleResult.status === "fulfilled") {
    totalSpend += googleResult.value.result.spend;
    totalRevenue += googleResult.value.result.revenue;
    totalPurchases += googleResult.value.result.purchases;
    totalClicks += googleResult.value.result.clicks;
    totalImpressions += googleResult.value.result.impressions;
    if (googleResult.value.result.row) {
      platformEfficiency.push(googleResult.value.result.row);
    }
  } else {
    const message =
      googleResult.reason instanceof Error
        ? googleResult.reason.message
        : String(googleResult.reason);
    console.warn("[overview] google ads overview unavailable", { businessId, message });
  }

  const shopifyResolution = shopifyResult.status === "fulfilled" ? shopifyResult.value.result : null;
  const shopifyAggregate = shopifyResolution?.aggregate ?? null;
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

  const aggregationStartedAt = Date.now();
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
  componentPerf.aggregationDurationMs = Date.now() - aggregationStartedAt;

  const skipTrends = params.includeTrends === false;

  const [ga4FallbackResult, dailyTrends] = await Promise.all([
    shopifyAggregate
      ? Promise.resolve<TimedResult<Ga4EcommerceFallback | null> | null>(null)
      : measureComponent(() => getGa4EcommerceFallback(businessId, resolvedStart, resolvedEnd)),
    skipTrends
      ? Promise.resolve(null)
      : buildDailyTrends({ businessId, startDate: resolvedStart, endDate: resolvedEnd }),
  ]);
  componentPerf.ga4FallbackDurationMs = ga4FallbackResult?.durationMs ?? null;
  const ga4Fallback = ga4FallbackResult?.result ?? null;

  applyEcommerceSourcePriority(overview, {
    shopify: shopifyAggregate
      ? {
          ...shopifyAggregate,
          source:
            shopifyResolution?.serving?.source === "ledger"
              ? "shopify_ledger"
              : shopifyResolution?.serving?.source === "warehouse"
                ? "shopify_warehouse"
                : "shopify_live_fallback",
        }
      : null,
    ga4Fallback,
  });
  overview.shopifyServing = shopifyResolution?.serving ?? null;

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

  const readSource =
    shopifyResolution?.serving?.source === "ledger"
      ? "shopify_ledger"
      : shopifyResolution?.serving?.source === "warehouse"
        ? "shopify_warehouse"
        : shopifyAggregate
          ? "shopify_live_fallback"
          : ga4Fallback
            ? "ga4_fallback"
            : "ad_platforms";
  const shopifyDailyTrendCount = shopifyAggregate?.dailyTrends?.length ?? 0;
  logPerfEvent(
    skipTrends ? "overview_data_no_trends" : "overview_data_with_trends",
    {
      ...perfContext,
      ...componentPerf,
      accountCount: platformEfficiency.length,
      rowCount: platformEfficiency.length,
      readSource,
      shopifyDailyTrendCount,
      durationMs: Date.now() - orchestrationStartedAt,
    },
  );

  return overview;
}
