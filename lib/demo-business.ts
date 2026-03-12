export const DEMO_BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_BUSINESS_NAME = "Adsecute Demo";

export interface DemoBusinessSummary {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  role: "admin";
  membershipStatus: "active";
  isDemoBusiness: true;
  industry: "ecommerce";
  platform: "shopify";
}

export function isDemoBusinessId(businessId: string | null | undefined): boolean {
  return businessId === DEMO_BUSINESS_ID;
}

export function getDemoBusinessSummary(): DemoBusinessSummary {
  return {
    id: DEMO_BUSINESS_ID,
    name: DEMO_BUSINESS_NAME,
    timezone: "America/Los_Angeles",
    currency: "USD",
    role: "admin",
    membershipStatus: "active",
    isDemoBusiness: true,
    industry: "ecommerce",
    platform: "shopify",
  };
}

type ProductRow = {
  product_id: string;
  title: string;
  category: string;
  price: number;
  compare_at_price: number;
  description: string;
  image_url: string;
  inventory: number;
  reviews_count: number;
  rating: number;
};

export const DEMO_PRODUCTS: ProductRow[] = [
  { product_id: "ut-001", title: "UrbanTrail Explorer Backpack", category: "Backpacks", price: 89, compare_at_price: 109, description: "All-day carry backpack with weather-resistant shell.", image_url: "/demo/urbantrail/explorer-backpack.svg", inventory: 142, reviews_count: 324, rating: 4.7 },
  { product_id: "ut-002", title: "UrbanTrail Travel Duffel", category: "Travel Bags", price: 99, compare_at_price: 119, description: "Convertible duffel with structured base and shoe pocket.", image_url: "/demo/urbantrail/travel-duffel.svg", inventory: 98, reviews_count: 201, rating: 4.6 },
  { product_id: "ut-003", title: "UrbanTrail Daypack Lite", category: "Backpacks", price: 59, compare_at_price: 79, description: "Lightweight everyday daypack with breathable back panel.", image_url: "/demo/urbantrail/daypack-lite.svg", inventory: 210, reviews_count: 186, rating: 4.5 },
  { product_id: "ut-004", title: "UrbanTrail Hiking Backpack Pro", category: "Backpacks", price: 129, compare_at_price: 149, description: "Technical hiking pack with frame support and hydration slot.", image_url: "/demo/urbantrail/hiking-pro.svg", inventory: 76, reviews_count: 273, rating: 4.8 },
  { product_id: "ut-005", title: "UrbanTrail Travel Organizer", category: "Organizers", price: 29, compare_at_price: 39, description: "Compact organizer for cables, passport, and accessories.", image_url: "/demo/urbantrail/travel-organizer.svg", inventory: 391, reviews_count: 149, rating: 4.4 },
  { product_id: "ut-006", title: "UrbanTrail Waterproof Backpack", category: "Backpacks", price: 109, compare_at_price: 129, description: "Roll-top waterproof backpack for rain and outdoor trips.", image_url: "/demo/urbantrail/waterproof-backpack.svg", inventory: 81, reviews_count: 228, rating: 4.7 },
  { product_id: "ut-007", title: "UrbanTrail Laptop Travel Bag", category: "Travel Bags", price: 79, compare_at_price: 99, description: "Padded 16-inch laptop compartment with TSA-friendly layout.", image_url: "/demo/urbantrail/laptop-travel-bag.svg", inventory: 117, reviews_count: 167, rating: 4.6 },
  { product_id: "ut-008", title: "UrbanTrail Packing Cubes", category: "Organizers", price: 39, compare_at_price: 49, description: "Set of 4 compression cubes for efficient packing.", image_url: "/demo/urbantrail/packing-cubes.svg", inventory: 260, reviews_count: 118, rating: 4.5 },
  { product_id: "ut-009", title: "UrbanTrail Carry-On Backpack", category: "Backpacks", price: 119, compare_at_price: 139, description: "Airline-ready carry-on backpack with clamshell opening.", image_url: "/demo/urbantrail/carry-on-backpack.svg", inventory: 69, reviews_count: 301, rating: 4.8 },
  { product_id: "ut-010", title: "UrbanTrail Hiking Waist Pack", category: "Accessories", price: 35, compare_at_price: 45, description: "Slim waist pack for essentials on trail runs and day hikes.", image_url: "/demo/urbantrail/waist-pack.svg", inventory: 238, reviews_count: 92, rating: 4.3 },
  { product_id: "ut-011", title: "UrbanTrail Adventure Backpack", category: "Backpacks", price: 95, compare_at_price: 119, description: "Multi-use pack for commuting, gym, and weekend escapes.", image_url: "/demo/urbantrail/adventure-backpack.svg", inventory: 121, reviews_count: 211, rating: 4.6 },
  { product_id: "ut-012", title: "UrbanTrail Outdoor Sling Bag", category: "Accessories", price: 49, compare_at_price: 65, description: "Crossbody sling bag with anti-theft zip and quick-access pockets.", image_url: "/demo/urbantrail/outdoor-sling.svg", inventory: 184, reviews_count: 133, rating: 4.5 },
];

export function getDemoIntegrations() {
  const now = new Date().toISOString();
  const providers = [
    "shopify",
    "meta",
    "google",
    "ga4",
    "search_console",
    "tiktok",
    "pinterest",
    "snapchat",
  ];
  return providers.map((provider) => ({
    id: `demo-${provider}`,
    business_id: DEMO_BUSINESS_ID,
    provider,
    status: provider === "tiktok" || provider === "pinterest" || provider === "snapchat" ? "disconnected" : "connected",
    provider_account_id: provider === "google" ? "5241455382" : provider === "meta" ? "act_210009998877" : null,
    provider_account_name: provider === "google" ? "UrbanTrail US" : provider === "meta" ? "UrbanTrail DTC" : null,
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    scopes: null,
    error_message: null,
    metadata:
      provider === "ga4"
        ? { propertyId: "3322114455", propertyName: "UrbanTrail Store GA4", propertyResourceName: "properties/3322114455", selectedAt: now }
        : provider === "search_console"
          ? { siteUrl: "sc-domain:urbantrail.co", siteType: "domain", propertyName: "urbantrail.co", connectedAt: now }
          : provider === "shopify"
            ? { storeName: "UrbanTrail", platform: "shopify", syncedAt: now }
            : {},
    connected_at: now,
    disconnected_at: null,
    created_at: now,
    updated_at: now,
  }));
}

export function getDemoOverview() {
  return {
    businessId: DEMO_BUSINESS_ID,
    dateRange: { startDate: "2026-02-10", endDate: "2026-03-11" },
    kpis: { spend: 38240, revenue: 124860, roas: 3.27, purchases: 1420, cpa: 26.93, aov: 87.93 },
    totals: {
      impressions: 2361800,
      clicks: 81220,
      purchases: 1420,
      spend: 38240,
      conversions: 1710,
      revenue: 124860,
      ctr: 3.44,
      cpm: 16.19,
      cpc: 0.47,
      cpa: 26.93,
      roas: 3.27,
    },
    platformEfficiency: [
      { platform: "Meta", spend: 21420, revenue: 72890, roas: 3.4, purchases: 816, cpa: 26.25 },
      { platform: "Google", spend: 14540, revenue: 46580, roas: 3.2, purchases: 521, cpa: 27.91 },
      { platform: "Organic", spend: 0, revenue: 5390, roas: 0, purchases: 83, cpa: 0 },
    ],
    trends: {
      "7d": [],
      "14d": [],
      "30d": [
        { label: "Feb 10", spend: 980, revenue: 3140, purchases: 36 },
        { label: "Feb 15", spend: 1230, revenue: 3780, purchases: 44 },
        { label: "Feb 20", spend: 1270, revenue: 4010, purchases: 45 },
        { label: "Feb 25", spend: 1320, revenue: 4250, purchases: 48 },
        { label: "Mar 01", spend: 1410, revenue: 4510, purchases: 51 },
        { label: "Mar 06", spend: 1490, revenue: 4720, purchases: 54 },
        { label: "Mar 11", spend: 1560, revenue: 4890, purchases: 56 },
      ],
      custom: [],
    },
  };
}

export function getDemoAnalyticsOverview() {
  return {
    propertyName: "UrbanTrail Store GA4",
    kpis: {
      sessions: 48210,
      engagedSessions: 27110,
      engagementRate: 0.562,
      purchases: 1184,
      purchaseCvr: 0.0246,
      revenue: 96420,
      avgSessionDuration: 112.4,
    },
    newVsReturning: {
      new: { sessions: 29840, purchases: 592, purchaseCvr: 0.0198 },
      returning: { sessions: 18370, purchases: 592, purchaseCvr: 0.0322 },
    },
    insights: [
      { type: "positive", text: "Returning users convert 1.6x above new users." },
      { type: "opportunity", text: "Top 3 landing pages drive 58% of sessions but only 42% of purchases." },
    ],
  };
}

export function getDemoAnalyticsProducts() {
  const rows = DEMO_PRODUCTS.map((p, i) => {
    const views = 4800 - i * 260;
    const addToCart = Math.round(views * (0.11 + ((i % 4) * 0.02)));
    const checkouts = Math.round(addToCart * (0.62 - ((i % 3) * 0.05)));
    const purchases = Math.round(checkouts * (0.54 - ((i % 5) * 0.04)));
    const revenue = Number((p.price * purchases).toFixed(2));
    return {
      product: p.title,
      views,
      addToCart,
      checkouts,
      purchases,
      revenue,
      addToCartRate: views > 0 ? addToCart / views : 0,
      checkoutRate: addToCart > 0 ? checkouts / addToCart : 0,
      purchaseRate: checkouts > 0 ? purchases / checkouts : 0,
    };
  });
  return { rows, products: rows, meta: { empty: false, has_ecommerce_data: true, reason: null } };
}

export function getDemoAnalyticsLandingPages() {
  return {
    pages: [
      { path: "/products/explorer-backpack", sessions: 8200, engagedSessions: 5220, engagementRate: 0.637, avgEngagementTime: 78, purchases: 302, purchaseCvr: 0.0368, bounceRate: 0.24 },
      { path: "/products/travel-duffel", sessions: 6120, engagedSessions: 3370, engagementRate: 0.551, avgEngagementTime: 63, purchases: 166, purchaseCvr: 0.0271, bounceRate: 0.31 },
      { path: "/products/daypack-lite", sessions: 4750, engagedSessions: 2450, engagementRate: 0.516, avgEngagementTime: 51, purchases: 91, purchaseCvr: 0.0191, bounceRate: 0.37 },
      { path: "/collections/backpacks", sessions: 7210, engagedSessions: 3940, engagementRate: 0.546, avgEngagementTime: 57, purchases: 129, purchaseCvr: 0.0179, bounceRate: 0.34 },
      { path: "/collections/travel-bags", sessions: 5040, engagedSessions: 2680, engagementRate: 0.532, avgEngagementTime: 54, purchases: 101, purchaseCvr: 0.02, bounceRate: 0.36 },
      { path: "/blog/how-to-pack-for-hiking", sessions: 3920, engagedSessions: 2480, engagementRate: 0.633, avgEngagementTime: 111, purchases: 34, purchaseCvr: 0.0087, bounceRate: 0.21 },
      { path: "/blog/best-travel-backpacks", sessions: 4510, engagedSessions: 2920, engagementRate: 0.647, avgEngagementTime: 124, purchases: 57, purchaseCvr: 0.0126, bounceRate: 0.18 },
      { path: "/blog/carry-on-bag-checklist", sessions: 2870, engagedSessions: 1680, engagementRate: 0.585, avgEngagementTime: 96, purchases: 19, purchaseCvr: 0.0066, bounceRate: 0.25 },
    ],
  };
}

export function getDemoAnalyticsAudience() {
  return {
    segments: {
      new: { sessions: 29840, engagedSessions: 15610, engagementRate: 0.523, purchases: 592, revenue: 45280, purchaseCvr: 0.0198 },
      returning: { sessions: 18370, engagedSessions: 11500, engagementRate: 0.626, purchases: 592, revenue: 51140, purchaseCvr: 0.0322 },
    },
    channels: [
      { sourceMedium: "google / cpc", sessions: 12980, engagedSessions: 7240, engagementRate: 0.558, purchases: 332, revenue: 28620, purchaseCvr: 0.0256 },
      { sourceMedium: "facebook / paid_social", sessions: 17110, engagedSessions: 9540, engagementRate: 0.557, purchases: 402, revenue: 32120, purchaseCvr: 0.0235 },
      { sourceMedium: "google / organic", sessions: 8430, engagedSessions: 5390, engagementRate: 0.639, purchases: 216, revenue: 17900, purchaseCvr: 0.0256 },
      { sourceMedium: "(direct) / (none)", sessions: 6420, engagedSessions: 3780, engagementRate: 0.589, purchases: 154, revenue: 13910, purchaseCvr: 0.024 },
    ],
  };
}

const DEMO_DEMOGRAPHICS: Record<string, Array<{ value: string; sessions: number; engagedSessions: number; engagementRate: number; purchases: number; revenue: number; purchaseCvr: number }>> = {
  country: [
    { value: "United States", sessions: 28100, engagedSessions: 16500, engagementRate: 0.587, purchases: 741, revenue: 62320, purchaseCvr: 0.0264 },
    { value: "Canada", sessions: 7140, engagedSessions: 3920, engagementRate: 0.549, purchases: 162, revenue: 12920, purchaseCvr: 0.0227 },
    { value: "United Kingdom", sessions: 5080, engagedSessions: 2930, engagementRate: 0.577, purchases: 123, revenue: 10150, purchaseCvr: 0.0242 },
  ],
  region: [
    { value: "California", sessions: 9420, engagedSessions: 5620, engagementRate: 0.597, purchases: 252, revenue: 21320, purchaseCvr: 0.0268 },
    { value: "Texas", sessions: 5440, engagedSessions: 3110, engagementRate: 0.571, purchases: 138, revenue: 11240, purchaseCvr: 0.0254 },
    { value: "New York", sessions: 4920, engagedSessions: 2860, engagementRate: 0.581, purchases: 119, revenue: 9920, purchaseCvr: 0.0242 },
  ],
  city: [
    { value: "Los Angeles", sessions: 3320, engagedSessions: 2040, engagementRate: 0.614, purchases: 92, revenue: 7740, purchaseCvr: 0.0277 },
    { value: "New York", sessions: 2890, engagedSessions: 1710, engagementRate: 0.592, purchases: 72, revenue: 6060, purchaseCvr: 0.0249 },
    { value: "Toronto", sessions: 1820, engagedSessions: 1010, engagementRate: 0.555, purchases: 41, revenue: 3250, purchaseCvr: 0.0225 },
  ],
  language: [
    { value: "en-us", sessions: 34910, engagedSessions: 20120, engagementRate: 0.576, purchases: 901, revenue: 73820, purchaseCvr: 0.0258 },
    { value: "en-gb", sessions: 6210, engagedSessions: 3530, engagementRate: 0.568, purchases: 151, revenue: 12450, purchaseCvr: 0.0243 },
    { value: "fr-ca", sessions: 2140, engagedSessions: 1160, engagementRate: 0.542, purchases: 47, revenue: 3760, purchaseCvr: 0.022 },
  ],
  userAgeBracket: [
    { value: "25-34", sessions: 16800, engagedSessions: 9760, engagementRate: 0.581, purchases: 442, revenue: 36820, purchaseCvr: 0.0263 },
    { value: "35-44", sessions: 12340, engagedSessions: 7140, engagementRate: 0.579, purchases: 330, revenue: 27910, purchaseCvr: 0.0267 },
    { value: "18-24", sessions: 9210, engagedSessions: 4780, engagementRate: 0.519, purchases: 173, revenue: 12920, purchaseCvr: 0.0188 },
  ],
  userGender: [
    { value: "male", sessions: 24410, engagedSessions: 13890, engagementRate: 0.569, purchases: 601, revenue: 48750, purchaseCvr: 0.0246 },
    { value: "female", sessions: 22620, engagedSessions: 12980, engagementRate: 0.574, purchases: 562, revenue: 46220, purchaseCvr: 0.0248 },
    { value: "unknown", sessions: 1180, engagedSessions: 610, engagementRate: 0.517, purchases: 21, revenue: 1450, purchaseCvr: 0.0178 },
  ],
  brandingInterest: [
    { value: "Travel Buffs", sessions: 12010, engagedSessions: 7230, engagementRate: 0.602, purchases: 336, revenue: 27110, purchaseCvr: 0.028 },
    { value: "Outdoor Enthusiasts", sessions: 9410, engagedSessions: 5560, engagementRate: 0.591, purchases: 266, revenue: 21980, purchaseCvr: 0.0283 },
    { value: "Commuter Professionals", sessions: 7760, engagedSessions: 4150, engagementRate: 0.535, purchases: 165, revenue: 14230, purchaseCvr: 0.0213 },
  ],
};

export function getDemoAnalyticsDemographics(dimension: string) {
  const rows = DEMO_DEMOGRAPHICS[dimension] ?? DEMO_DEMOGRAPHICS.country;
  const sorted = [...rows].sort((a, b) => b.purchaseCvr - a.purchaseCvr);
  const avgPurchaseCvr = rows.reduce((sum, row) => sum + row.purchaseCvr, 0) / rows.length;
  return {
    dimension,
    rows,
    summary: {
      topValue: sorted[0].value,
      topValuePurchaseCvr: sorted[0].purchaseCvr,
      avgPurchaseCvr,
    },
  };
}

export function getDemoAnalyticsCohorts() {
  return {
    cohortWeeks: [
      { week: "2026-W05", newSessions: 3820, returningSessions: 910, newPurchases: 79, returningPurchases: 34, retentionRate: 0.192 },
      { week: "2026-W06", newSessions: 4010, returningSessions: 1012, newPurchases: 82, returningPurchases: 36, retentionRate: 0.201 },
      { week: "2026-W07", newSessions: 4190, returningSessions: 1125, newPurchases: 88, returningPurchases: 39, retentionRate: 0.212 },
      { week: "2026-W08", newSessions: 4310, returningSessions: 1260, newPurchases: 92, returningPurchases: 44, retentionRate: 0.226 },
    ],
    monthlyData: [
      { month: "2025-12", newUsers: 10220, activeUsers: 13850, sessions: 17200, purchases: 372, revenue: 29180, purchaseCvr: 0.0216 },
      { month: "2026-01", newUsers: 11140, activeUsers: 15230, sessions: 18760, purchases: 430, revenue: 34710, purchaseCvr: 0.0229 },
      { month: "2026-02", newUsers: 12980, activeUsers: 17120, sessions: 21140, purchases: 512, revenue: 41880, purchaseCvr: 0.0242 },
      { month: "2026-03", newUsers: 9820, activeUsers: 12750, sessions: 15390, purchases: 354, revenue: 29840, purchaseCvr: 0.023 },
    ],
  };
}

export function getDemoGoogleAdsOverview() {
  return {
    kpis: {
      spend: 14540,
      conversions: 521,
      revenue: 46580,
      roas: 3.2,
      cpa: 27.91,
      ctr: 3.9,
      cpc: 0.74,
      impressions: 789200,
      clicks: 30780,
      convRate: 0.0169,
    },
    topCampaigns: [
      { name: "Backpack Search Campaign", spend: 4620, roas: 3.84, conversions: 171 },
      { name: "Travel Gear Performance Max", spend: 3930, roas: 3.35, conversions: 146 },
      { name: "Brand Campaign", spend: 1880, roas: 5.02, conversions: 112 },
    ],
    insights: [
      { severity: "warning", title: "Summer Hiking Campaign is budget-limited", description: "Lost impression share due to budget is above 24%." },
      { severity: "positive", title: "Brand Campaign efficiency is strong", description: "ROAS 5.0x with low CPA and stable CTR." },
    ],
    period: { startDate: "2026-02-09", endDate: "2026-03-11" },
  };
}

export function getDemoGoogleAdsCampaigns() {
  const data = [
    { id: "g-1", name: "Backpack Search Campaign", status: "active", channel: "Search", spend: 4620, conversions: 171, revenue: 17740, roas: 3.84, cpa: 27.02, ctr: 4.8, cpc: 0.92, impressions: 214100, clicks: 10210, impressionShare: 0.63, lostIsBudget: 0.14, lostIsRank: 0.09, badges: ["strong_performer"] },
    { id: "g-2", name: "Travel Gear Performance Max", status: "active", channel: "Performance Max", spend: 3930, conversions: 146, revenue: 13160, roas: 3.35, cpa: 26.92, ctr: 2.9, cpc: 0.67, impressions: 318200, clicks: 9240, impressionShare: 0.54, lostIsBudget: 0.08, lostIsRank: 0.13, badges: ["strong_performer"] },
    { id: "g-3", name: "Brand Campaign", status: "active", channel: "Search", spend: 1880, conversions: 112, revenue: 9440, roas: 5.02, cpa: 16.79, ctr: 7.5, cpc: 0.41, impressions: 64200, clicks: 4810, impressionShare: 0.86, lostIsBudget: 0.03, lostIsRank: 0.04, badges: ["strong_performer"] },
    { id: "g-4", name: "Summer Hiking Campaign", status: "active", channel: "Search", spend: 2410, conversions: 58, revenue: 6020, roas: 2.5, cpa: 41.55, ctr: 3.4, cpc: 0.96, impressions: 102800, clicks: 3650, impressionShare: 0.41, lostIsBudget: 0.26, lostIsRank: 0.17, badges: ["budget_limited", "high_cpa"] },
    { id: "g-5", name: "Remarketing Display", status: "paused", channel: "Display", spend: 1700, conversions: 34, revenue: 4220, roas: 2.48, cpa: 50, ctr: 1.2, cpc: 0.58, impressions: 90000, clicks: 2870, impressionShare: 0.38, lostIsBudget: 0.19, lostIsRank: 0.21, badges: ["high_cpa", "wasted_spend"] },
  ];
  return { data, count: data.length, accountAvgRoas: 3.2, accountAvgCpa: 27.91, meta: { empty: false } };
}

export function getDemoGoogleAdsSearchTerms() {
  const data = [
    { searchTerm: "best travel backpack", status: "ADDED", campaign: "Backpack Search Campaign", adGroup: "Travel Core", spend: 820, conversions: 31, revenue: 3340, roas: 4.07, cpa: 26.45, ctr: 5.4, impressions: 12240, clicks: 661, intent: "commercial", isKeyword: true },
    { searchTerm: "waterproof hiking backpack", status: "NONE", campaign: "Summer Hiking Campaign", adGroup: "Hiking", spend: 710, conversions: 12, revenue: 1080, roas: 1.52, cpa: 59.17, ctr: 3.1, impressions: 15300, clicks: 474, intent: "transactional", isKeyword: false },
    { searchTerm: "carry on backpack for travel", status: "ADDED", campaign: "Backpack Search Campaign", adGroup: "Carry On", spend: 540, conversions: 24, revenue: 2560, roas: 4.74, cpa: 22.5, ctr: 4.6, impressions: 9800, clicks: 451, intent: "transactional", isKeyword: true },
    { searchTerm: "cheap camping backpack", status: "NONE", campaign: "Summer Hiking Campaign", adGroup: "Generic", spend: 450, conversions: 3, revenue: 190, roas: 0.42, cpa: 150, ctr: 2.1, impressions: 12020, clicks: 256, intent: "commercial", isKeyword: false },
  ];
  return {
    data,
    count: data.length,
    summary: {
      wastefulCount: 2,
      negativeKeywordCandidates: 1,
      highPerformingCount: 2,
      keywordOpportunities: 1,
      wastefulSpend: 1160,
    },
  };
}

export function getDemoGoogleAdsKeywords() {
  return {
    data: [
      { keyword: "travel backpack", matchType: "broad", campaign: "Backpack Search Campaign", adGroup: "Travel Core", status: "active", spend: 1030, conversions: 39, revenue: 3620, roas: 3.51, cpa: 26.41, ctr: 4.7, cpc: 0.89, qualityScore: 8 },
      { keyword: "waterproof backpack", matchType: "phrase", campaign: "Summer Hiking Campaign", adGroup: "Hiking", status: "active", spend: 760, conversions: 17, revenue: 1420, roas: 1.87, cpa: 44.71, ctr: 3.2, cpc: 1.02, qualityScore: 6 },
      { keyword: "urbantrail backpack", matchType: "exact", campaign: "Brand Campaign", adGroup: "Brand", status: "active", spend: 390, conversions: 31, revenue: 2810, roas: 7.21, cpa: 12.58, ctr: 8.4, cpc: 0.33, qualityScore: 9 },
    ],
    count: 3,
    insights: [
      { severity: "critical", title: "High spend low-return keyword", description: "\"waterproof backpack\" has below-target ROAS and high CPA." },
    ],
  };
}

export function getDemoGoogleAdsAds() {
  return {
    data: [
      { adId: "ad-1", headline: "Carry-On Backpack Built for Weekend Trips", campaign: "Backpack Search Campaign", status: "active", spend: 970, conversions: 44, revenue: 4380, roas: 4.52, ctr: 5.3, cpa: 22.05 },
      { adId: "ad-2", headline: "Waterproof Hiking Backpack | UrbanTrail", campaign: "Summer Hiking Campaign", status: "active", spend: 860, conversions: 14, revenue: 1290, roas: 1.5, ctr: 3.1, cpa: 61.43 },
      { adId: "ad-3", headline: "UrbanTrail Official Site - Free Shipping", campaign: "Brand Campaign", status: "active", spend: 420, conversions: 35, revenue: 3170, roas: 7.55, ctr: 9.1, cpa: 12 },
    ],
    count: 3,
    insights: [{ severity: "opportunity", title: "Scale top ad", description: "Ad-1 has high ROAS and room for budget expansion." }],
  };
}

export function getDemoGoogleAdsCreatives() {
  return {
    data: [
      { creativeId: "gcr-1", name: "UGC Weekend Packing Reel", type: "video", campaign: "Travel Gear Performance Max", spend: 1320, conversions: 52, revenue: 4870, roas: 3.69, ctr: 2.9 },
      { creativeId: "gcr-2", name: "Explorer Backpack Lifestyle Carousel", type: "image", campaign: "Remarketing Display", spend: 740, conversions: 12, revenue: 980, roas: 1.32, ctr: 1.1 },
      { creativeId: "gcr-3", name: "Carry-On Checklist Static", type: "image", campaign: "Backpack Search Campaign", spend: 510, conversions: 21, revenue: 1830, roas: 3.59, ctr: 2.6 },
    ],
    count: 3,
    insights: [{ severity: "warning", title: "Display creative fatigue", description: "Remarketing image creative has high frequency and weak ROAS." }],
  };
}

export function getDemoGoogleAdsAudiences() {
  return {
    data: [
      { audience: "In-market Travel Accessories", spend: 2830, conversions: 103, revenue: 8920, roas: 3.15, cpa: 27.48, ctr: 3.8 },
      { audience: "Remarketing 30d", spend: 2190, conversions: 76, revenue: 6540, roas: 2.99, cpa: 28.82, ctr: 4.1 },
      { audience: "Outdoor Enthusiasts", spend: 1740, conversions: 47, revenue: 3210, roas: 1.84, cpa: 37.02, ctr: 2.7 },
    ],
    summary: { topAudience: "In-market Travel Accessories", weakAudience: "Outdoor Enthusiasts" },
    insights: [{ severity: "critical", title: "Audience mismatch", description: "Outdoor Enthusiasts audience is spending heavily with low conversion efficiency." }],
  };
}

export function getDemoGoogleAdsGeo() {
  return {
    data: [
      { location: "California", spend: 3120, conversions: 122, revenue: 11040, roas: 3.54, cpa: 25.57, ctr: 4.2 },
      { location: "Texas", spend: 2120, conversions: 69, revenue: 5240, roas: 2.47, cpa: 30.72, ctr: 3.7 },
      { location: "New York", spend: 1980, conversions: 73, revenue: 6760, roas: 3.41, cpa: 27.12, ctr: 4.1 },
    ],
    insights: [{ severity: "opportunity", title: "Geo reallocation opportunity", description: "Texas ROAS trails other top states; shift 10-15% budget to CA/NY." }],
  };
}

export function getDemoGoogleAdsDevices() {
  return {
    data: [
      { device: "Mobile", spend: 8420, conversions: 251, revenue: 19420, roas: 2.31, cpa: 33.55, ctr: 3.6 },
      { device: "Desktop", spend: 4970, conversions: 226, revenue: 22840, roas: 4.6, cpa: 21.99, ctr: 4.8 },
      { device: "Tablet", spend: 1150, conversions: 44, revenue: 4320, roas: 3.76, cpa: 26.14, ctr: 3.1 },
    ],
    insights: [{ severity: "warning", title: "Mobile checkout friction", description: "Mobile has strong traffic but weak downstream conversion vs desktop." }],
  };
}

export function getDemoGoogleAdsBudget() {
  return {
    data: [
      { id: "g-4", name: "Summer Hiking Campaign", spend: 2410, conversions: 58, revenue: 6020, roas: 2.5, cpa: 41.55, lostIsBudget: 0.26, recommendation: "Increase budget by 18% and tighten keywords." },
      { id: "g-5", name: "Remarketing Display", spend: 1700, conversions: 34, revenue: 4220, roas: 2.48, cpa: 50, lostIsBudget: 0.19, recommendation: "Shift 20% budget to high-intent search campaigns." },
    ],
    recommendations: [
      { type: "budget_shift", title: "Reallocate from Display to Brand Search", impact: "+$3.2k monthly revenue potential", effort: "low", priority: "high" },
      { type: "bid_adjustment", title: "Raise bids for Carry-On cluster", impact: "+18% impression share", effort: "medium", priority: "medium" },
    ],
    totalSpend: 14540,
    accountAvgRoas: 3.2,
  };
}

export function getDemoGoogleAdsOpportunities() {
  const data = [
    { type: "budget_shift", title: "Move budget to Backpack Search", whyItMatters: "Search campaign delivers 1.5x better ROAS than Display.", evidence: "$1.7k spend at 2.48x ROAS in Display.", expectedImpact: "+$2.1k revenue / 30d", effort: "low", priority: "high" },
    { type: "negative_keyword", title: "Add negatives for low-intent generic terms", whyItMatters: "Generic queries waste spend with weak conversion.", evidence: "\"cheap camping backpack\" spent $450 with 0.42x ROAS.", expectedImpact: "-8% wasted spend", effort: "low", priority: "high" },
    { type: "ad_copy", title: "Scale high-CTR carry-on message", whyItMatters: "Carry-on angle has strongest CTR + CVR combo.", evidence: "5.3% CTR and 4.52x ROAS on top ad.", expectedImpact: "+12-18% conversions", effort: "medium", priority: "medium" },
  ];
  return { data, count: data.length };
}

export function getDemoMetaCampaigns() {
  return {
    rows: [
      { id: "m-c1", name: "Backpack Video Ads", status: "ACTIVE", spend: 7140, purchases: 281, revenue: 25840, roas: 3.62, cpa: 25.41, ctr: 2.41, cpm: 16.2, impressions: 881000, clicks: 21240 },
      { id: "m-c2", name: "UGC Travel Creatives", status: "ACTIVE", spend: 5240, purchases: 216, revenue: 19920, roas: 3.8, cpa: 24.26, ctr: 2.86, cpm: 15.1, impressions: 624000, clicks: 17840 },
      { id: "m-c3", name: "Remarketing Campaign", status: "ACTIVE", spend: 4260, purchases: 203, revenue: 16780, roas: 3.94, cpa: 20.99, ctr: 3.18, cpm: 17.4, impressions: 441000, clicks: 14010 },
      { id: "m-c4", name: "Adventure Lifestyle Campaign", status: "PAUSED", spend: 3180, purchases: 71, revenue: 5290, roas: 1.66, cpa: 44.79, ctr: 1.67, cpm: 14.3, impressions: 381000, clicks: 6360 },
      { id: "m-c5", name: "Summer Gear Promotion", status: "ACTIVE", spend: 1600, purchases: 45, revenue: 4060, roas: 2.54, cpa: 35.56, ctr: 1.93, cpm: 13.8, impressions: 232000, clicks: 4470 },
    ],
  };
}

export function getDemoMetaCreatives() {
  const base = DEMO_PRODUCTS.slice(0, 8);
  const rows = base.map((p, i) => ({
    id: `m-ad-${i + 1}`,
    creative_id: `m-cr-${i + 1}`,
    account_id: "act_210009998877",
    account_name: "UrbanTrail DTC",
    campaign_id: i < 3 ? "m-c1" : i < 5 ? "m-c2" : "m-c4",
    campaign_name: i < 3 ? "Backpack Video Ads" : i < 5 ? "UGC Travel Creatives" : "Adventure Lifestyle Campaign",
    adset_id: `m-as-${i + 1}`,
    adset_name: i < 3 ? "Backpack Prospecting" : "UGC Broad",
    currency: "USD",
    name: `${p.title} Creative ${i + 1}`,
    copy_text: `Built for real trips. ${p.title} keeps your gear organized from gate to trail.`,
    copy_variants: [`Built for real trips. ${p.title} keeps your gear organized from gate to trail.`],
    headline_variants: [`${p.title} | Free Shipping`],
    description_variants: ["Try 30 days risk-free."],
    copy_source: "primary_text",
    preview_url: p.image_url,
    preview_source: "image_url",
    thumbnail_url: p.image_url,
    image_url: p.image_url,
    table_thumbnail_url: p.image_url,
    card_preview_url: p.image_url,
    is_catalog: false,
    preview_state: "preview",
    preview: { render_mode: "image", image_url: p.image_url, video_url: null, poster_url: p.image_url, source: "image_url", is_catalog: false },
    launch_date: "2026-02-15",
    tags: i < 3 ? ["winner", "ugc"] : i > 5 ? ["fatigue"] : ["stable"],
    ai_tags: {
      assetType: [i % 2 === 0 ? "video_style" : "static_image"],
      visualFormat: [i % 2 === 0 ? "lifestyle" : "product_focus"],
      messagingAngle: [i < 4 ? "utility" : "adventure"],
      offerType: [i % 3 === 0 ? "free_shipping" : "none"],
    },
    format: i % 2 === 0 ? "video" : "image",
    creative_type: i % 2 === 0 ? "video" : "feed",
    creative_type_label: i % 2 === 0 ? "Video" : "Feed",
    spend: 520 + i * 130,
    purchase_value: 1880 + i * 420,
    roas: 2.8 + (i % 3) * 0.6,
    cpa: 21 + (i % 4) * 8,
    cpc_link: 0.54 + (i % 3) * 0.09,
    cpm: 13.5 + i,
    ctr_all: 1.7 + (i % 4) * 0.4,
    purchases: 18 + i * 4,
    impressions: 38000 + i * 8500,
    link_clicks: 820 + i * 170,
    add_to_cart: 220 + i * 50,
    thumbstop: 23 + i * 2.1,
    click_to_atc: 0.26,
    atc_to_purchase: 0.18,
    video25: 0.62,
    video50: 0.44,
    video75: 0.31,
    video100: 0.17,
  }));
  return { status: "ok", rows };
}

export function getDemoMetaCopies() {
  const creativeRows = getDemoMetaCreatives().rows;
  const rows = creativeRows.map((r: any) => ({
    id: `copy_${r.id}`,
    ad_id: r.id,
    creative_id: r.creative_id,
    post_id: null,
    name: r.name,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    adset_id: r.adset_id,
    adset_name: r.adset_name,
    account_id: r.account_id,
    account_name: r.account_name,
    currency: "USD",
    launch_date: r.launch_date,
    primary_text: r.copy_text,
    headline: r.headline_variants[0],
    description: r.description_variants[0],
    copy_text: r.copy_text,
    copy_variants: r.copy_variants,
    headline_variants: r.headline_variants,
    description_variants: r.description_variants,
    normalized_copy_key: String(r.copy_text).toLowerCase(),
    copy_source: "primary_text",
    copy_asset_type: "bundle",
    copy_debug_sources: ["demo_seed"],
    unresolved_reason: null,
    preview_url: r.preview_url,
    thumbnail_url: r.thumbnail_url,
    image_url: r.image_url,
    table_thumbnail_url: r.table_thumbnail_url,
    card_preview_url: r.card_preview_url,
    is_catalog: false,
    preview_state: r.preview_state,
    preview: r.preview,
    spend: r.spend,
    purchase_value: r.purchase_value,
    roas: r.roas,
    cpa: r.cpa,
    cpc_link: r.cpc_link,
    cpm: r.cpm,
    ctr_all: r.ctr_all,
    purchases: r.purchases,
    impressions: r.impressions,
    link_clicks: r.link_clicks,
    add_to_cart: r.add_to_cart,
    click_to_purchase: r.link_clicks > 0 ? (r.purchases / r.link_clicks) * 100 : 0,
    see_more_rate: Math.min(92, r.ctr_all * 1.6),
    thumbstop: r.thumbstop,
    first_frame_retention: r.thumbstop,
    aov: r.purchases > 0 ? r.purchase_value / r.purchases : null,
    click_to_atc_ratio: r.link_clicks > 0 ? (r.add_to_cart / r.link_clicks) * 100 : null,
    atc_to_purchase_ratio: r.add_to_cart > 0 ? (r.purchases / r.add_to_cart) * 100 : null,
  }));
  return {
    status: "ok",
    rows,
    meta: {
      group_by: "copy",
      sort: "spend",
      unresolved_filtered_count: 0,
      source_rows_count: rows.length,
      returned_rows_count: rows.length,
    },
  };
}

export function getDemoGeoOverview() {
  return {
    kpis: {
      aiSessions: 1720,
      aiSessionShare: 0.036,
      aiEngagementRate: 0.684,
      aiPurchaseCvr: 0.032,
      aiAssistedRevenue: 6420,
      geoOpportunityScore: 74,
    },
    top3Priorities: [
      { title: "Improve CTR on near-page-1 commercial queries", score: 81 },
      { title: "Expand carry-on backpack topic cluster", score: 76 },
      { title: "Scale high-value ChatGPT referral pages", score: 72 },
    ],
    highlights: [
      { label: "Top AI source", value: "ChatGPT" },
      { label: "Strongest GEO page", value: "/blog/best-travel-backpacks" },
      { label: "Strongest GEO topic", value: "travel backpack buying guides" },
    ],
    insights: [
      { severity: "positive", title: "AI traffic quality is strong", description: "AI sessions convert above site average with deeper engagement." },
      { severity: "opportunity", title: "Near-page-1 cluster opportunity", description: "Commercial query cluster is ranking 7-11 with substantial impressions." },
    ],
  };
}

export function getDemoGeoTrafficSources() {
  return {
    sources: [
      { engine: "ChatGPT", sessions: 760, engagedSessions: 548, engagementRate: 0.721, purchases: 29, revenue: 2620, purchaseCvr: 0.038, aiTrafficValueScore: 84, aiTrafficValueLabel: "strong", momentum: { status: "rising", label: "Rising", score: 68, growthRate: 0.23 }, recommendation: "Scale FAQ-rich landing pages for ChatGPT query patterns." },
      { engine: "Perplexity", sessions: 350, engagedSessions: 232, engagementRate: 0.663, purchases: 10, revenue: 910, purchaseCvr: 0.029, aiTrafficValueScore: 72, aiTrafficValueLabel: "promising", momentum: { status: "stable", label: "Stable", score: 48, growthRate: 0.04 }, recommendation: "Improve citation-targeted headings and source clarity." },
      { engine: "Gemini", sessions: 280, engagedSessions: 190, engagementRate: 0.679, purchases: 8, revenue: 710, purchaseCvr: 0.029, aiTrafficValueScore: 70, aiTrafficValueLabel: "promising", momentum: { status: "rising", label: "Rising", score: 61, growthRate: 0.17 }, recommendation: "Publish comparison-style pages for product intent queries." },
      { engine: "Claude", sessions: 190, engagedSessions: 129, engagementRate: 0.679, purchases: 6, revenue: 520, purchaseCvr: 0.032, aiTrafficValueScore: 68, aiTrafficValueLabel: "promising", momentum: { status: "stable", label: "Stable", score: 46, growthRate: 0.03 }, recommendation: "Expand long-form guides with concrete examples." },
      { engine: "Copilot", sessions: 140, engagedSessions: 89, engagementRate: 0.636, purchases: 3, revenue: 260, purchaseCvr: 0.021, aiTrafficValueScore: 52, aiTrafficValueLabel: "weak", momentum: { status: "stable", label: "Stable", score: 41, growthRate: 0.02 }, recommendation: "Test intent-matching snippets on high-impression pages." },
    ],
  };
}

export function getDemoGeoPages() {
  return {
    pages: [
      { path: "/blog/best-travel-backpacks", aiSessions: 312, engagedSessions: 232, engagementRate: 0.744, purchases: 9, revenue: 780, purchaseCvr: 0.0288, totalSessions: 4510, geoScore: 82, momentum: { status: "breakout", label: "Breakout", score: 88, growthRate: 0.42 }, priority: "high", effort: "medium", confidence: "high", strongestSignal: "Breakout growth", recommendation: "Add commercial comparison table and top-pick CTA." },
      { path: "/products/explorer-backpack", aiSessions: 278, engagedSessions: 174, engagementRate: 0.626, purchases: 14, revenue: 1246, purchaseCvr: 0.0504, totalSessions: 8200, geoScore: 79, momentum: { status: "rising", label: "Rising", score: 66, growthRate: 0.22 }, priority: "high", effort: "low", confidence: "high", strongestSignal: "Strong AI CVR", recommendation: "Scale with engine-specific FAQ and buying intent copy blocks." },
      { path: "/blog/how-to-pack-for-hiking", aiSessions: 224, engagedSessions: 161, engagementRate: 0.719, purchases: 4, revenue: 260, purchaseCvr: 0.0179, totalSessions: 3920, geoScore: 71, momentum: { status: "stable", label: "Stable", score: 49, growthRate: 0.05 }, priority: "medium", effort: "medium", confidence: "medium", strongestSignal: "High engagement", recommendation: "Introduce product module midway to lift informational-to-commercial conversion." },
    ],
  };
}

export function getDemoGeoQueries() {
  const queries = [
    { query: "best travel backpack", clicks: 682, impressions: 12240, ctr: 0.0557, position: 5.9, intent: "Commercial", isAiStyle: true, geoScore: 84, priority: "high", confidence: "high", recommendation: "Push this query into top 3 with refreshed title and comparison schema.", momentum: { status: "rising", label: "Rising", score: 71, growthRate: 0.21 }, classification: { intent: "commercial", intentLabel: "Commercial", format: "comparison", formatLabel: "Comparison", confidence: 0.89, signals: ["best", "vs"] } },
    { query: "waterproof hiking backpack", clicks: 428, impressions: 9830, ctr: 0.0435, position: 7.1, intent: "Transactional", isAiStyle: true, geoScore: 79, priority: "high", confidence: "high", recommendation: "Add durability proof and use-case snippets to improve CTR.", momentum: { status: "stable", label: "Stable", score: 47, growthRate: 0.03 }, classification: { intent: "transactional", intentLabel: "Transactional", format: "buying_guide", formatLabel: "Buying Guide", confidence: 0.86, signals: ["waterproof"] } },
    { query: "carry on backpack for travel", clicks: 319, impressions: 7310, ctr: 0.0436, position: 8.2, intent: "Commercial", isAiStyle: true, geoScore: 75, priority: "medium", confidence: "medium", recommendation: "Near page 1; enrich FAQ and feature summary blocks.", momentum: { status: "rising", label: "Rising", score: 64, growthRate: 0.18 }, classification: { intent: "commercial", intentLabel: "Commercial", format: "how_to", formatLabel: "How-to", confidence: 0.82, signals: ["carry on"] } },
    { query: "travel backpack vs duffel", clicks: 206, impressions: 5640, ctr: 0.0365, position: 9.4, intent: "Informational", isAiStyle: true, geoScore: 72, priority: "medium", confidence: "medium", recommendation: "Comparison-intent query: publish dedicated comparison page section.", momentum: { status: "stable", label: "Stable", score: 44, growthRate: 0.02 }, classification: { intent: "informational", intentLabel: "Informational", format: "comparison", formatLabel: "Comparison", confidence: 0.8, signals: ["vs"] } },
  ];
  return { queries, total: queries.length };
}

export function getDemoGeoTopics() {
  return {
    topics: [
      { topic: "travel backpack buying guides", impressions: 21240, clicks: 1231, avgPosition: 6.8, queryCount: 18, coverageStrength: "Moderate", geoScore: 83, priority: "high", confidence: "high", informationalDensity: 0.72, coverageGap: "medium", authorityStrength: "Moderate", momentum: { status: "rising", label: "Rising", score: 69, growthRate: 0.2 }, recommendation: { title: "Build cluster support pages", effort: "medium", impact: "high", expectedOutcome: "Higher AI citation frequency + CTR lift" } },
      { topic: "carry-on travel packing", impressions: 11310, clicks: 620, avgPosition: 8.1, queryCount: 11, coverageStrength: "Weak", geoScore: 74, priority: "high", confidence: "medium", informationalDensity: 0.68, coverageGap: "high", authorityStrength: "Weak", momentum: { status: "breakout", label: "Breakout", score: 87, growthRate: 0.39 }, recommendation: { title: "Expand guide depth and FAQs", effort: "medium", impact: "high", expectedOutcome: "Top-5 query coverage for commercial intent terms" } },
      { topic: "hiking pack organization", impressions: 6420, clicks: 442, avgPosition: 5.3, queryCount: 9, coverageStrength: "Strong", geoScore: 69, priority: "medium", confidence: "medium", informationalDensity: 0.79, coverageGap: "low", authorityStrength: "Strong", momentum: { status: "stable", label: "Stable", score: 51, growthRate: 0.05 }, recommendation: { title: "Add advanced FAQ snippets", effort: "low", impact: "medium", expectedOutcome: "Defend ranking and improve long-tail discovery" } },
    ],
    total: 3,
  };
}

export function getDemoGeoOpportunities() {
  const opportunities = [
    { type: "content", priority: "high", effort: "medium", confidence: "high", impact: "+20-35% CTR", title: "High-impression near-page-1 queries need better titles", target: "best travel backpack cluster", evidence: "12k+ impressions at avg position 5.9 with CTR under expected benchmark.", recommendation: "Rewrite titles + meta descriptions for stronger value proposition and specificity.", whyItMatters: "Improving CTR on existing visibility is the fastest growth lever." },
    { type: "conversion", priority: "high", effort: "low", confidence: "high", impact: "+$2.8k AI-assisted revenue", title: "Top AI page has room for conversion lift", target: "/blog/best-travel-backpacks", evidence: "High AI sessions and engagement, but informational traffic under-monetized.", recommendation: "Add sticky product recommendation module and comparison CTA.", whyItMatters: "Captures purchase intent from high-quality AI traffic." },
    { type: "traffic", priority: "medium", effort: "medium", confidence: "medium", impact: "+15% AI traffic share", title: "Scale ChatGPT citation footprint", target: "ChatGPT source", evidence: "Strong value score and rising sessions concentrated on 3 pages.", recommendation: "Publish adjacent answer-first content for related travel queries.", whyItMatters: "Expands share of AI discovery beyond current winners." },
  ];
  return { opportunities, total: opportunities.length };
}

export function getDemoSearchConsoleAnalytics() {
  const rows = [
    { query: "best travel backpack", page: "/blog/best-travel-backpacks", clicks: 682, impressions: 12240, ctr: 0.0557, position: 5.9 },
    { query: "waterproof hiking backpack", page: "/products/waterproof-backpack", clicks: 428, impressions: 9830, ctr: 0.0435, position: 7.1 },
    { query: "carry on backpack for travel", page: "/products/carry-on-backpack", clicks: 319, impressions: 7310, ctr: 0.0436, position: 8.2 },
    { query: "backpack with laptop compartment", page: "/products/laptop-travel-bag", clicks: 287, impressions: 6120, ctr: 0.0469, position: 6.4 },
    { query: "lightweight travel bag", page: "/products/daypack-lite", clicks: 196, impressions: 5400, ctr: 0.0363, position: 9.7 },
    { query: "best backpack for weekend trips", page: "/blog/best-travel-backpacks", clicks: 175, impressions: 3890, ctr: 0.045, position: 8.8 },
    { query: "how to pack a hiking backpack", page: "/blog/how-to-pack-for-hiking", clicks: 261, impressions: 7140, ctr: 0.0366, position: 5.1 },
    { query: "travel backpack vs duffel", page: "/blog/travel-backpack-vs-duffel", clicks: 206, impressions: 5640, ctr: 0.0365, position: 9.4 },
  ];
  return { rows };
}
