import { buildApiUrl, getApiOrigin } from "@/src/services/data-service-support";
import { DateRange, MetricsRow, Platform, PlatformLevel, PlatformTableRow } from "@/src/types";

function selectMetrics(
  metrics: Array<keyof MetricsRow>,
  source: Partial<MetricsRow>
): Partial<MetricsRow> {
  return metrics.reduce<Partial<MetricsRow>>((acc, key) => {
    const value = source[key];
    if (typeof value !== "undefined") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function toGoogleMetrics(data: any): Partial<MetricsRow> {
  return {
    impressions: data.metrics.impressions || 0,
    clicks: data.metrics.clicks || 0,
    purchases: data.metrics.conversions || 0,
    conversions: data.metrics.conversions || 0,
    spend: data.metrics.spend || 0,
    revenue: data.metrics.revenue || 0,
    ctr: data.metrics.ctr || 0,
    cpm: data.metrics.cpm || 0,
    cpc: data.metrics.cpc || 0,
    cpa: data.metrics.cpa || 0,
    roas: data.metrics.roas || 0,
  };
}

function buildGoogleTransformRow(level: PlatformLevel) {
  if (level === PlatformLevel.ACCOUNT) {
    return (data: any, _: string): PlatformTableRow => ({
      id: data.id,
      name: data.name,
      level: PlatformLevel.ACCOUNT,
      status: data.status,
      platform: Platform.GOOGLE,
      accountId: data.accountId,
      metrics: toGoogleMetrics(data),
    });
  }

  if (level === PlatformLevel.CAMPAIGN) {
    return (data: any, accountId: string): PlatformTableRow => ({
      id: data.id,
      name: data.name,
      level: PlatformLevel.CAMPAIGN,
      status: data.status,
      platform: Platform.GOOGLE,
      accountId,
      metrics: toGoogleMetrics(data),
    });
  }

  if (level === PlatformLevel.AD_SET) {
    return (data: any, accountId: string): PlatformTableRow => ({
      id: data.id,
      name: data.name,
      level: PlatformLevel.AD_SET,
      status: data.status,
      platform: Platform.GOOGLE,
      accountId,
      metrics: toGoogleMetrics(data),
    });
  }

  if (level === PlatformLevel.AD) {
    return (data: any, accountId: string): PlatformTableRow => ({
      id: data.id,
      name: data.name,
      level: PlatformLevel.AD,
      status: data.status,
      platform: Platform.GOOGLE,
      accountId,
      metrics: toGoogleMetrics(data),
    });
  }

  return null;
}

function getGoogleEndpoint(level: PlatformLevel) {
  if (level === PlatformLevel.ACCOUNT) return "/accounts";
  if (level === PlatformLevel.CAMPAIGN) return "/campaigns";
  if (level === PlatformLevel.AD_SET) return "/ad-groups";
  if (level === PlatformLevel.AD) return "/ads";
  return null;
}

function getGoogleDateRangeParam(dateRange: DateRange) {
  if (dateRange.startDate === dateRange.endDate) return "30";
  return Math.ceil(
    (new Date(dateRange.endDate).getTime() - new Date(dateRange.startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  ).toString();
}

export async function getGooglePlatformTable(
  level: PlatformLevel,
  businessId: string,
  accountId: string | null,
  dateRange: DateRange,
  metrics: Array<keyof MetricsRow>
): Promise<PlatformTableRow[]> {
  const apiUrl = `${getApiOrigin()}/api/google`;
  const endpoint = getGoogleEndpoint(level);
  const transformRow = buildGoogleTransformRow(level);

  if (!endpoint || !transformRow) {
    return [];
  }

  try {
    const url = buildApiUrl(apiUrl + endpoint, apiUrl + endpoint);
    url.searchParams.set("businessId", businessId);
    url.searchParams.set("dateRange", getGoogleDateRangeParam(dateRange));

    if (accountId && accountId !== "all") {
      url.searchParams.set("accountId", accountId);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`Failed to fetch Google Ads ${level} data:`, response.statusText);
      return [];
    }

    const data = await response.json();
    const rows = data.data || [];
    const rowAccountId = accountId && accountId !== "all" ? accountId : "all";

    return rows.map((row: any) => {
      const transformed = transformRow(row, rowAccountId);
      return {
        ...transformed,
        metrics: selectMetrics(metrics, transformed.metrics),
      };
    });
  } catch (error) {
    console.error("[getPlatformTable] Error fetching Google Ads data:", error);
    return [];
  }
}
