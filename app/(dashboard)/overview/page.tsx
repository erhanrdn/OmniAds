"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { getOverview } from "@/src/services";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { OverviewKpiGrid } from "@/components/overview/OverviewKpiGrid";
import { OverviewTrendPanel, TrendMetric, TrendWindow } from "@/components/overview/OverviewTrendPanel";
import { PlatformEfficiencyTable } from "@/components/overview/PlatformEfficiencyTable";
import { OpportunitiesPanel } from "@/components/overview/OpportunitiesPanel";
import { OpportunityDrawer } from "@/components/overview/OpportunityDrawer";
import { buildOverviewOpportunities, OpportunityItem } from "@/lib/overviewInsights";
import { useIntegrationsStore } from "@/store/integrations-store";

type AttributionModel = "platform" | "blended" | "ga4";
type CurrencyCode = "USD" | "EUR" | "GBP";

export default function OverviewPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";

  const [dateRangePreset, setDateRangePreset] = useState<TrendWindow>("30d");
  const [customStartDate, setCustomStartDate] = useState("2026-02-20");
  const [customEndDate, setCustomEndDate] = useState("2026-03-05");
  const [attributionModel, setAttributionModel] = useState<AttributionModel>("platform");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");

  const [trendMetric, setTrendMetric] = useState<TrendMetric>("revenue");
  const [trendByPlatform, setTrendByPlatform] = useState(false);

  const [activeOpportunity, setActiveOpportunity] = useState<OpportunityItem | null>(null);

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  const dateRange = useMemo(() => {
    if (dateRangePreset === "custom") {
      return { startDate: customStartDate, endDate: customEndDate };
    }

    const end = new Date();
    const start = new Date(end);
    const offset = dateRangePreset === "7d" ? 6 : dateRangePreset === "14d" ? 13 : 29;
    start.setDate(end.getDate() - offset);

    return {
      startDate: toISODate(start),
      endDate: toISODate(end),
    };
  }, [customEndDate, customStartDate, dateRangePreset]);

  const query = useQuery({
    queryKey: ["overview", businessId, dateRange, attributionModel],
    enabled: Boolean(selectedBusinessId),
    queryFn: () => getOverview(businessId, dateRange),
  });

  if (!selectedBusinessId) return <BusinessEmptyState />;

  if (query.isLoading) {
    return <LoadingSkeleton rows={5} />;
  }

  if (query.isError) {
    return <ErrorState onRetry={() => query.refetch()} />;
  }

  if (!query.data) return null;

  const integrations = byBusinessId[businessId];
  const ga4Connected = integrations?.ga4?.status === "connected";
  const shopifyConnected = integrations?.shopify?.status === "connected";
  const adPlatformConnected =
    integrations?.meta?.status === "connected" ||
    integrations?.google?.status === "connected";

  const kpiUnavailable = {
    ...(!adPlatformConnected && {
      spend: "Meta or Google",
      roas: "Meta or Google",
      cpa: "Meta or Google",
    }),
    ...(!shopifyConnected && {
      revenue: "Shopify",
      purchases: "Shopify",
      aov: "Shopify",
    }),
  };

  const adjustedData = applyAttributionModel(query.data, attributionModel);
  const trendDataByWindow = {
    "7d": adjustedData.trends["7d"],
    "14d": adjustedData.trends["7d"],
    "30d": adjustedData.trends["30d"],
    custom: adjustedData.trends.custom,
  };

  const opportunities = buildOverviewOpportunities({
    data: adjustedData,
    ga4Connected,
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Unified performance snapshot: what happened, why, and what to do next.
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <ControlSelect
            label="Date range"
            value={dateRangePreset}
            onChange={(value) => setDateRangePreset(value as TrendWindow)}
            options={[
              { label: "7d", value: "7d" },
              { label: "14d", value: "14d" },
              { label: "30d", value: "30d" },
              { label: "Custom", value: "custom" },
            ]}
          />
          <ControlSelect
            label="Attribution model"
            value={attributionModel}
            onChange={(value) => setAttributionModel(value as AttributionModel)}
            options={[
              { label: "Platform reported", value: "platform" },
              { label: "Blended (Shopify)", value: "blended" },
              { label: "GA4", value: "ga4" },
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
          {dateRangePreset === "custom" ? (
            <>
              <input
                type="date"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
              />
              <input
                type="date"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
              />
            </>
          ) : null}
        </div>
      </section>

      <DataStatusRow businessId={businessId} />

      <OverviewKpiGrid kpis={adjustedData.kpis} currencySymbol={currencySymbol(currency)} unavailableReasons={kpiUnavailable} />

      <OverviewTrendPanel
        dataByWindow={trendDataByWindow}
        selectedWindow={dateRangePreset}
        onWindowChange={setDateRangePreset}
        selectedMetric={trendMetric}
        onMetricChange={setTrendMetric}
        byPlatform={trendByPlatform}
        onByPlatformChange={setTrendByPlatform}
        currencySymbol={currencySymbol(currency)}
      />

      <PlatformEfficiencyTable
        rows={adjustedData.platformEfficiency}
        currencySymbol={currencySymbol(currency)}
      />

      <OpportunitiesPanel
        items={opportunities}
        onOpenDetails={(item) => setActiveOpportunity(item)}
      />

      <OpportunityDrawer
        open={Boolean(activeOpportunity)}
        item={activeOpportunity}
        onOpenChange={(open) => {
          if (!open) setActiveOpportunity(null);
        }}
      />
    </div>
  );
}

function DataStatusRow({ businessId }: { businessId: string }) {
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);
  const integrations = byBusinessId[businessId];

  if (!integrations) return null;

  const items = [
    { label: "Meta", provider: "meta" as const },
    { label: "Google", provider: "google" as const },
    { label: "Shopify", provider: "shopify" as const },
    { label: "GA4", provider: "ga4" as const },
  ];

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Data status
        </p>
        {items.map((item) => {
          const state = integrations[item.provider];
          const connected = state?.status === "connected";
          return (
            <div key={item.provider} className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
              <span className="font-medium">{item.label}</span>
              <Badge variant={connected ? "default" : "secondary"}>
                {connected ? "connected" : "not connected"}
              </Badge>
              {connected && state.lastSyncAt ? (
                <span className="text-muted-foreground">
                  last sync {new Date(state.lastSyncAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
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
    <label className="inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent text-sm outline-none">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function applyAttributionModel(
  data: Awaited<ReturnType<typeof getOverview>>,
  model: AttributionModel
) {
  if (model === "platform") return data;

  const factors =
    model === "blended"
      ? { revenue: 0.96, purchases: 0.95, spend: 1 }
      : { revenue: 0.9, purchases: 0.92, spend: 1 };

  const kpiRevenue = Number((data.kpis.revenue * factors.revenue).toFixed(2));
  const kpiPurchases = Math.max(1, Math.round(data.kpis.purchases * factors.purchases));
  const kpiSpend = Number((data.kpis.spend * factors.spend).toFixed(2));

  const kpiRoas = Number((kpiRevenue / Math.max(kpiSpend, 1)).toFixed(2));
  const kpiCpa = Number((kpiSpend / Math.max(kpiPurchases, 1)).toFixed(2));
  const kpiAov = Number((kpiRevenue / Math.max(kpiPurchases, 1)).toFixed(2));

  return {
    ...data,
    kpis: {
      spend: kpiSpend,
      revenue: kpiRevenue,
      roas: kpiRoas,
      purchases: kpiPurchases,
      cpa: kpiCpa,
      aov: kpiAov,
    },
    platformEfficiency: data.platformEfficiency.map((row) => {
      const spend = Number((row.spend * factors.spend).toFixed(2));
      const revenue = Number((row.revenue * factors.revenue).toFixed(2));
      const purchases = Math.max(1, Math.round(row.purchases * factors.purchases));
      return {
        ...row,
        spend,
        revenue,
        purchases,
        roas: Number((revenue / Math.max(spend, 1)).toFixed(2)),
        cpa: Number((spend / Math.max(purchases, 1)).toFixed(2)),
      };
    }),
    trends: {
      "7d": data.trends["7d"].map((point) => ({
        ...point,
        spend: Number((point.spend * factors.spend).toFixed(2)),
        revenue: Number((point.revenue * factors.revenue).toFixed(2)),
        purchases: Math.round(point.purchases * factors.purchases),
      })),
      "30d": data.trends["30d"].map((point) => ({
        ...point,
        spend: Number((point.spend * factors.spend).toFixed(2)),
        revenue: Number((point.revenue * factors.revenue).toFixed(2)),
        purchases: Math.round(point.purchases * factors.purchases),
      })),
      custom: data.trends.custom.map((point) => ({
        ...point,
        spend: Number((point.spend * factors.spend).toFixed(2)),
        revenue: Number((point.revenue * factors.revenue).toFixed(2)),
        purchases: Math.round(point.purchases * factors.purchases),
      })),
    },
  };
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currencySymbol(code: CurrencyCode) {
  if (code === "EUR") return "€";
  if (code === "GBP") return "£";
  return "$";
}
