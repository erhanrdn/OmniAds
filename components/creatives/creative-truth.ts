import type { CreativeFormat, CreativeVisualFormat } from "@/lib/meta/creatives-types";

export interface CreativeTruthMetricRow {
  spend: number;
  purchaseValue: number;
  purchases?: number;
  clicks?: number;
  linkClicks?: number;
  impressions?: number;
  addToCart?: number;
  clickToAddToCart?: number;
  clickToPurchase?: number;
  linkCtr?: number;
  thumbstop?: number;
  video25?: number;
  video50?: number;
  video75?: number;
  video100?: number;
  format: CreativeFormat;
  creativeVisualFormat?: CreativeVisualFormat;
}

export function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

export function calculateCreativeAverageOrderValue(row: Pick<CreativeTruthMetricRow, "purchaseValue" | "purchases">): number {
  return safeDivide(row.purchaseValue, row.purchases ?? 0);
}

export function calculateCreativeCpcAll(row: Pick<CreativeTruthMetricRow, "spend" | "clicks">): number {
  return safeDivide(row.spend, row.clicks ?? 0);
}

export function calculateCreativeLinkCtr(
  row: Pick<CreativeTruthMetricRow, "linkClicks" | "impressions"> & { linkCtr?: number }
): number {
  if (Number.isFinite(row.linkCtr)) return row.linkCtr ?? 0;
  return safeDivide((row.linkClicks ?? 0) * 100, row.impressions ?? 0);
}

export function calculateCreativeClickToAddToCartRate(
  row: Pick<CreativeTruthMetricRow, "addToCart" | "linkClicks"> & { clickToAddToCart?: number }
): number {
  if (Number.isFinite(row.clickToAddToCart)) return row.clickToAddToCart ?? 0;
  return safeDivide((row.addToCart ?? 0) * 100, row.linkClicks ?? 0);
}

export function calculateCreativeClickToPurchaseRate(
  row: Pick<CreativeTruthMetricRow, "purchases" | "linkClicks" | "clickToPurchase">
): number {
  const clickToPurchase = row.clickToPurchase ?? 0;
  if (Number.isFinite(clickToPurchase) && clickToPurchase > 0) return clickToPurchase;
  return safeDivide((row.purchases ?? 0) * 100, row.linkClicks ?? 0);
}

export function calculateCreativePurchaseValueShare(
  row: Pick<CreativeTruthMetricRow, "purchaseValue">,
  totalPurchaseValue: number
): number {
  return safeDivide(row.purchaseValue * 100, totalPurchaseValue);
}

export function calculateCreativeSpendShare(
  row: Pick<CreativeTruthMetricRow, "spend">,
  totalSpend: number
): number {
  return safeDivide(row.spend * 100, totalSpend);
}

export function calculateCreativePurchasesPer1000Impressions(
  row: Pick<CreativeTruthMetricRow, "purchases" | "impressions">
): number {
  return safeDivide((row.purchases ?? 0) * 1000, row.impressions ?? 0);
}

export function calculateCreativeRevenuePer1000Impressions(
  row: Pick<CreativeTruthMetricRow, "purchaseValue" | "impressions">
): number {
  return safeDivide(row.purchaseValue * 1000, row.impressions ?? 0);
}

export function hasCreativeVideoEvidence(
  row: Pick<
    CreativeTruthMetricRow,
    "format" | "creativeVisualFormat" | "thumbstop" | "video25" | "video50" | "video75" | "video100"
  >
): boolean {
  return (
    row.format === "video" ||
    row.creativeVisualFormat === "video" ||
    (row.thumbstop ?? 0) > 0 ||
    (row.video25 ?? 0) > 0 ||
    (row.video50 ?? 0) > 0 ||
    (row.video75 ?? 0) > 0 ||
    (row.video100 ?? 0) > 0
  );
}
