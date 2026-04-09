import type { Ga4UserFacingRouteReportType } from "@/lib/ga4-user-facing-reports";

export const GA4_AUTO_WARM_DATE_WINDOWS = [
  { label: "30d", days: 30 },
  { label: "7d", days: 7 },
] as const;

export type Ga4AutoWarmDateWindow = (typeof GA4_AUTO_WARM_DATE_WINDOWS)[number];

export type Ga4AutoWarmDetailRequest =
  | { reportType: "ga4_detailed_audience" }
  | { reportType: "ga4_detailed_cohorts" }
  | { reportType: "ga4_detailed_demographics"; dimension: "country" }
  | { reportType: "ga4_landing_page_performance_v1" }
  | { reportType: "ga4_detailed_landing_pages" }
  | { reportType: "ga4_detailed_products" };

// Non-default windows and non-country demographics stay manual via
// `npm run reporting:cache:warm`.
export const GA4_AUTO_WARM_DETAIL_REQUESTS = [
  { reportType: "ga4_detailed_audience" },
  { reportType: "ga4_detailed_cohorts" },
  { reportType: "ga4_detailed_demographics", dimension: "country" },
  { reportType: "ga4_landing_page_performance_v1" },
  { reportType: "ga4_detailed_landing_pages" },
  { reportType: "ga4_detailed_products" },
] as const satisfies readonly Ga4AutoWarmDetailRequest[];

export function isGa4AutoWarmWindowDays(days: number) {
  return GA4_AUTO_WARM_DATE_WINDOWS.some((window) => window.days === days);
}

export function isGa4AutoWarmDemographicsDimension(
  dimension: string | null | undefined,
): dimension is "country" {
  return dimension === "country";
}

export function isGa4AutoWarmDetailReportType(
  reportType: string,
): reportType is Exclude<Ga4UserFacingRouteReportType, "ga4_analytics_overview"> {
  return GA4_AUTO_WARM_DETAIL_REQUESTS.some((entry) => entry.reportType === reportType);
}

export function isGa4AutoWarmDetailRequest(input: {
  reportType: string;
  dimension?: string | null;
}) {
  if (!isGa4AutoWarmDetailReportType(input.reportType)) {
    return false;
  }
  if (input.reportType === "ga4_detailed_demographics") {
    return isGa4AutoWarmDemographicsDimension(input.dimension);
  }
  return input.dimension == null;
}

export const SHOPIFY_AUTOMATED_OVERVIEW_SNAPSHOT_REPORT_TYPE =
  "overview_shopify_orders_aggregate_v6" as const;

export type ShopifyOverviewSnapshotWarmGateInput = {
  materializeOverviewState?: boolean;
};

export function shouldAutoWarmShopifyOverviewSnapshot(
  input?: ShopifyOverviewSnapshotWarmGateInput,
) {
  return input?.materializeOverviewState !== false;
}
