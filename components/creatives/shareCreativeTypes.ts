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
  format: "image" | "video";
  thumbnailUrl: string;
  launchDate: string;
  tags: string[];
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  ctrAll: number;
  purchases: number;
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
  note?: string;
}
