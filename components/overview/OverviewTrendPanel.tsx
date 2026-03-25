"use client";

import { cn } from "@/lib/utils";
import { DataEmptyState } from "@/components/states/DataEmptyState";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { usePreferencesStore } from "@/store/preferences-store";

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
  currencySymbol: string;
  isLoading?: boolean;
}

const WINDOW_OPTIONS: TrendWindow[] = ["7d", "14d", "30d", "custom"];

export function OverviewTrendPanel({
  dataByWindow,
  selectedWindow,
  onWindowChange,
  selectedMetric,
  onMetricChange,
  currencySymbol,
  isLoading = false,
}: OverviewTrendPanelProps) {
  const language = usePreferencesStore((state) => state.language);
  const baseSeries = dataByWindow[selectedWindow];

  const series = [
    {
      key: selectedMetric,
      label: metricLabel(selectedMetric, language),
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
          <h2 className="text-lg font-semibold tracking-tight">{language === "tr" ? "Performans Trendleri" : "Performance Trends"}</h2>
          <p className="text-sm text-muted-foreground">
            {language === "tr" ? "Secilen metrik ve tarih araligi icin trend gorunumu" : "Trend view for selected metric and date range"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMetric}
            onChange={(event) => onMetricChange(event.target.value as TrendMetric)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="revenue">{language === "tr" ? "Gelir" : "Revenue"}</option>
            <option value="spend">Spend</option>
            <option value="roas">ROAS</option>
            <option value="purchases">{language === "tr" ? "Satin Almalar" : "Purchases"}</option>
          </select>
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

      {isLoading ? <LoadingSkeleton rows={1} /> : null}

      {!isLoading && baseSeries.length === 0 ? (
        <div className="mt-4">
          <DataEmptyState
            title={language === "tr" ? "Henuz trend verisi yok" : "No trend data yet"}
            description={
              language === "tr"
                ? "Performans veri senkronizasyonu tamamlandiginda trend gorunumu belirecek."
                : "Trend visualization will appear after performance data sync completes."
            }
          />
        </div>
      ) : null}

      {!isLoading && baseSeries.length > 0 ? (
        <div className="mt-4 rounded-xl border bg-background p-4">
          <SimpleLineChart
            labels={baseSeries.map((item) => item.label)}
            maxValue={maxValue}
            lines={series}
            selectedMetric={selectedMetric}
            currencySymbol={currencySymbol}
            language={language}
          />
        </div>
      ) : null}
    </section>
  );
}

function SimpleLineChart({
  labels,
  maxValue,
  lines,
  selectedMetric,
  currencySymbol,
  language,
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
  language: "en" | "tr";
}) {
  const width = 720;
  const height = 220;
  const xStep = labels.length > 1 ? width / (labels.length - 1) : width;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{metricLabel(selectedMetric, language)}</span>
        <span>{language === "tr" ? "Maks" : "Max"}: {formatMetric(maxValue, selectedMetric, currencySymbol)}</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} 240`} className="h-60 min-w-[700px] w-full" role="img" aria-label={language === "tr" ? "Performans trend grafigi" : "Performance trend chart"}>
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

function metricLabel(metric: TrendMetric, language: "en" | "tr") {
  if (metric === "revenue") return language === "tr" ? "Gelir" : "Revenue";
  if (metric === "spend") return "Spend";
  if (metric === "purchases") return language === "tr" ? "Satin Almalar" : "Purchases";
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
