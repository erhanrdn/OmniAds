"use client";

import type { OverviewData } from "@/src/types/models";
import { MetricLoadingCard } from "@/components/states/MetricLoadingCard";
import { MetricUnavailableCard } from "@/components/states/MetricUnavailableCard";

type KpiKey = keyof OverviewData["kpis"];

interface OverviewKpiGridProps {
  kpis?: Partial<OverviewData["kpis"]> | null;
  currencySymbol: string;
  isLoading?: boolean;
  unavailableReasons?: Partial<Record<KpiKey, string>>;
}

export function OverviewKpiGrid({
  kpis,
  currencySymbol,
  isLoading = false,
  unavailableReasons,
}: OverviewKpiGridProps) {
  if (isLoading) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <MetricLoadingCard key={index} />
        ))}
      </section>
    );
  }

  const u = unavailableReasons ?? {};
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {renderMetricCard("Spend", kpis?.spend, currencySymbol, "currency", u.spend)}
      {renderMetricCard("Revenue", kpis?.revenue, currencySymbol, "currency", u.revenue)}
      {renderMetricCard("ROAS", kpis?.roas, currencySymbol, "ratio", u.roas)}
      {renderMetricCard(
        "Purchases",
        kpis?.purchases,
        currencySymbol,
        "count",
        u.purchases
      )}
      {renderMetricCard("CPA", kpis?.cpa, currencySymbol, "currency", u.cpa)}
      {renderMetricCard("AOV", kpis?.aov, currencySymbol, "currency", u.aov)}
    </section>
  );
}

function renderMetricCard(
  label: string,
  rawValue: number | null | undefined,
  currencySymbol: string,
  kind: "currency" | "count" | "ratio",
  unavailableReason?: string
) {
  if (unavailableReason) {
    return (
      <MetricUnavailableCard
        key={label}
        label={label}
        description={unavailableReason}
      />
    );
  }

  if (typeof rawValue !== "number" || Number.isNaN(rawValue)) {
    return (
      <MetricUnavailableCard
        key={label}
        label={label}
        description="Waiting for synced data"
      />
    );
  }

  const value =
    kind === "currency"
      ? formatCurrency(rawValue, currencySymbol)
      : kind === "count"
      ? Math.round(rawValue).toLocaleString()
      : rawValue.toFixed(2);

  return (
    <article key={label} className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-3 text-xs text-muted-foreground">Synced from backend</p>
    </article>
  );
}

function formatCurrency(value: number, symbol: string) {
  return `${symbol}${value.toLocaleString()}`;
}
