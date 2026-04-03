"use client";

import { formatMoney } from "@/components/creatives/money";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { getCreativeStaticPreviewSources } from "@/lib/meta/creatives-preview";

export type BreakdownRow = MetaCreativeRow & {
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

export type ChartMetric = "spend" | "roas" | "purchases" | "cpa";
export type MetricDirection = "high" | "low" | "neutral";
export type MetricFormat = "currency" | "percent" | "decimal" | "number" | "ratio" | "compact";
export type MetricCategory = "performance" | "conversion" | "video" | "clicks";

export interface BreakdownMetricDef {
  key: string;
  label: string;
  shortLabel: string;
  category: MetricCategory;
  format: MetricFormat;
  direction: MetricDirection;
  getValue: (row: MetaCreativeRow) => number;
}

export const METRIC_CATEGORIES: { key: MetricCategory; label: string }[] = [
  { key: "performance", label: "Performance" },
  { key: "conversion", label: "Conversion" },
  { key: "clicks", label: "Click Behavior" },
  { key: "video", label: "Video Engagement" },
];

export const BREAKDOWN_METRICS: BreakdownMetricDef[] = [
  { key: "spend", label: "Spend", shortLabel: "Spend", category: "performance", format: "currency", direction: "neutral", getValue: (r) => r.spend },
  { key: "purchaseValue", label: "Purchase value", shortLabel: "Purch. Val", category: "performance", format: "currency", direction: "high", getValue: (r) => r.purchaseValue },
  { key: "roas", label: "ROAS", shortLabel: "ROAS", category: "performance", format: "ratio", direction: "high", getValue: (r) => r.roas },
  { key: "cpa", label: "Cost per purchase", shortLabel: "CPA", category: "performance", format: "currency", direction: "low", getValue: (r) => r.cpa },
  { key: "cpm", label: "Cost per mille", shortLabel: "CPM", category: "performance", format: "currency", direction: "low", getValue: (r) => r.cpm },
  { key: "impressions", label: "Impressions", shortLabel: "Impr.", category: "performance", format: "compact", direction: "neutral", getValue: (r) => r.impressions },
  { key: "purchases", label: "Purchases", shortLabel: "Purch.", category: "conversion", format: "number", direction: "high", getValue: (r) => r.purchases },
  { key: "aov", label: "Average order value", shortLabel: "AOV", category: "conversion", format: "currency", direction: "high", getValue: (r) => (r.purchases > 0 ? r.purchaseValue / r.purchases : 0) },
  { key: "clickToAtc", label: "Click to add-to-cart ratio", shortLabel: "Click→ATC", category: "conversion", format: "percent", direction: "high", getValue: (r) => r.clickToPurchase },
  { key: "atcToPurchase", label: "Add-to-cart to purchase ratio", shortLabel: "ATC→Purch", category: "conversion", format: "percent", direction: "high", getValue: (r) => r.atcToPurchaseRatio },
  { key: "clickToPurchase", label: "Click to purchase ratio", shortLabel: "Click→Purch", category: "conversion", format: "percent", direction: "high", getValue: (r) => r.clickToPurchase },
  { key: "cpcLink", label: "Cost per link click", shortLabel: "CPC Link", category: "clicks", format: "currency", direction: "low", getValue: (r) => r.cpcLink },
  { key: "cpcAll", label: "Cost per click (all)", shortLabel: "CPC All", category: "clicks", format: "currency", direction: "low", getValue: (r) => r.cpcLink },
  { key: "ctrAll", label: "Click through rate (all)", shortLabel: "CTR", category: "clicks", format: "percent", direction: "high", getValue: (r) => r.ctrAll },
  { key: "ctrOutbound", label: "Click through rate (outbound)", shortLabel: "CTR Out", category: "clicks", format: "percent", direction: "high", getValue: (r) => r.ctrAll },
  { key: "linkClicks", label: "Link clicks", shortLabel: "Clicks", category: "clicks", format: "compact", direction: "high", getValue: (r) => r.linkClicks },
  { key: "thumbstop", label: "Thumbstop ratio", shortLabel: "Thumbstop", category: "video", format: "percent", direction: "high", getValue: (r) => r.thumbstop },
  { key: "firstFrame", label: "First frame retention", shortLabel: "1st Frame", category: "video", format: "percent", direction: "high", getValue: (r) => r.thumbstop },
  { key: "video25", label: "25% video plays (rate)", shortLabel: "25%", category: "video", format: "percent", direction: "high", getValue: (r) => r.video25 },
  { key: "video50", label: "50% video plays (rate)", shortLabel: "50%", category: "video", format: "percent", direction: "high", getValue: (r) => r.video50 },
  { key: "video75", label: "75% video plays (rate)", shortLabel: "75%", category: "video", format: "percent", direction: "high", getValue: (r) => r.video75 },
  { key: "video100", label: "100% video plays (rate)", shortLabel: "100%", category: "video", format: "percent", direction: "high", getValue: (r) => r.video100 },
  { key: "holdRate", label: "Hold rate", shortLabel: "Hold", category: "video", format: "percent", direction: "high", getValue: (r) => r.video100 },
];

export const METRIC_MAP = new Map(BREAKDOWN_METRICS.map((metric) => [metric.key, metric]));
export const DEFAULT_METRIC_KEYS = ["spend", "purchaseValue", "roas", "cpa", "purchases", "ctrAll", "cpm"];
export const MIN_DRAWER_WIDTH = 580;
export const DEFAULT_DRAWER_WIDTH = 800;
export const CHART_METRICS: { key: ChartMetric; label: string }[] = [
  { key: "spend", label: "Spend" },
  { key: "roas", label: "ROAS" },
  { key: "purchases", label: "Purchases" },
  { key: "cpa", label: "CPA" },
];

export function fmtCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(value < 10 ? 2 : 0);
}

export function fmtMetricValue(
  value: number,
  format: MetricFormat,
  currency: string | null,
  defaultCurrency: string | null
): string {
  switch (format) {
    case "currency":
      return formatMoney(value, currency, defaultCurrency);
    case "percent":
      return `${value.toFixed(2)}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "number":
      return Math.round(value).toLocaleString();
    case "compact":
      return fmtCompact(value);
    case "decimal":
      return value.toFixed(2);
  }
}

export function metricHeatBg(
  value: number,
  min: number,
  max: number,
  direction: MetricDirection
): string {
  if (direction === "neutral" || max <= min) return "transparent";
  const normalized = (value - min) / (max - min);
  const score = direction === "low" ? 1 - normalized : normalized;

  if (score >= 0.7) return "rgba(16, 185, 129, 0.12)";
  if (score >= 0.4) return "rgba(250, 204, 21, 0.08)";
  if (score >= 0.2) return "rgba(251, 146, 60, 0.10)";
  return "rgba(239, 68, 68, 0.10)";
}

export function getAssociatedAdsCount(creative: MetaCreativeRow | null, rows: BreakdownRow[]): number {
  if (!creative) return rows.length;
  return (creative as BreakdownRow).associatedAdsCount ?? (creative as BreakdownRow).associated_ads_count ?? rows.length;
}

export function buildCreativeAssetFallbacks(creative: MetaCreativeRow | null): (string | null)[] {
  if (!creative) return [];
  return getCreativeStaticPreviewSources(creative, "card");
}

export function aggregateBreakdownRows(rows: BreakdownRow[]) {
  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
  const totalPurchaseValue = rows.reduce((sum, row) => sum + row.purchaseValue, 0);
  const totalPurchases = rows.reduce((sum, row) => sum + row.purchases, 0);
  const avgRoas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;
  const avgCpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  return { totalSpend, totalPurchaseValue, totalPurchases, avgRoas, avgCpa };
}

export function getChartMetricValue(row: MetaCreativeRow, metric: ChartMetric): number {
  switch (metric) {
    case "spend":
      return row.spend;
    case "roas":
      return row.roas;
    case "purchases":
      return row.purchases;
    case "cpa":
      return row.cpa;
  }
}

export function fmtChartMetricValue(
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

export function getActiveBreakdownMetrics(activeMetricKeys: string[]) {
  return activeMetricKeys
    .map((key) => METRIC_MAP.get(key))
    .filter((metric): metric is BreakdownMetricDef => Boolean(metric));
}

export function resolveMetricExtremes(rows: BreakdownRow[], metrics: BreakdownMetricDef[]) {
  const metricExtremes = new Map<string, { min: number; max: number }>();
  for (const metric of metrics) {
    const values = rows.map((row) => metric.getValue(row)).filter(Number.isFinite);
    if (values.length === 0) {
      metricExtremes.set(metric.key, { min: 0, max: 0 });
      continue;
    }
    metricExtremes.set(metric.key, { min: Math.min(...values), max: Math.max(...values) });
  }
  return metricExtremes;
}

export function sortBreakdownRows(
  rows: BreakdownRow[],
  sortKey: string | null,
  sortDir: "asc" | "desc"
) {
  if (!sortKey) return rows;
  const metric = METRIC_MAP.get(sortKey);
  if (!metric) return rows;
  return [...rows].sort((a, b) => {
    const aValue = metric.getValue(a);
    const bValue = metric.getValue(b);
    return sortDir === "desc" ? bValue - aValue : aValue - bValue;
  });
}
