import type {
  ProviderCheckpointHealth,
  ProviderDomainReadiness,
  ProviderReadinessLevel,
  ProviderSurfaceSummary,
} from "@/lib/provider-readiness";

export interface MetaSyncDetails {
  id?: string | null;
  status?: string;
  syncType?: string | null;
  scope?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  triggerSource?: string | null;
  triggeredAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastError?: string | null;
  progressPercent?: number | null;
  completedDays?: number | null;
  totalDays?: number | null;
  readyThroughDate?: string | null;
  phaseLabel?: string | null;
}

export interface MetaStatusResponse {
  state:
    | "not_connected"
    | "connected_no_assignment"
    | "syncing"
    | "partial"
    | "stale"
    | "paused"
    | "action_required"
    | "ready";
  connected: boolean;
  readinessLevel?: ProviderReadinessLevel;
  surfaces?: ProviderSurfaceSummary;
  checkpointHealth?: ProviderCheckpointHealth | null;
  domainReadiness?: ProviderDomainReadiness | null;
  assignedAccountIds: string[];
  primaryAccountTimezone?: string | null;
  currentDateInTimezone?: string | null;
  needsBootstrap?: boolean;
  warehouse?: {
    rowCount: number;
    firstDate: string | null;
    lastDate: string | null;
    coverage?: {
      historical?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      selectedRange?: {
        startDate: string;
        endDate: string;
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
        isComplete: boolean;
      } | null;
      scopes?: Array<{
        scope: string;
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
        latestBackgroundActivityAt: string | null;
        deadLetterCount: number;
      }>;
      accountDaily?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      campaignDaily?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      adsetDaily?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      breakdowns?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
      } | null;
      creatives?: {
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
        previewReadyRows?: number;
        totalRows?: number;
        previewReadyPercent?: number;
      } | null;
      pendingSurfaces?: string[];
    } | null;
  } | null;
  jobHealth?: {
    runningJobs: number;
    staleRunningJobs: number;
    queueDepth?: number;
    leasedPartitions?: number;
    retryableFailedPartitions?: number;
    deadLetterPartitions?: number;
    oldestQueuedPartition?: string | null;
    latestCoreActivityAt?: string | null;
    latestExtendedActivityAt?: string | null;
    latestMaintenanceActivityAt?: string | null;
    historicalCoreQueueDepth?: number;
    historicalCoreLeasedPartitions?: number;
    extendedRecentQueueDepth?: number;
    extendedRecentLeasedPartitions?: number;
    extendedHistoricalQueueDepth?: number;
    extendedHistoricalLeasedPartitions?: number;
  } | null;
  extendedRecoveryState?: "core_only" | "extended_recovery" | "extended_normal" | null;
  recentExtendedReady?: boolean;
  historicalExtendedReady?: boolean;
  recentExtendedUsable?: boolean;
  rangeCompletionBySurface?: Record<
    "account_daily" | "adset_daily" | "creative_daily" | "ad_daily",
    {
      recentCompletedDays: number;
      recentTotalDays: number;
      historicalCompletedDays: number;
      historicalTotalDays: number;
      readyThroughDate: string | null;
    }
  >;
  priorityWindow?: {
    startDate: string;
    endDate: string;
    completedDays: number;
    totalDays: number;
    isActive: boolean;
  } | null;
  latestSync?: MetaSyncDetails | null;
}
