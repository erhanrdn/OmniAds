"use client";

import type { OverviewMetricCardData } from "@/src/types/models";
import {
  Activity,
  BadgeDollarSign,
  ChartLine,
  Clock3,
  Gauge,
  Percent,
  Receipt,
  ShoppingCart,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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
}: {
  metric: OverviewMetricCardData;
  currencySymbol: string;
}) {
  const Icon = metric.icon ? ICONS[metric.icon] : null;
  const tone =
    metric.trendDirection === "up"
      ? "text-emerald-600"
      : metric.trendDirection === "down"
      ? "text-rose-600"
      : "text-slate-500";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {Icon ? (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {metric.title}
              </p>
              {metric.subtitle ? (
                <p className="text-xs text-slate-500">{metric.subtitle}</p>
              ) : null}
            </div>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[11px] font-medium capitalize",
            metric.status === "available"
              ? "bg-slate-100 text-slate-700"
              : metric.status === "partial"
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-500"
          )}
        >
          {metric.status}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-slate-950">
            {formatMetricValue(metric, currencySymbol)}
          </p>
          <p className={cn("mt-1 text-xs font-medium", tone)}>
            {formatChange(metric.changePct)}
          </p>
        </div>
        <MiniSparkline data={metric.sparklineData} tone={metric.trendDirection} />
      </div>

      <div className="mt-4 space-y-1 text-xs">
        <p className="text-slate-500">Source: {metric.dataSource.label}</p>
        {metric.helperText ? <p className="text-slate-500">{metric.helperText}</p> : null}
      </div>
    </article>
  );
}

function MiniSparkline({
  data,
  tone,
}: {
  data: number[];
  tone: OverviewMetricCardData["trendDirection"];
}) {
  if (!data || data.length < 2) {
    return <div className="h-12 w-24 rounded-xl bg-slate-100/70" />;
  }

  const width = 96;
  const height = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stroke =
    tone === "up" ? "#059669" : tone === "down" ? "#e11d48" : "#475569";
  const path = data
    .map((point, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * width;
      const y = height - ((point - min) / range) * (height - 4) - 2;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-12 w-24 overflow-visible"
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function formatMetricValue(metric: OverviewMetricCardData, currencySymbol: string) {
  if (metric.value === null || Number.isNaN(metric.value)) return "Unavailable";
  if (metric.unit === "currency") return `${currencySymbol}${metric.value.toLocaleString()}`;
  if (metric.unit === "count") return Math.round(metric.value).toLocaleString();
  if (metric.unit === "ratio") return metric.value.toFixed(2);
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "duration_seconds") return `${Math.round(metric.value)}s`;
  return String(metric.value);
}

function formatChange(changePct: number | null) {
  if (changePct === null) return "No comparison";
  if (changePct === 0) return "Flat vs previous period";
  return `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}% vs previous period`;
}
