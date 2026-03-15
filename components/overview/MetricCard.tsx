"use client";

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
import { MiniTrendAreaChart } from "@/components/overview/MiniTrendAreaChart";
import { MetricSourceLogos } from "@/components/overview/MetricSourceLogos";
import { ArrowDownRight, ArrowUpRight, Minus, MoreHorizontal } from "lucide-react";

export function MetricCard({
  title,
  value,
  changePercent,
  trendValues,
  trendLoading = false,
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
  trendValues: number[];
  trendLoading?: boolean;
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
  const delta = resolveDelta(changePercent);
  const DeltaIcon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {title}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
            {formatValue(value, unit, currencySymbol)}
          </p>
          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${delta.className}`}
            >
              <DeltaIcon className="h-3.5 w-3.5" />
              {delta.label}
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-lg">
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

      <div className="mt-3">
        <MiniTrendAreaChart
          data={trendValues}
          tone={delta.direction === "up" ? "up" : delta.direction === "down" ? "down" : "neutral"}
          loading={trendLoading}
          className="h-12 w-full"
        />
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
  if (value === null || Number.isNaN(value)) return "\u2014";
  if (unit === "currency") return `${currencySymbol}${value.toLocaleString()}`;
  if (unit === "count") return Math.round(value).toLocaleString();
  if (unit === "ratio") return value.toFixed(2);
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "duration_seconds") return `${Math.round(value)}s`;
  return String(value);
}

function resolveDelta(changePercent: number | null) {
  const value = changePercent ?? 0;
  if (value > 0) {
    return {
      direction: "up" as const,
      label: `+${value.toFixed(1)}%`,
      className: "bg-emerald-500/10 text-emerald-600",
    };
  }
  if (value < 0) {
    return {
      direction: "down" as const,
      label: `${value.toFixed(1)}%`,
      className: "bg-rose-500/10 text-rose-600",
    };
  }
  return {
    direction: "neutral" as const,
    label: "+0.0%",
    className: "bg-slate-200/70 text-slate-600",
  };
}
