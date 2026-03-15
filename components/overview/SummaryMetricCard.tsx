"use client";

import type { OverviewMetricCardData } from "@/src/types/models";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  ChartLine,
  Clock3,
  Gauge,
  Minus,
  Percent,
  Receipt,
  ShoppingCart,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { MiniTrendAreaChart } from "@/components/overview/MiniTrendAreaChart";
import { MetricSourceLogos } from "@/components/overview/MetricSourceLogos";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  "badge-dollar-sign": BadgeDollarSign,
  "chart-line": ChartLine,
  "clock-3": Clock3,
  gauge: Gauge,
  "line-chart": ChartLine,
  percent: Percent,
  receipt: Receipt,
  "shopping-cart": ShoppingCart,
  target: Target,
  wallet: Wallet,
};

export function SummaryMetricCard({
  metric,
  currencySymbol,
  businessId,
}: {
  metric: OverviewMetricCardData;
  currencySymbol: string;
  businessId?: string;
}) {
  const Icon = metric.icon ? ICONS[metric.icon] : null;
  const delta = resolveDelta(metric.changePct, metric.trendDirection);
  const DeltaIcon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {Icon ? (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {metric.title}
              </p>
              {metric.subtitle ? (
                <p className="truncate text-[11px] text-slate-500">{metric.subtitle}</p>
              ) : null}
            </div>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[10px] font-medium capitalize",
            metric.status === "available"
              ? "bg-slate-100 text-slate-700"
              : metric.status === "partial"
              ? "bg-amber-100 text-amber-700"
              : "hidden"
          )}
        >
          {metric.status}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
            {formatMetricValue(metric, currencySymbol)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                delta.className
              )}
            >
              <DeltaIcon className="h-3.5 w-3.5" />
              {delta.label}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <MiniTrendAreaChart
          data={metric.sparklineData}
          tone={metric.trendDirection}
          className="h-12 w-full"
        />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="space-y-1 text-xs">
          {metric.helperText ? <p className="text-slate-500">{metric.helperText}</p> : null}
        </div>
        <MetricSourceLogos
          sourceKey={metric.dataSource.key}
          sourceLabel={metric.dataSource.label}
          businessId={businessId}
        />
      </div>
    </article>
  );
}

function formatMetricValue(metric: OverviewMetricCardData, currencySymbol: string) {
  if (metric.value === null || Number.isNaN(metric.value)) return "\u2014";
  if (metric.unit === "currency") return `${currencySymbol}${metric.value.toLocaleString()}`;
  if (metric.unit === "count") return Math.round(metric.value).toLocaleString();
  if (metric.unit === "ratio") return metric.value.toFixed(2);
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "duration_seconds") return `${Math.round(metric.value)}s`;
  return String(metric.value);
}

function resolveDelta(
  changePct: number | null,
  trendDirection: OverviewMetricCardData["trendDirection"]
) {
  const value = changePct ?? 0;
  if (trendDirection === "up") {
    return {
      direction: "up" as const,
      label: `${value > 0 ? "+" : ""}${value.toFixed(1)}%`,
      className: "bg-emerald-500/10 text-emerald-600",
    };
  }
  if (trendDirection === "down") {
    return {
      direction: "down" as const,
      label: `${value > 0 ? "+" : ""}${value.toFixed(1)}%`,
      className: "bg-rose-500/10 text-rose-600",
    };
  }
  return {
    direction: "neutral" as const,
    label: `${value > 0 ? "+" : ""}${value.toFixed(1)}%`,
    className: "bg-slate-200/70 text-slate-600",
  };
}
