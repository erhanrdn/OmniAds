"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SummaryMetricCard } from "@/components/overview/SummaryMetricCard";
import { SummarySection } from "@/components/overview/SummarySection";
import { SummaryAttributionTable } from "@/components/overview/SummaryAttributionTable";
import { AiDailyBrief } from "@/components/overview/AiDailyBrief";
import { PinsSection } from "@/components/overview/PinsSection";
import { CostModelSheet } from "@/components/overview/CostModelSheet";
import { MetaSyncProgress } from "@/components/meta/meta-sync-progress";
import {
  DateRangePicker,
  DateRangeValue,
  getPresetDates,
} from "@/components/date-range/DateRangePicker";
import { usePersistentDateRange } from "@/hooks/use-persistent-date-range";
import { buildOverviewMetricCatalog } from "@/lib/overview-metric-catalog";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { usePreferencesStore } from "@/store/preferences-store";
import type { MetaStatusResponse } from "@/lib/meta/status-types";
import {
  getOverviewSummary,
  getOverviewSparklines,
  getLatestAiInsight,
  generateAiInsight,
  upsertBusinessCostModel,
  type SparklineBundle,
} from "@/src/services";
import type { BusinessCostModelData, OverviewMetricCardData, OverviewSummaryData } from "@/src/types/models";

type CurrencyCode = string;
type CompareMode = "none" | "previous_period";

async function fetchMetaStatus(businessId: string): Promise<MetaStatusResponse> {
  const params = new URLSearchParams({ businessId });
  const response = await fetch(`/api/meta/status?${params.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (payload as { message?: string } | null)?.message ??
        `Meta status request failed (${response.status})`
    );
  }
  return payload as MetaStatusResponse;
}

function getMetaStatusRefetchInterval(status: MetaStatusResponse | undefined) {
  const state = status?.state;
  if (state === "syncing" || state === "partial") return 5_000;
  if (
    state === "paused" ||
    state === "stale" ||
    (status?.jobHealth?.queueDepth ?? 0) > 0 ||
    (status?.jobHealth?.leasedPartitions ?? 0) > 0
  ) {
    return 10_000;
  }
  return false;
}

const PLATFORM_TITLE_META: Record<
  string,
  { label: string; logo: string }
> = {
  meta: { label: "Meta Ads", logo: "/platform-logos/Meta.png" },
  google: { label: "Google Ads", logo: "/platform-logos/googleAds.svg" },
  google_ads: { label: "Google Ads", logo: "/platform-logos/googleAds.svg" },
  tiktok: { label: "TikTok Ads", logo: "/platform-logos/tiktok.svg" },
  tiktok_ads: { label: "TikTok Ads", logo: "/platform-logos/tiktok.svg" },
};

export default function OverviewPage() {
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const workspaceOwnerId = useAppStore((state) => state.workspaceOwnerId);
  const businessId = selectedBusinessId ?? "";
  const activeBusiness = useMemo(
    () => businesses.find((business) => business.id === selectedBusinessId) ?? null,
    [businesses, selectedBusinessId]
  );

  const [dateRange, setDateRange] = usePersistentDateRange();
  const currency: CurrencyCode = (activeBusiness?.currency as CurrencyCode) ?? "USD";
  const [costModelSheetOpen, setCostModelSheetOpen] = useState(false);
  const [aiBriefRegenerating, setAiBriefRegenerating] = useState(false);
  const [aiBriefActionError, setAiBriefActionError] = useState<string | null>(null);

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  const { start: startDate, end: endDate } = getPresetDates(
    dateRange.rangePreset,
    dateRange.customStart,
    dateRange.customEnd
  );
  const compareMode: CompareMode =
    dateRange.comparisonPreset === "none" ? "none" : "previous_period";

  const query = useQuery({
    queryKey: ["overview-summary", businessId, startDate, endDate, compareMode],
    enabled: Boolean(selectedBusinessId),
    queryFn: () =>
      getOverviewSummary(businessId, {
        startDate,
        endDate,
        compareMode,
      }),
  });

  // Secondary query: fetches daily trend bundles independently so the metric
  // cards above can render as soon as the summary resolves, while sparkline
  // charts skeleton until this slower query settles.
  const sparklineQuery = useQuery({
    queryKey: ["overview-sparklines", businessId, startDate, endDate],
    enabled: Boolean(selectedBusinessId),
    queryFn: () => getOverviewSparklines(businessId, { startDate, endDate }),
    staleTime: 15 * 60 * 1000,
  });

  const aiBriefQuery = useQuery({
    queryKey: ["ai-daily-brief", businessId],
    enabled: Boolean(selectedBusinessId),
    queryFn: () => getLatestAiInsight(businessId),
    staleTime: 15 * 60 * 1000,
  });

  const metaStatusQuery = useQuery({
    queryKey: ["overview-meta-status", businessId],
    enabled: Boolean(selectedBusinessId),
    staleTime: 30 * 1000,
    refetchInterval: (query) =>
      getMetaStatusRefetchInterval(query.state.data as MetaStatusResponse | undefined),
    queryFn: () => fetchMetaStatus(businessId),
  });

  const handleRegenerateAiBrief = async () => {
    if (!businessId || aiBriefRegenerating) return;
    setAiBriefActionError(null);
    setAiBriefRegenerating(true);
    try {
      await generateAiInsight(businessId);
      await aiBriefQuery.refetch();
    } catch (error: unknown) {
      setAiBriefActionError(
        error instanceof Error ? error.message : "Could not regenerate AI brief."
      );
    } finally {
      setAiBriefRegenerating(false);
    }
  };

  // Merge sparklines into the summary once they arrive.
  // Uses the same formula the server-side route used to generate sparklines,
  // so ROAS and MER values are identical.
  const effectiveSummary = useMemo(
    () =>
      query.data
        ? sparklineQuery.data
          ? patchSummarySparklines(query.data, sparklineQuery.data)
          : query.data
        : undefined,
    [query.data, sparklineQuery.data]
  );

  // Charts show a pulsing skeleton while sparklines are loading.
  const chartsLoading = sparklineQuery.isLoading && !sparklineQuery.data;

  if (!selectedBusinessId) return <BusinessEmptyState />;

  if (query.isError) {
    const errorMessage =
      query.error instanceof Error ? query.error.message : "The request failed. Please try again.";
    return <ErrorState description={errorMessage} onRetry={() => query.refetch()} />;
  }

  const symbol = currencySymbol(currency);
  // All render data reads from effectiveSummary so sparklines are reflected
  // as soon as the secondary query resolves.
  const metricCatalog = useMemo(
    () => buildOverviewMetricCatalog(effectiveSummary),
    [effectiveSummary]
  );
  const pinContextKey = `${workspaceOwnerId ?? "anonymous"}:${businessId}`;
  const storeMetrics = useMemo(
    () => filterVisibleMetrics(effectiveSummary?.storeMetrics ?? []),
    [effectiveSummary?.storeMetrics]
  );
  const ltvMetrics = useMemo(
    () => filterVisibleMetrics(effectiveSummary?.ltv ?? []),
    [effectiveSummary?.ltv]
  );
  const expenseMetrics = useMemo(
    () => filterVisibleMetrics(effectiveSummary?.expenses ?? []),
    [effectiveSummary?.expenses]
  );
  const customMetrics = useMemo(
    () => filterVisibleMetrics(effectiveSummary?.customMetrics ?? []),
    [effectiveSummary?.customMetrics]
  );
  const webAnalyticsMetrics = useMemo(
    () => filterVisibleMetrics(effectiveSummary?.webAnalytics ?? []),
    [effectiveSummary?.webAnalytics]
  );
  const platformSections = useMemo(
    () =>
      (effectiveSummary?.platforms ?? [])
        .map((platform) => ({
          ...platform,
          metrics: filterVisibleMetrics(platform.metrics),
        }))
        .filter((platform) => platform.metrics.length > 0),
    [effectiveSummary?.platforms]
  );

  return (
    <div className="flex flex-col space-y-6 pb-10">
      <DataStatusRow
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        metaStatus={metaStatusQuery.data}
        shopifyServing={effectiveSummary?.shopifyServing ?? null}
      />

      <SummarySection
        title="Pins"
        description="Pinned top-line metrics for the selected business and period."
      >
        {query.isLoading ? (
          <MetricGrid metrics={[]} currencySymbol={symbol} loading chartLoading={chartsLoading} businessId={businessId} />
        ) : (
          <PinsSection
            businessId={businessId}
            contextKey={pinContextKey}
            startDate={startDate}
            endDate={endDate}
            currencySymbol={symbol}
            catalog={metricCatalog}
            onViewBreakdown={() => {
              window.location.hash = "#attribution";
            }}
          />
        )}
      </SummarySection>

      {(query.isLoading || storeMetrics.length > 0) ? (
        <SummarySection
          title="Store Metrics"
          description="Store health and ecommerce output sourced from GA4 ecommerce reporting."
        >
          <MetricGrid
            metrics={storeMetrics}
            currencySymbol={symbol}
            loading={query.isLoading}
            chartLoading={chartsLoading}
            businessId={businessId}
          />
        </SummarySection>
      ) : null}

      <SummarySection
        title="Attribution"
        description="Channel-level spend and revenue attribution from synced platform data."
      >
        <div id="attribution" />
        {query.isLoading ? (
          <LoadingTablePlaceholder />
        ) : (
          <SummaryAttributionTable rows={effectiveSummary?.attribution ?? []} currencySymbol={symbol} />
        )}
      </SummarySection>

      {(query.isLoading || ltvMetrics.length > 0) ? (
        <SummarySection
          title="LTV"
          description="Lifecycle and value metrics estimated from GA4 purchase behavior."
        >
          <MetricGrid
            metrics={ltvMetrics}
            currencySymbol={symbol}
            loading={query.isLoading}
            chartLoading={chartsLoading}
            businessId={businessId}
          />
        </SummarySection>
      ) : null}

      {platformSections.map((platform, index) => (
        <SummarySection
          key={`${platform.id}-${platform.provider}-${platform.title}-${index}`}
          title={renderPlatformSectionTitle(platform.provider, platform.title)}
          description={`Mini dashboard for ${resolvePlatformLabel(platform.provider, platform.title)} performance.`}
        >
          <MetricGrid
            metrics={platform.metrics}
            currencySymbol={symbol}
            loading={query.isLoading}
            chartLoading={chartsLoading}
            businessId={businessId}
          />
        </SummarySection>
      ))}

      {(query.isLoading || expenseMetrics.length > 0) ? (
        <SummarySection
          title="Expenses"
          description="Tracked expense coverage with cost-model enrichment when configured."
          action={
            <Button
              variant={effectiveSummary?.costModel.configured ? "outline" : "default"}
              className="rounded-xl"
              onClick={() => setCostModelSheetOpen(true)}
            >
              {effectiveSummary?.costModel.configured ? "Edit cost model" : "Set cost model"}
            </Button>
          }
        >
          <MetricGrid
            metrics={expenseMetrics}
            currencySymbol={symbol}
            loading={query.isLoading}
            chartLoading={chartsLoading}
            businessId={businessId}
          />
        </SummarySection>
      ) : null}

      {/* Restore when the custom metrics set is finalized for the live overview experience. */}
      {false && ((query.isLoading || customMetrics.length > 0) ? (
        <SummarySection
          title="Custom Metrics"
          description="Reusable business metrics that behave like standard summary cards."
        >
          <MetricGrid
            metrics={customMetrics}
            currencySymbol={symbol}
            loading={query.isLoading}
            chartLoading={chartsLoading}
            businessId={businessId}
          />
        </SummarySection>
      ) : null)}

      {(query.isLoading || webAnalyticsMetrics.length > 0) ? (
        <SummarySection
          title="Web Analytics"
          description="GA4-backed behavior metrics and ecommerce session health."
        >
          <MetricGrid
            metrics={webAnalyticsMetrics}
            currencySymbol={symbol}
            loading={query.isLoading}
            chartLoading={chartsLoading}
            businessId={businessId}
          />
        </SummarySection>
      ) : null}

      <SummarySection
        title="AI Daily Brief"
        description="Daily AI summary generated from the latest available cross-channel performance snapshot."
      >
        <AiDailyBrief
          insight={aiBriefQuery.data}
          loading={aiBriefQuery.isLoading}
          error={
            aiBriefActionError ??
            (aiBriefQuery.error instanceof Error ? aiBriefQuery.error.message : null)
          }
          onRegenerate={handleRegenerateAiBrief}
          regenerating={aiBriefRegenerating}
        />
      </SummarySection>

      <CostModelSheet
        open={costModelSheetOpen}
        onOpenChange={setCostModelSheetOpen}
        initialValue={effectiveSummary?.costModel.values ?? null}
        onSave={async (input) => {
          await upsertBusinessCostModel({
            businessId,
            ...input,
          });
          await query.refetch();
        }}
      />
    </div>
  );
}

function resolvePlatformLabel(provider: string, fallbackTitle: string) {
  return PLATFORM_TITLE_META[provider]?.label ?? fallbackTitle;
}

function renderPlatformSectionTitle(provider: string, fallbackTitle: string) {
  const configured = PLATFORM_TITLE_META[provider];
  if (!configured) return fallbackTitle;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
        <img
          src={configured.logo}
          alt={configured.label}
          className="h-4 w-4 object-contain"
          loading="lazy"
        />
      </span>
      <span>{configured.label}</span>
    </span>
  );
}

function MetricGrid({
  metrics,
  currencySymbol,
  loading,
  chartLoading = false,
  businessId,
}: {
  metrics: OverviewMetricCardData[];
  currencySymbol: string;
  loading: boolean;
  chartLoading?: boolean;
  businessId: string;
}) {
  const visibleMetrics = filterVisibleMetrics(metrics);
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {visibleMetrics.map((metric) => (
        <SummaryMetricCard
          key={metric.id}
          metric={metric}
          currencySymbol={currencySymbol}
          businessId={businessId}
          chartLoading={chartLoading}
        />
      ))}
    </div>
  );
}

function LoadingTablePlaceholder() {
  return <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />;
}

function LoadingInsightPlaceholder() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ))}
    </div>
  );
}

function DataStatusRow({
  dateRange,
  onDateRangeChange,
  metaStatus,
  shopifyServing,
}: {
  dateRange: DateRangeValue;
  onDateRangeChange: (value: DateRangeValue) => void;
  metaStatus?: MetaStatusResponse;
  shopifyServing?: OverviewSummaryData["shopifyServing"];
}) {
  const language = usePreferencesStore((state) => state.language);
  const shopifyBadge =
    shopifyServing?.source === "warehouse"
      ? { label: "Shopify provider", tone: "default" as const }
      : shopifyServing?.source === "live"
        ? { label: "Shopify live fallback", tone: "secondary" as const }
        : null;
  const shopifyHelper = shopifyServing
    ? shopifyServing.source === "warehouse"
      ? `Trusted ${shopifyServing.coverageStatus.replaceAll("_", " ")} serving`
      : shopifyServing.fallbackReason
        ? `Fallback: ${shopifyServing.fallbackReason.replaceAll("_", " ")}`
        : "Shopify data unavailable"
    : null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Live Status
          </p>
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs">
            <span className="font-medium text-slate-700">Overview Data</span>
            <Badge>Active</Badge>
            <span className="text-slate-500">Live API responses with cached provider snapshots.</span>
          </div>
          {shopifyBadge ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs">
              <span className="font-medium text-slate-700">Shopify</span>
              <Badge variant={shopifyBadge.tone}>{shopifyBadge.label}</Badge>
              {shopifyHelper ? <span className="text-slate-500">{shopifyHelper}</span> : null}
            </div>
          ) : null}
          <MetaSyncProgress
            status={metaStatus}
            language={language}
            variant="inline"
            className="max-w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        </div>
      </div>
    </section>
  );
}

function filterVisibleMetrics(metrics: OverviewMetricCardData[]) {
  return metrics.filter((metric) => metric.status !== "unavailable");
}


const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TRY: "₺",
  JPY: "¥",
  CAD: "CA$",
  AUD: "A$",
  CHF: "Fr",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  PLN: "zł",
  CZK: "Kč",
  HUF: "Ft",
  RON: "lei",
  BRL: "R$",
  MXN: "MX$",
  INR: "₹",
  ZAR: "R",
  AED: "د.إ",
  SAR: "﷼",
};

function currencySymbol(code: CurrencyCode) {
  return CURRENCY_SYMBOLS[code] ?? code;
}

// ---------------------------------------------------------------------------
// Sparkline patching — runs client-side once the secondary query resolves.
// Formulas mirror the server-side overview-summary route exactly so ROAS/MER
// values are always consistent.
// ---------------------------------------------------------------------------

type SparklinePoint = { date: string; value: number };

function rv(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function buildSparklineMap(
  bundle: SparklineBundle,
  costModel: BusinessCostModelData | null
): Record<string, SparklinePoint[]> {
  const { combined, providerTrends, ga4Daily } = bundle;

  const spendSeries = combined.map((p) => ({ date: p.date, value: rv(p.spend) }));
  const revenueSeries = combined.map((p) => ({ date: p.date, value: rv(p.revenue) }));
  const purchaseSeries = combined.map((p) => ({ date: p.date, value: rv(p.purchases) }));
  const merSeries = combined.map((p) => ({
    date: p.date,
    value: p.spend > 0 ? rv(p.revenue / p.spend) : 0,
  }));
  const blendedCpaSeries = combined.map((p) => ({
    date: p.date,
    value: p.purchases > 0 ? rv(p.spend / p.purchases) : 0,
  }));

  // GA4 daily derived series
  const ga4AovSeries = ga4Daily.map((p) => ({
    date: p.date,
    value: p.purchases > 0 ? rv(p.revenue / p.purchases) : 0,
  }));
  const ga4ConvRateSeries = ga4Daily.map((p) => ({
    date: p.date,
    value: p.sessions > 0 ? rv((p.purchases / p.sessions) * 100, 4) : 0,
  }));
  const ga4NewCustomersSeries = ga4Daily.map((p) => ({ date: p.date, value: rv(p.firstTimePurchasers) }));
  const ga4ReturningCustomersSeries = ga4Daily.map((p) => ({
    date: p.date,
    value: rv(Math.max(p.totalPurchasers - p.firstTimePurchasers, 0)),
  }));
  const ga4RevenuePerCustomerSeries = ga4Daily.map((p) => ({
    date: p.date,
    value: p.totalPurchasers > 0 ? rv(p.revenue / p.totalPurchasers) : 0,
  }));
  const ga4RepeatRateSeries = ga4Daily.map((p) => ({
    date: p.date,
    value:
      p.totalPurchasers > 0
        ? rv((Math.max(p.totalPurchasers - p.firstTimePurchasers, 0) / p.totalPurchasers) * 100, 4)
        : 0,
  }));
  const ga4SessionsSeries = ga4Daily.map((p) => ({ date: p.date, value: rv(p.sessions) }));
  const ga4EngagementSeries = ga4Daily.map((p) => ({
    date: p.date,
    value: rv(p.engagementRate * 100, 4),
  }));
  const ga4SessionDurationSeries = ga4Daily.map((p) => ({
    date: p.date,
    value: rv(p.avgSessionDuration),
  }));

  const aovSeries = ga4AovSeries.length > 0
    ? ga4AovSeries
    : combined.map((p) => ({
        date: p.date,
        value: p.purchases > 0 ? rv(p.revenue / p.purchases) : 0,
      }));

  const ltvCacSeries = ga4RevenuePerCustomerSeries.map((point, i) => ({
    date: point.date,
    value: blendedCpaSeries[i] && blendedCpaSeries[i].value > 0
      ? rv(point.value / blendedCpaSeries[i].value)
      : 0,
  }));

  // Cost-model dependent sparklines
  const cm = costModel;
  const totalExpensesSeries: SparklinePoint[] = cm
    ? revenueSeries.map((point, i) => ({
        date: point.date,
        value: rv(
          (spendSeries[i]?.value ?? 0) +
            point.value * (cm.cogsPercent + cm.shippingPercent + cm.feePercent) +
            cm.fixedCost
        ),
      }))
    : spendSeries;

  const netProfitSeries: SparklinePoint[] = cm
    ? revenueSeries.map((point, i) => ({
        date: point.date,
        value: rv(
          point.value -
            ((spendSeries[i]?.value ?? 0) +
              point.value * (cm.cogsPercent + cm.shippingPercent + cm.feePercent) +
              cm.fixedCost)
        ),
      }))
    : [];

  const contributionMarginSeries: SparklinePoint[] = cm
    ? revenueSeries.map((point, i) => {
        const spendVal = spendSeries[i]?.value ?? 0;
        const varCost =
          spendVal + point.value * (cm.cogsPercent + cm.shippingPercent + cm.feePercent);
        return {
          date: point.date,
          value: point.value > 0 ? rv(((point.value - varCost) / point.value) * 100) : 0,
        };
      })
    : [];

  // Per-provider sparklines (meta, google)
  const providerSparklines: Record<string, SparklinePoint[]> = {};
  for (const [provider, trends] of Object.entries(providerTrends)) {
    if (!trends) continue;
    providerSparklines[`${provider}-spend`] = trends.map((p) => ({ date: p.date, value: rv(p.spend) }));
    providerSparklines[`${provider}-revenue`] = trends.map((p) => ({ date: p.date, value: rv(p.revenue) }));
    providerSparklines[`${provider}-roas`] = trends.map((p) => ({
      date: p.date,
      value: p.spend > 0 ? rv(p.revenue / p.spend) : 0,
    }));
    providerSparklines[`${provider}-purchases`] = trends.map((p) => ({
      date: p.date,
      value: rv(p.purchases),
    }));
    providerSparklines[`${provider}-cpa`] = trends.map((p) => ({
      date: p.date,
      value: p.purchases > 0 ? rv(p.spend / p.purchases) : 0,
    }));
  }

  return {
    "pins-revenue": revenueSeries,
    "pins-spend": spendSeries,
    "pins-mer": merSeries,
    "pins-blended-roas": merSeries,
    "pins-conversion-rate": ga4ConvRateSeries,
    "pins-orders": purchaseSeries,
    "store-aov": aovSeries,
    "store-conversion-rate": ga4ConvRateSeries,
    "store-new-customers": ga4NewCustomersSeries,
    "store-returning-customers": ga4ReturningCustomersSeries,
    "ltv-average": ga4RevenuePerCustomerSeries,
    "ltv-cac": ltvCacSeries,
    "ltv-repeat-rate": ga4RepeatRateSeries,
    "ltv-revenue-per-customer": ga4RevenuePerCustomerSeries,
    "expenses-ad-spend": spendSeries,
    "expenses-total-tracked": totalExpensesSeries,
    "expenses-net-profit": netProfitSeries,
    "expenses-contribution-margin": contributionMarginSeries,
    "expenses-mer": merSeries,
    "custom-mer": merSeries,
    "custom-blended-cpa": blendedCpaSeries,
    "web-sessions": ga4SessionsSeries,
    "web-session-duration": ga4SessionDurationSeries,
    "web-engagement-rate": ga4EngagementSeries,
    ...providerSparklines,
  };
}

function patchCard(
  card: OverviewMetricCardData,
  sparkMap: Record<string, SparklinePoint[]>
): OverviewMetricCardData {
  const patches = sparkMap[card.id];
  if (!patches || patches.length === 0) return card;
  return { ...card, sparklineData: patches };
}

function patchSummarySparklines(
  summary: OverviewSummaryData,
  bundle: SparklineBundle
): OverviewSummaryData {
  const sparkMap = buildSparklineMap(bundle, summary.costModel.values);
  return {
    ...summary,
    pins: summary.pins.map((m) => patchCard(m, sparkMap)),
    storeMetrics: summary.storeMetrics.map((m) => patchCard(m, sparkMap)),
    ltv: summary.ltv.map((m) => patchCard(m, sparkMap)),
    expenses: summary.expenses.map((m) => patchCard(m, sparkMap)),
    customMetrics: summary.customMetrics.map((m) => patchCard(m, sparkMap)),
    webAnalytics: summary.webAnalytics.map((m) => patchCard(m, sparkMap)),
    platforms: summary.platforms.map((platform) => ({
      ...platform,
      metrics: platform.metrics.map((m) => patchCard(m, sparkMap)),
    })),
  };
}
