import type {
  ProviderCheckpointHealth,
  ProviderDomainReadiness,
  ProviderReadinessLevel,
  ProviderSurfaceSummary,
} from "@/lib/provider-readiness";
import type {
  ProviderBlockingReason,
  ProviderRepairableAction,
  ProviderRequiredCoverage,
  ProviderSecondaryReadiness,
  ProviderStallFingerprint,
} from "@/lib/sync/provider-status-truth";

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

export type MetaPageReadinessState =
  | "ready"
  | "partial"
  | "syncing"
  | "blocked"
  | "not_connected";

export type MetaPageSelectedRangeMode =
  | "current_day_live"
  | "historical_warehouse";

export type MetaPageSurfaceTruthClass =
  | "historical_warehouse"
  | "current_day_live"
  | "conditional_drilldown"
  | "ai_exception";

export type MetaPageSurfaceKey =
  | "summary"
  | "campaigns"
  | "breakdowns.age"
  | "breakdowns.location"
  | "breakdowns.placement"
  | "adsets"
  | "recommendations";

export interface MetaSurfaceReadiness {
  state: MetaPageReadinessState;
  blocking: boolean;
  countsForPageCompleteness: boolean;
  truthClass: MetaPageSurfaceTruthClass;
  reason: string | null;
}

export interface MetaPageReadiness {
  state: MetaPageReadinessState;
  usable: boolean;
  complete: boolean;
  selectedRangeMode: MetaPageSelectedRangeMode;
  reason: string | null;
  missingRequiredSurfaces: MetaPageSurfaceKey[];
  requiredSurfaces: Record<
    "summary" | "campaigns" | "breakdowns.age" | "breakdowns.location" | "breakdowns.placement",
    MetaSurfaceReadiness
  >;
  optionalSurfaces: Record<"adsets" | "recommendations", MetaSurfaceReadiness>;
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
  currentCoreProgressPercent?: number;
  historicalArchiveProgressPercent?: number;
  currentCoreUsable?: boolean;
  historicalArchiveComplete?: boolean;
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
      breakdownsBySurface?: {
        age: {
          completedDays: number;
          totalDays: number;
          readyThroughDate: string | null;
          isComplete: boolean;
          supportStartDate?: string | null;
          isBlocked?: boolean;
        };
        location: {
          completedDays: number;
          totalDays: number;
          readyThroughDate: string | null;
          isComplete: boolean;
          supportStartDate?: string | null;
          isBlocked?: boolean;
        };
        placement: {
          completedDays: number;
          totalDays: number;
          readyThroughDate: string | null;
          isComplete: boolean;
          supportStartDate?: string | null;
          isBlocked?: boolean;
        };
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
  operations?: {
    workerHealthy?: boolean;
    heartbeatAgeMs?: number | null;
    runnerLeaseActive?: boolean;
    ownerWorkerId?: string | null;
    consumeStage?: string | null;
    staleRunPressure?: number;
    blockReason?: string | null;
    progressState?: "ready" | "syncing" | "partial_progressing" | "partial_stuck" | "blocked";
    blockingReasons?: ProviderBlockingReason[];
    repairableActions?: ProviderRepairableAction[];
    requiredCoverage?: ProviderRequiredCoverage | null;
    secondaryReadiness?: ProviderSecondaryReadiness[];
    stallFingerprints?: ProviderStallFingerprint[];
    queueSummary?: {
      historicalCoreQueued: number;
      maintenanceQueued: number;
      extendedRecentQueued: number;
      extendedHistoricalQueued: number;
    } | null;
  } | null;
  extendedRecoveryState?: "core_only" | "extended_recovery" | "extended_normal" | null;
  recentExtendedReady?: boolean;
  historicalExtendedReady?: boolean;
  recentExtendedUsable?: boolean;
  rangeCompletionBySurface?: Record<
    "account_daily" | "campaign_daily" | "adset_daily" | "creative_daily" | "ad_daily",
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
  currentDayLive?: {
    summaryAvailable: boolean;
    campaignsAvailable: boolean;
  } | null;
  pageReadiness?: MetaPageReadiness | null;
}
