export type MetaSyncType =
  | "initial_backfill"
  | "incremental_recent"
  | "today_refresh"
  | "repair_window"
  | "reconnect_backfill";

export type MetaSyncStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";

export type MetaWarehouseDataState =
  | "not_connected"
  | "connected_no_assignment"
  | "syncing"
  | "partial"
  | "stale"
  | "ready"
  | "action_required";

export type MetaRawSnapshotStatus = "fetched" | "partial" | "failed";

export type MetaWarehouseScope =
  | "account_daily"
  | "campaign_daily"
  | "adset_daily"
  | "ad_daily"
  | "creative_daily";

export interface MetaWarehouseMetricSet {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number | null;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number | null;
  ctr: number | null;
  cpc: number | null;
}

export interface MetaWarehouseBaseRow extends MetaWarehouseMetricSet {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  sourceSnapshotId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetaAccountDailyRow extends MetaWarehouseBaseRow {
  accountName: string | null;
}

export interface MetaCampaignDailyRow extends MetaWarehouseBaseRow {
  campaignId: string;
  campaignNameCurrent: string | null;
  campaignNameHistorical: string | null;
  campaignStatus: string | null;
  objective: string | null;
  buyingType: string | null;
}

export interface MetaAdSetDailyRow extends MetaWarehouseBaseRow {
  campaignId: string | null;
  adsetId: string;
  adsetNameCurrent: string | null;
  adsetNameHistorical: string | null;
  adsetStatus: string | null;
}

export interface MetaAdDailyRow extends MetaWarehouseBaseRow {
  campaignId: string | null;
  adsetId: string | null;
  adId: string;
  adNameCurrent: string | null;
  adNameHistorical: string | null;
  adStatus: string | null;
  payloadJson?: unknown;
}

export interface MetaCreativeDailyRow extends MetaWarehouseBaseRow {
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  creativeId: string;
  creativeName: string | null;
  headline: string | null;
  primaryText: string | null;
  destinationUrl: string | null;
  thumbnailUrl: string | null;
  assetType: string | null;
  payloadJson?: unknown;
}

export interface MetaSyncJobRecord {
  id?: string;
  businessId: string;
  providerAccountId: string;
  syncType: MetaSyncType;
  scope: MetaWarehouseScope;
  startDate: string;
  endDate: string;
  status: MetaSyncStatus;
  progressPercent: number;
  triggerSource: string;
  retryCount: number;
  lastError: string | null;
  triggeredAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt?: string;
}

export interface MetaRawSnapshotRecord {
  id?: string;
  businessId: string;
  providerAccountId: string;
  endpointName: string;
  entityScope: string;
  startDate: string;
  endDate: string;
  accountTimezone: string | null;
  accountCurrency: string | null;
  payloadJson: unknown;
  payloadHash: string;
  requestContext: Record<string, unknown>;
  providerHttpStatus: number | null;
  status: MetaRawSnapshotStatus;
  fetchedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetaWarehouseFreshness {
  dataState: MetaWarehouseDataState;
  lastSyncedAt: string | null;
  liveRefreshedAt: string | null;
  isPartial: boolean;
  missingWindows: string[];
  warnings: string[];
}
