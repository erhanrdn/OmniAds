import {
  type MetaCredentials,
  resolveMetaCredentials,
  syncMetaAccountBreakdownWarehouseDay,
  syncMetaAccountCoreWarehouseDay,
} from "@/lib/api/meta";
import { syncMetaCreativesWarehouseDay } from "@/lib/meta/creatives-warehouse";
import {
  META_PRODUCT_CORE_PARTITION_SCOPE,
  META_CORE_PARTITION_SCOPES,
  META_EXTENDED_SCOPES,
  META_PRODUCT_CORE_COVERAGE_SCOPES,
  META_RUNTIME_STATE_SCOPES,
  isMetaProductCoreCoverageScope,
} from "@/lib/meta/core-config";
import {
  backfillMetaRunningRunsForTerminalPartition,
  cancelObsoleteMetaCoreScopePartitions,
  cleanupMetaPartitionOrchestration,
  completeMetaPartitionAttempt,
  createMetaSyncJob,
  createMetaSyncRun,
  expireStaleMetaSyncJobs,
  getMetaPartitionCompletionDenialSnapshot,
  getLatestRunningMetaSyncRunIdForPartition,
  getLatestMetaCheckpointForPartition,
  heartbeatMetaPartitionLease,
  getLatestMetaSyncHealth,
  getMetaAdDailyCoverage,
  getMetaAdSetDailyCoverage,
  getMetaAccountDailyCoverage,
  getMetaCampaignDailyCoverage,
  getMetaCreativeDailyCoverage,
  getMetaIncompleteCoreDates,
  getMetaDirtyRecentDates,
  getMetaPartitionStatesForDate,
  getMetaRecentAuthoritativeSliceGuard,
  getMetaQueueComposition,
  getMetaPartitionHealth,
  getMetaQueueHealth,
  getMetaRawSnapshotCoverageByEndpoint,
  getMetaSyncCheckpoint,
  getMetaSyncState,
  leaseMetaSyncPartitions,
  markMetaPartitionRunning,
  queueMetaSyncPartition,
  replayMetaDeadLetterPartitions,
  requeueMetaRetryableFailedPartitions,
  updateMetaSyncJob,
  updateMetaSyncRun,
  upsertMetaSyncState,
  upsertMetaSyncCheckpoint,
} from "@/lib/meta/warehouse";
import type {
  MetaDirtyRecentDateRow,
  MetaDirtyRecentSeverity,
  MetaSyncCheckpointRecord,
  MetaSyncLane,
  MetaSyncPartitionRecord,
  MetaSyncPartitionSource,
  MetaSyncType,
  MetaWarehouseScope,
} from "@/lib/meta/warehouse-types";
import {
  getCreativeMediaRetentionStart,
  META_WAREHOUSE_HISTORY_DAYS,
  dayCountInclusive,
} from "@/lib/meta/history";
import {
  buildProviderProgressEvidence,
  deriveProviderStallFingerprints,
  hasRecentProviderAdvancement,
  type ProviderLeasePlan,
  type ProviderProgressEvidence,
  type ProviderProgressEvidenceStateRow,
} from "@/lib/sync/provider-status-truth";
import type { RunnerLeaseGuard } from "@/lib/sync/worker-runtime";

const META_BREAKDOWN_ENDPOINTS = [
  "breakdown_age",
  "breakdown_country",
  "breakdown_publisher_platform,platform_position,impression_device",
] as const;

async function upsertMetaCheckpointOrThrow(input: MetaSyncCheckpointRecord) {
  const checkpointId = await upsertMetaSyncCheckpoint(input);
  if (input.leaseOwner && !checkpointId) {
    throw new Error("lease_conflict:checkpoint_write_rejected");
  }
  return checkpointId;
}

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MetaQueueVisibilityEvent =
  | "meta_background_sync_already_scheduled"
  | "meta_queue_present_no_runner_lease"
  | "meta_runner_lease_not_acquired"
  | "meta_queue_health";

export function logMetaQueueVisibility(
  event: MetaQueueVisibilityEvent,
  details: Record<string, unknown>,
) {
  console.info(`[meta-sync] ${event}`, details);
}

async function heartbeatMetaPartitionBeforeCompletion(input: {
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
  leaseMinutes: number;
}) {
  const ok = await heartbeatMetaPartitionLease({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    leaseMinutes: input.leaseMinutes,
  });
  return ok
    ? ({ ok: true } as const)
    : ({ ok: false, reason: "lease_conflict" } as const);
}

async function heartbeatMetaPartitionDuringOrchestrationOrThrow(input: {
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
  leaseMinutes: number;
}) {
  const ok = await heartbeatMetaPartitionLease({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    leaseMinutes: input.leaseMinutes,
  });
  if (!ok) {
    throw new Error("lease_conflict:lease_heartbeat_rejected");
  }
}

async function logMetaSuccessCompletionDenied(input: {
  partitionId: string;
  runId?: string | null;
  recoveredRunId?: string | null;
  workerId: string;
  leaseEpoch: number;
  lane: MetaSyncLane;
  scope: MetaWarehouseScope;
  partitionStatus: "succeeded" | "failed" | "dead_letter" | "cancelled";
  runStatus: "succeeded" | "failed" | "cancelled";
  reason: "lease_conflict" | "operational_error";
  message?: string | null;
}) {
  const [latestCheckpoint, denialSnapshot] = await Promise.all([
    getLatestMetaCheckpointForPartition({
      partitionId: input.partitionId,
    }).catch(() => null),
    getMetaPartitionCompletionDenialSnapshot({
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
    }).catch(() => null),
  ]);
  console.warn("[meta-sync] partition_success_completion_denied", {
    partitionId: input.partitionId,
    runId: input.runId ?? null,
    recoveredRunId: input.recoveredRunId ?? null,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    lane: input.lane,
    scope: input.scope,
    partitionStatus: input.partitionStatus,
    runStatusBefore: "running",
    runStatusAfter: input.runStatus,
    reason: input.reason,
    message: input.message ?? null,
    currentPartitionStatus: denialSnapshot?.currentPartitionStatus ?? null,
    currentLeaseOwner: denialSnapshot?.currentLeaseOwner ?? null,
    currentLeaseEpoch: denialSnapshot?.currentLeaseEpoch ?? null,
    currentLeaseExpiresAt: denialSnapshot?.currentLeaseExpiresAt ?? null,
    ownerMatchesCaller: denialSnapshot?.ownerMatchesCaller ?? null,
    epochMatchesCaller: denialSnapshot?.epochMatchesCaller ?? null,
    leaseExpiredAtObservation:
      denialSnapshot?.leaseExpiredAtObservation ?? null,
    currentPartitionFinishedAt:
      denialSnapshot?.currentPartitionFinishedAt ?? null,
    checkpointScope:
      denialSnapshot?.latestCheckpointScope ??
      latestCheckpoint?.checkpointScope ??
      null,
    checkpointPhase:
      denialSnapshot?.latestCheckpointPhase ?? latestCheckpoint?.phase ?? null,
    checkpointUpdatedAt:
      denialSnapshot?.latestCheckpointUpdatedAt ??
      latestCheckpoint?.updatedAt ??
      null,
    latestRunningRunId: denialSnapshot?.latestRunningRunId ?? null,
    runningRunCount: denialSnapshot?.runningRunCount ?? 0,
    denialClassification:
      denialSnapshot?.denialClassification ?? "unknown_denial",
  });
  return denialSnapshot;
}

async function backfillMetaDeniedTerminalRuns(input: {
  partitionId: string;
  runId?: string | null;
  recoveredRunId?: string | null;
  workerId: string;
  leaseEpoch: number;
  lane: MetaSyncLane;
  scope: MetaWarehouseScope;
  pathKind: "primary" | "backfill" | "repair";
}) {
  try {
    const result = await backfillMetaRunningRunsForTerminalPartition({
      partitionId: input.partitionId,
      runId: input.runId ?? null,
      recoveredRunId: input.recoveredRunId ?? null,
    });
    console.warn("[meta-sync] terminal_parent_running_runs_backfilled", {
      partitionId: input.partitionId,
      runId: input.runId ?? null,
      recoveredRunId: input.recoveredRunId ?? null,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      lane: input.lane,
      scope: input.scope,
      pathKind: input.pathKind,
      partitionStatus: result.partitionStatus,
      closedRunningRunCount: result.closedRunningRunCount,
      callerRunIdWasClosed: result.callerRunIdWasClosed,
      closedRunningRunIds: result.closedRunningRunIds,
    });
  } catch (error) {
    console.warn("[meta-sync] terminal_parent_running_runs_backfill_failed", {
      partitionId: input.partitionId,
      runId: input.runId ?? null,
      recoveredRunId: input.recoveredRunId ?? null,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      lane: input.lane,
      scope: input.scope,
      pathKind: input.pathKind,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function enqueueMetaExtendedPartitionsAfterSuccess(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  source: string;
}) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await enqueueMetaExtendedPartitionsForDate(input);
      return true;
    } catch (error) {
      if (attempt >= maxAttempts) {
        console.warn("[meta-sync] post_success_extended_enqueue_failed", {
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          source: input.source,
          attempts: attempt,
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
      await sleepMs(attempt * 250);
    }
  }
  return false;
}

async function backfillMetaRunTerminalState(input: {
  runId: string | null;
  recoveredRunId?: string | null;
  startedAtMs: number;
  status: "succeeded" | "failed" | "cancelled";
  errorClass?: string | null;
  errorMessage?: string | null;
  finishedAt: string;
  context: {
    partitionId: string;
    workerId: string;
    leaseEpoch: number;
    lane: MetaSyncLane;
    scope: MetaWarehouseScope;
  };
}) {
  if (!input.runId) return;
  console.warn("[meta-sync] partition_completion_run_backfill", {
    partitionId: input.context.partitionId,
    runId: input.runId,
    recoveredRunId: input.recoveredRunId ?? null,
    workerId: input.context.workerId,
    leaseEpoch: input.context.leaseEpoch,
    lane: input.context.lane,
    scope: input.context.scope,
    partitionStatus: input.status,
    runStatusBefore: "running",
    runStatusAfter: input.status,
    pathKind: "backfill",
  });
  await updateMetaSyncRun({
    id: input.runId,
    status: input.status,
    durationMs: Date.now() - input.startedAtMs,
    errorClass: input.errorClass ?? null,
    errorMessage: input.errorMessage ?? null,
    finishedAt: input.finishedAt,
    onlyIfCurrentStatus: "running",
  }).catch(() => null);
}

const META_DEPRECATED_SCOPE_REASONS: Partial<
  Record<MetaWarehouseScope, string>
> = {
  creative_daily:
    "creative_daily sync disabled after moving creative scoring to the live/snapshot path",
};

export function getDeprecatedMetaPartitionCancellationReason(
  scope: MetaWarehouseScope,
): string | null {
  return META_DEPRECATED_SCOPE_REASONS[scope] ?? null;
}

const META_CORE_SCOPES: MetaWarehouseScope[] = [
  ...META_PRODUCT_CORE_COVERAGE_SCOPES,
];
const META_CORE_PARTITION_QUEUE_SCOPES: MetaWarehouseScope[] = [
  ...META_CORE_PARTITION_SCOPES,
];
const META_EXTENDED_SCOPE_LIST: MetaWarehouseScope[] = [
  ...META_EXTENDED_SCOPES,
];
const META_STATE_SCOPES: MetaWarehouseScope[] = [...META_RUNTIME_STATE_SCOPES];

const runtimeSyncStore = globalThis as typeof globalThis & {
  __metaBackgroundSyncKeys?: Set<string>;
  __metaBackgroundWorkerTimers?: Map<string, ReturnType<typeof setTimeout>>;
};

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const META_BACKGROUND_LOOP_DELAY_MS = envNumber(
  "META_BACKGROUND_LOOP_DELAY_MS",
  5_000,
);
const META_CORE_WORKER_LIMIT = envNumber("META_CORE_WORKER_LIMIT", 4);
const META_CORE_FAIRNESS_WORKER_LIMIT = envNumber(
  "META_CORE_FAIRNESS_WORKER_LIMIT",
  1,
);
const META_EXTENDED_WORKER_LIMIT = envNumber("META_EXTENDED_WORKER_LIMIT", 2);
const META_EXTENDED_HISTORICAL_FAIRNESS_WORKER_LIMIT = envNumber(
  "META_EXTENDED_HISTORICAL_FAIRNESS_WORKER_LIMIT",
  1,
);
const META_MAINTENANCE_WORKER_LIMIT = envNumber(
  "META_MAINTENANCE_WORKER_LIMIT",
  2,
);
const META_PARTITION_LEASE_MINUTES = envNumber(
  "META_PARTITION_LEASE_MINUTES",
  15,
);
const META_PARTITION_MAX_ATTEMPTS = envNumber("META_PARTITION_MAX_ATTEMPTS", 6);
const META_ENQUEUE_BATCH_SIZE = envNumber("META_ENQUEUE_BATCH_SIZE", 25);
const META_HISTORICAL_ENQUEUE_DAYS_PER_RUN = envNumber(
  "META_HISTORICAL_ENQUEUE_DAYS_PER_RUN",
  21,
);
const META_RECENT_RECOVERY_DAYS = envNumber("META_RECENT_RECOVERY_DAYS", 14);
const META_RUN_PROGRESS_GRACE_MINUTES = envNumber(
  "META_RUN_PROGRESS_GRACE_MINUTES",
  3,
);
const META_STALE_RUN_CORE_MINUTES = envNumber(
  "META_STALE_RUN_CORE_MINUTES",
  12,
);
const META_STALE_RUN_MAINTENANCE_MINUTES = envNumber(
  "META_STALE_RUN_MAINTENANCE_MINUTES",
  15,
);
const META_STALE_RUN_EXTENDED_MINUTES = envNumber(
  "META_STALE_RUN_EXTENDED_MINUTES",
  25,
);
const META_IN_PROCESS_RUNTIME_ENABLED =
  process.env.META_ENABLE_IN_PROCESS_RUNTIME?.trim().toLowerCase() === "1" ||
  process.env.META_ENABLE_IN_PROCESS_RUNTIME?.trim().toLowerCase() === "true";

function canUseInProcessBackgroundScheduling() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.SYNC_WORKER_MODE === "1" &&
    META_IN_PROCESS_RUNTIME_ENABLED
  );
}

function getBackgroundSyncKeys() {
  if (!runtimeSyncStore.__metaBackgroundSyncKeys) {
    runtimeSyncStore.__metaBackgroundSyncKeys = new Set<string>();
  }
  return runtimeSyncStore.__metaBackgroundSyncKeys;
}

function getBackgroundWorkerTimers() {
  if (!runtimeSyncStore.__metaBackgroundWorkerTimers) {
    runtimeSyncStore.__metaBackgroundWorkerTimers = new Map();
  }
  return runtimeSyncStore.__metaBackgroundWorkerTimers;
}

function getTodayIsoForTimeZoneServer(timeZone: string): string {
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

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeMetaPartitionDate(value: string | Date) {
  if (value instanceof Date) return toIsoDate(value);
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return toIsoDate(parsed);
  throw new Error(`Invalid Meta partition date: ${value}`);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

const META_RECENT_SOURCE_SET = new Set([
  "finalize_day",
  "priority_window",
  "repair_recent_day",
  "yesterday",
  "today_observe",
  "today",
  "request_runtime",
  "recent",
  "recent_recovery",
  "manual_refresh",
  "core_success",
]);

const META_HISTORICAL_SOURCE_SET = new Set([
  "historical",
  "historical_recovery",
  "initial_connect",
]);

const META_PROGRESS_EVIDENCE_WINDOW_MINUTES = envNumber(
  "META_PROGRESS_EVIDENCE_WINDOW_MINUTES",
  20,
);

type MetaQueueHealth = Awaited<ReturnType<typeof getMetaQueueHealth>>;
type MetaLaneEvidence = Record<
  "core" | "extended_recent" | "extended_historical" | "maintenance",
  ProviderProgressEvidence
>;
type MetaStatesByScope = Partial<
  Record<MetaWarehouseScope, ProviderProgressEvidenceStateRow[]>
>;

export interface MetaFairnessLeasePlan {
  coreFairnessLimit: number;
  extendedHistoricalFairnessLimit: number;
}

export interface MetaFollowupLeasePlan {
  extendedRecentLimit: number;
  historicalCoreLimit: number;
  extendedHistoricalLimit: number;
}

export async function buildMetaWorkerLeasePlan(input: {
  businessId: string;
  leaseLimit: number;
}): Promise<ProviderLeasePlan> {
  const queueHealth = await getMetaQueueHealth({
    businessId: input.businessId,
  }).catch(() => null);
  const laneProgressEvidence = buildMetaLaneProgressEvidence({
    queueHealth,
  });
  const fairnessLeasePlan = buildMetaFairnessLeasePlan({
    queueHealth,
    laneProgressEvidence,
  });
  const followupLeasePlan = buildMetaFollowupLeasePlan({
    queueHealth,
    leasedCoreFairnessCount: 0,
    leasedExtendedHistoricalFairnessCount: 0,
  });
  const latestPartitionActivityAt =
    queueHealth?.latestCoreActivityAt ??
    queueHealth?.latestExtendedActivityAt ??
    queueHealth?.latestMaintenanceActivityAt ??
    null;
  return {
    kind: "meta_policy_lease_plan",
    requestedLimit: Math.max(1, input.leaseLimit),
    steps: [
      {
        key: "maintenance",
        lane: "maintenance",
        limit: META_MAINTENANCE_WORKER_LIMIT,
      },
      {
        key: "core_fairness",
        lane: "core",
        limit: fairnessLeasePlan.coreFairnessLimit,
      },
      {
        key: "extended_historical_fairness",
        lane: "extended",
        limit: fairnessLeasePlan.extendedHistoricalFairnessLimit,
        sources: ["historical", "historical_recovery", "initial_connect"],
      },
      {
        key: "extended_recent",
        lane: "extended",
        limit: followupLeasePlan.extendedRecentLimit,
        sources: [
          "recent",
          "recent_recovery",
          "repair_recent_day",
          "today_observe",
          "today",
          "priority_window",
          "finalize_day",
          "request_runtime",
          "manual_refresh",
        ],
      },
      {
        key: "historical_core",
        lane: "core",
        limit: followupLeasePlan.historicalCoreLimit,
      },
      {
        key: "extended_historical",
        lane: "extended",
        limit: followupLeasePlan.extendedHistoricalLimit,
        sources: ["historical", "historical_recovery", "initial_connect"],
      },
    ].filter((step) => step.limit > 0),
    maintenancePlan: {
      autoHealEnabled: true,
      enqueueScheduledWork: false,
    },
    fairnessInputs: {
      maintenanceLimit: META_MAINTENANCE_WORKER_LIMIT,
      coreFairnessLimit: fairnessLeasePlan.coreFairnessLimit,
      extendedHistoricalFairnessLimit:
        fairnessLeasePlan.extendedHistoricalFairnessLimit,
      extendedRecentLimit: followupLeasePlan.extendedRecentLimit,
    },
    progressEvidence: laneProgressEvidence.core,
    latestPartitionActivityAt,
    queueDepth: queueHealth?.queueDepth ?? 0,
    leasedPartitions: queueHealth?.leasedPartitions ?? 0,
    hasRepairableBacklog: (queueHealth?.retryableFailedPartitions ?? 0) > 0,
    staleRunPressure: 0,
    stallFingerprints: deriveProviderStallFingerprints({
      queueDepth: queueHealth?.queueDepth ?? 0,
      leasedPartitions: queueHealth?.leasedPartitions ?? 0,
      checkpointLagMinutes: null,
      latestPartitionActivityAt,
      blocked: (queueHealth?.deadLetterPartitions ?? 0) > 0,
      hasRepairableBacklog: (queueHealth?.retryableFailedPartitions ?? 0) > 0,
      progressEvidence: laneProgressEvidence.core,
      historicalBacklogDepth:
        (queueHealth?.historicalCoreQueueDepth ?? 0) +
        (queueHealth?.historicalCoreLeasedPartitions ?? 0) +
        (queueHealth?.extendedHistoricalQueueDepth ?? 0) +
        (queueHealth?.extendedHistoricalLeasedPartitions ?? 0),
      blockedReasonCodes:
        (queueHealth?.deadLetterPartitions ?? 0) > 0
          ? ["required_dead_letter_partitions"]
          : [],
    }),
  };
}

function isRecentMetaSource(source: string | null | undefined) {
  return META_RECENT_SOURCE_SET.has(String(source ?? ""));
}

function buildMetaSyntheticEvidenceState(
  activityAt: string | null | undefined,
) {
  if (!activityAt) return [];
  return [
    {
      latestBackgroundActivityAt: activityAt,
      updatedAt: activityAt,
    } satisfies ProviderProgressEvidenceStateRow,
  ];
}

export function buildMetaLaneProgressEvidence(input: {
  statesByScope?: MetaStatesByScope;
  queueHealth?: MetaQueueHealth | null;
}): MetaLaneEvidence {
  const statesByScope = input.statesByScope ?? {};
  const queueHealth = input.queueHealth ?? null;
  const coreStates = [
    ...(statesByScope.account_daily ?? []),
    ...(statesByScope.campaign_daily ?? []),
    ...buildMetaSyntheticEvidenceState(
      queueHealth?.latestCoreActivityAt ?? null,
    ),
  ];
  const extendedStates = [
    ...(statesByScope.creative_daily ?? []),
    ...(statesByScope.ad_daily ?? []),
    ...buildMetaSyntheticEvidenceState(
      queueHealth?.latestExtendedActivityAt ?? null,
    ),
  ];
  const maintenanceStates = buildMetaSyntheticEvidenceState(
    queueHealth?.latestMaintenanceActivityAt ?? null,
  );

  return {
    core: buildProviderProgressEvidence({
      states: coreStates,
      aggregation: "bottleneck",
      recentActivityWindowMinutes: META_PROGRESS_EVIDENCE_WINDOW_MINUTES,
    }),
    extended_recent: buildProviderProgressEvidence({
      states: extendedStates,
      aggregation: "latest",
      recentActivityWindowMinutes: META_PROGRESS_EVIDENCE_WINDOW_MINUTES,
    }),
    extended_historical: buildProviderProgressEvidence({
      states: extendedStates,
      aggregation: "bottleneck",
      recentActivityWindowMinutes: META_PROGRESS_EVIDENCE_WINDOW_MINUTES,
    }),
    maintenance: buildProviderProgressEvidence({
      states: maintenanceStates,
      aggregation: "latest",
      recentActivityWindowMinutes: META_PROGRESS_EVIDENCE_WINDOW_MINUTES,
    }),
  };
}

export function getMetaHistoricalCoreFairnessLimit(input: {
  queueHealth?: MetaQueueHealth | null;
  progressEvidence?: ProviderProgressEvidence | null;
  nowMs?: number;
}) {
  const queueHealth = input.queueHealth ?? null;
  const backlogExists =
    (queueHealth?.historicalCoreQueueDepth ?? 0) > 0 ||
    (queueHealth?.historicalCoreLeasedPartitions ?? 0) > 0;
  if (!backlogExists) return 0;
  const baseLimit = Math.min(
    META_CORE_WORKER_LIMIT,
    META_CORE_FAIRNESS_WORKER_LIMIT,
  );
  if (baseLimit <= 0) return 0;
  const hasRecentAdvancement = hasRecentProviderAdvancement({
    progressEvidence: input.progressEvidence ?? null,
    fallbackLatestPartitionActivityAt:
      queueHealth?.latestCoreActivityAt ?? null,
    nowMs: input.nowMs,
  });
  return hasRecentAdvancement
    ? baseLimit
    : Math.min(META_CORE_WORKER_LIMIT, baseLimit + 1);
}

export function getMetaExtendedHistoricalFairnessLimit(input: {
  queueHealth?: MetaQueueHealth | null;
  progressEvidence?: ProviderProgressEvidence | null;
  nowMs?: number;
}) {
  const queueHealth = input.queueHealth ?? null;
  const backlogExists =
    (queueHealth?.extendedHistoricalQueueDepth ?? 0) > 0 ||
    (queueHealth?.extendedHistoricalLeasedPartitions ?? 0) > 0;
  if (!backlogExists) return 0;
  const baseLimit = Math.min(
    META_EXTENDED_WORKER_LIMIT,
    META_EXTENDED_HISTORICAL_FAIRNESS_WORKER_LIMIT,
  );
  if (baseLimit <= 0) return 0;
  const hasRecentAdvancement = hasRecentProviderAdvancement({
    progressEvidence: input.progressEvidence ?? null,
    fallbackLatestPartitionActivityAt:
      queueHealth?.latestExtendedActivityAt ?? null,
    nowMs: input.nowMs,
  });
  return hasRecentAdvancement
    ? baseLimit
    : Math.min(META_EXTENDED_WORKER_LIMIT, baseLimit + 1);
}

export function buildMetaFairnessLeasePlan(input: {
  queueHealth?: MetaQueueHealth | null;
  laneProgressEvidence?: Partial<MetaLaneEvidence> | null;
  nowMs?: number;
}): MetaFairnessLeasePlan {
  return {
    coreFairnessLimit: getMetaHistoricalCoreFairnessLimit({
      queueHealth: input.queueHealth,
      progressEvidence: input.laneProgressEvidence?.core ?? null,
      nowMs: input.nowMs,
    }),
    extendedHistoricalFairnessLimit: getMetaExtendedHistoricalFairnessLimit({
      queueHealth: input.queueHealth,
      progressEvidence: input.laneProgressEvidence?.extended_historical ?? null,
      nowMs: input.nowMs,
    }),
  };
}

export function buildMetaFollowupLeasePlan(input: {
  queueHealth?: MetaQueueHealth | null;
  leasedCoreFairnessCount: number;
  leasedExtendedHistoricalFairnessCount: number;
  leasedExtendedRecentCount?: number;
}): MetaFollowupLeasePlan {
  const queueHealth = input.queueHealth ?? null;
  const hasMaintenanceBacklog =
    (queueHealth?.maintenanceQueueDepth ?? 0) > 0 ||
    (queueHealth?.maintenanceLeasedPartitions ?? 0) > 0;
  const hasExtendedRecentBacklog =
    (queueHealth?.extendedRecentQueueDepth ?? 0) > 0 ||
    (queueHealth?.extendedRecentLeasedPartitions ?? 0) > 0;
  const remainingExtendedCapacity = Math.max(
    0,
    META_EXTENDED_WORKER_LIMIT - input.leasedExtendedHistoricalFairnessCount,
  );
  const remainingExtendedHistoricalCapacity = Math.max(
    0,
    remainingExtendedCapacity - (input.leasedExtendedRecentCount ?? 0),
  );

  return {
    extendedRecentLimit: hasMaintenanceBacklog ? 0 : remainingExtendedCapacity,
    historicalCoreLimit: Math.max(
      0,
      META_CORE_WORKER_LIMIT - input.leasedCoreFairnessCount,
    ),
    extendedHistoricalLimit:
      hasMaintenanceBacklog || hasExtendedRecentBacklog
        ? 0
        : remainingExtendedHistoricalCapacity,
  };
}

function isHistoricalMetaSource(source: string | null | undefined) {
  return META_HISTORICAL_SOURCE_SET.has(String(source ?? ""));
}

function enumerateDays(
  startDate: string,
  endDate: string,
  recentFirst = false,
) {
  const rows: string[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    rows.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return recentFirst ? rows.reverse() : rows;
}

function getMetaReferenceToday(
  credentials: Awaited<ReturnType<typeof resolveMetaCredentials>>,
) {
  const primaryAccountId = credentials?.accountIds[0] ?? null;
  const primaryTimeZone =
    primaryAccountId &&
    credentials?.accountProfiles?.[primaryAccountId]?.timezone
      ? credentials.accountProfiles[primaryAccountId].timezone
      : null;
  return primaryTimeZone
    ? getTodayIsoForTimeZoneServer(primaryTimeZone)
    : toIsoDate(new Date());
}

function getMetaHistoricalWindow(
  credentials: Awaited<ReturnType<typeof resolveMetaCredentials>>,
) {
  const today = getMetaReferenceToday(credentials);
  const historicalEnd = addDays(new Date(`${today}T00:00:00Z`), -1);
  const historicalStart = addDays(
    historicalEnd,
    -(META_WAREHOUSE_HISTORY_DAYS - 1),
  );
  return {
    startDate: toIsoDate(historicalStart),
    endDate: toIsoDate(historicalEnd),
    today,
  };
}

type MetaRecentTargetWindow = {
  providerAccountId: string;
  today: string;
  d1: string;
  d2: string;
  d3: string;
  d7Start: string;
};

type MetaRecentAutoHealSummary = {
  accountsScanned: number;
  recentDaysScanned: number;
  dirtyDaysFound: number;
  oldestDirtyDate: string | null;
  finalizeEnqueued: number;
  repairEnqueued: number;
  skippedActiveDuplicate: number;
  skippedCooldown: number;
  skippedRecentSuccess: number;
  skippedRepeatedFailures: number;
  reasonCounts: Record<string, number>;
};

function emptyMetaRecentAutoHealSummary(): MetaRecentAutoHealSummary {
  return {
    accountsScanned: 0,
    recentDaysScanned: 0,
    dirtyDaysFound: 0,
    oldestDirtyDate: null,
    finalizeEnqueued: 0,
    repairEnqueued: 0,
    skippedActiveDuplicate: 0,
    skippedCooldown: 0,
    skippedRecentSuccess: 0,
    skippedRepeatedFailures: 0,
    reasonCounts: {},
  };
}

function buildMetaRecentTargetWindows(credentials: MetaCredentials) {
  return credentials.accountIds.map((providerAccountId) => {
    const timezone =
      credentials.accountProfiles?.[providerAccountId]?.timezone ?? "UTC";
    const today = getTodayIsoForTimeZoneServer(timezone);
    return {
      providerAccountId,
      today,
      d1: toIsoDate(addDays(new Date(`${today}T00:00:00Z`), -1)),
      d2: toIsoDate(addDays(new Date(`${today}T00:00:00Z`), -2)),
      d3: toIsoDate(addDays(new Date(`${today}T00:00:00Z`), -3)),
      d7Start: toIsoDate(addDays(new Date(`${today}T00:00:00Z`), -7)),
    } satisfies MetaRecentTargetWindow;
  });
}

function metaRecentDirtySeverityPriority(
  severity: MetaDirtyRecentSeverity,
) {
  switch (severity) {
    case "critical":
      return 3;
    case "high":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function metaRecentSourcePriority(source: MetaSyncPartitionSource) {
  switch (source) {
    case "finalize_day":
      return 3;
    case "repair_recent_day":
      return 2;
    case "today_observe":
      return 1;
    default:
      return 0;
  }
}

function mergeMetaDirtyRecentRows(
  rows: MetaDirtyRecentDateRow[],
): MetaDirtyRecentDateRow[] {
  const merged = new Map<string, MetaDirtyRecentDateRow>();
  for (const row of rows) {
    const key = `${row.providerAccountId}:${row.date}`;
    const existing = merged.get(key);
    if (!existing) {
      const reasons = Array.from(new Set(row.reasons));
      merged.set(key, {
        ...row,
        reasons,
        breakdownOnly:
          reasons.length > 0 &&
          reasons.every((reason) => reason === "missing_breakdown"),
      });
      continue;
    }
    const mergedReasons = Array.from(new Set([...existing.reasons, ...row.reasons]));
    merged.set(key, {
      providerAccountId: row.providerAccountId,
      date: row.date,
      severity:
        metaRecentDirtySeverityPriority(row.severity) >
        metaRecentDirtySeverityPriority(existing.severity)
          ? row.severity
          : existing.severity,
      reasons: mergedReasons,
      breakdownOnly:
        mergedReasons.length > 0 &&
        mergedReasons.every((reason) => reason === "missing_breakdown"),
      nonFinalized: Boolean(existing.nonFinalized || row.nonFinalized),
      validationFailed: Boolean(
        existing.validationFailed || row.validationFailed,
      ),
      coverageMissing: Boolean(existing.coverageMissing || row.coverageMissing),
      spendDrift: Boolean(existing.spendDrift || row.spendDrift),
    });
  }
  return Array.from(merged.values()).sort((left, right) =>
    `${right.date}:${left.providerAccountId}`.localeCompare(
      `${left.date}:${right.providerAccountId}`,
    ),
  );
}

function classifyMetaRecentAction(input: {
  target: MetaRecentTargetWindow;
  dirty: MetaDirtyRecentDateRow;
}): MetaSyncPartitionSource | null {
  if (input.dirty.date === input.target.d1) return "finalize_day";
  const breakdownOnly =
    input.dirty.reasons.length > 0 &&
    input.dirty.reasons.every((reason) => reason === "missing_breakdown");
  if (input.dirty.date === input.target.d2) {
    if (breakdownOnly) return null;
    return input.dirty.severity === "critical"
      ? "finalize_day"
      : "repair_recent_day";
  }
  if (input.dirty.date === input.target.d3) {
    return breakdownOnly ? "repair_recent_day" : "repair_recent_day";
  }
  if (breakdownOnly) {
    return "repair_recent_day";
  }
  return "repair_recent_day";
}

function getMetaWorkerId() {
  const overridden = process.env.META_WORKER_ID?.trim();
  if (overridden) return overridden;
  return `meta-worker:${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
}

function classifyMetaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("rate limit") ||
    lower.includes("too many calls") ||
    lower.includes("quota") ||
    lower.includes("user request limit reached")
  ) {
    return { errorClass: "quota", terminal: false, retryDelayMinutes: 10 };
  }
  if (
    lower.includes("invalid oauth") ||
    lower.includes("access token") ||
    lower.includes("session has expired")
  ) {
    return {
      errorClass: "invalid_token",
      terminal: true,
      retryDelayMinutes: 0,
    };
  }
  if (
    lower.includes("permission") ||
    lower.includes("not authorized") ||
    lower.includes("does not have") ||
    lower.includes("unsupported get request")
  ) {
    return { errorClass: "permission", terminal: true, retryDelayMinutes: 0 };
  }
  if (
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("abort") ||
    lower.includes("aborted") ||
    lower.includes("fetch failed")
  ) {
    return { errorClass: "transient", terminal: false, retryDelayMinutes: 3 };
  }
  if (lower.includes("invalid parameter") || lower.includes("malformed")) {
    return { errorClass: "payload", terminal: true, retryDelayMinutes: 0 };
  }
  return { errorClass: "transient", terminal: false, retryDelayMinutes: 5 };
}

function computeRetryDelayMinutes(
  partition: { attemptCount: number },
  baseMinutes: number,
) {
  return Math.min(
    60,
    baseMinutes * Math.max(1, 2 ** Math.max(0, partition.attemptCount - 1)),
  );
}

export interface MetaSyncResult {
  businessId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
  outcome?: "consume_failed_before_leasing" | "consume_failed_after_leasing";
  failureReason?: string | null;
}

async function getMetaWarehouseWindowCompletion(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const totalDays = dayCountInclusive(input.startDate, input.endDate);
  const [accountCoverage, campaignCoverage] = await Promise.all([
    getMetaAccountDailyCoverage({
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
    getMetaCampaignDailyCoverage({
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
  ]);
  const completedDays = Math.min(
    accountCoverage?.completed_days ?? 0,
    campaignCoverage?.completed_days ?? 0,
  );
  return {
    totalDays,
    completedDays,
    complete: completedDays >= totalDays,
  };
}

async function getMetaDailyCoverageState(input: {
  businessId: string;
  day: string;
}) {
  const [accountCoverage, campaignCoverage, creativeCoverage] =
    await Promise.all([
      getMetaAccountDailyCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
      getMetaCampaignDailyCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
      getMetaAdDailyCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
    ]);

  const productCoreComplete =
    (accountCoverage?.completed_days ?? 0) >= 1 &&
    (campaignCoverage?.completed_days ?? 0) >= 1;
  const creativesComplete = (creativeCoverage?.completed_days ?? 0) >= 1;

  return {
    productCoreComplete,
    creativesComplete,
  };
}

async function syncMetaPartitionDay(input: {
  credentials: MetaCredentials;
  businessId: string;
  providerAccountId: string;
  day: string;
  source: string;
  scopes: MetaWarehouseScope[];
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
  attemptCount: number;
}) {
  const normalizedDay = normalizeMetaPartitionDate(input.day);
  const credentials = input.credentials;
  if (!credentials?.accountIds?.length) {
    throw new Error("Meta credentials are not available for this business.");
  }
  const assignedAccountIds = credentials.accountIds;
  const coverageState = await getMetaDailyCoverageState({
    businessId: input.businessId,
    day: normalizedDay,
  });
  const beforeCoverage = coverageState;
  const sourceTodayWindow = normalizedDay === getMetaReferenceToday(credentials);
  const authoritativeHistoricalSource = new Set([
    "yesterday",
    "finalize_day",
    "repair_recent_day",
    "priority_window",
    "manual_refresh",
    "recent",
    "recent_recovery",
  ]);
  const truthState =
    sourceTodayWindow && !authoritativeHistoricalSource.has(input.source)
      ? "provisional"
      : "finalized";
  const freshStart =
    truthState === "finalized" &&
    authoritativeHistoricalSource.has(input.source);

  if (
    input.scopes.some((scope) => isMetaProductCoreCoverageScope(scope)) &&
    !coverageState.productCoreComplete
  ) {
    const bulkResult = await syncMetaAccountCoreWarehouseDay({
      credentials,
      accountId: input.providerAccountId,
      day: normalizedDay,
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      attemptCount: input.attemptCount + 1,
      leaseMinutes: META_PARTITION_LEASE_MINUTES,
      freshStart,
      truthState,
      sourceRunId: input.partitionId,
    });
    if (bulkResult.memoryInstrumentation?.oversizeWarning) {
      console.warn("[meta-sync] oversized_partition_detected", {
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        day: normalizedDay,
        maxHeapUsedBytes: bulkResult.memoryInstrumentation.maxHeapUsedBytes,
        maxRowsBuffered: bulkResult.memoryInstrumentation.maxRowsBuffered,
        flushThresholdRows: bulkResult.memoryInstrumentation.flushThresholdRows,
      });
    }
    const breakdownJobs = [
      {
        breakdowns: "age,gender",
        endpointName: "breakdown_age",
      },
      {
        breakdowns: "country",
        endpointName: "breakdown_country",
      },
      {
        breakdowns: "publisher_platform,platform_position,impression_device",
        endpointName:
          "breakdown_publisher_platform,platform_position,impression_device",
      },
    ];
    for (const breakdownJob of breakdownJobs) {
      try {
        await syncMetaAccountBreakdownWarehouseDay({
          credentials,
          accountId: input.providerAccountId,
          day: normalizedDay,
          partitionId: input.partitionId,
          workerId: input.workerId,
          leaseEpoch: input.leaseEpoch,
          attemptCount: input.attemptCount + 1,
          breakdowns: breakdownJob.breakdowns,
          endpointName: breakdownJob.endpointName,
          positiveSpendAdIds: bulkResult.positiveSpendAdIds,
          leaseMinutes: META_PARTITION_LEASE_MINUTES,
        });
      } catch (error) {
        await upsertMetaCheckpointOrThrow({
          partitionId: input.partitionId,
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          checkpointScope: `breakdown:${breakdownJob.breakdowns}`,
          phase: "fetch_raw",
          status: "failed",
          pageIndex: 0,
          nextPageUrl: null,
          providerCursor: null,
          rowsFetched: 0,
          rowsWritten: 0,
          lastSuccessfulEntityKey: null,
          lastResponseHeaders: {},
          attemptCount: input.attemptCount + 1,
          leaseEpoch: input.leaseEpoch,
          leaseOwner: input.workerId,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        }).catch(() => null);
        console.warn("[meta-sync] breakdown_sync_failed_non_blocking", {
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          partitionDate: normalizedDay,
          breakdowns: breakdownJob.breakdowns,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      await heartbeatMetaPartitionDuringOrchestrationOrThrow({
        partitionId: input.partitionId,
        workerId: input.workerId,
        leaseEpoch: input.leaseEpoch,
        leaseMinutes: META_PARTITION_LEASE_MINUTES,
      });
    }
    await heartbeatMetaPartitionDuringOrchestrationOrThrow({
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      leaseMinutes: META_PARTITION_LEASE_MINUTES,
    });
  }

  if (input.scopes.includes("creative_daily")) {
    if (!coverageState.creativesComplete) {
      await syncMetaCreativesWarehouseDay({
        businessId: input.businessId,
        day: normalizedDay,
        accessToken: credentials.accessToken,
        assignedAccountIds,
        mediaMode:
          input.day >=
          getCreativeMediaRetentionStart(getMetaReferenceToday(credentials))
            ? "full"
            : "metadata",
      });
    }
  }

  const afterCoverage = await getMetaDailyCoverageState({
    businessId: input.businessId,
    day: normalizedDay,
  });

  console.info("[meta-sync] partition_day_result", {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    partitionDate: normalizedDay,
    scopes: input.scopes,
    sourceTodayWindow: normalizedDay === getMetaReferenceToday(credentials),
    truthState,
    source: input.source,
    productCoreCompleteBefore: beforeCoverage.productCoreComplete,
    productCoreCompleteAfter: afterCoverage.productCoreComplete,
    creativesCompleteBefore: beforeCoverage.creativesComplete,
    creativesCompleteAfter: afterCoverage.creativesComplete,
  });
}

function logMetaRunObservability(input: {
  event:
    | "run_row_created"
    | "run_id_attached_to_execution_context"
    | "latest_running_run_lookup_result"
    | "completion_attempt_started";
  partitionId: string;
  runId?: string | null;
  recoveredRunId?: string | null;
  workerId: string;
  leaseEpoch: number;
  lane: MetaSyncLane;
  scope: MetaWarehouseScope;
  partitionStatus: string;
  runStatusBefore?: string | null;
  runStatusAfter?: string | null;
  pathKind: "primary" | "backfill" | "repair";
}) {
  console.info(`[meta-sync] ${input.event}`, {
    partitionId: input.partitionId,
    runId: input.runId ?? null,
    recoveredRunId: input.recoveredRunId ?? null,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    lane: input.lane,
    scope: input.scope,
    partitionStatus: input.partitionStatus,
    runStatusBefore: input.runStatusBefore ?? null,
    runStatusAfter: input.runStatusAfter ?? null,
    pathKind: input.pathKind,
  });
}

async function enqueueMetaDates(input: {
  businessId: string;
  accountIds: string[];
  dates: string[];
  triggerSource: string;
  lane: MetaSyncLane;
  scopes: MetaWarehouseScope[];
  priority: number;
}) {
  if (input.accountIds.length === 0) return 0;
  let queued = 0;

  const workItems = input.accountIds.flatMap((providerAccountId) =>
    input.dates.flatMap((date) =>
      input.scopes.map((scope) => ({
        businessId: input.businessId,
        providerAccountId,
        lane: input.lane,
        scope,
        partitionDate: normalizeMetaPartitionDate(date),
        status: "queued" as const,
        priority: input.priority,
        source: input.triggerSource,
        attemptCount: 0,
      })),
    ),
  );

  for (
    let index = 0;
    index < workItems.length;
    index += META_ENQUEUE_BATCH_SIZE
  ) {
    const rows = await Promise.all(
      workItems
        .slice(index, index + META_ENQUEUE_BATCH_SIZE)
        .map((item) => queueMetaSyncPartition(item).catch(() => null)),
    );
    for (const row of rows) {
      if (row?.id && row.status === "queued") queued += 1;
    }
  }

  return queued;
}

export function resolveMetaHistoricalReplaySource(
  partitionStates: Map<
    string,
    {
      status: string;
      source: string;
      finishedAt: string | null;
    }
  >,
) {
  const states = Array.from(partitionStates.values()).map(
    (value) => value.status,
  );
  if (
    states.some((status) => ["queued", "leased", "running"].includes(status))
  ) {
    return null;
  }
  if (
    states.some((status) =>
      ["succeeded", "failed", "dead_letter", "cancelled"].includes(status),
    )
  ) {
    return "historical_recovery" as const;
  }
  return "historical" as const;
}

async function enqueueMetaHistoricalCorePartitions(
  businessId: string,
  credentials: MetaCredentials,
  maxDates = META_HISTORICAL_ENQUEUE_DAYS_PER_RUN,
) {
  if (!credentials?.accountIds?.length) return 0;
  const { startDate, endDate } = getMetaHistoricalWindow(credentials);
  const historicalReplayEnd = toIsoDate(
    addDays(new Date(`${endDate}T00:00:00Z`), -META_RECENT_RECOVERY_DAYS),
  );
  if (historicalReplayEnd < startDate) return 0;
  const completion = await getMetaWarehouseWindowCompletion({
    businessId,
    startDate,
    endDate: historicalReplayEnd,
  }).catch(() => null);
  if (completion?.complete) return 0;
  let queued = 0;

  for (const providerAccountId of credentials.accountIds) {
    const incompleteDates = await getMetaIncompleteCoreDates({
      businessId,
      providerAccountId,
      startDate,
      endDate: historicalReplayEnd,
      limit: Math.max(1, maxDates),
    }).catch(() => []);

    const historicalDates: string[] = [];
    const historicalRecoveryDates: string[] = [];

    for (const date of incompleteDates) {
      const partitionStates = await getMetaPartitionStatesForDate({
        businessId,
        providerAccountId,
        lane: "core",
        partitionDate: date,
        scopes: META_CORE_PARTITION_QUEUE_SCOPES,
      }).catch(() => new Map());
      const triggerSource = resolveMetaHistoricalReplaySource(partitionStates);
      if (triggerSource === "historical_recovery") {
        historicalRecoveryDates.push(date);
      } else if (triggerSource === "historical") {
        historicalDates.push(date);
      }
    }

    if (historicalDates.length > 0) {
      queued += await enqueueMetaDates({
        businessId,
        accountIds: [providerAccountId],
        dates: historicalDates,
        triggerSource: "historical",
        lane: "core",
        scopes: META_CORE_PARTITION_QUEUE_SCOPES,
        priority: 20,
      });
    }

    if (historicalRecoveryDates.length > 0) {
      queued += await enqueueMetaDates({
        businessId,
        accountIds: [providerAccountId],
        dates: historicalRecoveryDates,
        triggerSource: "historical_recovery",
        lane: "core",
        scopes: META_CORE_PARTITION_QUEUE_SCOPES,
        priority: 25,
      });
    }
  }

  return queued;
}

async function enqueueMetaMaintenancePartitions(
  businessId: string,
  credentials: MetaCredentials,
) {
  if (!credentials?.accountIds?.length) return 0;
  const targets = buildMetaRecentTargetWindows(credentials);
  const allRecentDates = new Set<string>();
  const narrowSlowPathDates = new Set<string>();
  const targetByAccountId = new Map<string, MetaRecentTargetWindow>();
  const summary = emptyMetaRecentAutoHealSummary();
  summary.accountsScanned = targets.length;

  for (const target of targets) {
    targetByAccountId.set(target.providerAccountId, target);
    allRecentDates.add(target.d1);
    allRecentDates.add(target.d2);
    allRecentDates.add(target.d3);
    narrowSlowPathDates.add(target.d1);
    for (const date of enumerateDays(target.d7Start, target.d1, false)) {
      allRecentDates.add(date);
    }
  }

  const narrowDates = Array.from(narrowSlowPathDates).sort();
  const widerDates = Array.from(allRecentDates).sort();
  const narrowDirtyRows =
    narrowDates.length > 0
      ? await getMetaDirtyRecentDates({
          businessId,
          startDate: narrowDates[0],
          endDate: narrowDates[narrowDates.length - 1],
          slowPathDates: narrowDates,
        }).catch(() => [])
      : [];
  const widerDirtyRows =
    widerDates.length > 0
      ? await getMetaDirtyRecentDates({
          businessId,
          startDate: widerDates[0],
          endDate: widerDates[widerDates.length - 1],
        }).catch(() => [])
      : [];
  const dirtyRows = mergeMetaDirtyRecentRows([...narrowDirtyRows, ...widerDirtyRows]);
  summary.recentDaysScanned = targets.length * 7;
  summary.dirtyDaysFound = dirtyRows.length;
  summary.oldestDirtyDate =
    dirtyRows.length > 0
      ? dirtyRows.reduce(
          (oldest, row) => (oldest == null || row.date < oldest ? row.date : oldest),
          null as string | null,
        )
      : null;

  const dirtyBySlice = new Map<string, MetaDirtyRecentDateRow>();
  for (const row of dirtyRows) {
    dirtyBySlice.set(`${row.providerAccountId}:${row.date}`, row);
    for (const reason of row.reasons) {
      summary.reasonCounts[reason] = (summary.reasonCounts[reason] ?? 0) + 1;
    }
  }

  const enqueueAuthoritativeSlice = async (
    providerAccountId: string,
    date: string,
    source: MetaSyncPartitionSource,
    dirty?: MetaDirtyRecentDateRow | null,
  ) => {
    const guard = await getMetaRecentAuthoritativeSliceGuard({
      businessId,
      providerAccountId,
      date,
      source,
    }).catch(() => null);
    if (
      guard?.activeAuthoritativeSource &&
      guard.activeAuthoritativePriority >= metaRecentSourcePriority(source)
    ) {
      summary.skippedActiveDuplicate += 1;
      return 0;
    }
    if (guard?.repeatedFailures24h && guard.repeatedFailures24h >= 3) {
      summary.skippedRepeatedFailures += 1;
      summary.reasonCounts.repeated_failures_skip =
        (summary.reasonCounts.repeated_failures_skip ?? 0) + 1;
      console.warn("[meta-sync] stuck_dirty_day", {
        businessId,
        providerAccountId,
        date,
        source,
        repeatedFailures24h: guard.repeatedFailures24h,
      });
      return 0;
    }
    if (guard?.lastSameSourceSuccessAt && dirty?.severity !== "critical") {
      summary.skippedRecentSuccess += 1;
      return 0;
    }
    if (guard?.lastSameSourceAttemptAt) {
      summary.skippedCooldown += 1;
      return 0;
    }
    const queued = await enqueueMetaDates({
      businessId,
      accountIds: [providerAccountId],
      dates: [date],
      triggerSource: source,
      lane: "maintenance",
      scopes: META_CORE_PARTITION_QUEUE_SCOPES,
      priority: source === "finalize_day" ? 80 : 65,
    });
    if (queued > 0) {
      if (source === "finalize_day") {
        summary.finalizeEnqueued += queued;
      } else {
        summary.repairEnqueued += queued;
      }
    }
    return queued;
  };

  let queued = 0;
  for (const target of targets) {
    queued += await enqueueAuthoritativeSlice(
      target.providerAccountId,
      target.d1,
      "finalize_day",
    );
  }

  for (const target of targets) {
    for (const date of [target.d2, target.d3]) {
      const dirty = dirtyBySlice.get(`${target.providerAccountId}:${date}`);
      if (!dirty) continue;
      const action = classifyMetaRecentAction({ target, dirty });
      if (!action) continue;
      queued += await enqueueAuthoritativeSlice(
        target.providerAccountId,
        date,
        action,
        dirty,
      );
    }
    for (const date of enumerateDays(target.d7Start, target.d1, false)) {
      if (date === target.d1 || date === target.d2 || date === target.d3) continue;
      const dirty = dirtyBySlice.get(`${target.providerAccountId}:${date}`);
      if (!dirty) continue;
      const action = classifyMetaRecentAction({ target, dirty });
      if (!action) continue;
      queued += await enqueueAuthoritativeSlice(
        target.providerAccountId,
        date,
        action,
        dirty,
      );
    }
  }

  const todayTargets = new Set(targets.map((target) => `${target.providerAccountId}:${target.today}`));
  for (const pair of todayTargets) {
    const [providerAccountId, date] = pair.split(":");
    queued += await enqueueMetaDates({
      businessId,
      accountIds: [providerAccountId],
      dates: [date],
      triggerSource: "today_observe",
      lane: "maintenance",
      scopes: META_CORE_PARTITION_QUEUE_SCOPES,
      priority: 60,
    });
  }

  console.info("[meta-sync] recent_auto_heal_summary", {
    businessId,
    ...summary,
  });

  return {
    queued,
    recentAutoHeal: summary,
  };
}

export async function enqueueMetaScheduledWork(businessId: string) {
  const credentials = await resolveMetaCredentials(businessId).catch(
    () => null,
  );
  let queuedCore = 0;
  let queuedMaintenance = 0;
  let queueDepth = 0;
  let leasedPartitions = 0;
  let recentAutoHeal = emptyMetaRecentAutoHealSummary();

  const cancelledObsoletePartitions =
    await cancelObsoleteMetaCoreScopePartitions({
      businessId,
      canonicalScope: META_PRODUCT_CORE_PARTITION_SCOPE,
    }).catch(() => []);

  if (credentials?.accountIds?.length) {
    const queueHealth = await getMetaQueueHealth({ businessId }).catch(
      () => null,
    );
    queueDepth = queueHealth?.queueDepth ?? 0;
    leasedPartitions = queueHealth?.leasedPartitions ?? 0;
    const hasHistoricalCoreBacklog =
      (queueHealth?.historicalCoreQueueDepth ?? 0) > 0 ||
      (queueHealth?.historicalCoreLeasedPartitions ?? 0) > 0;
    const hasMaintenanceBacklog =
      (queueHealth?.maintenanceQueueDepth ?? 0) > 0 ||
      (queueHealth?.maintenanceLeasedPartitions ?? 0) > 0;

    await refreshMetaSyncStateForBusiness({ businessId, credentials }).catch(
      () => null,
    );
    if (!hasHistoricalCoreBacklog) {
      queuedCore = await enqueueMetaHistoricalCorePartitions(
        businessId,
        credentials,
      ).catch(() => 0);
    }
    if (!hasMaintenanceBacklog) {
      const maintenanceResult = await enqueueMetaMaintenancePartitions(
        businessId,
        credentials,
      ).catch(() => 0);
      if (typeof maintenanceResult === "number") {
        queuedMaintenance = maintenanceResult;
      } else {
        queuedMaintenance = maintenanceResult.queued;
        recentAutoHeal = maintenanceResult.recentAutoHeal;
      }
    }
  }

  return {
    businessId,
    queuedCore,
    queuedMaintenance,
    queueDepth,
    leasedPartitions,
    recentAutoHeal,
    cancelledObsoletePartitions: cancelledObsoletePartitions.length,
  };
}

async function enqueueMetaExtendedPartitionsForDate(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  source: string;
}) {
  const normalizedSource = isHistoricalMetaSource(input.source)
    ? "historical_recovery"
    : "recent_recovery";
  const existingPartitions = await getMetaPartitionStatesForDate({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    lane: "extended",
    partitionDate: input.date,
    scopes: META_EXTENDED_SCOPE_LIST,
  });
  for (const scope of META_EXTENDED_SCOPE_LIST) {
    const existing = existingPartitions.get(scope);
    if (
      existing &&
      (["queued", "leased", "running", "succeeded"].includes(existing.status) ||
        (normalizedSource === "recent_recovery" &&
          ["failed", "dead_letter", "cancelled"].includes(existing.status) &&
          isRecentMetaSource(existing.source)))
    ) {
      continue;
    }
    await queueMetaSyncPartition({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      lane: "extended",
      scope,
      partitionDate: input.date,
      status: "queued",
      priority: normalizedSource === "recent_recovery" ? 55 : 15,
      source: normalizedSource,
      attemptCount: 0,
    });
  }
}

export async function refreshMetaSyncStateForBusiness(input: {
  businessId: string;
  credentials?: MetaCredentials | null;
}) {
  const credentials =
    input.credentials ??
    (await resolveMetaCredentials(input.businessId).catch(() => null));
  if (!credentials?.accountIds?.length) return;
  const { startDate, endDate } = getMetaHistoricalWindow(credentials);

  await Promise.all(
    credentials.accountIds.flatMap((providerAccountId) =>
      META_STATE_SCOPES.map(async (scope) => {
        const coverage =
          scope === "account_daily"
            ? await getMetaAccountDailyCoverage({
                businessId: input.businessId,
                providerAccountId,
                startDate,
                endDate,
              }).catch(() => null)
            : scope === "campaign_daily"
              ? await getMetaCampaignDailyCoverage({
                  businessId: input.businessId,
                  providerAccountId,
                  startDate,
                  endDate,
                }).catch(() => null)
              : scope === "adset_daily"
                ? await getMetaAdSetDailyCoverage({
                    businessId: input.businessId,
                    providerAccountId,
                    startDate,
                    endDate,
                  }).catch(() => null)
                : scope === "creative_daily"
                  ? await getMetaCreativeDailyCoverage({
                      businessId: input.businessId,
                      providerAccountId,
                      startDate,
                      endDate,
                    }).catch(() => null)
                  : await getMetaAdDailyCoverage({
                      businessId: input.businessId,
                      providerAccountId,
                      startDate,
                      endDate,
                    }).catch(() => null);

        const partitionHealth = await getMetaPartitionHealth({
          businessId: input.businessId,
          providerAccountId,
          scope,
        }).catch(() => null);

        await upsertMetaSyncState({
          businessId: input.businessId,
          providerAccountId,
          scope,
          historicalTargetStart: startDate,
          historicalTargetEnd: endDate,
          effectiveTargetStart: startDate,
          effectiveTargetEnd: endDate,
          readyThroughDate: coverage?.ready_through_date ?? null,
          lastSuccessfulPartitionDate: coverage?.ready_through_date ?? null,
          latestBackgroundActivityAt:
            partitionHealth?.latestActivityAt ??
            coverage?.latest_updated_at ??
            null,
          latestSuccessfulSyncAt: coverage?.latest_updated_at ?? null,
          completedDays: coverage?.completed_days ?? 0,
          deadLetterCount: partitionHealth?.deadLetterPartitions ?? 0,
        }).catch(() => null);
      }),
    ),
  );
}

export function scheduleMetaBackgroundSync(input: {
  businessId: string;
  delayMs?: number;
}) {
  if (!canUseInProcessBackgroundScheduling()) return false;
  const backgroundSyncKeys = getBackgroundSyncKeys();
  const timers = getBackgroundWorkerTimers();
  const key = input.businessId;
  if (backgroundSyncKeys.has(key)) {
    logMetaQueueVisibility("meta_background_sync_already_scheduled", {
      businessId: input.businessId,
      delayMs: Math.max(0, input.delayMs ?? 0),
      source: "schedule",
    });
    return false;
  }
  backgroundSyncKeys.add(key);
  const timer = setTimeout(
    () => {
      timers.delete(key);
      void syncMetaReports(input.businessId)
        .catch((error) => {
          console.warn("[meta-sync] background_run_failed", {
            businessId: input.businessId,
            message: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          backgroundSyncKeys.delete(key);
        });
    },
    Math.max(0, input.delayMs ?? 0),
  );
  timers.set(key, timer);
  return true;
}

async function cancelDeprecatedMetaPartition(input: {
  partition: {
    id: string;
    businessId: string;
    providerAccountId: string;
    lane: MetaSyncLane;
    scope: MetaWarehouseScope;
    partitionDate: string;
    attemptCount: number;
    leaseEpoch: number;
    source: string;
  };
  workerId: string;
  runId: string | null;
  recoveredRunId?: string | null;
  startedAtMs: number;
  reason: string;
}) {
  const cancelledAt = new Date().toISOString();
  const checkpoint = await getMetaSyncCheckpoint({
    partitionId: input.partition.id,
    checkpointScope: input.partition.scope,
    runId: input.runId ?? input.partition.id,
  }).catch(() => null);

  if (checkpoint) {
    await upsertMetaCheckpointOrThrow({
      partitionId: input.partition.id,
      businessId: input.partition.businessId,
      providerAccountId: input.partition.providerAccountId,
      checkpointScope: input.partition.scope,
      phase: "finalize",
      status: "cancelled",
      pageIndex: checkpoint.pageIndex,
      nextPageUrl: null,
      providerCursor: null,
      rowsFetched: checkpoint.rowsFetched ?? 0,
      rowsWritten: checkpoint.rowsWritten ?? 0,
      lastSuccessfulEntityKey: checkpoint.lastSuccessfulEntityKey ?? null,
      lastResponseHeaders: checkpoint.lastResponseHeaders ?? {},
      attemptCount: Math.max(
        checkpoint.attemptCount,
        input.partition.attemptCount + 1,
      ),
      leaseEpoch: input.partition.leaseEpoch,
      leaseOwner: input.workerId,
      startedAt: checkpoint.startedAt ?? cancelledAt,
      finishedAt: cancelledAt,
    }).catch(() => null);
  }

  logMetaRunObservability({
    event: "completion_attempt_started",
    partitionId: input.partition.id,
    runId: input.runId,
    recoveredRunId: input.recoveredRunId ?? null,
    workerId: input.workerId,
    leaseEpoch: input.partition.leaseEpoch,
    lane: input.partition.lane,
    scope: input.partition.scope,
    partitionStatus: "cancelled",
    runStatusBefore: "running",
    runStatusAfter: "cancelled",
    pathKind: "primary",
  });
  const completionHeartbeatOk = await heartbeatMetaPartitionBeforeCompletion({
    partitionId: input.partition.id,
    workerId: input.workerId,
    leaseEpoch: input.partition.leaseEpoch,
    leaseMinutes: META_PARTITION_LEASE_MINUTES,
  });
  if (!completionHeartbeatOk.ok) {
    if (input.runId) {
      await updateMetaSyncRun({
        id: input.runId,
        status: "failed",
        durationMs: Date.now() - input.startedAtMs,
        errorClass: "lease_conflict",
        errorMessage:
          "partition lost ownership before deprecated-scope cancellation",
        finishedAt: cancelledAt,
        onlyIfCurrentStatus: "running",
      }).catch(() => null);
    }
    return false;
  }
  let completion;
  try {
    completion = await completeMetaPartitionAttempt({
      partitionId: input.partition.id,
      workerId: input.workerId,
      leaseEpoch: input.partition.leaseEpoch,
      runId: input.runId,
      partitionStatus: "cancelled",
      runStatus: "cancelled",
      durationMs: Date.now() - input.startedAtMs,
      finishedAt: cancelledAt,
      lastError: input.reason,
      lane: input.partition.lane,
      scope: input.partition.scope,
      observabilityPath: "primary",
      recoveredRunId: input.recoveredRunId ?? null,
    });
  } catch (error) {
    if (input.runId) {
      await updateMetaSyncRun({
        id: input.runId,
        status: "failed",
        durationMs: Date.now() - input.startedAtMs,
        errorClass: "operational",
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: cancelledAt,
        onlyIfCurrentStatus: "running",
      }).catch(() => null);
    }
    return false;
  }
  if (!completion.ok) {
    if (input.runId) {
      await updateMetaSyncRun({
        id: input.runId,
        status: "failed",
        durationMs: Date.now() - input.startedAtMs,
        errorClass: "lease_conflict",
        errorMessage:
          "partition lost ownership before deprecated-scope cancellation",
        finishedAt: cancelledAt,
        onlyIfCurrentStatus: "running",
      }).catch(() => null);
    }
    return false;
  }
  if (!completion.runUpdated) {
    await backfillMetaRunTerminalState({
      runId: input.runId,
      recoveredRunId: input.recoveredRunId ?? null,
      startedAtMs: input.startedAtMs,
      status: "cancelled",
      finishedAt: cancelledAt,
      context: {
        partitionId: input.partition.id,
        workerId: input.workerId,
        leaseEpoch: input.partition.leaseEpoch,
        lane: input.partition.lane,
        scope: input.partition.scope,
      },
    });
  }

  console.info("[meta-sync] partition_cancelled_deprecated_scope", {
    businessId: input.partition.businessId,
    partitionId: input.partition.id,
    workerId: input.workerId,
    scope: input.partition.scope,
    partitionDate: input.partition.partitionDate,
    source: input.partition.source,
  });
  return true;
}

async function processMetaPartition(input: {
  credentials: MetaCredentials;
  partition: {
    id?: string;
    businessId: string;
    providerAccountId: string;
    lane: MetaSyncLane;
    scope: MetaWarehouseScope;
    partitionDate: string;
    attemptCount: number;
    leaseEpoch: number;
    source: string;
  };
  workerId: string;
}) {
  const partitionId = input.partition.id;
  if (!partitionId) return false;
  const markRunningOk = await markMetaPartitionRunning({
    partitionId,
    workerId: input.workerId,
    leaseEpoch: input.partition.leaseEpoch,
    leaseMinutes: META_PARTITION_LEASE_MINUTES,
  }).catch(() => false);
  if (!markRunningOk) {
    console.warn("[meta-sync] partition_lost_ownership_before_run", {
      businessId: input.partition.businessId,
      partitionId,
      workerId: input.workerId,
      scope: input.partition.scope,
      partitionDate: input.partition.partitionDate,
    });
    return false;
  }
  const startedAt = Date.now();
  const createdRunId = await createMetaSyncRun({
    partitionId,
    businessId: input.partition.businessId,
    providerAccountId: input.partition.providerAccountId,
    lane: input.partition.lane,
    scope: input.partition.scope,
    partitionDate: input.partition.partitionDate,
    status: "running",
    workerId: input.workerId,
    attemptCount: input.partition.attemptCount + 1,
    metaJson: {
      source: input.partition.source,
      leaseEpoch: input.partition.leaseEpoch,
    },
  }).catch(() => null);
  logMetaRunObservability({
    event: "run_row_created",
    partitionId,
    runId: createdRunId,
    recoveredRunId: null,
    workerId: input.workerId,
    leaseEpoch: input.partition.leaseEpoch,
    lane: input.partition.lane,
    scope: input.partition.scope,
    partitionStatus: "running",
    runStatusBefore: null,
    runStatusAfter: createdRunId ? "running" : null,
    pathKind: "primary",
  });
  let runId = createdRunId;
  let recoveredRunId: string | null = null;
  if (!runId) {
    recoveredRunId = await getLatestRunningMetaSyncRunIdForPartition({
      partitionId,
    }).catch(() => null);
    logMetaRunObservability({
      event: "latest_running_run_lookup_result",
      partitionId,
      runId: createdRunId,
      recoveredRunId,
      workerId: input.workerId,
      leaseEpoch: input.partition.leaseEpoch,
      lane: input.partition.lane,
      scope: input.partition.scope,
      partitionStatus: "running",
      runStatusBefore: null,
      runStatusAfter: recoveredRunId ? "running" : null,
      pathKind: "primary",
    });
    runId = recoveredRunId;
  }
  logMetaRunObservability({
    event: "run_id_attached_to_execution_context",
    partitionId,
    runId,
    recoveredRunId,
    workerId: input.workerId,
    leaseEpoch: input.partition.leaseEpoch,
    lane: input.partition.lane,
    scope: input.partition.scope,
    partitionStatus: "running",
    runStatusBefore: null,
    runStatusAfter: runId ? "running" : null,
    pathKind: "primary",
  });

  const deprecatedScopeReason = getDeprecatedMetaPartitionCancellationReason(
    input.partition.scope,
  );
  if (deprecatedScopeReason) {
    return cancelDeprecatedMetaPartition({
      partition: {
        id: partitionId,
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        lane: input.partition.lane,
        scope: input.partition.scope,
        partitionDate: input.partition.partitionDate,
        attemptCount: input.partition.attemptCount,
        leaseEpoch: input.partition.leaseEpoch,
        source: input.partition.source,
      },
      workerId: input.workerId,
      runId,
      recoveredRunId,
      startedAtMs: startedAt,
      reason: deprecatedScopeReason,
    });
  }

  try {
    const scopes =
      input.partition.lane === "core" || input.partition.lane === "maintenance"
        ? META_CORE_SCOPES
        : [input.partition.scope];
    await syncMetaPartitionDay({
      credentials: input.credentials,
      businessId: input.partition.businessId,
      providerAccountId: input.partition.providerAccountId,
      day: input.partition.partitionDate,
      source: input.partition.source,
      scopes,
      partitionId,
      workerId: input.workerId,
      leaseEpoch: input.partition.leaseEpoch,
      attemptCount: input.partition.attemptCount,
    });
    try {
      const completionHeartbeat = await heartbeatMetaPartitionBeforeCompletion({
        partitionId,
        workerId: input.workerId,
        leaseEpoch: input.partition.leaseEpoch,
        leaseMinutes: META_PARTITION_LEASE_MINUTES,
      });
      if (!completionHeartbeat.ok) {
        const denialSnapshot = await logMetaSuccessCompletionDenied({
          partitionId,
          runId,
          recoveredRunId,
          workerId: input.workerId,
          leaseEpoch: input.partition.leaseEpoch,
          lane: input.partition.lane,
          scope: input.partition.scope,
          partitionStatus: "succeeded",
          runStatus: "succeeded",
          reason: "lease_conflict",
        });
        if (denialSnapshot?.denialClassification === "already_terminal") {
          await backfillMetaDeniedTerminalRuns({
            partitionId,
            runId,
            recoveredRunId,
            workerId: input.workerId,
            leaseEpoch: input.partition.leaseEpoch,
            lane: input.partition.lane,
            scope: input.partition.scope,
            pathKind: "primary",
          });
        }
        if (runId) {
          await updateMetaSyncRun({
            id: runId,
            status: "failed",
            durationMs: Date.now() - startedAt,
            errorClass: "lease_conflict",
            errorMessage: "partition lost ownership before success completion",
            finishedAt: new Date().toISOString(),
            onlyIfCurrentStatus: "running",
          }).catch(() => null);
        }
        return false;
      }
      logMetaRunObservability({
        event: "completion_attempt_started",
        partitionId,
        runId,
        recoveredRunId,
        workerId: input.workerId,
        leaseEpoch: input.partition.leaseEpoch,
        lane: input.partition.lane,
        scope: input.partition.scope,
        partitionStatus: "succeeded",
        runStatusBefore: "running",
        runStatusAfter: "succeeded",
        pathKind: "primary",
      });
      const completed = await completeMetaPartitionAttempt({
        partitionId,
        workerId: input.workerId,
        leaseEpoch: input.partition.leaseEpoch,
        runId,
        partitionStatus: "succeeded",
        runStatus: "succeeded",
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        lane: input.partition.lane,
        scope: input.partition.scope,
        observabilityPath: "primary",
        recoveredRunId,
      });
      if (!completed.ok) {
        const denialSnapshot = await logMetaSuccessCompletionDenied({
          partitionId,
          runId,
          recoveredRunId,
          workerId: input.workerId,
          leaseEpoch: input.partition.leaseEpoch,
          lane: input.partition.lane,
          scope: input.partition.scope,
          partitionStatus: "succeeded",
          runStatus: "succeeded",
          reason: "lease_conflict",
        });
        if (denialSnapshot?.denialClassification === "already_terminal") {
          await backfillMetaDeniedTerminalRuns({
            partitionId,
            runId,
            recoveredRunId,
            workerId: input.workerId,
            leaseEpoch: input.partition.leaseEpoch,
            lane: input.partition.lane,
            scope: input.partition.scope,
            pathKind: "primary",
          });
        }
        if (runId) {
          await updateMetaSyncRun({
            id: runId,
            status: "failed",
            durationMs: Date.now() - startedAt,
            errorClass: "lease_conflict",
            errorMessage: "partition lost ownership before success completion",
            finishedAt: new Date().toISOString(),
            onlyIfCurrentStatus: "running",
          }).catch(() => null);
        }
        return false;
      }
      if (!completed.runUpdated) {
        await backfillMetaRunTerminalState({
          runId,
          recoveredRunId,
          startedAtMs: startedAt,
          status: "succeeded",
          finishedAt: new Date().toISOString(),
          context: {
            partitionId,
            workerId: input.workerId,
            leaseEpoch: input.partition.leaseEpoch,
            lane: input.partition.lane,
            scope: input.partition.scope,
          },
        });
      }
    } catch (completionError) {
      const denialSnapshot = await logMetaSuccessCompletionDenied({
        partitionId,
        runId,
        recoveredRunId,
        workerId: input.workerId,
        leaseEpoch: input.partition.leaseEpoch,
        lane: input.partition.lane,
        scope: input.partition.scope,
        partitionStatus: "succeeded",
        runStatus: "succeeded",
        reason: "operational_error",
        message:
          completionError instanceof Error
            ? completionError.message
            : String(completionError),
      });
      if (denialSnapshot?.denialClassification === "already_terminal") {
        await backfillMetaDeniedTerminalRuns({
          partitionId,
          runId,
          recoveredRunId,
          workerId: input.workerId,
          leaseEpoch: input.partition.leaseEpoch,
          lane: input.partition.lane,
          scope: input.partition.scope,
          pathKind: "primary",
        });
      }
      throw completionError;
    }
    if (
      input.partition.lane === "core" ||
      input.partition.lane === "maintenance"
    ) {
      await enqueueMetaExtendedPartitionsAfterSuccess({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        date: input.partition.partitionDate,
        source: input.partition.source,
      });
    }
    return true;
  } catch (error) {
    const classified = classifyMetaError(error);
    const message = error instanceof Error ? error.message : String(error);
    const shouldDeadLetter =
      classified.terminal ||
      input.partition.attemptCount + 1 >= META_PARTITION_MAX_ATTEMPTS;
    try {
      const completionHeartbeat = await heartbeatMetaPartitionBeforeCompletion({
        partitionId,
        workerId: input.workerId,
        leaseEpoch: input.partition.leaseEpoch,
        leaseMinutes: META_PARTITION_LEASE_MINUTES,
      });
      if (completionHeartbeat.ok) {
        logMetaRunObservability({
          event: "completion_attempt_started",
          partitionId,
          runId,
          recoveredRunId,
          workerId: input.workerId,
          leaseEpoch: input.partition.leaseEpoch,
          lane: input.partition.lane,
          scope: input.partition.scope,
          partitionStatus: shouldDeadLetter ? "dead_letter" : "failed",
          runStatusBefore: "running",
          runStatusAfter: "failed",
          pathKind: "primary",
        });
        const completed = await completeMetaPartitionAttempt({
          partitionId,
          workerId: input.workerId,
          leaseEpoch: input.partition.leaseEpoch,
          runId,
          partitionStatus: shouldDeadLetter ? "dead_letter" : "failed",
          runStatus: "failed",
          durationMs: Date.now() - startedAt,
          errorClass: classified.errorClass,
          errorMessage: message,
          finishedAt: new Date().toISOString(),
          lastError: message,
          retryDelayMinutes: shouldDeadLetter
            ? undefined
            : computeRetryDelayMinutes(
                input.partition,
                classified.retryDelayMinutes,
              ),
          lane: input.partition.lane,
          scope: input.partition.scope,
          observabilityPath: "primary",
          recoveredRunId,
        });
        if (!completed.ok) {
          if (runId) {
            await updateMetaSyncRun({
              id: runId,
              status: "failed",
              durationMs: Date.now() - startedAt,
              errorClass: "lease_conflict",
              errorMessage:
                "partition lost ownership before failure completion",
              finishedAt: new Date().toISOString(),
              onlyIfCurrentStatus: "running",
            }).catch(() => null);
          }
        } else if (!completed.runUpdated) {
          await backfillMetaRunTerminalState({
            runId,
            recoveredRunId,
            startedAtMs: startedAt,
            status: "failed",
            errorClass: classified.errorClass,
            errorMessage: message,
            finishedAt: new Date().toISOString(),
            context: {
              partitionId,
              workerId: input.workerId,
              leaseEpoch: input.partition.leaseEpoch,
              lane: input.partition.lane,
              scope: input.partition.scope,
            },
          });
        }
      } else if (runId) {
        await updateMetaSyncRun({
          id: runId,
          status: "failed",
          durationMs: Date.now() - startedAt,
          errorClass: "lease_conflict",
          errorMessage: "partition lost ownership before failure completion",
          finishedAt: new Date().toISOString(),
          onlyIfCurrentStatus: "running",
        }).catch(() => null);
      }
    } catch (completionError) {
      console.warn("[meta-sync] partition_failure_completion_error", {
        businessId: input.partition.businessId,
        partitionId,
        scope: input.partition.scope,
        lane: input.partition.lane,
        message:
          completionError instanceof Error
            ? completionError.message
            : String(completionError),
      });
      if (runId) {
        await updateMetaSyncRun({
          id: runId,
          status: "failed",
          durationMs: Date.now() - startedAt,
          errorClass: classified.errorClass,
          errorMessage: message,
          finishedAt: new Date().toISOString(),
          onlyIfCurrentStatus: "running",
        }).catch(() => null);
      }
    }
    console.warn("[meta-sync] partition_failed", {
      businessId: input.partition.businessId,
      scope: input.partition.scope,
      partitionDate: input.partition.partitionDate,
      lane: input.partition.lane,
      source: input.partition.source,
      errorClass: classified.errorClass,
      message,
    });
    return false;
  }
}

export async function processMetaLifecyclePartition(input: {
  partition: {
    id?: string;
    businessId: string;
    providerAccountId: string;
    lane: MetaSyncLane;
    scope: MetaWarehouseScope;
    partitionDate: string;
    attemptCount: number;
    leaseEpoch: number;
    source: string;
  };
  workerId: string;
}) {
  const credentials = await resolveMetaCredentials(
    input.partition.businessId,
  ).catch(() => null);
  if (!credentials) {
    throw new Error("meta_credentials_unavailable");
  }
  return processMetaPartition({
    credentials,
    partition: input.partition,
    workerId: input.workerId,
  });
}

export async function consumeMetaQueuedWork(
  businessId: string,
  input?: {
    runtimeLeaseGuard?: RunnerLeaseGuard;
  },
): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(businessId).catch(
    () => null,
  );
  if (!credentials?.accountIds?.length) {
    console.info("[meta-sync] meta_consume_skipped_no_credentials", {
      businessId,
    });
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }
  console.info("[meta-sync] meta_consume_started", {
    businessId,
    accountIds: credentials.accountIds,
  });
  const cancelledObsoletePartitions =
    await cancelObsoleteMetaCoreScopePartitions({
      businessId,
      canonicalScope: META_PRODUCT_CORE_PARTITION_SCOPE,
    }).catch(() => []);
  if (cancelledObsoletePartitions.length > 0) {
    console.info("[meta-sync] cancelled_obsolete_core_scope_partitions", {
      businessId,
      cancelledCount: cancelledObsoletePartitions.length,
    });
  }
  await expireStaleMetaSyncJobs({ businessId }).catch(() => null);
  await cleanupMetaPartitionOrchestration({
    businessId,
    staleRunMinutesByLane: {
      core: META_STALE_RUN_CORE_MINUTES,
      maintenance: META_STALE_RUN_MAINTENANCE_MINUTES,
      extended: META_STALE_RUN_EXTENDED_MINUTES,
    },
    runProgressGraceMinutes: META_RUN_PROGRESS_GRACE_MINUTES,
  }).catch(() => null);
  await requeueMetaRetryableFailedPartitions({ businessId });

  const lockKey = `background:${businessId}`;
  const backgroundSyncKeys = getBackgroundSyncKeys();
  if (backgroundSyncKeys.has(lockKey)) {
    logMetaQueueVisibility("meta_background_sync_already_scheduled", {
      businessId,
      lockKey,
      source: "consume",
    });
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }

  backgroundSyncKeys.add(lockKey);
  const workerId = getMetaWorkerId();
  try {
    const leaseConflictReason = () =>
      input?.runtimeLeaseGuard?.getLeaseLossReason() ?? "runner_lease_conflict";
    const hasLeaseConflict = () =>
      input?.runtimeLeaseGuard?.isLeaseLost() ?? false;
    await refreshMetaSyncStateForBusiness({ businessId, credentials }).catch(
      () => null,
    );
    const queueHealthBeforeEnqueue = await getMetaQueueHealth({
      businessId,
    }).catch(() => null);
    const stateRowsBeforeLeasing = await Promise.all(
      META_STATE_SCOPES.map((scope) =>
        getMetaSyncState({ businessId, scope }).catch(() => []),
      ),
    ).catch(() => META_STATE_SCOPES.map(() => []));
    const statesByScope = Object.fromEntries(
      META_STATE_SCOPES.map((scope, index) => [
        scope,
        stateRowsBeforeLeasing[index] ?? [],
      ]),
    ) as Record<
      MetaWarehouseScope,
      Awaited<ReturnType<typeof getMetaSyncState>>
    >;
    const laneProgressEvidence = buildMetaLaneProgressEvidence({
      statesByScope,
      queueHealth: queueHealthBeforeEnqueue,
    });
    const queueCompositionBeforeEnqueue = await getMetaQueueComposition({
      businessId,
    }).catch(() => null);
    const queueHealthPayload = {
      businessId,
      queueDepth: queueHealthBeforeEnqueue?.queueDepth ?? 0,
      leasedPartitions: queueHealthBeforeEnqueue?.leasedPartitions ?? 0,
      coreQueueDepth: queueHealthBeforeEnqueue?.coreQueueDepth ?? 0,
      maintenanceQueueDepth:
        queueHealthBeforeEnqueue?.maintenanceQueueDepth ?? 0,
      extendedQueueDepth: queueHealthBeforeEnqueue?.extendedQueueDepth ?? 0,
      historicalCoreQueued:
        queueCompositionBeforeEnqueue?.summary.historicalCoreQueued ?? 0,
      extendedRecentQueued:
        queueCompositionBeforeEnqueue?.summary.extendedRecentQueued ?? 0,
      extendedHistoricalQueued:
        queueCompositionBeforeEnqueue?.summary.extendedHistoricalQueued ?? 0,
    };
    console.info("[meta-sync] meta_consume_queue_health", queueHealthPayload);
    logMetaQueueVisibility("meta_queue_health", queueHealthPayload);
    const hasHistoricalCoreBacklogBeforeEnqueue =
      (queueHealthBeforeEnqueue?.historicalCoreQueueDepth ?? 0) > 0 ||
      (queueHealthBeforeEnqueue?.historicalCoreLeasedPartitions ?? 0) > 0;
    const hasMaintenanceBacklog =
      (queueHealthBeforeEnqueue?.maintenanceQueueDepth ?? 0) > 0 ||
      (queueHealthBeforeEnqueue?.maintenanceLeasedPartitions ?? 0) > 0;

    if (!hasHistoricalCoreBacklogBeforeEnqueue) {
      await enqueueMetaHistoricalCorePartitions(businessId, credentials).catch(
        () => 0,
      );
    }
    if (!hasMaintenanceBacklog) {
      await enqueueMetaMaintenancePartitions(businessId, credentials).catch(
        () => 0,
      );
    }

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

    const leasedMaintenancePartitions = await leaseMetaSyncPartitions({
      businessId,
      lane: "maintenance",
      workerId,
      limit: META_MAINTENANCE_WORKER_LIMIT,
      leaseMinutes: META_PARTITION_LEASE_MINUTES,
    });
    const queueHealthAfterPriorityLeases = await getMetaQueueHealth({
      businessId,
    }).catch(() => null);
    const hasHistoricalCoreBacklog =
      (queueHealthAfterPriorityLeases?.historicalCoreQueueDepth ?? 0) > 0 ||
      (queueHealthAfterPriorityLeases?.historicalCoreLeasedPartitions ?? 0) > 0;
    const hasExtendedHistoricalBacklog =
      (queueHealthAfterPriorityLeases?.extendedHistoricalQueueDepth ?? 0) > 0 ||
      (queueHealthAfterPriorityLeases?.extendedHistoricalLeasedPartitions ??
        0) > 0;
    const fairnessLeasePlan = buildMetaFairnessLeasePlan({
      queueHealth: queueHealthAfterPriorityLeases,
      laneProgressEvidence,
    });

    // Keep historical core moving even while maintenance/recent work is draining.
    const leasedCoreFairnessPartitions =
      hasHistoricalCoreBacklog && fairnessLeasePlan.coreFairnessLimit > 0
        ? await leaseMetaSyncPartitions({
            businessId,
            lane: "core",
            workerId,
            limit: fairnessLeasePlan.coreFairnessLimit,
            leaseMinutes: META_PARTITION_LEASE_MINUTES,
          })
        : [];

    const leasedExtendedHistoricalFairnessPartitions =
      hasExtendedHistoricalBacklog &&
      fairnessLeasePlan.extendedHistoricalFairnessLimit > 0
        ? await leaseMetaSyncPartitions({
            businessId,
            lane: "extended",
            sources: ["historical", "historical_recovery", "initial_connect"],
            workerId,
            limit: fairnessLeasePlan.extendedHistoricalFairnessLimit,
            leaseMinutes: META_PARTITION_LEASE_MINUTES,
          })
        : [];
    const initialFollowupLeasePlan = buildMetaFollowupLeasePlan({
      queueHealth: queueHealthAfterPriorityLeases,
      leasedCoreFairnessCount: leasedCoreFairnessPartitions.length,
      leasedExtendedHistoricalFairnessCount:
        leasedExtendedHistoricalFairnessPartitions.length,
    });

    const leasedExtendedRecentPartitions =
      initialFollowupLeasePlan.extendedRecentLimit > 0
        ? await leaseMetaSyncPartitions({
            businessId,
            lane: "extended",
            sources: [
              "recent",
              "recent_recovery",
              "repair_recent_day",
              "today_observe",
              "today",
              "priority_window",
              "finalize_day",
              "request_runtime",
              "manual_refresh",
            ],
            workerId,
            limit: initialFollowupLeasePlan.extendedRecentLimit,
            leaseMinutes: META_PARTITION_LEASE_MINUTES,
          })
        : [];

    const leasedHistoricalCorePartitions =
      initialFollowupLeasePlan.historicalCoreLimit > 0
        ? await leaseMetaSyncPartitions({
            businessId,
            lane: "core",
            workerId,
            limit: initialFollowupLeasePlan.historicalCoreLimit,
            leaseMinutes: META_PARTITION_LEASE_MINUTES,
          })
        : [];
    const finalFollowupLeasePlan = buildMetaFollowupLeasePlan({
      queueHealth: queueHealthAfterPriorityLeases,
      leasedCoreFairnessCount: leasedCoreFairnessPartitions.length,
      leasedExtendedHistoricalFairnessCount:
        leasedExtendedHistoricalFairnessPartitions.length,
      leasedExtendedRecentCount: leasedExtendedRecentPartitions.length,
    });

    const leasedExtendedHistoricalPartitions =
      finalFollowupLeasePlan.extendedHistoricalLimit > 0
        ? await leaseMetaSyncPartitions({
            businessId,
            lane: "extended",
            sources: ["historical", "historical_recovery", "initial_connect"],
            workerId,
            limit: finalFollowupLeasePlan.extendedHistoricalLimit,
            leaseMinutes: META_PARTITION_LEASE_MINUTES,
          })
        : [];

    let partitions = [
      ...leasedMaintenancePartitions,
      ...leasedCoreFairnessPartitions,
      ...leasedExtendedHistoricalFairnessPartitions,
      ...leasedExtendedRecentPartitions,
      ...leasedHistoricalCorePartitions,
      ...leasedExtendedHistoricalPartitions,
    ];
    console.info("[meta-sync] meta_consume_leased_partitions", {
      businessId,
      maintenanceLeased: leasedMaintenancePartitions.length,
      coreFairnessLimit: fairnessLeasePlan.coreFairnessLimit,
      coreFairnessLeased: leasedCoreFairnessPartitions.length,
      extendedHistoricalFairnessLimit:
        fairnessLeasePlan.extendedHistoricalFairnessLimit,
      extendedHistoricalFairnessLeased:
        leasedExtendedHistoricalFairnessPartitions.length,
      extendedRecentLimit: initialFollowupLeasePlan.extendedRecentLimit,
      extendedRecentLeased: leasedExtendedRecentPartitions.length,
      historicalCoreLimit: initialFollowupLeasePlan.historicalCoreLimit,
      historicalCoreLeased: leasedHistoricalCorePartitions.length,
      extendedHistoricalLimit: finalFollowupLeasePlan.extendedHistoricalLimit,
      extendedHistoricalLeased: leasedExtendedHistoricalPartitions.length,
      totalLeased: partitions.length,
    });
    if (partitions.length === 0) {
      const queueHealth = await getMetaQueueHealth({ businessId }).catch(
        () => null,
      );
      console.info("[meta-sync] meta_consume_no_partitions", {
        businessId,
        queueDepth: queueHealth?.queueDepth ?? 0,
        leasedPartitions: queueHealth?.leasedPartitions ?? 0,
      });
      if (
        (queueHealth?.queueDepth ?? 0) > 0 ||
        (queueHealth?.leasedPartitions ?? 0) > 0
      ) {
        const noLeasePayload = {
          businessId,
          workerId,
          queueDepth: queueHealth?.queueDepth ?? 0,
          leasedPartitions: queueHealth?.leasedPartitions ?? 0,
          latestCoreActivityAt: queueHealth?.latestCoreActivityAt ?? null,
          latestMaintenanceActivityAt:
            queueHealth?.latestMaintenanceActivityAt ?? null,
          latestExtendedActivityAt:
            queueHealth?.latestExtendedActivityAt ?? null,
        };
        console.warn("[meta-sync] queue_idle_without_lease", noLeasePayload);
        logMetaQueueVisibility(
          "meta_queue_present_no_runner_lease",
          noLeasePayload,
        );
        logMetaQueueVisibility(
          "meta_runner_lease_not_acquired",
          noLeasePayload,
        );
      }
      return {
        businessId,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: true,
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
      const ok = await processMetaPartition({
        credentials,
        partition: {
          id: partition.id,
          businessId: partition.businessId,
          providerAccountId: partition.providerAccountId,
          lane: partition.lane,
          scope: partition.scope,
          partitionDate: partition.partitionDate,
          attemptCount: partition.attemptCount,
          leaseEpoch: partition.leaseEpoch ?? 0,
          source: partition.source,
        },
        workerId,
      });
      if (ok) succeeded += 1;
      else failed += 1;
    }

    await refreshMetaSyncStateForBusiness({ businessId, credentials }).catch(
      () => null,
    );
    console.info("[meta-sync] meta_consume_finished", {
      businessId,
      attempted,
      succeeded,
      failed,
    });
    return {
      businessId,
      attempted,
      succeeded,
      failed,
      skipped: attempted === 0,
      outcome:
        failed > 0 && succeeded === 0
          ? "consume_failed_after_leasing"
          : undefined,
      failureReason:
        failed > 0 && succeeded === 0 ? leaseConflictReason() : null,
    };
  } finally {
    backgroundSyncKeys.delete(lockKey);
  }
}

export async function syncMetaReports(
  businessId: string,
): Promise<MetaSyncResult> {
  if (process.env.SYNC_WORKER_MODE !== "1") {
    await enqueueMetaScheduledWork(businessId).catch(() => null);
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }
  return consumeMetaQueuedWork(businessId);
}

async function enqueueMetaRangeJob(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  triggerSource: string;
  syncType: MetaSyncType;
  lane: MetaSyncLane;
  scopes: MetaWarehouseScope[];
  priority: number;
}) {
  const credentials = await resolveMetaCredentials(input.businessId);
  if (!credentials?.accountIds?.length) {
    return {
      businessId: input.businessId,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: true,
    };
  }
  const days = enumerateDays(input.startDate, input.endDate, true);
  const primaryAccountId = credentials.accountIds[0] ?? "workspace";
  const syncJobId = await createMetaSyncJob({
    businessId: input.businessId,
    providerAccountId: primaryAccountId,
    syncType: input.syncType,
    scope: input.scopes[0] ?? "account_daily",
    startDate: input.startDate,
    endDate: input.endDate,
    status: "running",
    progressPercent: 5,
    triggerSource: input.triggerSource,
    retryCount: 0,
    lastError: null,
    startedAt: new Date().toISOString(),
  }).catch(() => null);

  const queued = await enqueueMetaDates({
    businessId: input.businessId,
    accountIds: credentials.accountIds,
    dates: days,
    triggerSource: input.triggerSource,
    lane: input.lane,
    scopes: input.scopes,
    priority: input.priority,
  }).catch(() => 0);

  if (syncJobId) {
    await updateMetaSyncJob({
      id: syncJobId,
      status: "succeeded",
      progressPercent: 100,
      finishedAt: new Date().toISOString(),
      lastError: queued === 0 ? "No partitions were queued." : null,
    }).catch(() => null);
  }

  scheduleMetaBackgroundSync({ businessId: input.businessId, delayMs: 0 });
  return {
    businessId: input.businessId,
    attempted: days.length,
    succeeded: queued,
    failed: 0,
    skipped: queued === 0,
  };
}

export async function backfillMetaRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  triggerSource?: string;
  syncType?: MetaSyncType;
}): Promise<MetaSyncResult> {
  return enqueueMetaRangeJob({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    triggerSource: input.triggerSource ?? "manual_refresh",
    syncType: input.syncType ?? "repair_window",
    lane: input.triggerSource === "priority_window" ? "maintenance" : "core",
    scopes: META_CORE_PARTITION_QUEUE_SCOPES,
    priority: input.triggerSource === "priority_window" ? 90 : 40,
  });
}

export async function syncMetaRecent(
  businessId: string,
): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }
  const { endDate } = getMetaHistoricalWindow(credentials);
  const start = addDays(new Date(`${endDate}T00:00:00Z`), -6);
  return enqueueMetaRangeJob({
    businessId,
    startDate: toIsoDate(start),
    endDate,
    triggerSource: "recent",
    syncType: "incremental_recent",
    lane: "maintenance",
    scopes: META_CORE_PARTITION_QUEUE_SCOPES,
    priority: 50,
  });
}

export async function syncMetaToday(
  businessId: string,
): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }
  const today = getMetaReferenceToday(credentials);
  return enqueueMetaRangeJob({
    businessId,
    startDate: today,
    endDate: today,
    triggerSource: "today_observe",
    syncType: "today_observe",
    lane: "maintenance",
    scopes: META_CORE_PARTITION_QUEUE_SCOPES,
    priority: 60,
  });
}

export async function syncMetaRepairRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaSyncResult> {
  return enqueueMetaRangeJob({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    triggerSource:
      input.startDate === input.endDate ? "finalize_day" : "priority_window",
    syncType:
      input.startDate === input.endDate ? "finalize_range" : "repair_window",
    lane: "maintenance",
    scopes: META_CORE_PARTITION_QUEUE_SCOPES,
    priority: 90,
  });
}

export async function syncMetaInitial(
  businessId: string,
): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }
  const { startDate, endDate } = getMetaHistoricalWindow(credentials);
  return enqueueMetaRangeJob({
    businessId,
    startDate,
    endDate,
    triggerSource: "initial_connect",
    syncType: "initial_backfill",
    lane: "core",
    scopes: META_CORE_PARTITION_QUEUE_SCOPES,
    priority: 20,
  });
}

export async function ensureMetaWarehouseRangeFilled(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaSyncResult | null> {
  const completion = await getMetaWarehouseWindowCompletion({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  }).catch(() => null);
  if (completion?.complete) return null;
  return syncMetaRepairRange(input);
}

export async function runMetaMaintenanceSync(businessId: string) {
  const result = await enqueueMetaScheduledWork(businessId);
  if (canUseInProcessBackgroundScheduling()) {
    scheduleMetaBackgroundSync({ businessId, delayMs: 0 });
  }
  return result;
}

export async function refreshMetaSyncStateAndQueue(businessId: string) {
  await refreshMetaSyncStateForBusiness({ businessId });
  return getMetaQueueHealth({ businessId });
}

export async function replayMetaDeadLettersAndResume(input: {
  businessId: string;
  scope?: MetaWarehouseScope | null;
}) {
  const replayed = await replayMetaDeadLetterPartitions(input);
  scheduleMetaBackgroundSync({ businessId: input.businessId, delayMs: 0 });
  return replayed;
}

export async function getMetaSelectedRangeState(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const [completion, queueHealth, latestSync, states] = await Promise.all([
    getMetaWarehouseWindowCompletion(input).catch(() => null),
    getMetaQueueHealth({ businessId: input.businessId }).catch(() => null),
    getLatestMetaSyncHealth({
      businessId: input.businessId,
      providerAccountId: null,
    }).catch(() => null),
    Promise.all(
      META_STATE_SCOPES.map((scope) =>
        getMetaSyncState({
          businessId: input.businessId,
          scope,
        }).catch(() => []),
      ),
    ),
  ]);
  return { completion, queueHealth, latestSync, states };
}
