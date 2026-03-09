export interface GoogleRecommendation {
  id: string;
  title: string;
  description: string;
  impact: "High" | "Med" | "Low";
  summary: string[];
  evidence: Array<{ label: string; value: string }>;
}

export interface GoogleSearchTermRow {
  id: string;
  search_term: string;
  match_type: "Broad" | "Phrase" | "Exact";
  campaign: string;
  ad_group: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
  conv_value: number;
  roas: number;
  cpa: number;
}

export interface GoogleProductRow {
  id: string;
  item_id: string;
  title: string;
  brand: string;
  price: number;
  clicks: number;
  cost: number;
  conversions: number;
  conv_value: number;
  roas: number;
}

export interface GoogleAssetRow {
  id: string;
  asset_group: string;
  asset_type: "image" | "video" | "text";
  asset_name: string;
  performance_label: "Best" | "Good" | "Low";
  cost: number;
  conv_value: number;
  roas: number;
}

export interface ShopifyProductPerformance {
  id: string;
  sku: string;
  title: string;
  category: string;
  adSpend: number;
  revenue: number;
  cogs: number;
  refunds: number;
}


/**
 * MOCK DATA REMOVED
 * All data is now fetched from real Google Ads API endpoints:
 * - /api/google/campaigns
 * - /api/google/ad-groups
 * - /api/google/ads
 * - /api/google/search-terms
 * - /api/google/products
 * - /api/google/assets
 * - /api/google/recommendations
 */

/**
 * Fetch real recommendations from Google Ads account analysis
 */
export async function getGoogleRecommendations(params: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
  accountId?: string;
}): Promise<GoogleRecommendation[]> {
  const url = new URL(
    "/api/google/recommendations",
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  );
  url.searchParams.set("businessId", params.businessId);
  url.searchParams.set("dateRange", params.dateRange);
  if (params.accountId) url.searchParams.set("accountId", params.accountId);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch recommendations: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch real search term data from Google Ads
 */
export async function getGoogleSearchTerms(params: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
  search?: string;
  accountId?: string;
}): Promise<GoogleSearchTermRow[]> {
  const url = new URL(
    "/api/google/search-terms",
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  );
  url.searchParams.set("businessId", params.businessId);
  url.searchParams.set("dateRange", params.dateRange);
  if (params.search) url.searchParams.set("search", params.search);
  if (params.accountId) url.searchParams.set("accountId", params.accountId);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch search terms: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch real product performance data from Google Shopping
 */
export async function getGoogleProducts(params: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
  accountId?: string;
}): Promise<GoogleProductRow[]> {
  const url = new URL(
    "/api/google/products",
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  );
  url.searchParams.set("businessId", params.businessId);
  url.searchParams.set("dateRange", params.dateRange);
  if (params.accountId) url.searchParams.set("accountId", params.accountId);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch real Performance Max asset data
 */
export async function getGoogleAssets(params: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
  accountId?: string;
}): Promise<GoogleAssetRow[]> {
  const url = new URL(
    "/api/google/assets",
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  );
  url.searchParams.set("businessId", params.businessId);
  url.searchParams.set("dateRange", params.dateRange);
  if (params.accountId) url.searchParams.set("accountId", params.accountId);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch assets: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch product performance from Shopify integration (if available)
 * Returns empty array - Shopify integration is separate from Google Ads API
 */
export async function getGoogleShopifyProducts(params: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
}): Promise<ShopifyProductPerformance[]> {
  // Shopify product-level tracking requires separate integration
  // This is a placeholder for future Shopify + Google Ads revenue attribution
  return [];
}
