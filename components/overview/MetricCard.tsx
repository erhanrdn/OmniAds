"use client";

import { useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MetricSourceLogos } from "@/components/overview/MetricSourceLogos";
import { MoreHorizontal } from "lucide-react";

export interface MetricTrendPoint {
  date: string;
  value: number;
}

export function MetricCard({
  title,
  value,
  changePercent,
  trendData,
  dataSource,
  sourceKey,
  businessId,
  metricKey,
  unit,
  currencySymbol,
  helperText,
  replaceOptions = [],
  onRemove,
  onReplace,
  onViewBreakdown,
  onMoveLeft,
  onMoveRight,
}: {
  title: string;
  value: number | null;
  changePercent: number | null;
  trendData: MetricTrendPoint[];
  dataSource: string;
  sourceKey?: string;
  businessId?: string;
  metricKey: string;
  unit: "currency" | "count" | "ratio" | "percent" | "duration_seconds";
  currencySymbol: string;
  helperText?: string;
  replaceOptions?: Array<{ key: string; title: string }>;
  onRemove?: (metricKey: string) => void;
  onReplace?: (metricKey: string, nextMetricKey: string) => void;
  onViewBreakdown?: (metricKey: string) => void;
  onMoveLeft?: (metricKey: string) => void;
  onMoveRight?: (metricKey: string) => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartPoints = useMemo(() => {
    if (trendData.length === 0) return [];
    const width = 192;
    const height = 56;
    const min = Math.min(...trendData.map((point) => point.value));
    const max = Math.max(...trendData.map((point) => point.value));
    const range = max - min || 1;
    return trendData.map((point, index) => ({
      ...point,
      x: (index / Math.max(trendData.length - 1, 1)) * width,
      y: height - ((point.value - min) / range) * (height - 8) - 4,
    }));
  }, [trendData]);

  const path = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const activePoint = hoverIndex !== null ? chartPoints[hoverIndex] : null;
  const activeChange =
    activePoint && hoverIndex !== null && hoverIndex > 0
      ? activePoint.value - chartPoints[hoverIndex - 1].value
      : null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {title}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {formatValue(value, unit, currencySymbol)}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">{formatChange(changePercent)}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Metric actions</DropdownMenuLabel>
            {onRemove ? (
              <DropdownMenuItem onClick={() => onRemove(metricKey)}>Remove from Pins</DropdownMenuItem>
            ) : null}
            {replaceOptions.length > 0 && onReplace ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Change metric</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {replaceOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.key}
                      onClick={() => onReplace(metricKey, option.key)}
                    >
                      {option.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuSeparator />
            {onMoveLeft ? (
              <DropdownMenuItem onClick={() => onMoveLeft(metricKey)}>Move left</DropdownMenuItem>
            ) : null}
            {onMoveRight ? (
              <DropdownMenuItem onClick={() => onMoveRight(metricKey)}>Move right</DropdownMenuItem>
            ) : null}
            {onViewBreakdown ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onViewBreakdown(metricKey)}>
                  View breakdown
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
        {chartPoints.length > 1 ? (
          <div className="relative">
            <svg viewBox="0 0 192 56" className="h-16 w-full overflow-visible">
              <path d={path} fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
              {chartPoints.map((point, index) => (
                <circle
                  key={`${point.date}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={hoverIndex === index ? 4 : 3}
                  fill={hoverIndex === index ? "#2563eb" : "#0f172a"}
                  onMouseEnter={() => setHoverIndex(index)}
                  onMouseLeave={() => setHoverIndex((current) => (current === index ? null : current))}
                />
              ))}
            </svg>
            {activePoint ? (
              <div className="absolute left-2 top-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                <p className="font-medium text-slate-900">{activePoint.date}</p>
                <p className="text-slate-700">{formatValue(activePoint.value, unit, currencySymbol)}</p>
                <p className="text-slate-500">
                  {activeChange === null
                    ? "No prior day"
                    : `${activeChange >= 0 ? "+" : ""}${formatChangeValue(activeChange, unit, currencySymbol)} vs prev day`}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="h-16 rounded-xl bg-slate-100" />
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="space-y-1 text-xs">
          {helperText ? <p className="text-slate-500">{helperText}</p> : null}
        </div>
        <MetricSourceLogos
          sourceKey={sourceKey}
          sourceLabel={dataSource}
          businessId={businessId}
        />
      </div>
    </article>
  );
}

function formatValue(
  value: number | null,
  unit: "currency" | "count" | "ratio" | "percent" | "duration_seconds",
  currencySymbol: string
) {
  if (value === null || Number.isNaN(value)) return "Unavailable";
  if (unit === "currency") return `${currencySymbol}${value.toLocaleString()}`;
  if (unit === "count") return Math.round(value).toLocaleString();
  if (unit === "ratio") return value.toFixed(2);
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "duration_seconds") return `${Math.round(value)}s`;
  return String(value);
}

function formatChange(changePercent: number | null) {
  if (changePercent === null) return "No comparison";
  if (changePercent === 0) return "Flat vs previous period";
  return `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}% vs previous period`;
}

function formatChangeValue(
  value: number,
  unit: "currency" | "count" | "ratio" | "percent" | "duration_seconds",
  currencySymbol: string
) {
  if (unit === "currency") return `${currencySymbol}${Math.abs(value).toFixed(2)}`;
  if (unit === "count") return Math.abs(value).toFixed(0);
  if (unit === "ratio") return Math.abs(value).toFixed(2);
  if (unit === "percent") return `${Math.abs(value).toFixed(1)}%`;
  if (unit === "duration_seconds") return `${Math.abs(value).toFixed(0)}s`;
  return Math.abs(value).toFixed(2);
}
