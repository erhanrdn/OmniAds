"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { getOverview } from "@/src/services";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { OverviewKpiGrid } from "@/components/overview/OverviewKpiGrid";
import {
  OverviewTrendPanel,
  TrendMetric,
  TrendWindow,
} from "@/components/overview/OverviewTrendPanel";
import { PlatformEfficiencyTable } from "@/components/overview/PlatformEfficiencyTable";
import { useIntegrationsStore } from "@/store/integrations-store";
import { DataEmptyState } from "@/components/states/DataEmptyState";
import { LockedFeatureCard } from "@/components/states/LockedFeatureCard";

type CurrencyCode = "USD" | "EUR" | "GBP";

type OverviewKpiKey = "spend" | "revenue" | "roas" | "purchases" | "cpa" | "aov";

export default function OverviewPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";

  const [dateRangePreset, setDateRangePreset] = useState<TrendWindow>("30d");
  const [customStartDate, setCustomStartDate] = useState("2026-02-20");
  const [customEndDate, setCustomEndDate] = useState("2026-03-05");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("revenue");

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
    queryKey: ["overview", businessId, dateRange],
    enabled: Boolean(selectedBusinessId),
    queryFn: () => getOverview(businessId, dateRange),
  });

  if (!selectedBusinessId) return <BusinessEmptyState />;

  if (query.isError) {
    return <ErrorState onRetry={() => query.refetch()} />;
  }

  const integrations = byBusinessId[businessId];
  const ga4Connected = integrations?.ga4?.status === "connected";
  const shopifyConnected = integrations?.shopify?.status === "connected";
  const adPlatformConnected =
    integrations?.meta?.status === "connected" ||
    integrations?.google?.status === "connected" ||
    integrations?.tiktok?.status === "connected" ||
    integrations?.pinterest?.status === "connected" ||
    integrations?.snapchat?.status === "connected";

  const kpis = query.data?.kpis;
  const kpiUnavailableReasons = resolveKpiUnavailableReasons({
    kpis,
    adPlatformConnected,
    shopifyConnected,
  });

  const trendSource = query.data?.trends as
    | Partial<Record<"7d" | "14d" | "30d" | "custom", Array<{
        label: string;
        spend: number;
        revenue: number;
        purchases: number;
      }>>>
    | undefined;
  const trendDataByWindow = {
    "7d": trendSource?.["7d"] ?? [],
    "14d": trendSource?.["14d"] ?? [],
    "30d": trendSource?.["30d"] ?? [],
    custom: trendSource?.custom ?? [],
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Unified performance snapshot from synced backend data.
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

      <OverviewKpiGrid
        kpis={kpis}
        isLoading={query.isLoading}
        currencySymbol={currencySymbol(currency)}
        unavailableReasons={kpiUnavailableReasons}
      />

      <OverviewTrendPanel
        dataByWindow={trendDataByWindow}
        selectedWindow={dateRangePreset}
        onWindowChange={setDateRangePreset}
        selectedMetric={trendMetric}
        onMetricChange={setTrendMetric}
        currencySymbol={currencySymbol(currency)}
        isLoading={query.isLoading}
      />

      <PlatformEfficiencyTable
        rows={query.data?.platformEfficiency ?? []}
        currencySymbol={currencySymbol(currency)}
        isLoading={query.isLoading}
      />

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Opportunities</h2>
          <p className="text-sm text-muted-foreground">
            Recommendations will appear once enough synced backend performance data is available.
          </p>
        </div>

        {!ga4Connected ? (
          <LockedFeatureCard
            providerLabel="GA4"
            description="Connect GA4 to unlock behavior-based opportunities. No recommendations are generated until synced data is sufficient."
          />
        ) : (
          <DataEmptyState
            title="Opportunities will appear here"
            description="Once enough synced performance data is available, OmniAds will surface actionable recommendations."
          />
        )}
      </section>
    </div>
  );
}

function resolveKpiUnavailableReasons({
  kpis,
  adPlatformConnected,
  shopifyConnected,
}: {
  kpis: Partial<Record<OverviewKpiKey, number>> | undefined;
  adPlatformConnected: boolean;
  shopifyConnected: boolean;
}): Partial<Record<OverviewKpiKey, string>> {
  const reasons: Partial<Record<OverviewKpiKey, string>> = {};

  const adMetrics: OverviewKpiKey[] = ["spend", "roas", "cpa"];
  const commerceMetrics: OverviewKpiKey[] = ["revenue", "purchases", "aov"];

  for (const metric of adMetrics) {
    const value = kpis?.[metric];
    if (!adPlatformConnected) {
      reasons[metric] = "Requires connected ad platforms";
      continue;
    }
    if (typeof value !== "number" || Number.isNaN(value)) {
      reasons[metric] = "Waiting for synced data";
    }
  }

  for (const metric of commerceMetrics) {
    const value = kpis?.[metric];
    if (!shopifyConnected) {
      reasons[metric] = "Requires Shopify";
      continue;
    }
    if (typeof value !== "number" || Number.isNaN(value)) {
      reasons[metric] = "Waiting for synced data";
    }
  }

  return reasons;
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
            <div
              key={item.provider}
              className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
            >
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
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm outline-none"
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

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currencySymbol(code: CurrencyCode) {
  if (code === "EUR") return "€";
  if (code === "GBP") return "£";
  return "$";
}
