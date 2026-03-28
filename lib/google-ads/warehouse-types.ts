export type GoogleAdsSyncType =
  | "initial_backfill"
  | "incremental_recent"
  | "today_refresh"
  | "repair_window"
  | "reconnect_backfill";

export type GoogleAdsSyncStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";

export type GoogleAdsSyncLane = "core" | "extended" | "maintenance";

export type GoogleAdsPartitionStatus =
  | "queued"
  | "leased"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_letter"
  | "cancelled";

export type GoogleAdsWarehouseDataState =
  | "not_connected"
  | "connected_no_assignment"
  | "syncing"
  | "partial"
  | "advisor_not_ready"
  | "stale"
  | "ready"
  | "action_required";

export type GoogleAdsRawSnapshotStatus = "fetched" | "partial" | "failed";

export type GoogleAdsWarehouseScope =
  | "account_daily"
  | "campaign_daily"
  | "ad_group_daily"
  | "ad_daily"
  | "keyword_daily"
  | "search_term_daily"
  | "asset_group_daily"
  | "asset_daily"
  | "audience_daily"
  | "geo_daily"
  | "device_daily"
  | "product_daily";

export interface GoogleAdsWarehouseMetricSet {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number;
  conversionRate: number | null;
  interactionRate: number | null;
}

export interface GoogleAdsWarehouseDailyRow extends GoogleAdsWarehouseMetricSet {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  entityKey: string;
  entityLabel: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  status: string | null;
  channel: string | null;
  classification: string | null;
  payloadJson?: unknown;
  sourceSnapshotId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GoogleAdsSyncJobRecord {
  id?: string;
  businessId: string;
  providerAccountId: string;
  syncType: GoogleAdsSyncType;
  scope: GoogleAdsWarehouseScope;
  startDate: string;
  endDate: string;
  status: GoogleAdsSyncStatus;
  progressPercent: number;
  triggerSource: string;
  retryCount: number;
  lastError: string | null;
  triggeredAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt?: string;
}

export interface GoogleAdsRawSnapshotRecord {
  id?: string;
  businessId: string;
  providerAccountId: string;
  partitionId?: string | null;
  checkpointId?: string | null;
  endpointName: string;
  entityScope: string;
  pageIndex?: number | null;
  providerCursor?: string | null;
  startDate: string;
  endDate: string;
  accountTimezone: string | null;
  accountCurrency: string | null;
  payloadJson: unknown;
  payloadHash: string;
  requestContext: Record<string, unknown>;
  responseHeaders?: Record<string, unknown>;
  providerHttpStatus: number | null;
  status: GoogleAdsRawSnapshotStatus;
  fetchedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GoogleAdsSyncCheckpointRecord {
  id?: string;
  partitionId: string;
  businessId: string;
  providerAccountId: string;
  checkpointScope: string;
  isPaginated?: boolean;
  phase: "fetch_raw" | "transform" | "bulk_upsert" | "finalize";
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  pageIndex: number;
  nextPageToken?: string | null;
  providerCursor?: string | null;
  rawSnapshotIds?: string[];
  rowsFetched?: number;
  rowsWritten?: number;
  lastSuccessfulEntityKey?: string | null;
  lastResponseHeaders?: Record<string, unknown>;
  checkpointHash?: string | null;
  attemptCount: number;
  progressHeartbeatAt?: string | null;
  retryAfterAt?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  poisonedAt?: string | null;
  poisonReason?: string | null;
  replayReasonCode?: string | null;
  replayDetail?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GoogleAdsSyncPartitionRecord {
  id?: string;
  businessId: string;
  providerAccountId: string;
  lane: GoogleAdsSyncLane;
  scope: GoogleAdsWarehouseScope;
  partitionDate: string;
  status: GoogleAdsPartitionStatus;
  priority: number;
  source: string;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  attemptCount: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt?: string;
}

export interface GoogleAdsRunnerLeaseRecord {
  businessId: string;
  lane: GoogleAdsSyncLane;
  leaseOwner: string;
  leaseExpiresAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GoogleAdsSyncRunRecord {
  id?: string;
  partitionId: string;
  businessId: string;
  providerAccountId: string;
  lane: GoogleAdsSyncLane;
  scope: GoogleAdsWarehouseScope;
  partitionDate: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  workerId?: string | null;
  attemptCount: number;
  rowCount?: number | null;
  durationMs?: number | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  metaJson?: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GoogleAdsSyncStateRecord {
  businessId: string;
  providerAccountId: string;
  scope: GoogleAdsWarehouseScope;
  historicalTargetStart: string;
  historicalTargetEnd: string;
  effectiveTargetStart: string;
  effectiveTargetEnd: string;
  readyThroughDate?: string | null;
  lastSuccessfulPartitionDate?: string | null;
  latestBackgroundActivityAt?: string | null;
  latestSuccessfulSyncAt?: string | null;
  completedDays: number;
  deadLetterCount: number;
  updatedAt?: string;
}

export interface GoogleAdsWarehouseFreshness {
  dataState: GoogleAdsWarehouseDataState;
  lastSyncedAt: string | null;
  liveRefreshedAt: string | null;
  isPartial: boolean;
  missingWindows: string[];
  warnings: string[];
}
