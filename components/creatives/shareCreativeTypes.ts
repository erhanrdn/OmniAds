/**
 * Metric keys supported in shared creative reports
 */
export const SHARE_METRIC_KEYS = [
  "spend",
  "purchaseValue",
  "roas",
  "cpa",
  "ctrAll",
  "purchases",
] as const;

export type ShareMetricKey = (typeof SHARE_METRIC_KEYS)[number];

/**
 * Render preview returned from backend
 */
export interface ShareCreativePreview {
  render_mode: "video" | "image" | "unavailable";
  image_url: string | null;
  video_url: string | null;
  poster_url: string | null;
  source: "preview_url" | "thumbnail_url" | "image_url" | "image_hash" | null;
  is_catalog: boolean;
}

/**
 * Creative object used in public share pages
 */
export interface SharedCreative {
  id: string;
  name: string;

  currency?: string | null;

  format: "image" | "video" | "catalog";
  previewState: "preview" | "catalog" | "unavailable";
  isCatalog: boolean;

  /** base image sources */
  previewUrl: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;

  /** optional optimized sources used by UI renderers */
  cardPreviewUrl?: string | null;
  tableThumbnailUrl?: string | null;
  cachedThumbnailUrl?: string | null;

  preview: ShareCreativePreview;

  launchDate: string;
  tags: string[];

  /** core metrics */
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  ctrAll: number;
  purchases: number;

  /** optional metrics */
  cpcLink?: number;
  cpm?: number;
  impressions?: number;
  linkClicks?: number;
  addToCart?: number;
  thumbstop?: number;
  clickToPurchase?: number;
  video25?: number;
  video50?: number;
  video75?: number;
  video100?: number;
  atcToPurchaseRatio?: number;
}

/**
 * Configuration used when generating public share links
 */
export interface ShareLinkConfig {
  title: string;
  expiration: "3" | "7" | "14";
  metrics: ShareMetricKey[];
  includeNotes: boolean;
  passwordProtection: boolean;
}

/**
 * Configuration used when exporting PDF reports
 */
export interface ExportPdfConfig {
  title: string;
  includeSummary: boolean;
  includeNotes: boolean;
}

/**
 * Payload returned from backend for public share page
 */
export interface SharePayload {
  token: string;
  title: string;

  dateRange: string;
  createdAt: string;
  expiresAt: string;

  businessId?: string;
  groupBy?: string;

  filters?: string[];
  selectedRowIds?: string[];
  totalRows?: number;

  metrics: ShareMetricKey[];
  includeNotes: boolean;

  creatives: SharedCreative[];
  benchmarkCreatives?: SharedCreative[];

  note?: string;
}
