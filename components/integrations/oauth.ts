import { IntegrationProvider } from "@/store/integrations-store";

const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  shopify: "Shopify",
  meta: "Meta",
  google: "Google",
  search_console: "Google Search Console",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  ga4: "GA4",
};

export function getOAuthStartUrl(
  provider: IntegrationProvider,
  businessId: string,
  returnTo: string,
  options?: { shop?: string },
) {
  // GA4 uses a different route segment than the provider name
  const routeProvider =
    provider === "ga4"
      ? "google-analytics"
      : provider === "search_console"
        ? "google"
        : provider;
  const url = `/api/oauth/${routeProvider}/start?businessId=${businessId}&returnTo=${encodeURIComponent(
    returnTo,
  )}${provider === "search_console" ? "&provider=search_console" : ""}`;
  if (options?.shop) {
    return `${url}&shop=${encodeURIComponent(options.shop)}`;
  }
  return url;
}

export function getProviderLabel(provider: IntegrationProvider) {
  return PROVIDER_LABELS[provider];
}

export const OAUTH_PERMISSIONS: Record<IntegrationProvider, string[]> = {
  shopify: [
    "Read store events",
    "Read orders and products",
    "Sync conversion signals",
  ],
  meta: [
    "Read ads and campaigns",
    "Read ad account insights",
    "Manage attribution sync",
  ],
  google: [
    "Read campaigns and ad groups",
    "Read performance metrics",
    "Sync conversion data",
  ],
  search_console: [
    "Read Search Console properties",
    "Read query and page performance metrics",
    "Sync organic search visibility signals",
  ],
  tiktok: [
    "Read campaigns and creatives",
    "Read ad account insights",
    "Sync performance data",
  ],
  pinterest: [
    "Read campaign analytics",
    "Read pin-level performance",
    "Sync audience signals",
  ],
  snapchat: [
    "Read campaigns and ads",
    "Read spend and conversion metrics",
    "Sync reporting",
  ],
  ga4: [
    "Read GA4 properties",
    "Read sessions and conversion events",
    "Sync landing page performance signals",
  ],
};
