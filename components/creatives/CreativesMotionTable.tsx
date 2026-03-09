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
          className="rounded border-gray-300 shadow-sm cursor-pointer"
          checked={allSelected} 
          onChange={onToggleAll} 
        />
        <span className="text-muted-foreground font-medium">{selectedRowIds.length} ad groups selected</span>
      </div>

      <div className="max-h-[620px] overflow-auto rounded-xl border border-border shadow-sm bg-background">
        <table className="min-w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
            <tr className="border-b">
              <th className="w-10 px-4 py-3 text-left border-b" />
              <th className="sticky left-0 z-40 min-w-[280px] bg-background px-4 py-3 text-left font-semibold border-b">
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
            {rows.map((row: any) => (
              <tr
                key={row.id}
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
                <td className={`sticky left-0 z-20 bg-background group-hover:bg-muted/30 transition-colors px-4 ${density === "compact" ? "py-2" : "py-4"}`}>
                  <div className="flex items-center gap-3">
                    
                    {/* SAF GÖRSEL (THUMBNAIL) BİLEŞENİ */}
                    <CreativeImageOnly row={row} />
                    
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-foreground tracking-tight">{row.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                         <span className="capitalize">
                           {row.is_catalog || row.isCatalog ? "Catalog" : row.format || "Static"}
                         </span>
                        {(row.associated_ads_count || row.associatedAdsCount) > 1 && (
                          <span className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                            {row.associated_ads_count || row.associatedAdsCount} ads
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 text-muted-foreground whitespace-nowrap">{row.launch_date || row.launchDate}</td>
                <td className="px-4">
                  <div className="flex flex-wrap gap-1">
                    {(row.tags || []).slice(0, 2).map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </td>
                {selectedMetrics.map((metric) => {
                  const value = Number(row[metric]) || 0;
                  const heat = getHeatColor(metric, value, metricExtremes[metric]?.min ?? 0, metricExtremes[metric]?.max ?? 0);
                  return (
                    <td key={metric} className="px-4 font-medium" style={{ backgroundColor: withIntensity(heat, heatmapIntensity) }}>
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
 * HTML/Iframe kullanmadan sadece görsel URL'lerini kovalayan bileşen
 */
function CreativeImageOnly({ row }: { row: any }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // API'den gelebilecek tüm görsel ihtimalleri
  const urls = useMemo(() => {
    const list = [
      row.thumbnail_url,
      row.image_url,
      row.preview?.image_url,
      row.preview?.poster_url, // Videolar için poster görseli
      row.imageUrl,
      row.thumbnailUrl
    ].filter((u): u is string => Boolean(u) && typeof u === 'string' && u.includes('http'));

    // Protokol düzeltme (// ile başlıyorsa https ekle)
    return list.map(u => u.startsWith('//') ? `https:${u}` : u);
  }, [row]);

  useEffect(() => {
    setImgSrc(urls.length > 0 ? urls[0] : null);
    setAttempt(0);
  }, [urls]);

  const handleError = () => {
    if (attempt < urls.length - 1) {
      setAttempt(prev => prev + 1);
      setImgSrc(urls[attempt + 1]);
    } else {
      setImgSrc("error");
    }
  };

  if (!imgSrc || imgSrc === "error") {
    return (
      <div className="h-10 w-10 shrink-0 rounded-md bg-zinc-100 border border-zinc-200 flex items-center justify-center">
        {/* Görsel bulunamadığında çıkan şık bir placeholder */}
        <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.587-1.587a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border/40 bg-zinc-50 flex items-center justify-center shadow-sm">
      <img
        src={imgSrc}
        alt=""
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
        onError={handleError}
        loading="lazy"
      />
    </div>
  );
}

// Yardımcı Fonksiyonlar (Aynı kalmalı)
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