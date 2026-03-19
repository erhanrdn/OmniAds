import {
  DateRange,
  IntegrationConnection,
  IntegrationStatus,
  Platform,
  PlatformLevel,
  PlatformTableRow,
  Creative,
  LandingPage,
  Copy,
  MetricsRow,
} from "@/src/types";
import {
  buildApiUrl,
  getApiErrorMessage,
  readJsonResponse,
} from "@/src/services/data-service-support";
import { getGooglePlatformTable } from "@/src/services/data-service-google";

const MOCK_DELAY_MS = 250;

const DEMO_BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

const makeMetrics = (input: {
  impressions: number;
  clicks: number;
  purchases: number;
  spend: number;
  revenue: number;
}) => {
  const ctr = Number(((input.clicks / Math.max(input.impressions, 1)) * 100).toFixed(2));
  const cpm = Number(((input.spend / Math.max(input.impressions, 1)) * 1000).toFixed(2));
  const cpc = Number((input.spend / Math.max(input.clicks, 1)).toFixed(2));
  const cpa = Number((input.spend / Math.max(input.purchases, 1)).toFixed(2));
  const roas = Number((input.revenue / Math.max(input.spend, 1)).toFixed(2));

  return {
    impressions: input.impressions,
    clicks: input.clicks,
    purchases: input.purchases,
    conversions: input.purchases,
    spend: input.spend,
    revenue: input.revenue,
    ctr,
    cpm,
    cpc,
    cpa,
    roas,
  };
};

const PLATFORM_TABLE_ROWS: PlatformTableRow[] = [
  {
    id: "meta-acc-1",
    name: "Meta Main Account",
    level: "account",
    status: "active",
    platform: Platform.META,
    accountId: "acc-meta-1",
    metrics: makeMetrics({
      impressions: 30500,
      clicks: 2480,
      purchases: 178,
      spend: 3450,
      revenue: 12600,
    }),
  },
  {
    id: "meta-camp-1",
    name: "Spring Retargeting",
    level: "campaign",
    status: "active",
    platform: Platform.META,
    accountId: "acc-meta-1",
    metrics: makeMetrics({
      impressions: 17300,
      clicks: 1342,
      purchases: 98,
      spend: 1960,
      revenue: 7080,
    }),
  },
  {
    id: "meta-camp-2",
    name: "Prospecting Lookalike",
    level: "campaign",
    status: "paused",
    platform: Platform.META,
    accountId: "acc-meta-1",
    metrics: makeMetrics({
      impressions: 13200,
      clicks: 1138,
      purchases: 80,
      spend: 1490,
      revenue: 5520,
    }),
  },
  {
    id: "meta-adset-1",
    name: "Retargeting 7D Viewers",
    level: "adSet",
    status: "active",
    platform: Platform.META,
    accountId: "acc-meta-1",
    metrics: makeMetrics({
      impressions: 8900,
      clicks: 720,
      purchases: 52,
      spend: 980,
      revenue: 3760,
    }),
  },
  {
    id: "meta-adset-2",
    name: "Retargeting ATC 14D",
    level: "adSet",
    status: "active",
    platform: Platform.META,
    accountId: "acc-meta-1",
    metrics: makeMetrics({
      impressions: 8400,
      clicks: 622,
      purchases: 46,
      spend: 940,
      revenue: 3320,
    }),
  },
  {
    id: "meta-ad-1",
    name: "UGC Reel - Testimonial",
    level: "ad",
    status: "active",
    platform: Platform.META,
    accountId: "acc-meta-1",
    metrics: makeMetrics({
      impressions: 4700,
      clicks: 394,
      purchases: 29,
      spend: 520,
      revenue: 2110,
    }),
  },
  {
    id: "meta-ad-2",
    name: "Static Promo - 20% Off",
    level: "ad",
    status: "paused",
    platform: Platform.META,
    accountId: "acc-meta-1",
    metrics: makeMetrics({
      impressions: 4200,
      clicks: 328,
      purchases: 23,
      spend: 460,
      revenue: 1650,
    }),
  },
  {
    id: "google-acc-1",
    name: "Google Ads Primary",
    level: "account",
    status: "active",
    platform: Platform.GOOGLE,
    accountId: "acc-google-1",
    metrics: makeMetrics({
      impressions: 42600,
      clicks: 3122,
      purchases: 265,
      spend: 5890,
      revenue: 17800,
    }),
  },
  {
    id: "google-camp-1",
    name: "Search Branded",
    level: "campaign",
    status: "active",
    platform: Platform.GOOGLE,
    accountId: "acc-google-1",
    metrics: makeMetrics({
      impressions: 22800,
      clicks: 1780,
      purchases: 151,
      spend: 3110,
      revenue: 9580,
    }),
  },
  {
    id: "google-camp-2",
    name: "PMax Prospecting",
    level: "campaign",
    status: "active",
    platform: Platform.GOOGLE,
    accountId: "acc-google-1",
    metrics: makeMetrics({
      impressions: 19800,
      clicks: 1342,
      purchases: 114,
      spend: 2780,
      revenue: 8220,
    }),
  },
  {
    id: "google-adset-1",
    name: "Ad Group - Brand Exact",
    level: "adSet",
    status: "active",
    platform: Platform.GOOGLE,
    accountId: "acc-google-1",
    metrics: makeMetrics({
      impressions: 9700,
      clicks: 840,
      purchases: 74,
      spend: 1490,
      revenue: 4680,
    }),
  },
  {
    id: "google-adset-2",
    name: "Ad Group - Competitor",
    level: "adSet",
    status: "paused",
    platform: Platform.GOOGLE,
    accountId: "acc-google-1",
    metrics: makeMetrics({
      impressions: 8200,
      clicks: 500,
      purchases: 40,
      spend: 1020,
      revenue: 2880,
    }),
  },
  {
    id: "google-ad-1",
    name: "RSA - Free Shipping",
    level: "ad",
    status: "active",
    platform: Platform.GOOGLE,
    accountId: "acc-google-1",
    metrics: makeMetrics({
      impressions: 5100,
      clicks: 410,
      purchases: 35,
      spend: 780,
      revenue: 2360,
    }),
  },
  {
    id: "google-ad-2",
    name: "RSA - Bundle Offer",
    level: "ad",
    status: "active",
    platform: Platform.GOOGLE,
    accountId: "acc-google-1",
    metrics: makeMetrics({
      impressions: 4600,
      clicks: 352,
      purchases: 31,
      spend: 720,
      revenue: 2240,
    }),
  },
  {
    id: "tiktok-acc-1",
    name: "TikTok Ads Main",
    level: "account",
    status: "active",
    platform: Platform.TIKTOK,
    accountId: "acc-tiktok-1",
    metrics: makeMetrics({
      impressions: 21800,
      clicks: 1420,
      purchases: 105,
      spend: 2480,
      revenue: 6940,
    }),
  },
  {
    id: "tiktok-camp-1",
    name: "UGC Scale",
    level: "campaign",
    status: "paused",
    platform: Platform.TIKTOK,
    accountId: "acc-tiktok-1",
    metrics: makeMetrics({
      impressions: 10200,
      clicks: 650,
      purchases: 45,
      spend: 1180,
      revenue: 3230,
    }),
  },
  {
    id: "tiktok-camp-2",
    name: "Spark Ads Conversion",
    level: "campaign",
    status: "active",
    platform: Platform.TIKTOK,
    accountId: "acc-tiktok-1",
    metrics: makeMetrics({
      impressions: 11600,
      clicks: 770,
      purchases: 60,
      spend: 1300,
      revenue: 3710,
    }),
  },
  {
    id: "tiktok-adset-1",
    name: "Interest - Beauty",
    level: "adSet",
    status: "active",
    platform: Platform.TIKTOK,
    accountId: "acc-tiktok-1",
    metrics: makeMetrics({
      impressions: 6200,
      clicks: 420,
      purchases: 34,
      spend: 680,
      revenue: 2010,
    }),
  },
  {
    id: "tiktok-adset-2",
    name: "LAL Purchasers 1%",
    level: "adSet",
    status: "active",
    platform: Platform.TIKTOK,
    accountId: "acc-tiktok-1",
    metrics: makeMetrics({
      impressions: 5400,
      clicks: 350,
      purchases: 26,
      spend: 620,
      revenue: 1700,
    }),
  },
  {
    id: "tiktok-ad-1",
    name: "Hook Variant A",
    level: "ad",
    status: "active",
    platform: Platform.TIKTOK,
    accountId: "acc-tiktok-1",
    metrics: makeMetrics({
      impressions: 2900,
      clicks: 198,
      purchases: 15,
      spend: 340,
      revenue: 990,
    }),
  },
  {
    id: "tiktok-ad-2",
    name: "Hook Variant B",
    level: "ad",
    status: "paused",
    platform: Platform.TIKTOK,
    accountId: "acc-tiktok-1",
    metrics: makeMetrics({
      impressions: 2500,
      clicks: 152,
      purchases: 11,
      spend: 280,
      revenue: 710,
    }),
  },
  {
    id: "pinterest-acc-1",
    name: "Pinterest Ads Account",
    level: "account",
    status: "active",
    platform: Platform.PINTEREST,
    accountId: "acc-pinterest-1",
    metrics: makeMetrics({
      impressions: 16200,
      clicks: 890,
      purchases: 51,
      spend: 1120,
      revenue: 3020,
    }),
  },
  {
    id: "pinterest-camp-1",
    name: "Seasonal Boards",
    level: "campaign",
    status: "active",
    platform: Platform.PINTEREST,
    accountId: "acc-pinterest-1",
    metrics: makeMetrics({
      impressions: 9200,
      clicks: 516,
      purchases: 31,
      spend: 640,
      revenue: 1760,
    }),
  },
  {
    id: "pinterest-camp-2",
    name: "Catalog Sales",
    level: "campaign",
    status: "paused",
    platform: Platform.PINTEREST,
    accountId: "acc-pinterest-1",
    metrics: makeMetrics({
      impressions: 7000,
      clicks: 374,
      purchases: 20,
      spend: 480,
      revenue: 1260,
    }),
  },
  {
    id: "pinterest-adset-1",
    name: "Women 25-34",
    level: "adSet",
    status: "active",
    platform: Platform.PINTEREST,
    accountId: "acc-pinterest-1",
    metrics: makeMetrics({
      impressions: 4300,
      clicks: 256,
      purchases: 16,
      spend: 310,
      revenue: 850,
    }),
  },
  {
    id: "pinterest-adset-2",
    name: "Interest - Home Decor",
    level: "adSet",
    status: "active",
    platform: Platform.PINTEREST,
    accountId: "acc-pinterest-1",
    metrics: makeMetrics({
      impressions: 3900,
      clicks: 201,
      purchases: 12,
      spend: 270,
      revenue: 730,
    }),
  },
  {
    id: "pinterest-ad-1",
    name: "Pin Creative A",
    level: "ad",
    status: "active",
    platform: Platform.PINTEREST,
    accountId: "acc-pinterest-1",
    metrics: makeMetrics({
      impressions: 2200,
      clicks: 128,
      purchases: 8,
      spend: 160,
      revenue: 460,
    }),
  },
  {
    id: "pinterest-ad-2",
    name: "Pin Creative B",
    level: "ad",
    status: "paused",
    platform: Platform.PINTEREST,
    accountId: "acc-pinterest-1",
    metrics: makeMetrics({
      impressions: 2000,
      clicks: 96,
      purchases: 5,
      spend: 140,
      revenue: 350,
    }),
  },
  {
    id: "snapchat-acc-1",
    name: "Snapchat Business Account",
    level: "account",
    status: "active",
    platform: Platform.SNAPCHAT,
    accountId: "acc-snapchat-1",
    metrics: makeMetrics({
      impressions: 14300,
      clicks: 520,
      purchases: 43,
      spend: 910,
      revenue: 2440,
    }),
  },
  {
    id: "snapchat-camp-1",
    name: "Story Push",
    level: "campaign",
    status: "active",
    platform: Platform.SNAPCHAT,
    accountId: "acc-snapchat-1",
    metrics: makeMetrics({
      impressions: 7800,
      clicks: 300,
      purchases: 24,
      spend: 510,
      revenue: 1410,
    }),
  },
  {
    id: "snapchat-camp-2",
    name: "Prospecting Video",
    level: "campaign",
    status: "paused",
    platform: Platform.SNAPCHAT,
    accountId: "acc-snapchat-1",
    metrics: makeMetrics({
      impressions: 6500,
      clicks: 220,
      purchases: 19,
      spend: 400,
      revenue: 1030,
    }),
  },
  {
    id: "snapchat-adset-1",
    name: "Interest - Fashion",
    level: "adSet",
    status: "active",
    platform: Platform.SNAPCHAT,
    accountId: "acc-snapchat-1",
    metrics: makeMetrics({
      impressions: 3900,
      clicks: 152,
      purchases: 13,
      spend: 260,
      revenue: 740,
    }),
  },
  {
    id: "snapchat-adset-2",
    name: "Lookalike - Purchasers",
    level: "adSet",
    status: "paused",
    platform: Platform.SNAPCHAT,
    accountId: "acc-snapchat-1",
    metrics: makeMetrics({
      impressions: 3300,
      clicks: 108,
      purchases: 9,
      spend: 210,
      revenue: 540,
    }),
  },
  {
    id: "snapchat-ad-1",
    name: "Story Ad A",
    level: "ad",
    status: "active",
    platform: Platform.SNAPCHAT,
    accountId: "acc-snapchat-1",
    metrics: makeMetrics({
      impressions: 1900,
      clicks: 78,
      purchases: 7,
      spend: 130,
      revenue: 380,
    }),
  },
  {
    id: "snapchat-ad-2",
    name: "Story Ad B",
    level: "ad",
    status: "paused",
    platform: Platform.SNAPCHAT,
    accountId: "acc-snapchat-1",
    metrics: makeMetrics({
      impressions: 1700,
      clicks: 59,
      purchases: 5,
      spend: 120,
      revenue: 310,
    }),
  },
];

const CREATIVES: Creative[] = [
  {
    id: "cr-1",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.META,
    name: "UGC Testimonial",
    format: "video",
    status: "active",
    primaryText: "Real customer story with before/after narrative.",
    headline: "See Why 12,000+ Customers Switched",
    cta: "Shop now",
    landingPageUrl: "https://example.com/ugc-testimonial",
    thumbnailUrl: "https://picsum.photos/seed/creative1/640/360",
    createdAt: "2026-03-02",
    metrics: { spend: 1260, purchases: 74, revenue: 4410, ctr: 2.88, roas: 3.5 },
    seenIn: {
      campaigns: ["Spring Retargeting"],
      adSets: ["Retargeting 7D Viewers"],
      ads: ["UGC Reel - Testimonial"],
    },
  },
  {
    id: "cr-2",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.GOOGLE,
    name: "Search Promo Banner",
    format: "image",
    status: "active",
    primaryText: "Clean promotional visual for paid search extensions.",
    headline: "Official Store - Free Shipping Over $50",
    cta: "Learn more",
    landingPageUrl: "https://example.com/free-shipping",
    thumbnailUrl: "https://picsum.photos/seed/creative2/640/360",
    createdAt: "2026-02-27",
    metrics: { spend: 1820, purchases: 91, revenue: 5820, ctr: 3.16, roas: 3.2 },
    seenIn: {
      campaigns: ["Search Branded", "PMax Prospecting"],
      adSets: ["Ad Group - Brand Exact"],
      ads: ["RSA - Free Shipping"],
    },
  },
  {
    id: "cr-3",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.TIKTOK,
    name: "Hook Variant A",
    format: "video",
    status: "active",
    primaryText: "Fast paced hook with product demo in first 3 seconds.",
    headline: "Watch It. Want It. Get It.",
    cta: "Buy now",
    landingPageUrl: "https://example.com/tiktok-hook-a",
    thumbnailUrl: "https://picsum.photos/seed/creative3/640/360",
    createdAt: "2026-02-24",
    metrics: { spend: 970, purchases: 48, revenue: 2760, ctr: 2.53, roas: 2.85 },
    seenIn: {
      campaigns: ["Spark Ads Conversion"],
      adSets: ["Interest - Beauty"],
      ads: ["Hook Variant A"],
    },
  },
  {
    id: "cr-4",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.PINTEREST,
    name: "Seasonal Pin Creative",
    format: "image",
    status: "active",
    primaryText: "Static lifestyle frame for seasonal board promotion.",
    headline: "Spring Collection Now Live",
    cta: "Explore",
    landingPageUrl: "https://example.com/spring-collection",
    thumbnailUrl: "https://picsum.photos/seed/creative4/640/360",
    createdAt: "2026-02-20",
    metrics: { spend: 530, purchases: 24, revenue: 1430, ctr: 1.84, roas: 2.7 },
    seenIn: {
      campaigns: ["Seasonal Boards"],
      adSets: ["Women 25-34"],
      ads: ["Pin Creative A"],
    },
  },
  {
    id: "cr-5",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.SNAPCHAT,
    name: "Story Creative A",
    format: "video",
    status: "active",
    primaryText: "Vertical story cut with direct response CTA.",
    headline: "Limited Drop. 48 Hours Only.",
    cta: "Shop now",
    landingPageUrl: "https://example.com/limited-drop",
    thumbnailUrl: "https://picsum.photos/seed/creative5/640/360",
    createdAt: "2026-02-18",
    metrics: { spend: 410, purchases: 18, revenue: 980, ctr: 1.52, roas: 2.39 },
    seenIn: {
      campaigns: ["Story Push"],
      adSets: ["Interest - Fashion"],
      ads: ["Story Ad A"],
    },
  },
  {
    id: "cr-6",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.META,
    name: "Static Promo Card",
    format: "image",
    status: "active",
    primaryText: "Offer-focused creative with pricing and urgency signal.",
    headline: "20% Off Ends Tonight",
    cta: "Get offer",
    landingPageUrl: "https://example.com/offer-20",
    thumbnailUrl: "https://picsum.photos/seed/creative6/640/360",
    createdAt: "2026-02-12",
    metrics: { spend: 880, purchases: 39, revenue: 2410, ctr: 2.11, roas: 2.74 },
    seenIn: {
      campaigns: ["Prospecting Lookalike"],
      adSets: ["Retargeting ATC 14D"],
      ads: ["Static Promo - 20% Off"],
    },
  },
];

const LANDING_PAGES: LandingPage[] = [
  {
    id: "lp-1",
    businessId: DEMO_BUSINESS_ID,
    name: "Spring Sale LP",
    platform: Platform.META,
    url: "https://example.com/spring-sale",
    utmPlaceholder:
      "?utm_source={{platform}}&utm_medium=paid&utm_campaign={{campaign_name}}&utm_content={{ad_name}}",
    status: "active",
    clicks: 5940,
    sessions: 5120,
    purchases: 286,
    revenue: 18360,
    roas: 3.42,
    conversionRate: 5.4,
    updatedAt: "2026-03-03",
    topCreatives: ["UGC Testimonial", "Static Promo Card"],
    topCopies: ["Save 20% This Week", "Limited Drop. 48 Hours Only."],
  },
  {
    id: "lp-2",
    businessId: DEMO_BUSINESS_ID,
    name: "Starter Bundle LP",
    platform: Platform.GOOGLE,
    url: "https://example.com/starter-bundle",
    utmPlaceholder:
      "?utm_source={{platform}}&utm_medium=cpc&utm_campaign={{campaign_id}}&utm_term={{keyword}}",
    status: "active",
    clicks: 3480,
    sessions: 3044,
    purchases: 158,
    revenue: 9960,
    roas: 3.08,
    conversionRate: 5.19,
    updatedAt: "2026-02-27",
    topCreatives: ["Search Promo Banner"],
    topCopies: ["Official Store - Fast Shipping", "Save 20% This Week"],
  },
  {
    id: "lp-3",
    businessId: DEMO_BUSINESS_ID,
    name: "Creator Bundle LP",
    platform: Platform.TIKTOK,
    url: "https://example.com/creator-bundle",
    utmPlaceholder:
      "?utm_source={{platform}}&utm_medium=paid_social&utm_campaign={{campaign_name}}&utm_ad={{adgroup_name}}",
    status: "active",
    clicks: 2240,
    sessions: 1908,
    purchases: 89,
    revenue: 5070,
    roas: 2.76,
    conversionRate: 4.66,
    updatedAt: "2026-03-01",
    topCreatives: ["Hook Variant A", "Story Creative A"],
    topCopies: ["Watch It. Want It. Get It.", "Limited Drop. 48 Hours Only."],
  },
  {
    id: "lp-4",
    businessId: DEMO_BUSINESS_ID,
    name: "Spring Collection LP",
    platform: Platform.PINTEREST,
    url: "https://example.com/spring-collection",
    utmPlaceholder:
      "?utm_source={{platform}}&utm_medium=paid&utm_campaign={{campaign_name}}&utm_pin={{ad_name}}",
    status: "active",
    clicks: 1180,
    sessions: 1025,
    purchases: 48,
    revenue: 2760,
    roas: 2.63,
    conversionRate: 4.68,
    updatedAt: "2026-02-20",
    topCreatives: ["Seasonal Pin Creative"],
    topCopies: ["Spring Collection Now Live"],
  },
];

const COPIES: Copy[] = [
  {
    id: "cp-1",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.META,
    objective: "conversions",
    headline: "Save 20% This Week",
    snippet: "Limited-time discount on best sellers.",
    body: "Limited-time discount on best sellers. Shop now.",
    fullText:
      "Limited-time discount on best sellers. Shop now and get free shipping on every order over $50. Ends Sunday midnight.",
    status: "approved",
    language: "en",
    usageCount: 14,
    spend: 2860,
    roas: 3.22,
    ctr: 2.41,
    usedIn: {
      campaigns: ["Spring Retargeting", "Prospecting Lookalike"],
      ads: ["Static Promo - 20% Off", "UGC Reel - Testimonial"],
    },
    similarCopies: [
      "Tonight only: 20% off top picks.",
      "Your favorites, now with a limited discount.",
    ],
    updatedAt: "2026-03-02",
  },
  {
    id: "cp-2",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.GOOGLE,
    objective: "traffic",
    headline: "Official Store - Fast Shipping",
    snippet: "Discover new arrivals and get free shipping.",
    body: "Discover new arrivals and get free shipping over $50.",
    fullText:
      "Discover new arrivals and get free shipping over $50. Shop directly from the official store with easy returns.",
    status: "approved",
    language: "en",
    usageCount: 11,
    spend: 2140,
    roas: 3.08,
    ctr: 3.12,
    usedIn: {
      campaigns: ["Search Branded", "PMax Prospecting"],
      ads: ["RSA - Free Shipping", "RSA - Bundle Offer"],
    },
    similarCopies: [
      "Official site deals with fast delivery.",
      "Shop new arrivals with express shipping.",
    ],
    updatedAt: "2026-02-26",
  },
  {
    id: "cp-3",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.TIKTOK,
    objective: "awareness",
    headline: "Watch It. Want It. Get It.",
    snippet: "See the product in action and order in minutes.",
    body: "See the product in action and order in minutes.",
    fullText:
      "See the product in action and order in minutes. Tap to watch real customer use-cases and shop instantly.",
    status: "draft",
    language: "en",
    usageCount: 7,
    spend: 920,
    roas: 2.63,
    ctr: 2.22,
    usedIn: {
      campaigns: ["Spark Ads Conversion"],
      ads: ["Hook Variant A", "Hook Variant B"],
    },
    similarCopies: [
      "Try it in 60 seconds.",
      "From scroll to checkout in one tap.",
    ],
    updatedAt: "2026-02-23",
  },
  {
    id: "cp-4",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.PINTEREST,
    objective: "traffic",
    headline: "Spring Collection Now Live",
    snippet: "Curated seasonal looks for your home.",
    body: "Curated seasonal looks for your home. Explore now.",
    fullText:
      "Curated seasonal looks for your home. Explore new arrivals and pin your favorites for later.",
    status: "approved",
    language: "en",
    usageCount: 5,
    spend: 540,
    roas: 2.71,
    ctr: 1.88,
    usedIn: {
      campaigns: ["Seasonal Boards"],
      ads: ["Pin Creative A", "Pin Creative B"],
    },
    similarCopies: [
      "Fresh spring picks for every room.",
      "Your seasonal board starts here.",
    ],
    updatedAt: "2026-02-20",
  },
  {
    id: "cp-5",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.SNAPCHAT,
    objective: "conversions",
    headline: "Limited Drop. 48 Hours Only.",
    snippet: "Swipe up before it sells out.",
    body: "Swipe up before it sells out. Limited drop.",
    fullText:
      "Swipe up before it sells out. Limited drop available for 48 hours only with priority shipping.",
    status: "approved",
    language: "en",
    usageCount: 6,
    spend: 610,
    roas: 2.44,
    ctr: 1.62,
    usedIn: {
      campaigns: ["Story Push"],
      ads: ["Story Ad A", "Story Ad B"],
    },
    similarCopies: [
      "Only 2 days left to shop this drop.",
      "Last chance: new drop ends soon.",
    ],
    updatedAt: "2026-02-28",
  },
];

const INTEGRATIONS: IntegrationConnection[] = [
  {
    id: "int-shopify-1",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.SHOPIFY,
    status: IntegrationStatus.DISCONNECTED,
    lastSyncAt: null,
  },
  {
    id: "int-meta-1",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.META,
    status: IntegrationStatus.CONNECTED,
    lastSyncAt: "2026-03-04T08:45:00.000Z",
  },
  {
    id: "int-google-1",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.GOOGLE,
    status: IntegrationStatus.CONNECTED,
    lastSyncAt: "2026-03-04T09:14:00.000Z",
  },
  {
    id: "int-tiktok-1",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.TIKTOK,
    status: IntegrationStatus.ERROR,
    lastSyncAt: "2026-03-03T20:10:00.000Z",
    message: "Token expired. Refresh required.",
  },
  {
    id: "int-pinterest-1",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.PINTEREST,
    status: IntegrationStatus.DISCONNECTED,
    lastSyncAt: null,
  },
  {
    id: "int-snapchat-1",
    businessId: DEMO_BUSINESS_ID,
    platform: Platform.SNAPCHAT,
    status: IntegrationStatus.DISCONNECTED,
    lastSyncAt: null,
  },
];

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export * from "@/src/services/data-service-overview";
export * from "@/src/services/data-service-ai";

export async function getPlatformTable(
  platform: Platform,
  level: PlatformLevel,
  businessId: string,
  accountId: string | null,
  dateRange: DateRange,
  metrics: Array<keyof MetricsRow>
): Promise<PlatformTableRow[]> {
  // For Google Ads, fetch real data from API
  if (platform === Platform.GOOGLE) {
    return getGooglePlatformTable(
      level,
      businessId,
      accountId,
      dateRange,
      metrics
    );
  }

  // For other platforms, use mock data
  await wait(MOCK_DELAY_MS);

  void businessId;
  void dateRange;

  return PLATFORM_TABLE_ROWS.filter(
    (row) =>
      row.platform === platform &&
      row.level === level &&
      (accountId ? row.accountId === accountId : true)
  ).map((row) => {
    const selectedMetrics = metrics.reduce<Partial<MetricsRow>>((acc, key) => {
      const value = row.metrics[key];
      if (typeof value !== "undefined") {
        acc[key] = value;
      }
      return acc;
    }, {});

    return {
      ...row,
      metrics: selectedMetrics,
    };
  });
}

export async function getCreatives(
  businessId: string,
  filters?: {
    platforms?: Platform[];
    dateRange?: "7d" | "30d";
    format?: "all" | "image" | "video";
    sortBy?: "roas" | "spend" | "ctr";
    search?: string;
  }
): Promise<Creative[]> {
  await wait(MOCK_DELAY_MS);
  const now = new Date("2026-03-05T12:00:00.000Z");
  const days = filters?.dateRange === "7d" ? 7 : 30;
  const minDate = new Date(now);
  minDate.setDate(now.getDate() - days);

  const filtered = CREATIVES.filter((item) => {
    const createdAt = new Date(item.createdAt);
    return (
      item.businessId === businessId &&
      (filters?.platforms && filters.platforms.length > 0
        ? filters.platforms.includes(item.platform)
        : true) &&
      (filters?.format && filters.format !== "all" ? item.format === filters.format : true) &&
      createdAt >= minDate &&
      (filters?.search
        ? item.name.toLowerCase().includes(filters.search.toLowerCase()) ||
          item.headline.toLowerCase().includes(filters.search.toLowerCase())
        : true)
    );
  });

  const sortKey = filters?.sortBy ?? "roas";
  return [...filtered].sort((a, b) => b.metrics[sortKey] - a.metrics[sortKey]);
}

export async function getLandingPages(
  businessId: string,
  filters?: {
    platform?: Platform;
    dateRange?: "7d" | "30d";
    search?: string;
  }
): Promise<LandingPage[]> {
  await wait(MOCK_DELAY_MS);
  const now = new Date("2026-03-05T12:00:00.000Z");
  const days = filters?.dateRange === "7d" ? 7 : 30;
  const minDate = new Date(now);
  minDate.setDate(now.getDate() - days);

  return LANDING_PAGES.filter((item) => {
    const updatedAt = new Date(item.updatedAt);
    return (
      item.businessId === businessId &&
      (filters?.platform ? item.platform === filters.platform : true) &&
      updatedAt >= minDate &&
      (filters?.search
        ? item.url.toLowerCase().includes(filters.search.toLowerCase()) ||
          item.name.toLowerCase().includes(filters.search.toLowerCase())
        : true)
    );
  });
}

export async function getCopies(
  businessId: string,
  filters?: {
    platform?: Platform;
    dateRange?: "7d" | "30d";
    objective?: Copy["objective"] | "all";
    search?: string;
  }
): Promise<Copy[]> {
  await wait(MOCK_DELAY_MS);
  const now = new Date("2026-03-05T12:00:00.000Z");
  const days = filters?.dateRange === "7d" ? 7 : 30;
  const minDate = new Date(now);
  minDate.setDate(now.getDate() - days);

  return COPIES.filter((item) => {
    const updatedAt = new Date(item.updatedAt);
    return (
      item.businessId === businessId &&
      (filters?.platform ? item.platform === filters.platform : true) &&
      (filters?.objective && filters.objective !== "all"
        ? item.objective === filters.objective
        : true) &&
      updatedAt >= minDate &&
      (filters?.search
        ? item.headline.toLowerCase().includes(filters.search.toLowerCase()) ||
          item.snippet.toLowerCase().includes(filters.search.toLowerCase())
        : true)
    );
  }).sort((a, b) => b.roas - a.roas);
}

export async function getIntegrations(
  businessId: string
): Promise<IntegrationConnection[]> {
  await wait(MOCK_DELAY_MS);

  return INTEGRATIONS.filter((item) => item.businessId === businessId);
}
