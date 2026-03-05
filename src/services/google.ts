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

const WAIT_MS = 220;

const RECOMMENDATIONS: GoogleRecommendation[] = [
  {
    id: "rec-1",
    title: "Negative keyword candidates",
    description: "Identify wasteful intent terms with spend but no downstream value.",
    impact: "High",
    summary: [
      "14 terms consumed 19% of search spend with no conversions.",
      "Most terms come from broad match in top-spend campaigns.",
      "Excluding these terms can immediately improve efficiency.",
    ],
    evidence: [
      { label: "Waste spend", value: "$1,240" },
      { label: "Affected campaigns", value: "4" },
      { label: "Projected ROAS lift", value: "+0.28" },
    ],
  },
  {
    id: "rec-2",
    title: "Positive keyword expansion",
    description: "Mine converting queries and add them as exact/phrase keywords.",
    impact: "High",
    summary: [
      "22 high-intent search terms are currently uncovered in keyword lists.",
      "These terms deliver above-account median CVR and lower CPA.",
      "Adding them as exact should improve impression share quality.",
    ],
    evidence: [
      { label: "Candidate terms", value: "22" },
      { label: "Avg ROAS", value: "4.12" },
      { label: "Avg CPA", value: "$18.40" },
    ],
  },
  {
    id: "rec-3",
    title: "PMax search themes suggestions",
    description: "Feed stronger themes based on converting search language.",
    impact: "Med",
    summary: [
      "Current PMax themes are broad and under-specified.",
      "Theme refresh can tighten query relevance for new customer intent.",
      "Use winning query clusters from Search to seed themes.",
    ],
    evidence: [
      { label: "Theme gaps found", value: "9" },
      { label: "Source campaigns", value: "Search Branded, Non-Brand" },
      { label: "Expected latency", value: "3-7 days" },
    ],
  },
  {
    id: "rec-4",
    title: "Asset improvement ideas",
    description: "Improve low-performing headlines/descriptions for better CTR.",
    impact: "Med",
    summary: [
      "8 text assets are marked low with below-baseline engagement.",
      "Headline variants over-index on generic claims.",
      "Stronger offer and proof language likely improves response.",
    ],
    evidence: [
      { label: "Low assets", value: "8" },
      { label: "Median CTR gap", value: "-0.42pp" },
      { label: "Top affected group", value: "PMax Prospecting" },
    ],
  },
  {
    id: "rec-5",
    title: "Product waste detector",
    description: "Flag SKUs with high cost and weak conversion value contribution.",
    impact: "Low",
    summary: [
      "A subset of SKUs has prolonged spend without return.",
      "These products are priced competitively but under-convert from ads.",
      "Exclude or bid down until merchandising/assets are improved.",
    ],
    evidence: [
      { label: "Waste SKUs", value: "6" },
      { label: "Spend at risk", value: "$640" },
      { label: "Current ROAS", value: "0.84" },
    ],
  },
];

const SEARCH_TERMS: GoogleSearchTermRow[] = [
  {
    id: "st-1",
    search_term: "eco laundry sheets bulk",
    match_type: "Broad",
    campaign: "Non-Brand Search",
    ad_group: "Laundry Sheets",
    clicks: 203,
    impressions: 3221,
    cost: 512,
    conversions: 17,
    conv_value: 1510,
    roas: 2.95,
    cpa: 30.12,
  },
  {
    id: "st-2",
    search_term: "brand name official store",
    match_type: "Exact",
    campaign: "Brand Search",
    ad_group: "Brand Core",
    clicks: 410,
    impressions: 1904,
    cost: 620,
    conversions: 64,
    conv_value: 4320,
    roas: 6.97,
    cpa: 9.69,
  },
  {
    id: "st-3",
    search_term: "free samples detergent",
    match_type: "Phrase",
    campaign: "Non-Brand Search",
    ad_group: "Promo Terms",
    clicks: 145,
    impressions: 2870,
    cost: 402,
    conversions: 2,
    conv_value: 80,
    roas: 0.2,
    cpa: 201,
  },
  {
    id: "st-4",
    search_term: "plastic free detergent",
    match_type: "Phrase",
    campaign: "Generic Search",
    ad_group: "Sustainability",
    clicks: 188,
    impressions: 2510,
    cost: 338,
    conversions: 15,
    conv_value: 1280,
    roas: 3.79,
    cpa: 22.53,
  },
  {
    id: "st-5",
    search_term: "cheap detergent coupon",
    match_type: "Broad",
    campaign: "Non-Brand Search",
    ad_group: "Price Sensitive",
    clicks: 129,
    impressions: 3120,
    cost: 301,
    conversions: 3,
    conv_value: 120,
    roas: 0.4,
    cpa: 100.33,
  },
];

const PRODUCTS: GoogleProductRow[] = [
  {
    id: "prd-1",
    item_id: "SKU-101",
    title: "Laundry Sheets Family Pack",
    brand: "Acme Clean",
    price: 39,
    clicks: 220,
    cost: 430,
    conversions: 21,
    conv_value: 1620,
    roas: 3.77,
  },
  {
    id: "prd-2",
    item_id: "SKU-102",
    title: "Starter Trial Kit",
    brand: "Acme Clean",
    price: 12,
    clicks: 301,
    cost: 510,
    conversions: 14,
    conv_value: 410,
    roas: 0.8,
  },
  {
    id: "prd-3",
    item_id: "SKU-104",
    title: "Sensitive Skin Bundle",
    brand: "Acme Clean",
    price: 45,
    clicks: 148,
    cost: 280,
    conversions: 13,
    conv_value: 910,
    roas: 3.25,
  },
];

const ASSETS: GoogleAssetRow[] = [
  {
    id: "ast-1",
    asset_group: "PMax Prospecting",
    asset_type: "text",
    asset_name: "Headline - Clean Home, Zero Plastic",
    performance_label: "Best",
    cost: 320,
    conv_value: 1580,
    roas: 4.94,
  },
  {
    id: "ast-2",
    asset_group: "PMax Prospecting",
    asset_type: "image",
    asset_name: "Kitchen Lifestyle Frame 04",
    performance_label: "Good",
    cost: 280,
    conv_value: 980,
    roas: 3.5,
  },
  {
    id: "ast-3",
    asset_group: "PMax Retargeting",
    asset_type: "video",
    asset_name: "UGC Demo Cut v2",
    performance_label: "Low",
    cost: 190,
    conv_value: 210,
    roas: 1.11,
  },
];

const SHOPIFY_PRODUCTS: ShopifyProductPerformance[] = [
  {
    id: "shp-1",
    sku: "SKU-101",
    title: "Laundry Sheets Family Pack",
    category: "Laundry",
    adSpend: 430,
    revenue: 1620,
    cogs: 540,
    refunds: 70,
  },
  {
    id: "shp-2",
    sku: "SKU-102",
    title: "Starter Trial Kit",
    category: "Laundry",
    adSpend: 510,
    revenue: 410,
    cogs: 245,
    refunds: 55,
  },
  {
    id: "shp-3",
    sku: "SKU-104",
    title: "Sensitive Skin Bundle",
    category: "Bundles",
    adSpend: 280,
    revenue: 910,
    cogs: 320,
    refunds: 30,
  },
  {
    id: "shp-4",
    sku: "SKU-206",
    title: "Travel Pack Minis",
    category: "Laundry",
    adSpend: 320,
    revenue: 190,
    cogs: 125,
    refunds: 26,
  },
  {
    id: "shp-5",
    sku: "SKU-118",
    title: "Multi Surface Starter",
    category: "Kitchen Cleaners",
    adSpend: 250,
    revenue: 210,
    cogs: 118,
    refunds: 19,
  },
];

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function getGoogleRecommendations(_: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
}) {
  await wait(WAIT_MS);
  return RECOMMENDATIONS;
}

export async function getGoogleSearchTerms(params: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
  search?: string;
}) {
  await wait(WAIT_MS);
  const query = params.search?.trim().toLowerCase();
  return SEARCH_TERMS.filter((row) =>
    query ? row.search_term.toLowerCase().includes(query) : true
  );
}

export async function getGoogleProducts(_: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
}) {
  await wait(WAIT_MS);
  return PRODUCTS;
}

export async function getGoogleAssets(_: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
}) {
  await wait(WAIT_MS);
  return ASSETS;
}

export async function getGoogleShopifyProducts(_: {
  businessId: string;
  dateRange: "7" | "14" | "30" | "custom";
}) {
  await wait(WAIT_MS);
  return SHOPIFY_PRODUCTS;
}
