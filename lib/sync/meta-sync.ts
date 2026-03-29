import {
  type MetaCredentials,
  resolveMetaCredentials,
  syncMetaAccountBreakdownWarehouseDay,
  syncMetaAccountCoreWarehouseDay,
} from "@/lib/api/meta";
import { syncMetaCreativesWarehouseDay } from "@/lib/meta/creatives-warehouse";
import {
  cleanupMetaPartitionOrchestration,
  completeMetaPartition,
  createMetaSyncJob,
  createMetaSyncRun,
  expireStaleMetaSyncJobs,
  getLatestMetaSyncHealth,
  getMetaAdDailyCoverage,
  getMetaAdDailyPreviewCoverage,
  getMetaAdSetDailyCoverage,
  getMetaAccountDailyCoverage,
  getMetaCreativeDailyCoverage,
  getMetaPartitionHealth,
  getMetaQueueHealth,
  getMetaRawSnapshotCoverageByEndpoint,
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
  MetaSyncLane,
  MetaSyncPartitionRecord,
  MetaSyncType,
  MetaWarehouseScope,
} from "@/lib/meta/warehouse-types";
import {
  getCreativeMediaRetentionStart,
  META_WAREHOUSE_HISTORY_DAYS,
  dayCountInclusive,
} from "@/lib/meta/history";

const META_BREAKDOWN_ENDPOINTS = [
  "breakdown_age",
  "breakdown_country",
  "breakdown_publisher_platform,platform_position,impression_device",
] as const;

const META_CORE_SCOPES: MetaWarehouseScope[] = ["account_daily", "adset_daily"];
const META_EXTENDED_SCOPES: MetaWarehouseScope[] = ["creative_daily", "ad_daily"];
const META_STATE_SCOPES: MetaWarehouseScope[] = [
  "account_daily",
  "adset_daily",
  "creative_daily",
  "ad_daily",
];

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

const META_BACKGROUND_LOOP_DELAY_MS = envNumber("META_BACKGROUND_LOOP_DELAY_MS", 5_000);
const META_CORE_WORKER_LIMIT = envNumber("META_CORE_WORKER_LIMIT", 4);
const META_EXTENDED_WORKER_LIMIT = envNumber("META_EXTENDED_WORKER_LIMIT", 2);
const META_MAINTENANCE_WORKER_LIMIT = envNumber("META_MAINTENANCE_WORKER_LIMIT", 2);
const META_PARTITION_LEASE_MINUTES = envNumber("META_PARTITION_LEASE_MINUTES", 5);
const META_PARTITION_MAX_ATTEMPTS = envNumber("META_PARTITION_MAX_ATTEMPTS", 6);
const META_ENQUEUE_BATCH_SIZE = envNumber("META_ENQUEUE_BATCH_SIZE", 25);
const META_HISTORICAL_ENQUEUE_DAYS_PER_RUN = envNumber("META_HISTORICAL_ENQUEUE_DAYS_PER_RUN", 21);
const META_RECENT_RECOVERY_DAYS = envNumber("META_RECENT_RECOVERY_DAYS", 14);

function canUseInProcessBackgroundScheduling() {
  return process.env.SYNC_WORKER_MODE !== "1";
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
  "priority_window",
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

function isRecentMetaSource(source: string | null | undefined) {
  return META_RECENT_SOURCE_SET.has(String(source ?? ""));
}

function isHistoricalMetaSource(source: string | null | undefined) {
  return META_HISTORICAL_SOURCE_SET.has(String(source ?? ""));
}

function enumerateDays(startDate: string, endDate: string, recentFirst = false) {
  const rows: string[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    rows.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return recentFirst ? rows.reverse() : rows;
}

function getMetaReferenceToday(credentials: Awaited<ReturnType<typeof resolveMetaCredentials>>) {
  const primaryAccountId = credentials?.accountIds[0] ?? null;
  const primaryTimeZone =
    primaryAccountId && credentials?.accountProfiles?.[primaryAccountId]?.timezone
      ? credentials.accountProfiles[primaryAccountId].timezone
      : null;
  return primaryTimeZone ? getTodayIsoForTimeZoneServer(primaryTimeZone) : toIsoDate(new Date());
}

function getMetaHistoricalWindow(credentials: Awaited<ReturnType<typeof resolveMetaCredentials>>) {
  const today = getMetaReferenceToday(credentials);
  const historicalEnd = addDays(new Date(`${today}T00:00:00Z`), -1);
  const historicalStart = addDays(historicalEnd, -(META_WAREHOUSE_HISTORY_DAYS - 1));
  return {
    startDate: toIsoDate(historicalStart),
    endDate: toIsoDate(historicalEnd),
    today,
  };
}

function getMetaWorkerId() {
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
    return { errorClass: "invalid_token", terminal: true, retryDelayMinutes: 0 };
  }
  if (
    lower.includes("permission") ||
    lower.includes("not authorized") ||
    lower.includes("does not have") ||
    lower.includes("unsupported get request")
  ) {
    return { errorClass: "permission", terminal: true, retryDelayMinutes: 0 };
  }
  if (lower.includes("network") || lower.includes("timeout") || lower.includes("fetch failed")) {
    return { errorClass: "transient", terminal: false, retryDelayMinutes: 3 };
  }
  if (lower.includes("invalid parameter") || lower.includes("malformed")) {
    return { errorClass: "payload", terminal: true, retryDelayMinutes: 0 };
  }
  return { errorClass: "transient", terminal: false, retryDelayMinutes: 5 };
}

function computeRetryDelayMinutes(partition: { attemptCount: number }, baseMinutes: number) {
  return Math.min(60, baseMinutes * Math.max(1, 2 ** Math.max(0, partition.attemptCount - 1)));
}

export interface MetaSyncResult {
  businessId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}

async function getMetaWarehouseWindowCompletion(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const totalDays = dayCountInclusive(input.startDate, input.endDate);
  const [accountCoverage, adsetCoverage, breakdownCoverageByEndpoint] = await Promise.all([
    getMetaAccountDailyCoverage({
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
    getMetaAdSetDailyCoverage({
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
    getMetaRawSnapshotCoverageByEndpoint({
      businessId: input.businessId,
      providerAccountId: null,
      endpointNames: [...META_BREAKDOWN_ENDPOINTS],
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
  ]);

  const breakdownCompletedDays = Math.min(
    ...META_BREAKDOWN_ENDPOINTS.map(
      (endpointName) => breakdownCoverageByEndpoint?.get(endpointName)?.completed_days ?? 0
    )
  );
  const completedDays = Math.min(
    accountCoverage?.completed_days ?? 0,
    adsetCoverage?.completed_days ?? 0,
    breakdownCompletedDays
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
  const [accountCoverage, adsetCoverage, creativeCoverage, creativePreviewCoverage, breakdownCoverageByEndpoint] =
    await Promise.all([
      getMetaAccountDailyCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
      getMetaAdSetDailyCoverage({
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
      getMetaAdDailyPreviewCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
      getMetaRawSnapshotCoverageByEndpoint({
        businessId: input.businessId,
        providerAccountId: null,
        endpointNames: [...META_BREAKDOWN_ENDPOINTS],
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
    ]);

  const reportingComplete =
    (accountCoverage?.completed_days ?? 0) >= 1 &&
    (adsetCoverage?.completed_days ?? 0) >= 1 &&
    META_BREAKDOWN_ENDPOINTS.every(
      (endpointName) => (breakdownCoverageByEndpoint?.get(endpointName)?.completed_days ?? 0) >= 1
    );
  const creativesComplete = (creativeCoverage?.completed_days ?? 0) >= 1;
  const creativesMediaReady =
    (creativePreviewCoverage?.total_rows ?? 0) === 0 ||
    (creativePreviewCoverage?.preview_ready_rows ?? 0) >=
      (creativePreviewCoverage?.total_rows ?? 0);

  return {
    reportingComplete,
    creativesComplete,
    creativesMediaReady,
  };
}

async function syncMetaPartitionDay(input: {
  credentials: MetaCredentials;
  businessId: string;
  providerAccountId: string;
  day: string;
  scopes: MetaWarehouseScope[];
  partitionId: string;
  workerId: string;
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

  if (input.scopes.some((scope) => META_CORE_SCOPES.includes(scope)) && !coverageState.reportingComplete) {
    const bulkResult = await syncMetaAccountCoreWarehouseDay({
      credentials,
      accountId: input.providerAccountId,
      day: normalizedDay,
      partitionId: input.partitionId,
      workerId: input.workerId,
      attemptCount: input.attemptCount + 1,
      leaseMinutes: 10,
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
        endpointName: "breakdown_publisher_platform,platform_position,impression_device",
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
          attemptCount: input.attemptCount + 1,
          breakdowns: breakdownJob.breakdowns,
          endpointName: breakdownJob.endpointName,
          positiveSpendAdIds: bulkResult.positiveSpendAdIds,
          leaseMinutes: 15,
        });
      } catch (error) {
        await upsertMetaSyncCheckpoint({
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
    }
  }

  if (input.scopes.some((scope) => META_EXTENDED_SCOPES.includes(scope))) {
    const creativeMediaRetentionStart = getCreativeMediaRetentionStart(getMetaReferenceToday(credentials));
    const shouldRetainCreativeMedia = input.day >= creativeMediaRetentionStart;
    if (!coverageState.creativesComplete) {
      await syncMetaCreativesWarehouseDay({
        businessId: input.businessId,
        day: normalizedDay,
        accessToken: credentials.accessToken,
        assignedAccountIds,
        mediaMode: shouldRetainCreativeMedia ? "full" : "metadata",
      });
    } else if (shouldRetainCreativeMedia && !coverageState.creativesMediaReady) {
      await syncMetaCreativesWarehouseDay({
        businessId: input.businessId,
        day: normalizedDay,
        accessToken: credentials.accessToken,
        assignedAccountIds,
        mediaMode: "full",
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
    reportingCompleteBefore: beforeCoverage.reportingComplete,
    reportingCompleteAfter: afterCoverage.reportingComplete,
    creativesCompleteBefore: beforeCoverage.creativesComplete,
    creativesCompleteAfter: afterCoverage.creativesComplete,
    creativesMediaReadyBefore: beforeCoverage.creativesMediaReady,
    creativesMediaReadyAfter: afterCoverage.creativesMediaReady,
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
      }))
    )
  );

  for (let index = 0; index < workItems.length; index += META_ENQUEUE_BATCH_SIZE) {
    const rows = await Promise.all(
      workItems
        .slice(index, index + META_ENQUEUE_BATCH_SIZE)
        .map((item) => queueMetaSyncPartition(item).catch(() => null))
    );
    for (const row of rows) {
      if (row?.id) queued += 1;
    }
  }

  return queued;
}

async function enqueueMetaHistoricalCorePartitions(
  businessId: string,
  credentials: MetaCredentials,
  maxDates = META_HISTORICAL_ENQUEUE_DAYS_PER_RUN
) {
  if (!credentials?.accountIds?.length) return 0;
  const { startDate, endDate } = getMetaHistoricalWindow(credentials);
  const historicalReplayEnd = toIsoDate(
    addDays(new Date(`${endDate}T00:00:00Z`), -(META_RECENT_RECOVERY_DAYS))
  );
  if (historicalReplayEnd < startDate) return 0;
  const completion = await getMetaWarehouseWindowCompletion({
    businessId,
    startDate,
    endDate: historicalReplayEnd,
  }).catch(() => null);
  if (completion?.complete) return 0;
  const dates = enumerateDays(startDate, historicalReplayEnd, true).slice(0, Math.max(1, maxDates));
  return enqueueMetaDates({
    businessId,
    accountIds: credentials.accountIds,
    dates,
    triggerSource: "historical",
    lane: "core",
    scopes: META_CORE_SCOPES,
    priority: 20,
  });
}

async function enqueueMetaMaintenancePartitions(
  businessId: string,
  credentials: MetaCredentials
) {
  if (!credentials?.accountIds?.length) return 0;
  const { endDate, today } = getMetaHistoricalWindow(credentials);
  const recentStart = addDays(new Date(`${endDate}T00:00:00Z`), -(META_RECENT_RECOVERY_DAYS - 1));
  const recentDates = enumerateDays(toIsoDate(recentStart), endDate, true);
  let queued = 0;
  queued += await enqueueMetaDates({
    businessId,
    accountIds: credentials.accountIds,
    dates: recentDates,
    triggerSource: "recent",
    lane: "maintenance",
    scopes: META_CORE_SCOPES,
    priority: 50,
  });
  queued += await enqueueMetaDates({
    businessId,
    accountIds: credentials.accountIds,
    dates: [today],
    triggerSource: "today",
    lane: "maintenance",
    scopes: ["account_daily", "adset_daily", "creative_daily", "ad_daily"],
    priority: 60,
  });
  return queued;
}

export async function enqueueMetaScheduledWork(businessId: string) {
  const credentials = await resolveMetaCredentials(businessId).catch(() => null);
  const staleExpired = await expireStaleMetaSyncJobs({ businessId }).catch(() => 0);
  const cleanup = await cleanupMetaPartitionOrchestration({ businessId }).catch(() => null);
  let queuedCore = 0;
  let queuedMaintenance = 0;

  if (credentials?.accountIds?.length) {
    const queueHealth = await getMetaQueueHealth({ businessId }).catch(() => null);
    const hasCoreBacklog =
      (queueHealth?.coreQueueDepth ?? 0) > 0 || (queueHealth?.coreLeasedPartitions ?? 0) > 0;
    const hasMaintenanceBacklog =
      (queueHealth?.maintenanceQueueDepth ?? 0) > 0 ||
      (queueHealth?.maintenanceLeasedPartitions ?? 0) > 0;

    await refreshMetaSyncStateForBusiness({ businessId, credentials }).catch(() => null);
    if (!hasCoreBacklog) {
      queuedCore = await enqueueMetaHistoricalCorePartitions(businessId, credentials).catch(() => 0);
    }
    if (!hasMaintenanceBacklog) {
      queuedMaintenance = await enqueueMetaMaintenancePartitions(businessId, credentials).catch(
        () => 0
      );
    }
  }

  return {
    businessId,
    staleExpired,
    cleanup,
    queuedCore,
    queuedMaintenance,
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
  for (const scope of META_EXTENDED_SCOPES) {
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
    }).catch(() => null);
  }
}

export async function refreshMetaSyncStateForBusiness(input: {
  businessId: string;
  credentials?: MetaCredentials | null;
}) {
  const credentials = input.credentials ?? (await resolveMetaCredentials(input.businessId).catch(() => null));
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
          latestBackgroundActivityAt: partitionHealth?.latestActivityAt ?? new Date().toISOString(),
          latestSuccessfulSyncAt: coverage?.latest_updated_at ?? null,
          completedDays: coverage?.completed_days ?? 0,
          deadLetterCount: partitionHealth?.deadLetterPartitions ?? 0,
        }).catch(() => null);
      })
    )
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
  if (backgroundSyncKeys.has(key)) return false;
  backgroundSyncKeys.add(key);
  const timer = setTimeout(() => {
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
  }, Math.max(0, input.delayMs ?? 0));
  timers.set(key, timer);
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
    source: string;
  };
  workerId: string;
}) {
  const partitionId = input.partition.id;
  if (!partitionId) return false;
  await markMetaPartitionRunning({ partitionId, workerId: input.workerId });
  const startedAt = Date.now();
  const runId = await createMetaSyncRun({
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
  }).catch(() => null);

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
      scopes,
      partitionId,
      workerId: input.workerId,
      attemptCount: input.partition.attemptCount,
    });
    if (input.partition.lane === "core" || input.partition.lane === "maintenance") {
      await enqueueMetaExtendedPartitionsForDate({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        date: input.partition.partitionDate,
        source: input.partition.source,
      });
    }
    await completeMetaPartition({ partitionId, status: "succeeded" });
    if (runId) {
      await updateMetaSyncRun({
        id: runId,
        status: "succeeded",
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
      }).catch(() => null);
    }
    return true;
  } catch (error) {
    const classified = classifyMetaError(error);
    const message = error instanceof Error ? error.message : String(error);
    const shouldDeadLetter = classified.terminal || input.partition.attemptCount + 1 >= META_PARTITION_MAX_ATTEMPTS;
    await completeMetaPartition({
      partitionId,
      status: shouldDeadLetter ? "dead_letter" : "failed",
      lastError: message,
      retryDelayMinutes: shouldDeadLetter
        ? undefined
        : computeRetryDelayMinutes(input.partition, classified.retryDelayMinutes),
    }).catch(() => null);
    if (runId) {
      await updateMetaSyncRun({
        id: runId,
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorClass: classified.errorClass,
        errorMessage: message,
        finishedAt: new Date().toISOString(),
      }).catch(() => null);
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

export async function syncMetaReports(businessId: string): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(businessId).catch(() => null);
  if (!credentials?.accountIds?.length) {
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }
  await expireStaleMetaSyncJobs({ businessId }).catch(() => null);
  await cleanupMetaPartitionOrchestration({ businessId }).catch(() => null);
  await requeueMetaRetryableFailedPartitions({ businessId }).catch(() => []);

  const lockKey = `background:${businessId}`;
  const backgroundSyncKeys = getBackgroundSyncKeys();
  if (backgroundSyncKeys.has(lockKey)) {
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }

  backgroundSyncKeys.add(lockKey);
  const workerId = getMetaWorkerId();
  try {
    await refreshMetaSyncStateForBusiness({ businessId, credentials }).catch(() => null);
    const queueHealthBeforeEnqueue = await getMetaQueueHealth({ businessId }).catch(() => null);
    const hasCoreBacklog =
      (queueHealthBeforeEnqueue?.coreQueueDepth ?? 0) > 0 ||
      (queueHealthBeforeEnqueue?.coreLeasedPartitions ?? 0) > 0;
    const hasMaintenanceBacklog =
      (queueHealthBeforeEnqueue?.maintenanceQueueDepth ?? 0) > 0 ||
      (queueHealthBeforeEnqueue?.maintenanceLeasedPartitions ?? 0) > 0;

    if (!hasCoreBacklog) {
      await enqueueMetaHistoricalCorePartitions(businessId, credentials).catch(() => 0);
    }
    if (!hasMaintenanceBacklog) {
      await enqueueMetaMaintenancePartitions(businessId, credentials).catch(() => 0);
    }

    const leasedMaintenancePartitions = await leaseMetaSyncPartitions({
      businessId,
      lane: "maintenance",
      workerId,
      limit: META_MAINTENANCE_WORKER_LIMIT,
      leaseMinutes: META_PARTITION_LEASE_MINUTES,
    }).catch(() => []);
    const queueHealthAfterPriorityLeases = await getMetaQueueHealth({ businessId }).catch(() => null);
    const hasMaintenanceBacklogAfterLeasing =
      (queueHealthAfterPriorityLeases?.maintenanceQueueDepth ?? 0) > 0 ||
      (queueHealthAfterPriorityLeases?.maintenanceLeasedPartitions ?? 0) > 0;
    const hasExtendedRecentBacklog =
      (queueHealthAfterPriorityLeases?.extendedRecentQueueDepth ?? 0) > 0 ||
      (queueHealthAfterPriorityLeases?.extendedRecentLeasedPartitions ?? 0) > 0;
    const hasHistoricalCoreBacklog =
      (queueHealthAfterPriorityLeases?.historicalCoreQueueDepth ?? 0) > 0 ||
      (queueHealthAfterPriorityLeases?.historicalCoreLeasedPartitions ?? 0) > 0;

    const leasedExtendedRecentPartitions =
      !hasMaintenanceBacklogAfterLeasing
        ? await leaseMetaSyncPartitions({
            businessId,
            lane: "extended",
            sources: ["recent", "recent_recovery", "today", "priority_window", "request_runtime", "manual_refresh"],
            workerId,
            limit: META_EXTENDED_WORKER_LIMIT,
            leaseMinutes: META_PARTITION_LEASE_MINUTES,
          }).catch(() => [])
        : [];

    const leasedHistoricalCorePartitions =
      !hasMaintenanceBacklogAfterLeasing && (!hasExtendedRecentBacklog || leasedExtendedRecentPartitions.length === 0)
        ? await leaseMetaSyncPartitions({
            businessId,
            lane: "core",
            workerId,
            limit: META_CORE_WORKER_LIMIT,
            leaseMinutes: META_PARTITION_LEASE_MINUTES,
          }).catch(() => [])
        : [];

    const leasedExtendedHistoricalPartitions =
      !hasMaintenanceBacklogAfterLeasing &&
      !hasExtendedRecentBacklog &&
      !hasHistoricalCoreBacklog
        ? await leaseMetaSyncPartitions({
            businessId,
            lane: "extended",
            sources: ["historical", "historical_recovery", "initial_connect"],
            workerId,
            limit: META_EXTENDED_WORKER_LIMIT,
            leaseMinutes: META_PARTITION_LEASE_MINUTES,
          }).catch(() => [])
        : [];

    let partitions = [
      ...leasedMaintenancePartitions,
      ...leasedExtendedRecentPartitions,
      ...leasedHistoricalCorePartitions,
      ...leasedExtendedHistoricalPartitions,
    ];
    if (partitions.length === 0) {
      const queueHealth = await getMetaQueueHealth({ businessId }).catch(() => null);
      if ((queueHealth?.queueDepth ?? 0) > 0 || (queueHealth?.leasedPartitions ?? 0) > 0) {
        console.warn("[meta-sync] queue_idle_without_lease", {
          businessId,
          queueDepth: queueHealth?.queueDepth ?? 0,
          leasedPartitions: queueHealth?.leasedPartitions ?? 0,
          latestCoreActivityAt: queueHealth?.latestCoreActivityAt ?? null,
          latestMaintenanceActivityAt: queueHealth?.latestMaintenanceActivityAt ?? null,
          latestExtendedActivityAt: queueHealth?.latestExtendedActivityAt ?? null,
        });
        scheduleMetaBackgroundSync({ businessId, delayMs: META_BACKGROUND_LOOP_DELAY_MS });
      }
      return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
    }

    let attempted = partitions.length;
    let succeeded = 0;
    let failed = 0;
    for (const partition of partitions) {
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
          source: partition.source,
        },
        workerId,
      });
      if (ok) succeeded += 1;
      else failed += 1;
    }

    await refreshMetaSyncStateForBusiness({ businessId, credentials }).catch(() => null);
    const queueHealth = await getMetaQueueHealth({ businessId }).catch(() => null);
    if ((queueHealth?.queueDepth ?? 0) > 0 || (queueHealth?.leasedPartitions ?? 0) > 0) {
      scheduleMetaBackgroundSync({ businessId, delayMs: META_BACKGROUND_LOOP_DELAY_MS });
    }
    return {
      businessId,
      attempted,
      succeeded,
      failed,
      skipped: attempted === 0,
    };
  } finally {
    backgroundSyncKeys.delete(lockKey);
  }
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
    return { businessId: input.businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
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
    scopes: input.triggerSource === "priority_window" ? ["account_daily", "adset_daily", "creative_daily", "ad_daily"] : META_CORE_SCOPES,
    priority: input.triggerSource === "priority_window" ? 90 : 40,
  });
}

export async function syncMetaRecent(businessId: string): Promise<MetaSyncResult> {
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
    scopes: META_CORE_SCOPES,
    priority: 50,
  });
}

export async function syncMetaToday(businessId: string): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }
  const today = getMetaReferenceToday(credentials);
  return enqueueMetaRangeJob({
    businessId,
    startDate: today,
    endDate: today,
    triggerSource: "today",
    syncType: "today_refresh",
    lane: "maintenance",
    scopes: ["account_daily", "adset_daily", "creative_daily", "ad_daily"],
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
    triggerSource: "priority_window",
    syncType: "repair_window",
    lane: "maintenance",
    scopes: ["account_daily", "adset_daily", "creative_daily", "ad_daily"],
    priority: 90,
  });
}

export async function syncMetaInitial(businessId: string): Promise<MetaSyncResult> {
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
    scopes: META_CORE_SCOPES,
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
    getLatestMetaSyncHealth({ businessId: input.businessId, providerAccountId: null }).catch(() => null),
    Promise.all(
      META_STATE_SCOPES.map((scope) =>
        getMetaSyncState({
          businessId: input.businessId,
          scope,
        }).catch(() => [])
      )
    ),
  ]);
  return { completion, queueHealth, latestSync, states };
}
