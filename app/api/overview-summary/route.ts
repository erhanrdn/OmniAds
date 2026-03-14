import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getBusinessCostModel } from "@/lib/business-cost-model";
import {
  resolveGa4AnalyticsContext,
  runGA4Report,
} from "@/lib/google-analytics-reporting";
import { buildOverviewOpportunities } from "@/lib/overviewInsights";
import type {
  OverviewAttributionRow,
  BusinessCostModelData,
  OverviewData,
  OverviewInsightCard,
  OverviewMetricCardData,
  OverviewMetricStatus,
  OverviewMetricUnit,
  OverviewPlatformSection,
  OverviewSummaryData,
} from "@/src/types/models";

type CompareMode = "none" | "previous_period";

interface AnalyticsOverviewResponse {
  propertyName?: string;
  kpis?: {
    sessions?: number;
    engagedSessions?: number;
    engagementRate?: number;
    purchases?: number;
    purchaseCvr?: number;
    revenue?: number;
    avgSessionDuration?: number;
  };
}

type IntegrationStatusResponse = Record<string, boolean>;

interface Ga4LtvSnapshot {
  revenuePerCustomer: number | null;
  repeatPurchaseRate: number | null;
  averageCustomerLtv: number | null;
  ltvToCac: number | null;
  customerLifespan: number | null;
}

const ATTRIBUTION_PROVIDER_LABELS: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  klaviyo: "Klaviyo",
};

const ATTRIBUTION_PROVIDER_ORDER = [
  "meta",
  "google",
  "tiktok",
  "pinterest",
  "snapchat",
  "klaviyo",
] as const;

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string | null | undefined, fallback: Date) {
  if (!value) return new Date(fallback);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
}

function getPreviousWindow(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const diffDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  );
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (diffDays - 1));
  return {
    startDate: toIsoDate(previousStart),
    endDate: toIsoDate(previousEnd),
  };
}

function computeChangePct(current: number | null, previous: number | null, compareMode: CompareMode) {
  if (compareMode === "none") return null;
  if (current === null || previous === null || previous === 0) return null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

function trendDirection(changePct: number | null): "up" | "down" | "neutral" {
  if (changePct === null || changePct === 0) return "neutral";
  return changePct > 0 ? "up" : "down";
}

function inferMetricStatus(value: number | null, helperText?: string): OverviewMetricStatus {
  if (value === null) return "unavailable";
  return helperText ? "partial" : "available";
}

function buildMetricCard(params: {
  id: string;
  title: string;
  subtitle?: string;
  value: number | null;
  previousValue?: number | null;
  unit: OverviewMetricUnit;
  sourceKey: string;
  sourceLabel: string;
  helperText?: string;
  sparklineData?: number[];
  icon?: string;
  compareMode: CompareMode;
}): OverviewMetricCardData {
  const changePct = computeChangePct(
    params.value,
    params.previousValue ?? null,
    params.compareMode
  );
  return {
    id: params.id,
    title: params.title,
    subtitle: params.subtitle,
    value: params.value,
    previousValue: params.previousValue ?? null,
    changePct,
    sparklineData:
      params.sparklineData && params.sparklineData.length > 0
        ? params.sparklineData
        : [params.previousValue ?? 0, params.value ?? 0],
    trendDirection: trendDirection(changePct),
    dataSource: {
      key: params.sourceKey,
      label: params.sourceLabel,
    },
    status: inferMetricStatus(params.value, params.helperText),
    helperText: params.helperText,
    unit: params.unit,
    icon: params.icon,
  };
}

function buildUnavailableMetric(params: {
  id: string;
  title: string;
  subtitle?: string;
  helperText: string;
  sourceLabel?: string;
  sourceKey?: string;
  unit?: OverviewMetricUnit;
  icon?: string;
}): OverviewMetricCardData {
  return {
    id: params.id,
    title: params.title,
    subtitle: params.subtitle,
    value: null,
    previousValue: null,
    changePct: null,
    sparklineData: [],
    trendDirection: "neutral",
    dataSource: {
      key: params.sourceKey ?? "unavailable",
      label: params.sourceLabel ?? "Unavailable",
    },
    status: "unavailable",
    helperText: params.helperText,
    unit: params.unit ?? "count",
    icon: params.icon,
  };
}

function findPlatformRow(data: OverviewData | null, platform: string) {
  return data?.platformEfficiency.find(
    (row) => row.platform.toLowerCase() === platform.toLowerCase()
  ) ?? null;
}

async function fetchInternalJson<T>(
  request: NextRequest,
  pathname: string,
  searchParams: Record<string, string | null | undefined>
): Promise<{ ok: true; data: T } | { ok: false; status: number; payload: unknown }> {
  const url = new URL(pathname, request.nextUrl.origin);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, status: response.status, payload };
  }
  return { ok: true, data: payload as T };
}

function mapInsights(data: OverviewData, ga4Connected: boolean): OverviewInsightCard[] {
  return buildOverviewOpportunities({
    data,
    ga4Connected,
  }).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.disabled && item.emptyMessage ? item.emptyMessage : item.description,
    severity: item.impact === "High" ? "high" : item.impact === "Med" ? "medium" : "low",
    status: item.disabled ? "informational" : "active",
  }));
}

function buildAttributionRows(
  overview: OverviewData,
  integrationsStatus: IntegrationStatusResponse | null
): OverviewAttributionRow[] {
  const connectedProviders = ATTRIBUTION_PROVIDER_ORDER.filter(
    (provider) => integrationsStatus?.[provider]
  );
  const metricsByProvider = new Map(
    overview.platformEfficiency.map((row) => [row.platform.toLowerCase(), row])
  );

  return connectedProviders.map((provider) => {
    const metrics = metricsByProvider.get(provider) ?? null;
    const spend = metrics?.spend ?? 0;
    const revenue = metrics?.revenue ?? 0;
    const conversions = metrics?.purchases ?? 0;
    return {
      channel: ATTRIBUTION_PROVIDER_LABELS[provider],
      spend,
      revenue,
      roas: metrics?.roas ?? 0,
      conversions,
      clicks: 0,
      ctr: 0,
      cpa: metrics?.cpa ?? 0,
      aov: conversions > 0 ? Number((revenue / conversions).toFixed(2)) : 0,
      source: metrics ? "Overview aggregation" : "Connected platform with no synced attribution data",
    };
  });
}

function buildPlatformSections(
  current: OverviewData,
  previous: OverviewData | null,
  compareMode: CompareMode
): OverviewPlatformSection[] {
  return current.platformEfficiency.map((row) => {
    const previousRow = findPlatformRow(previous, row.platform);
    const provider = row.platform.toLowerCase();
    return {
      id: provider,
      title: row.platform,
      provider,
      metrics: [
        buildMetricCard({
          id: `${provider}-spend`,
          title: "Spend",
          value: row.spend,
          previousValue: previousRow?.spend ?? null,
          unit: "currency",
          sourceKey: provider,
          sourceLabel: row.platform,
          compareMode,
          icon: "wallet",
        }),
        buildMetricCard({
          id: `${provider}-revenue`,
          title: "Revenue",
          value: row.revenue,
          previousValue: previousRow?.revenue ?? null,
          unit: "currency",
          sourceKey: provider,
          sourceLabel: row.platform,
          compareMode,
          icon: "badge-dollar-sign",
        }),
        buildMetricCard({
          id: `${provider}-roas`,
          title: "ROAS",
          value: row.roas,
          previousValue: previousRow?.roas ?? null,
          unit: "ratio",
          sourceKey: provider,
          sourceLabel: row.platform,
          compareMode,
          icon: "chart-line",
        }),
        buildMetricCard({
          id: `${provider}-purchases`,
          title: "Conversions",
          value: row.purchases,
          previousValue: previousRow?.purchases ?? null,
          unit: "count",
          sourceKey: provider,
          sourceLabel: row.platform,
          compareMode,
          icon: "shopping-cart",
        }),
        buildMetricCard({
          id: `${provider}-cpa`,
          title: "CPA",
          value: row.cpa,
          previousValue: previousRow?.cpa ?? null,
          unit: "currency",
          sourceKey: provider,
          sourceLabel: row.platform,
          compareMode,
          icon: "target",
        }),
      ],
    };
  });
}

function toCostModelData(
  costModel: Awaited<ReturnType<typeof getBusinessCostModel>>
): BusinessCostModelData | null {
  if (!costModel) return null;
  return {
    cogsPercent: costModel.cogsPercent,
    shippingPercent: costModel.shippingPercent,
    feePercent: costModel.feePercent,
    fixedCost: costModel.fixedCost,
    updatedAt: costModel.updatedAt,
  };
}

async function getGa4LtvSnapshot(params: {
  businessId: string;
  startDate: string;
  endDate: string;
  spend: number;
}): Promise<Ga4LtvSnapshot | null> {
  try {
    const context = await resolveGa4AnalyticsContext(params.businessId, {
      requireProperty: true,
    });
    if (!context.propertyId) return null;

    const report = await runGA4Report({
      propertyId: context.propertyId,
      accessToken: context.accessToken,
      dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
      metrics: [
        { name: "purchaseRevenue" },
        { name: "totalPurchasers" },
        { name: "firstTimePurchasers" },
        { name: "transactionsPerPurchaser" },
        { name: "averagePurchaseRevenuePerPayingUser" },
      ],
    });

    const totalsRow = report.totals?.[0] ?? report.rows[0];
    if (!totalsRow) return null;

    const purchaseRevenue = parseFloat(totalsRow.metrics[0] ?? "0") || 0;
    const totalPurchasers = parseFloat(totalsRow.metrics[1] ?? "0") || 0;
    const firstTimePurchasers = parseFloat(totalsRow.metrics[2] ?? "0") || 0;
    const averageRevenuePerPayingUser = parseFloat(totalsRow.metrics[4] ?? "0") || 0;

    const revenuePerCustomer =
      totalPurchasers > 0 ? Number((purchaseRevenue / totalPurchasers).toFixed(2)) : null;
    const repeatPurchaseRate =
      totalPurchasers > 0
        ? Number(
            (
              (Math.max(totalPurchasers - firstTimePurchasers, 0) / totalPurchasers) *
              100
            ).toFixed(1)
          )
        : null;
    const averageCustomerLtv =
      averageRevenuePerPayingUser > 0
        ? Number(averageRevenuePerPayingUser.toFixed(2))
        : revenuePerCustomer;
    const cac =
      params.spend > 0 && firstTimePurchasers > 0
        ? Number((params.spend / firstTimePurchasers).toFixed(2))
        : null;
    const ltvToCac =
      averageCustomerLtv !== null && cac !== null && cac > 0
        ? Number((averageCustomerLtv / cac).toFixed(2))
        : null;

    return {
      revenuePerCustomer,
      repeatPurchaseRate,
      averageCustomerLtv,
      ltvToCac,
      customerLifespan: null,
    };
  } catch (error) {
    console.warn("[overview-summary] ga4_ltv_snapshot_unavailable", {
      businessId: params.businessId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");
  const compareMode =
    (request.nextUrl.searchParams.get("compareMode") as CompareMode | null) ?? "previous_period";

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId query parameter is required." },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const resolvedStart = toIsoDate(parseIsoDate(startDate, new Date(Date.now() - 29 * 86_400_000)));
  const resolvedEnd = toIsoDate(parseIsoDate(endDate, new Date()));
  const previousWindow =
    compareMode === "previous_period"
      ? getPreviousWindow(resolvedStart, resolvedEnd)
      : { startDate: null, endDate: null };

  const [
    currentOverviewResult,
    previousOverviewResult,
    currentAnalyticsResult,
    previousAnalyticsResult,
    integrationsStatusResult,
    costModel,
  ] =
    await Promise.all([
      fetchInternalJson<OverviewData>(request, "/api/overview", {
        businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
      }),
      compareMode === "previous_period"
        ? fetchInternalJson<OverviewData>(request, "/api/overview", {
            businessId,
            startDate: previousWindow.startDate,
            endDate: previousWindow.endDate,
          })
        : Promise.resolve({ ok: false as const, status: 204, payload: null }),
      fetchInternalJson<AnalyticsOverviewResponse>(request, "/api/analytics/overview", {
        businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
      }),
      compareMode === "previous_period"
        ? fetchInternalJson<AnalyticsOverviewResponse>(request, "/api/analytics/overview", {
            businessId,
            startDate: previousWindow.startDate,
            endDate: previousWindow.endDate,
          })
        : Promise.resolve({ ok: false as const, status: 204, payload: null }),
      fetchInternalJson<IntegrationStatusResponse>(request, "/api/integrations/status", {
        businessId,
      }),
      getBusinessCostModel(businessId),
    ]);

  if (!currentOverviewResult.ok) {
    return NextResponse.json(
      {
        error: "overview_summary_upstream_failed",
        message: "Unable to load overview summary.",
        details: currentOverviewResult.payload,
      },
      { status: currentOverviewResult.status >= 400 ? currentOverviewResult.status : 500 }
    );
  }

  const currentOverview = currentOverviewResult.data;
  const previousOverview = previousOverviewResult.ok ? previousOverviewResult.data : null;
  const currentAnalytics = currentAnalyticsResult.ok ? currentAnalyticsResult.data : null;
  const previousAnalytics = previousAnalyticsResult.ok ? previousAnalyticsResult.data : null;
  const integrationsStatus = integrationsStatusResult.ok ? integrationsStatusResult.data : null;
  const analyticsConnected = Boolean(currentAnalytics?.kpis);
  const shopifyConnected = Boolean(integrationsStatus?.shopify);

  const revenueSource = currentOverview.kpiSources?.revenue;
  const purchasesSource = currentOverview.kpiSources?.purchases;
  const aovSource = currentOverview.kpiSources?.aov;
  const roasSource = currentOverview.kpiSources?.roas;
  const spendSeries = currentOverview.trends["30d"]?.map((point) => point.spend) ?? [];
  const revenueSeries = currentOverview.trends["30d"]?.map((point) => point.revenue) ?? [];
  const purchaseSeries = currentOverview.trends["30d"]?.map((point) => point.purchases) ?? [];

  const conversionRateCurrent = currentAnalytics?.kpis?.purchaseCvr ?? null;
  const conversionRatePrevious = previousAnalytics?.kpis?.purchaseCvr ?? null;
  const sessionsCurrent = currentAnalytics?.kpis?.sessions ?? null;
  const sessionsPrevious = previousAnalytics?.kpis?.sessions ?? null;
  const engagementRateCurrent = currentAnalytics?.kpis?.engagementRate ?? null;
  const engagementRatePrevious = previousAnalytics?.kpis?.engagementRate ?? null;
  const avgSessionDurationCurrent = currentAnalytics?.kpis?.avgSessionDuration ?? null;
  const avgSessionDurationPrevious = previousAnalytics?.kpis?.avgSessionDuration ?? null;
  const [currentGa4Ltv, previousGa4Ltv] = await Promise.all([
    analyticsConnected
      ? getGa4LtvSnapshot({
          businessId,
          startDate: resolvedStart,
          endDate: resolvedEnd,
          spend: currentOverview.kpis.spend ?? 0,
        })
      : Promise.resolve(null),
    analyticsConnected && previousWindow.startDate && previousWindow.endDate
      ? getGa4LtvSnapshot({
          businessId,
          startDate: previousWindow.startDate,
          endDate: previousWindow.endDate,
          spend: previousOverview?.kpis.spend ?? 0,
        })
      : Promise.resolve(null),
  ]);

  const pins: OverviewMetricCardData[] = [
    buildMetricCard({
      id: "pins-revenue",
      title: "Total Revenue",
      subtitle: "Primary ecommerce outcome",
      value: currentOverview.kpis.revenue ?? null,
      previousValue: previousOverview?.kpis.revenue ?? null,
      unit: "currency",
      sourceKey: revenueSource?.source ?? "unavailable",
      sourceLabel: revenueSource?.label ?? "Unavailable",
      helperText:
        revenueSource?.source === "unavailable" ? "Connect Shopify or GA4" : undefined,
      sparklineData: revenueSeries,
      compareMode,
      icon: "badge-dollar-sign",
    }),
    buildMetricCard({
      id: "pins-spend",
      title: "Total Spend",
      subtitle: "Paid media investment",
      value: currentOverview.kpis.spend ?? null,
      previousValue: previousOverview?.kpis.spend ?? null,
      unit: "currency",
      sourceKey: "ad_platforms",
      sourceLabel: "Ad platforms",
      sparklineData: spendSeries,
      compareMode,
      icon: "wallet",
    }),
    buildMetricCard({
      id: "pins-mer",
      title: "MER",
      subtitle: "Revenue / spend",
      value: currentOverview.kpis.spend > 0 ? currentOverview.kpis.revenue / currentOverview.kpis.spend : null,
      previousValue:
        previousOverview && previousOverview.kpis.spend > 0
          ? previousOverview.kpis.revenue / previousOverview.kpis.spend
          : null,
      unit: "ratio",
      sourceKey: revenueSource?.source ?? "unavailable",
      sourceLabel:
        revenueSource?.source === "ga4_fallback" ? "GA4 fallback + ad platforms" : "Shopify + ad platforms",
      helperText:
        revenueSource?.source === "unavailable" ? "Connect Shopify or GA4" : undefined,
      compareMode,
      icon: "line-chart",
    }),
    buildMetricCard({
      id: "pins-blended-roas",
      title: "Blended ROAS",
      subtitle: "Revenue relative to ad spend",
      value: currentOverview.kpis.roas ?? null,
      previousValue: previousOverview?.kpis.roas ?? null,
      unit: "ratio",
      sourceKey: roasSource?.source ?? "unavailable",
      sourceLabel: roasSource?.label ?? "Unavailable",
      helperText:
        roasSource?.source === "unavailable" ? "Connect Shopify or GA4" : undefined,
      compareMode,
      icon: "chart-line",
    }),
    buildMetricCard({
      id: "pins-conversion-rate",
      title: "Conversion Rate",
      subtitle: "Store purchase conversion",
      value: conversionRateCurrent !== null ? conversionRateCurrent * 100 : null,
      previousValue: conversionRatePrevious !== null ? conversionRatePrevious * 100 : null,
      unit: "percent",
      sourceKey: analyticsConnected ? "ga4" : "unavailable",
      sourceLabel: analyticsConnected ? "GA4" : "Unavailable",
      helperText: analyticsConnected ? undefined : "Connect GA4",
      compareMode,
      icon: "target",
    }),
    buildMetricCard({
      id: "pins-orders",
      title: "Orders",
      subtitle: "Completed purchases",
      value: currentOverview.kpis.purchases ?? null,
      previousValue: previousOverview?.kpis.purchases ?? null,
      unit: "count",
      sourceKey: purchasesSource?.source ?? "unavailable",
      sourceLabel: purchasesSource?.label ?? "Unavailable",
      helperText:
        purchasesSource?.source === "unavailable" ? "Connect Shopify or GA4" : undefined,
      sparklineData: purchaseSeries,
      compareMode,
      icon: "shopping-cart",
    }),
  ];

  const storeMetrics: OverviewMetricCardData[] = [
    pins[0],
    pins[5],
    buildUnavailableMetric({
      id: "store-refunds",
      title: "Refunds",
      helperText: "Shopify refunds pipeline not available yet",
      unit: "currency",
    }),
    buildMetricCard({
      id: "store-aov",
      title: "AOV",
      subtitle: "Average order value",
      value: currentOverview.kpis.aov ?? null,
      previousValue: previousOverview?.kpis.aov ?? null,
      unit: "currency",
      sourceKey: aovSource?.source ?? "unavailable",
      sourceLabel: aovSource?.label ?? "Unavailable",
      helperText: aovSource?.source === "unavailable" ? "Connect Shopify or GA4" : undefined,
      compareMode,
      icon: "receipt",
    }),
    buildUnavailableMetric({
      id: "store-net-revenue",
      title: "Net Revenue",
      helperText: "Requires refunds and fee modeling",
      unit: "currency",
    }),
    buildMetricCard({
      id: "store-conversion-rate",
      title: "Conversion Rate",
      value: conversionRateCurrent !== null ? conversionRateCurrent * 100 : null,
      previousValue: conversionRatePrevious !== null ? conversionRatePrevious * 100 : null,
      unit: "percent",
      sourceKey: analyticsConnected ? "ga4" : "unavailable",
      sourceLabel: analyticsConnected ? "GA4" : "Unavailable",
      helperText: analyticsConnected ? undefined : "Connect GA4",
      compareMode,
      icon: "percent",
    }),
    buildUnavailableMetric({
      id: "store-new-customers",
      title: "New Customers",
      helperText: "Requires customer identity model",
      unit: "count",
    }),
    buildUnavailableMetric({
      id: "store-returning-customers",
      title: "Returning Customers",
      helperText: "Requires customer identity model",
      unit: "count",
    }),
    buildUnavailableMetric({
      id: "store-units-sold",
      title: "Units Sold",
      helperText: "Requires order line-item sync",
      unit: "count",
    }),
  ];

  const ltvSourceLabel = "GA4 fallback";
  const ltvEstimatedHelper = shopifyConnected
    ? "Estimated from GA4 because Shopify lifecycle data is unavailable for this view"
    : "Estimated from GA4";
  const ltvUnavailableHelper = "Connect Shopify or enrich GA4 lifecycle data";
  const ltv: OverviewMetricCardData[] = [
    currentGa4Ltv?.averageCustomerLtv !== null && currentGa4Ltv?.averageCustomerLtv !== undefined
      ? buildMetricCard({
          id: "ltv-average",
          title: "Average Customer LTV",
          helperText: ltvEstimatedHelper,
          value: currentGa4Ltv.averageCustomerLtv,
          previousValue: previousGa4Ltv?.averageCustomerLtv ?? null,
          unit: "currency",
          sourceKey: "ga4_fallback",
          sourceLabel: ltvSourceLabel,
          compareMode,
        })
      : buildUnavailableMetric({
          id: "ltv-average",
          title: "Average Customer LTV",
          helperText: ltvUnavailableHelper,
          unit: "currency",
        }),
    currentGa4Ltv?.ltvToCac !== null && currentGa4Ltv?.ltvToCac !== undefined
      ? buildMetricCard({
          id: "ltv-cac",
          title: "LTV / CAC",
          helperText: ltvEstimatedHelper,
          value: currentGa4Ltv.ltvToCac,
          previousValue: previousGa4Ltv?.ltvToCac ?? null,
          unit: "ratio",
          sourceKey: "ga4_fallback",
          sourceLabel: ltvSourceLabel,
          compareMode,
        })
      : buildUnavailableMetric({
          id: "ltv-cac",
          title: "LTV / CAC",
          helperText: ltvUnavailableHelper,
          unit: "ratio",
        }),
    currentGa4Ltv?.repeatPurchaseRate !== null && currentGa4Ltv?.repeatPurchaseRate !== undefined
      ? buildMetricCard({
          id: "ltv-repeat-rate",
          title: "Repeat Purchase Rate",
          helperText: ltvEstimatedHelper,
          value: currentGa4Ltv.repeatPurchaseRate,
          previousValue: previousGa4Ltv?.repeatPurchaseRate ?? null,
          unit: "percent",
          sourceKey: "ga4_fallback",
          sourceLabel: ltvSourceLabel,
          compareMode,
        })
      : buildUnavailableMetric({
          id: "ltv-repeat-rate",
          title: "Repeat Purchase Rate",
          helperText: ltvUnavailableHelper,
          unit: "percent",
        }),
    buildUnavailableMetric({
      id: "ltv-lifespan",
      title: "Customer Lifespan",
      helperText: "Connect Shopify or enrich GA4 lifecycle data",
      unit: "count",
    }),
    currentGa4Ltv?.revenuePerCustomer !== null && currentGa4Ltv?.revenuePerCustomer !== undefined
      ? buildMetricCard({
          id: "ltv-revenue-per-customer",
          title: "Revenue per Customer",
          helperText: ltvEstimatedHelper,
          value: currentGa4Ltv.revenuePerCustomer,
          previousValue: previousGa4Ltv?.revenuePerCustomer ?? null,
          unit: "currency",
          sourceKey: "ga4_fallback",
          sourceLabel: ltvSourceLabel,
          compareMode,
        })
      : buildUnavailableMetric({
          id: "ltv-revenue-per-customer",
          title: "Revenue per Customer",
          helperText: ltvUnavailableHelper,
          unit: "currency",
        }),
  ];

  const costModelData = toCostModelData(costModel);
  const cogsValue =
    costModelData && currentOverview.kpis.revenue
      ? Number((currentOverview.kpis.revenue * costModelData.cogsPercent).toFixed(2))
      : null;
  const shippingValue =
    costModelData && currentOverview.kpis.revenue
      ? Number((currentOverview.kpis.revenue * costModelData.shippingPercent).toFixed(2))
      : null;
  const feeValue =
    costModelData && currentOverview.kpis.revenue
      ? Number((currentOverview.kpis.revenue * costModelData.feePercent).toFixed(2))
      : null;
  const variableCosts =
    cogsValue !== null && shippingValue !== null && feeValue !== null
      ? Number(
          (
            currentOverview.kpis.spend +
            cogsValue +
            shippingValue +
            feeValue
          ).toFixed(2)
        )
      : null;
  const totalExpensesValue =
    variableCosts !== null && costModelData
      ? Number((variableCosts + costModelData.fixedCost).toFixed(2))
      : null;
  const netProfitValue =
    totalExpensesValue !== null
      ? Number((currentOverview.kpis.revenue - totalExpensesValue).toFixed(2))
      : null;
  const contributionMarginValue =
    variableCosts !== null && currentOverview.kpis.revenue > 0
      ? Number(
          (
            ((currentOverview.kpis.revenue - variableCosts) / currentOverview.kpis.revenue) *
            100
          ).toFixed(1)
        )
      : null;
  const costModelMissingHelper = "Set cost model";
  const expenses: OverviewMetricCardData[] = [
    buildMetricCard({
      id: "expenses-ad-spend",
      title: "Ad Spend",
      value: currentOverview.kpis.spend ?? null,
      previousValue: previousOverview?.kpis.spend ?? null,
      unit: "currency",
      sourceKey: "ad_platforms",
      sourceLabel: "Ad platforms",
      sparklineData: spendSeries,
      compareMode,
      icon: "wallet",
    }),
    costModelData
      ? buildMetricCard({
          id: "expenses-cogs",
          title: "COGS",
          subtitle: `${Math.round(costModelData.cogsPercent * 100)}% of revenue`,
          value: cogsValue,
          unit: "currency",
          sourceKey: "manual_cost_model",
          sourceLabel: "Manual cost model",
          compareMode,
        })
      : buildUnavailableMetric({
          id: "expenses-cogs",
          title: "COGS",
          helperText: costModelMissingHelper,
          unit: "currency",
        }),
    costModelData
      ? buildMetricCard({
          id: "expenses-shipping",
          title: "Shipping",
          subtitle: `${Math.round(costModelData.shippingPercent * 100)}% of revenue`,
          value: shippingValue,
          unit: "currency",
          sourceKey: "manual_cost_model",
          sourceLabel: "Manual cost model",
          compareMode,
        })
      : buildUnavailableMetric({
          id: "expenses-shipping",
          title: "Shipping",
          helperText: costModelMissingHelper,
          unit: "currency",
        }),
    costModelData
      ? buildMetricCard({
          id: "expenses-fees",
          title: "Fees",
          subtitle: `${Math.round(costModelData.feePercent * 100)}% of revenue`,
          value: feeValue,
          unit: "currency",
          sourceKey: "manual_cost_model",
          sourceLabel: "Manual cost model",
          compareMode,
        })
      : buildUnavailableMetric({
          id: "expenses-fees",
          title: "Fees",
          helperText: costModelMissingHelper,
          unit: "currency",
        }),
    costModelData
      ? buildMetricCard({
          id: "expenses-total-tracked",
          title: "Total Expenses",
          subtitle: "Ad spend + modeled costs",
          value: totalExpensesValue,
          unit: "currency",
          sourceKey: "manual_cost_model",
          sourceLabel: "Ad platforms + manual cost model",
          compareMode,
          icon: "badge-dollar-sign",
        })
      : buildMetricCard({
      id: "expenses-total-tracked",
      title: "Total Expenses",
      subtitle: "Tracked expenses",
      value: currentOverview.kpis.spend ?? null,
      previousValue: previousOverview?.kpis.spend ?? null,
      unit: "currency",
      sourceKey: "ad_platforms",
      sourceLabel: "Ad spend only",
      helperText: "Set cost model to include COGS, shipping, fees, and fixed cost",
      compareMode,
      icon: "badge-dollar-sign",
    }),
    costModelData
      ? buildMetricCard({
          id: "expenses-net-profit",
          title: "Net Profit",
          value: netProfitValue,
          unit: "currency",
          sourceKey: "manual_cost_model",
          sourceLabel: "Revenue + ad spend + manual cost model",
          compareMode,
        })
      : buildUnavailableMetric({
          id: "expenses-net-profit",
          title: "Net Profit",
          helperText: costModelMissingHelper,
          unit: "currency",
        }),
    costModelData
      ? buildMetricCard({
          id: "expenses-contribution-margin",
          title: "Contribution Margin",
          value: contributionMarginValue,
          unit: "percent",
          sourceKey: "manual_cost_model",
          sourceLabel: "Revenue + variable costs",
          compareMode,
        })
      : buildUnavailableMetric({
          id: "expenses-contribution-margin",
          title: "Contribution Margin",
          helperText: costModelMissingHelper,
          unit: "percent",
        }),
    buildMetricCard({
      id: "expenses-mer",
      title: "MER",
      value: currentOverview.kpis.spend > 0 ? currentOverview.kpis.revenue / currentOverview.kpis.spend : null,
      previousValue:
        previousOverview && previousOverview.kpis.spend > 0
          ? previousOverview.kpis.revenue / previousOverview.kpis.spend
          : null,
      unit: "ratio",
      sourceKey: revenueSource?.source ?? "unavailable",
      sourceLabel:
        revenueSource?.source === "ga4_fallback" ? "GA4 fallback + ad platforms" : "Shopify + ad platforms",
      helperText:
        revenueSource?.source === "unavailable" ? "Connect Shopify or GA4" : undefined,
      compareMode,
      icon: "chart-line",
    }),
  ];

  const customMetrics: OverviewMetricCardData[] = [
    buildMetricCard({
      id: "custom-mer",
      title: "MER",
      value: currentOverview.kpis.spend > 0 ? currentOverview.kpis.revenue / currentOverview.kpis.spend : null,
      previousValue:
        previousOverview && previousOverview.kpis.spend > 0
          ? previousOverview.kpis.revenue / previousOverview.kpis.spend
          : null,
      unit: "ratio",
      sourceKey: revenueSource?.source ?? "unavailable",
      sourceLabel: "Derived",
      helperText:
        revenueSource?.source === "unavailable" ? "Connect Shopify or GA4" : undefined,
      compareMode,
    }),
    buildUnavailableMetric({
      id: "custom-profit-margin",
      title: "Profit Margin",
      helperText: "Requires expense coverage beyond ad spend",
      unit: "percent",
    }),
    buildMetricCard({
      id: "custom-blended-cpa",
      title: "Blended CPA",
      value: currentOverview.kpis.cpa ?? null,
      previousValue: previousOverview?.kpis.cpa ?? null,
      unit: "currency",
      sourceKey: "ad_platforms",
      sourceLabel: "Ad platforms",
      compareMode,
    }),
    buildUnavailableMetric({
      id: "custom-cac",
      title: "Customer Acquisition Cost",
      helperText: "Requires customer acquisition model",
      unit: "currency",
    }),
  ];

  const webAnalytics: OverviewMetricCardData[] = [
    buildUnavailableMetric({
      id: "web-users",
      title: "Users",
      helperText: "Users metric not included in current GA4 overview payload",
      unit: "count",
    }),
    buildMetricCard({
      id: "web-sessions",
      title: "Sessions",
      value: sessionsCurrent,
      previousValue: sessionsPrevious,
      unit: "count",
      sourceKey: analyticsConnected ? "ga4" : "unavailable",
      sourceLabel: analyticsConnected ? "GA4" : "Unavailable",
      helperText: analyticsConnected ? undefined : "Connect GA4",
      compareMode,
      icon: "activity",
    }),
    buildUnavailableMetric({
      id: "web-bounce-rate",
      title: "Bounce Rate",
      helperText: "Bounce rate is not included in current GA4 overview payload",
      unit: "percent",
    }),
    buildMetricCard({
      id: "web-session-duration",
      title: "Session Duration",
      value: avgSessionDurationCurrent,
      previousValue: avgSessionDurationPrevious,
      unit: "duration_seconds",
      sourceKey: analyticsConnected ? "ga4" : "unavailable",
      sourceLabel: analyticsConnected ? "GA4" : "Unavailable",
      helperText: analyticsConnected ? undefined : "Connect GA4",
      compareMode,
      icon: "clock-3",
    }),
    buildUnavailableMetric({
      id: "web-pages-per-session",
      title: "Pages / Session",
      helperText: "Pages/session is not included in current GA4 overview payload",
      unit: "ratio",
    }),
    buildUnavailableMetric({
      id: "web-add-to-cart",
      title: "Add To Cart",
      helperText: "Requires GA4 ecommerce event summary",
      unit: "count",
    }),
    buildUnavailableMetric({
      id: "web-checkout-started",
      title: "Checkout Started",
      helperText: "Requires GA4 ecommerce event summary",
      unit: "count",
    }),
    buildMetricCard({
      id: "web-engagement-rate",
      title: "Engagement Rate",
      value: engagementRateCurrent !== null ? engagementRateCurrent * 100 : null,
      previousValue: engagementRatePrevious !== null ? engagementRatePrevious * 100 : null,
      unit: "percent",
      sourceKey: analyticsConnected ? "ga4" : "unavailable",
      sourceLabel: analyticsConnected ? "GA4" : "Unavailable",
      helperText: analyticsConnected ? undefined : "Connect GA4",
      compareMode,
      icon: "gauge",
    }),
  ];

  const summary: OverviewSummaryData = {
    businessId,
    dateRange: {
      startDate: resolvedStart,
      endDate: resolvedEnd,
    },
    comparison: {
      mode: compareMode,
      startDate: previousWindow.startDate,
      endDate: previousWindow.endDate,
    },
    pins,
    storeMetrics,
    attribution: buildAttributionRows(currentOverview, integrationsStatus),
    ltv,
    platforms: buildPlatformSections(currentOverview, previousOverview, compareMode),
    expenses,
    costModel: {
      configured: Boolean(costModelData),
      values: costModelData,
    },
    customMetrics,
    webAnalytics,
    insights: mapInsights(currentOverview, analyticsConnected),
  };

  return NextResponse.json({
    summary,
  });
}
