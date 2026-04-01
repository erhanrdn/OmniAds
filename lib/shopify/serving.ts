export const SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS = "shop_local";

export function buildShopifyOverviewCanaryKey(input: {
  startDate: string;
  endDate: string;
  timeZoneBasis?: string;
}) {
  const timeZoneBasis = input.timeZoneBasis ?? SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS;
  return `overview_shopify:${input.startDate}:${input.endDate}:${timeZoneBasis}`;
}
