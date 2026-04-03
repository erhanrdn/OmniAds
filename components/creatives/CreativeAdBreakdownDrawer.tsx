"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Search, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCreativeCurrency } from "@/components/creatives/money";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { CreativeRenderSurface } from "@/components/creatives/CreativeRenderSurface";
import {
  aggregateBreakdownRows,
  buildCreativeAssetFallbacks,
  BREAKDOWN_METRICS,
  DEFAULT_DRAWER_WIDTH,
  DEFAULT_METRIC_KEYS,
  fmtMetricValue,
  getActiveBreakdownMetrics,
  getCreativeAssetState,
  getAssociatedAdsCount,
  METRIC_CATEGORIES,
  METRIC_MAP,
  metricHeatBg,
  MIN_DRAWER_WIDTH,
  resolveMetricExtremes,
  sortBreakdownRows,
  type BreakdownMetricDef,
  type BreakdownRow,
  type ChartMetric,
  type MetricCategory,
  type MetricDirection,
  type MetricFormat,
} from "@/components/creatives/creative-ad-breakdown-support";
import {
  CreativeDrawerHeader,
  CreativePerformanceChart,
  CreativeSummaryCards,
} from "@/components/creatives/creative-ad-breakdown-sections";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

type CreativeAdBreakdownDrawerProps = {
  open: boolean;
  creative: MetaCreativeRow | null;
  rows: MetaCreativeRow[];
  loading?: boolean;
  defaultCurrency: string | null;
  onOpenChange: (open: boolean) => void;
};

/* ═══════════════════════════════════════════════════════════════
   Main Drawer
   ═══════════════════════════════════════════════════════════════ */

export function CreativeAdBreakdownDrawer({
  open,
  creative,
  rows,
  loading = false,
  defaultCurrency,
  onOpenChange,
}: CreativeAdBreakdownDrawerProps) {
  const [width, setWidth] = useState(DEFAULT_DRAWER_WIDTH);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("spend");
  const [activeMetricKeys, setActiveMetricKeys] = useState<string[]>(DEFAULT_METRIC_KEYS);

  const breakdownRows = rows as BreakdownRow[];
  const sortedRows = useMemo(() => [...breakdownRows].sort((a, b) => b.spend - a.spend), [breakdownRows]);
  const orderedRows = useMemo(() => sortBreakdownRows(breakdownRows, "spend", "desc"), [breakdownRows]);
  const associatedAdsCount = useMemo(() => getAssociatedAdsCount(creative, breakdownRows), [creative, breakdownRows]);

  const currency = resolveCreativeCurrency(creative?.currency, defaultCurrency);

  const aggregated = useMemo(() => aggregateBreakdownRows(orderedRows), [orderedRows]);

  // Resize handling
  useEffect(() => {
    if (!open) return;
    const onMouseMove = (event: MouseEvent) => {
      const active = resizeStateRef.current;
      if (!active) return;
      const delta = active.startX - event.clientX;
      const viewportMax = typeof window !== "undefined" ? Math.max(640, window.innerWidth - 180) : 1280;
      setWidth(Math.max(MIN_DRAWER_WIDTH, Math.min(viewportMax, active.startWidth + delta)));
    };
    const onMouseUp = () => { resizeStateRef.current = null; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  const assetFallbacks = buildCreativeAssetFallbacks(creative);

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />

      <aside
        className="absolute right-0 top-0 h-full border-l bg-background shadow-2xl"
        style={{ width }}
      >
        <button
          type="button"
          aria-label="Resize drawer"
          className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/20 transition-colors"
          onMouseDown={(event) => {
            event.preventDefault();
            resizeStateRef.current = { startX: event.clientX, startWidth: width };
          }}
        />

        <div className="flex h-full flex-col">
          <CreativeDrawerHeader
            creative={creative}
            associatedAdsCount={associatedAdsCount}
            assetFallbacks={assetFallbacks}
            onClose={() => onOpenChange(false)}
          />

          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4 p-5">
              <CreativeSummaryCards
                totalSpend={aggregated.totalSpend}
                avgRoas={aggregated.avgRoas}
                totalPurchases={aggregated.totalPurchases}
                avgCpa={aggregated.avgCpa}
                adsCount={associatedAdsCount}
                currency={currency}
                defaultCurrency={defaultCurrency}
              />

              <CreativePerformanceChart
                rows={sortedRows}
                metric={chartMetric}
                onMetricChange={setChartMetric}
                currency={currency}
                defaultCurrency={defaultCurrency}
              />

              <CreativeBreakdownTable
                rows={orderedRows}
                loading={loading}
                currency={currency}
                defaultCurrency={defaultCurrency}
                activeMetricKeys={activeMetricKeys}
                onActiveMetricKeysChange={setActiveMetricKeys}
              />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   METRIC SELECTOR PANEL
   ═══════════════════════════════════════════════════════════════ */

function MetricSelectorPanel({
  activeKeys,
  onToggle,
  onClose,
}: {
  activeKeys: Set<string>;
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const query = search.trim().toLowerCase();

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border bg-card shadow-xl"
    >
      {/* Search */}
      <div className="border-b px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
            placeholder="Search metrics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* Categories */}
      <div className="max-h-72 overflow-y-auto p-2">
        {METRIC_CATEGORIES.map((cat) => {
          const metrics = BREAKDOWN_METRICS.filter(
            (m) => m.category === cat.key && (!query || m.label.toLowerCase().includes(query) || m.shortLabel.toLowerCase().includes(query))
          );
          if (metrics.length === 0) return null;
          return (
            <div key={cat.key} className="mb-2 last:mb-0">
              <p className="mb-1 px-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {cat.label}
              </p>
              {metrics.map((m) => {
                const active = activeKeys.has(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => onToggle(m.key)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12px] transition-colors",
                      active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span className="truncate">{m.label}</span>
                    {active && (
                      <span className="ml-2 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary text-[9px] font-bold text-primary-foreground">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TABLE CONTROLS BAR
   ═══════════════════════════════════════════════════════════════ */

function TableControlsBar({
  activeMetricKeys,
  onActiveMetricKeysChange,
  density,
  onDensityChange,
}: {
  activeMetricKeys: string[];
  onActiveMetricKeysChange: (keys: string[]) => void;
  density: "compact" | "normal";
  onDensityChange: (d: "compact" | "normal") => void;
}) {
  const [showSelector, setShowSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const activeKeySet = useMemo(() => new Set(activeMetricKeys), [activeMetricKeys]);

  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettings]);

  const toggleMetric = (key: string) => {
    if (activeKeySet.has(key)) {
      onActiveMetricKeysChange(activeMetricKeys.filter((k) => k !== key));
    } else {
      onActiveMetricKeysChange([...activeMetricKeys, key]);
    }
  };

  const removeMetric = (key: string) => {
    onActiveMetricKeysChange(activeMetricKeys.filter((k) => k !== key));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Active metric chips */}
      {activeMetricKeys.map((key) => {
        const def = METRIC_MAP.get(key);
        if (!def) return null;
        return (
          <span
            key={key}
            className="group inline-flex items-center gap-1 rounded-lg border bg-muted/50 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            {def.shortLabel}
            <button
              type="button"
              onClick={() => removeMetric(key)}
              className="ml-0.5 rounded-sm opacity-50 transition-opacity hover:opacity-100"
              aria-label={`Remove ${def.shortLabel}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}

      {/* Add metric button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowSelector(!showSelector); setShowSettings(false); }}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Add metric
        </button>
        {showSelector && (
          <MetricSelectorPanel
            activeKeys={activeKeySet}
            onToggle={toggleMetric}
            onClose={() => setShowSelector(false)}
          />
        )}
      </div>

      {/* Settings */}
      <div className="relative ml-auto" ref={settingsRef}>
        <button
          type="button"
          onClick={() => { setShowSettings(!showSettings); setShowSelector(false); }}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Table settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
        {showSettings && (
          <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border bg-card p-2 shadow-xl">
            <p className="mb-1 px-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Density
            </p>
            {(["compact", "normal"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { onDensityChange(d); setShowSettings(false); }}
                className={cn(
                  "flex w-full rounded-lg px-2 py-1.5 text-[12px] capitalize transition-colors",
                  density === d ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {d}
              </button>
            ))}
            <div className="my-1.5 border-t" />
            <button
              type="button"
              onClick={() => { onActiveMetricKeysChange(DEFAULT_METRIC_KEYS); setShowSettings(false); }}
              className="flex w-full rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Reset to defaults
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BREAKDOWN TABLE
   ═══════════════════════════════════════════════════════════════ */

function CreativeBreakdownTable({
  rows,
  loading,
  currency,
  defaultCurrency,
  activeMetricKeys,
  onActiveMetricKeysChange,
}: {
  rows: BreakdownRow[];
  loading: boolean;
  currency: string | null;
  defaultCurrency: string | null;
  activeMetricKeys: string[];
  onActiveMetricKeysChange: (keys: string[]) => void;
}) {
  const [density, setDensity] = useState<"compact" | "normal">("compact");
  const [sortKey, setSortKey] = useState<string | null>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const activeMetrics = useMemo(
    () => getActiveBreakdownMetrics(activeMetricKeys),
    [activeMetricKeys]
  );

  const metricExtremes = useMemo(() => resolveMetricExtremes(rows, activeMetrics), [activeMetrics, rows]);

  const displayRows = useMemo(() => sortBreakdownRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const py = density === "compact" ? "py-1.5" : "py-2.5";
  const totalCols = 1 + activeMetrics.length; // ad identity + metrics

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Table header bar */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-[13px] font-semibold">Ad-level Breakdown</h4>
          <span className="text-[11px] text-muted-foreground">{rows.length} ads</span>
        </div>
        <TableControlsBar
          activeMetricKeys={activeMetricKeys}
          onActiveMetricKeysChange={onActiveMetricKeysChange}
          density={density}
          onDensityChange={setDensity}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr className="bg-muted/20">
              {/* Ad identity column */}
              <th className="sticky left-0 z-10 min-w-[260px] max-w-[360px] border-b bg-muted/20 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ad
              </th>
              {/* Metric columns */}
              {activeMetrics.map((m) => {
                const isSorted = sortKey === m.key;
                return (
                  <th
                    key={m.key}
                    onClick={() => handleSort(m.key)}
                    className={cn(
                      "cursor-pointer select-none whitespace-nowrap border-b px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider transition-colors",
                      isSorted ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {m.shortLabel}
                      {isSorted && (
                        <span className="text-[8px]">{sortDir === "desc" ? "▼" : "▲"}</span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={totalCols} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-[12px] text-muted-foreground">Loading breakdown...</span>
                  </div>
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="py-12 text-center text-muted-foreground">
                  No ad-level rows found for this creative.
                </td>
              </tr>
            )}

            {!loading &&
              displayRows.map((row, idx) => {
                const campaignName = row.campaignName ?? row.campaign_name ?? null;
                const adSetName = row.adSetName ?? row.ad_set_name ?? null;
                const isLast = idx === displayRows.length - 1;
                const borderClass = !isLast ? "border-b border-border/40" : "";

                const assetFallbacks = buildCreativeAssetFallbacks(row);

                return (
                  <tr key={row.id} className="group transition-colors hover:bg-muted/15">
                    {/* Ad identity — sticky */}
                    <td className={cn("sticky left-0 z-10 min-w-[260px] max-w-[360px] bg-background px-3 py-2.5 transition-colors group-hover:bg-muted/15", borderClass)}>
                      <div className="flex items-start gap-3">
                        {/* Thumbnail */}
                        <div className="mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
                          <CreativeRenderSurface
                            id={row.id}
                            name={row.name}
                            preview={row.preview}
                            size="thumb"
                            mode="asset"
                            assetState={getCreativeAssetState(row)}
                            assetFallbacks={assetFallbacks}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-[2px]">
                          <p className="text-sm font-medium text-foreground leading-tight break-words">{row.name}</p>
                          {campaignName && (
                            <p className="text-xs leading-tight text-muted-foreground break-words">{campaignName}</p>
                          )}
                          {adSetName && (
                            <p className="text-xs leading-tight text-muted-foreground/80 break-words">{adSetName}</p>
                          )}
                          {!campaignName && !adSetName && row.launchDate && (
                            <p className="text-xs text-muted-foreground">{row.launchDate}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Metric cells */}
                    {activeMetrics.map((m) => {
                      const value = m.getValue(row);
                      const extremes = metricExtremes.get(m.key) ?? { min: 0, max: 0 };
                      const bg = metricHeatBg(value, extremes.min, extremes.max, m.direction);
                      const formatted = fmtMetricValue(value, m.format, currency, defaultCurrency);

                      return (
                        <td
                          key={m.key}
                          className={cn("whitespace-nowrap px-3 text-right font-medium tabular-nums", py, borderClass)}
                          style={{ backgroundColor: bg }}
                        >
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
