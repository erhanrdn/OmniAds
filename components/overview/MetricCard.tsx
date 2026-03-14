"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const plotAreaRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [plotWidth, setPlotWidth] = useState(320);
  const chartHeight = 84;
  const chartPadding = { top: 6, right: 4, bottom: 6, left: 4 };
  const yAxisWidth = 44;
  const tooltipWidth = 188;

  useEffect(() => {
    const node = plotAreaRef.current;
    if (!node) return;

    const update = () => {
      const width = Math.max(Math.round(node.getBoundingClientRect().width), 180);
      setPlotWidth(width);
    };

    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const chartPoints = useMemo(() => {
    if (trendData.length === 0) return [];
    const min = Math.min(...trendData.map((point) => point.value));
    const max = Math.max(...trendData.map((point) => point.value));
    const range = max - min || 1;
    const drawableWidth = plotWidth - chartPadding.left - chartPadding.right;
    const drawableHeight = chartHeight - chartPadding.top - chartPadding.bottom;
    return trendData.map((point, index) => ({
      ...point,
      x:
        chartPadding.left +
        (index / Math.max(trendData.length - 1, 1)) *
          drawableWidth,
      y:
        chartHeight -
        chartPadding.bottom -
        ((point.value - min) / range) * drawableHeight,
    }));
  }, [chartHeight, chartPadding.bottom, chartPadding.left, chartPadding.right, chartPadding.top, plotWidth, trendData]);

  const path = useMemo(() => createSmoothPath(chartPoints), [chartPoints]);
  const activePoint = hoverIndex !== null ? chartPoints[hoverIndex] : null;
  const activePctChange =
    activePoint && hoverIndex !== null && hoverIndex > 0
      ? calculateDayOverDayPct(activePoint.value, chartPoints[hoverIndex - 1].value)
      : null;
  const yTicks = useMemo(
    () => buildYAxisTicks(trendData, chartHeight, chartPadding),
    [chartHeight, chartPadding, trendData]
  );
  const xTicks = useMemo(() => buildXAxisTicks(trendData), [trendData]);
  const tooltipLeft = useMemo(() => {
    if (!activePoint) return 0;
    const rawLeft = yAxisWidth + activePoint.x - tooltipWidth / 2;
    return Math.max(0, Math.min(rawLeft, yAxisWidth + plotWidth - tooltipWidth));
  }, [activePoint, plotWidth]);

  const handlePointerMove = (clientX: number) => {
    const bounds = plotAreaRef.current?.getBoundingClientRect();
    if (!bounds || chartPoints.length === 0) return;
    const boundedClientX = Math.max(bounds.left, Math.min(clientX, bounds.right));
    const relativeX = ((boundedClientX - bounds.left) / bounds.width) * plotWidth;
    const nearestIndex = chartPoints.reduce((bestIndex, point, index, points) => {
      const bestDistance = Math.abs(points[bestIndex].x - relativeX);
      const currentDistance = Math.abs(point.x - relativeX);
      return currentDistance < bestDistance ? index : bestIndex;
    }, 0);
    setHoverIndex(nearestIndex);
  };

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

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#fbfdff_0%,#f8fafc_100%)] p-3">
        {chartPoints.length > 1 ? (
          <div className="relative">
            <div className="flex items-start gap-2">
              <div className="pointer-events-none flex h-[84px] w-11 flex-col justify-between pt-1 text-[10px] text-slate-400">
                {yTicks.map((tick) => (
                  <span key={tick.label}>{formatAxisValue(tick.value, unit, currencySymbol)}</span>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  ref={plotAreaRef}
                  className="relative h-[84px] w-full"
                  onMouseMove={(event) => handlePointerMove(event.clientX)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <svg
                    viewBox={`0 0 ${plotWidth} ${chartHeight}`}
                    className="h-[84px] w-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    {yTicks.map((tick) => (
                      <line
                        key={`grid-${tick.label}`}
                        x1={chartPadding.left}
                        x2={plotWidth - chartPadding.right}
                        y1={tick.y}
                        y2={tick.y}
                        stroke="#E7EDF5"
                        strokeWidth="1"
                        strokeDasharray="2 5"
                      />
                    ))}
                    <path
                      d={path}
                      fill="none"
                      stroke="#475569"
                      strokeWidth="2.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {activePoint ? (
                      <line
                        x1={activePoint.x}
                        x2={activePoint.x}
                        y1={chartPadding.top}
                        y2={chartHeight - chartPadding.bottom}
                        stroke="#CBD5E1"
                        strokeWidth="1"
                        strokeDasharray="2 4"
                      />
                    ) : null}
                    {chartPoints.map((point, index) => (
                      <circle
                        key={`${point.date}-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={hoverIndex === index ? 4.5 : 2.5}
                        fill={hoverIndex === index ? "#2563EB" : "#64748B"}
                        stroke={hoverIndex === index ? "#DBEAFE" : "#F8FAFC"}
                        strokeWidth={hoverIndex === index ? "2" : "1.25"}
                        opacity={hoverIndex === null || hoverIndex === index ? 1 : 0.72}
                      />
                    ))}
                  </svg>
                </div>
              </div>
            </div>
            {activePoint ? (
              <div
                className="pointer-events-none absolute top-1 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm"
                style={{ left: tooltipLeft, width: tooltipWidth }}
              >
                <p className="font-medium text-slate-900">{formatTooltipDate(activePoint.date)}</p>
                <p className="text-slate-700">
                  {title} {formatValue(activePoint.value, unit, currencySymbol)}
                </p>
                <p className="text-slate-500">
                  {activePctChange === null
                    ? "No prior day"
                    : `${activePctChange >= 0 ? "+" : ""}${activePctChange.toFixed(1)}% vs previous day`}
                </p>
              </div>
            ) : null}
            <div className="mt-2 ml-[52px] grid grid-cols-3 text-[10px] text-slate-400">
              {xTicks.map((tick, index) => (
                <span
                  key={`${tick.date}-${tick.label}`}
                  className={
                    index === 0 ? "text-left" : index === xTicks.length - 1 ? "text-right" : "text-center"
                  }
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-[84px] rounded-xl bg-slate-100" />
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

function calculateDayOverDayPct(
  currentValue: number,
  previousValue: number,
) {
  if (previousValue === 0) return currentValue === 0 ? 0 : null;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

function createSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = current.x + (next.x - current.x) / 2;
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}

function buildYAxisTicks(
  data: MetricTrendPoint[],
  chartHeight: number,
  chartPadding: { top: number; right: number; bottom: number; left: number }
) {
  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = min + (max - min) / 2;
  const bottomY = chartHeight - chartPadding.bottom;
  const topY = chartPadding.top;
  const midY = topY + (bottomY - topY) / 2;

  return [
    { value: max, label: "max", y: topY },
    { value: mid, label: "mid", y: midY },
    { value: min, label: "min", y: bottomY },
  ];
}

function buildXAxisTicks(data: MetricTrendPoint[]) {
  if (data.length === 0) return [];
  const indices = Array.from(new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]));
  return indices.map((index) => ({
    date: data[index].date,
    label: formatAxisDate(data[index].date),
  }));
}

function formatAxisDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTooltipDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatAxisValue(
  value: number,
  unit: "currency" | "count" | "ratio" | "percent" | "duration_seconds",
  currencySymbol: string
) {
  const absoluteValue = Math.abs(value);
  if (unit === "currency") {
    if (absoluteValue >= 1000) return `${currencySymbol}${Math.round(absoluteValue).toLocaleString()}`;
    return `${currencySymbol}${absoluteValue.toFixed(0)}`;
  }
  if (unit === "count") return Math.round(absoluteValue).toLocaleString();
  if (unit === "ratio") return absoluteValue.toFixed(1);
  if (unit === "percent") return `${absoluteValue.toFixed(0)}%`;
  if (unit === "duration_seconds") return `${absoluteValue.toFixed(0)}s`;
  return absoluteValue.toFixed(1);
}
