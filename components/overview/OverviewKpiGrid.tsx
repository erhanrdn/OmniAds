"use client";

import type { OverviewData } from "@/src/types/models";
import { Badge } from "@/components/ui/badge";
import { UnavailableMetricCard } from "@/components/states/UnavailableMetricCard";

type KpiKey = keyof OverviewData["kpis"];

interface OverviewKpiGridProps {
  kpis: OverviewData["kpis"];
  currencySymbol: string;
  unavailableReasons?: Partial<Record<KpiKey, string>>;
}

const KPI_DELTAS: Record<KpiKey, number> = {
  spend: 8.4,
  revenue: 12.1,
  roas: 4.3,
  purchases: 10.5,
  cpa: -3.2,
  aov: 2.7,
};

const SPARKLINES: Record<KpiKey, number[]> = {
  spend: [6, 7, 7, 8, 8, 9, 9],
  revenue: [6, 7, 9, 10, 9, 11, 12],
  roas: [4, 5, 5, 6, 6, 7, 7],
  purchases: [5, 6, 7, 7, 8, 9, 10],
  cpa: [9, 8, 8, 7, 7, 6, 6],
  aov: [4, 4, 5, 5, 6, 6, 7],
};

export function OverviewKpiGrid({ kpis, currencySymbol, unavailableReasons }: OverviewKpiGridProps) {
  const u = unavailableReasons ?? {};
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {u.spend ? <UnavailableMetricCard label="Spend" requires={u.spend} /> : <KpiCard label="Spend" value={formatCurrency(kpis.spend, currencySymbol)} delta={KPI_DELTAS.spend} sparkline={SPARKLINES.spend} />}
      {u.revenue ? <UnavailableMetricCard label="Revenue" requires={u.revenue} /> : <KpiCard label="Revenue" value={formatCurrency(kpis.revenue, currencySymbol)} delta={KPI_DELTAS.revenue} sparkline={SPARKLINES.revenue} />}
      {u.roas ? <UnavailableMetricCard label="ROAS" requires={u.roas} /> : <KpiCard label="ROAS" value={kpis.roas.toFixed(2)} delta={KPI_DELTAS.roas} sparkline={SPARKLINES.roas} />}
      {u.purchases ? <UnavailableMetricCard label="Purchases" requires={u.purchases} /> : <KpiCard label="Purchases" value={kpis.purchases.toLocaleString()} delta={KPI_DELTAS.purchases} sparkline={SPARKLINES.purchases} />}
      {u.cpa ? <UnavailableMetricCard label="CPA" requires={u.cpa} /> : <KpiCard label="CPA" value={formatCurrency(kpis.cpa, currencySymbol)} delta={KPI_DELTAS.cpa} sparkline={SPARKLINES.cpa} />}
      {u.aov ? <UnavailableMetricCard label="AOV" requires={u.aov} /> : <KpiCard label="AOV" value={formatCurrency(kpis.aov, currencySymbol)} delta={KPI_DELTAS.aov} sparkline={SPARKLINES.aov} />}
    </section>
  );
}

function KpiCard({
  label,
  value,
  delta,
  sparkline,
}: {
  label: string;
  value: string;
  delta: number;
  sparkline: number[];
}) {
  const isPositive = delta >= 0;
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <Badge
          variant="secondary"
          className={isPositive ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50"}
        >
          {isPositive ? "+" : ""}
          {delta.toFixed(1)}%
        </Badge>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <Sparkline values={sparkline} />
    </article>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 120;
  const height = 34;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const spread = Math.max(max - min, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;

  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / spread) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="mt-4 flex justify-end">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-28" aria-hidden>
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function formatCurrency(value: number, symbol: string) {
  return `${symbol}${value.toLocaleString()}`;
}
