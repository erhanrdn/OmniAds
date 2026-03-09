export type ShareMetricKey =
  | "spend"
  | "purchaseValue"
  | "roas"
  | "cpa"
  | "ctrAll"
  | "purchases";

export interface SharedCreative {
  id: string;
  name: string;
  currency?: string | null;
  format: "image" | "video" | "catalog";
  previewState: "preview" | "catalog" | "unavailable";
  isCatalog: boolean;
  previewUrl: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  preview: {
    render_mode: "video" | "image" | "unavailable";
    image_url: string | null;
    video_url: string | null;
    poster_url: string | null;
    source:
      | "preview_url"
      | "thumbnail_url"
      | "image_url"
      | "image_hash"
      | null;
    is_catalog: boolean;
  };
  launchDate: string;
  tags: string[];
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  cpcLink?: number;
  cpm?: number;
  ctrAll: number;
  purchases: number;
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

export interface ShareLinkConfig {
  title: string;
  expiration: "3" | "7" | "14";
  metrics: ShareMetricKey[];
  includeNotes: boolean;
  passwordProtection: boolean;
}

export interface ExportPdfConfig {
  title: string;
  includeSummary: boolean;
  includeNotes: boolean;
}

/** Payload shape expected from backend for the public share page */
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
