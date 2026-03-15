"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCcw, Sparkles } from "lucide-react";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { BusinessSelector } from "@/components/business/BusinessSelector";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SummaryMetricCard } from "@/components/overview/SummaryMetricCard";
import { SummarySection } from "@/components/overview/SummarySection";
import { SummaryAttributionTable } from "@/components/overview/SummaryAttributionTable";
import { SummaryInsightsGrid } from "@/components/overview/SummaryInsightsGrid";
import { PinsSection } from "@/components/overview/PinsSection";
import { CostModelSheet } from "@/components/overview/CostModelSheet";
import {
  DateRangePicker,
  DateRangeValue,
  DEFAULT_DATE_RANGE,
  getPresetDates,
} from "@/components/date-range/DateRangePicker";
import { buildOverviewMetricCatalog } from "@/lib/overview-metric-catalog";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import {
  getOverviewSummary,
  getOverviewSparklines,
  upsertBusinessCostModel,
  type SparklineBundle,
} from "@/src/services";
import type { BusinessCostModelData, OverviewMetricCardData, OverviewSummaryData } from "@/src/types/models";

type CurrencyCode = "USD" | "EUR" | "GBP";
type CompareMode = "none" | "previous_period";

export default function OverviewPage() {
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const workspaceOwnerId = useAppStore((state) => state.workspaceOwnerId);
  const businessId = selectedBusinessId ?? "";
  const activeBusiness = useMemo(
    () => businesses.find((business) => business.id === selectedBusinessId) ?? null,
    [businesses, selectedBusinessId]
  );

  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [compareMode, setCompareMode] = useState<CompareMode>("previous_period");
  const [currency, setCurrency] = useState<CurrencyCode>((activeBusiness?.currency as CurrencyCode) ?? "USD");
  const [accountFilter, setAccountFilter] = useState("all_accounts");
  const [campaignType, setCampaignType] = useState("all_campaign_types");
  const [costModelSheetOpen, setCostModelSheetOpen] = useState(false);

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  useEffect(() => {
    if (!activeBusiness?.currency) return;
    if (["USD", "EUR", "GBP"].includes(activeBusiness.currency)) {
      setCurrency(activeBusiness.currency as CurrencyCode);
    }
  }, [activeBusiness?.currency]);

  const { start: startDate, end: endDate } = getPresetDates(
    dateRange.rangePreset,
    dateRange.customStart,
    dateRange.customEnd
  );

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
      <section className="border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Overview</h1>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <BusinessSelector />
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              showComparisonTrigger={false}
            />
            {/* Restore if the standalone compare control is needed again. */}
            {false && (
              <ControlSelect
                label="Compare"
                value={compareMode}
                onChange={(value) => setCompareMode(value as CompareMode)}
                options={[
                  { label: "Previous period", value: "previous_period" },
                  { label: "No comparison", value: "none" },
                ]}
              />
            )}
            <ControlSelect
              label="Currency"
              value={currency}
              onChange={(value) => setCurrency(value as CurrencyCode)}
              options={[
                { label: "USD", value: "USD" },
                { label: "EUR", value: "EUR" },
                { label: "GBP", value: "GBP" },
              ]}
            />
            {/* Restore when export workflow is wired to live overview data. */}
            {false && (
              <Button variant="outline" className="gap-2 rounded-xl" disabled>
                <Download className="h-4 w-4" />
                Export
              </Button>
            )}
            {/* Restore when the assistant has live overview actions. */}
            {false && (
              <Button className="gap-2 rounded-xl" disabled>
                <Sparkles className="h-4 w-4" />
                AI Assistant
              </Button>
            )}
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm transition-colors hover:bg-slate-50"
              onClick={() => {
                setDateRange(DEFAULT_DATE_RANGE);
                setCompareMode("previous_period");
                setAccountFilter("all_accounts");
                setCampaignType("all_campaign_types");
              }}
            >
              <RefreshCcw className="h-4 w-4" />
              Reset Filters
            </Button>
          </div>
        </div>
      </section>

      <DataStatusRow businessId={businessId} />

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

      {platformSections.map((platform) => (
        <SummarySection
          key={platform.id}
          title={platform.title}
          description={`Mini dashboard for ${platform.title} performance.`}
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
        title="Opportunity Signals"
        description="High-signal recommendations and AI-ready flags based on the current business snapshot."
      >
        {query.isLoading ? <LoadingInsightPlaceholder /> : <SummaryInsightsGrid insights={effectiveSummary?.insights ?? []} />}
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

function DataStatusRow({ businessId }: { businessId: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Live Status
        </p>
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs">
          <span className="font-medium text-slate-700">Overview Data</span>
          <Badge>Active</Badge>
          <span className="text-slate-500">Live API responses with cached provider snapshots.</span>
        </div>
      </div>
    </section>
  );
}

function filterVisibleMetrics(metrics: OverviewMetricCardData[]) {
  return metrics.filter((metric) => metric.status !== "unavailable");
}

function ControlSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm transition-colors hover:bg-slate-50">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm font-medium text-slate-900 outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function currencySymbol(code: CurrencyCode) {
  if (code === "EUR") return "€";
  if (code === "GBP") return "£";
  return "$";
}

// ---------------------------------------------------------------------------
// Sparkline patching — runs client-side once the secondary query resolves.
// Formulas mirror the server-side overview-summary route exactly so ROAS/MER
// values are always consistent.
// ---------------------------------------------------------------------------

type SparklinePoint = { date: string; value: number };

function rv(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
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
    value: p.sessions > 0 ? rv((p.purchases / p.sessions) * 100) : 0,
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
        ? rv((Math.max(p.totalPurchasers - p.firstTimePurchasers, 0) / p.totalPurchasers) * 100)
        : 0,
  }));
  const ga4SessionsSeries = ga4Daily.map((p) => ({ date: p.date, value: rv(p.sessions) }));
  const ga4EngagementSeries = ga4Daily.map((p) => ({
    date: p.date,
    value: rv(p.engagementRate * 100),
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
