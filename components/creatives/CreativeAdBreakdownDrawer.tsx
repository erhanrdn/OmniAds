"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, BarChart3, Layers, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

const TABLE_COLUMNS = [
  { key: "ad_name", label: "Ad Name", align: "left" as const },
  { key: "campaign", label: "Campaign", align: "left" as const },
  { key: "adset", label: "Ad Set", align: "left" as const },
  { key: "spend", label: "Spend", align: "right" as const },
  { key: "roas", label: "ROAS", align: "right" as const },
  { key: "cpa", label: "CPA", align: "right" as const },
  { key: "purchases", label: "Purchases", align: "right" as const },
  { key: "impressions", label: "Impressions", align: "right" as const },
  { key: "ctr", label: "CTR", align: "right" as const },
  { key: "cpm", label: "CPM", align: "right" as const },
];

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function getAssociatedAdsCount(creative: MetaCreativeRow | null, rows: BreakdownRow[]): number {
  if (!creative) return rows.length;
  return (creative as BreakdownRow).associatedAdsCount ?? (creative as BreakdownRow).associated_ads_count ?? rows.length;
}

function fmtCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(value < 10 ? 2 : 0);
}

function fmtPercent(value: number): string {
  return `${value.toFixed(2)}%`;
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
        {/* Resize handle */}
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
          {/* ──────────── HEADER / CREATIVE HERO ──────────── */}
          <CreativeDrawerHeader
            creative={creative}
            associatedAdsCount={associatedAdsCount}
            assetFallbacks={assetFallbacks}
            onClose={() => onOpenChange(false)}
          />

          {/* ──────────── SCROLLABLE CONTENT ──────────── */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-4 p-5">
              {/* ──────────── SUMMARY METRIC CARDS ──────────── */}
              <CreativeSummaryCards
                totalSpend={aggregated.totalSpend}
                avgRoas={aggregated.avgRoas}
                totalPurchases={aggregated.totalPurchases}
                avgCpa={aggregated.avgCpa}
                adsCount={associatedAdsCount}
                currency={currency}
                defaultCurrency={defaultCurrency}
              />

              {/* ──────────── CHART ──────────── */}
              <CreativePerformanceChart
                rows={sortedRows}
                metric={chartMetric}
                onMetricChange={setChartMetric}
                currency={currency}
                defaultCurrency={defaultCurrency}
              />

              {/* ──────────── TABLE ──────────── */}
              <CreativeBreakdownTable
                rows={sortedRows}
                loading={loading}
                currency={currency}
                defaultCurrency={defaultCurrency}
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
      {/* Top bar: label + close */}
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

      {/* Creative hero */}
      <div className="flex gap-4 px-5 pb-4">
        {/* Preview thumbnail */}
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

        {/* Creative identity */}
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

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted/60">
          {icon}
        </div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums tracking-tight">
        {value}
      </p>
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
    const values = rows.map((r) => getMetricValue(r, metric));
    return Math.max(...values, 0.01);
  }, [rows, metric]);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Chart header */}
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

      {/* Bar chart */}
      <div className="px-4 py-3">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data to chart</p>
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 8).map((row) => {
              const value = getMetricValue(row, metric);
              const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const displayValue = formatMetricValue(value, metric, currency, defaultCurrency);

              return (
                <div key={row.id} className="group">
                  <div className="mb-0.5 flex items-center justify-between">
                    <p className="max-w-[60%] truncate text-[11px] font-medium text-foreground">
                      {row.name}
                    </p>
                    <span className="text-[11px] font-semibold tabular-nums text-foreground">
                      {displayValue}
                    </span>
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
              <p className="pt-1 text-center text-[10px] text-muted-foreground">
                +{rows.length - 8} more ads
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getMetricValue(row: MetaCreativeRow, metric: ChartMetric): number {
  switch (metric) {
    case "spend": return row.spend;
    case "roas": return row.roas;
    case "purchases": return row.purchases;
    case "cpa": return row.cpa;
  }
}

function formatMetricValue(
  value: number,
  metric: ChartMetric,
  currency: string | null,
  defaultCurrency: string | null
): string {
  switch (metric) {
    case "spend":
    case "cpa":
      return formatMoney(value, currency, defaultCurrency);
    case "roas":
      return `${value.toFixed(2)}x`;
    case "purchases":
      return Math.round(value).toLocaleString();
  }
}

/* ═══════════════════════════════════════════════════════════════
   BREAKDOWN TABLE
   ═══════════════════════════════════════════════════════════════ */

function CreativeBreakdownTable({
  rows,
  loading,
  currency,
  defaultCurrency,
}: {
  rows: BreakdownRow[];
  loading: boolean;
  currency: string | null;
  defaultCurrency: string | null;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Table header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h4 className="text-[13px] font-semibold">Ad-level Breakdown</h4>
        <span className="text-[11px] text-muted-foreground">{rows.length} ads</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr className="bg-muted/30">
              {TABLE_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "whitespace-nowrap border-b px-3 py-2.5 font-semibold uppercase tracking-wider text-muted-foreground",
                    "text-[10px]",
                    col.align === "right" ? "text-right" : "text-left",
                    col.key === "ad_name" && "sticky left-0 z-10 bg-muted/30 min-w-[200px]"
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={TABLE_COLUMNS.length} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-[12px] text-muted-foreground">Loading breakdown...</span>
                  </div>
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={TABLE_COLUMNS.length} className="py-12 text-center text-muted-foreground">
                  No ad-level rows found for this creative.
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row, idx) => {
                const campaignName = row.campaignName ?? row.campaign_name ?? "-";
                const adSetName = row.adSetName ?? row.ad_set_name ?? row.adSetId ?? row.adset_id ?? "-";
                const isLast = idx === rows.length - 1;

                return (
                  <tr
                    key={row.id}
                    className="group transition-colors hover:bg-muted/20"
                  >
                    {/* Ad Name — sticky */}
                    <td
                      className={cn(
                        "sticky left-0 z-10 bg-background px-3 py-2.5 transition-colors group-hover:bg-muted/20",
                        !isLast && "border-b border-border/40"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.name}</p>
                        {row.launchDate && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                            {row.launchDate}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Campaign */}
                    <td className={cn(cellClass, !isLast && "border-b border-border/40")}>
                      <span className="max-w-[160px] truncate block">{campaignName}</span>
                    </td>

                    {/* Ad Set */}
                    <td className={cn(cellClass, !isLast && "border-b border-border/40")}>
                      <span className="max-w-[140px] truncate block">{adSetName}</span>
                    </td>

                    {/* Spend */}
                    <td className={cn(cellNumClass, !isLast && "border-b border-border/40")}>
                      {formatMoney(row.spend, currency, defaultCurrency)}
                    </td>

                    {/* ROAS */}
                    <td className={cn(cellNumClass, !isLast && "border-b border-border/40")}>
                      <span className={cn(
                        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                        row.roas >= 2 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                        row.roas >= 1 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                        "bg-red-500/10 text-red-500"
                      )}>
                        {row.roas.toFixed(2)}x
                      </span>
                    </td>

                    {/* CPA */}
                    <td className={cn(cellNumClass, !isLast && "border-b border-border/40")}>
                      {formatMoney(row.cpa, currency, defaultCurrency)}
                    </td>

                    {/* Purchases */}
                    <td className={cn(cellNumClass, !isLast && "border-b border-border/40")}>
                      {Math.round(row.purchases).toLocaleString()}
                    </td>

                    {/* Impressions */}
                    <td className={cn(cellNumClass, !isLast && "border-b border-border/40")}>
                      {fmtCompact(row.impressions)}
                    </td>

                    {/* CTR */}
                    <td className={cn(cellNumClass, !isLast && "border-b border-border/40")}>
                      {fmtPercent(row.ctrAll)}
                    </td>

                    {/* CPM */}
                    <td className={cn(cellNumClass, !isLast && "border-b border-border/40")}>
                      {formatMoney(row.cpm, currency, defaultCurrency)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Shared cell styles
   ═══════════════════════════════════════════════════════════════ */

const cellClass = cn("whitespace-nowrap px-3 py-2.5 text-foreground/80");
const cellNumClass = cn("whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums");
