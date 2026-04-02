import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getBusinessCostModel } from "@/lib/business-cost-model";
import { getBusinessTimezone } from "@/lib/account-store";
import {
  GA4AuthError,
  getAnalyticsOverviewData,
} from "@/lib/analytics-overview";
import {
  getIntegrationStatusByBusiness,
  type IntegrationStatusResponse,
} from "@/lib/integration-status";
import {
  getOverviewData,
  getShopifyOverviewServingData,
  type OverviewResponse as OverviewAggregateData,
} from "@/lib/overview-service";
import {
  buildAttributionRows,
  buildMetricCard,
  buildPlatformSections,
  buildUnavailableMetric,
  type CompareMode,
  getGa4DailyTrendSnapshot,
  getGa4LtvSnapshot,
  getPreviousWindow,
  mapInsights,
  parseIsoDate,
  roundSparklineValue,
  toCostModelData,
  toIsoDate,
  toPercentSparklineSeries,
  toRatioSparklineSeries,
  toSparklineSeries,
} from "@/lib/overview-summary-support";
import { resolveRequestLanguage } from "@/lib/request-language";
import type {
  OverviewMetricCardData,
  OverviewSummaryData,
} from "@/src/types/models";

function getTodayIsoForTimeZone(timeZone?: string | null): string {
  if (!timeZone) return new Date().toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function shiftIsoDate(date: string, dayDelta: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + dayDelta);
  return value.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const language = await resolveRequestLanguage(request);
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

  const businessTimeZone = await getBusinessTimezone(businessId);
  const fallbackEndDate = getTodayIsoForTimeZone(businessTimeZone);
  const fallbackStartDate = shiftIsoDate(fallbackEndDate, -29);
  const resolvedStart = startDate
    ? toIsoDate(parseIsoDate(startDate, new Date(`${fallbackStartDate}T00:00:00.000Z`)))
    : fallbackStartDate;
  const resolvedEnd = endDate
    ? toIsoDate(parseIsoDate(endDate, new Date(`${fallbackEndDate}T00:00:00.000Z`)))
    : fallbackEndDate;
  const previousWindow =
    compareMode === "previous_period"
      ? getPreviousWindow(resolvedStart, resolvedEnd)
      : { startDate: null, endDate: null };

  const analyticsAccess = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  const canReadAnalytics = !("error" in analyticsAccess);

  const [
    currentOverviewResult,
    previousOverviewResult,
    currentAnalyticsResult,
    previousAnalyticsResult,
    currentShopifyResult,
    previousShopifyResult,
    integrationsStatusResult,
    costModelResult,
  ] = await Promise.allSettled([
    getOverviewData({
      businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
      includeTrends: false,
    }),
    compareMode === "previous_period" && previousWindow.startDate && previousWindow.endDate
      ? getOverviewData({
          businessId,
          startDate: previousWindow.startDate,
          endDate: previousWindow.endDate,
          includeTrends: false,
        })
      : Promise.resolve(null),
    canReadAnalytics
      ? getAnalyticsOverviewData({
          businessId,
          startDate: resolvedStart,
          endDate: resolvedEnd,
        })
      : Promise.resolve(null),
    canReadAnalytics && previousWindow.startDate && previousWindow.endDate
      ? getAnalyticsOverviewData({
          businessId,
          startDate: previousWindow.startDate,
          endDate: previousWindow.endDate,
        })
      : Promise.resolve(null),
    getShopifyOverviewServingData({
      businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
    }),
    compareMode === "previous_period" && previousWindow.startDate && previousWindow.endDate
      ? getShopifyOverviewServingData({
          businessId,
          startDate: previousWindow.startDate,
          endDate: previousWindow.endDate,
        })
      : Promise.resolve(null),
    getIntegrationStatusByBusiness(businessId),
    getBusinessCostModel(businessId),
  ]);

  if (currentOverviewResult.status === "rejected") {
    return NextResponse.json(
      {
        error: "overview_summary_upstream_failed",
        message: "Unable to load overview summary.",
        details:
          currentOverviewResult.reason instanceof Error
            ? currentOverviewResult.reason.message
            : String(currentOverviewResult.reason),
      },
      { status: 500 }
    );
  }

  const currentOverview = currentOverviewResult.value;
  const previousOverview =
    previousOverviewResult.status === "fulfilled" ? previousOverviewResult.value : null;
  const currentAnalytics =
    currentAnalyticsResult.status === "fulfilled"
      ? currentAnalyticsResult.value
      : currentAnalyticsResult.reason instanceof GA4AuthError
        ? null
        : null;
  const previousAnalytics =
    previousAnalyticsResult.status === "fulfilled"
      ? previousAnalyticsResult.value
      : previousAnalyticsResult.reason instanceof GA4AuthError
        ? null
        : null;
  const currentShopify =
    currentShopifyResult.status === "fulfilled" ? currentShopifyResult.value?.aggregate ?? null : null;
  const previousShopify =
    previousShopifyResult.status === "fulfilled" ? previousShopifyResult.value?.aggregate ?? null : null;
  const integrationsStatus =
    integrationsStatusResult.status === "fulfilled"
      ? integrationsStatusResult.value
      : null;
  const costModel =
    costModelResult.status === "fulfilled" ? costModelResult.value : null;
  const analyticsConnected = Boolean(currentAnalytics?.kpis);
  const shopifyConnected = Boolean(integrationsStatus?.shopify);
  const tr = (english: string, turkish: string) => (language === "tr" ? turkish : english);

  // GA4 daily trends are deferred to the /api/overview-sparklines endpoint.
  // The summary endpoint only needs aggregate KPI values (handled above).
  const ga4DailyTrends: Awaited<ReturnType<typeof getGa4DailyTrendSnapshot>> = [];

  const revenueSource = currentOverview.kpiSources?.revenue;
  const purchasesSource = currentOverview.kpiSources?.purchases;
  const aovSource = currentOverview.kpiSources?.aov;
  const roasSource = currentOverview.kpiSources?.roas;
  const revenueCompositeSourceLabel =
    revenueSource?.source === "shopify"
      ? tr("Shopify + ad platforms", "Shopify + reklam platformlari")
      : revenueSource?.source === "ga4_fallback"
        ? tr("GA4 + ad platforms", "GA4 + reklam platformlari")
        : tr("Revenue + ad platforms", "Gelir + reklam platformlari");
  const spendSeries = toSparklineSeries(currentOverview.trends.custom, (point) => point.spend);
  const revenueSeries = toSparklineSeries(currentOverview.trends.custom, (point) => point.revenue);
  const purchaseSeries = toSparklineSeries(currentOverview.trends.custom, (point) => point.purchases);
  const merSeries = toRatioSparklineSeries(
    currentOverview.trends.custom,
    (point) => point.revenue,
    (point) => point.spend
  );
  const blendedCpaSeries = toRatioSparklineSeries(
    currentOverview.trends.custom,
    (point) => point.spend,
    (point) => point.purchases
  );
  const ga4RevenueSeries = toSparklineSeries(ga4DailyTrends, (point) => point.revenue);
  const ga4PurchaseSeries = toSparklineSeries(ga4DailyTrends, (point) => point.purchases);
  const ga4AovSeries = toRatioSparklineSeries(
    ga4DailyTrends,
    (point) => point.revenue,
    (point) => point.purchases
  );
  const shopifyConversionRateSeries = toSparklineSeries(
    currentShopify?.dailyTrends ?? [],
    (point) => point.conversionRate ?? 0
  );
  const shopifyNewCustomersSeries = toSparklineSeries(
    currentShopify?.dailyTrends ?? [],
    (point) => point.newCustomers ?? 0
  );
  const shopifyReturningCustomersSeries = toSparklineSeries(
    currentShopify?.dailyTrends ?? [],
    (point) => point.returningCustomers ?? 0
  );
  const ga4ConversionRateSeries = toPercentSparklineSeries(
    ga4DailyTrends,
    (point) => point.purchases,
    (point) => point.sessions
  );
  const ga4NewCustomersSeries = toSparklineSeries(
    ga4DailyTrends,
    (point) => point.firstTimePurchasers
  );
  const ga4ReturningCustomersSeries = toSparklineSeries(
    ga4DailyTrends,
    (point) => Math.max(point.totalPurchasers - point.firstTimePurchasers, 0)
  );
  const ga4SessionsSeries = toSparklineSeries(ga4DailyTrends, (point) => point.sessions);
  const ga4EngagementRateSeries = toSparklineSeries(
    ga4DailyTrends,
    (point) => point.engagementRate * 100
  );
  const ga4AvgSessionDurationSeries = toSparklineSeries(
    ga4DailyTrends,
    (point) => point.avgSessionDuration
  );
  const ga4RevenuePerCustomerSeries = toRatioSparklineSeries(
    ga4DailyTrends,
    (point) => point.revenue,
    (point) => point.totalPurchasers
  );
  const ga4RepeatPurchaseRateSeries = toPercentSparklineSeries(
    ga4DailyTrends,
    (point) => Math.max(point.totalPurchasers - point.firstTimePurchasers, 0),
    (point) => point.totalPurchasers
  );
  const sessionsCurrent = currentAnalytics?.kpis?.sessions ?? null;
  const sessionsPrevious = previousAnalytics?.kpis?.sessions ?? null;
  const engagementRateCurrent = currentAnalytics?.kpis?.engagementRate ?? null;
  const engagementRatePrevious = previousAnalytics?.kpis?.engagementRate ?? null;
  const avgSessionDurationCurrent = currentAnalytics?.kpis?.avgSessionDuration ?? null;
  const avgSessionDurationPrevious = previousAnalytics?.kpis?.avgSessionDuration ?? null;
  const averageOrderValueCurrent = currentAnalytics?.kpis?.averageOrderValue ?? null;
  const averageOrderValuePrevious = previousAnalytics?.kpis?.averageOrderValue ?? null;
  const totalPurchasersCurrent = currentAnalytics?.kpis?.totalPurchasers ?? null;
  const totalPurchasersPrevious = previousAnalytics?.kpis?.totalPurchasers ?? null;
  const conversionRateCurrent =
    currentShopify?.conversionRate !== null && currentShopify?.conversionRate !== undefined
      ? currentShopify.conversionRate / 100
      : currentAnalytics?.kpis?.purchaseCvr ?? null;
  const conversionRatePrevious =
    previousShopify?.conversionRate !== null && previousShopify?.conversionRate !== undefined
      ? previousShopify.conversionRate / 100
      : previousAnalytics?.kpis?.purchaseCvr ?? null;
  const firstTimePurchasersCurrent =
    currentShopify?.newCustomers !== null && currentShopify?.newCustomers !== undefined
      ? currentShopify.newCustomers
      : currentAnalytics?.kpis?.firstTimePurchasers ?? null;
  const firstTimePurchasersPrevious =
    previousShopify?.newCustomers !== null && previousShopify?.newCustomers !== undefined
      ? previousShopify.newCustomers
      : previousAnalytics?.kpis?.firstTimePurchasers ?? null;
  const returningPurchasersCurrent =
    currentShopify?.returningCustomers !== null &&
    currentShopify?.returningCustomers !== undefined
      ? currentShopify.returningCustomers
      : totalPurchasersCurrent !== null && firstTimePurchasersCurrent !== null
        ? Math.max(totalPurchasersCurrent - firstTimePurchasersCurrent, 0)
        : currentAnalytics?.newVsReturning?.returning?.purchases ?? null;
  const returningPurchasersPrevious =
    previousShopify?.returningCustomers !== null &&
    previousShopify?.returningCustomers !== undefined
      ? previousShopify.returningCustomers
      : totalPurchasersPrevious !== null && firstTimePurchasersPrevious !== null
        ? Math.max(totalPurchasersPrevious - firstTimePurchasersPrevious, 0)
        : previousAnalytics?.newVsReturning?.returning?.purchases ?? null;
  const storeConversionSource =
    currentShopify?.conversionRate !== null && currentShopify?.conversionRate !== undefined
      ? { key: "shopify", label: "Shopify" }
      : analyticsConnected
        ? { key: "ga4", label: "GA4" }
        : { key: "unavailable", label: tr("Unavailable", "Kullanılamıyor") };
  const storeNewCustomersSource =
    currentShopify?.newCustomers !== null && currentShopify?.newCustomers !== undefined
      ? { key: "shopify", label: "Shopify" }
      : analyticsConnected
        ? { key: "ga4", label: "GA4" }
        : { key: "unavailable", label: tr("Unavailable", "Kullanılamıyor") };
  const storeReturningCustomersSource =
    currentShopify?.returningCustomers !== null &&
    currentShopify?.returningCustomers !== undefined
      ? { key: "shopify", label: "Shopify" }
      : analyticsConnected
        ? { key: "ga4", label: "GA4" }
        : { key: "unavailable", label: tr("Unavailable", "Kullanılamıyor") };
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
      title: tr("Total Revenue", "Toplam Gelir"),
      subtitle: tr("Primary ecommerce outcome", "Ana ecommerce sonucu"),
      value: currentOverview.kpis.revenue ?? null,
      previousValue: previousOverview?.kpis.revenue ?? null,
      unit: "currency",
      sourceKey: revenueSource?.source ?? "unavailable",
      sourceLabel: revenueSource?.label ?? tr("Unavailable", "Kullanılamıyor"),
      helperText:
        revenueSource?.source === "unavailable" ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın") : undefined,
      sparklineData: revenueSeries,
      compareMode,
      icon: "badge-dollar-sign",
    }),
    buildMetricCard({
      id: "pins-spend",
      title: tr("Total Spend", "Toplam Harcama"),
      subtitle: tr("Paid media investment", "Paid media harcamasi"),
      value: currentOverview.kpis.spend ?? null,
      previousValue: previousOverview?.kpis.spend ?? null,
      unit: "currency",
      sourceKey: "ad_platforms",
      sourceLabel: tr("Ad platforms", "Reklam platformlari"),
      sparklineData: spendSeries,
      compareMode,
      icon: "wallet",
    }),
    buildMetricCard({
      id: "pins-mer",
      title: "MER",
      subtitle: tr("Revenue / spend", "Gelir / harcama"),
      value: currentOverview.kpis.spend > 0 ? currentOverview.kpis.revenue / currentOverview.kpis.spend : null,
      previousValue:
        previousOverview && previousOverview.kpis.spend > 0
          ? previousOverview.kpis.revenue / previousOverview.kpis.spend
          : null,
      unit: "ratio",
      sourceKey: revenueSource?.source ?? "unavailable",
      sourceLabel: revenueCompositeSourceLabel,
      helperText:
        revenueSource?.source === "unavailable" ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın") : undefined,
      sparklineData: merSeries,
      compareMode,
      icon: "line-chart",
    }),
    buildMetricCard({
      id: "pins-blended-roas",
      title: "Blended ROAS",
      subtitle: tr("Revenue relative to ad spend", "Gelirin reklam harcamasina göre durumu"),
      value: currentOverview.kpis.roas ?? null,
      previousValue: previousOverview?.kpis.roas ?? null,
      unit: "ratio",
      sourceKey: roasSource?.source ?? "unavailable",
      sourceLabel: roasSource?.label ?? tr("Unavailable", "Kullanılamıyor"),
      helperText:
        roasSource?.source === "unavailable" ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın") : undefined,
      sparklineData: merSeries,
      compareMode,
      icon: "chart-line",
    }),
    buildMetricCard({
      id: "pins-conversion-rate",
      title: tr("Conversion Rate", "Conversion Rate"),
      subtitle: tr("Store purchase conversion", "Magaza satın alma dönüşum orani"),
      value: conversionRateCurrent !== null ? conversionRateCurrent * 100 : null,
      previousValue: conversionRatePrevious !== null ? conversionRatePrevious * 100 : null,
      unit: "percent",
      sourceKey: storeConversionSource.key,
      sourceLabel: storeConversionSource.label,
      helperText:
        storeConversionSource.key === "unavailable"
          ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın")
          : undefined,
      sparklineData:
        storeConversionSource.key === "shopify"
          ? shopifyConversionRateSeries
          : ga4ConversionRateSeries,
      compareMode,
      icon: "target",
    }),
    buildMetricCard({
      id: "pins-orders",
      title: tr("Orders", "Siparisler"),
      subtitle: tr("Completed purchases", "Tamamlanan satın almalar"),
      value: currentOverview.kpis.purchases ?? null,
      previousValue: previousOverview?.kpis.purchases ?? null,
      unit: "count",
      sourceKey: purchasesSource?.source ?? "unavailable",
      sourceLabel: purchasesSource?.label ?? tr("Unavailable", "Kullanılamıyor"),
      helperText:
        purchasesSource?.source === "unavailable" ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın") : undefined,
      sparklineData: purchaseSeries,
      compareMode,
      icon: "shopping-cart",
    }),
  ];

  const storeMetrics: OverviewMetricCardData[] = [
    pins[0],
    pins[5],
    buildMetricCard({
      id: "store-aov",
      title: "AOV",
      subtitle: tr("Average order value", "Ortalama siparis degeri"),
      value: currentOverview.kpis.aov ?? averageOrderValueCurrent ?? null,
      previousValue: previousOverview?.kpis.aov ?? averageOrderValuePrevious ?? null,
      unit: "currency",
      sourceKey: aovSource?.source ?? "unavailable",
      sourceLabel: aovSource?.label ?? tr("Unavailable", "Kullanılamıyor"),
      helperText: aovSource?.source === "unavailable" ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın") : undefined,
      sparklineData:
        aovSource?.source === "shopify" || ga4AovSeries.length === 0
          ? toRatioSparklineSeries(
              currentOverview.trends.custom,
              (point) => point.revenue,
              (point) => point.purchases
            )
          : ga4AovSeries,
      compareMode,
      icon: "receipt",
    }),
    buildMetricCard({
      id: "store-conversion-rate",
      title: tr("Conversion Rate", "Conversion Rate"),
      value: conversionRateCurrent !== null ? conversionRateCurrent * 100 : null,
      previousValue: conversionRatePrevious !== null ? conversionRatePrevious * 100 : null,
      unit: "percent",
      sourceKey: storeConversionSource.key,
      sourceLabel: storeConversionSource.label,
      helperText:
        storeConversionSource.key === "unavailable"
          ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın")
          : undefined,
      sparklineData:
        storeConversionSource.key === "shopify"
          ? shopifyConversionRateSeries
          : ga4ConversionRateSeries,
      compareMode,
      icon: "percent",
    }),
    buildMetricCard({
      id: "store-new-customers",
      title: tr("New Customers", "Yeni Müşteriler"),
      value: firstTimePurchasersCurrent,
      previousValue: firstTimePurchasersPrevious,
      unit: "count",
      sourceKey: storeNewCustomersSource.key,
      sourceLabel: storeNewCustomersSource.label,
      helperText:
        storeNewCustomersSource.key === "unavailable"
          ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın")
          : undefined,
      sparklineData:
        storeNewCustomersSource.key === "shopify"
          ? shopifyNewCustomersSeries
          : ga4NewCustomersSeries,
      compareMode,
    }),
    buildMetricCard({
      id: "store-returning-customers",
      title: tr("Returning Customers", "Geri Dönen Müşteriler"),
      value: returningPurchasersCurrent,
      previousValue: returningPurchasersPrevious,
      unit: "count",
      sourceKey: storeReturningCustomersSource.key,
      sourceLabel: storeReturningCustomersSource.label,
      helperText:
        storeReturningCustomersSource.key === "unavailable"
          ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın")
          : undefined,
      sparklineData:
        storeReturningCustomersSource.key === "shopify"
          ? shopifyReturningCustomersSeries
          : ga4ReturningCustomersSeries,
      compareMode,
    }),
  ];

  const ltvSourceLabel = tr("GA4 fallback", "GA4 yedegi");
  const ltvEstimatedHelper = shopifyConnected
    ? tr("Estimated from GA4 because Shopify lifecycle data is unavailable for this view", "Bu görünümde Shopify lifecycle verisi olmadigi için GA4 verisinden tahmin edildi")
    : tr("Estimated from GA4", "GA4 üzerinden tahmin edildi");
  const ltv: OverviewMetricCardData[] = [
    currentGa4Ltv?.averageCustomerLtv !== null && currentGa4Ltv?.averageCustomerLtv !== undefined
      ? buildMetricCard({
          id: "ltv-average",
          title: tr("Average Customer LTV", "Ortalama Müşteri LTV"),
          helperText: ltvEstimatedHelper,
          value: currentGa4Ltv.averageCustomerLtv,
          previousValue: previousGa4Ltv?.averageCustomerLtv ?? null,
          unit: "currency",
          sourceKey: "ga4_fallback",
          sourceLabel: ltvSourceLabel,
          sparklineData: ga4RevenuePerCustomerSeries,
          compareMode,
        })
      : null,
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
          sparklineData: currentOverview.kpis.spend > 0
            ? toRatioSparklineSeries(
                ga4RevenuePerCustomerSeries,
                (point) => point.value,
                () => {
                  return 1;
                }
              ).map((point, index) => ({
                date: point.date,
                value:
                  blendedCpaSeries[index] && blendedCpaSeries[index].value > 0
                    ? roundSparklineValue(point.value / blendedCpaSeries[index].value)
                    : 0,
              }))
            : [],
          compareMode,
        })
      : null,
    currentGa4Ltv?.repeatPurchaseRate !== null && currentGa4Ltv?.repeatPurchaseRate !== undefined
      ? buildMetricCard({
          id: "ltv-repeat-rate",
          title: tr("Repeat Purchase Rate", "Tekrar Satin Alma Orani"),
          helperText: ltvEstimatedHelper,
          value: currentGa4Ltv.repeatPurchaseRate,
          previousValue: previousGa4Ltv?.repeatPurchaseRate ?? null,
          unit: "percent",
          sourceKey: "ga4_fallback",
          sourceLabel: ltvSourceLabel,
          sparklineData: ga4RepeatPurchaseRateSeries,
          compareMode,
        })
      : null,
    currentGa4Ltv?.revenuePerCustomer !== null && currentGa4Ltv?.revenuePerCustomer !== undefined
      ? buildMetricCard({
          id: "ltv-revenue-per-customer",
          title: tr("Revenue per Customer", "Müşteri Basina Gelir"),
          helperText: ltvEstimatedHelper,
          value: currentGa4Ltv.revenuePerCustomer,
          previousValue: previousGa4Ltv?.revenuePerCustomer ?? null,
          unit: "currency",
          sourceKey: "ga4_fallback",
          sourceLabel: ltvSourceLabel,
          sparklineData: ga4RevenuePerCustomerSeries,
          compareMode,
        })
      : null,
  ].filter((metric): metric is OverviewMetricCardData => Boolean(metric));

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
  const costModelMissingHelper = tr("Set cost model", "Maliyet modelini ayarla");
  const expenses: OverviewMetricCardData[] = [
    buildMetricCard({
      id: "expenses-ad-spend",
      title: tr("Ad Spend", "Reklam Spend'i"),
      value: currentOverview.kpis.spend ?? null,
      previousValue: previousOverview?.kpis.spend ?? null,
      unit: "currency",
      sourceKey: "ad_platforms",
      sourceLabel: tr("Ad platforms", "Reklam platformlari"),
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
          sourceLabel: tr("Manual cost model", "Manuel maliyet modeli"),
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
          sourceLabel: tr("Manual cost model", "Manuel maliyet modeli"),
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
          sourceLabel: tr("Manual cost model", "Manuel maliyet modeli"),
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
          title: tr("Total Expenses", "Toplam Giderler"),
          subtitle: tr("Ad spend + modeled costs", "Reklam spend'i + modellenmis maliyetler"),
          value: totalExpensesValue,
          unit: "currency",
          sourceKey: "manual_cost_model",
          sourceLabel: tr("Ad platforms + manual cost model", "Reklam platformlari + manuel maliyet modeli"),
          sparklineData: revenueSeries.map((point, index) => ({
            date: point.date,
            value: roundSparklineValue(
              (spendSeries[index]?.value ?? 0) +
                point.value *
                  (costModelData.cogsPercent + costModelData.shippingPercent + costModelData.feePercent) +
                costModelData.fixedCost
            ),
          })),
          compareMode,
          icon: "badge-dollar-sign",
        })
      : buildMetricCard({
      id: "expenses-total-tracked",
      title: tr("Total Expenses", "Toplam Giderler"),
      subtitle: tr("Tracked expenses", "Izlenen giderler"),
      value: currentOverview.kpis.spend ?? null,
      previousValue: previousOverview?.kpis.spend ?? null,
      unit: "currency",
      sourceKey: "ad_platforms",
      sourceLabel: tr("Ad spend only", "Yalnizca reklam spend'i"),
      helperText: tr("Set cost model to include COGS, shipping, fees, and fixed cost", "COGS, kargo, fee ve sabit giderleri dahil etmek için maliyet modeli ayarlayin"),
      sparklineData: spendSeries,
      compareMode,
      icon: "badge-dollar-sign",
    }),
    costModelData
      ? buildMetricCard({
          id: "expenses-net-profit",
          title: tr("Net Profit", "Net Kar"),
          value: netProfitValue,
          unit: "currency",
          sourceKey: "manual_cost_model",
          sourceLabel: tr("Revenue + ad spend + manual cost model", "Gelir + reklam spend'i + manuel maliyet modeli"),
          sparklineData: revenueSeries.map((point, index) => ({
            date: point.date,
            value: roundSparklineValue(
              point.value -
                ((spendSeries[index]?.value ?? 0) +
                  point.value *
                    (costModelData.cogsPercent + costModelData.shippingPercent + costModelData.feePercent) +
                  costModelData.fixedCost)
            ),
          })),
          compareMode,
        })
      : buildUnavailableMetric({
          id: "expenses-net-profit",
          title: tr("Net Profit", "Net Kar"),
          helperText: costModelMissingHelper,
          unit: "currency",
        }),
    costModelData
      ? buildMetricCard({
          id: "expenses-contribution-margin",
          title: tr("Contribution Margin", "Katki Marji"),
          value: contributionMarginValue,
          unit: "percent",
          sourceKey: "manual_cost_model",
          sourceLabel: tr("Revenue + variable costs", "Gelir + değişken maliyetler"),
          sparklineData: revenueSeries.map((point, index) => {
            const spendValue = spendSeries[index]?.value ?? 0;
            const variableCost =
              spendValue +
              point.value *
                (costModelData.cogsPercent + costModelData.shippingPercent + costModelData.feePercent);
            return {
              date: point.date,
              value: point.value > 0 ? roundSparklineValue(((point.value - variableCost) / point.value) * 100) : 0,
            };
          }),
          compareMode,
        })
      : buildUnavailableMetric({
          id: "expenses-contribution-margin",
          title: tr("Contribution Margin", "Katki Marji"),
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
        revenueSource?.source === "shopify"
          ? "Shopify + ad platforms"
          : revenueSource?.source === "ga4_fallback"
            ? "GA4 + ad platforms"
            : "Revenue + ad platforms",
      helperText:
        revenueSource?.source === "unavailable" ? "Connect Shopify or GA4" : undefined,
      sparklineData: merSeries,
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
      sourceLabel: tr("Derived", "Türetilmiş"),
      helperText:
        revenueSource?.source === "unavailable" ? tr("Connect Shopify or GA4", "Shopify veya GA4 bağlayın") : undefined,
      sparklineData: merSeries,
      compareMode,
    }),
    buildMetricCard({
      id: "custom-blended-cpa",
      title: "Blended CPA",
      value: currentOverview.kpis.cpa ?? null,
      previousValue: previousOverview?.kpis.cpa ?? null,
      unit: "currency",
      sourceKey: "ad_platforms",
      sourceLabel: tr("Ad platforms", "Reklam platformlari"),
      sparklineData: blendedCpaSeries,
      compareMode,
    }),
  ];

  const webAnalytics: OverviewMetricCardData[] = [
    buildMetricCard({
      id: "web-sessions",
      title: tr("Sessions", "Oturumlar"),
      value: sessionsCurrent,
      previousValue: sessionsPrevious,
      unit: "count",
      sourceKey: analyticsConnected ? "ga4" : "unavailable",
      sourceLabel: analyticsConnected ? "GA4" : tr("Unavailable", "Kullanılamıyor"),
      helperText: analyticsConnected ? undefined : tr("Connect GA4", "GA4 bağlayın"),
      sparklineData: ga4SessionsSeries,
      compareMode,
      icon: "activity",
    }),
    buildMetricCard({
      id: "web-session-duration",
      title: tr("Session Duration", "Oturum Suresi"),
      value: avgSessionDurationCurrent,
      previousValue: avgSessionDurationPrevious,
      unit: "duration_seconds",
      sourceKey: analyticsConnected ? "ga4" : "unavailable",
      sourceLabel: analyticsConnected ? "GA4" : tr("Unavailable", "Kullanılamıyor"),
      helperText: analyticsConnected ? undefined : tr("Connect GA4", "GA4 bağlayın"),
      sparklineData: ga4AvgSessionDurationSeries,
      compareMode,
      icon: "clock-3",
    }),
    buildMetricCard({
      id: "web-engagement-rate",
      title: tr("Engagement Rate", "Etkilesim Orani"),
      value: engagementRateCurrent !== null ? engagementRateCurrent * 100 : null,
      previousValue: engagementRatePrevious !== null ? engagementRatePrevious * 100 : null,
      unit: "percent",
      sourceKey: analyticsConnected ? "ga4" : "unavailable",
      sourceLabel: analyticsConnected ? "GA4" : tr("Unavailable", "Kullanılamıyor"),
      helperText: analyticsConnected ? undefined : tr("Connect GA4", "GA4 bağlayın"),
      sparklineData: ga4EngagementRateSeries,
      compareMode,
      icon: "gauge",
    }),
  ];
  const platforms = buildPlatformSections(currentOverview, previousOverview, compareMode);

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
    platforms,
    expenses,
    costModel: {
      configured: Boolean(costModelData),
      values: costModelData,
    },
    customMetrics,
    webAnalytics,
    insights: mapInsights(currentOverview, analyticsConnected),
    shopifyServing: currentOverview.shopifyServing ?? null,
  };

  return NextResponse.json({
    summary,
  });
}
