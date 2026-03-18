"use client";

import React, { useMemo, useState } from "react";
import type { PointerEvent } from "react";
import type { OverviewMetricCardData } from "@/src/types/models";

const CHART_WIDTH = 160;
const CHART_HEIGHT = 52;
const PLOT_LEFT = 4;
const PLOT_RIGHT = 4;
const PLOT_TOP = 4;
const PLOT_BOTTOM = 4;

type ChartUnit = OverviewMetricCardData["unit"] | "unknown";
type DateLabelMode = "auto" | "day" | "month";

export function MiniTrendAreaChart({
  data,
  tone: _tone,
  unit = "unknown",
  loading = false,
  className = "h-12 w-full",
  valueFormatter,
  dateLabelMode = "auto",
}: {
  data: Array<{ date: string; value: number }>;
  tone: OverviewMetricCardData["trendDirection"];
  unit?: ChartUnit;
  loading?: boolean;
  className?: string;
  valueFormatter?: (value: number) => string;
  dateLabelMode?: DateLabelMode;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const series = useMemo(() => {
    if (!data || data.length < 2) return [];

    const values = data.map((point) =>
      Number.isFinite(point.value) ? point.value : 0
    );
    const smoothed = smoothSeries(values, 0.32);

    return data.map((point, index) => ({
      date: point.date,
      raw: values[index],
      smooth: smoothed[index],
      index,
    }));
  }, [data]);

  const domain = useMemo(
    () => resolveDomain(series.map((item) => item.smooth), unit),
    [series, unit]
  );

  const points = useMemo(() => {
    if (series.length < 2) return [];

    const min = domain.min;
    const max = domain.max;
    const range = max - min || 1;
    const plotWidth = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
    const plotHeight = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;

    return series.map((item, index) => {
      const x =
        PLOT_LEFT +
        (index / Math.max(series.length - 1, 1)) * plotWidth;
      const clampedValue = Math.min(Math.max(item.smooth, min), max);
      const y =
        PLOT_TOP +
        (1 - (clampedValue - min) / range) * plotHeight;

      return { x, y, value: item.raw, date: item.date, index };
    });
  }, [domain.max, domain.min, series]);

  if (loading) {
    return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
  }

  if (!data || data.length < 2 || points.length < 2) {
    return <div className={className} aria-hidden="true" />;
  }

  const activeIndex = hoverIndex ?? points.length - 1;
  const activePoint = points[activeIndex];
  const linePath = createPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${CHART_HEIGHT - PLOT_BOTTOM} L ${points[0].x} ${CHART_HEIGHT - PLOT_BOTTOM} Z`;
  const activeLabel = formatPointLabel(activePoint.date, dateLabelMode);
  const formattedValue = valueFormatter
    ? valueFormatter(activePoint.value)
    : formatCompactValue(activePoint.value);

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    const nextIndex = points.reduce((bestIndex, point, index, chartPoints) => {
      const bestDistance = Math.abs(chartPoints[bestIndex].x - x);
      const currentDistance = Math.abs(point.x - x);
      return currentDistance < bestDistance ? index : bestIndex;
    }, 0);
    setHoverIndex(nextIndex);
  };

  // Position tooltip horizontally above the active point, clamped so it
  // never overflows the left or right edge of the chart area.
  const xPercent = (activePoint.x / CHART_WIDTH) * 100;
  const tooltipStyle: React.CSSProperties =
    xPercent > 65
      ? { right: 0 }
      : xPercent < 15
        ? { left: 0 }
        : { left: `${xPercent}%`, transform: "translateX(-50%)" };

  return (
    <div className="relative overflow-visible">
      {hoverIndex !== null ? (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-1.5 min-w-[7rem] rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-md shadow-slate-200/70 backdrop-blur-sm"
          style={tooltipStyle}
        >
          <p className="font-medium text-slate-500">{activeLabel}</p>
          <p className="mt-0.5 font-semibold text-slate-950">{formattedValue}</p>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={className}
        preserveAspectRatio="none"
        aria-hidden="true"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <line
          x1={PLOT_LEFT}
          x2={CHART_WIDTH - PLOT_RIGHT}
          y1={PLOT_TOP + (CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM) * 0.5}
          y2={PLOT_TOP + (CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM) * 0.5}
          stroke="#f1f5f9"
          strokeWidth="1"
        />
        <line
          x1={PLOT_LEFT}
          x2={PLOT_LEFT}
          y1={PLOT_TOP}
          y2={CHART_HEIGHT - PLOT_BOTTOM}
          stroke="#e2e8f0"
          strokeWidth="1"
        />
        <line
          x1={PLOT_LEFT}
          x2={CHART_WIDTH - PLOT_RIGHT}
          y1={CHART_HEIGHT - PLOT_BOTTOM}
          y2={CHART_HEIGHT - PLOT_BOTTOM}
          stroke="#e2e8f0"
          strokeWidth="1"
        />
        <path d={areaPath} fill="#3b82f6" fillOpacity="0.15" />
        <path
          d={linePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hoverIndex !== null ? (
          <>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={PLOT_TOP}
              y2={CHART_HEIGHT - PLOT_BOTTOM}
              stroke="#cbd5e1"
              strokeDasharray="2 4"
              strokeWidth="1"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="3"
              fill="#ffffff"
              stroke="#3b82f6"
              strokeWidth="2"
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function createPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const next = points[index + 1];
    path += ` L ${next.x} ${next.y}`;
  }
  return path;
}

function smoothSeries(values: number[], alpha = 0.32) {
  if (values.length === 0) return [];
  const output: number[] = [];
  let prev = values[0];

  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    if (index === 0) {
      output.push(current);
      continue;
    }
    prev = alpha * current + (1 - alpha) * prev;
    output.push(prev);
  }

  return output;
}

function resolveDomain(values: number[], unit: ChartUnit) {
  if (values.length === 0) {
    return { min: 0, max: 1 };
  }

  const maxValue = Math.max(...values, 0);
  const minValue = Math.min(...values, 0);

  if (
    unit === "currency" ||
    unit === "count" ||
    unit === "ratio" ||
    unit === "duration_seconds"
  ) {
    return {
      min: 0,
      max: maxValue > 0 ? maxValue * 1.1 : 1,
    };
  }

  if (unit === "percent") {
    return {
      min: 0,
      max: Math.max(100, maxValue * 1.1),
    };
  }

  const span = Math.max(Math.abs(minValue), Math.abs(maxValue), 1);
  return {
    min: -span * 1.1,
    max: span * 1.1,
  };
}

function formatCompactValue(value: number) {
  if (Number.isNaN(value)) return "\u2014";
  if (Math.abs(value) >= 1000) return value.toLocaleString();
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function formatPointLabel(value: string, mode: DateLabelMode = "auto") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      if (mode === "month") {
        return new Intl.DateTimeFormat("en-US", {
          month: "short",
          year: "numeric",
        }).format(date);
      }
      if (mode === "day") {
        return new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
        }).format(date);
      }
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
    }
  }
  return value;
}
