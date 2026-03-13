import { normalizeChannelType, normalizeCostMicros, normalizeStatus } from "@/lib/google-ads-gaql";

export interface GoogleAdsReportMeta {
  partial: boolean;
  warnings: string[];
  failed_queries: Array<{
    query: string;
    family: string;
    customerId: string;
    message: string;
    status?: number;
    apiStatus?: string;
    apiErrorCode?: string;
  }>;
  unavailable_metrics: string[];
  query_names: string[];
  row_counts: Record<string, number>;
  debug?: Record<string, unknown>;
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

export function getCompatValue(
  record: Record<string, unknown>,
  key: string
): unknown {
  if (key in record) return record[key];
  const camelKey = toCamelCase(key);
  if (camelKey in record) return record[camelKey];
  return undefined;
}

export function getCompatObject(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const value = getCompatValue(record, key);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function asInteger(value: unknown): number {
  return Math.trunc(asNumber(value) ?? 0);
}

export function asRatio(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return parsed;
}

export function microsToCurrencyOrNull(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return normalizeCostMicros(parsed);
}

export function pickFirstNonNull<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

export function ratioToPercent(value: number | null): number | null {
  if (value === null) return null;
  return Number((value * 100).toFixed(2));
}

export function avg(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number");
  if (valid.length === 0) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
}

export function toMetricSet(metrics: Record<string, unknown>) {
  const impressions = asInteger(getCompatValue(metrics, "impressions"));
  const clicks = asInteger(getCompatValue(metrics, "clicks"));
  const spend = microsToCurrencyOrNull(getCompatValue(metrics, "cost_micros")) ?? 0;
  const conversions = asNumber(getCompatValue(metrics, "conversions")) ?? 0;
  const conversionValue = asNumber(getCompatValue(metrics, "conversions_value")) ?? 0;
  const interactions = asInteger(getCompatValue(metrics, "interactions"));
  const videoViews = asInteger(getCompatValue(metrics, "video_views"));
  const engagements = asInteger(getCompatValue(metrics, "engagements"));
  const ctr =
    impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
  const averageCpc =
    clicks > 0 ? Number((spend / clicks).toFixed(2)) : null;
  const conversionRate =
    clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(2)) : null;
  const valuePerConversion =
    conversions > 0 ? Number((conversionValue / conversions).toFixed(2)) : null;
  const costPerConversion =
    conversions > 0 ? Number((spend / conversions).toFixed(2)) : null;
  const averageCost =
    interactions > 0 ? Number((spend / interactions).toFixed(2)) : null;
  const roas =
    spend > 0 ? Number((conversionValue / spend).toFixed(2)) : 0;
  const cpa = conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0;
  const interactionRate =
    impressions > 0 && interactions > 0
      ? Number(((interactions / impressions) * 100).toFixed(2))
      : null;
  const videoViewRate =
    impressions > 0 && videoViews > 0
      ? Number(((videoViews / impressions) * 100).toFixed(2))
      : null;
  const engagementRate =
    impressions > 0 && engagements > 0
      ? Number(((engagements / impressions) * 100).toFixed(2))
      : null;

  return {
    impressions,
    clicks,
    spend,
    conversions,
    conversionValue,
    ctr,
    interactionRate,
    interactions,
    conversionRate,
    valuePerConversion,
    costPerConversion,
    averageCpc,
    averageCost,
    roas,
    cpa,
    videoViews,
    videoViewRate,
    averageCpv: null,
    engagements,
    engagementRate,
  };
}

export function normalizeCampaignRow(row: Record<string, unknown>) {
  const campaign = getCompatObject(row, "campaign");
  const metrics = getCompatObject(row, "metrics");
  const data = toMetricSet(metrics);
  return {
    id: asString(getCompatValue(campaign, "id")) ?? "unknown",
    name: asString(getCompatValue(campaign, "name")) ?? "Unnamed Campaign",
    status: normalizeStatus(asString(getCompatValue(campaign, "status")) ?? undefined),
    channel: normalizeChannelType(
      asString(getCompatValue(campaign, "advertising_channel_type")) ?? undefined
    ),
    servingStatus: asString(getCompatValue(campaign, "serving_status")) ?? null,
    impressions: data.impressions,
    clicks: data.clicks,
    spend: data.spend,
    conversions: data.conversions,
    revenue: data.conversionValue,
    roas: data.roas,
    cpa: data.cpa,
    ctr: data.ctr ?? 0,
    cpc: data.averageCpc,
    averageCost: data.averageCost,
    interactions: data.interactions,
    interactionRate: data.interactionRate,
    conversionRate: data.conversionRate,
    costPerConversion: data.costPerConversion,
    valuePerConversion: data.valuePerConversion,
  };
}

export function createEmptyMeta(debug = false): GoogleAdsReportMeta {
  return {
    partial: false,
    warnings: [],
    failed_queries: [],
    unavailable_metrics: [],
    query_names: [],
    row_counts: {},
    ...(debug ? { debug: {} } : {}),
  };
}
