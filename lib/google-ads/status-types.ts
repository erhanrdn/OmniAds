import type {
  ProviderCheckpointHealth,
  ProviderDomainReadiness,
  ProviderReadinessLevel,
  ProviderSurfaceSummary,
} from "@/lib/provider-readiness";

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
    extendedRecoveryBlockReason?: string | null;
    googleWorkerHealthy?: boolean;
    googleHeartbeatAgeMs?: number | null;
    googleRunnerLeaseActive?: boolean;
    staleRunPressure?: number;
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
    workerBuildId?: string | null;
    workerStartedAt?: string | null;
    lastWorkerHeartbeatAt?: string | null;
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
  extendedRecoveryState?: "core_only" | "extended_recovery" | "extended_normal" | null;
  recentExtendedReady?: boolean;
  historicalExtendedReady?: boolean;
  extendedRecentReadyThroughDate?: string | null;
  rangeCompletionBySurface?: Record<
    string,
    {
      recent: GoogleAdsExtendedRangeCompletion;
      historical: GoogleAdsExtendedRangeCompletion;
    }
  > | null;
  latestSync?: GoogleAdsSyncDetails | null;
}
