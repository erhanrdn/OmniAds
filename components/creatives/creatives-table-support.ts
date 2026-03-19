import type { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { formatMoney } from "@/components/creatives/money";

export function fmtCurrency(
  n: number,
  rowCurrency?: string | null,
  defaultCurrency?: string | null
): string {
  return formatMoney(n, rowCurrency, defaultCurrency);
}

export function fmtPercent(n: number): string {
  return `${n.toFixed(2)}%`;
}

export function fmtInteger(n: number): string {
  return Math.round(n).toLocaleString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * ratio;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

export function buildDistribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      q1: 0,
      q3: 0,
      p20: 0,
      p40: 0,
      p60: 0,
      p80: 0,
      sorted: [] as number[],
    };
  }
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    median: percentile(sorted, 0.5),
    q1: percentile(sorted, 0.25),
    q3: percentile(sorted, 0.75),
    p20: percentile(sorted, 0.2),
    p40: percentile(sorted, 0.4),
    p60: percentile(sorted, 0.6),
    p80: percentile(sorted, 0.8),
    sorted,
  };
}

export function toHeatColor(tone: string, intensity: number): string {
  if (intensity <= 0) return "transparent";
  const alpha = clamp(intensity * 0.32, 0.06, 0.4);
  const palette: Record<string, [number, number, number]> = {
    strong_negative: [220, 38, 38],
    negative: [239, 68, 68],
    neutral: [148, 163, 184],
    positive: [34, 197, 94],
    strong_positive: [22, 163, 74],
  };
  const [r, g, b] = palette[tone] ?? palette.neutral;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

export function computeAggregateTotals(rows: MetaCreativeRow[]) {
  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
  const totalPurchaseValue = rows.reduce((sum, row) => sum + row.purchaseValue, 0);
  const totalPurchases = rows.reduce((sum, row) => sum + row.purchases, 0);
  const totalImpressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const totalLinkClicks = rows.reduce((sum, row) => sum + row.linkClicks, 0);
  const totalAddToCart = rows.reduce((sum, row) => sum + row.addToCart, 0);
  const totalThumbstopViews = rows.reduce(
    (sum, row) => sum + (row.thumbstop / 100) * row.impressions,
    0
  );
  const totalVideo25Views = rows.reduce(
    (sum, row) => sum + (row.video25 / 100) * row.impressions,
    0
  );
  const totalVideo50Views = rows.reduce(
    (sum, row) => sum + (row.video50 / 100) * row.impressions,
    0
  );
  const totalVideo75Views = rows.reduce(
    (sum, row) => sum + (row.video75 / 100) * row.impressions,
    0
  );
  const totalVideo100Views = rows.reduce(
    (sum, row) => sum + (row.video100 / 100) * row.impressions,
    0
  );
  return {
    totalSpend,
    totalPurchaseValue,
    totalPurchases,
    totalImpressions,
    totalLinkClicks,
    totalAddToCart,
    totalThumbstopViews,
    totalVideo25Views,
    totalVideo50Views,
    totalVideo75Views,
    totalVideo100Views,
  };
}
