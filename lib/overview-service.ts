import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoOverview } from "@/lib/demo-business";
import { getGoogleAdsOverviewReport } from "@/lib/google-ads/reporting";
import {
  resolveGa4AnalyticsContext,
  runGA4Report,
} from "@/lib/google-analytics-reporting";
import { getIntegration } from "@/lib/integrations";
import { runMigrations } from "@/lib/migrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  getCachedReport,
  getReportingDateRangeKey,
  setCachedReport,
} from "@/lib/reporting-cache";

interface TrendPoint {
  label: string;
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
  trends: {
    "7d": TrendPoint[];
    "14d": TrendPoint[];
    "30d": TrendPoint[];
    custom: TrendPoint[];
  };
}

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

function parseActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  actionType: string
): number {
  if (!Array.isArray(actions)) return 0;
  const found = actions.find((a) => a.action_type === actionType);
  return found ? parseFloat(found.value) || 0 : 0;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Ga4EcommerceFallback {
  revenue: number;
  purchases: number;
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

const META_OVERVIEW_CACHE_TTL_MINUTES = 15;
const GOOGLE_OVERVIEW_CACHE_TTL_MINUTES = 15;
const GA4_FALLBACK_CACHE_TTL_MINUTES = 15;

async function getGa4EcommerceFallback(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<Ga4EcommerceFallback | null> {
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
      metrics: [{ name: "ecommercePurchases" }, { name: "purchaseRevenue" }],
    });

    const totalsRow = report.totals?.[0] ?? report.rows[0];
    if (!totalsRow) return null;

    const payload = {
      purchases: parseFloat(totalsRow.metrics[0] ?? "0") || 0,
      revenue: parseFloat(totalsRow.metrics[1] ?? "0") || 0,
    };
    await setCachedReport({
      businessId,
      provider: "ga4",
      reportType: "ecommerce_fallback",
      dateRangeKey,
      payload,
    });
    return payload;
  } catch (error) {
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
    const msg = firstError instanceof Error ? firstError.message : String(firstError);
    console.warn("[overview] assignment read failed (first attempt)", {
      businessId: input.businessId,
      message: msg,
    });

    const isMissingTable = msg.includes("does not exist") || msg.includes("relation");
    if (isMissingTable) {
      try {
        await runMigrations();
        const row = await getProviderAccountAssignments(input.businessId, "meta");
        assignedAccountIds = row?.account_ids ?? [];
      } catch (retryError: unknown) {
        const retryMsg =
          retryError instanceof Error ? retryError.message : String(retryError);
        console.error("[overview] assignment read failed after migration", {
          businessId: input.businessId,
          message: retryMsg,
        });
        assignedAccountIds = [];
      }
    } else {
      console.error("[overview] assignment read failed (non-table error)", {
        businessId: input.businessId,
        message: msg,
      });
      assignedAccountIds = [];
    }
  }

  let accessToken: string | null = null;
  try {
    const integration = await getIntegration(input.businessId, "meta");
    accessToken = integration?.access_token ?? null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[overview] integration read failed", {
      businessId: input.businessId,
      message: msg,
    });
  }

  if (!accessToken || assignedAccountIds.length === 0) {
    return { spend: 0, revenue: 0, purchases: 0, rows: [] };
  }

  const metaResults = await Promise.allSettled(
    assignedAccountIds.map(async (accountId) => {
      const insightsUrl = new URL(
        `https://graph.facebook.com/v25.0/${accountId}/insights`
      );
      insightsUrl.searchParams.set(
        "fields",
        "spend,actions,action_values,purchase_roas"
      );
      insightsUrl.searchParams.set(
        "time_range",
        JSON.stringify({ since: input.startDate, until: input.endDate })
      );
      insightsUrl.searchParams.set("access_token", accessToken);

      const res = await fetch(insightsUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(`Meta insights ${res.status}: ${raw.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        data?: Array<{
          spend?: string;
          actions?: Array<{ action_type: string; value: string }>;
          action_values?: Array<{ action_type: string; value: string }>;
          purchase_roas?: Array<{ action_type: string; value: string }>;
        }>;
      };

      const data = json?.data?.[0];
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
    shopifyConnected: boolean;
    ga4Fallback: Ga4EcommerceFallback | null;
  }
) {
  const { shopifyConnected, ga4Fallback } = options;
  const hasGa4Fallback = ga4Fallback !== null;
  const shouldUseShopifyPrimary = shopifyConnected && !overview.status;

  if (shouldUseShopifyPrimary) {
    overview.kpiSources.revenue = { source: "shopify", label: "Shopify" };
    overview.kpiSources.purchases = { source: "shopify", label: "Shopify" };
    overview.kpiSources.aov = { source: "shopify", label: "Shopify" };
    overview.kpiSources.roas = { source: "shopify", label: "Shopify" };
    return;
  }

  if (hasGa4Fallback && ga4Fallback) {
    const revenue = round2(ga4Fallback.revenue);
    const purchases = Math.round(ga4Fallback.purchases);
    const aov = purchases > 0 ? round2(ga4Fallback.revenue / ga4Fallback.purchases) : 0;
    const roas = overview.kpis.spend > 0 ? round2(ga4Fallback.revenue / overview.kpis.spend) : 0;

    overview.kpis.revenue = revenue;
    overview.kpis.purchases = purchases;
    overview.kpis.aov = aov;
    overview.kpis.roas = roas;

    overview.totals.revenue = revenue;
    overview.totals.purchases = purchases;
    overview.totals.conversions = purchases;
    overview.totals.roas = roas;

    overview.kpiSources.revenue = { source: "ga4_fallback", label: "GA4 fallback" };
    overview.kpiSources.purchases = { source: "ga4_fallback", label: "GA4 fallback" };
    overview.kpiSources.aov = { source: "ga4_fallback", label: "GA4 fallback" };
    overview.kpiSources.roas = { source: "ga4_fallback", label: "GA4 fallback" };
    return;
  }

  overview.kpiSources.revenue = { source: "unavailable", label: "Unavailable" };
  overview.kpiSources.purchases = { source: "unavailable", label: "Unavailable" };
  overview.kpiSources.aov = { source: "unavailable", label: "Unavailable" };
  overview.kpiSources.roas = { source: "unavailable", label: "Unavailable" };
}

export async function getOverviewData(params: {
  businessId: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<OverviewResponse> {
  const { businessId } = params;
  const resolvedStart = params.startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = params.endDate ?? toISODate(new Date());

  if (await isDemoBusiness(businessId)) {
    return getDemoOverview() as OverviewResponse;
  }

  const shopifyConnected =
    (await getIntegration(businessId, "shopify"))?.status === "connected";

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

  if (platformEfficiency.length === 0) {
    const emptyOverview = buildEmptyOverview(businessId, resolvedStart, resolvedEnd, "no_data");
    const ga4Fallback = await getGa4EcommerceFallback(
      businessId,
      resolvedStart,
      resolvedEnd
    );
    applyEcommerceSourcePriority(emptyOverview, {
      shopifyConnected,
      ga4Fallback,
    });
    return emptyOverview;
  }

  const overview: OverviewResponse = {
    businessId,
    dateRange: { startDate: resolvedStart, endDate: resolvedEnd },
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
    trends: { "7d": [], "14d": [], "30d": [], custom: [] },
  };

  const ga4Fallback = await getGa4EcommerceFallback(businessId, resolvedStart, resolvedEnd);
  applyEcommerceSourcePriority(overview, {
    shopifyConnected,
    ga4Fallback,
  });

  return overview;
}
