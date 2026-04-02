import {
  getGoogleAdsAdsReport,
  getGoogleAdsAssetGroupsReport,
  getGoogleAdsAssetsReport,
  getGoogleAdsAudiencesReport,
  getGoogleAdsCampaignsReport,
  getGoogleAdsDevicesReport,
  getGoogleAdsGeoReport,
  getGoogleAdsKeywordsReport,
  getGoogleAdsProductsReport,
  getGoogleAdsSearchIntelligenceReport,
} from "@/lib/google-ads/reporting";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";
import { getAssignedGoogleAccounts } from "@/lib/google-ads-gaql";
import {
  clearProviderGlobalCircuitBreaker,
  clearProviderGlobalCircuitBreakerRecoveryState,
  enterProviderGlobalCircuitBreakerRecoveryState,
  getProviderCircuitBreakerRecoveryState,
  getProviderGlobalCircuitBreaker,
  getProviderQuotaBudgetState,
  openProviderGlobalCircuitBreaker,
  ProviderRequestCooldownError,
} from "@/lib/provider-request-governance";
import {
  getProviderWorkerHealthState,
  recordSyncReclaimEvents,
} from "@/lib/sync/worker-health";
import type { RunnerLeaseGuard } from "@/lib/sync/worker-runtime";
import type { ProviderReplayReasonCode } from "@/lib/sync/provider-orchestration";
import {
  buildProviderProgressEvidence,
  getActivePartitionBlockingStatuses,
  hasRecentProviderAdvancement,
  type ProviderProgressEvidence,
  type ProviderProgressEvidenceStateRow,
} from "@/lib/sync/provider-status-truth";
import {
  buildGoogleAdsRawSnapshotHash,
  compactGoogleAdsExtendedBacklog,
  cleanupGoogleAdsObsoleteSyncJobs,
  cleanupGoogleAdsPartitionOrchestration,
  cancelGoogleAdsPartitionsBySource,
  completeGoogleAdsPartition,
  createGoogleAdsSyncJob,
  createGoogleAdsSyncRun,
  expireStaleGoogleAdsSyncJobs,
  getGoogleAdsCoveredDates,
  getGoogleAdsDailyCoverage,
  getGoogleAdsPartitionHealth,
  getGoogleAdsPartitionDates,
  getGoogleAdsQueueHealth,
  getGoogleAdsSyncState,
  getGoogleAdsSyncCheckpoint,
  leaseGoogleAdsSyncPartitions,
  listGoogleAdsRawSnapshotsForPartition,
  persistGoogleAdsRawSnapshot,
  queueGoogleAdsSyncPartition,
  heartbeatGoogleAdsPartitionLease,
  upsertGoogleAdsSyncState,
  upsertGoogleAdsSyncCheckpoint,
  updateGoogleAdsSyncRun,
  updateGoogleAdsSyncJob,
  upsertGoogleAdsDailyRows,
  markGoogleAdsPartitionRunning,
} from "@/lib/google-ads/warehouse";
import {
  GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS,
  addDaysToIsoDate,
  dayCountInclusive,
  enumerateDays,
  getHistoricalWindowStart,
} from "@/lib/google-ads/history";
import type {
  GoogleAdsSyncCheckpointRecord,
  GoogleAdsSyncLane,
  GoogleAdsSyncType,
  GoogleAdsWarehouseDailyRow,
  GoogleAdsWarehouseScope,
} from "@/lib/google-ads/warehouse-types";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";

type GenericRow = Record<string, unknown>;

const runtimeSyncStore = globalThis as typeof globalThis & {
  __googleAdsBackgroundSyncKeys?: Set<string>;
  __googleAdsBackgroundWorkerTimers?: Map<string, ReturnType<typeof setTimeout>>;
};

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getBackgroundSyncKeys() {
  if (!runtimeSyncStore.__googleAdsBackgroundSyncKeys) {
    runtimeSyncStore.__googleAdsBackgroundSyncKeys = new Set<string>();
  }
  return runtimeSyncStore.__googleAdsBackgroundSyncKeys;
}

function getBackgroundWorkerTimers() {
  if (!runtimeSyncStore.__googleAdsBackgroundWorkerTimers) {
    runtimeSyncStore.__googleAdsBackgroundWorkerTimers = new Map();
  }
  return runtimeSyncStore.__googleAdsBackgroundWorkerTimers;
}

const GOOGLE_ADS_BOOTSTRAP_BATCH_DAYS = 4;
const GOOGLE_ADS_RECENT_MAINTENANCE_DAYS = 7;
const GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS = envNumber("GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS", 5_000);
const GOOGLE_ADS_CORE_WORKER_LIMIT = envNumber("GOOGLE_ADS_CORE_WORKER_LIMIT", 4);
const GOOGLE_ADS_MAINTENANCE_WORKER_LIMIT = envNumber("GOOGLE_ADS_MAINTENANCE_WORKER_LIMIT", 2);
const GOOGLE_ADS_EXTENDED_WORKER_LIMIT = envNumber("GOOGLE_ADS_EXTENDED_WORKER_LIMIT", 4);
const GOOGLE_ADS_EXTENDED_BURST_WORKER_LIMIT = envNumber(
  "GOOGLE_ADS_EXTENDED_BURST_WORKER_LIMIT",
  3
);
const GOOGLE_ADS_EXTENDED_FULL_SYNC_PRIORITY_LIMIT = envNumber(
  "GOOGLE_ADS_EXTENDED_FULL_SYNC_PRIORITY_LIMIT",
  2
);
const GOOGLE_ADS_EXTENDED_CORE_BACKLOG_THRESHOLD = envNumber(
  "GOOGLE_ADS_EXTENDED_CORE_BACKLOG_THRESHOLD",
  2
);

export function getGoogleAdsGapPlannerBlockingStatuses() {
  return getActivePartitionBlockingStatuses();
}
const GOOGLE_ADS_PARTITION_LEASE_MINUTES = envNumber("GOOGLE_ADS_PARTITION_LEASE_MINUTES", 5);
const GOOGLE_ADS_TRANSIENT_RETRY_BASE_MINUTES = envNumber(
  "GOOGLE_ADS_TRANSIENT_RETRY_BASE_MINUTES",
  2
);
const GOOGLE_ADS_QUOTA_RETRY_BASE_MINUTES = envNumber(
  "GOOGLE_ADS_QUOTA_RETRY_BASE_MINUTES",
  8
);
const GOOGLE_ADS_PARTITION_MAX_ATTEMPTS = 6;
const GOOGLE_ADS_CHECKPOINT_CHUNK_SIZE = envNumber("GOOGLE_ADS_CHECKPOINT_CHUNK_SIZE", 250);
const GOOGLE_ADS_CIRCUIT_BREAKER_BASE_MINUTES = envNumber(
  "GOOGLE_ADS_CIRCUIT_BREAKER_BASE_MINUTES",
  15
);
const GOOGLE_ADS_CIRCUIT_BREAKER_REPEAT_MINUTES = envNumber(
  "GOOGLE_ADS_CIRCUIT_BREAKER_REPEAT_MINUTES",
  30
);
const GOOGLE_ADS_WORKER_STALE_THRESHOLD_MS = envNumber(
  "GOOGLE_ADS_WORKER_STALE_THRESHOLD_MS",
  5 * 60_000
);
const GOOGLE_ADS_RUN_PROGRESS_GRACE_MINUTES = envNumber(
  "GOOGLE_ADS_RUN_PROGRESS_GRACE_MINUTES",
  3
);
const GOOGLE_ADS_STALE_RUN_CORE_MINUTES = envNumber("GOOGLE_ADS_STALE_RUN_CORE_MINUTES", 12);
const GOOGLE_ADS_STALE_RUN_MAINTENANCE_MINUTES = envNumber(
  "GOOGLE_ADS_STALE_RUN_MAINTENANCE_MINUTES",
  15
);
const GOOGLE_ADS_STALE_RUN_EXTENDED_MINUTES = envNumber(
  "GOOGLE_ADS_STALE_RUN_EXTENDED_MINUTES",
  25
);
const GOOGLE_ADS_EXTENDED_BACKLOG_HARD_LIMIT = envNumber(
  "GOOGLE_ADS_EXTENDED_BACKLOG_HARD_LIMIT",
  1000
);
const GOOGLE_ADS_MAINTENANCE_BACKLOG_HARD_LIMIT = envNumber(
  "GOOGLE_ADS_MAINTENANCE_BACKLOG_HARD_LIMIT",
  250
);
const GOOGLE_ADS_EXTENDED_CANARY_BURST_WORKER_LIMIT = envNumber(
  "GOOGLE_ADS_EXTENDED_CANARY_BURST_WORKER_LIMIT",
  1
);
const GOOGLE_ADS_RECENT_REPAIR_WORKER_LIMIT = envNumber(
  "GOOGLE_ADS_RECENT_REPAIR_WORKER_LIMIT",
  1
);
const GOOGLE_ADS_RECENT_EXTENDED_RECOVERY_DAYS = envNumber(
  "GOOGLE_ADS_RECENT_EXTENDED_RECOVERY_DAYS",
  14
);
const GOOGLE_ADS_EXTENDED_RECENT_BATCH_DAYS = envNumber(
  "GOOGLE_ADS_EXTENDED_RECENT_BATCH_DAYS",
  4
);
const GOOGLE_ADS_EXTENDED_HISTORICAL_BATCH_DAYS = envNumber(
  "GOOGLE_ADS_EXTENDED_HISTORICAL_BATCH_DAYS",
  2
);
const GOOGLE_ADS_EXTENDED_HISTORICAL_PRESSURE_LIMIT = Number(
  process.env.GOOGLE_ADS_EXTENDED_HISTORICAL_PRESSURE_LIMIT ?? "0.7"
);
const GOOGLE_ADS_EXTENDED_REOPEN_GENERAL_ENABLED =
  process.env.GOOGLE_ADS_EXTENDED_GENERAL_REOPEN?.trim().toLowerCase() === "1" ||
  process.env.GOOGLE_ADS_EXTENDED_GENERAL_REOPEN?.trim().toLowerCase() === "true";
const GOOGLE_ADS_IN_PROCESS_RUNTIME_ENABLED =
  process.env.GOOGLE_ADS_ENABLE_IN_PROCESS_RUNTIME?.trim().toLowerCase() === "1" ||
  process.env.GOOGLE_ADS_ENABLE_IN_PROCESS_RUNTIME?.trim().toLowerCase() === "true";
const GOOGLE_ADS_PROGRESS_EVIDENCE_WINDOW_MINUTES = envNumber(
  "GOOGLE_ADS_PROGRESS_EVIDENCE_WINDOW_MINUTES",
  20
);

type GoogleAdsQueueHealth = Awaited<ReturnType<typeof getGoogleAdsQueueHealth>>;
type GoogleAdsLaneEvidence = Record<
  "core" | "extended_recent" | "extended_historical" | "maintenance",
  ProviderProgressEvidence
>;
type GoogleAdsStatesByScope = Partial<
  Record<GoogleAdsWarehouseScope, ProviderProgressEvidenceStateRow[]>
>;

export interface GoogleAdsPrimaryLeasePlan {
  historicalFairnessLimit: number;
  recentRepairLimit: number;
  fullSyncPriorityLimit: number;
}

export interface GoogleAdsMaintenanceLeasePlan {
  maintenanceLimit: number;
}

export interface GoogleAdsFallbackExtendedLeasePlan {
  sourceFilter: "recent_only" | "historical_only" | "all";
  limit: number;
  scopeFilter?: GoogleAdsWarehouseScope[];
  startDate: string | null;
  endDate: string | null;
}

function parseEnvList(name: string) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function upsertGoogleAdsCheckpointOrThrow(input: GoogleAdsSyncCheckpointRecord) {
  const checkpointId = await upsertGoogleAdsSyncCheckpoint(input);
  if (input.leaseOwner && !checkpointId) {
    throw new Error("lease_conflict:checkpoint_write_rejected");
  }
  return checkpointId;
}

const GOOGLE_ADS_EXTENDED_CANARY_BUSINESS_IDS = new Set(
  parseEnvList("GOOGLE_ADS_EXTENDED_CANARY_BUSINESS_IDS")
);

function canUseInProcessBackgroundScheduling() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.SYNC_WORKER_MODE === "1" &&
    GOOGLE_ADS_IN_PROCESS_RUNTIME_ENABLED
  );
}

export function isGoogleAdsIncidentSafeModeEnabled() {
  const raw = process.env.GOOGLE_ADS_INCIDENT_SAFE_MODE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isGoogleAdsExtendedCanaryBusiness(businessId: string) {
  return GOOGLE_ADS_EXTENDED_CANARY_BUSINESS_IDS.has(businessId);
}

const GOOGLE_ADS_EXTENDED_SCOPES: GoogleAdsWarehouseScope[] = [
  "search_term_daily",
  "product_daily",
  "asset_group_daily",
  "asset_daily",
  "geo_daily",
  "device_daily",
  "audience_daily",
  "ad_group_daily",
  "ad_daily",
  "keyword_daily",
];

const GOOGLE_ADS_RECENT_SELF_HEAL_SCOPES: GoogleAdsWarehouseScope[] = [
  "search_term_daily",
  "product_daily",
  "asset_daily",
];

const GOOGLE_ADS_ADVISOR_PRIMARY_PRIORITY_SCOPES: GoogleAdsWarehouseScope[] = [
  "search_term_daily",
  "product_daily",
];

const GOOGLE_ADS_ADVISOR_SUPPORTIVE_PRIORITY_SCOPES: GoogleAdsWarehouseScope[] = [
  "asset_daily",
];

const GOOGLE_ADS_STATE_SCOPES: GoogleAdsWarehouseScope[] = [
  "account_daily",
  "campaign_daily",
  "search_term_daily",
  "product_daily",
  "asset_group_daily",
  "asset_daily",
  "geo_daily",
  "device_daily",
  "audience_daily",
];

const GOOGLE_ADS_RECENT_90_FRONTIER_SCOPES: GoogleAdsWarehouseScope[] = [
  "account_daily",
  "campaign_daily",
  ...GOOGLE_ADS_EXTENDED_SCOPES,
];

function buildGoogleAdsSyntheticEvidenceState(activityAt: string | null | undefined) {
  if (!activityAt) return [];
  return [
    {
      latestBackgroundActivityAt: activityAt,
      updatedAt: activityAt,
    } satisfies ProviderProgressEvidenceStateRow,
  ];
}

export function buildGoogleAdsLaneProgressEvidence(input: {
  statesByScope?: GoogleAdsStatesByScope;
  queueHealth?: GoogleAdsQueueHealth | null;
}) : GoogleAdsLaneEvidence {
  const statesByScope = input.statesByScope ?? {};
  const queueHealth = input.queueHealth ?? null;
  const coreStates = [
    ...(statesByScope.account_daily ?? []),
    ...(statesByScope.campaign_daily ?? []),
    ...buildGoogleAdsSyntheticEvidenceState(queueHealth?.latestCoreActivityAt ?? null),
  ];
  const extendedStates = [
    ...GOOGLE_ADS_EXTENDED_SCOPES.flatMap((scope) => statesByScope[scope] ?? []),
    ...buildGoogleAdsSyntheticEvidenceState(queueHealth?.latestExtendedActivityAt ?? null),
  ];
  const maintenanceStates = buildGoogleAdsSyntheticEvidenceState(
    queueHealth?.latestMaintenanceActivityAt ?? null
  );

  return {
    core: buildProviderProgressEvidence({
      states: coreStates,
      aggregation: "bottleneck",
      recentActivityWindowMinutes: GOOGLE_ADS_PROGRESS_EVIDENCE_WINDOW_MINUTES,
    }),
    extended_recent: buildProviderProgressEvidence({
      states: extendedStates,
      aggregation: "latest",
      recentActivityWindowMinutes: GOOGLE_ADS_PROGRESS_EVIDENCE_WINDOW_MINUTES,
    }),
    extended_historical: buildProviderProgressEvidence({
      states: extendedStates,
      aggregation: "bottleneck",
      recentActivityWindowMinutes: GOOGLE_ADS_PROGRESS_EVIDENCE_WINDOW_MINUTES,
    }),
    maintenance: buildProviderProgressEvidence({
      states: maintenanceStates,
      aggregation: "latest",
      recentActivityWindowMinutes: GOOGLE_ADS_PROGRESS_EVIDENCE_WINDOW_MINUTES,
    }),
  };
}

export function buildGoogleAdsLaneAdmissionPolicy(input: {
  safeModeEnabled: boolean;
  workerHealthy: boolean;
  workerCapacityAvailable?: boolean;
  breakerOpen: boolean;
  queueDepth: number;
  extendedQueueDepth: number;
  maintenanceQueueDepth?: number;
  quotaPressure?: number;
  maintenanceBudgetAllowed?: boolean;
  extendedBudgetAllowed?: boolean;
  extendedCanaryEligible?: boolean;
  recoveryMode?: "open" | "half_open" | "closed";
}) {
  const workerCapacityAvailable = input.workerCapacityAvailable ?? input.workerHealthy;
  const quotaPressure = input.quotaPressure ?? 0;
  const maintenanceBudgetAllowed = input.maintenanceBudgetAllowed ?? true;
  const extendedBudgetAllowed = input.extendedBudgetAllowed ?? true;
  const extendedCanaryEligible =
    input.extendedCanaryEligible ?? GOOGLE_ADS_EXTENDED_REOPEN_GENERAL_ENABLED;
  const suspendExtendedRecent =
    input.safeModeEnabled ||
    !input.workerHealthy ||
    !workerCapacityAvailable ||
    input.breakerOpen ||
    !extendedBudgetAllowed ||
    !extendedCanaryEligible ||
    input.extendedQueueDepth >= GOOGLE_ADS_EXTENDED_BACKLOG_HARD_LIMIT ||
    input.queueDepth >= GOOGLE_ADS_EXTENDED_BACKLOG_HARD_LIMIT * 2;
  const suspendExtendedHistorical =
    suspendExtendedRecent ||
    (input.recoveryMode ?? (input.breakerOpen ? "open" : "closed")) !== "closed" ||
    quotaPressure >= GOOGLE_ADS_EXTENDED_HISTORICAL_PRESSURE_LIMIT;
  const suspendMaintenance =
    !maintenanceBudgetAllowed ||
    !workerCapacityAvailable ||
    (input.maintenanceQueueDepth ?? 0) >= GOOGLE_ADS_MAINTENANCE_BACKLOG_HARD_LIMIT ||
    quotaPressure >= 1;

  return {
    safeModeEnabled: input.safeModeEnabled,
    workerHealthy: input.workerHealthy,
    workerCapacityAvailable,
    breakerOpen: input.breakerOpen,
    quotaPressure,
    maintenanceBudgetAllowed,
    extendedBudgetAllowed,
    extendedCanaryEligible,
    recoveryMode: input.recoveryMode ?? (input.breakerOpen ? "open" : "closed"),
    lanePolicy: {
      core: "admit",
      maintenance: suspendMaintenance ? "suspended" : "admit",
      extended: suspendExtendedRecent ? "suspended" : "admit",
      extendedRecent: suspendExtendedRecent ? "suspended" : "admit",
      extendedHistorical: suspendExtendedHistorical ? "suspended" : "admit",
    } as const,
    suspendMaintenance,
    suspendExtended: suspendExtendedRecent,
    suspendExtendedRecent,
    suspendExtendedHistorical,
    executionMode: suspendExtendedRecent
      ? "core_only"
      : suspendExtendedHistorical
        ? "extended_recovery"
        : "extended_normal",
  };
}

export function getGoogleAdsExtendedRecoveryBlockReason(input: {
  policy: ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy>;
  queueHealth?: Awaited<ReturnType<typeof getGoogleAdsQueueHealth>> | null;
}) {
  if (input.policy.safeModeEnabled) return "safe_mode";
  if (input.policy.breakerOpen) return "circuit_breaker_open";
  if (!input.policy.workerHealthy) return "worker_unhealthy";
  if (!input.policy.workerCapacityAvailable) return "worker_capacity_unavailable";
  if (!input.policy.extendedBudgetAllowed) return "extended_budget_denied";
  if (!input.policy.extendedCanaryEligible) return "canary_not_enabled";
  if ((input.queueHealth?.extendedQueueDepth ?? 0) >= GOOGLE_ADS_EXTENDED_BACKLOG_HARD_LIMIT) {
    return "extended_backlog_hard_limit";
  }
  if (
    input.policy.recoveryMode === "half_open" &&
    (input.queueHealth?.extendedRecentQueueDepth ?? 0) === 0 &&
    (input.queueHealth?.extendedHistoricalQueueDepth ?? 0) > 0
  ) {
    return "half_open_recent_only";
  }
  if (
    input.policy.lanePolicy.extendedHistorical === "suspended" &&
    (input.queueHealth?.extendedHistoricalQueueDepth ?? 0) > 0
  ) {
    return "historical_recovery_suspended";
  }
  if (
    (input.queueHealth?.extendedRecentQueueDepth ?? 0) > 0 &&
    (input.queueHealth?.extendedRecentLeasedPartitions ?? 0) === 0 &&
    (input.queueHealth?.maintenanceLeasedPartitions ?? 0) > 0
  ) {
    return "maintenance_replay_pressure";
  }
  if (
    (input.queueHealth?.extendedRecentQueueDepth ?? 0) > 0 &&
    (input.queueHealth?.extendedRecentLeasedPartitions ?? 0) === 0 &&
    (input.queueHealth?.coreLeasedPartitions ?? 0) > 0
  ) {
    return "core_starvation";
  }
  if (
    (input.queueHealth?.extendedQueueDepth ?? 0) > 0 &&
    (input.queueHealth?.extendedLeasedPartitions ?? 0) === 0
  ) {
    return "queue_exists_without_eligible_lease";
  }
  return null;
}

export function shouldLeaseGoogleAdsRecentRepair(input: {
  policy: ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy> | null | undefined;
  queueHealth?: Awaited<ReturnType<typeof getGoogleAdsQueueHealth>> | null;
}) {
  if (!input.policy || input.policy.lanePolicy.extendedRecent === "suspended") return false;
  if ((input.queueHealth?.extendedRecentQueueDepth ?? 0) <= 0) return false;
  return true;
}

function getGoogleAdsRecentRepairLeaseLimit(input: {
  policy: ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy> | null | undefined;
}) {
  if (!input.policy) return 0;
  const baseLimit =
    input.policy.extendedCanaryEligible && !GOOGLE_ADS_EXTENDED_REOPEN_GENERAL_ENABLED
      ? GOOGLE_ADS_EXTENDED_CANARY_BURST_WORKER_LIMIT
      : GOOGLE_ADS_RECENT_REPAIR_WORKER_LIMIT;
  return Math.max(1, baseLimit);
}

function getGoogleAdsHistoricalLeaseLimit(input: {
  policy: ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy> | null | undefined;
}) {
  if (!input.policy) return 0;
  const baseLimit =
    input.policy.extendedCanaryEligible && !GOOGLE_ADS_EXTENDED_REOPEN_GENERAL_ENABLED
      ? GOOGLE_ADS_EXTENDED_CANARY_BURST_WORKER_LIMIT
      : GOOGLE_ADS_EXTENDED_WORKER_LIMIT;
  return Math.max(1, baseLimit);
}

export function getGoogleAdsHistoricalFairnessLeaseLimit(input: {
  policy: ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy> | null | undefined;
  queueHealth?: GoogleAdsQueueHealth | null;
  progressEvidence?: ProviderProgressEvidence | null;
  nowMs?: number;
}) {
  if (!input.policy || input.policy.lanePolicy.extendedHistorical === "suspended") return 0;
  const queueHealth = input.queueHealth ?? null;
  const backlogExists =
    (queueHealth?.extendedHistoricalQueueDepth ?? 0) > 0 ||
    (queueHealth?.extendedHistoricalLeasedPartitions ?? 0) > 0;
  if (!backlogExists) return 0;

  const maxLeaseLimit = getGoogleAdsHistoricalLeaseLimit({ policy: input.policy });
  const hasRecentAdvancement = hasRecentProviderAdvancement({
    progressEvidence: input.progressEvidence ?? null,
    fallbackLatestPartitionActivityAt: queueHealth?.latestExtendedActivityAt ?? null,
    nowMs: input.nowMs,
  });
  return hasRecentAdvancement
    ? Math.max(1, Math.min(1, maxLeaseLimit))
    : Math.max(1, Math.min(2, maxLeaseLimit));
}

export function buildGoogleAdsPrimaryLeasePlan(input: {
  policy: ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy> | null | undefined;
  queueHealth?: GoogleAdsQueueHealth | null;
  fullSyncPriorityRequired: boolean;
  fullSyncPriorityTargetScopes: GoogleAdsWarehouseScope[];
  blockHistoricalExtendedWork: boolean;
  progressEvidence?: Partial<GoogleAdsLaneEvidence> | null;
  nowMs?: number;
}) : GoogleAdsPrimaryLeasePlan {
  const allowHistoricalExtended =
    !input.blockHistoricalExtendedWork &&
    input.policy?.lanePolicy.extendedHistorical !== "suspended";
  return {
    historicalFairnessLimit: allowHistoricalExtended
      ? getGoogleAdsHistoricalFairnessLeaseLimit({
          policy: input.policy,
          queueHealth: input.queueHealth,
          progressEvidence: input.progressEvidence?.extended_historical ?? null,
          nowMs: input.nowMs,
        })
      : 0,
    recentRepairLimit: shouldLeaseGoogleAdsRecentRepair({
      policy: input.policy,
      queueHealth: input.queueHealth,
    })
      ? getGoogleAdsRecentRepairLeaseLimit({ policy: input.policy })
      : 0,
    fullSyncPriorityLimit:
      input.fullSyncPriorityRequired &&
      input.fullSyncPriorityTargetScopes.length > 0 &&
      allowHistoricalExtended
        ? Math.max(
            1,
            Math.min(
              GOOGLE_ADS_EXTENDED_FULL_SYNC_PRIORITY_LIMIT,
              getGoogleAdsHistoricalLeaseLimit({ policy: input.policy })
            )
          )
        : 0,
  };
}

export function buildGoogleAdsMaintenanceLeasePlan(input: {
  policy: ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy> | null | undefined;
  fullSyncPriorityRequired: boolean;
}) : GoogleAdsMaintenanceLeasePlan {
  const maintenanceLimit = input.fullSyncPriorityRequired
    ? Math.min(1, GOOGLE_ADS_MAINTENANCE_WORKER_LIMIT)
    : GOOGLE_ADS_MAINTENANCE_WORKER_LIMIT;
  return {
    maintenanceLimit:
      maintenanceLimit > 0 && input.policy?.lanePolicy.maintenance !== "suspended"
        ? maintenanceLimit
        : 0,
  };
}

export function buildGoogleAdsFallbackExtendedLeasePlan(input: {
  policy: ReturnType<typeof buildGoogleAdsLaneAdmissionPolicy> | null | undefined;
  fullSyncPriorityRequired: boolean;
  fullSyncPriorityTargetScopes: GoogleAdsWarehouseScope[];
  fullSyncPriorityYesterday: string | null;
  blockHistoricalExtendedWork: boolean;
  historicalLeaseStartDate: string | null;
}) : GoogleAdsFallbackExtendedLeasePlan | null {
  const policy = input.policy;
  if (!policy || policy.suspendExtended) return null;
  const sourceFilter = input.blockHistoricalExtendedWork
    ? "recent_only"
    : input.fullSyncPriorityRequired
      ? "historical_only"
      : policy.lanePolicy.extendedHistorical === "suspended"
        ? "recent_only"
        : "all";

  return {
    sourceFilter,
    limit:
      sourceFilter === "recent_only"
        ? getGoogleAdsRecentRepairLeaseLimit({ policy })
        : getGoogleAdsHistoricalLeaseLimit({ policy }),
    scopeFilter:
      input.fullSyncPriorityRequired && !input.blockHistoricalExtendedWork
        ? input.fullSyncPriorityTargetScopes
        : undefined,
    startDate:
      !input.blockHistoricalExtendedWork &&
      (input.fullSyncPriorityRequired || policy.lanePolicy.extendedHistorical !== "suspended")
        ? input.historicalLeaseStartDate
        : null,
    endDate:
      !input.blockHistoricalExtendedWork &&
      (input.fullSyncPriorityRequired || policy.lanePolicy.extendedHistorical !== "suspended")
        ? input.fullSyncPriorityYesterday
        : null,
  };
}

function applyGoogleAdsFullSyncPriorityPolicyOverride(input: {
  policy: Awaited<ReturnType<typeof getGoogleAdsIncidentPolicy>> | null;
  fullSyncPriorityRequired: boolean;
}) {
  const policy = input.policy;
  if (
    !policy ||
    !input.fullSyncPriorityRequired ||
    policy.safeModeEnabled ||
    policy.breakerOpen
  ) {
    return policy;
  }

  return {
    ...policy,
    lanePolicy: {
      ...policy.lanePolicy,
      extended: "admit" as const,
      extendedHistorical: "admit" as const,
    },
    suspendExtended: false,
    suspendExtendedHistorical: false,
    executionMode:
      policy.executionMode === "core_only" ? ("extended_recovery" as const) : policy.executionMode,
  };
}

function isGoogleAdsRecentExtendedSource(source: string | null | undefined) {
  return (
    source === "today" ||
    source === "recent" ||
    source === "selected_range" ||
    source === "core_success" ||
    source === "recent_recovery"
  );
}

function isGoogleAdsHistoricalExtendedSource(source: string | null | undefined) {
  return source === "historical" || source === "historical_recovery";
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullIfEmpty(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += Math.max(1, size)) {
    chunks.push(rows.slice(index, index + Math.max(1, size)));
  }
  return chunks;
}

function uniqueSnapshotIds(snapshotIds: Array<string | null | undefined>) {
  return Array.from(new Set(snapshotIds.filter((value): value is string => Boolean(value))));
}

export function buildGoogleAdsWarehouseFetchPlan(scopes: Iterable<GoogleAdsWarehouseScope>) {
  const requestedScopes = new Set(scopes);
  const wants = (scope: GoogleAdsWarehouseScope) => requestedScopes.has(scope);
  return {
    campaigns: wants("account_daily") || wants("campaign_daily"),
    searchIntelligence: wants("search_term_daily") || wants("ad_group_daily"),
    keywords: wants("keyword_daily") || wants("ad_group_daily"),
    ads: wants("ad_daily") || wants("ad_group_daily"),
    assets: wants("asset_daily"),
    assetGroups: wants("asset_group_daily"),
    audiences: wants("audience_daily"),
    geo: wants("geo_daily"),
    devices: wants("device_daily"),
    products: wants("product_daily"),
  };
}

function resolvePrimaryGoogleAdsSyncScope(scopes: Set<GoogleAdsWarehouseScope>) {
  if (scopes.has("campaign_daily")) return "campaign_daily";
  if (scopes.has("account_daily")) return "account_daily";
  return Array.from(scopes)[0] ?? "account_daily";
}

function extractSnapshotRows(payload: unknown): GenericRow[] {
  return Array.isArray(payload) ? (payload as GenericRow[]) : [];
}

async function isGoogleAdsWorkerHealthyForScheduling() {
  if (process.env.SYNC_WORKER_MODE === "1") return true;
  return false;
}

export function evaluateGoogleAdsWorkerSchedulingState(input: {
  onlineWorkers: number;
  lastHeartbeatAt: string | null;
  runnerLeaseActive: boolean;
  staleThresholdMs?: number;
  nowMs?: number;
}) {
  const staleThresholdMs = Math.max(1, input.staleThresholdMs ?? GOOGLE_ADS_WORKER_STALE_THRESHOLD_MS);
  const nowMs = input.nowMs ?? Date.now();
  const heartbeatAgeMs =
    input.lastHeartbeatAt != null
      ? Math.max(0, nowMs - new Date(input.lastHeartbeatAt).getTime())
      : null;
  const hasFreshHeartbeat =
    input.onlineWorkers > 0 ||
    (heartbeatAgeMs != null && heartbeatAgeMs <= staleThresholdMs);
  return {
    healthy: hasFreshHeartbeat || input.runnerLeaseActive,
    heartbeatAgeMs,
    hasFreshHeartbeat,
    runnerLeaseActive: input.runnerLeaseActive,
  };
}

export async function getGoogleAdsWorkerSchedulingState(input: { businessId: string }) {
  if (process.env.SYNC_WORKER_MODE === "1") {
    return {
      healthy: true,
      heartbeatAgeMs: 0,
      hasFreshHeartbeat: true,
      runnerLeaseActive: true,
      lastHeartbeatAt: new Date().toISOString(),
      latestLeaseUpdatedAt: new Date().toISOString(),
      ownerWorkerId: process.env.WORKER_INSTANCE_ID?.trim() ?? null,
      workerFreshnessState: "online" as const,
      currentBusinessId: null,
      lastConsumedBusinessId: null,
      consumeStage: null,
      batchBusinessIds: [] as string[],
      workerMeta: null,
    };
  }
  const state = await getProviderWorkerHealthState({
    businessId: input.businessId,
    providerScope: "google_ads",
    staleThresholdMs: GOOGLE_ADS_WORKER_STALE_THRESHOLD_MS,
  }).catch(() => null);
  return {
    healthy: state?.workerHealthy ?? false,
    heartbeatAgeMs: state?.heartbeatAgeMs ?? null,
    hasFreshHeartbeat: state?.hasFreshHeartbeat ?? false,
    runnerLeaseActive: state?.runnerLeaseActive ?? false,
    lastHeartbeatAt: state?.lastHeartbeatAt ?? null,
    latestLeaseUpdatedAt: state?.latestLeaseUpdatedAt ?? null,
    ownerWorkerId: state?.ownerWorkerId ?? null,
    workerFreshnessState: state?.workerFreshnessState ?? null,
    currentBusinessId: state?.currentBusinessId ?? null,
    lastConsumedBusinessId: state?.lastConsumedBusinessId ?? null,
    consumeStage: state?.consumeStage ?? null,
    batchBusinessIds: state?.batchBusinessIds ?? [],
    workerMeta: state?.workerMeta ?? null,
  };
}

async function getGoogleAdsIncidentPolicy(input: {
  businessId: string;
  queueHealth?: Awaited<ReturnType<typeof getGoogleAdsQueueHealth>> | null;
}) {
  const [breaker, workerState, queueHealth, budgetState, recoveryMode] = await Promise.all([
    getProviderGlobalCircuitBreaker({
      provider: "google",
      businessId: input.businessId,
    }).catch(() => null),
    getGoogleAdsWorkerSchedulingState({ businessId: input.businessId }).catch(() => ({
      healthy: false,
      heartbeatAgeMs: null,
      hasFreshHeartbeat: false,
      runnerLeaseActive: false,
      lastHeartbeatAt: null,
      latestLeaseUpdatedAt: null,
      workerFreshnessState: null,
      currentBusinessId: null,
      lastConsumedBusinessId: null,
      consumeStage: null,
      batchBusinessIds: [] as string[],
    })),
    input.queueHealth
      ? Promise.resolve(input.queueHealth)
      : getGoogleAdsQueueHealth({ businessId: input.businessId }).catch(() => null),
    getProviderQuotaBudgetState({
      provider: "google",
      businessId: input.businessId,
    }).catch(() => null),
    getProviderCircuitBreakerRecoveryState({
      provider: "google",
      businessId: input.businessId,
    }).catch(() => "closed" as const),
  ]);
  const workerHealthy = workerState.healthy;
  const workerCapacityAvailable =
    workerHealthy &&
    (queueHealth?.leasedPartitions ?? 0) <
      Math.max(
        GOOGLE_ADS_CORE_WORKER_LIMIT +
          GOOGLE_ADS_MAINTENANCE_WORKER_LIMIT +
          GOOGLE_ADS_EXTENDED_WORKER_LIMIT,
        1
      );
  const extendedCanaryEligible =
    GOOGLE_ADS_EXTENDED_REOPEN_GENERAL_ENABLED ||
    isGoogleAdsExtendedCanaryBusiness(input.businessId);

  const policy = buildGoogleAdsLaneAdmissionPolicy({
    safeModeEnabled: isGoogleAdsIncidentSafeModeEnabled(),
    workerHealthy,
    workerCapacityAvailable,
    breakerOpen: Boolean(breaker),
    queueDepth: queueHealth?.queueDepth ?? 0,
    extendedQueueDepth: queueHealth?.extendedQueueDepth ?? 0,
    maintenanceQueueDepth: queueHealth?.maintenanceQueueDepth ?? 0,
    quotaPressure: budgetState?.pressure ?? 0,
    maintenanceBudgetAllowed: budgetState?.maintenanceAllowed ?? true,
    extendedBudgetAllowed: budgetState?.extendedAllowed ?? false,
    extendedCanaryEligible,
    recoveryMode,
  });

  return {
    ...policy,
    workerHealthState: workerState,
    breaker,
    queueHealth,
    budgetState,
    recoveryMode,
  };
}

async function compactGoogleAdsIncidentBacklog(input: {
  businessId: string;
  policy: Awaited<ReturnType<typeof getGoogleAdsIncidentPolicy>>;
}) {
  if (
    !input.policy.breakerOpen &&
    !input.policy.safeModeEnabled &&
    input.policy.workerHealthState?.hasFreshHeartbeat &&
    input.policy.workerHealthState?.runnerLeaseActive &&
    input.policy.extendedCanaryEligible
  ) {
    return {
      compactedCount: 0,
    };
  }
  if (!input.policy.suspendExtended) {
    return {
      compactedCount: 0,
    };
  }

  const reason = input.policy.breakerOpen
    ? "google_ads_incident_suppressed:circuit_breaker"
    : input.policy.safeModeEnabled
      ? "google_ads_incident_suppressed:safe_mode"
      : "google_ads_incident_suppressed:worker_unhealthy";
  return compactGoogleAdsExtendedBacklog({
    businessId: input.businessId,
    reason,
    keepLatestPerScope: 0,
  }).catch(() => ({
    compactedCount: 0,
  }));
}

async function enqueueExtendedRecoveryPartitions(input: {
  businessId: string;
  policy: Awaited<ReturnType<typeof getGoogleAdsIncidentPolicy>>;
  scopes?: GoogleAdsWarehouseScope[];
  recent90Complete?: boolean;
}) {
  if (
    input.policy.lanePolicy.extendedHistorical === "suspended" ||
    shouldBlockGoogleAdsHistoricalExtendedWork({
      recent90Complete: input.recent90Complete ?? true,
    })
  ) {
    return {
      queuedHistorical: 0,
    };
  }

  const accountIds = await getAssignedGoogleAccounts(input.businessId).catch(() => []);
  if (accountIds.length === 0) {
    return {
      queuedHistorical: 0,
    };
  }

  const { historicalStart, yesterday } = await computeHistoricalTargets(input.businessId);
  const recent90State = await getGoogleAdsRecent90CompletionState({
    businessId: input.businessId,
  }).catch(() => null);
  const frontierStart = decideGoogleAdsHistoricalFrontier({
    historicalStart,
    recent90Start: recent90State?.recent90Start ?? historicalStart,
    recent90Complete: recent90State?.complete ?? true,
  });
  const recentStart = addDaysToIsoDate(
    yesterday,
    -(GOOGLE_ADS_RECENT_EXTENDED_RECOVERY_DAYS - 1)
  );
  const historicalReplayEnd = addDaysToIsoDate(recentStart, -1);
  let queuedHistorical = 0;
  const scopes =
    input.scopes?.length
      ? input.scopes
      : GOOGLE_ADS_EXTENDED_SCOPES;

  for (const providerAccountId of accountIds) {
    for (const scope of scopes) {
      if (historicalReplayEnd >= frontierStart) {
        const [coveredDates, activeDates] = await Promise.all([
          getGoogleAdsCoveredDates({
            scope,
            businessId: input.businessId,
            providerAccountId,
            startDate: frontierStart,
            endDate: historicalReplayEnd,
          }).catch(() => []),
          getGoogleAdsPartitionDates({
            businessId: input.businessId,
            providerAccountId,
            lane: "extended",
            scope,
            startDate: frontierStart,
            endDate: historicalReplayEnd,
            statuses: [...getGoogleAdsGapPlannerBlockingStatuses()],
          }).catch(() => []),
        ]);
        const blocked = new Set([...coveredDates, ...activeDates]);
        const dates = enumerateDays(frontierStart, historicalReplayEnd, true)
          .filter((date) => !blocked.has(date))
          .slice(0, GOOGLE_ADS_EXTENDED_HISTORICAL_BATCH_DAYS);
        for (const date of dates) {
          const row = await queueGoogleAdsSyncPartition({
            businessId: input.businessId,
            providerAccountId,
            lane: "extended",
            scope,
            partitionDate: date,
            status: "queued",
            priority: -15,
            source: "historical_recovery",
            attemptCount: 0,
          }).catch(() => null);
          if (row?.id) queuedHistorical++;
        }
      }
    }
  }

  return {
    queuedHistorical,
  };
}

async function cancelHistoricalExtendedBacklog(input: {
  businessId: string;
  recent90Complete: boolean;
  scopeFilter?: GoogleAdsWarehouseScope[];
}) {
  if (!shouldBlockGoogleAdsHistoricalExtendedWork({ recent90Complete: input.recent90Complete })) {
    return 0;
  }

  return cancelGoogleAdsPartitionsBySource({
    businessId: input.businessId,
    lane: "extended",
    sources: ["historical", "historical_recovery"],
    statuses: ["queued", "leased", "running"],
    scopeFilter: input.scopeFilter,
  }).catch(() => 0);
}

async function getGoogleAdsFullSyncPriorityState(input: { businessId: string }) {
  const { historicalStart, yesterday } = await computeHistoricalTargets(input.businessId);
  const totalDays = dayCountInclusive(historicalStart, yesterday);
  const coverageRows = await Promise.all(
    [...GOOGLE_ADS_ADVISOR_PRIMARY_PRIORITY_SCOPES, ...GOOGLE_ADS_ADVISOR_SUPPORTIVE_PRIORITY_SCOPES].map(
      async (scope) => ({
        scope,
        coverage: await getGoogleAdsDailyCoverage({
          scope,
          businessId: input.businessId,
          providerAccountId: null,
          startDate: historicalStart,
          endDate: yesterday,
        }).catch(() => null),
      })
    )
  );
  const targetScopes = coverageRows
    .filter((entry) => Number(entry.coverage?.completed_days ?? 0) < totalDays)
    .map((entry) => entry.scope);
  const required = targetScopes.some((scope) =>
    GOOGLE_ADS_ADVISOR_PRIMARY_PRIORITY_SCOPES.includes(scope)
  );
  return {
    required,
    targetScopes,
    totalDays,
    historicalStart,
    yesterday,
  };
}

async function enqueueGoogleAdsRecentRepairPartitions(input: {
  businessId: string;
  policy: Awaited<ReturnType<typeof getGoogleAdsIncidentPolicy>>;
}) {
  const emptyGapCounts = Object.fromEntries(
    GOOGLE_ADS_RECENT_SELF_HEAL_SCOPES.map((scope) => [scope, 0])
  ) as Record<GoogleAdsWarehouseScope, number>;

  if (input.policy.lanePolicy.extendedRecent === "suspended") {
    return {
      queuedRecent: 0,
      gapCountsByScope: emptyGapCounts,
    };
  }

  const accountIds = await getAssignedGoogleAccounts(input.businessId).catch(() => []);
  if (accountIds.length === 0) {
    return {
      queuedRecent: 0,
      gapCountsByScope: emptyGapCounts,
    };
  }

  const { yesterday } = await computeHistoricalTargets(input.businessId);
  const recentStart = addDaysToIsoDate(
    yesterday,
    -(GOOGLE_ADS_RECENT_EXTENDED_RECOVERY_DAYS - 1)
  );
  const gapCountsByScope = { ...emptyGapCounts };
  let queuedRecent = 0;

  for (const providerAccountId of accountIds) {
    for (const scope of GOOGLE_ADS_RECENT_SELF_HEAL_SCOPES) {
      const [coveredDates, activeDates] = await Promise.all([
        getGoogleAdsCoveredDates({
          scope,
          businessId: input.businessId,
          providerAccountId,
          startDate: recentStart,
          endDate: yesterday,
        }).catch(() => []),
        getGoogleAdsPartitionDates({
          businessId: input.businessId,
          providerAccountId,
          lane: "extended",
          scope,
          startDate: recentStart,
          endDate: yesterday,
          statuses: [...getGoogleAdsGapPlannerBlockingStatuses()],
        }).catch(() => []),
      ]);
      const blocked = new Set([...coveredDates, ...activeDates]);
      const missingDates = enumerateDays(recentStart, yesterday, true).filter(
        (date) => !blocked.has(date)
      );
      gapCountsByScope[scope] += missingDates.length;

      for (const date of missingDates.slice(0, GOOGLE_ADS_EXTENDED_RECENT_BATCH_DAYS)) {
        const row = await queueGoogleAdsSyncPartition({
          businessId: input.businessId,
          providerAccountId,
          lane: "extended",
          scope,
          partitionDate: date,
          status: "queued",
          priority: 25,
          source: "recent_recovery",
          attemptCount: 0,
        }).catch(() => null);
        if (row?.id) queuedRecent++;
      }
    }
  }

  return {
    queuedRecent,
    gapCountsByScope,
  };
}

function isGoogleAdsRecentRepairScope(scope: GoogleAdsWarehouseScope) {
  return GOOGLE_ADS_RECENT_SELF_HEAL_SCOPES.includes(scope);
}

async function openGoogleAdsQuotaCircuitBreaker(input: {
  businessId: string;
  message: string;
  status?: number;
}) {
  const existing = await getProviderGlobalCircuitBreaker({
    provider: "google",
    businessId: input.businessId,
  }).catch(() => null);
  const cooldownMs =
    existing != null
      ? GOOGLE_ADS_CIRCUIT_BREAKER_REPEAT_MINUTES * 60_000
      : GOOGLE_ADS_CIRCUIT_BREAKER_BASE_MINUTES * 60_000;

  return openProviderGlobalCircuitBreaker({
    provider: "google",
    businessId: input.businessId,
    message: input.message,
    status: input.status ?? 429,
    cooldownMs,
  }).catch(() => null);
}

export function resolveGoogleReplayReasonCode(input: {
  checkpointStatus?: string | null;
  checkpointPhase?: string | null;
  poisonedAt?: string | null;
  retryAfterAt?: string | null;
}): ProviderReplayReasonCode {
  if (input.poisonedAt) return "quarantine_release";
  if (input.checkpointStatus === "failed" && input.checkpointPhase === "transform") {
    return "transform_failure_replay";
  }
  if (input.checkpointStatus === "failed" && input.checkpointPhase === "bulk_upsert") {
    return "flush_verification_mismatch";
  }
  if (input.retryAfterAt) return "quota_retry";
  return "reclaim_replay";
}

export function resolvePhaseAwareReplayDecision(input: {
  checkpoint: Awaited<ReturnType<typeof getGoogleAdsSyncCheckpoint>> | null;
  existingSnapshots: Array<{
    id: string;
    page_index: number | null;
    payload_json: unknown;
  }>;
  totalChunks: number;
}) {
  const checkpoint = input.checkpoint;
  const storedSnapshotIds = uniqueSnapshotIds(input.existingSnapshots.map((row) => row.id));
  const lineageIds = uniqueSnapshotIds(checkpoint?.rawSnapshotIds ?? []);
  const continuityBroken = lineageIds.some((id) => !storedSnapshotIds.includes(id));
  const completenessBroken =
    checkpoint != null &&
    checkpoint.phase === "finalize" &&
    input.totalChunks > 0 &&
    storedSnapshotIds.length < input.totalChunks;

  if (!checkpoint) {
    return {
      startChunkIndex: 0,
      finalizeOnly: false,
      replayReasonCode: null as ProviderReplayReasonCode | null,
      replayDetail: null as string | null,
      continuityBroken: false,
    };
  }

  if (checkpoint.status === "succeeded" && checkpoint.phase === "finalize") {
    return {
      startChunkIndex: input.totalChunks,
      finalizeOnly: false,
      replayReasonCode: null as ProviderReplayReasonCode | null,
      replayDetail: null as string | null,
      continuityBroken: false,
    };
  }

  if (checkpoint.phase === "finalize" && checkpoint.status !== "succeeded") {
    const canFinalizeOnly =
      !continuityBroken &&
      !completenessBroken &&
      (checkpoint.rowsFetched ?? 0) >= (checkpoint.rowsWritten ?? 0);
    return {
      startChunkIndex: canFinalizeOnly ? input.totalChunks : Math.max(0, checkpoint.pageIndex ?? 0),
      finalizeOnly: canFinalizeOnly,
      replayReasonCode: resolveGoogleReplayReasonCode({
        checkpointStatus: checkpoint.status,
        checkpointPhase: checkpoint.phase,
        poisonedAt: checkpoint.poisonedAt,
        retryAfterAt: checkpoint.retryAfterAt,
      }),
      replayDetail: canFinalizeOnly
        ? "Finalize replay resumed after checkpoint verification succeeded."
        : "Finalize replay requires chunk replay because checkpoint verification was incomplete.",
      continuityBroken,
    };
  }

  return {
    startChunkIndex: Math.max(0, checkpoint.pageIndex ?? 0),
    finalizeOnly: false,
    replayReasonCode: resolveGoogleReplayReasonCode({
      checkpointStatus: checkpoint.status,
      checkpointPhase: checkpoint.phase,
      poisonedAt: checkpoint.poisonedAt,
      retryAfterAt: checkpoint.retryAfterAt,
    }),
    replayDetail: checkpoint.phase
      ? `Resuming Google Ads sync from ${checkpoint.phase} phase at chunk ${checkpoint.pageIndex ?? 0}.`
      : null,
    continuityBroken,
  };
}

export function validateGoogleReplayCompleteness(input: {
  totalChunks: number;
  finalRawSnapshotIds: string[];
  storedSnapshotIds: string[];
  rowsFetched: number;
  rowsWritten: number;
}) {
  const storedSnapshotSet = new Set(input.storedSnapshotIds);
  const lineageBroken = input.finalRawSnapshotIds.some(
    (snapshotId) => !storedSnapshotSet.has(snapshotId)
  );
  const snapshotCoverageBroken =
    input.totalChunks > 0 && storedSnapshotSet.size < input.totalChunks;
  const rowCountBroken = input.rowsFetched < input.rowsWritten;

  return {
    lineageBroken,
    snapshotCoverageBroken,
    rowCountBroken,
    ok: !lineageBroken && !snapshotCoverageBroken && !rowCountBroken,
  };
}

function computeDerivedMetrics(input: {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  conversionRate?: number | null;
  interactionRate?: number | null;
}) {
  return {
    ctr:
      input.impressions > 0 ? Number(((input.clicks / input.impressions) * 100).toFixed(2)) : null,
    cpc: input.clicks > 0 ? Number((input.spend / input.clicks).toFixed(2)) : null,
    cpa:
      input.conversions > 0 ? Number((input.spend / input.conversions).toFixed(2)) : null,
    roas: input.spend > 0 ? Number((input.revenue / input.spend).toFixed(2)) : 0,
    conversionRate:
      input.conversionRate ??
      (input.clicks > 0 ? Number(((input.conversions / input.clicks) * 100).toFixed(2)) : null),
    interactionRate: input.interactionRate ?? null,
  };
}

function buildWarehouseRow(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  entityKey: string;
  entityLabel?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  adGroupId?: string | null;
  adGroupName?: string | null;
  status?: string | null;
  channel?: string | null;
  classification?: string | null;
  spend?: number;
  revenue?: number;
  conversions?: number;
  impressions?: number;
  clicks?: number;
  conversionRate?: number | null;
  interactionRate?: number | null;
  payloadJson?: unknown;
  sourceSnapshotId: string | null;
}): GoogleAdsWarehouseDailyRow {
  const spend = input.spend ?? 0;
  const revenue = input.revenue ?? 0;
  const conversions = input.conversions ?? 0;
  const impressions = input.impressions ?? 0;
  const clicks = input.clicks ?? 0;
  const derived = computeDerivedMetrics({
    spend,
    revenue,
    conversions,
    impressions,
    clicks,
    conversionRate: input.conversionRate,
    interactionRate: input.interactionRate,
  });
  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    accountTimezone: input.accountTimezone,
    accountCurrency: input.accountCurrency,
    entityKey: input.entityKey,
    entityLabel: input.entityLabel ?? null,
    campaignId: input.campaignId ?? null,
    campaignName: input.campaignName ?? null,
    adGroupId: input.adGroupId ?? null,
    adGroupName: input.adGroupName ?? null,
    status: input.status ?? null,
    channel: input.channel ?? null,
    classification: input.classification ?? null,
    payloadJson: input.payloadJson ?? {},
    spend,
    revenue,
    conversions,
    impressions,
    clicks,
    ctr: derived.ctr,
    cpc: derived.cpc,
    cpa: derived.cpa,
    roas: derived.roas,
    conversionRate: derived.conversionRate,
    interactionRate: derived.interactionRate,
    sourceSnapshotId: input.sourceSnapshotId,
  };
}

async function createScopeSyncJob(input: {
  businessId: string;
  providerAccountId: string;
  startDate: string;
  endDate: string;
  scope: GoogleAdsWarehouseScope;
  syncType: GoogleAdsSyncType;
  triggerSource: string;
}) {
  return createGoogleAdsSyncJob({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    scope: input.scope,
    syncType: input.syncType,
    startDate: input.startDate,
    endDate: input.endDate,
    status: "running",
    progressPercent: 0,
    triggerSource: input.triggerSource,
    retryCount: 0,
    lastError: null,
    startedAt: new Date().toISOString(),
  });
}

function getScopeProfile(
  snapshot: Awaited<ReturnType<typeof readProviderAccountSnapshot>>,
  accountId: string
) {
  const account = snapshot?.accounts.find((item) => item.id === accountId);
  return {
    timezone: account?.timezone ?? "UTC",
    currency: account?.currency ?? "USD",
  };
}

async function persistScopeRows(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  endpointName: string;
  scope: GoogleAdsWarehouseScope;
  rows: GenericRow[];
  requestContext: Record<string, unknown>;
  mapRow: (row: GenericRow, snapshotId: string | null) => GoogleAdsWarehouseDailyRow | null;
  partitionId?: string;
  workerId?: string;
  attemptCount?: number;
}) {
  if (!input.partitionId) {
    const rowChunks = chunkRows(input.rows, GOOGLE_ADS_CHECKPOINT_CHUNK_SIZE);
    let latestSnapshotId: string | null = null;
    let rowCount = 0;

    for (let pageIndex = 0; pageIndex < rowChunks.length; pageIndex += 1) {
      const chunk = rowChunks[pageIndex] ?? [];
      latestSnapshotId = await persistGoogleAdsRawSnapshot({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        endpointName: input.endpointName,
        entityScope: input.scope,
        pageIndex,
        providerCursor: String(pageIndex),
        startDate: input.date,
        endDate: input.date,
        accountTimezone: input.accountTimezone,
        accountCurrency: input.accountCurrency,
        payloadJson: chunk,
        payloadHash: buildGoogleAdsRawSnapshotHash({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          endpointName: input.endpointName,
          startDate: input.date,
          endDate: input.date,
          payload: chunk,
        }),
        requestContext: {
          ...input.requestContext,
          pageIndex,
          chunkSize: chunk.length,
        },
        providerHttpStatus: 200,
        responseHeaders: {
          pageIndex,
          chunkSize: chunk.length,
        },
        status: "fetched",
      });

      const warehouseRows = chunk
        .map((row) => input.mapRow(row, latestSnapshotId))
        .filter((row): row is GoogleAdsWarehouseDailyRow => Boolean(row));
      await upsertGoogleAdsDailyRows(input.scope, warehouseRows);
      rowCount += warehouseRows.length;
    }

    return { snapshotId: latestSnapshotId, rowCount };
  }

  const checkpointScope = input.scope;
  const existingCheckpoint = await getGoogleAdsSyncCheckpoint({
    partitionId: input.partitionId,
    checkpointScope,
  }).catch(() => null);
  const existingSnapshots = await listGoogleAdsRawSnapshotsForPartition({
    partitionId: input.partitionId,
    endpointName: input.endpointName,
  }).catch(() => []);
  const existingSnapshotPages = new Map(
    existingSnapshots.map((row) => [Number(row.page_index ?? 0), row] as const)
  );
  const rowChunks = chunkRows(input.rows, GOOGLE_ADS_CHECKPOINT_CHUNK_SIZE);
  const replayDecision = resolvePhaseAwareReplayDecision({
    checkpoint: existingCheckpoint,
    existingSnapshots,
    totalChunks: rowChunks.length,
  });
  const startChunkIndex = replayDecision.startChunkIndex;
  let rowsFetched = existingCheckpoint?.rowsFetched ?? 0;
  let rowsWritten = existingCheckpoint?.rowsWritten ?? 0;
  let latestSnapshotId: string | null = null;
  let replayedSnapshotCount = 0;
  let accumulatedRawSnapshotIds = uniqueSnapshotIds(existingCheckpoint?.rawSnapshotIds ?? []);

  for (let pageIndex = startChunkIndex; pageIndex < rowChunks.length; pageIndex += 1) {
    const checkpointChunk = rowChunks[pageIndex] ?? [];
    if (input.workerId) {
      const leaseHealthy = await heartbeatGoogleAdsPartitionLease({
        partitionId: input.partitionId,
        workerId: input.workerId,
        leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
      }).catch(() => false);
      if (!leaseHealthy) {
        throw new Error("lease_conflict:partition_lease_heartbeat_rejected");
      }
    }

    const checkpointId = await upsertGoogleAdsCheckpointOrThrow({
      partitionId: input.partitionId,
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      checkpointScope,
      isPaginated: false,
      phase: "fetch_raw",
      status: "running",
      pageIndex,
      nextPageToken: pageIndex + 1 < rowChunks.length ? String(pageIndex + 1) : null,
      providerCursor: pageIndex + 1 < rowChunks.length ? String(pageIndex + 1) : null,
      rowsFetched,
      rowsWritten,
      attemptCount: input.attemptCount ?? 0,
      rawSnapshotIds: accumulatedRawSnapshotIds,
      progressHeartbeatAt: new Date().toISOString(),
      replayReasonCode: replayDecision.replayReasonCode,
      replayDetail: replayDecision.replayDetail,
      leaseOwner: input.workerId ?? null,
      startedAt: existingCheckpoint?.startedAt ?? new Date().toISOString(),
    });

    const existingSnapshot = existingSnapshotPages.get(pageIndex);
    latestSnapshotId = existingSnapshot?.id ?? null;
    if (!latestSnapshotId) {
      latestSnapshotId = await persistGoogleAdsRawSnapshot({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        partitionId: input.partitionId,
        checkpointId,
        endpointName: input.endpointName,
        entityScope: input.scope,
        pageIndex,
        providerCursor: String(pageIndex),
        startDate: input.date,
        endDate: input.date,
        accountTimezone: input.accountTimezone,
        accountCurrency: input.accountCurrency,
        payloadJson: checkpointChunk,
        payloadHash: buildGoogleAdsRawSnapshotHash({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          endpointName: input.endpointName,
          startDate: input.date,
          endDate: input.date,
          payload: checkpointChunk,
        }),
        requestContext: {
          ...input.requestContext,
          partitionId: input.partitionId,
          checkpointScope,
          pageIndex,
        },
        responseHeaders: {
          checkpointScope,
          pageIndex,
          chunkSize: checkpointChunk.length,
        },
        providerHttpStatus: 200,
        status: "fetched",
      });
    } else if (replayDecision.replayReasonCode) {
      replayedSnapshotCount += 1;
    }

    const sourceChunk = existingSnapshot
      ? extractSnapshotRows(existingSnapshot.payload_json)
      : checkpointChunk;
    accumulatedRawSnapshotIds = uniqueSnapshotIds([...accumulatedRawSnapshotIds, latestSnapshotId]);
    const replayingPersistedChunk =
      Boolean(existingSnapshot) &&
      Boolean(replayDecision.replayReasonCode) &&
      existingCheckpoint != null &&
      existingCheckpoint.phase !== "fetch_raw";

    rowsFetched += replayingPersistedChunk ? 0 : sourceChunk.length;

    await upsertGoogleAdsCheckpointOrThrow({
      partitionId: input.partitionId,
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      checkpointScope,
      isPaginated: false,
      phase: "transform",
      status: "running",
      pageIndex,
      nextPageToken: pageIndex + 1 < rowChunks.length ? String(pageIndex + 1) : null,
      providerCursor: pageIndex + 1 < rowChunks.length ? String(pageIndex + 1) : null,
      rowsFetched,
      rowsWritten,
      attemptCount: input.attemptCount ?? 0,
      rawSnapshotIds: accumulatedRawSnapshotIds,
      progressHeartbeatAt: new Date().toISOString(),
      replayReasonCode: replayDecision.replayReasonCode,
      replayDetail:
        existingSnapshot && replayDecision.replayReasonCode
          ? `${replayDecision.replayDetail ?? "Checkpoint replay active."} Replaying persisted raw snapshot for chunk ${pageIndex}.`
          : replayDecision.replayDetail,
      leaseOwner: input.workerId ?? null,
      startedAt: existingCheckpoint?.startedAt ?? new Date().toISOString(),
    });

    const warehouseRows = sourceChunk
      .map((row) => input.mapRow(row, latestSnapshotId))
      .filter((row): row is GoogleAdsWarehouseDailyRow => Boolean(row));

    await upsertGoogleAdsCheckpointOrThrow({
      partitionId: input.partitionId,
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      checkpointScope,
      isPaginated: false,
      phase: "bulk_upsert",
      status: "running",
      pageIndex,
      nextPageToken: pageIndex + 1 < rowChunks.length ? String(pageIndex + 1) : null,
      providerCursor: pageIndex + 1 < rowChunks.length ? String(pageIndex + 1) : null,
      rowsFetched,
      rowsWritten,
      attemptCount: input.attemptCount ?? 0,
      rawSnapshotIds: accumulatedRawSnapshotIds,
      progressHeartbeatAt: new Date().toISOString(),
      replayReasonCode: replayDecision.replayReasonCode,
      replayDetail: replayDecision.replayDetail,
      leaseOwner: input.workerId ?? null,
      lastSuccessfulEntityKey:
        warehouseRows.length > 0 ? warehouseRows[warehouseRows.length - 1]?.entityKey ?? null : null,
      startedAt: existingCheckpoint?.startedAt ?? new Date().toISOString(),
    });

    await upsertGoogleAdsDailyRows(input.scope, warehouseRows);
    rowsWritten += warehouseRows.length;
  }

  const finalRawSnapshotIds = uniqueSnapshotIds([
    ...accumulatedRawSnapshotIds,
    ...existingSnapshots.map((row) => row.id),
    latestSnapshotId,
  ]);
  const storedSnapshotIds = uniqueSnapshotIds([
    ...existingSnapshots.map((row) => row.id),
    latestSnapshotId,
  ]);
  const completeness = validateGoogleReplayCompleteness({
    totalChunks: rowChunks.length,
    finalRawSnapshotIds,
    storedSnapshotIds,
    rowsFetched,
    rowsWritten,
  });

  if (!completeness.ok) {
    const replayDetail = [
      completeness.lineageBroken ? "raw snapshot lineage is incomplete" : null,
      completeness.snapshotCoverageBroken
        ? "stored raw snapshot count is lower than expected chunk count"
        : null,
      completeness.rowCountBroken ? "rowsWritten exceeded rowsFetched" : null,
    ]
      .filter(Boolean)
      .join("; ");
    await upsertGoogleAdsCheckpointOrThrow({
      partitionId: input.partitionId,
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      checkpointScope,
      isPaginated: false,
      phase: "finalize",
      status: "failed",
      pageIndex: Math.max(0, rowChunks.length - 1),
      nextPageToken: null,
      providerCursor: null,
      rowsFetched,
      rowsWritten,
      attemptCount: input.attemptCount ?? 0,
      rawSnapshotIds: finalRawSnapshotIds,
      progressHeartbeatAt: new Date().toISOString(),
      replayReasonCode: "flush_verification_mismatch",
      replayDetail,
      leaseOwner: input.workerId ?? null,
      startedAt: existingCheckpoint?.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    throw new Error(`Google Ads finalize guard failed for ${input.scope}: ${replayDetail}`);
  }

  await upsertGoogleAdsCheckpointOrThrow({
    partitionId: input.partitionId,
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    checkpointScope,
    isPaginated: false,
    phase: "finalize",
    status: "succeeded",
    pageIndex: Math.max(0, rowChunks.length - 1),
    nextPageToken: null,
    providerCursor: null,
    rowsFetched,
    rowsWritten,
    attemptCount: input.attemptCount ?? 0,
    rawSnapshotIds: finalRawSnapshotIds,
    progressHeartbeatAt: new Date().toISOString(),
    replayReasonCode: replayDecision.replayReasonCode,
    replayDetail:
      replayDecision.replayReasonCode && replayedSnapshotCount > 0
        ? `${replayDecision.replayDetail ?? "Replay completed."} Reused ${replayedSnapshotCount} persisted chunk snapshot(s).`
        : replayDecision.replayDetail,
    leaseOwner: input.workerId ?? null,
    finishedAt: new Date().toISOString(),
    startedAt: existingCheckpoint?.startedAt ?? new Date().toISOString(),
  });

  return { snapshotId: latestSnapshotId, rowCount: rowsWritten };
}

function aggregateAdGroupRows(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  sourceSnapshotId: string | null;
  rows: GenericRow[];
}): GoogleAdsWarehouseDailyRow[] {
  const byKey = new Map<string, GenericRow>();
  for (const row of input.rows) {
    const adGroupId = nullIfEmpty(row.adGroupId);
    const adGroupName = nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup);
    const key = adGroupId ?? adGroupName;
    if (!key) continue;
    const current = byKey.get(key) ?? {
      adGroupId,
      adGroupName,
      campaignId: nullIfEmpty(row.campaignId),
      campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
      status: nullIfEmpty(row.status),
      channel: nullIfEmpty(row.channel),
      spend: 0,
      revenue: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
    };
    current.spend = toNumber(current.spend) + toNumber(row.spend);
    current.revenue = toNumber(current.revenue) + toNumber(row.revenue);
    current.conversions = toNumber(current.conversions) + toNumber(row.conversions);
    current.impressions = toNumber(current.impressions) + toNumber(row.impressions);
    current.clicks = toNumber(current.clicks) + toNumber(row.clicks);
    byKey.set(key, current);
  }

  return Array.from(byKey.entries()).map(([key, row]) =>
    buildWarehouseRow({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: input.accountTimezone,
      accountCurrency: input.accountCurrency,
      entityKey: key,
      entityLabel: nullIfEmpty(row.adGroupName),
      campaignId: nullIfEmpty(row.campaignId),
      campaignName: nullIfEmpty(row.campaignName),
      adGroupId: nullIfEmpty(row.adGroupId),
      adGroupName: nullIfEmpty(row.adGroupName),
      status: nullIfEmpty(row.status),
      channel: nullIfEmpty(row.channel),
      spend: toNumber(row.spend),
      revenue: toNumber(row.revenue),
      conversions: toNumber(row.conversions),
      impressions: toNumber(row.impressions),
      clicks: toNumber(row.clicks),
      payloadJson: row,
      sourceSnapshotId: input.sourceSnapshotId,
    })
  );
}

function aggregateAccountMetrics(rows: GenericRow[]) {
  return rows.reduce<{
    spend: number;
    revenue: number;
    conversions: number;
    impressions: number;
    clicks: number;
  }>(
    (acc, row) => {
      acc.spend += toNumber(row.spend);
      acc.revenue += toNumber(row.revenue);
      acc.conversions += toNumber(row.conversions);
      acc.impressions += toNumber(row.impressions);
      acc.clicks += toNumber(row.clicks);
      return acc;
    },
    {
      spend: 0,
      revenue: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
    }
  );
}

async function resolveGoogleAdsCurrentDate(businessId: string) {
  const [assignments, snapshot] = await Promise.all([
    getProviderAccountAssignments(businessId, "google").catch(() => null),
    readProviderAccountSnapshot({ businessId, provider: "google" }).catch(() => null),
  ]);
  const primaryAccountId = assignments?.account_ids?.[0] ?? null;
  const timeZone =
    snapshot?.accounts.find((account) => account.id === primaryAccountId)?.timezone ?? "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

async function getMissingDatesForScope(input: {
  businessId: string;
  scope: GoogleAdsWarehouseScope;
  startDate: string;
  endDate: string;
  recentFirst?: boolean;
}) {
  const coveredDates = new Set(
    await getGoogleAdsCoveredDates({
      scope: input.scope,
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => [])
  );
  return enumerateDays(input.startDate, input.endDate, input.recentFirst ?? false).filter(
    (date) => !coveredDates.has(date)
  );
}

function getGoogleAdsWorkerId() {
  return `worker:${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
}

async function computeHistoricalTargets(businessId: string) {
  const today = await resolveGoogleAdsCurrentDate(businessId).catch(() =>
    new Date().toISOString().slice(0, 10)
  );
  const yesterday = addDaysToIsoDate(today, -1);
  const historicalStart = getHistoricalWindowStart(yesterday, GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS);
  return {
    today,
    yesterday,
    historicalStart,
  };
}

export function decideGoogleAdsHistoricalFrontier(input: {
  historicalStart: string;
  recent90Start: string;
  recent90Complete: boolean;
}) {
  return input.recent90Complete ? input.historicalStart : input.recent90Start;
}

export function shouldBlockGoogleAdsHistoricalExtendedWork(input: {
  recent90Complete: boolean;
}) {
  return !input.recent90Complete;
}

async function getGoogleAdsRecent90CompletionState(input: { businessId: string }) {
  const { historicalStart, yesterday } = await computeHistoricalTargets(input.businessId);
  const recent90Start = addDaysToIsoDate(yesterday, -89);
  const frontierStart = recent90Start > historicalStart ? recent90Start : historicalStart;
  const totalDays = dayCountInclusive(frontierStart, yesterday);
  const coverageRows = await Promise.all(
    GOOGLE_ADS_RECENT_90_FRONTIER_SCOPES.map(async (scope) => ({
      scope,
      coverage: await getGoogleAdsDailyCoverage({
        scope,
        businessId: input.businessId,
        providerAccountId: null,
        startDate: frontierStart,
        endDate: yesterday,
      }).catch(() => null),
    }))
  );

  const incompleteScopes = coverageRows
    .filter((entry) => Number(entry.coverage?.completed_days ?? 0) < totalDays)
    .map((entry) => entry.scope);

  return {
    recent90Start: frontierStart,
    yesterday,
    totalDays,
    complete: incompleteScopes.length === 0,
    incompleteScopes,
  };
}

async function enqueueHistoricalCorePartitions(businessId: string) {
  const accountIds = await getAssignedGoogleAccounts(businessId).catch(() => []);
  if (accountIds.length === 0) return 0;
  const { historicalStart, yesterday } = await computeHistoricalTargets(businessId);
  const recent90State = await getGoogleAdsRecent90CompletionState({ businessId }).catch(() => null);
  const targetStart = decideGoogleAdsHistoricalFrontier({
    historicalStart,
    recent90Start: recent90State?.recent90Start ?? historicalStart,
    recent90Complete: recent90State?.complete ?? true,
  });
  let queued = 0;
  for (const providerAccountId of accountIds) {
    const [coveredDates, activePartitionDates] = await Promise.all([
      getGoogleAdsCoveredDates({
        scope: "campaign_daily",
        businessId,
        providerAccountId,
        startDate: targetStart,
        endDate: yesterday,
      }).catch(() => []),
      getGoogleAdsPartitionDates({
        businessId,
        providerAccountId,
        lane: "core",
        scope: "campaign_daily",
        startDate: targetStart,
        endDate: yesterday,
        statuses: [...getGoogleAdsGapPlannerBlockingStatuses()],
      }).catch(() => []),
    ]);
    const blockedDates = new Set([...coveredDates, ...activePartitionDates]);
    const dates = enumerateDays(targetStart, yesterday, true)
      .filter((date) => !blockedDates.has(date))
      .slice(0, GOOGLE_ADS_BOOTSTRAP_BATCH_DAYS);

    for (const date of dates) {
      const row = await queueGoogleAdsSyncPartition({
        businessId,
        providerAccountId,
        lane: "core",
        scope: "campaign_daily",
        partitionDate: date,
        status: "queued",
        priority: 0,
        source: "historical",
        attemptCount: 0,
      }).catch(() => null);
      if (row?.id) queued++;
    }
  }
  return queued;
}

async function enqueueMaintenancePartitions(businessId: string) {
  const accountIds = await getAssignedGoogleAccounts(businessId).catch(() => []);
  if (accountIds.length === 0) return;
  const { today, yesterday } = await computeHistoricalTargets(businessId);
  const recentDates = enumerateDays(
    addDaysToIsoDate(yesterday, -(GOOGLE_ADS_RECENT_MAINTENANCE_DAYS - 1)),
    yesterday,
    true
  );
  for (const providerAccountId of accountIds) {
    const activeRecentDates = new Set(
      await getGoogleAdsPartitionDates({
        businessId,
        providerAccountId,
        lane: "maintenance",
        scope: "campaign_daily",
        startDate: addDaysToIsoDate(yesterday, -(GOOGLE_ADS_RECENT_MAINTENANCE_DAYS - 1)),
        endDate: today,
        statuses: [...getGoogleAdsGapPlannerBlockingStatuses()],
      }).catch(() => [])
    );
    for (const date of recentDates) {
      if (activeRecentDates.has(date)) continue;
      await queueGoogleAdsSyncPartition({
        businessId,
        providerAccountId,
        lane: "maintenance",
        scope: "campaign_daily",
        partitionDate: date,
        status: "queued",
        priority: -10,
        source: "recent",
        attemptCount: 0,
      }).catch(() => null);
    }
    if (activeRecentDates.has(today)) continue;
    await queueGoogleAdsSyncPartition({
      businessId,
      providerAccountId,
      lane: "maintenance",
      scope: "campaign_daily",
      partitionDate: today,
      status: "queued",
      priority: 10,
      source: "today",
      attemptCount: 0,
    }).catch(() => null);
  }
}

export async function enqueueGoogleAdsScheduledWork(businessId: string) {
  await refreshGoogleAdsSyncStateForBusiness({ businessId }).catch(() => null);
  const queuedCore = await enqueueHistoricalCorePartitions(businessId).catch(() => 0);
  await enqueueMaintenancePartitions(businessId).catch(() => null);
  const queueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
  return {
    businessId,
    queuedCore,
    queueDepth: queueHealth?.queueDepth ?? 0,
    leasedPartitions: queueHealth?.leasedPartitions ?? 0,
  };
}

export async function refreshGoogleAdsSyncStateForBusiness(input: {
  businessId: string;
  scopes?: GoogleAdsWarehouseScope[];
}) {
  const accountIds = await getAssignedGoogleAccounts(input.businessId).catch(() => []);
  if (accountIds.length === 0) return;
  const scopes = input.scopes ?? GOOGLE_ADS_STATE_SCOPES;
  for (const providerAccountId of accountIds) {
    for (const scope of scopes) {
      try {
        await refreshGoogleAdsSyncStateForPartition({
          businessId: input.businessId,
          providerAccountId,
          scope,
        });
      } catch (error) {
        console.warn("[google-ads-sync] scope_state_refresh_failed", {
          businessId: input.businessId,
          providerAccountId,
          scope,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

async function computeContiguousReadyThroughDate(input: {
  businessId: string;
  providerAccountId: string;
  scope: GoogleAdsWarehouseScope;
  targetStart: string;
  targetEnd: string;
}) {
  const covered = new Set(
    await getGoogleAdsCoveredDates({
      scope: input.scope,
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      startDate: input.targetStart,
      endDate: input.targetEnd,
    }).catch(() => [])
  );
  const descending = enumerateDays(input.targetStart, input.targetEnd, true);
  let readyThroughDate: string | null = null;
  for (const date of descending) {
    if (!covered.has(date)) break;
    readyThroughDate = date;
  }
  return readyThroughDate;
}

export function scheduleGoogleAdsBackgroundSync(input: {
  businessId: string;
  delayMs?: number;
}) {
  if (!canUseInProcessBackgroundScheduling()) return false;
  const timers = getBackgroundWorkerTimers();
  if (timers.has(input.businessId)) return false;

  const timer = setTimeout(async () => {
    timers.delete(input.businessId);
    try {
      await syncGoogleAdsReports(input.businessId);
    } catch (error) {
      console.error("[google-ads-sync] background_loop_failed", {
        businessId: input.businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, Math.max(0, input.delayMs ?? GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS));

  timers.set(input.businessId, timer);
  return true;
}

async function syncGoogleAdsDates(input: {
  businessId: string;
  dates: string[];
  syncType: GoogleAdsSyncType;
  triggerSource: string;
  scopes?: GoogleAdsWarehouseScope[];
}) {
  await expireStaleGoogleAdsSyncJobs({ businessId: input.businessId }).catch(() => null);
  const accountIds = await getAssignedGoogleAccounts(input.businessId).catch(() => []);
  if (accountIds.length === 0 || input.dates.length === 0) {
    return { businessId: input.businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (const date of input.dates) {
    for (const providerAccountId of accountIds) {
      try {
        const synced = await syncGoogleAdsAccountDay({
          businessId: input.businessId,
          providerAccountId,
          date,
          syncType: input.syncType,
          triggerSource: input.triggerSource,
          scopes: input.scopes,
        });
        if (synced) succeeded++;
        else skipped++;
      } catch (error) {
        failed++;
        console.warn("[google-ads-sync] day_failed", {
          businessId: input.businessId,
          providerAccountId,
          date,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    businessId: input.businessId,
    attempted: input.dates.length * accountIds.length,
    succeeded,
    failed,
    skipped: skipped > 0 && succeeded === 0 && failed === 0,
  };
}

async function syncGoogleAdsAccountDay(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  syncType: GoogleAdsSyncType;
  triggerSource: string;
  scopes?: GoogleAdsWarehouseScope[];
  partitionOwned?: boolean;
  partitionId?: string;
  workerId?: string;
  attemptCount?: number;
}) {
  const scopes = new Set<GoogleAdsWarehouseScope>(
    input.scopes ?? [
      "account_daily",
      "campaign_daily",
      "ad_group_daily",
      "ad_daily",
      "keyword_daily",
      "search_term_daily",
      "asset_group_daily",
      "asset_daily",
      "audience_daily",
      "geo_daily",
      "device_daily",
      "product_daily",
    ]
  );
  const wants = (scope: GoogleAdsWarehouseScope) => scopes.has(scope);
  const snapshot = await readProviderAccountSnapshot({
    businessId: input.businessId,
    provider: "google",
  }).catch(() => null);
  const profile = getScopeProfile(snapshot, input.providerAccountId);
  const fetchPlan = buildGoogleAdsWarehouseFetchPlan(scopes);
  const baseParams = {
    businessId: input.businessId,
    accountId: input.providerAccountId,
    dateRange: "custom" as const,
    customStart: input.date,
    customEnd: input.date,
    debug: false,
  };

  const primaryScope = resolvePrimaryGoogleAdsSyncScope(scopes);
  const shouldWriteLegacyJobs = !input.partitionOwned;
  let jobIds: string[] = [];

  if (shouldWriteLegacyJobs) {
    const primaryJob = await createScopeSyncJob({
      ...input,
      startDate: input.date,
      endDate: input.date,
      scope: primaryScope,
    });
    if (!primaryJob?.id) return false;
    if (!primaryJob.created) {
      return false;
    }

    const secondaryScopes = Array.from(scopes).filter((scope) => scope !== primaryScope);
    const secondaryJobs = await Promise.all(
      secondaryScopes.map((scope) =>
        createScopeSyncJob({ ...input, startDate: input.date, endDate: input.date, scope })
      )
    );
    const jobs = [primaryJob, ...secondaryJobs];
    jobIds = jobs.map((job) => job?.id).filter((value): value is string => Boolean(value));
  }

  try {
    const campaigns = fetchPlan.campaigns
      ? await getGoogleAdsCampaignsReport({
          ...baseParams,
          compareMode: "none",
          source: "google_ads_warehouse_sync",
        })
      : null;
    const campaignRows = (campaigns?.rows as GenericRow[] | undefined) ?? [];
    const overview = fetchPlan.campaigns ? aggregateAccountMetrics(campaignRows) : null;
    const searchIntelligence =
      fetchPlan.searchIntelligence
        ? await getGoogleAdsSearchIntelligenceReport({
            ...baseParams,
            source: "google_ads_warehouse_sync",
            executionMode: "warehouse_sync",
          })
        : null;
    const keywords =
      fetchPlan.keywords
        ? await getGoogleAdsKeywordsReport({
            ...baseParams,
            source: "google_ads_warehouse_sync",
          })
        : null;
    const ads =
      fetchPlan.ads
        ? await getGoogleAdsAdsReport({
            ...baseParams,
            source: "google_ads_warehouse_sync",
          })
        : null;
    const assets = fetchPlan.assets
      ? await getGoogleAdsAssetsReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
          executionMode: "warehouse_sync",
        })
      : null;
    const assetGroups = fetchPlan.assetGroups
      ? await getGoogleAdsAssetGroupsReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;
    const audiences = fetchPlan.audiences
      ? await getGoogleAdsAudiencesReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;
    const geo = fetchPlan.geo
      ? await getGoogleAdsGeoReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;
    const devices = fetchPlan.devices
      ? await getGoogleAdsDevicesReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;
    const products = fetchPlan.products
      ? await getGoogleAdsProductsReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
          executionMode: "warehouse_sync",
        })
      : null;

    if (wants("account_daily") && overview) {
      await persistScopeRows({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        date: input.date,
        accountTimezone: profile.timezone,
        accountCurrency: profile.currency,
        endpointName: "overview",
        scope: "account_daily",
        rows: [
          {
            id: input.providerAccountId,
            name: input.providerAccountId,
            ...overview,
            convRate:
              overview.clicks > 0
                ? Number(((overview.conversions / overview.clicks) * 100).toFixed(2))
                : 0,
          },
        ],
        requestContext: { source: "sync", report: "overview" },
        partitionId: input.partitionId,
        workerId: input.workerId,
        attemptCount: input.attemptCount,
        mapRow: (row, snapshotId) =>
          buildWarehouseRow({
            businessId: input.businessId,
            providerAccountId: input.providerAccountId,
            date: input.date,
            accountTimezone: profile.timezone,
            accountCurrency: profile.currency,
            entityKey: input.providerAccountId,
            entityLabel: nullIfEmpty(row.name),
            spend: toNumber(row.spend),
            revenue: toNumber(row.revenue),
            conversions: toNumber(row.conversions),
            impressions: toNumber(row.impressions),
            clicks: toNumber(row.clicks),
            conversionRate:
              row.convRate == null ? null : toNumber(row.convRate),
            interactionRate:
              row.interactionRate == null ? null : toNumber(row.interactionRate),
            payloadJson: row,
            sourceSnapshotId: snapshotId,
          }),
      });
    }

    if (wants("campaign_daily") && campaigns) {
      await persistScopeRows({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        date: input.date,
        accountTimezone: profile.timezone,
        accountCurrency: profile.currency,
        endpointName: "campaigns",
        scope: "campaign_daily",
        rows: campaigns.rows as GenericRow[],
        requestContext: { source: "sync", report: "campaigns" },
        partitionId: input.partitionId,
        workerId: input.workerId,
        attemptCount: input.attemptCount,
        mapRow: (row, snapshotId) =>
          buildWarehouseRow({
            businessId: input.businessId,
            providerAccountId: input.providerAccountId,
            date: input.date,
            accountTimezone: profile.timezone,
            accountCurrency: profile.currency,
            entityKey: String(row.id),
            entityLabel: nullIfEmpty(row.name),
            campaignId: String(row.id),
            campaignName: nullIfEmpty(row.name),
            status: nullIfEmpty(row.status),
            channel: nullIfEmpty(row.channel),
            spend: toNumber(row.spend),
            revenue: toNumber(row.revenue),
            conversions: toNumber(row.conversions),
            impressions: toNumber(row.impressions),
            clicks: toNumber(row.clicks),
            conversionRate: row.conversionRate == null ? null : toNumber(row.conversionRate),
            payloadJson: row,
            sourceSnapshotId: snapshotId,
          }),
      });
    }

    const searchSnapshot =
      wants("search_term_daily") && searchIntelligence
        ? await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "search_intelligence",
      scope: "search_term_daily",
      rows: searchIntelligence.rows as GenericRow[],
      requestContext: { source: "sync", report: "search_intelligence" },
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount,
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: [
            nullIfEmpty(row.searchTerm),
            nullIfEmpty(row.campaignId),
            nullIfEmpty(row.adGroupId),
          ]
            .filter(Boolean)
            .join(":"),
          entityLabel: nullIfEmpty(row.searchTerm),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.adGroupId),
          adGroupName: nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup),
          classification: nullIfEmpty(row.classification) ?? nullIfEmpty(row.intentClass),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
    })
        : null;

    if (wants("keyword_daily") && keywords) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "keywords",
      scope: "keyword_daily",
      rows: keywords.rows as GenericRow[],
      requestContext: { source: "sync", report: "keywords" },
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount,
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.criterionId) ?? `${nullIfEmpty(row.keywordText)}:${nullIfEmpty(row.adGroupId)}`,
          entityLabel: nullIfEmpty(row.keywordText),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.adGroupId),
          adGroupName: nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup),
          classification: nullIfEmpty(row.keywordState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    const adsSnapshot =
      wants("ad_daily") && ads
        ? await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "ads",
      scope: "ad_daily",
      rows: ads.rows as GenericRow[],
      requestContext: { source: "sync", report: "ads" },
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount,
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.adId) ?? nullIfEmpty(row.id) ?? "",
          entityLabel: nullIfEmpty(row.assetName) ?? nullIfEmpty(row.headline) ?? nullIfEmpty(row.id),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.adGroupId),
          adGroupName: nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup),
          status: nullIfEmpty(row.status),
          channel: nullIfEmpty(row.channel),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
    })
        : null;

    if (wants("ad_group_daily")) {
      const adGroupRows = aggregateAdGroupRows({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        date: input.date,
        accountTimezone: profile.timezone,
        accountCurrency: profile.currency,
        sourceSnapshotId: adsSnapshot?.snapshotId ?? searchSnapshot?.snapshotId ?? null,
        rows: [
          ...((ads?.rows as GenericRow[] | undefined) ?? []),
          ...((keywords?.rows as GenericRow[] | undefined) ?? []),
          ...((searchIntelligence?.rows as GenericRow[] | undefined) ?? []),
        ],
      });
      if (input.partitionId) {
        const checkpointScope = "ad_group_daily";
        const existingCheckpoint = await getGoogleAdsSyncCheckpoint({
          partitionId: input.partitionId,
          checkpointScope,
        }).catch(() => null);
        const chunks = chunkRows(adGroupRows, GOOGLE_ADS_CHECKPOINT_CHUNK_SIZE);
        const startChunkIndex =
          existingCheckpoint?.status === "succeeded" && existingCheckpoint.phase === "finalize"
            ? chunks.length
            : Math.max(0, existingCheckpoint?.pageIndex ?? 0);
        let rowsWritten = existingCheckpoint?.rowsWritten ?? 0;
        for (let pageIndex = startChunkIndex; pageIndex < chunks.length; pageIndex += 1) {
          if (input.workerId) {
            await heartbeatGoogleAdsPartitionLease({
              partitionId: input.partitionId,
              workerId: input.workerId,
              leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
            });
          }
          await upsertGoogleAdsCheckpointOrThrow({
            partitionId: input.partitionId,
            businessId: input.businessId,
            providerAccountId: input.providerAccountId,
            checkpointScope,
            isPaginated: false,
            phase: "bulk_upsert",
            status: "running",
            pageIndex,
            nextPageToken: pageIndex + 1 < chunks.length ? String(pageIndex + 1) : null,
            providerCursor: pageIndex + 1 < chunks.length ? String(pageIndex + 1) : null,
            rowsFetched: adGroupRows.length,
            rowsWritten,
            attemptCount: input.attemptCount ?? 0,
            rawSnapshotIds: [
              ...(existingCheckpoint?.rawSnapshotIds ?? []),
              ...(adsSnapshot?.snapshotId ? [adsSnapshot.snapshotId] : []),
              ...(searchSnapshot?.snapshotId ? [searchSnapshot.snapshotId] : []),
            ],
            progressHeartbeatAt: new Date().toISOString(),
            leaseOwner: input.workerId ?? null,
            lastSuccessfulEntityKey:
              chunks[pageIndex]?.[chunks[pageIndex].length - 1]?.entityKey ?? null,
            startedAt: existingCheckpoint?.startedAt ?? new Date().toISOString(),
          });
          await upsertGoogleAdsDailyRows("ad_group_daily", chunks[pageIndex] ?? []);
          rowsWritten += (chunks[pageIndex] ?? []).length;
        }
        await upsertGoogleAdsCheckpointOrThrow({
          partitionId: input.partitionId,
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          checkpointScope,
          isPaginated: false,
          phase: "finalize",
          status: "succeeded",
          pageIndex: Math.max(0, chunks.length - 1),
          nextPageToken: null,
          providerCursor: null,
          rowsFetched: adGroupRows.length,
          rowsWritten,
          attemptCount: input.attemptCount ?? 0,
          rawSnapshotIds: [
            ...(existingCheckpoint?.rawSnapshotIds ?? []),
            ...(adsSnapshot?.snapshotId ? [adsSnapshot.snapshotId] : []),
            ...(searchSnapshot?.snapshotId ? [searchSnapshot.snapshotId] : []),
          ],
          progressHeartbeatAt: new Date().toISOString(),
          leaseOwner: input.workerId ?? null,
          finishedAt: new Date().toISOString(),
          startedAt: existingCheckpoint?.startedAt ?? new Date().toISOString(),
        });
      } else {
        await upsertGoogleAdsDailyRows("ad_group_daily", adGroupRows);
      }
    }

    if (wants("asset_daily") && assets) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "assets",
      scope: "asset_daily",
      rows: assets.rows as GenericRow[],
      requestContext: { source: "sync", report: "assets" },
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount,
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.assetId) ?? nullIfEmpty(row.id) ?? "",
          entityLabel: nullIfEmpty(row.assetName) ?? nullIfEmpty(row.assetText),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.assetGroupId),
          adGroupName: nullIfEmpty(row.assetGroupName) ?? nullIfEmpty(row.assetGroup),
          classification: nullIfEmpty(row.assetState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          interactionRate: row.interactionRate == null ? null : toNumber(row.interactionRate),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("asset_group_daily") && assetGroups) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "asset_groups",
      scope: "asset_group_daily",
      rows: assetGroups.rows as GenericRow[],
      requestContext: { source: "sync", report: "asset_groups" },
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount,
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.assetGroupId) ?? nullIfEmpty(row.id) ?? "",
          entityLabel: nullIfEmpty(row.assetGroupName) ?? nullIfEmpty(row.name),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          status: nullIfEmpty(row.status),
          classification: nullIfEmpty(row.classification),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          conversionRate: row.conversionRate == null ? null : toNumber(row.conversionRate),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("audience_daily") && audiences) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "audiences",
      scope: "audience_daily",
      rows: audiences.rows as GenericRow[],
      requestContext: { source: "sync", report: "audiences" },
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount,
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.audienceKey) ?? `${nullIfEmpty(row.audienceType)}:${nullIfEmpty(row.adGroupId)}`,
          entityLabel: nullIfEmpty(row.audienceNameBestEffort) ?? nullIfEmpty(row.type),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.adGroupId),
          adGroupName: nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup),
          classification: nullIfEmpty(row.audienceState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("geo_daily") && geo) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "geo",
      scope: "geo_daily",
      rows: geo.rows as GenericRow[],
      requestContext: { source: "sync", report: "geo" },
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount,
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.geoId) ?? nullIfEmpty(row.country) ?? nullIfEmpty(row.geoName) ?? "",
          entityLabel: nullIfEmpty(row.geoName) ?? nullIfEmpty(row.country),
          classification: nullIfEmpty(row.geoState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("device_daily") && devices) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "devices",
      scope: "device_daily",
      rows: devices.rows as GenericRow[],
      requestContext: { source: "sync", report: "devices" },
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount,
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.device) ?? "",
          entityLabel: nullIfEmpty(row.device),
          classification: nullIfEmpty(row.deviceState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("product_daily") && products) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "products",
      scope: "product_daily",
      rows: products.rows as GenericRow[],
      requestContext: { source: "sync", report: "products" },
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount,
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.productItemId) ?? nullIfEmpty(row.itemId) ?? "",
          entityLabel: nullIfEmpty(row.productTitle) ?? nullIfEmpty(row.title),
          classification: nullIfEmpty(row.scaleState) ?? nullIfEmpty(row.underperformingState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    await Promise.all(
      jobIds.map((id) =>
        updateGoogleAdsSyncJob({
          id,
          status: "succeeded",
          progressPercent: 100,
          finishedAt: new Date().toISOString(),
        })
      )
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all(
      jobIds.map((id) =>
        updateGoogleAdsSyncJob({
          id,
          status: "failed",
          lastError: message,
          finishedAt: new Date().toISOString(),
        })
      )
    );
    throw error;
  }
}

function classifyGoogleAdsSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/RESOURCE_EXHAUSTED|quota|rate limit|429/i.test(message)) return "quota";
  if (/timeout|ECONNRESET|ENOTFOUND|server_login_retry|partial pkt/i.test(message)) return "transient";
  return "application";
}

function computePartitionRetryDelayMinutes(attemptCount: number, errorClass: string) {
  const base =
    errorClass === "quota"
      ? GOOGLE_ADS_QUOTA_RETRY_BASE_MINUTES
      : GOOGLE_ADS_TRANSIENT_RETRY_BASE_MINUTES;
  const exp = Math.min(attemptCount, 5);
  const jitter = Math.floor(Math.random() * 3);
  return Math.min(60, base * 2 ** Math.max(0, exp - 1) + jitter);
}

async function enqueueExtendedPartitionsForDate(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
}) {
  const incidentPolicy = await getGoogleAdsIncidentPolicy({
    businessId: input.businessId,
  }).catch(() => null);
  if (incidentPolicy?.suspendExtended) {
    return;
  }
  await Promise.all(
    GOOGLE_ADS_EXTENDED_SCOPES.map((scope) =>
      queueGoogleAdsSyncPartition({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        lane: "extended",
        scope,
        partitionDate: input.date,
        status: "queued",
        priority: -5,
        source: "core_success",
        attemptCount: 0,
      }).catch(() => null)
    )
  );
}

async function refreshGoogleAdsSyncStateForPartition(input: {
  businessId: string;
  providerAccountId: string;
  scope: GoogleAdsWarehouseScope;
}) {
  const { historicalStart, yesterday } = await computeHistoricalTargets(input.businessId);
  const laneForScope: GoogleAdsSyncLane =
    input.scope === "account_daily" || input.scope === "campaign_daily" ? "core" : "extended";
  const [coverage, partitionHealth, readyThroughDate] = await Promise.all([
    getGoogleAdsDailyCoverage({
      scope: input.scope,
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      startDate: historicalStart,
      endDate: yesterday,
      includeMetadata: true,
    }).catch(() => null),
    getGoogleAdsPartitionHealth({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      scope: input.scope,
      lane: laneForScope,
    }).catch(() => null),
    computeContiguousReadyThroughDate({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      scope: input.scope,
      targetStart: historicalStart,
      targetEnd: yesterday,
    }).catch(() => null),
  ]);
  await upsertGoogleAdsSyncState({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    scope: input.scope,
    historicalTargetStart: historicalStart,
    historicalTargetEnd: yesterday,
    effectiveTargetStart: historicalStart,
    effectiveTargetEnd: yesterday,
    readyThroughDate,
    lastSuccessfulPartitionDate: coverage?.ready_through_date ?? null,
    latestBackgroundActivityAt: partitionHealth?.latestActivityAt ?? new Date().toISOString(),
    latestSuccessfulSyncAt: coverage?.latest_updated_at ?? new Date().toISOString(),
    completedDays: coverage?.completed_days ?? 0,
    deadLetterCount: partitionHealth?.deadLetterPartitions ?? 0,
  });
}

async function processGoogleAdsPartition(input: {
  partition: {
    id?: string;
    businessId: string;
    providerAccountId: string;
    lane: GoogleAdsSyncLane;
    scope: GoogleAdsWarehouseScope;
    partitionDate: string;
    attemptCount: number;
    source: string;
  };
  workerId: string;
}) {
  const partitionId = input.partition.id;
  if (!partitionId) return false;
  const markRunningOk = await markGoogleAdsPartitionRunning({
    partitionId,
    workerId: input.workerId,
  }).catch(() => false);
  if (!markRunningOk) {
    console.warn("[google-ads-sync] partition_lost_ownership_before_run", {
      businessId: input.partition.businessId,
      partitionId,
      workerId: input.workerId,
      scope: input.partition.scope,
      partitionDate: input.partition.partitionDate,
    });
    return false;
  }
  const runId = await createGoogleAdsSyncRun({
    partitionId,
    businessId: input.partition.businessId,
    providerAccountId: input.partition.providerAccountId,
    lane: input.partition.lane,
    scope: input.partition.scope,
    partitionDate: input.partition.partitionDate,
    status: "running",
    workerId: input.workerId,
    attemptCount: input.partition.attemptCount + 1,
    metaJson: { source: input.partition.source },
  });

  const startedAt = Date.now();
  try {
    const scopes =
      input.partition.lane === "core" || input.partition.lane === "maintenance"
        ? (["account_daily", "campaign_daily"] as GoogleAdsWarehouseScope[])
        : ([input.partition.scope] as GoogleAdsWarehouseScope[]);

    const synced = await syncGoogleAdsAccountDay({
      businessId: input.partition.businessId,
      providerAccountId: input.partition.providerAccountId,
      date: input.partition.partitionDate,
      syncType:
        input.partition.lane === "maintenance"
          ? input.partition.partitionDate === (await resolveGoogleAdsCurrentDate(input.partition.businessId).catch(() => input.partition.partitionDate))
            ? "today_refresh"
            : "incremental_recent"
          : "initial_backfill",
      triggerSource:
        input.partition.lane === "core"
          ? "background_initial"
          : input.partition.lane === "extended"
            ? input.partition.source === "recent_recovery" &&
              isGoogleAdsRecentRepairScope(input.partition.scope)
              ? `auto_recent_repair:${input.partition.scope}`
              : "background_repair"
            : "background_recent",
      scopes,
      partitionOwned: true,
      partitionId,
      workerId: input.workerId,
      attemptCount: input.partition.attemptCount + 1,
    });

    if (!synced) {
      const completed = await completeGoogleAdsPartition({
        partitionId,
        workerId: input.workerId,
        status: "failed",
        lastError: "partition skipped because another worker already owns this date",
        retryDelayMinutes: 5,
      }).catch(() => false);
      if (runId) {
        await updateGoogleAdsSyncRun({
          id: runId,
          status: "failed",
          errorClass: "lease_conflict",
          errorMessage: completed
            ? "partition skipped because another worker already owns this date"
            : "partition lost ownership before failure completion",
          durationMs: Date.now() - startedAt,
          finishedAt: new Date().toISOString(),
          onlyIfCurrentStatus: "running",
        });
      }
      return false;
    }

    if (input.partition.lane === "core" || input.partition.lane === "maintenance") {
      await refreshGoogleAdsSyncStateForPartition({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        scope: "campaign_daily",
      });
      await refreshGoogleAdsSyncStateForPartition({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        scope: "account_daily",
      });
    } else {
      await refreshGoogleAdsSyncStateForPartition({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        scope: input.partition.scope,
      });
    }

    if (input.partition.lane === "core") {
      await enqueueExtendedPartitionsForDate({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        date: input.partition.partitionDate,
      });
    }

    if (input.partition.lane === "core") {
      await clearProviderGlobalCircuitBreaker({
        provider: "google",
        businessId: input.partition.businessId,
      }).catch(() => null);
      await clearProviderGlobalCircuitBreakerRecoveryState({
        provider: "google",
        businessId: input.partition.businessId,
      }).catch(() => null);
    } else if (input.partition.lane === "maintenance") {
      await clearProviderGlobalCircuitBreaker({
        provider: "google",
        businessId: input.partition.businessId,
      }).catch(() => null);
    }

    const completed = await completeGoogleAdsPartition({
      partitionId,
      workerId: input.workerId,
      status: "succeeded",
      lastError: null,
    }).catch(() => false);
    if (!completed) {
      if (runId) {
        await updateGoogleAdsSyncRun({
          id: runId,
          status: "failed",
          errorClass: "lease_conflict",
          errorMessage: "partition lost ownership before success completion",
          durationMs: Date.now() - startedAt,
          finishedAt: new Date().toISOString(),
          onlyIfCurrentStatus: "running",
        });
      }
      return false;
    }
    if (runId) {
      await updateGoogleAdsSyncRun({
        id: runId,
        status: "succeeded",
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        onlyIfCurrentStatus: "running",
      });
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorClass = classifyGoogleAdsSyncError(error);
    if (errorClass === "quota") {
      if (
        input.partition.lane === "extended" &&
        isGoogleAdsHistoricalExtendedSource(input.partition.source)
      ) {
        await enterProviderGlobalCircuitBreakerRecoveryState({
          provider: "google",
          businessId: input.partition.businessId,
          message: "Historical extended replay hit quota pressure and was downgraded to recovery mode.",
          cooldownMs: GOOGLE_ADS_CIRCUIT_BREAKER_BASE_MINUTES * 60_000,
        }).catch(() => null);
      } else {
        await openGoogleAdsQuotaCircuitBreaker({
          businessId: input.partition.businessId,
          message,
          status: error instanceof ProviderRequestCooldownError ? error.status : 429,
        }).catch(() => null);
      }
    }
    const nextAttempt = input.partition.attemptCount + 1;
    const activeCheckpoint = await getGoogleAdsSyncCheckpoint({
      partitionId,
      checkpointScope: input.partition.scope,
    }).catch(() => null);
    const poisonCandidate = nextAttempt >= 3;
    const status =
      poisonCandidate || nextAttempt >= GOOGLE_ADS_PARTITION_MAX_ATTEMPTS
        ? "dead_letter"
        : "failed";
    await upsertGoogleAdsCheckpointOrThrow({
      partitionId,
      businessId: input.partition.businessId,
      providerAccountId: input.partition.providerAccountId,
      checkpointScope: input.partition.scope,
      isPaginated: activeCheckpoint?.isPaginated ?? false,
      phase: activeCheckpoint?.phase ?? "bulk_upsert",
      status: "failed",
      pageIndex: activeCheckpoint?.pageIndex ?? 0,
      nextPageToken: activeCheckpoint?.nextPageToken ?? null,
      providerCursor: activeCheckpoint?.providerCursor ?? null,
      rawSnapshotIds: activeCheckpoint?.rawSnapshotIds ?? [],
      rowsFetched: activeCheckpoint?.rowsFetched ?? 0,
      rowsWritten: activeCheckpoint?.rowsWritten ?? 0,
      lastSuccessfulEntityKey: activeCheckpoint?.lastSuccessfulEntityKey ?? null,
      lastResponseHeaders: activeCheckpoint?.lastResponseHeaders ?? {},
      attemptCount: nextAttempt,
      progressHeartbeatAt: new Date().toISOString(),
      leaseOwner: input.workerId,
      poisonedAt: poisonCandidate ? new Date().toISOString() : null,
      poisonReason:
        poisonCandidate
          ? `Repeated failure on checkpoint page ${activeCheckpoint?.pageIndex ?? 0}: ${message}`
          : null,
      replayReasonCode:
        poisonCandidate
          ? "quarantine_release"
          : resolveGoogleReplayReasonCode({
              checkpointStatus: activeCheckpoint?.status ?? "failed",
              checkpointPhase: activeCheckpoint?.phase ?? "bulk_upsert",
              poisonedAt: activeCheckpoint?.poisonedAt,
              retryAfterAt: activeCheckpoint?.retryAfterAt,
            }),
      replayDetail: `Partition failure captured during ${activeCheckpoint?.phase ?? "bulk_upsert"} phase: ${message}`,
      retryAfterAt: new Date(
        Date.now() + computePartitionRetryDelayMinutes(nextAttempt, errorClass) * 60_000
      ).toISOString(),
      startedAt: activeCheckpoint?.startedAt ?? null,
      finishedAt: new Date().toISOString(),
    }).catch(() => null);
    if (poisonCandidate) {
      await recordSyncReclaimEvents({
        providerScope: "google_ads",
        businessId: input.partition.businessId,
        partitionIds: [partitionId],
        checkpointScope: input.partition.scope,
        eventType: "poisoned",
        disposition: "poison_candidate",
        reasonCode: "same_phase_reentry_limit",
        detail: `Repeated failure on phase ${activeCheckpoint?.phase ?? "unknown"} page ${activeCheckpoint?.pageIndex ?? 0}: ${message}`,
      }).catch(() => null);
    }
    const completed = await completeGoogleAdsPartition({
      partitionId,
      workerId: input.workerId,
      status,
      lastError: message,
      retryDelayMinutes: computePartitionRetryDelayMinutes(nextAttempt, errorClass),
    }).catch(() => false);
    if (runId) {
      await updateGoogleAdsSyncRun({
        id: runId,
        status: "failed",
        errorClass: completed ? errorClass : "lease_conflict",
        errorMessage: completed ? message : "partition lost ownership before failure completion",
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        onlyIfCurrentStatus: "running",
      });
    }
    return false;
  }
}

export async function processGoogleAdsLifecyclePartition(input: {
  partition: {
    id?: string;
    businessId: string;
    providerAccountId: string;
    lane: GoogleAdsSyncLane;
    scope: GoogleAdsWarehouseScope;
    partitionDate: string;
    attemptCount: number;
    source: string;
  };
  workerId: string;
}) {
  return processGoogleAdsPartition(input);
}

export interface GoogleAdsSyncResult {
  businessId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
  outcome?:
    | "skipped_non_worker_mode"
    | "skipped_existing_background_lock"
    | "skipped_no_partitions"
    | "skipped_worker_state_guard"
    | "consume_failed_before_leasing"
    | "consume_failed_after_leasing"
    | "consume_completed_without_progress"
    | "consume_completed_with_progress";
  failureReason?: string | null;
}

export interface GoogleAdsTargetedRepairResult {
  businessId: string;
  scope: GoogleAdsWarehouseScope;
  startDate: string;
  endDate: string;
  syncResult: GoogleAdsSyncResult;
  beforeCoverage: {
    completedDays: number;
    totalDays: number;
    readyThroughDate: string | null;
  };
  afterCoverage: {
    completedDays: number;
    totalDays: number;
    readyThroughDate: string | null;
  };
  outcome: "coverage_increased" | "no_data" | "failed" | "skipped";
  coverageDelta: number;
}

export async function syncGoogleAdsRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  syncType?: GoogleAdsSyncType;
  triggerSource?: string;
  scopes?: GoogleAdsWarehouseScope[];
}): Promise<GoogleAdsSyncResult> {
  const days = enumerateDays(input.startDate, input.endDate, input.syncType !== "initial_backfill");
  return syncGoogleAdsDates({
    businessId: input.businessId,
    dates: days,
    syncType: input.syncType ?? "incremental_recent",
    triggerSource: input.triggerSource ?? "system",
    scopes: input.scopes,
  });
}

export async function runGoogleAdsTargetedRepair(input: {
  businessId: string;
  scope: GoogleAdsWarehouseScope;
  startDate: string;
  endDate: string;
}): Promise<GoogleAdsTargetedRepairResult> {
  const beforeCoverageRaw = await getGoogleAdsDailyCoverage({
    scope: input.scope,
    businessId: input.businessId,
    providerAccountId: null,
    startDate: input.startDate,
    endDate: input.endDate,
  }).catch(() => null);

  const beforeCoverage = {
    completedDays: Number(beforeCoverageRaw?.completed_days ?? 0),
    totalDays: 0,
    readyThroughDate: beforeCoverageRaw?.ready_through_date
      ? String(beforeCoverageRaw.ready_through_date).slice(0, 10)
      : null,
  };

  const syncResult = await syncGoogleAdsRange({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    syncType: "repair_window",
    triggerSource: `manual_targeted_repair:${input.scope}`,
    scopes: [input.scope],
  });

  await refreshGoogleAdsSyncStateForBusiness({
    businessId: input.businessId,
    scopes: [input.scope],
  });

  const afterCoverageRaw = await getGoogleAdsDailyCoverage({
    scope: input.scope,
    businessId: input.businessId,
    providerAccountId: null,
    startDate: input.startDate,
    endDate: input.endDate,
  }).catch(() => null);

  const afterCoverage = {
    completedDays: Number(afterCoverageRaw?.completed_days ?? 0),
    totalDays: 0,
    readyThroughDate: afterCoverageRaw?.ready_through_date
      ? String(afterCoverageRaw.ready_through_date).slice(0, 10)
      : null,
  };

  const coverageDelta = afterCoverage.completedDays - beforeCoverage.completedDays;
  const outcome =
    syncResult.failed > 0
      ? "failed"
      : syncResult.skipped
        ? "skipped"
        : coverageDelta > 0 || afterCoverage.readyThroughDate !== beforeCoverage.readyThroughDate
          ? "coverage_increased"
          : "no_data";

  return {
    businessId: input.businessId,
    scope: input.scope,
    startDate: input.startDate,
    endDate: input.endDate,
    syncResult,
    beforeCoverage,
    afterCoverage,
    outcome,
    coverageDelta,
  };
}

export async function syncGoogleAdsRecent(businessId: string) {
  const today = await resolveGoogleAdsCurrentDate(businessId).catch(() =>
    new Date().toISOString().slice(0, 10)
  );
  const endDate = addDaysToIsoDate(today, -1);
  const dates = enumerateDays(
    addDaysToIsoDate(endDate, -(GOOGLE_ADS_RECENT_MAINTENANCE_DAYS - 1)),
    endDate,
    true
  );
  return syncGoogleAdsDates({
    businessId,
    dates,
    syncType: "incremental_recent",
    triggerSource: "background_recent",
  });
}

export async function syncGoogleAdsToday(businessId: string) {
  const today = await resolveGoogleAdsCurrentDate(businessId).catch(() =>
    new Date().toISOString().slice(0, 10)
  );
  return syncGoogleAdsDates({
    businessId,
    dates: [today],
    syncType: "today_refresh",
    triggerSource: "background_today",
  });
}

export async function syncGoogleAdsInitial(businessId: string) {
  const today = await resolveGoogleAdsCurrentDate(businessId).catch(() =>
    new Date().toISOString().slice(0, 10)
  );
  const yesterday = addDaysToIsoDate(today, -1);
  const dates = enumerateDays(
    getHistoricalWindowStart(yesterday, GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS),
    yesterday,
    true
  ).slice(0, GOOGLE_ADS_BOOTSTRAP_BATCH_DAYS);
  return syncGoogleAdsDates({
    businessId,
    dates,
    syncType: "initial_backfill",
    triggerSource: "background_initial",
    scopes: ["account_daily", "campaign_daily"],
  });
}

export async function syncGoogleAdsRepairRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  return syncGoogleAdsRange({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    syncType: "repair_window",
    triggerSource: "background_repair",
  });
}

export async function ensureGoogleAdsWarehouseRangeFilled(input: {
  businessId: string;
  scope?: GoogleAdsWarehouseScope;
  startDate: string;
  endDate: string;
}) {
  await enqueueGoogleAdsScheduledWork(input.businessId).catch(() => null);
}

export async function syncGoogleAdsReports(
  businessId: string,
  input?: {
    runtimeLeaseGuard?: RunnerLeaseGuard;
  }
): Promise<GoogleAdsSyncResult> {
  if (process.env.SYNC_WORKER_MODE !== "1") {
    await enqueueGoogleAdsScheduledWork(businessId).catch(() => null);
    return {
      businessId,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: true,
      outcome: "skipped_non_worker_mode",
      failureReason: null,
    };
  }
  await cleanupGoogleAdsObsoleteSyncJobs({ businessId }).catch(() => null);
  await expireStaleGoogleAdsSyncJobs({ businessId }).catch(() => null);
  await cleanupGoogleAdsPartitionOrchestration({
    businessId,
    staleRunMinutesByLane: {
      core: GOOGLE_ADS_STALE_RUN_CORE_MINUTES,
      maintenance: GOOGLE_ADS_STALE_RUN_MAINTENANCE_MINUTES,
      extended: GOOGLE_ADS_STALE_RUN_EXTENDED_MINUTES,
    },
    runProgressGraceMinutes: GOOGLE_ADS_RUN_PROGRESS_GRACE_MINUTES,
  }).catch(() => null);
  const fullSyncPriority = await getGoogleAdsFullSyncPriorityState({ businessId }).catch(() => ({
    required: false,
    targetScopes: [] as GoogleAdsWarehouseScope[],
    totalDays: 0,
    historicalStart: null,
    yesterday: null,
  }));
  const recent90State = await getGoogleAdsRecent90CompletionState({ businessId }).catch(() => null);
  const historicalLeaseStartDate =
    fullSyncPriority.historicalStart && recent90State
      ? decideGoogleAdsHistoricalFrontier({
          historicalStart: fullSyncPriority.historicalStart,
          recent90Start: recent90State.recent90Start,
          recent90Complete: recent90State.complete,
        })
      : null;
  const initialQueueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
  const initialIncidentPolicy = await getGoogleAdsIncidentPolicy({
    businessId,
    queueHealth: initialQueueHealth,
  }).catch(() => null);
  const effectiveInitialIncidentPolicy = applyGoogleAdsFullSyncPriorityPolicyOverride({
    policy: initialIncidentPolicy,
    fullSyncPriorityRequired: fullSyncPriority.required,
  });
  const blockHistoricalExtendedWork = shouldBlockGoogleAdsHistoricalExtendedWork({
    recent90Complete: recent90State?.complete ?? true,
  });
  if (effectiveInitialIncidentPolicy) {
    await compactGoogleAdsIncidentBacklog({
      businessId,
      policy: effectiveInitialIncidentPolicy,
    }).catch(() => null);
  }
  await cancelHistoricalExtendedBacklog({
    businessId,
    recent90Complete: recent90State?.complete ?? true,
    scopeFilter: fullSyncPriority.required ? fullSyncPriority.targetScopes : undefined,
  }).catch(() => 0);

  const backgroundSyncKeys = getBackgroundSyncKeys();
  const lockKey = `background:${businessId}`;
  if (canUseInProcessBackgroundScheduling()) {
    const workerState = await getGoogleAdsWorkerSchedulingState({ businessId }).catch(() => null);
    if (workerState?.hasFreshHeartbeat && workerState.runnerLeaseActive) {
      return {
        businessId,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: true,
        outcome: "skipped_worker_state_guard",
        failureReason: null,
      };
    }
  }
  if (backgroundSyncKeys.has(lockKey)) {
    return {
      businessId,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: true,
      outcome: "skipped_existing_background_lock",
      failureReason: null,
    };
  }

  backgroundSyncKeys.add(lockKey);
  const workerId = getGoogleAdsWorkerId();
  let hasReachedLeasing = false;
  try {
    const leaseConflictReason = () =>
      input?.runtimeLeaseGuard?.getLeaseLossReason() ?? "runner_lease_conflict";
    const hasLeaseConflict = () => input?.runtimeLeaseGuard?.isLeaseLost() ?? false;
    await enqueueGoogleAdsScheduledWork(businessId).catch(() => null);
    await refreshGoogleAdsSyncStateForBusiness({ businessId }).catch((error) => {
      console.warn("[google-ads-sync] state_refresh_before_run_failed", {
        businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    const queueHealthAfterPlanning = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
    const stateRowsByScope = await Promise.all(
      GOOGLE_ADS_STATE_SCOPES.map((scope) => getGoogleAdsSyncState({ businessId, scope }).catch(() => []))
    ).catch(() => GOOGLE_ADS_STATE_SCOPES.map(() => []));
    const statesByScope = Object.fromEntries(
      GOOGLE_ADS_STATE_SCOPES.map((scope, index) => [scope, stateRowsByScope[index] ?? []])
    ) as GoogleAdsStatesByScope;
    const laneProgressEvidence = buildGoogleAdsLaneProgressEvidence({
      statesByScope,
      queueHealth: queueHealthAfterPlanning,
    });
    const policyBeforeRecentRepair = await getGoogleAdsIncidentPolicy({
      businessId,
      queueHealth: queueHealthAfterPlanning,
    }).catch(() => null);
    const effectivePolicyBeforeRecentRepair = applyGoogleAdsFullSyncPriorityPolicyOverride({
      policy: policyBeforeRecentRepair,
      fullSyncPriorityRequired: fullSyncPriority.required,
    });
    const recentRepairPlan = policyBeforeRecentRepair
      ? await enqueueGoogleAdsRecentRepairPartitions({
          businessId,
          policy: effectivePolicyBeforeRecentRepair ?? policyBeforeRecentRepair,
        }).catch(() => ({
          queuedRecent: 0,
          gapCountsByScope: Object.fromEntries(
            GOOGLE_ADS_RECENT_SELF_HEAL_SCOPES.map((scope) => [scope, 0])
          ) as Record<GoogleAdsWarehouseScope, number>,
        }))
      : {
          queuedRecent: 0,
          gapCountsByScope: Object.fromEntries(
            GOOGLE_ADS_RECENT_SELF_HEAL_SCOPES.map((scope) => [scope, 0])
          ) as Record<GoogleAdsWarehouseScope, number>,
        };
    void recentRepairPlan;
    const queueHealthAfterRecentPlanning = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
    const policyBeforeHistoricalRecovery = await getGoogleAdsIncidentPolicy({
      businessId,
      queueHealth: queueHealthAfterRecentPlanning,
    }).catch(() => null);
    const effectivePolicyBeforeHistoricalRecovery = applyGoogleAdsFullSyncPriorityPolicyOverride({
      policy: policyBeforeHistoricalRecovery,
      fullSyncPriorityRequired: fullSyncPriority.required,
    });
    if (effectivePolicyBeforeHistoricalRecovery) {
      await enqueueExtendedRecoveryPartitions({
        businessId,
        policy: effectivePolicyBeforeHistoricalRecovery,
        recent90Complete: recent90State?.complete ?? true,
        scopes: fullSyncPriority.required ? fullSyncPriority.targetScopes : undefined,
      }).catch(() => ({ queuedHistorical: 0 }));
    }

    hasReachedLeasing = true;
    if (hasLeaseConflict()) {
      return {
        businessId,
        attempted: 0,
        succeeded: 0,
        failed: 1,
        skipped: false,
        outcome: "consume_failed_before_leasing",
        failureReason: leaseConflictReason(),
      };
    }

    let partitions = await leaseGoogleAdsSyncPartitions({
      businessId,
      lane: "core",
      workerId,
      limit: GOOGLE_ADS_CORE_WORKER_LIMIT,
      leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
      startDate: historicalLeaseStartDate,
      endDate: fullSyncPriority.yesterday,
    }).catch(() => []);
    const queueHealthAfterCore = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
    const livePolicyAfterCore = await getGoogleAdsIncidentPolicy({
      businessId,
      queueHealth: queueHealthAfterCore,
    }).catch(() => null);
    const effectiveLivePolicyAfterCore = applyGoogleAdsFullSyncPriorityPolicyOverride({
      policy: livePolicyAfterCore,
      fullSyncPriorityRequired: fullSyncPriority.required,
    });
    const primaryLeasePlan = buildGoogleAdsPrimaryLeasePlan({
      policy: effectiveLivePolicyAfterCore,
      queueHealth: queueHealthAfterCore,
      fullSyncPriorityRequired: fullSyncPriority.required,
      fullSyncPriorityTargetScopes: fullSyncPriority.targetScopes,
      blockHistoricalExtendedWork,
      progressEvidence: laneProgressEvidence,
    });
    const historicalFairnessPartitions =
      primaryLeasePlan.historicalFairnessLimit > 0
        ? await leaseGoogleAdsSyncPartitions({
            businessId,
            lane: "extended",
            workerId,
            limit: primaryLeasePlan.historicalFairnessLimit,
            leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
            sourceFilter: "historical_only",
            scopeFilter: fullSyncPriority.required ? fullSyncPriority.targetScopes : undefined,
            startDate: historicalLeaseStartDate,
            endDate: fullSyncPriority.yesterday,
          }).catch(() => [])
        : [];
    partitions = [...partitions, ...historicalFairnessPartitions];
    const recentExtendedPartitions =
      primaryLeasePlan.recentRepairLimit > 0
        ? await leaseGoogleAdsSyncPartitions({
            businessId,
            lane: "extended",
            workerId,
            limit: primaryLeasePlan.recentRepairLimit,
            leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
            sourceFilter: "recent_only",
          }).catch(() => [])
        : [];
    partitions = [...partitions, ...recentExtendedPartitions];

    const fullSyncPriorityPartitions =
      primaryLeasePlan.fullSyncPriorityLimit > 0
        ? await leaseGoogleAdsSyncPartitions({
            businessId,
            lane: "extended",
            workerId,
            limit: primaryLeasePlan.fullSyncPriorityLimit,
            leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
            sourceFilter: "historical_only",
            scopeFilter: fullSyncPriority.targetScopes,
            startDate: historicalLeaseStartDate,
            endDate: fullSyncPriority.yesterday,
          }).catch(() => [])
        : [];
    partitions = [...partitions, ...fullSyncPriorityPartitions];

    const queueHealthAfterRecentLease = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
    const livePolicyAfterRecentLease = await getGoogleAdsIncidentPolicy({
      businessId,
      queueHealth: queueHealthAfterRecentLease,
    }).catch(() => null);
    const effectiveLivePolicyAfterRecentLease = applyGoogleAdsFullSyncPriorityPolicyOverride({
      policy: livePolicyAfterRecentLease,
      fullSyncPriorityRequired: fullSyncPriority.required,
    });
    const maintenanceLeasePlan = buildGoogleAdsMaintenanceLeasePlan({
      policy: effectiveLivePolicyAfterRecentLease,
      fullSyncPriorityRequired: fullSyncPriority.required,
    });
    const maintenancePartitions =
      maintenanceLeasePlan.maintenanceLimit > 0
        ? await leaseGoogleAdsSyncPartitions({
            businessId,
            lane: "maintenance",
            workerId,
            limit: maintenanceLeasePlan.maintenanceLimit,
            leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
          }).catch(() => [])
        : [];
    partitions = [...partitions, ...maintenancePartitions];
    const queueHealthAfterMaintenance = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
    const livePolicyAfterMaintenance = await getGoogleAdsIncidentPolicy({
      businessId,
      queueHealth: queueHealthAfterMaintenance,
    }).catch(() => null);
    const effectiveLivePolicyAfterMaintenance = applyGoogleAdsFullSyncPriorityPolicyOverride({
      policy: livePolicyAfterMaintenance,
      fullSyncPriorityRequired: fullSyncPriority.required,
    });

    if (partitions.length === 0) {
      const queueHealth = queueHealthAfterMaintenance;
      const livePolicy = effectiveLivePolicyAfterMaintenance;
      const fallbackLeasePlan = buildGoogleAdsFallbackExtendedLeasePlan({
        policy: livePolicy,
        fullSyncPriorityRequired: fullSyncPriority.required,
        fullSyncPriorityTargetScopes: fullSyncPriority.targetScopes,
        fullSyncPriorityYesterday: fullSyncPriority.yesterday,
        blockHistoricalExtendedWork,
        historicalLeaseStartDate,
      });
      if (fallbackLeasePlan) {
        partitions = await leaseGoogleAdsSyncPartitions({
          businessId,
          lane: "extended",
          workerId,
          limit: fallbackLeasePlan.limit,
          leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
          sourceFilter: fallbackLeasePlan.sourceFilter,
          scopeFilter: fallbackLeasePlan.scopeFilter,
          startDate: fallbackLeasePlan.startDate,
          endDate: fallbackLeasePlan.endDate,
        }).catch(() => []);
        if (partitions.length > 0 && livePolicy?.recoveryMode === "closed") {
          await enterProviderGlobalCircuitBreakerRecoveryState({
            provider: "google",
            businessId,
            message: "Google Ads extended sync is reopening in canary half-open mode.",
            cooldownMs: GOOGLE_ADS_CIRCUIT_BREAKER_BASE_MINUTES * 60_000,
          }).catch(() => null);
        }
      }
    }
    if (partitions.length === 0) {
      return {
        businessId,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: true,
        outcome: "skipped_no_partitions",
        failureReason: null,
      };
    }

    let attempted = partitions.length;
    let succeeded = 0;
    let failed = 0;
    for (const partition of partitions) {
      if (hasLeaseConflict()) {
        failed += 1;
        break;
      }
      const ok = await processGoogleAdsPartition({
        partition: {
          id: partition.id,
          businessId: partition.businessId,
          providerAccountId: partition.providerAccountId,
          lane: partition.lane,
          scope: partition.scope,
          partitionDate: partition.partitionDate,
          attemptCount: partition.attemptCount,
          source: partition.source,
        },
        workerId,
      });
      if (ok) succeeded++;
      else failed++;
    }

    let postBatchQueueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
    let livePolicyAfterBatch = await getGoogleAdsIncidentPolicy({
      businessId,
      queueHealth: postBatchQueueHealth,
    }).catch(() => null);
    livePolicyAfterBatch = applyGoogleAdsFullSyncPriorityPolicyOverride({
      policy: livePolicyAfterBatch,
      fullSyncPriorityRequired: fullSyncPriority.required,
    });
    const shouldBurstExtended =
      !hasLeaseConflict() &&
      partitions.every((partition) => partition.lane !== "extended") &&
      (postBatchQueueHealth?.extendedQueueDepth ?? 0) > 0 &&
      (postBatchQueueHealth?.coreQueueDepth ?? 0) <= GOOGLE_ADS_EXTENDED_CORE_BACKLOG_THRESHOLD &&
      (postBatchQueueHealth?.maintenanceLeasedPartitions ?? 0) === 0 &&
      !livePolicyAfterBatch?.suspendExtended;

    if (shouldBurstExtended) {
      const burstSourceFilter =
        blockHistoricalExtendedWork ||
        shouldLeaseGoogleAdsRecentRepair({
          policy: livePolicyAfterBatch,
          queueHealth: postBatchQueueHealth,
        }) ||
        livePolicyAfterBatch?.lanePolicy.extendedHistorical === "suspended"
          ? "recent_only"
          : "all";
      const extendedPartitions = await leaseGoogleAdsSyncPartitions({
        businessId,
        lane: "extended",
        workerId,
        limit:
          fullSyncPriority.required && !blockHistoricalExtendedWork
            ? Math.max(
                1,
                Math.min(
                  GOOGLE_ADS_EXTENDED_FULL_SYNC_PRIORITY_LIMIT,
                  getGoogleAdsHistoricalLeaseLimit({ policy: livePolicyAfterBatch })
                )
              )
            : burstSourceFilter === "recent_only"
            ? getGoogleAdsRecentRepairLeaseLimit({ policy: livePolicyAfterBatch })
            : GOOGLE_ADS_EXTENDED_BURST_WORKER_LIMIT,
        leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
        sourceFilter:
          blockHistoricalExtendedWork
            ? "recent_only"
            : fullSyncPriority.required
              ? "historical_only"
              : burstSourceFilter,
        scopeFilter:
          fullSyncPriority.required && !blockHistoricalExtendedWork
            ? fullSyncPriority.targetScopes
            : undefined,
        startDate:
          !blockHistoricalExtendedWork &&
          (fullSyncPriority.required || burstSourceFilter !== "recent_only")
            ? historicalLeaseStartDate
            : null,
        endDate:
          !blockHistoricalExtendedWork &&
          (fullSyncPriority.required || burstSourceFilter !== "recent_only")
            ? fullSyncPriority.yesterday
            : null,
      }).catch(() => []);

      attempted += extendedPartitions.length;
      for (const partition of extendedPartitions) {
        if (hasLeaseConflict()) {
          failed += 1;
          break;
        }
        const ok = await processGoogleAdsPartition({
          partition: {
            id: partition.id,
            businessId: partition.businessId,
            providerAccountId: partition.providerAccountId,
            lane: partition.lane,
            scope: partition.scope,
            partitionDate: partition.partitionDate,
            attemptCount: partition.attemptCount,
            source: partition.source,
          },
          workerId,
        });
        if (ok) succeeded++;
        else failed++;
      }

      postBatchQueueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
      livePolicyAfterBatch = await getGoogleAdsIncidentPolicy({
        businessId,
        queueHealth: postBatchQueueHealth,
      }).catch(() => null);
    }

    await refreshGoogleAdsSyncStateForBusiness({ businessId }).catch((error) => {
      console.warn("[google-ads-sync] state_refresh_after_run_failed", {
        businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return {
      businessId,
      attempted,
      succeeded,
      failed,
      skipped: attempted === 0,
      outcome:
        attempted === 0
          ? "skipped_no_partitions"
          : hasLeaseConflict() && succeeded === 0
            ? "consume_failed_after_leasing"
            : succeeded > 0
            ? "consume_completed_with_progress"
            : "consume_completed_without_progress",
      failureReason:
        hasLeaseConflict() && succeeded === 0
          ? leaseConflictReason()
          : failed > 0 && succeeded === 0
            ? "all_partition_attempts_failed"
            : null,
    };
  } catch (error) {
    return {
      businessId,
      attempted: 0,
      succeeded: 0,
      failed: 1,
      skipped: false,
      outcome: hasReachedLeasing
        ? "consume_failed_after_leasing"
        : "consume_failed_before_leasing",
      failureReason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    backgroundSyncKeys.delete(lockKey);
  }
}
