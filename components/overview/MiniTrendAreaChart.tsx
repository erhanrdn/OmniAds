"use client";

import React, { useMemo, useState } from "react";
import type { PointerEvent } from "react";
import type { OverviewMetricCardData } from "@/src/types/models";

const CHART_WIDTH = 160;
const CHART_HEIGHT = 52;
const CHART_PADDING = 4;

export function MiniTrendAreaChart({
  data,
  tone: _tone,
  loading = false,
  className = "h-12 w-full",
  valueFormatter,
}: {
  data: Array<{ date: string; value: number }>;
  tone: OverviewMetricCardData["trendDirection"];
  loading?: boolean;
  className?: string;
  valueFormatter?: (value: number) => string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = useMemo(() => {
    if (!data || data.length < 2) return [];

    const values = data.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    return data.map((point, index) => {
      const x =
        CHART_PADDING +
        (index / Math.max(data.length - 1, 1)) * (CHART_WIDTH - CHART_PADDING * 2);
      const y =
        CHART_HEIGHT -
        CHART_PADDING -
        ((point.value - min) / range) * (CHART_HEIGHT - CHART_PADDING * 2);

      return { x, y, value: point.value, date: point.date, index };
    });
  }, [data]);

  if (loading) {
    return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
  }

  if (!data || data.length < 2 || points.length < 2) {
    return <div className={className} aria-hidden="true" />;
  }

  const activeIndex = hoverIndex ?? points.length - 1;
  const activePoint = points[activeIndex];
  const linePath = createSmoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${CHART_HEIGHT - CHART_PADDING} L ${points[0].x} ${CHART_HEIGHT - CHART_PADDING} Z`;
  const activeLabel = formatPointLabel(activePoint.date);
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
              y1={CHART_PADDING}
              y2={CHART_HEIGHT - CHART_PADDING}
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

function formatCompactValue(value: number) {
  if (Number.isNaN(value)) return "\u2014";
  if (Math.abs(value) >= 1000) return value.toLocaleString();
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function formatPointLabel(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
    }
  }
  return value;
}
