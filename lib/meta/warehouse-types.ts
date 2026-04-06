export type MetaSyncType =
  | "initial_backfill"
  | "incremental_recent"
  | "today_refresh"
  | "today_observe"
  | "finalize_day"
  | "finalize_range"
  | "repair_recent_day"
  | "repair_window"
  | "reconnect_backfill";

export type MetaSyncStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";

export type MetaSyncLane = "core" | "extended" | "maintenance";

export type MetaSyncPartitionSource =
  | "historical"
  | "historical_recovery"
  | "recent"
  | "recent_recovery"
  | "today"
  | "today_observe"
  | "finalize_day"
  | "repair_recent_day"
  | "priority_window"
  | "request_runtime"
  | "initial_connect"
  | "manual_refresh";

export type MetaWarehouseTruthState =
  | "provisional"
  | "finalized"
  | "repair_pending"
  | "repair_failed";

export type MetaWarehouseValidationStatus =
  | "pending"
  | "passed"
  | "failed";

export type MetaPartitionStatus =
  | "queued"
  | "leased"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_letter"
  | "cancelled";

export type MetaWarehouseDataState =
  | "not_connected"
  | "connected_no_assignment"
  | "syncing"
  | "partial"
  | "stale"
  | "paused"
  | "ready"
  | "action_required";

export type MetaRawSnapshotStatus = "fetched" | "partial" | "failed";

export type MetaWarehouseScope =
  | "account_daily"
  | "campaign_daily"
  | "adset_daily"
  | "ad_daily"
  | "creative_daily"
  | "breakdown_daily";

export type MetaBreakdownType = "age" | "country" | "placement";

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
  truthState?: MetaWarehouseTruthState;
  truthVersion?: number;
  finalizedAt?: string | null;
  validationStatus?: MetaWarehouseValidationStatus;
  sourceRunId?: string | null;
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
  optimizationGoal: string | null;
  bidStrategyType: string | null;
  bidStrategyLabel: string | null;
  manualBidAmount: number | null;
  bidValue: number | null;
  bidValueFormat: "currency" | "roas" | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  isBudgetMixed: boolean;
  isConfigMixed: boolean;
  isOptimizationGoalMixed: boolean;
  isBidStrategyMixed: boolean;
  isBidValueMixed: boolean;
}

export interface MetaAdSetDailyRow extends MetaWarehouseBaseRow {
  campaignId: string | null;
  adsetId: string;
  adsetNameCurrent: string | null;
  adsetNameHistorical: string | null;
  adsetStatus: string | null;
  optimizationGoal: string | null;
  bidStrategyType: string | null;
  bidStrategyLabel: string | null;
  manualBidAmount: number | null;
  bidValue: number | null;
  bidValueFormat: "currency" | "roas" | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  isBudgetMixed: boolean;
  isConfigMixed: boolean;
  isOptimizationGoalMixed: boolean;
  isBidStrategyMixed: boolean;
  isBidValueMixed: boolean;
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
  partitionId?: string | null;
  checkpointId?: string | null;
  runId?: string | null;
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
  status: MetaRawSnapshotStatus;
  fetchedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type MetaSyncCheckpointPhase =
  | "fetch_raw"
  | "transform"
  | "bulk_upsert"
  | "finalize";

export type MetaSyncCheckpointStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface MetaSyncCheckpointRecord {
  id?: string;
  partitionId: string;
  businessId: string;
  providerAccountId: string;
  checkpointScope: string;
  runId?: string | null;
  phase: MetaSyncCheckpointPhase;
  status: MetaSyncCheckpointStatus;
  pageIndex: number;
  nextPageUrl?: string | null;
  providerCursor?: string | null;
  rowsFetched?: number;
  rowsWritten?: number;
  lastSuccessfulEntityKey?: string | null;
  lastResponseHeaders?: Record<string, unknown>;
  checkpointHash?: string | null;
  attemptCount: number;
  retryAfterAt?: string | null;
  leaseEpoch?: number | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetaBreakdownDailyRow extends MetaWarehouseBaseRow {
  breakdownType: MetaBreakdownType;
  breakdownKey: string;
  breakdownLabel: string;
}

export interface MetaSyncPartitionRecord {
  id?: string;
  businessId: string;
  providerAccountId: string;
  lane: MetaSyncLane;
  scope: MetaWarehouseScope;
  partitionDate: string;
  status: MetaPartitionStatus;
  priority: number;
  source: MetaSyncPartitionSource | string;
  leaseEpoch?: number | null;
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

export interface MetaSyncRunRecord {
  id?: string;
  partitionId: string;
  businessId: string;
  providerAccountId: string;
  lane: MetaSyncLane;
  scope: MetaWarehouseScope;
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

export interface MetaSyncStateRecord {
  businessId: string;
  providerAccountId: string;
  scope: MetaWarehouseScope;
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

export interface MetaWarehouseFreshness {
  dataState: MetaWarehouseDataState;
  lastSyncedAt: string | null;
  liveRefreshedAt: string | null;
  isPartial: boolean;
  missingWindows: string[];
  warnings: string[];
}
