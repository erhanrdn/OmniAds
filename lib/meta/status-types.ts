import type {
  ProviderCheckpointHealth,
  ProviderDomainReadiness,
  ProviderReadinessLevel,
  ProviderSurfaceSummary,
} from "@/lib/provider-readiness";
import type {
  MetaDirtyRecentReason,
  MetaSelectedRangeTruthReadiness,
} from "@/lib/meta/warehouse-types";
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
  | "historical_warehouse"
  | "historical_live_fallback";

export type MetaPageSurfaceTruthClass =
  | "historical_warehouse"
  | "historical_live_fallback"
  | "current_day_live"
  | "conditional_drilldown"
  | "deterministic_decision_engine";

export type MetaPageSurfaceKey =
  | "summary"
  | "campaigns"
  | "breakdowns.age"
  | "breakdowns.location"
  | "breakdowns.placement"
  | "adsets"
  | "recommendations"
  | "operating_mode"
  | "decision_os";

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
  optionalSurfaces: Record<
    "adsets" | "recommendations" | "operating_mode" | "decision_os",
    MetaSurfaceReadiness
  >;
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
  d1TargetDate?: string | null;
  d1FinalizeState?: "ready" | "processing" | "blocked" | null;
  d1BlockedReason?: string | null;
  dataContract?: {
    todayMode: "live_overlay";
    historicalMode: "warehouse_only" | "warehouse_plus_live_fallback";
  };
  platformDateBoundary?: {
    primaryAccountId: string | null;
    primaryAccountTimezone: string | null;
    currentDateInTimezone: string | null;
    previousDateInTimezone: string | null;
    selectedRangeMode:
      | "current_day_live"
      | "historical_warehouse"
      | "historical_live_fallback";
    mixedCurrentDates: boolean;
    accounts: Array<{
      provider: "meta";
      businessId: string;
      providerAccountId: string | null;
      timeZone: string;
      currentDate: string;
      previousDate: string;
      isPrimary: boolean;
    }>;
  };
  completionBasis?: {
    requiredScopes: string[];
    excludedScopes: string[];
    percent: number;
    complete: boolean;
  };
  completionBlockers?: string[];
  requiredScopeCompletion?: ProviderRequiredCoverage | null;
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
    retentionRuntimeAvailable?: boolean;
    retentionExecutionEnabled?: boolean;
    retentionMode?: "dry_run" | "execute";
    retentionGateReason?: string | null;
    retentionDefaultExecutionDisabled?: boolean;
    latestRetentionRunAt?: string | null;
    latestRetentionRunMode?: "dry_run" | "execute" | null;
    retentionLatestRunObserved?: boolean;
  } | null;
  retention?: {
    runtimeAvailable: boolean;
    executionEnabled: boolean;
    defaultExecutionDisabled: boolean;
    mode: "dry_run" | "execute";
    gateReason: string;
    policy: {
      coreDailyAuthoritativeDays: number;
      breakdownDailyAuthoritativeDays: number;
      currentDay: "live_only";
      historicalInsideHorizon: "published_verified_truth_only";
      historicalOutsideCoreHorizon: "live_fallback_unchanged";
      breakdownOutsideHorizon: "unsupported_degraded";
    };
    latestRun: {
      id: string;
      finishedAt: string | null;
      executionMode: "dry_run" | "execute";
      skippedDueToActiveLease: boolean;
      totalDeletedRows: number;
      errorMessage: string | null;
    } | null;
    summary: {
      observedTables: number;
      tablesWithDeletableRows: number;
      tablesWithProtectedRows: number;
      deletableRows: number;
      retainedRows: number;
      protectedRows: number;
    } | null;
    tables: Array<{
      tier: "core_authoritative" | "breakdown_authoritative";
      label: string;
      tableName: string;
      summaryKey: string;
      retentionDays: number;
      cutoffDate: string;
      surfaceFilter: Array<
        "account_daily" | "campaign_daily" | "adset_daily" | "ad_daily" | "breakdown_daily"
      > | null;
      observed: boolean;
      deletableRows: number | null;
      deletableDistinctDays: number | null;
      oldestDeletableValue: string | null;
      newestDeletableValue: string | null;
      retainedRows: number | null;
      latestRetainedValue: string | null;
      protectedRows: number | null;
      protectedDistinctDays: number | null;
      latestProtectedValue: string | null;
      deletedRows: number;
    }>;
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
  selectedRangeTruth?: MetaSelectedRangeTruthReadiness & {
    blockingReasons: MetaDirtyRecentReason[];
  } | null;
  latestSync?: MetaSyncDetails | null;
  currentDayLive?: {
    summaryAvailable: boolean;
    campaignsAvailable: boolean;
  } | null;
  pageReadiness?: MetaPageReadiness | null;
}
