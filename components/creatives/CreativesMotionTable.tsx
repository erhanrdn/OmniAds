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
      const values = rows.map((row) => Number(row[metric]) || 0);
      acc[metric] = {
        min: Math.min(...values),
        max: Math.max(...values),
      };
      return acc;
    }, {} as Record<MetaMetricKey, { min: number; max: number }>);
  }, [rows, selectedMetrics]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm px-1">
        <input 
          type="checkbox" 
          className="rounded border-gray-300 shadow-sm"
          checked={allSelected} 
          onChange={onToggleAll} 
        />
        <span className="text-muted-foreground font-medium">{selectedRowIds.length} ad groups selected</span>
      </div>

      <div className="max-h-[620px] overflow-auto rounded-xl border border-border shadow-sm bg-background">
        <table className="min-w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm">
            <tr className="border-b">
              <th className="w-10 px-4 py-3 text-left font-medium border-b" />
              <th className="sticky left-0 z-30 min-w-[280px] bg-background px-4 py-3 text-left font-semibold border-b">
                Creative / Ad Name
              </th>
              <th className="min-w-[120px] px-4 py-3 text-left font-medium text-muted-foreground border-b">Launch date</th>
              <th className="min-w-[160px] px-4 py-3 text-left font-medium text-muted-foreground border-b">Tags</th>
              {selectedMetrics.map((metric) => (
                <th key={metric} className="min-w-[130px] px-4 py-3 text-left font-medium text-muted-foreground border-b">
                  {METRIC_CONFIG[metric].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((row) => (
              <tr
                key={row.id}
                id={`creative-row-${row.id}`}
                onClick={() => onOpenRow(row.id)}
                className={`group cursor-pointer hover:bg-muted/30 transition-colors ${
                  highlightedRowId === row.id ? "bg-emerald-500/10" : ""
                }`}
              >
                <td className={`px-4 ${density === "compact" ? "py-2" : "py-4"}`}>
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={selectedRowIds.includes(row.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleRow(row.id);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                </td>
                <td
                  className={`sticky left-0 z-10 bg-background group-hover:bg-muted/30 transition-colors px-4 ${
                    density === "compact" ? "py-2" : "py-4"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CompactCreativeThumb
                      id={row.id}
                      name={row.name}
                      thumbnailUrl={row.thumbnailUrl}
                      imageUrl={row.imageUrl}
                      previewUrl={row.previewUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-foreground tracking-tight">{row.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                         <span className="capitalize">{row.isCatalog ? "Catalog" : row.format || "Static"}</span>
                        {row.associatedAdsCount > 1 && (
                          <span className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            {row.associatedAdsCount} ads
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 text-muted-foreground whitespace-nowrap">{row.launchDate}</td>
                <td className="px-4">
                  <div className="flex flex-wrap gap-1">
                    {row.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </td>
                {selectedMetrics.map((metric) => {
                  const value = Number(row[metric]) || 0;
                  const heat = getHeatColor(
                    metric,
                    value,
                    metricExtremes[metric]?.min ?? 0,
                    metricExtremes[metric]?.max ?? 0
                  );
                  return (
                    <td
                      key={metric}
                      className="px-4 font-medium"
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

/**
 * GÖRSEL BİLEŞENİ (THUMBNAIL)
 * Bu bileşen API'den gelen URL'leri kontrol eder ve sırayla dener.
 */
function CompactCreativeThumb({
  id,
  name,
  thumbnailUrl,
  imageUrl,
  previewUrl,
}: {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  previewUrl?: string | null;
}) {
  // Kaynak URL'leri temizle ve öncelik sırasına koy
  const sources = useMemo(() => {
    return [thumbnailUrl, imageUrl, previewUrl]
      .filter((url): url is string => Boolean(url) && typeof url === "string" && url.length > 5)
      .map(url => url.startsWith("//") ? `https:${url}` : url);
  }, [thumbnailUrl, imageUrl, previewUrl]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isError, setIsError] = useState(false);

  // Her yeni row id'si geldiğinde state'i sıfırla
  useEffect(() => {
    setCurrentIndex(0);
    setIsError(false);
  }, [id]);

  // Eğer hiç URL yoksa veya tüm kaynaklar hata verdiyse Placeholder göster
  if (sources.length === 0 || isError) {
    return (
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center border border-border/40">
        <span className="text-[8px] text-muted-foreground/50 uppercase">Img</span>
      </div>
    );
  }

  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border/20 shadow-sm bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sources[currentIndex]}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => {
          if (currentIndex < sources.length - 1) {
            setCurrentIndex(prev => prev + 1);
          } else {
            setIsError(true);
          }
        }}
      />
    </div>
  );
}

/**
 * RENK VE INTENSITY HESAPLAYICI FONKSİYONLAR
 */
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