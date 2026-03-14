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
import { getOverviewSummary, upsertBusinessCostModel } from "@/src/services";
import type { OverviewMetricCardData } from "@/src/types/models";

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

  if (!selectedBusinessId) return <BusinessEmptyState />;

  if (query.isError) {
    const errorMessage =
      query.error instanceof Error ? query.error.message : "The request failed. Please try again.";
    return <ErrorState description={errorMessage} onRetry={() => query.refetch()} />;
  }

  const summary = query.data;
  const symbol = currencySymbol(currency);
  const metricCatalog = useMemo(() => buildOverviewMetricCatalog(summary), [summary]);
  const pinContextKey = `${workspaceOwnerId ?? "anonymous"}:${businessId}`;
  const storeMetrics = useMemo(() => filterVisibleMetrics(summary?.storeMetrics ?? []), [summary?.storeMetrics]);
  const ltvMetrics = useMemo(() => filterVisibleMetrics(summary?.ltv ?? []), [summary?.ltv]);
  const expenseMetrics = useMemo(() => filterVisibleMetrics(summary?.expenses ?? []), [summary?.expenses]);
  const customMetrics = useMemo(
    () => filterVisibleMetrics(summary?.customMetrics ?? []),
    [summary?.customMetrics]
  );
  const webAnalyticsMetrics = useMemo(
    () => filterVisibleMetrics(summary?.webAnalytics ?? []),
    [summary?.webAnalytics]
  );
  const platformSections = useMemo(
    () =>
      (summary?.platforms ?? [])
        .map((platform) => ({
          ...platform,
          metrics: filterVisibleMetrics(platform.metrics),
        }))
        .filter((platform) => platform.metrics.length > 0),
    [summary?.platforms]
  );

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.06),_transparent_42%),linear-gradient(180deg,#ffffff,#f8fafc)] p-5 shadow-sm shadow-slate-200/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Overview Command Center
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Summary</h1>
              <p className="text-sm text-slate-600">
                A stacked command center for business health, attribution, platform performance,
                and opportunity signals.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              className="gap-2 rounded-xl"
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

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <BusinessSelector />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <ControlSelect
            label="Compare"
            value={compareMode}
            onChange={(value) => setCompareMode(value as CompareMode)}
            options={[
              { label: "Previous period", value: "previous_period" },
              { label: "No comparison", value: "none" },
            ]}
          />
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
          {/* Restore when account-level filtering is wired into the query key and API. */}
          {false && (
            <ControlSelect
              label="Account"
              value={accountFilter}
              onChange={setAccountFilter}
              options={[{ label: "All accounts", value: "all_accounts" }]}
            />
          )}
          {/* Restore when campaign-type filtering is wired into the query key and API. */}
          {false && (
            <ControlSelect
              label="Campaign type"
              value={campaignType}
              onChange={setCampaignType}
              options={[{ label: "All campaign types", value: "all_campaign_types" }]}
            />
          )}
        </div>
      </section>

      <DataStatusRow businessId={businessId} />

      <SummarySection
        title="Pins"
        description="Pinned top-line metrics for the selected business and period."
      >
        {query.isLoading ? (
          <MetricGrid metrics={[]} currencySymbol={symbol} loading businessId={businessId} />
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
          <SummaryAttributionTable rows={summary?.attribution ?? []} currencySymbol={symbol} />
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
              variant={summary?.costModel.configured ? "outline" : "default"}
              className="rounded-xl"
              onClick={() => setCostModelSheetOpen(true)}
            >
              {summary?.costModel.configured ? "Edit cost model" : "Set cost model"}
            </Button>
          }
        >
          <MetricGrid
            metrics={expenseMetrics}
            currencySymbol={symbol}
            loading={query.isLoading}
            businessId={businessId}
          />
        </SummarySection>
      ) : null}

      {(query.isLoading || customMetrics.length > 0) ? (
        <SummarySection
          title="Custom Metrics"
          description="Reusable business metrics that behave like standard summary cards."
        >
          <MetricGrid
            metrics={customMetrics}
            currencySymbol={symbol}
            loading={query.isLoading}
            businessId={businessId}
          />
        </SummarySection>
      ) : null}

      {(query.isLoading || webAnalyticsMetrics.length > 0) ? (
        <SummarySection
          title="Web Analytics"
          description="GA4-backed behavior metrics and ecommerce session health."
        >
          <MetricGrid
            metrics={webAnalyticsMetrics}
            currencySymbol={symbol}
            loading={query.isLoading}
            businessId={businessId}
          />
        </SummarySection>
      ) : null}

      <SummarySection
        title="Opportunity Signals"
        description="High-signal recommendations and AI-ready flags based on the current business snapshot."
      >
        {query.isLoading ? <LoadingInsightPlaceholder /> : <SummaryInsightsGrid insights={summary?.insights ?? []} />}
      </SummarySection>

      <CostModelSheet
        open={costModelSheetOpen}
        onOpenChange={setCostModelSheetOpen}
        initialValue={summary?.costModel.values ?? null}
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
  businessId,
}: {
  metrics: OverviewMetricCardData[];
  currencySymbol: string;
  loading: boolean;
  businessId: string;
}) {
  const visibleMetrics = filterVisibleMetrics(metrics);
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visibleMetrics.map((metric) => (
        <SummaryMetricCard
          key={metric.id}
          metric={metric}
          currencySymbol={currencySymbol}
          businessId={businessId}
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
    <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs">
      <span className="font-medium uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm text-slate-900 outline-none"
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
