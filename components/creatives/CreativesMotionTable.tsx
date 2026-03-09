"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  METRIC_CONFIG,
  MetaCreativeRow,
  MetaMetricKey,
} from "@/components/creatives/metricConfig";

interface CreativesMotionTableProps {
  rows: MetaCreativeRow[];
  selectedMetrics: MetaMetricKey[];
  selectedRowIds: string[];
  highlightedRowId?: string | null;
  density: "compact" | "comfortable";
  heatmapIntensity: "low" | "medium" | "high";
  onToggleRow: (rowId: string) => void;
  onToggleAll: () => void;
  onOpenRow: (rowId: string) => void;
}

export function CreativesMotionTable({
  rows,
  selectedMetrics,
  selectedRowIds,
  highlightedRowId = null,
  density,
  heatmapIntensity,
  onToggleRow,
  onToggleAll,
  onOpenRow,
}: CreativesMotionTableProps) {
  const allSelected = rows.length > 0 && rows.every((row) => selectedRowIds.includes(row.id));

  const metricExtremes = useMemo(() => {
    return selectedMetrics.reduce<
      Record<MetaMetricKey, { min: number; max: number }>
    >((acc, metric) => {
      const values = rows.map((row) => row[metric]);
      acc[metric] = {
        min: Math.min(...values),
        max: Math.max(...values),
      };
      return acc;
    }, {} as Record<MetaMetricKey, { min: number; max: number }>);
  }, [rows, selectedMetrics]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
        <span>{selectedRowIds.length} ad groups selected</span>
      </div>

      <div className="max-h-[620px] overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b">
              <th className="w-10 px-3 py-2 text-left font-medium" />
              <th className="sticky left-0 z-20 min-w-[280px] bg-background px-3 py-2 text-left font-medium">
                Creative / Ad Name
              </th>
              <th className="min-w-[120px] px-3 py-2 text-left font-medium">Launch date</th>
              <th className="min-w-[160px] px-3 py-2 text-left font-medium">Tags</th>
              {selectedMetrics.map((metric) => (
                <th key={metric} className="min-w-[130px] px-3 py-2 text-left font-medium">
                  {METRIC_CONFIG[metric].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                id={`creative-row-${row.id}`}
                onClick={() => onOpenRow(row.id)}
                className={`cursor-pointer ${
                  highlightedRowId === row.id ? "bg-emerald-500/10 transition-colors" : ""
                }`}
              >
                <td className={`border-b px-3 ${density === "compact" ? "py-1.5" : "py-2.5"}`}>
                  <input
                    type="checkbox"
                    checked={selectedRowIds.includes(row.id)}
                    onChange={() => onToggleRow(row.id)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </td>
                <td
                  className={`sticky left-0 z-10 border-b bg-background px-3 ${
                    density === "compact" ? "py-1.5" : "py-2.5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CreativeThumb row={row} />
                    <span className="line-clamp-2">{row.name}</span>
                  </div>
                </td>
                <td className={`border-b px-3 ${density === "compact" ? "py-1.5" : "py-2.5"}`}>
                  {row.launchDate}
                </td>
                <td className={`border-b px-3 ${density === "compact" ? "py-1.5" : "py-2.5"}`}>
                  <div className="flex flex-wrap gap-1">
                    {row.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </td>
                {selectedMetrics.map((metric) => {
                  const value = row[metric];
                  const heat = getHeatColor(
                    metric,
                    value,
                    metricExtremes[metric]?.min ?? value,
                    metricExtremes[metric]?.max ?? value
                  );
                  return (
                    <td
                      key={metric}
                      className={`border-b px-3 ${
                        density === "compact" ? "py-1.5" : "py-2.5"
                      }`}
                      style={{ backgroundColor: withIntensity(heat, heatmapIntensity) }}
                    >
                      {METRIC_CONFIG[metric].format(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreativeThumb({ row }: { row: MetaCreativeRow }) {
  const candidates = [row.previewUrl, row.thumbnailUrl, row.imageUrl].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
  }, [row.id, row.previewUrl, row.thumbnailUrl, row.imageUrl]);

  const activeImage = candidates[imageIndex] ?? null;

  if (activeImage) {
    return (
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-muted/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeImage}
          alt={row.name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => {
            if (imageIndex < candidates.length - 1) {
              setImageIndex((current) => current + 1);
            } else {
              setImageIndex(candidates.length);
            }
          }}
        />
        {row.isCatalog ? (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[8px] text-white">
            Catalog
          </div>
        ) : null}
      </div>
    );
  }

  if (row.previewState === "catalog" || row.isCatalog) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted/60 text-[9px] text-muted-foreground">
        Catalog
      </div>
    );
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted/40 text-[9px] text-muted-foreground">
      Preview unavailable
    </div>
  );
}

function withIntensity(color: string, intensity: "low" | "medium" | "high") {
  const multiplier = intensity === "low" ? 0.7 : intensity === "high" ? 1.3 : 1;
  const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if (!match) return color;
  const [, r, g, b, alpha] = match;
  const nextAlpha = Math.max(0.04, Math.min(0.38, Number(alpha) * multiplier));
  return `rgba(${r}, ${g}, ${b}, ${nextAlpha.toFixed(3)})`;
}

function getHeatColor(metric: MetaMetricKey, value: number, min: number, max: number) {
  if (max <= min) return "transparent";

  const normalize = (value - min) / (max - min);
  const direction = METRIC_CONFIG[metric].goodDirection;

  if (direction === "neutral") {
    const alpha = 0.06 + normalize * 0.14;
    return `rgba(148, 163, 184, ${alpha.toFixed(3)})`;
  }

  const score = direction === "low" ? 1 - normalize : normalize;
  if (score >= 0.5) {
    const alpha = 0.08 + ((score - 0.5) / 0.5) * 0.22;
    return `rgba(16, 185, 129, ${alpha.toFixed(3)})`;
  }

  const alpha = 0.08 + ((0.5 - score) / 0.5) * 0.22;
  return `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
}
