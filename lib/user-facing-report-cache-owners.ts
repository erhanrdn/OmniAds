import { getGa4EcommerceFallbackData } from "@/lib/ga4-ecommerce-fallback";
import {
  GA4_DEMOGRAPHICS_DIMENSIONS,
  type Ga4DemographicsDimension,
  type Ga4UserFacingRouteReportType,
  GA4_USER_FACING_ROUTE_REPORT_TYPES,
  getGa4UserFacingRoutePayload,
} from "@/lib/ga4-user-facing-reports";
import { getReportingDateRangeKey } from "@/lib/reporting-cache";
import {
  writeCachedReportSnapshot,
  writeCachedRouteReport,
} from "@/lib/reporting-cache-writer";
import { getShopifyOverviewAggregate } from "@/lib/shopify/overview";

export const USER_FACING_REPORT_CACHE_TYPES = [
  ...GA4_USER_FACING_ROUTE_REPORT_TYPES,
  "ecommerce_fallback",
  "overview_shopify_orders_aggregate_v6",
] as const;

export type UserFacingReportCacheType = (typeof USER_FACING_REPORT_CACHE_TYPES)[number];

function normalizeDemographicsDimension(
  value: string | null | undefined,
): Ga4DemographicsDimension {
  if (GA4_DEMOGRAPHICS_DIMENSIONS.includes(value as Ga4DemographicsDimension)) {
    return value as Ga4DemographicsDimension;
  }
  return "country";
}

function buildRouteSearchParams(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  dimension?: string | null;
}) {
  const searchParams = new URLSearchParams({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (input.dimension) {
    searchParams.set("dimension", input.dimension);
  }
  return searchParams;
}

export async function warmGa4UserFacingRouteReportCache(input: {
  businessId: string;
  reportType: Ga4UserFacingRouteReportType;
  startDate: string;
  endDate: string;
  dimension?: string | null;
}) {
  const normalizedDimension =
    input.reportType === "ga4_detailed_demographics"
      ? normalizeDemographicsDimension(input.dimension)
      : null;
  const searchParams = buildRouteSearchParams({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    dimension: normalizedDimension,
  });
  const payload = await getGa4UserFacingRoutePayload({
    businessId: input.businessId,
    reportType: input.reportType,
    startDate: input.startDate,
    endDate: input.endDate,
    dimension: normalizedDimension,
  });

  await writeCachedRouteReport({
    businessId: input.businessId,
    provider: "ga4",
    reportType: input.reportType,
    searchParams,
    payload,
  });

  return {
    provider: "ga4" as const,
    reportType: input.reportType,
    startDate: input.startDate,
    endDate: input.endDate,
    dimension: normalizedDimension,
    cacheType: "route_snapshot" as const,
  };
}

export async function warmGa4EcommerceFallbackCache(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const payload = await getGa4EcommerceFallbackData(
    input.businessId,
    input.startDate,
    input.endDate,
  );
  if (!payload) {
    return {
      provider: "ga4" as const,
      reportType: "ecommerce_fallback" as const,
      startDate: input.startDate,
      endDate: input.endDate,
      cacheType: "snapshot" as const,
      wrote: false,
    };
  }

  await writeCachedReportSnapshot({
    businessId: input.businessId,
    provider: "ga4",
    reportType: "ecommerce_fallback",
    dateRangeKey: getReportingDateRangeKey(input.startDate, input.endDate),
    payload,
  });

  return {
    provider: "ga4" as const,
    reportType: "ecommerce_fallback" as const,
    startDate: input.startDate,
    endDate: input.endDate,
    cacheType: "snapshot" as const,
    wrote: true,
  };
}

export async function warmShopifyOverviewReportCache(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const payload = await getShopifyOverviewAggregate({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (!payload) {
    return {
      provider: "shopify" as const,
      reportType: "overview_shopify_orders_aggregate_v6" as const,
      startDate: input.startDate,
      endDate: input.endDate,
      cacheType: "snapshot" as const,
      wrote: false,
    };
  }

  await writeCachedReportSnapshot({
    businessId: input.businessId,
    provider: "shopify",
    reportType: "overview_shopify_orders_aggregate_v6",
    dateRangeKey: getReportingDateRangeKey(input.startDate, input.endDate),
    payload,
  });

  return {
    provider: "shopify" as const,
    reportType: "overview_shopify_orders_aggregate_v6" as const,
    startDate: input.startDate,
    endDate: input.endDate,
    cacheType: "snapshot" as const,
    wrote: true,
  };
}

export async function warmUserFacingReportCache(input: {
  businessId: string;
  reportType: UserFacingReportCacheType;
  startDate: string;
  endDate: string;
  dimension?: string | null;
}) {
  if (
    (GA4_USER_FACING_ROUTE_REPORT_TYPES as readonly string[]).includes(input.reportType)
  ) {
    return warmGa4UserFacingRouteReportCache({
      businessId: input.businessId,
      reportType: input.reportType as Ga4UserFacingRouteReportType,
      startDate: input.startDate,
      endDate: input.endDate,
      dimension: input.dimension,
    });
  }
  if (input.reportType === "ecommerce_fallback") {
    return warmGa4EcommerceFallbackCache({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    });
  }
  if (input.reportType === "overview_shopify_orders_aggregate_v6") {
    return warmShopifyOverviewReportCache({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    });
  }
  throw new Error(`Unsupported user-facing report cache type: ${input.reportType}`);
}
