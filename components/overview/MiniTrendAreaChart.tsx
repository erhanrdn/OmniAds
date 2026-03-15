"use client";

import { useId } from "react";
import type { OverviewMetricCardData } from "@/src/types/models";

export function MiniTrendAreaChart({
  data,
  tone,
  loading = false,
  className = "h-12 w-full",
}: {
  data: number[];
  tone: OverviewMetricCardData["trendDirection"];
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
  }

  if (!data || data.length < 2) {
    return <div className={`rounded-lg bg-slate-100/70 ${className}`} />;
  }

  const width = 160;
  const height = 52;
  const padding = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const gradientId = useId();

  const points = data.map((point, index) => {
    const x = padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((point - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePath = createSmoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
  const stroke =
    tone === "up" ? "#10b981" : tone === "down" ? "#f43f5e" : "#64748b";
  const fill =
    tone === "up" ? "rgba(16, 185, 129, 0.16)" : tone === "down" ? "rgba(244, 63, 94, 0.14)" : "rgba(100, 116, 139, 0.12)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
