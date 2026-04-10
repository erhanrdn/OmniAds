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

export interface GoogleAdsSyncDetails {
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

export type GoogleAdsPanelRecoveryMode =
  | "safe_mode"
  | "canary_reopen"
  | "general_reopen";

export type GoogleAdsPanelSurfaceStateKind =
  | "core_live"
  | "extended_backfilling"
  | "extended_limited"
  | "ready";

export interface GoogleAdsPanelSurfaceState {
  scope: string;
  label: string;
  state: GoogleAdsPanelSurfaceStateKind;
  completedDays: number;
  totalDays: number;
  readyThroughDate: string | null;
  latestBackgroundActivityAt: string | null;
  message: string;
}

export interface GoogleAdsExtendedRangeCompletion {
  completedDays: number;
  totalDays: number;
  readyThroughDate: string | null;
  ready: boolean;
}

export interface GoogleAdsProgressState {
  percent: number;
  visible: boolean;
  summary: string;
}

export interface GoogleAdsGlobalSyncProgressState {
  kind: "advisor" | "historical";
  percent: number;
  visible: boolean;
  label: string;
  summary: string;
}

export interface GoogleAdsCurrentDayLiveStatus {
  active: boolean;
  usingLiveOverlay: boolean;
  coreUsable: boolean;
  currentDate: string | null;
  warehouseSegmentEndDate: string | null;
  liveSegmentStartDate: string | null;
}

export interface GoogleAdsStatusDomainSummary {
  state: "syncing" | "partial" | "ready" | "advisor_not_ready";
  label: string;
  detail: string;
}

export interface GoogleAdsStatusResponse {
  state:
    | "not_connected"
    | "connected_no_assignment"
    | "syncing"
    | "paused"
    | "partial"
    | "advisor_not_ready"
    | "stale"
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
    historicalMode: "warehouse_only";
  };
  platformDateBoundary?: {
    primaryAccountId: string | null;
    primaryAccountTimezone: string | null;
    currentDateInTimezone: string | null;
    previousDateInTimezone: string | null;
    selectedRangeMode: "current_day_live" | "historical_warehouse";
    mixedCurrentDates: boolean;
    accounts: Array<{
      provider: "google";
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
  globalSyncProgress?: GoogleAdsGlobalSyncProgressState | null;
  currentDayLiveStatus?: GoogleAdsCurrentDayLiveStatus | null;
  selectedRangeReadinessBasis?: {
    mode: "current_day_live" | "historical_warehouse";
    warehouseCoverageIgnored: boolean;
    liveOverlayEligible: boolean;
  } | null;
  requiredScopeCompletion?: ProviderRequiredCoverage | null;
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
      scopes?: Array<{
        scope: string;
        completedDays: number;
        totalDays: number;
        readyThroughDate: string | null;
        latestBackgroundActivityAt: string | null;
        deadLetterCount: number;
      }> | null;
      pendingSurfaces?: string[];
    } | null;
  } | null;
  advisor?: {
    ready: boolean;
    readinessModel?: string;
    readinessWindowDays?: number;
    snapshotReady?: boolean;
    snapshotAsOfDate?: string | null;
    snapshotFresh?: boolean;
    snapshotBlockedReason?: string | null;
    requiredSurfaces: string[];
    availableSurfaces: string[];
    missingSurfaces: string[];
    readyRangeStart: string | null;
    readyRangeEnd: string | null;
    blockingMessage?: string | null;
    selectedWindow?: {
      label: string;
      ready: boolean;
      startDate: string | null;
      endDate: string | null;
      totalDays: number | null;
      missingSurfaces: string[];
    } | null;
    supportWindows?: Array<{
      key: string;
      label: string;
      ready: boolean;
      startDate: string;
      endDate: string;
      totalDays: number;
      missingSurfaces: string[];
    }> | null;
    decisionEngineV2Enabled?: boolean;
    writebackEnabled?: boolean;
    actionContract?: {
      version: string | null;
      source: "native" | "compatibility_derived" | null;
    } | null;
    aggregateIntelligence?: {
      topQueryWeeklyAvailable: boolean;
      clusterDailyAvailable: boolean;
      queryWeeklyRows: number;
      clusterDailyRows: number;
      supportWindowStart: string | null;
      supportWindowEnd: string | null;
      note: string | null;
    } | null;
  } | null;
  jobHealth?: {
    runningJobs: number;
    staleRunningJobs: number;
    backgroundRunningJobs?: number;
    priorityRunningJobs?: number;
    legacyRuntimeJobs?: number;
    queueDepth?: number;
    leasedPartitions?: number;
    coreQueueDepth?: number;
    coreLeasedPartitions?: number;
    extendedQueueDepth?: number;
    extendedLeasedPartitions?: number;
    extendedRecentQueueDepth?: number;
    extendedRecentLeasedPartitions?: number;
    extendedHistoricalQueueDepth?: number;
    extendedHistoricalLeasedPartitions?: number;
    maintenanceQueueDepth?: number;
    maintenanceLeasedPartitions?: number;
    deadLetterPartitions?: number;
    advisorRelevantDeadLetterPartitions?: number;
    historicalDeadLetterPartitions?: number;
    advisorRelevantFailedPartitions?: number;
    advisorRelevantLeasedPartitions?: number;
    oldestQueuedPartition?: string | null;
  } | null;
  priorityWindow?: {
    startDate: string;
    endDate: string;
    completedDays: number;
    totalDays: number;
    isActive: boolean;
  } | null;
  operations?: {
    currentMode: GoogleAdsPanelRecoveryMode;
    canaryEligible: boolean;
    quotaPressure: number;
    breakerState: "open" | "half_open" | "closed";
    decisionEngineV2Enabled?: boolean;
    writebackEnabled?: boolean;
    statusDegraded?: boolean;
    statusDegradedReason?: string | null;
    extendedRecoveryBlockReason?: string | null;
    googleWorkerHealthy?: boolean;
    googleHeartbeatAgeMs?: number | null;
    googleRunnerLeaseActive?: boolean;
    fullSyncPriorityRequired?: boolean;
    fullSyncPriorityReason?: string | null;
    advisorReadinessModel?: string;
    advisorReadinessWindowDays?: number;
    advisorSnapshotReady?: boolean;
    advisorSnapshotAsOfDate?: string | null;
    advisorSnapshotFresh?: boolean;
    advisorSnapshotBlockedReason?: string | null;
    advisorActionContractVersion?: string | null;
    advisorActionContractSource?: "native" | "compatibility_derived" | null;
    advisorAggregateTopQueryWeeklyAvailable?: boolean;
    advisorAggregateClusterDailyAvailable?: boolean;
    advisorAggregateQueryWeeklyRows?: number | null;
    advisorAggregateClusterDailyRows?: number | null;
    retentionRuntimeAvailable?: boolean;
    retentionExecutionEnabled?: boolean;
    retentionMode?: "dry_run" | "execute";
    retentionGateReason?: string | null;
    lastRetentionRunAt?: string | null;
    lastRetentionRunMode?: "dry_run" | "execute" | null;
    lastRetentionRunDeletedRows?: number | null;
    writebackPilotEnabled?: boolean;
    semiAutonomousBundlesEnabled?: boolean;
    controlledAutonomyEnabled?: boolean;
    autonomyKillSwitchActive?: boolean;
    manualApprovalRequired?: boolean;
    operatorOverrideEnabled?: boolean;
    autonomyAllowlist?: string[];
    autonomyBusinessAllowlist?: string[];
    autonomyAccountAllowlist?: string[];
    autonomyBusinessAllowed?: boolean;
    autonomyAccountAllowed?: boolean;
    semiAutonomousEligible?: boolean;
    controlledAutonomyEligible?: boolean;
    autonomyBlockedReasons?: string[];
    bundleCooldownHours?: number | null;
    staleRunPressure?: number;
    progressState?: "ready" | "syncing" | "partial_progressing" | "partial_stuck" | "blocked";
    extendedSuppressionDecisionTrace?: Record<string, unknown> | null;
    lastTargetedRepair?: {
      scope: string | null;
      triggerSource: string | null;
      finishedAt: string | null;
      status: string | null;
      lastError: string | null;
    } | null;
    lastAutoRepair?: {
      scope: string | null;
      triggerSource: string | null;
      finishedAt: string | null;
      status: string | null;
      lastError: string | null;
    } | null;
    lastAutoRepairOutcome?: "completed" | "failed" | "running" | "queued" | "unknown" | null;
    lastAutoRepairTriggerSource?: string | null;
    recentGapCountByScope?: Record<string, number>;
    recentGapRepairingByScope?: Record<string, boolean>;
    recentGapLastAttemptAtByScope?: Record<string, string | null>;
    recentGapQueuedByScope?: Record<string, number>;
    recentGapLeasedByScope?: Record<string, number>;
    recentGapSucceededByScope?: Record<string, number>;
    recentGapFailedByScope?: Record<string, number>;
    lastAutoRepairAttemptByScope?: Record<string, string | null>;
    autoRepairExecutionStage?: "not_planned" | "planned_not_leased" | "leased_not_completed" | "completed_state_stale" | "completed" | "runtime_waiting" | "failed" | null;
    blockingReasons?: ProviderBlockingReason[];
    repairableActions?: ProviderRepairableAction[];
    requiredCoverage?: ProviderRequiredCoverage | null;
    secondaryReadiness?: ProviderSecondaryReadiness[];
    stallFingerprints?: ProviderStallFingerprint[];
    workerBuildId?: string | null;
    workerStartedAt?: string | null;
    lastWorkerHeartbeatAt?: string | null;
    workerFreshnessState?: "online" | "stale" | "stopped" | null;
    currentWorkerBusinessId?: string | null;
    workerBatchBusinessIds?: string[];
    currentConsumeStage?: string | null;
    lastConsumedBusinessId?: string | null;
    lastConsumeFinishedAt?: string | null;
    runtimeMismatchDetected?: boolean;
    lastConsumeAttemptAt?: string | null;
    lastConsumeOutcome?: string | null;
    lastLeaseAcquiredAt?: string | null;
    lastProgressAt?: string | null;
    lastFailureReason?: string | null;
  } | null;
  panel?: {
    coreUsable: boolean;
    extendedLimited: boolean;
    recentExtendedUsable?: boolean;
    headline: string;
    detail: string;
    surfaceStates: GoogleAdsPanelSurfaceState[];
  } | null;
  domains?: {
    core: GoogleAdsStatusDomainSummary;
    selectedRange: GoogleAdsStatusDomainSummary;
    advisor: GoogleAdsStatusDomainSummary;
  } | null;
  extendedRecoveryState?: "core_only" | "extended_recovery" | "extended_normal" | null;
  recentExtendedReady?: boolean;
  historicalExtendedReady?: boolean;
  extendedRecentReadyThroughDate?: string | null;
  rangeCompletionBySurface?: Record<
    string,
    {
      selectedRange: GoogleAdsExtendedRangeCompletion;
      historical: GoogleAdsExtendedRangeCompletion;
    }
  > | null;
  advisorProgress?: GoogleAdsProgressState | null;
  historicalProgress?: GoogleAdsProgressState | null;
  latestSync?: GoogleAdsSyncDetails | null;
}
