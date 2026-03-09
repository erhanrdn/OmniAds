"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  METRIC_CONFIG,
  MetaCreativeRow,
  MetaMetricKey,
} from "@/components/creatives/metricConfig";

// Görsel boyutu ve yuvarlaklığı için sabitler (Ekran görüntüsündeki gibi)
const THUMB_SIZE = "h-10 w-10"; // Tablo için ideal boyut

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
      const values = rows.map((row) => row[metric] || 0);
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
          className="rounded border-gray-300" 
          checked={allSelected} 
          onChange={onToggleAll} 
        />
        <span className="text-muted-foreground font-medium">{selectedRowIds.length} ad groups selected</span>
      </div>

      <div className="max-h-[620px] overflow-auto rounded-xl border border-border/60 shadow-sm">
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
                    onChange={() => onToggleRow(row.id)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </td>
                <td
                  className={`sticky left-0 z-10 bg-background group-hover:bg-muted/30 transition-colors px-4 ${
                    density === "compact" ? "py-2" : "py-4"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Kreatif Ön İzleme Görseli */}
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
                  const value = row[metric] || 0;
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

function normalizeCompactThumbSrc(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function isMetaCdnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("fbcdn.net") || host.includes("facebook.com") || host.includes("fbsbx.com") || host.includes("cdninstagram.com");
  } catch {
    return false;
  }
}

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
  // Öncelik: Thumbnail -> Image -> Preview
  const sources = useMemo(() => [thumbnailUrl, imageUrl, previewUrl]
    .map(normalizeCompactThumbSrc)
    .filter((value): value is string => Boolean(value)), [thumbnailUrl, imageUrl, previewUrl]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [useProxy, setUseProxy] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setUseProxy(false);
    setHasError(false);
  }, [id, sources.length]);

  const activeSource = sources[sourceIndex] ?? null;

  // Görsel yoksa veya tüm kaynaklar tükendiyse "Placeholder" göster
  if (!activeSource || hasError) {
    return (
      <div className={`${THUMB_SIZE} shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center border border-border/40`}>
        <svg className="w-4 h-4 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.587-1.587a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  // Meta CDN proxy desteği
  const imgSrc = useProxy && isMetaCdnUrl(activeSource)
    ? `/api/media/meta-preview?src=${encodeURIComponent(activeSource)}`
    : activeSource;

  const handleError = () => {
    if (!useProxy && isMetaCdnUrl(activeSource)) {
      setUseProxy(true);
      return;
    }
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((prev) => prev + 1);
      setUseProxy(false);
    } else {
      setHasError(true);
    }
  };

  return (
    <div className={`${THUMB_SIZE} shrink-0 overflow-hidden rounded-lg bg-muted border border-border/20 shadow-sm`}>
      <img
        key={`${id}_${sourceIndex}_${useProxy}`}
        src={imgSrc}
        alt={name}
        className="h-full w-full object-cover transition-opacity duration-300"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={handleError}
      />
    </div>
  );
}

// Helper functions (withIntensity, getHeatColor) aynı kalabilir...