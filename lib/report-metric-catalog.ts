import type {
  CustomReportDataSource,
  CustomReportPlatform,
  CustomReportWidgetDefinition,
  CustomReportWidgetType,
} from "@/lib/custom-reports";

export interface ReportMetricCatalogItem {
  value: string;
  label: string;
}

export interface ReportColumnCatalogItem {
  value: string;
  label: string;
}

interface ReportWidgetCatalogEntry {
  dataSource: CustomReportDataSource;
  metrics?: ReportMetricCatalogItem[];
  columns?: ReportColumnCatalogItem[];
  breakdowns?: Array<{ value: "day" | "week" | "month"; label: string }>;
  defaultMetric?: string;
  defaultColumns?: string[];
}

export interface ReportPlatformCatalogEntry {
  id: CustomReportPlatform;
  label: string;
  logoSrc?: string;
  supported: boolean;
  accountScoped: boolean;
  widgets: Partial<Record<"metric" | "trend" | "bar" | "table", ReportWidgetCatalogEntry>>;
}

const META_METRICS: ReportMetricCatalogItem[] = [
  { value: "spend", label: "Amount Spent" },
  { value: "revenue", label: "Revenue" },
  { value: "purchases", label: "Website Purchases" },
  { value: "roas", label: "ROAS (Website)" },
  { value: "cpa", label: "Cost per Website Purchase" },
  { value: "clicks", label: "Clicks" },
  { value: "outboundClicks", label: "Outbound Clicks" },
  { value: "uniqueClicks", label: "Unique Clicks" },
  { value: "ctr", label: "CTR" },
  { value: "outboundCtr", label: "Outbound CTR" },
  { value: "uniqueCtr", label: "Unique CTR" },
  { value: "cpm", label: "CPM" },
  { value: "cpc", label: "CPC (All Clicks)" },
  { value: "cpp", label: "CPP" },
  { value: "impressions", label: "Impressions" },
  { value: "reach", label: "Reach" },
  { value: "frequency", label: "Frequency" },
  { value: "landingPageViews", label: "Landing Page Views" },
  { value: "costPerLandingPageView", label: "Cost per Landing Page View" },
  { value: "addToCart", label: "Adds to Cart" },
  { value: "addToCartValue", label: "Adds to Cart Value" },
  { value: "costPerAddToCart", label: "Cost per Add to Cart" },
  { value: "initiateCheckout", label: "Checkouts Initiated" },
  { value: "initiateCheckoutValue", label: "Checkouts Initiated Value" },
  { value: "costPerCheckoutInitiated", label: "Cost per Checkout Initiated" },
  { value: "leads", label: "Leads (All)" },
  { value: "leadsValue", label: "Leads Value" },
  { value: "costPerLead", label: "Cost per Lead (All)" },
  { value: "contentViews", label: "Content Views" },
  { value: "contentViewsValue", label: "Content Views Value" },
  { value: "costPerContentView", label: "Cost per Content View" },
  { value: "registrationsCompleted", label: "Registrations Completed" },
  { value: "registrationsCompletedValue", label: "Registrations Completed Value" },
  { value: "costPerRegistrationCompleted", label: "Cost per Registration Completed" },
  { value: "searches", label: "Searches" },
  { value: "searchesValue", label: "Searches Value" },
  { value: "costPerSearch", label: "Cost per Search" },
  { value: "addPaymentInfo", label: "Add Payment Info" },
  { value: "addPaymentInfoValue", label: "Add Payment Info Value" },
  { value: "costPerAddPaymentInfo", label: "Cost per Add Payment Info" },
  { value: "pageLikes", label: "Page Likes" },
  { value: "costPerPageLike", label: "Cost per Page Like" },
  { value: "postEngagement", label: "Post Engagement" },
  { value: "costPerEngagement", label: "Cost per Engagement" },
  { value: "postReactions", label: "Post Reactions" },
  { value: "costPerReaction", label: "Cost per Reaction" },
  { value: "postComments", label: "Post Comments" },
  { value: "costPerPostComment", label: "Cost per Post Comment" },
  { value: "postShares", label: "Post Shares" },
  { value: "costPerPostShare", label: "Cost per Post Share" },
  { value: "messagingConversationsStarted", label: "Messenger Conversation Started" },
  { value: "costPerMessagingConversationStarted", label: "Cost Per Messenger Conversation Started" },
  { value: "appInstalls", label: "Mobile App Installs" },
  { value: "costPerAppInstall", label: "Cost Per Mobile App Install" },
  { value: "videoViews3s", label: "3-Second Video Views" },
  { value: "videoViews15s", label: "15-Second Video Views" },
  { value: "videoViews25", label: "Video Watches at 25%" },
  { value: "videoViews50", label: "Video Watches at 50%" },
  { value: "videoViews75", label: "Video Watches at 75%" },
  { value: "videoViews95", label: "Video Watches at 95%" },
  { value: "videoViews100", label: "Video Watches at 100%" },
  { value: "costPerVideoView", label: "Cost per Video View" },
];

const GOOGLE_METRICS: ReportMetricCatalogItem[] = [
  { value: "spend", label: "Spend" },
  { value: "revenue", label: "Revenue" },
  { value: "conversions", label: "Conversions" },
  { value: "roas", label: "ROAS" },
  { value: "cpa", label: "CPA" },
  { value: "ctr", label: "CTR" },
  { value: "impressions", label: "Impressions" },
  { value: "clicks", label: "Clicks" },
  { value: "cpc", label: "Average CPC" },
  { value: "averageCost", label: "Average Cost" },
  { value: "interactions", label: "Interactions" },
  { value: "interactionRate", label: "Interaction Rate" },
  { value: "conversionRate", label: "Conversion Rate" },
  { value: "costPerConversion", label: "Cost per Conversion" },
  { value: "valuePerConversion", label: "Value per Conversion" },
  { value: "videoViews", label: "Video Views" },
  { value: "videoViewRate", label: "Video View Rate" },
  { value: "engagements", label: "Engagements" },
  { value: "engagementRate", label: "Engagement Rate" },
];

const ALL_METRICS: ReportMetricCatalogItem[] = [
  { value: "spend", label: "Spend" },
  { value: "revenue", label: "Revenue" },
  { value: "purchases", label: "Purchases" },
  { value: "roas", label: "ROAS" },
];

const META_COLUMNS: ReportColumnCatalogItem[] = [
  { value: "name", label: "Campaign Name" },
  { value: "status", label: "Status" },
  { value: "spend", label: "Amount Spent" },
  { value: "revenue", label: "Revenue" },
  { value: "purchases", label: "Website Purchases" },
  { value: "roas", label: "ROAS (Website)" },
  { value: "cpa", label: "Cost per Website Purchase" },
  { value: "ctr", label: "CTR" },
  { value: "cpm", label: "CPM" },
  { value: "impressions", label: "Impressions" },
  { value: "clicks", label: "Clicks" },
  { value: "currency", label: "Currency" },
  { value: "reach", label: "Reach" },
  { value: "frequency", label: "Frequency" },
  { value: "cpc", label: "CPC (All Clicks)" },
  { value: "cpp", label: "CPP" },
  { value: "uniqueClicks", label: "Unique Clicks" },
  { value: "uniqueCtr", label: "Unique CTR" },
  { value: "outboundClicks", label: "Outbound Clicks" },
  { value: "outboundCtr", label: "Outbound CTR" },
  { value: "uniqueOutboundClicks", label: "Unique Outbound Clicks" },
  { value: "uniqueOutboundCtr", label: "Unique Outbound CTR" },
  { value: "landingPageViews", label: "Landing Page Views" },
  { value: "costPerLandingPageView", label: "Cost per Landing Page View" },
  { value: "addToCart", label: "Adds to Cart" },
  { value: "addToCartValue", label: "Adds to Cart Value" },
  { value: "costPerAddToCart", label: "Cost per Add to Cart" },
  { value: "initiateCheckout", label: "Checkouts Initiated" },
  { value: "initiateCheckoutValue", label: "Checkouts Initiated Value" },
  { value: "costPerCheckoutInitiated", label: "Cost per Checkout Initiated" },
  { value: "leads", label: "Leads (All)" },
  { value: "leadsValue", label: "Leads Value" },
  { value: "costPerLead", label: "Cost per Lead (All)" },
  { value: "contentViews", label: "Content Views" },
  { value: "contentViewsValue", label: "Content Views Value" },
  { value: "costPerContentView", label: "Cost per Content View" },
  { value: "registrationsCompleted", label: "Registrations Completed" },
  { value: "registrationsCompletedValue", label: "Registrations Completed Value" },
  { value: "costPerRegistrationCompleted", label: "Cost per Registration Completed" },
  { value: "searches", label: "Searches" },
  { value: "searchesValue", label: "Searches Value" },
  { value: "costPerSearch", label: "Cost per Search" },
  { value: "addPaymentInfo", label: "Add Payment Info" },
  { value: "addPaymentInfoValue", label: "Add Payment Info Value" },
  { value: "costPerAddPaymentInfo", label: "Cost per Add Payment Info" },
  { value: "pageLikes", label: "Page Likes" },
  { value: "costPerPageLike", label: "Cost per Page Like" },
  { value: "postEngagement", label: "Post Engagement" },
  { value: "costPerEngagement", label: "Cost per Engagement" },
  { value: "postReactions", label: "Post Reactions" },
  { value: "costPerReaction", label: "Cost per Reaction" },
  { value: "postComments", label: "Post Comments" },
  { value: "costPerPostComment", label: "Cost per Post Comment" },
  { value: "postShares", label: "Post Shares" },
  { value: "costPerPostShare", label: "Cost per Post Share" },
  { value: "messagingConversationsStarted", label: "Messenger Conversation Started" },
  { value: "costPerMessagingConversationStarted", label: "Cost Per Messenger Conversation Started" },
  { value: "appInstalls", label: "Mobile App Installs" },
  { value: "costPerAppInstall", label: "Cost Per Mobile App Install" },
  { value: "videoViews3s", label: "3-Second Video Views" },
  { value: "videoViews15s", label: "15-Second Video Views" },
  { value: "videoViews25", label: "Video Watches at 25%" },
  { value: "videoViews50", label: "Video Watches at 50%" },
  { value: "videoViews75", label: "Video Watches at 75%" },
  { value: "videoViews95", label: "Video Watches at 95%" },
  { value: "videoViews100", label: "Video Watches at 100%" },
  { value: "costPerVideoView", label: "Cost per Video View" },
];

const GOOGLE_COLUMNS: ReportColumnCatalogItem[] = [
  { value: "name", label: "Campaign Name" },
  { value: "status", label: "Status" },
  { value: "spend", label: "Spend" },
  { value: "revenue", label: "Revenue" },
  { value: "conversions", label: "Conversions" },
  { value: "roas", label: "ROAS" },
  { value: "cpa", label: "CPA" },
  { value: "ctr", label: "CTR" },
  { value: "impressions", label: "Impressions" },
  { value: "clicks", label: "Clicks" },
  { value: "cpc", label: "Average CPC" },
  { value: "averageCost", label: "Average Cost" },
  { value: "interactions", label: "Interactions" },
  { value: "interactionRate", label: "Interaction Rate" },
  { value: "conversionRate", label: "Conversion Rate" },
  { value: "costPerConversion", label: "Cost per Conversion" },
  { value: "valuePerConversion", label: "Value per Conversion" },
  { value: "videoViews", label: "Video Views" },
  { value: "videoViewRate", label: "Video View Rate" },
  { value: "engagements", label: "Engagements" },
  { value: "engagementRate", label: "Engagement Rate" },
];

const ATTRIBUTION_COLUMNS: ReportColumnCatalogItem[] = [
  { value: "channel", label: "Channel" },
  { value: "spend", label: "Spend" },
  { value: "revenue", label: "Revenue" },
  { value: "roas", label: "ROAS" },
  { value: "conversions", label: "Conversions" },
  { value: "clicks", label: "Clicks" },
  { value: "ctr", label: "CTR" },
  { value: "cpa", label: "CPA" },
];

const CHART_BREAKDOWNS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

function prefixMetricOptions(
  prefix: "combined" | "meta" | "google",
  metrics: ReportMetricCatalogItem[]
): ReportMetricCatalogItem[] {
  return metrics.map((metric) => ({
    value: `${prefix}.${metric.value}`,
    label: metric.label,
  }));
}

export const REPORT_PLATFORM_CATALOG: Record<CustomReportPlatform, ReportPlatformCatalogEntry> = {
  all: {
    id: "all",
    label: "All Channels",
    supported: true,
    accountScoped: false,
    widgets: {
      metric: {
        dataSource: "overview_summary",
        metrics: ALL_METRICS,
        defaultMetric: "spend",
      },
      trend: {
        dataSource: "overview_trend",
        metrics: prefixMetricOptions("combined", ALL_METRICS),
        defaultMetric: "combined.spend",
        breakdowns: [...CHART_BREAKDOWNS],
      },
      bar: {
        dataSource: "overview_trend",
        metrics: ALL_METRICS.map((metric) => ({ value: `combined.${metric.value}`, label: metric.label })),
        defaultMetric: "combined.spend",
        breakdowns: [...CHART_BREAKDOWNS],
      },
      table: {
        dataSource: "channel_attribution",
        columns: ATTRIBUTION_COLUMNS,
        defaultColumns: ["channel", "spend", "revenue", "roas", "conversions"],
      },
    },
  },
  meta: {
    id: "meta",
    label: "Meta",
    logoSrc: "/platform-logos/Meta.png",
    supported: true,
    accountScoped: true,
    widgets: {
      metric: {
        dataSource: "meta_campaigns",
        metrics: META_METRICS,
        defaultMetric: "spend",
      },
      trend: {
        dataSource: "overview_trend",
        metrics: prefixMetricOptions("meta", META_METRICS),
        defaultMetric: "meta.spend",
        breakdowns: [...CHART_BREAKDOWNS],
      },
      bar: {
        dataSource: "overview_trend",
        metrics: prefixMetricOptions("meta", META_METRICS),
        defaultMetric: "meta.spend",
        breakdowns: [...CHART_BREAKDOWNS],
      },
      table: {
        dataSource: "meta_campaigns",
        columns: META_COLUMNS,
        defaultColumns: ["name", "status", "spend", "revenue", "purchases", "roas"],
      },
    },
  },
  google: {
    id: "google",
    label: "Google Ads",
    logoSrc: "/platform-logos/googleAds.svg",
    supported: true,
    accountScoped: true,
    widgets: {
      metric: {
        dataSource: "google_campaigns",
        metrics: GOOGLE_METRICS,
        defaultMetric: "spend",
      },
      trend: {
        dataSource: "overview_trend",
        metrics: prefixMetricOptions("google", GOOGLE_METRICS),
        defaultMetric: "google.spend",
        breakdowns: [...CHART_BREAKDOWNS],
      },
      bar: {
        dataSource: "overview_trend",
        metrics: prefixMetricOptions("google", GOOGLE_METRICS),
        defaultMetric: "google.spend",
        breakdowns: [...CHART_BREAKDOWNS],
      },
      table: {
        dataSource: "google_campaigns",
        columns: GOOGLE_COLUMNS,
        defaultColumns: ["name", "status", "spend", "revenue", "conversions", "roas"],
      },
    },
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    logoSrc: "/platform-logos/tiktok.svg",
    supported: false,
    accountScoped: false,
    widgets: {},
  },
  pinterest: {
    id: "pinterest",
    label: "Pinterest",
    logoSrc: "/platform-logos/Pinterest.svg",
    supported: false,
    accountScoped: false,
    widgets: {},
  },
  snapchat: {
    id: "snapchat",
    label: "Snapchat",
    logoSrc: "/platform-logos/snapchat.svg",
    supported: false,
    accountScoped: false,
    widgets: {},
  },
  klaviyo: {
    id: "klaviyo",
    label: "Klaviyo",
    logoSrc: "/platform-logos/Klaviyo.svg",
    supported: false,
    accountScoped: false,
    widgets: {},
  },
  shopify: {
    id: "shopify",
    label: "Shopify",
    logoSrc: "/platform-logos/shopify.svg",
    supported: false,
    accountScoped: false,
    widgets: {},
  },
  ga4: {
    id: "ga4",
    label: "GA4",
    logoSrc: "/platform-logos/GA4.svg",
    supported: false,
    accountScoped: false,
    widgets: {},
  },
  search_console: {
    id: "search_console",
    label: "Search Console",
    logoSrc: "/platform-logos/searchconsole.svg",
    supported: false,
    accountScoped: false,
    widgets: {},
  },
};

export function getReportPlatformLogo(platform: CustomReportPlatform) {
  return REPORT_PLATFORM_CATALOG[platform]?.logoSrc ?? null;
}

export function resolveWidgetPlatform(widget: Pick<CustomReportWidgetDefinition, "platform" | "dataSource">): CustomReportPlatform {
  if (widget.platform && REPORT_PLATFORM_CATALOG[widget.platform]) return widget.platform;
  if (widget.dataSource === "meta_campaigns") return "meta";
  if (widget.dataSource === "google_campaigns") return "google";
  return "all";
}

export function getCatalogWidgetConfig(
  platform: CustomReportPlatform,
  widgetType: CustomReportWidgetType
) {
  if (widgetType === "text" || widgetType === "section") return null;
  return REPORT_PLATFORM_CATALOG[platform].widgets[widgetType] ?? null;
}

export function getSupportedPlatformsForWidget(widgetType: CustomReportWidgetType) {
  return (Object.values(REPORT_PLATFORM_CATALOG) as ReportPlatformCatalogEntry[]).filter(
    (entry) => entry.supported && Boolean(getCatalogWidgetConfig(entry.id, widgetType))
  );
}

export function getMetricOptionsForPlatform(
  platform: CustomReportPlatform,
  widgetType: CustomReportWidgetType
) {
  return getCatalogWidgetConfig(platform, widgetType)?.metrics ?? [];
}

export function getMetricLabelForKey(metricKey: string) {
  const suffix = metricKey.includes(".") ? metricKey.split(".").pop() ?? metricKey : metricKey;
  const catalogs = [ALL_METRICS, META_METRICS, GOOGLE_METRICS];
  for (const catalog of catalogs) {
    const match = catalog.find((metric) => metric.value === suffix);
    if (match) return match.label;
  }
  return suffix.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
}

export function getColumnOptionsForPlatform(platform: CustomReportPlatform) {
  return getCatalogWidgetConfig(platform, "table")?.columns ?? [];
}

export function getDefaultColumnsForPlatform(platform: CustomReportPlatform) {
  return getCatalogWidgetConfig(platform, "table")?.defaultColumns ?? [];
}

export function getDefaultMetricForPlatform(
  platform: CustomReportPlatform,
  widgetType: CustomReportWidgetType
) {
  return getCatalogWidgetConfig(platform, widgetType)?.defaultMetric;
}

export function getDataSourceForPlatform(
  platform: CustomReportPlatform,
  widgetType: CustomReportWidgetType
) {
  return getCatalogWidgetConfig(platform, widgetType)?.dataSource;
}

export function getBreakdownOptionsForPlatform(
  platform: CustomReportPlatform,
  widgetType: CustomReportWidgetType
) {
  return getCatalogWidgetConfig(platform, widgetType)?.breakdowns ?? [];
}

export function platformSupportsAccountSelection(platform: CustomReportPlatform) {
  return REPORT_PLATFORM_CATALOG[platform]?.accountScoped ?? false;
}
