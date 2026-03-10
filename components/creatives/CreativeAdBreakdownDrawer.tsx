"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, BarChart3, Layers, TrendingUp, TrendingDown, Minus, Plus, Search, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, resolveCreativeCurrency } from "@/components/creatives/money";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { CreativeRenderSurface } from "@/components/creatives/CreativeRenderSurface";

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

type BreakdownRow = MetaCreativeRow & {
  associatedAdsCount?: number;
  associated_ads_count?: number;
  campaignName?: string | null;
  campaign_name?: string | null;
  adSetName?: string | null;
  ad_set_name?: string | null;
  adSetId?: string | null;
  adset_id?: string | null;
  launchDate?: string | null;
  launch_date?: string | null;
};

type ChartMetric = "spend" | "roas" | "purchases" | "cpa";

/* ═══════════════════════════════════════════════════════════════
   METRIC REGISTRY
   ═══════════════════════════════════════════════════════════════ */

type MetricDirection = "high" | "low" | "neutral";
type MetricFormat = "currency" | "percent" | "decimal" | "number" | "ratio" | "compact";
type MetricCategory = "performance" | "conversion" | "video" | "clicks";

interface BreakdownMetricDef {
  key: string;
  label: string;
  shortLabel: string;
  category: MetricCategory;
  format: MetricFormat;
  direction: MetricDirection;
  getValue: (row: MetaCreativeRow) => number;
}

const METRIC_CATEGORIES: { key: MetricCategory; label: string }[] = [
  { key: "performance", label: "Performance" },
  { key: "conversion", label: "Conversion" },
  { key: "clicks", label: "Click Behavior" },
  { key: "video", label: "Video Engagement" },
];

const BREAKDOWN_METRICS: BreakdownMetricDef[] = [
  // Performance
  { key: "spend", label: "Spend", shortLabel: "Spend", category: "performance", format: "currency", direction: "neutral", getValue: (r) => r.spend },
  { key: "purchaseValue", label: "Purchase value", shortLabel: "Purch. Val", category: "performance", format: "currency", direction: "high", getValue: (r) => r.purchaseValue },
  { key: "roas", label: "ROAS", shortLabel: "ROAS", category: "performance", format: "ratio", direction: "high", getValue: (r) => r.roas },
  { key: "cpa", label: "Cost per purchase", shortLabel: "CPA", category: "performance", format: "currency", direction: "low", getValue: (r) => r.cpa },
  { key: "cpm", label: "Cost per mille", shortLabel: "CPM", category: "performance", format: "currency", direction: "low", getValue: (r) => r.cpm },
  { key: "impressions", label: "Impressions", shortLabel: "Impr.", category: "performance", format: "compact", direction: "neutral", getValue: (r) => r.impressions },

  // Conversion
  { key: "purchases", label: "Purchases", shortLabel: "Purch.", category: "conversion", format: "number", direction: "high", getValue: (r) => r.purchases },
  { key: "aov", label: "Average order value", shortLabel: "AOV", category: "conversion", format: "currency", direction: "high", getValue: (r) => r.purchases > 0 ? r.purchaseValue / r.purchases : 0 },
  { key: "clickToAtc", label: "Click to add-to-cart ratio", shortLabel: "Click→ATC", category: "conversion", format: "percent", direction: "high", getValue: (r) => r.clickToPurchase },
  { key: "atcToPurchase", label: "Add-to-cart to purchase ratio", shortLabel: "ATC→Purch", category: "conversion", format: "percent", direction: "high", getValue: (r) => r.atcToPurchaseRatio },
  { key: "clickToPurchase", label: "Click to purchase ratio", shortLabel: "Click→Purch", category: "conversion", format: "percent", direction: "high", getValue: (r) => r.clickToPurchase },

  // Click behavior
  { key: "cpcLink", label: "Cost per link click", shortLabel: "CPC Link", category: "clicks", format: "currency", direction: "low", getValue: (r) => r.cpcLink },
  { key: "cpcAll", label: "Cost per click (all)", shortLabel: "CPC All", category: "clicks", format: "currency", direction: "low", getValue: (r) => r.cpcLink },
  { key: "ctrAll", label: "Click through rate (all)", shortLabel: "CTR", category: "clicks", format: "percent", direction: "high", getValue: (r) => r.ctrAll },
  { key: "ctrOutbound", label: "Click through rate (outbound)", shortLabel: "CTR Out", category: "clicks", format: "percent", direction: "high", getValue: (r) => r.ctrAll },
  { key: "linkClicks", label: "Link clicks", shortLabel: "Clicks", category: "clicks", format: "compact", direction: "high", getValue: (r) => r.linkClicks },

  // Video engagement
  { key: "thumbstop", label: "Thumbstop ratio", shortLabel: "Thumbstop", category: "video", format: "percent", direction: "high", getValue: (r) => r.thumbstop },
  { key: "firstFrame", label: "First frame retention", shortLabel: "1st Frame", category: "video", format: "percent", direction: "high", getValue: (r) => r.thumbstop },
  { key: "video25", label: "25% video plays (rate)", shortLabel: "25%", category: "video", format: "percent", direction: "high", getValue: (r) => r.video25 },
  { key: "video50", label: "50% video plays (rate)", shortLabel: "50%", category: "video", format: "percent", direction: "high", getValue: (r) => r.video50 },
  { key: "video75", label: "75% video plays (rate)", shortLabel: "75%", category: "video", format: "percent", direction: "high", getValue: (r) => r.video75 },
  { key: "video100", label: "100% video plays (rate)", shortLabel: "100%", category: "video", format: "percent", direction: "high", getValue: (r) => r.video100 },
  { key: "holdRate", label: "Hold rate", shortLabel: "Hold", category: "video", format: "percent", direction: "high", getValue: (r) => r.video100 },
];

const METRIC_MAP = new Map(BREAKDOWN_METRICS.map((m) => [m.key, m]));

const DEFAULT_METRIC_KEYS = ["spend", "purchaseValue", "roas", "cpa", "purchases", "ctrAll", "cpm"];

/* ═══════════════════════════════════════════════════════════════
   Format & Color helpers
   ═══════════════════════════════════════════════════════════════ */

function fmtMetricValue(
  value: number,
  format: MetricFormat,
  currency: string | null,
  defaultCurrency: string | null,
): string {
  switch (format) {
    case "currency": return formatMoney(value, currency, defaultCurrency);
    case "percent": return `${value.toFixed(2)}%`;
    case "ratio": return `${value.toFixed(2)}x`;
    case "number": return Math.round(value).toLocaleString();
    case "compact": return fmtCompact(value);
    case "decimal": return value.toFixed(2);
  }
}

function fmtCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(value < 10 ? 2 : 0);
}

/**
 * Returns a subtle background tint based on metric value relative to min/max.
 * direction="high" → higher = greener. direction="low" → lower = greener.
 */
function metricHeatBg(
  value: number,
  min: number,
  max: number,
  direction: MetricDirection,
): string {
  if (direction === "neutral" || max <= min) return "transparent";
  const normalized = (value - min) / (max - min);
  const score = direction === "low" ? 1 - normalized : normalized;

  if (score >= 0.7) return "rgba(16, 185, 129, 0.12)";  // green
  if (score >= 0.4) return "rgba(250, 204, 21, 0.08)";   // amber
  if (score >= 0.2) return "rgba(251, 146, 60, 0.10)";   // orange
  return "rgba(239, 68, 68, 0.10)";                       // red
}

/* ═══════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════ */

const MIN_DRAWER_WIDTH = 580;
const DEFAULT_DRAWER_WIDTH = 800;

const CHART_METRICS: { key: ChartMetric; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "roas", label: "ROAS" },
  { key: "purchases", label: "Purchases" },
  { key: "cpa", label: "CPA" },
];

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function getAssociatedAdsCount(creative: MetaCreativeRow | null, rows: BreakdownRow[]): number {
  if (!creative) return rows.length;
  return (creative as BreakdownRow).associatedAdsCount ?? (creative as BreakdownRow).associated_ads_count ?? rows.length;
}

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
  const associatedAdsCount = useMemo(() => getAssociatedAdsCount(creative, breakdownRows), [creative, breakdownRows]);

  const currency = resolveCreativeCurrency(creative?.currency, defaultCurrency);

  const aggregated = useMemo(() => {
    const totalSpend = sortedRows.reduce((s, r) => s + r.spend, 0);
    const totalPurchaseValue = sortedRows.reduce((s, r) => s + r.purchaseValue, 0);
    const totalPurchases = sortedRows.reduce((s, r) => s + r.purchases, 0);
    const avgRoas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;
    const avgCpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
    return { totalSpend, totalPurchaseValue, totalPurchases, avgRoas, avgCpa };
  }, [sortedRows]);

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

  const assetFallbacks = creative
    ? [
        creative.cardPreviewUrl ?? null,
        creative.imageUrl ?? null,
        creative.preview?.image_url ?? null,
        creative.preview?.poster_url ?? null,
        creative.previewUrl ?? null,
        creative.cachedThumbnailUrl ?? null,
        creative.thumbnailUrl ?? null,
      ]
    : [];

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
                rows={sortedRows}
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
   HEADER / CREATIVE HERO
   ═══════════════════════════════════════════════════════════════ */

function CreativeDrawerHeader({
  creative,
  associatedAdsCount,
  assetFallbacks,
  onClose,
}: {
  creative: MetaCreativeRow | null;
  associatedAdsCount: number;
  assetFallbacks: (string | null)[];
  onClose: () => void;
}) {
  const formatLabel =
    creative?.isCatalog ? "Catalog" :
    creative?.format === "video" ? "Video" : "Image";

  return (
    <header className="shrink-0 border-b bg-muted/30">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 items-center rounded-md bg-primary/10 px-2">
            <Layers className="mr-1.5 h-3 w-3 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Ad breakdown
            </span>
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-4 px-5 pb-4">
        <div className="shrink-0 overflow-hidden rounded-xl border bg-background shadow-sm" style={{ width: 96, height: 96 }}>
          {creative ? (
            <CreativeRenderSurface
              id={creative.id}
              name={creative.name}
              preview={creative.preview}
              size="card"
              mode="asset"
              assetFallbacks={assetFallbacks}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
              <BarChart3 className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <h3 className="truncate text-base font-semibold leading-tight tracking-tight">
            {creative?.name ?? "Creative"}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Meta
            </span>
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {formatLabel}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {associatedAdsCount} {associatedAdsCount === 1 ? "ad" : "ads"} using this creative
            </span>
          </div>
          {creative?.launchDate && (
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              Launched {creative.launchDate}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUMMARY METRIC CARDS
   ═══════════════════════════════════════════════════════════════ */

function CreativeSummaryCards({
  totalSpend,
  avgRoas,
  totalPurchases,
  avgCpa,
  adsCount,
  currency,
  defaultCurrency,
}: {
  totalSpend: number;
  avgRoas: number;
  totalPurchases: number;
  avgCpa: number;
  adsCount: number;
  currency: string | null;
  defaultCurrency: string | null;
}) {
  return (
    <div className="grid grid-cols-5 gap-3">
      <SummaryCard
        label="Total Spend"
        value={formatMoney(totalSpend, currency, defaultCurrency)}
        icon={<span className="text-amber-500">$</span>}
      />
      <SummaryCard
        label="Avg ROAS"
        value={`${avgRoas.toFixed(2)}x`}
        icon={avgRoas >= 1 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
      />
      <SummaryCard
        label="Total Purchases"
        value={Math.round(totalPurchases).toLocaleString()}
        icon={<span className="text-violet-500 text-xs font-bold">#</span>}
      />
      <SummaryCard
        label="Avg CPA"
        value={formatMoney(avgCpa, currency, defaultCurrency)}
        icon={<Minus className="h-3.5 w-3.5 text-orange-400" />}
      />
      <SummaryCard
        label="Active Ads"
        value={adsCount.toString()}
        icon={<Layers className="h-3.5 w-3.5 text-blue-400" />}
      />
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted/60">{icon}</div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PERFORMANCE CHART
   ═══════════════════════════════════════════════════════════════ */

function CreativePerformanceChart({
  rows,
  metric,
  onMetricChange,
  currency,
  defaultCurrency,
}: {
  rows: BreakdownRow[];
  metric: ChartMetric;
  onMetricChange: (m: ChartMetric) => void;
  currency: string | null;
  defaultCurrency: string | null;
}) {
  const maxValue = useMemo(() => {
    const values = rows.map((r) => getChartMetricValue(r, metric));
    return Math.max(...values, 0.01);
  }, [rows, metric]);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-[13px] font-semibold">Performance by Ad</h4>
        </div>
        <div className="flex gap-1">
          {CHART_METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onMetricChange(m.key)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors",
                metric === m.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data to chart</p>
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 8).map((row) => {
              const value = getChartMetricValue(row, metric);
              const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const displayValue = fmtChartMetricValue(value, metric, currency, defaultCurrency);
              return (
                <div key={row.id} className="group">
                  <div className="mb-0.5 flex items-center justify-between">
                    <p className="max-w-[60%] truncate text-[11px] font-medium text-foreground">{row.name}</p>
                    <span className="text-[11px] font-semibold tabular-nums text-foreground">{displayValue}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full bg-primary/80 transition-all duration-300 group-hover:bg-primary"
                      style={{ width: `${Math.max(pct, 1.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {rows.length > 8 && (
              <p className="pt-1 text-center text-[10px] text-muted-foreground">+{rows.length - 8} more ads</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getChartMetricValue(row: MetaCreativeRow, metric: ChartMetric): number {
  switch (metric) {
    case "spend": return row.spend;
    case "roas": return row.roas;
    case "purchases": return row.purchases;
    case "cpa": return row.cpa;
  }
}

function fmtChartMetricValue(value: number, metric: ChartMetric, currency: string | null, defaultCurrency: string | null): string {
  switch (metric) {
    case "spend":
    case "cpa":
      return formatMoney(value, currency, defaultCurrency);
    case "roas": return `${value.toFixed(2)}x`;
    case "purchases": return Math.round(value).toLocaleString();
  }
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
    () => activeMetricKeys.map((k) => METRIC_MAP.get(k)).filter((m): m is BreakdownMetricDef => Boolean(m)),
    [activeMetricKeys]
  );

  // Precompute min/max for heat coloring
  const metricExtremes = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    for (const m of activeMetrics) {
      const values = rows.map((r) => m.getValue(r)).filter(Number.isFinite);
      if (values.length === 0) { map.set(m.key, { min: 0, max: 0 }); continue; }
      map.set(m.key, { min: Math.min(...values), max: Math.max(...values) });
    }
    return map;
  }, [activeMetrics, rows]);

  // Sort rows
  const displayRows = useMemo(() => {
    if (!sortKey) return rows;
    const def = METRIC_MAP.get(sortKey);
    if (!def) return rows;
    const sorted = [...rows].sort((a, b) => {
      const av = def.getValue(a);
      const bv = def.getValue(b);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return sorted;
  }, [rows, sortKey, sortDir]);

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
              <th className="sticky left-0 z-10 min-w-[220px] border-b bg-muted/20 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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

                const assetFallbacks = [
                  row.cardPreviewUrl ?? null,
                  row.imageUrl ?? null,
                  row.preview?.image_url ?? null,
                  row.preview?.poster_url ?? null,
                  row.previewUrl ?? null,
                  row.cachedThumbnailUrl ?? null,
                  row.thumbnailUrl ?? null,
                ];

                return (
                  <tr key={row.id} className="group transition-colors hover:bg-muted/15">
                    {/* Ad identity — sticky */}
                    <td className={cn("sticky left-0 z-10 bg-background px-3 transition-colors group-hover:bg-muted/15", py, borderClass)}>
                      <div className="flex items-center gap-2.5">
                        {/* Thumbnail */}
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
                          <CreativeRenderSurface
                            id={row.id}
                            name={row.name}
                            preview={row.preview}
                            size="thumb"
                            mode="asset"
                            assetFallbacks={assetFallbacks}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-foreground leading-tight">{row.name}</p>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/70">
                            {campaignName && <span className="max-w-[100px] truncate">{campaignName}</span>}
                            {campaignName && adSetName && <span className="opacity-40">/</span>}
                            {adSetName && <span className="max-w-[80px] truncate">{adSetName}</span>}
                            {!campaignName && !adSetName && row.launchDate && <span>{row.launchDate}</span>}
                          </div>
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
