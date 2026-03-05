"use client";

import { cn } from "@/lib/utils";

export type TrendMetric = "revenue" | "spend" | "roas" | "purchases";
export type TrendWindow = "7d" | "14d" | "30d" | "custom";

interface TrendPoint {
  label: string;
  spend: number;
  revenue: number;
  purchases: number;
}

interface OverviewTrendPanelProps {
  dataByWindow: {
    "7d": TrendPoint[];
    "14d": TrendPoint[];
    "30d": TrendPoint[];
    custom: TrendPoint[];
  };
  selectedWindow: TrendWindow;
  onWindowChange: (window: TrendWindow) => void;
  selectedMetric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
  byPlatform: boolean;
  onByPlatformChange: (enabled: boolean) => void;
  currencySymbol: string;
}

const WINDOW_OPTIONS: TrendWindow[] = ["7d", "14d", "30d", "custom"];

const PLATFORM_COLORS: Record<string, string> = {
  meta: "#2563eb",
  google: "#16a34a",
  tiktok: "#7c3aed",
  pinterest: "#db2777",
  snapchat: "#ea580c",
};

export function OverviewTrendPanel({
  dataByWindow,
  selectedWindow,
  onWindowChange,
  selectedMetric,
  onMetricChange,
  byPlatform,
  onByPlatformChange,
  currencySymbol,
}: OverviewTrendPanelProps) {
  const baseSeries = dataByWindow[selectedWindow];

  const series = byPlatform
    ? buildPlatformSeries(baseSeries, selectedMetric)
    : [
        {
          key: selectedMetric,
          label: metricLabel(selectedMetric),
          color: "#0f172a",
          points: baseSeries.map((point) => getMetricValue(point, selectedMetric)),
        },
      ];

  const maxValue = Math.max(
    1,
    ...series.flatMap((line) => line.points.map((point) => point.value))
  );

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Performance Trends</h2>
          <p className="text-sm text-muted-foreground">
            Trend view for selected metric and date range
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMetric}
            onChange={(event) => onMetricChange(event.target.value as TrendMetric)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="revenue">Revenue</option>
            <option value="spend">Spend</option>
            <option value="roas">ROAS</option>
            <option value="purchases">Purchases</option>
          </select>
          <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs font-medium">
            <input
              type="checkbox"
              checked={byPlatform}
              onChange={(event) => onByPlatformChange(event.target.checked)}
            />
            By platform
          </label>
        </div>
      </div>

      <div className="mt-3 inline-flex rounded-lg border bg-muted/40 p-1">
        {WINDOW_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onWindowChange(option)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium uppercase transition-colors",
              selectedWindow === option
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {selectedWindow === "custom" && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:max-w-md">
          <input type="date" className="rounded-md border bg-background px-3 py-2 text-sm" readOnly value="2026-02-20" />
          <input type="date" className="rounded-md border bg-background px-3 py-2 text-sm" readOnly value="2026-03-05" />
        </div>
      )}

      <div className="mt-4 rounded-xl border bg-background p-4">
        <SimpleLineChart
          labels={baseSeries.map((item) => item.label)}
          maxValue={maxValue}
          lines={series}
          selectedMetric={selectedMetric}
          currencySymbol={currencySymbol}
        />
      </div>
    </section>
  );
}

function SimpleLineChart({
  labels,
  maxValue,
  lines,
  selectedMetric,
  currencySymbol,
}: {
  labels: string[];
  maxValue: number;
  lines: Array<{
    key: string;
    label: string;
    color: string;
    points: Array<{ label: string; value: number }>;
  }>;
  selectedMetric: TrendMetric;
  currencySymbol: string;
}) {
  const width = 720;
  const height = 220;
  const xStep = labels.length > 1 ? width / (labels.length - 1) : width;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{metricLabel(selectedMetric)}</span>
        <span>Max: {formatMetric(maxValue, selectedMetric, currencySymbol)}</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} 240`} className="h-60 min-w-[700px] w-full" role="img" aria-label="Performance trend chart">
          <line x1="0" y1={height} x2={width} y2={height} stroke="var(--border)" />
          {lines.map((line) => {
            const path = line.points
              .map((point, index) => {
                const x = index * xStep;
                const y = height - (point.value / maxValue) * height;
                return `${index === 0 ? "M" : "L"} ${x} ${y}`;
              })
              .join(" ");

            return (
              <path
                key={line.key}
                d={path}
                fill="none"
                stroke={line.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {lines.map((line) => (
          <span key={line.key} className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
            {line.label}
          </span>
        ))}
      </div>

      <div
        className="grid gap-1 text-xs text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
      >
        {labels.map((label) => (
          <span key={label} className="text-center">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function getMetricValue(point: TrendPoint, metric: TrendMetric) {
  if (metric === "revenue") return { label: point.label, value: point.revenue };
  if (metric === "spend") return { label: point.label, value: point.spend };
  if (metric === "purchases") return { label: point.label, value: point.purchases };

  const roas = point.spend > 0 ? point.revenue / point.spend : 0;
  return { label: point.label, value: Number(roas.toFixed(2)) };
}

function buildPlatformSeries(baseSeries: TrendPoint[], metric: TrendMetric) {
  const weights: Record<string, number> = {
    meta: 0.31,
    google: 0.36,
    tiktok: 0.15,
    pinterest: 0.1,
    snapchat: 0.08,
  };

  return Object.entries(weights).map(([platform, weight], index) => ({
    key: platform,
    label: capitalize(platform),
    color: PLATFORM_COLORS[platform],
    points: baseSeries.map((point, pointIndex) => {
      const base = getMetricValue(point, metric).value;
      const wave = 1 + ((pointIndex + index) % 3) * 0.04;
      return {
        label: point.label,
        value: Number((base * weight * wave).toFixed(2)),
      };
    }),
  }));
}

function metricLabel(metric: TrendMetric) {
  if (metric === "revenue") return "Revenue";
  if (metric === "spend") return "Spend";
  if (metric === "purchases") return "Purchases";
  return "ROAS";
}

function formatMetric(value: number, metric: TrendMetric, currencySymbol: string) {
  if (metric === "revenue" || metric === "spend") {
    return `${currencySymbol}${Math.round(value).toLocaleString()}`;
  }
  if (metric === "purchases") {
    return Math.round(value).toLocaleString();
  }
  return value.toFixed(2);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
