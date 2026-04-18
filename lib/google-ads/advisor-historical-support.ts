import type {
  CampaignPerformanceRow,
  ProductPerformanceRow,
} from "@/lib/google-ads/intelligence-model";
import type { GoogleCampaignFamily } from "@/lib/google-ads/growth-advisor-types";
import type { GoogleAdsWarehouseDailyRow } from "@/lib/google-ads/warehouse-types";

export interface GoogleAdsAdvisorSupportMetrics {
  spend: number;
  revenue: number;
  conversions: number;
  clicks: number;
  impressions: number;
  roas: number;
  cpa: number;
}

export interface GoogleAdsAdvisorCampaignSupport {
  familiesPresent: GoogleCampaignFamily[];
  familyMetricsByFamily: Partial<Record<GoogleCampaignFamily, GoogleAdsAdvisorSupportMetrics>>;
  totalMetrics: GoogleAdsAdvisorSupportMetrics;
}

export interface GoogleAdsAdvisorProductSupport {
  productTitles: string[];
  winnerTitles: string[];
  underperformingTitles: string[];
  hiddenWinnerTitles: string[];
  productCount: number;
  scaleProductCount: number;
  underperformingProductCount: number;
  hiddenWinnerCount: number;
  topRevenueTitles: string[];
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finalizeMetrics(input: Omit<GoogleAdsAdvisorSupportMetrics, "roas" | "cpa">) {
  return {
    ...input,
    roas: input.spend > 0 ? round(input.revenue / input.spend) : 0,
    cpa: input.conversions > 0 ? round(input.spend / input.conversions) : 0,
  } satisfies GoogleAdsAdvisorSupportMetrics;
}

function emptyMetrics() {
  return finalizeMetrics({
    spend: 0,
    revenue: 0,
    conversions: 0,
    clicks: 0,
    impressions: 0,
  });
}

type CampaignLike = {
  campaignName?: string | null;
  channel?: string | null;
};

export function classifyGoogleAdsCampaignFamilyLike(
  campaign: CampaignLike,
): GoogleCampaignFamily {
  const name = String(campaign.campaignName ?? "").toLowerCase();
  const channel = String(campaign.channel ?? "").toLowerCase();
  if (channel.includes("performance_max")) return "pmax_scaling";
  if (channel.includes("shopping")) return "shopping";
  if (name.includes("remarketing") || name.includes("retarget") || name.includes("rmkt")) {
    return "remarketing";
  }
  if (channel.includes("search")) {
    if (name.includes("brand") || name.includes("branded")) return "brand_search";
    return "non_brand_search";
  }
  return "supporting";
}

function campaignMetricsFromLike(row: {
  spend?: unknown;
  revenue?: unknown;
  conversions?: unknown;
  clicks?: unknown;
  impressions?: unknown;
}) {
  return {
    spend: toNumber(row.spend),
    revenue: toNumber(row.revenue),
    conversions: toNumber(row.conversions),
    clicks: toNumber(row.clicks),
    impressions: toNumber(row.impressions),
  };
}

function buildCampaignSupportFromLikeRows<T extends CampaignLike & {
  spend?: unknown;
  revenue?: unknown;
  conversions?: unknown;
  clicks?: unknown;
  impressions?: unknown;
}>(rows: T[]) {
  const totals = {
    spend: 0,
    revenue: 0,
    conversions: 0,
    clicks: 0,
    impressions: 0,
  };
  const byFamily = new Map<GoogleCampaignFamily, typeof totals>();

  for (const row of rows) {
    const family = classifyGoogleAdsCampaignFamilyLike(row);
    const metrics = campaignMetricsFromLike(row);
    totals.spend += metrics.spend;
    totals.revenue += metrics.revenue;
    totals.conversions += metrics.conversions;
    totals.clicks += metrics.clicks;
    totals.impressions += metrics.impressions;
    const current =
      byFamily.get(family) ?? {
        spend: 0,
        revenue: 0,
        conversions: 0,
        clicks: 0,
        impressions: 0,
      };
    current.spend += metrics.spend;
    current.revenue += metrics.revenue;
    current.conversions += metrics.conversions;
    current.clicks += metrics.clicks;
    current.impressions += metrics.impressions;
    byFamily.set(family, current);
  }

  return {
    familiesPresent: Array.from(byFamily.keys()) as GoogleCampaignFamily[],
    familyMetricsByFamily: Object.fromEntries(
      Array.from(byFamily.entries()).map(([family, metrics]) => [family, finalizeMetrics(metrics)]),
    ) as Partial<Record<GoogleCampaignFamily, GoogleAdsAdvisorSupportMetrics>>,
    totalMetrics: finalizeMetrics(totals),
  } satisfies GoogleAdsAdvisorCampaignSupport;
}

export function buildGoogleAdsAdvisorCampaignSupportFromCampaignRows(
  rows: CampaignPerformanceRow[],
) {
  return buildCampaignSupportFromLikeRows(rows);
}

export function buildGoogleAdsAdvisorCampaignSupportFromDailyRows(
  rows: GoogleAdsWarehouseDailyRow[],
) {
  return buildCampaignSupportFromLikeRows(rows);
}

type ProductAggregate = {
  title: string;
  spend: number;
  revenue: number;
  conversions: number;
};

function normalizeTitle(value: string) {
  return value.trim().toLowerCase();
}

function resolveCanonicalProductTitleFromDailyRow(row: GoogleAdsWarehouseDailyRow) {
  const payload =
    row.payloadJson && typeof row.payloadJson === "object" && !Array.isArray(row.payloadJson)
      ? (row.payloadJson as Record<string, unknown>)
      : {};
  return String(
    row.entityLabel ??
      payload.productTitle ??
      payload.title ??
      payload.name ??
      row.entityKey,
  ).trim();
}

function resolveCanonicalProductTitleFromRow(row: ProductPerformanceRow) {
  return String(
    row.productTitle ?? row.name ?? row.title ?? row.entityLabel ?? row.productItemId ?? "",
  ).trim();
}

function buildProductSupport(aggregates: ProductAggregate[]) {
  const totalSpend = aggregates.reduce((sum, row) => sum + row.spend, 0);
  const totalRevenue = aggregates.reduce((sum, row) => sum + row.revenue, 0);
  const accountAverageRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const productTitles: string[] = [];
  const winnerTitles: string[] = [];
  const underperformingTitles: string[] = [];
  const hiddenWinnerTitles: string[] = [];

  const byRevenue = [...aggregates].sort(
    (left, right) => right.revenue - left.revenue || left.title.localeCompare(right.title),
  );

  for (const row of aggregates) {
    const normalizedTitle = normalizeTitle(row.title);
    if (!normalizedTitle) continue;
    const spendShare = totalSpend > 0 ? (row.spend / totalSpend) * 100 : 0;
    const revenueShare = totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
    const roas = row.spend > 0 ? row.revenue / row.spend : 0;
    const isScale = roas > accountAverageRoas && revenueShare > spendShare;
    const isHiddenWinner =
      !isScale && roas > Math.max(accountAverageRoas * 1.4, 3) && spendShare < 5;
    const isUnderperforming =
      !isScale &&
      !isHiddenWinner &&
      row.spend > Math.max(20, totalSpend * 0.04) &&
      roas < accountAverageRoas;

    productTitles.push(normalizedTitle);
    if (isScale || isHiddenWinner) winnerTitles.push(normalizedTitle);
    if (isUnderperforming) underperformingTitles.push(normalizedTitle);
    if (isHiddenWinner) hiddenWinnerTitles.push(normalizedTitle);
  }

  return {
    productTitles,
    winnerTitles,
    underperformingTitles,
    hiddenWinnerTitles,
    productCount: productTitles.length,
    scaleProductCount: winnerTitles.filter((title) => !hiddenWinnerTitles.includes(title)).length,
    underperformingProductCount: underperformingTitles.length,
    hiddenWinnerCount: hiddenWinnerTitles.length,
    topRevenueTitles: byRevenue
      .map((row) => normalizeTitle(row.title))
      .filter(Boolean)
      .slice(0, 8),
  } satisfies GoogleAdsAdvisorProductSupport;
}

export function buildGoogleAdsAdvisorProductSupportFromDailyRows(
  rows: GoogleAdsWarehouseDailyRow[],
) {
  const byTitle = new Map<string, ProductAggregate>();
  for (const row of rows) {
    const title = resolveCanonicalProductTitleFromDailyRow(row);
    const normalizedTitle = normalizeTitle(title);
    if (!normalizedTitle) continue;
    const current =
      byTitle.get(normalizedTitle) ?? {
        title,
        spend: 0,
        revenue: 0,
        conversions: 0,
      };
    current.spend += toNumber(row.spend);
    current.revenue += toNumber(row.revenue);
    current.conversions += toNumber(row.conversions);
    if (!current.title) current.title = title;
    byTitle.set(normalizedTitle, current);
  }
  return buildProductSupport(Array.from(byTitle.values()));
}

export function buildGoogleAdsAdvisorProductSupportFromRows(rows: ProductPerformanceRow[]) {
  const byTitle = new Map<string, ProductAggregate>();
  for (const row of rows) {
    const title = resolveCanonicalProductTitleFromRow(row);
    const normalizedTitle = normalizeTitle(title);
    if (!normalizedTitle) continue;
    const current =
      byTitle.get(normalizedTitle) ?? {
        title,
        spend: 0,
        revenue: 0,
        conversions: 0,
      };
    current.spend += toNumber(row.spend);
    current.revenue += toNumber(row.revenue);
    current.conversions += toNumber(row.conversions);
    if (!current.title) current.title = title;
    byTitle.set(normalizedTitle, current);
  }
  return buildProductSupport(Array.from(byTitle.values()));
}

export function getEmptyGoogleAdsAdvisorCampaignSupport() {
  return {
    familiesPresent: [] as GoogleCampaignFamily[],
    familyMetricsByFamily: {} as Partial<
      Record<GoogleCampaignFamily, GoogleAdsAdvisorSupportMetrics>
    >,
    totalMetrics: emptyMetrics(),
  } satisfies GoogleAdsAdvisorCampaignSupport;
}

export function getEmptyGoogleAdsAdvisorProductSupport() {
  return {
    productTitles: [] as string[],
    winnerTitles: [] as string[],
    underperformingTitles: [] as string[],
    hiddenWinnerTitles: [] as string[],
    productCount: 0,
    scaleProductCount: 0,
    underperformingProductCount: 0,
    hiddenWinnerCount: 0,
    topRevenueTitles: [] as string[],
  } satisfies GoogleAdsAdvisorProductSupport;
}
