import type { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { formatMoney } from "@/components/creatives/money";
import { formatPercentSmart } from "@/lib/metric-format";

export function fmtCurrency(
  n: number,
  rowCurrency?: string | null,
  defaultCurrency?: string | null
): string {
  return formatMoney(n, rowCurrency, defaultCurrency);
}

export function fmtPercent(n: number): string {
  return formatPercentSmart(n);
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
  const normalizedIntensity = clamp(intensity, 0, 1);
  const easedIntensity = Math.pow(normalizedIntensity, 1.08);
  const toneWeight: Record<string, number> = {
    strong_negative: 1.22,
    negative: 0.96,
    neutral: 0.7,
    positive: 0.96,
    strong_positive: 1.18,
  };
  const alpha = clamp(0.032 + easedIntensity * 0.165 * (toneWeight[tone] ?? 0.9), 0.04, 0.23);
  const palette: Record<string, [number, number, number]> = {
    strong_negative: [224, 92, 106],
    negative: [244, 144, 154],
    neutral: [163, 176, 193],
    positive: [120, 212, 171],
    strong_positive: [28, 182, 126],
  };
  const [r, g, b] = palette[tone] ?? palette.neutral;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

export function toHeatAccentColor(tone: string): string {
  const palette: Record<string, [number, number, number]> = {
    strong_negative: [214, 74, 89],
    negative: [232, 118, 129],
    neutral: [136, 151, 172],
    positive: [69, 181, 132],
    strong_positive: [17, 155, 108],
  };
  const [r, g, b] = palette[tone] ?? palette.neutral;
  return `rgb(${r}, ${g}, ${b})`;
}

export function toHeatCellStyle(tone: string, intensity: number) {
  if (intensity <= 0) return {};

  const normalizedIntensity = clamp(intensity, 0, 1);
  const easedIntensity = Math.pow(normalizedIntensity, 1.04);
  const backgroundColor = toHeatColor(tone, intensity);
  const toneWeight: Record<string, number> = {
    strong_negative: 1.2,
    negative: 0.94,
    neutral: 0.72,
    positive: 0.94,
    strong_positive: 1.16,
  };
  const ringAlpha = clamp(
    0.06 + easedIntensity * 0.14 * (toneWeight[tone] ?? 0.9),
    0.075,
    0.26
  );
  const palette: Record<string, [number, number, number]> = {
    strong_negative: [214, 74, 89],
    negative: [232, 118, 129],
    neutral: [136, 151, 172],
    positive: [69, 181, 132],
    strong_positive: [17, 155, 108],
  };
  const [r, g, b] = palette[tone] ?? palette.neutral;

  return {
    backgroundColor,
    boxShadow: `inset 0 0 0 1px rgba(${r}, ${g}, ${b}, ${ringAlpha.toFixed(3)}), inset 0 1px 0 rgba(255, 255, 255, 0.18)`,
  };
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
