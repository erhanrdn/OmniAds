export type MetaMetricKey =
  | "spend"
  | "purchaseValue"
  | "roas"
  | "cpa"
  | "cpcLink"
  | "cpm"
  | "ctrAll"
  | "purchases"
  | "thumbstop"
  | "video25"
  | "video50"
  | "clickToPurchase"
  | "atcToPurchaseRatio";

export type MetaAiTagKey =
  | "assetType"
  | "visualFormat"
  | "intendedAudience"
  | "messagingAngle"
  | "seasonality"
  | "offerType"
  | "hookTactic"
  | "headlineTactic";

export type MetaAiTags = Partial<Record<MetaAiTagKey, string[]>>;

export interface MetaCreativeRow {
  id: string;
  name: string;
  associatedAdsCount: number;
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  format: "image" | "video" | "catalog";
  creativeType: "feed" | "video" | "flexible" | "feed_catalog";
  creativeTypeLabel: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  imageUrl: string | null;
  isCatalog: boolean;
  previewState: "preview" | "catalog" | "unavailable";
  preview: {
    render_mode: "html_preview" | "video" | "image" | "unavailable";
    html: string | null;
    image_url: string | null;
    video_url: string | null;
    poster_url: string | null;
    source:
      | "preview_url"
      | "thumbnail_url"
      | "image_url"
      | "image_hash"
      | "ad_preview_html"
      | "preview_html_video"
      | "preview_html_image"
      | null;
    is_catalog: boolean;
  };
  launchDate: string;
  tags: string[];
  aiTags: MetaAiTags;
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  cpcLink: number;
  cpm: number;
  ctrAll: number;
  purchases: number;
  impressions: number;
  linkClicks: number;
  addToCart: number;
  thumbstop: number;
  clickToPurchase: number;
  video25: number;
  video50: number;
  video75: number;
  video100: number;
  atcToPurchaseRatio: number;
}

type GoodDirection = "high" | "low" | "neutral";

export const METRIC_CONFIG: Record<
  MetaMetricKey,
  {
    label: string;
    goodDirection: GoodDirection;
    format: (value: number) => string;
  }
> = {
  spend: {
    label: "Spend",
    goodDirection: "neutral",
    format: (value) => `$${value.toLocaleString()}`,
  },
  purchaseValue: {
    label: "Purchase value",
    goodDirection: "high",
    format: (value) => `$${value.toLocaleString()}`,
  },
  roas: {
    label: "ROAS",
    goodDirection: "high",
    format: (value) => value.toFixed(2),
  },
  cpa: {
    label: "CPA",
    goodDirection: "low",
    format: (value) => `$${value.toFixed(2)}`,
  },
  cpcLink: {
    label: "CPC (link)",
    goodDirection: "low",
    format: (value) => `$${value.toFixed(2)}`,
  },
  cpm: {
    label: "CPM",
    goodDirection: "low",
    format: (value) => `$${value.toFixed(2)}`,
  },
  ctrAll: {
    label: "CTR (all)",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  purchases: {
    label: "Purchases",
    goodDirection: "high",
    format: (value) => value.toLocaleString(),
  },
  thumbstop: {
    label: "Thumbstop",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  video25: {
    label: "25% video plays rate",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  video50: {
    label: "50% video plays rate",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  clickToPurchase: {
    label: "Click to purchase",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
  atcToPurchaseRatio: {
    label: "ATC to purchase ratio",
    goodDirection: "high",
    format: (value) => `${value.toFixed(2)}%`,
  },
};

export const METRIC_OPTIONS: MetaMetricKey[] = [
  "spend",
  "purchaseValue",
  "roas",
  "cpa",
  "cpcLink",
  "cpm",
  "ctrAll",
  "purchases",
  "thumbstop",
  "video25",
  "video50",
  "clickToPurchase",
  "atcToPurchaseRatio",
];

export const DEFAULT_TABLE_METRICS: MetaMetricKey[] = [
  "spend",
  "purchaseValue",
  "roas",
  "cpa",
  "cpcLink",
  "cpm",
  "ctrAll",
  "purchases",
];
