import { IntegrationProvider } from "@/store/integrations-store";

const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  shopify: "Shopify",
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  ga4: "GA4",
};

export function getOAuthStartUrl(
  provider: IntegrationProvider,
  businessId: string,
  returnTo: string
) {
  return `/api/oauth/${provider}/start?businessId=${businessId}&returnTo=${encodeURIComponent(
    returnTo
  )}`;
}

export function getProviderLabel(provider: IntegrationProvider) {
  return PROVIDER_LABELS[provider];
}

export const OAUTH_PERMISSIONS: Record<IntegrationProvider, string[]> = {
  shopify: ["Read store events", "Read orders and products", "Sync conversion signals"],
  meta: ["Read ads and campaigns", "Read ad account insights", "Manage attribution sync"],
  google: ["Read campaigns and ad groups", "Read performance metrics", "Sync conversion data"],
  tiktok: ["Read campaigns and creatives", "Read ad account insights", "Sync performance data"],
  pinterest: ["Read campaign analytics", "Read pin-level performance", "Sync audience signals"],
  snapchat: ["Read campaigns and ads", "Read spend and conversion metrics", "Sync reporting"],
  ga4: [
    "Read GA4 properties",
    "Read sessions and conversion events",
    "Sync landing page performance signals",
  ],
};
