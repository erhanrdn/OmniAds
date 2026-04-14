import { getAdminOperationsHealth } from "@/lib/admin-operations-health";
import { getDbWithTimeout } from "@/lib/db";
import { dayCountInclusive } from "@/lib/meta/history";
import {
  getLatestMetaSyncHealth,
  getMetaAccountDailyCoverage,
  getMetaAdDailyCoverage,
  getMetaAdSetDailyCoverage,
  getMetaAuthoritativeBusinessOpsSnapshot,
  getMetaCampaignDailyCoverage,
  getMetaCreativeDailyCoverage,
  getMetaQueueComposition,
  getMetaQueueHealth,
} from "@/lib/meta/warehouse";
import { getMetaSelectedRangeTruthReadiness } from "@/lib/sync/meta-sync";
import type {
  ProviderActivityState,
  ProviderProgressState,
} from "@/lib/sync/provider-status-truth";

export type MetaDrainState =
  | "clear"
  | "large_but_draining"
  | "large_and_not_draining";

export type MetaBenchmarkObservedState =
  | "ready"
  | "busy"
  | "waiting"
  | "blocked"
  | "stalled";

export interface MetaCoverageSummary {
  completedDays: number;
  totalDays: number;
  readyThroughDate: string | null;
  percent: number;
  complete: boolean;
}

export interface MetaTruthWindowSummary {
  startDate: string;
  endDate: string;
  totalDays: number;
  completedCoreDays: number;
  percent: number;
  truthReady: boolean;
  state: string;
  verificationState: string | null;
  blockingReasons: string[];
  detectorReasonCodes: string[];
  asOf: string | null;
}

export interface MetaSyncBenchmarkSnapshot {
  businessId: string;
  businessName: string | null;
  capturedAt: string;
  windows: {
    recent: {
      startDate: string;
      endDate: string;
      totalDays: number;
    };
    priority: {
      startDate: string;
      endDate: string;
      totalDays: number;
    };
    recentWindowMinutes: number;
  };
  latestSync: {
    syncType: string | null;
    scope: string | null;
    status: string | null;
    triggerSource: string | null;
    triggeredAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    lastError: string | null;
  } | null;
  operator: {
    progressState: ProviderProgressState | null;
    activityState: ProviderActivityState | null;
    stallFingerprints: string[];
    repairBacklog: number;
    validationFailures24h: number;
    lastSuccessfulPublishAt: string | null;
    d1FinalizeNonTerminalCount: number;
    workerOnline: boolean | null;
    workerLastHeartbeatAt: string | null;
    dbConstraint: string | null;
    dbBacklogState: string | null;
  };
  queue: {
    queueDepth: number;
    leasedPartitions: number;
    retryableFailedPartitions: number;
    deadLetterPartitions: number;
    staleLeasePartitions: number;
    oldestQueuedPartition: string | null;
    latestActivityAt: string | null;
    pendingByLane: Record<string, number>;
    pendingByScope: Record<string, number>;
    laneSourceStatusCounts: Array<{
      lane: string;
      source: string;
      status: string;
      count: number;
    }>;
    laneScopeStatusCounts: Array<{
      lane: string;
      scope: string;
      status: string;
      count: number;
    }>;
  };
  userFacing: {
    recentCore: {
      summary: MetaCoverageSummary;
      campaigns: MetaCoverageSummary;
      percent: number;
      complete: boolean;
      readyThroughDate: string | null;
    };
    recentExtended: {
      adsets: MetaCoverageSummary;
      creatives: MetaCoverageSummary;
      ads: MetaCoverageSummary;
    };
    recentSelectedRangeTruth: MetaTruthWindowSummary;
    priorityWindowTruth: MetaTruthWindowSummary;
  };
  syncState: {
    lastCheckpointUpdatedAt: string | null;
    readyThroughDates: Record<string, string | null>;
  };
  velocity: {
    completedLastWindow: number;
    cancelledLastWindow: number;
    deadLetteredLastWindow: number;
    createdLastWindow: number;
    failedLastWindow: number;
    reclaimedLastWindow: number;
    skippedActiveLeaseLastWindow: number;
    netDrainEstimate: number;
    drainState: MetaDrainState;
  };
  counters: {
    totalSucceeded: number;
    totalCancelled: number;
    totalDeadLettered: number;
    totalPartitions: number;
  };
  authoritative: {
    publishedProgression: number;
    repairBacklog: number;
    validationFailures24h: number;
    d1SlaBreaches: number;
    lastSuccessfulPublishAt: string | null;
  };
}

export interface MetaSyncBenchmarkSeriesSummary {
  sampleCount: number;
  startedAt: string | null;
  endedAt: string | null;
  elapsedSeconds: number;
  observedState: MetaBenchmarkObservedState;
  progressObserved: boolean;
  queueDepthDelta: number;
  leasedPartitionsDelta: number;
  terminalPartitionsDuringSample: number;
  createdPartitionsDuringSample: number;
  netTerminalMinusCreated: number;
  recentCoreCompletedDaysDelta: number;
  recentCorePercentDelta: number;
  readyThroughAdvancements: Array<{
    key: string;
    from: string | null;
    to: string | null;
    dayDelta: number;
  }>;
  finalQueueDepth: number;
  finalLeasedPartitions: number;
  finalRecentTruthState: string | null;
  finalOperatorProgressState: ProviderProgressState | null;
  finalOperatorActivityState: ProviderActivityState | null;
  finalDrainState: MetaDrainState;
}

const PENDING_PARTITION_STATUSES = new Set(["queued", "leased", "running"]);

type CoverageRow = {
  completed_days?: number | null;
  ready_through_date?: string | null;
};

type BenchmarkCollectionArgs = {
  businessId: string;
  recentDays: number;
  priorityWindowDays: number;
  recentWindowMinutes: number;
};

function clampPositiveInteger(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIsoTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function toIsoDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(String(value));
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const text = String(value).trim();
  return text.length >= 10 ? text.slice(0, 10) : null;
}

function shiftIsoDate(date: string, deltaDays: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

function compareIsoDate(left: string | null, right: string | null) {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left.localeCompare(right);
}

function diffIsoDateDays(from: string | null, to: string | null) {
  if (!from || !to) return 0;
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86_400_000);
}

function earliestIsoDate(values: Array<string | null | undefined>) {
  const normalized = values
    .map((value) => toIsoDate(value))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
  return normalized[0] ?? null;
}

function latestIsoTimestamp(values: Array<string | null | undefined>) {
  const normalized = values
    .map((value) => toIsoTimestamp(value))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));
  return normalized.at(-1) ?? null;
}

function buildTruthWindowSummary(input: {
  startDate: string;
  endDate: string;
  totalDays: number;
  completedCoreDays: number;
  truthReady: boolean;
  state: string | null | undefined;
  verificationState: string | null | undefined;
  blockingReasons?: string[] | null;
  detectorReasonCodes?: string[] | null;
  asOf?: string | null;
}) : MetaTruthWindowSummary {
  const totalDays = Math.max(0, input.totalDays);
  const completedCoreDays = Math.max(
    0,
    Math.min(totalDays, input.completedCoreDays),
  );
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    totalDays,
    completedCoreDays,
    percent:
      totalDays <= 0
        ? 0
        : Math.max(0, Math.min(100, Math.floor((completedCoreDays / totalDays) * 100))),
    truthReady: input.truthReady,
    state: input.state ?? "processing",
    verificationState: input.verificationState ?? null,
    blockingReasons: [...(input.blockingReasons ?? [])],
    detectorReasonCodes: [...(input.detectorReasonCodes ?? [])],
    asOf: input.asOf ?? null,
  };
}

export function buildMetaCoverageSummary(input: {
  completedDays: number | null | undefined;
  totalDays: number;
  readyThroughDate: string | null | undefined;
}): MetaCoverageSummary {
  const totalDays = Math.max(0, input.totalDays);
  const completedDays = Math.max(
    0,
    Math.min(totalDays, toNumber(input.completedDays)),
  );
  const complete = totalDays > 0 && completedDays >= totalDays;
  return {
    completedDays,
    totalDays,
    readyThroughDate: toIsoDate(input.readyThroughDate),
    percent:
      totalDays <= 0
        ? 0
        : complete
          ? 100
          : Math.max(0, Math.min(99, Math.floor((completedDays / totalDays) * 100))),
    complete,
  };
}

export function classifyMetaDrainState(input: {
  queueDepth: number;
  leasedPartitions: number;
  completedLastWindow: number;
  createdLastWindow: number;
  latestActivityAt: string | null;
  windowMinutes: number;
}): MetaDrainState {
  if (input.queueDepth <= 0) return "clear";
  const latestActivityMs = input.latestActivityAt
    ? new Date(input.latestActivityAt).getTime()
    : Number.NaN;
  const activityRecent =
    Number.isFinite(latestActivityMs) &&
    Date.now() - latestActivityMs <= input.windowMinutes * 60_000;
  if (
    input.leasedPartitions > 0 ||
    input.completedLastWindow > input.createdLastWindow ||
    activityRecent
  ) {
    return "large_but_draining";
  }
  return "large_and_not_draining";
}

function normalizeCoverageRow(
  row: CoverageRow | null | undefined,
  totalDays: number,
) {
  return buildMetaCoverageSummary({
    completedDays: row?.completed_days ?? 0,
    totalDays,
    readyThroughDate: row?.ready_through_date ?? null,
  });
}

function buildSortedCountRecord(
  rows: Array<{ key: string; count: number }>,
) {
  return Object.fromEntries(
    [...rows]
      .sort((left, right) => {
        const countDiff = right.count - left.count;
        return countDiff !== 0 ? countDiff : left.key.localeCompare(right.key);
      })
      .map((row) => [row.key, row.count]),
  );
}

function summarizePendingByLane(
  rows: Array<{ lane: string; scope: string; status: string; count: number }>,
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!PENDING_PARTITION_STATUSES.has(row.status)) continue;
    counts.set(row.lane, (counts.get(row.lane) ?? 0) + row.count);
  }
  return buildSortedCountRecord(
    [...counts.entries()].map(([key, count]) => ({ key, count })),
  );
}

function summarizePendingByScope(
  rows: Array<{ lane: string; scope: string; status: string; count: number }>,
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!PENDING_PARTITION_STATUSES.has(row.status)) continue;
    counts.set(row.scope, (counts.get(row.scope) ?? 0) + row.count);
  }
  return buildSortedCountRecord(
    [...counts.entries()].map(([key, count]) => ({ key, count })),
  );
}

function buildRecentCoreSummary(input: {
  summaryCoverage: MetaCoverageSummary;
  campaignCoverage: MetaCoverageSummary;
}) {
  const percent = Math.min(
    input.summaryCoverage.percent,
    input.campaignCoverage.percent,
  );
  return {
    summary: input.summaryCoverage,
    campaigns: input.campaignCoverage,
    percent,
    complete:
      input.summaryCoverage.complete && input.campaignCoverage.complete,
    readyThroughDate: earliestIsoDate([
      input.summaryCoverage.readyThroughDate,
      input.campaignCoverage.readyThroughDate,
    ]),
  };
}

function getTotalTerminalPartitions(snapshot: MetaSyncBenchmarkSnapshot) {
  return (
    snapshot.counters.totalSucceeded +
    snapshot.counters.totalCancelled +
    snapshot.counters.totalDeadLettered
  );
}

function hasBlockedState(snapshot: MetaSyncBenchmarkSnapshot) {
  return (
    snapshot.operator.progressState === "blocked" ||
    snapshot.operator.activityState === "blocked" ||
    snapshot.userFacing.recentSelectedRangeTruth.state === "blocked" ||
    snapshot.userFacing.priorityWindowTruth.state === "blocked" ||
    snapshot.queue.deadLetterPartitions > 0 ||
    snapshot.queue.staleLeasePartitions > 0
  );
}

function hasReadyState(snapshot: MetaSyncBenchmarkSnapshot) {
  return (
    snapshot.queue.queueDepth === 0 &&
    snapshot.queue.leasedPartitions === 0 &&
    snapshot.queue.retryableFailedPartitions === 0 &&
    snapshot.queue.deadLetterPartitions === 0 &&
    snapshot.userFacing.recentCore.complete &&
    snapshot.userFacing.recentSelectedRangeTruth.truthReady
  );
}

function collectReadyThroughAdvancements(
  start: MetaSyncBenchmarkSnapshot,
  end: MetaSyncBenchmarkSnapshot,
) {
  const keys = new Set([
    ...Object.keys(start.syncState.readyThroughDates),
    ...Object.keys(end.syncState.readyThroughDates),
  ]);
  const advancements: MetaSyncBenchmarkSeriesSummary["readyThroughAdvancements"] = [];
  for (const key of keys) {
    const from = start.syncState.readyThroughDates[key] ?? null;
    const to = end.syncState.readyThroughDates[key] ?? null;
    if (compareIsoDate(from, to) >= 0) continue;
    advancements.push({
      key,
      from,
      to,
      dayDelta: diffIsoDateDays(from, to),
    });
  }
  return advancements.sort((left, right) => right.dayDelta - left.dayDelta);
}

function classifyObservedState(input: {
  start: MetaSyncBenchmarkSnapshot;
  end: MetaSyncBenchmarkSnapshot;
  queueDepthDelta: number;
  terminalPartitionsDuringSample: number;
  createdPartitionsDuringSample: number;
  readyThroughAdvancements: MetaSyncBenchmarkSeriesSummary["readyThroughAdvancements"];
  recentCoreCompletedDaysDelta: number;
}): MetaBenchmarkObservedState {
  if (hasBlockedState(input.end)) return "blocked";
  if (hasReadyState(input.end)) return "ready";

  const observedProgress =
    input.queueDepthDelta < 0 ||
    input.terminalPartitionsDuringSample > 0 ||
    input.readyThroughAdvancements.length > 0 ||
    input.recentCoreCompletedDaysDelta > 0 ||
    input.end.velocity.drainState === "large_but_draining" ||
    input.end.operator.activityState === "busy" ||
    input.end.operator.progressState === "syncing" ||
    input.end.operator.progressState === "partial_progressing";
  if (observedProgress) return "busy";

  if (
    input.end.operator.activityState === "waiting" &&
    input.end.queue.queueDepth > 0 &&
    input.end.queue.leasedPartitions === 0
  ) {
    return "waiting";
  }

  if (
    input.end.operator.activityState === "stalled" ||
    input.end.operator.progressState === "partial_stuck" ||
    input.end.queue.queueDepth > 0 ||
    input.end.queue.leasedPartitions > 0
  ) {
    return "stalled";
  }

  return "waiting";
}

export function summarizeMetaSyncBenchmarkSeries(
  samples: MetaSyncBenchmarkSnapshot[],
): MetaSyncBenchmarkSeriesSummary {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      startedAt: null,
      endedAt: null,
      elapsedSeconds: 0,
      observedState: "waiting",
      progressObserved: false,
      queueDepthDelta: 0,
      leasedPartitionsDelta: 0,
      terminalPartitionsDuringSample: 0,
      createdPartitionsDuringSample: 0,
      netTerminalMinusCreated: 0,
      recentCoreCompletedDaysDelta: 0,
      recentCorePercentDelta: 0,
      readyThroughAdvancements: [],
      finalQueueDepth: 0,
      finalLeasedPartitions: 0,
      finalRecentTruthState: null,
      finalOperatorProgressState: null,
      finalOperatorActivityState: null,
      finalDrainState: "clear",
    };
  }

  const start = samples[0];
  const end = samples.at(-1) ?? start;
  const startedAtMs = start.capturedAt ? new Date(start.capturedAt).getTime() : Number.NaN;
  const endedAtMs = end.capturedAt ? new Date(end.capturedAt).getTime() : Number.NaN;
  const elapsedSeconds =
    Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs)
      ? Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000))
      : 0;
  const queueDepthDelta = end.queue.queueDepth - start.queue.queueDepth;
  const leasedPartitionsDelta =
    end.queue.leasedPartitions - start.queue.leasedPartitions;
  const terminalPartitionsDuringSample = Math.max(
    0,
    getTotalTerminalPartitions(end) - getTotalTerminalPartitions(start),
  );
  const createdPartitionsDuringSample = Math.max(
    0,
    end.counters.totalPartitions - start.counters.totalPartitions,
  );
  const recentCoreCompletedDaysDelta =
    end.userFacing.recentCore.summary.completedDays -
    start.userFacing.recentCore.summary.completedDays;
  const recentCorePercentDelta =
    end.userFacing.recentCore.percent - start.userFacing.recentCore.percent;
  const readyThroughAdvancements = collectReadyThroughAdvancements(start, end);
  const observedState = classifyObservedState({
    start,
    end,
    queueDepthDelta,
    terminalPartitionsDuringSample,
    createdPartitionsDuringSample,
    readyThroughAdvancements,
    recentCoreCompletedDaysDelta,
  });
  const progressObserved =
    observedState === "busy" ||
    queueDepthDelta < 0 ||
    terminalPartitionsDuringSample > 0 ||
    readyThroughAdvancements.length > 0 ||
    recentCoreCompletedDaysDelta > 0;

  return {
    sampleCount: samples.length,
    startedAt: start.capturedAt,
    endedAt: end.capturedAt,
    elapsedSeconds,
    observedState,
    progressObserved,
    queueDepthDelta,
    leasedPartitionsDelta,
    terminalPartitionsDuringSample,
    createdPartitionsDuringSample,
    netTerminalMinusCreated:
      terminalPartitionsDuringSample - createdPartitionsDuringSample,
    recentCoreCompletedDaysDelta,
    recentCorePercentDelta,
    readyThroughAdvancements,
    finalQueueDepth: end.queue.queueDepth,
    finalLeasedPartitions: end.queue.leasedPartitions,
    finalRecentTruthState: end.userFacing.recentSelectedRangeTruth.state,
    finalOperatorProgressState: end.operator.progressState,
    finalOperatorActivityState: end.operator.activityState,
    finalDrainState: end.velocity.drainState,
  };
}

export async function collectMetaSyncReadinessSnapshot(
  input: BenchmarkCollectionArgs,
): Promise<MetaSyncBenchmarkSnapshot> {
  const recentDays = clampPositiveInteger(input.recentDays, 14);
  const priorityWindowDays = clampPositiveInteger(input.priorityWindowDays, 3);
  const recentWindowMinutes = clampPositiveInteger(input.recentWindowMinutes, 15);
  const capturedAt = new Date().toISOString();
  const admin = await getAdminOperationsHealth();
  const metaBusiness = admin.syncHealth.metaBusinesses?.find(
    (business) => business.businessId === input.businessId,
  );
  if (!metaBusiness) {
    throw new Error(
      `Meta benchmark business ${input.businessId} is not visible in admin sync health.`,
    );
  }

  const recentEndDate =
    metaBusiness.currentDayReference ?? capturedAt.slice(0, 10);
  const recentStartDate = shiftIsoDate(recentEndDate, -(recentDays - 1));
  const priorityEndDate = recentEndDate;
  const priorityStartDate = shiftIsoDate(
    priorityEndDate,
    -(priorityWindowDays - 1),
  );
  const recentTotalDays = dayCountInclusive(recentStartDate, recentEndDate);
  const priorityTotalDays = dayCountInclusive(priorityStartDate, priorityEndDate);
  const sql = getDbWithTimeout(60_000);

  const [
    queueHealth,
    queueComposition,
    latestSync,
    authoritative,
    recentTruth,
    priorityTruth,
    accountCoverage,
    campaignCoverage,
    adsetCoverage,
    creativeCoverage,
    adCoverage,
    recentWindowRows,
    laneScopeRows,
  ] = await Promise.all([
    getMetaQueueHealth({ businessId: input.businessId }),
    getMetaQueueComposition({ businessId: input.businessId }),
    getLatestMetaSyncHealth({ businessId: input.businessId }),
    getMetaAuthoritativeBusinessOpsSnapshot({ businessId: input.businessId }),
    getMetaSelectedRangeTruthReadiness({
      businessId: input.businessId,
      startDate: recentStartDate,
      endDate: recentEndDate,
    }),
    getMetaSelectedRangeTruthReadiness({
      businessId: input.businessId,
      startDate: priorityStartDate,
      endDate: priorityEndDate,
    }),
    getMetaAccountDailyCoverage({
      businessId: input.businessId,
      startDate: recentStartDate,
      endDate: recentEndDate,
    }),
    getMetaCampaignDailyCoverage({
      businessId: input.businessId,
      startDate: recentStartDate,
      endDate: recentEndDate,
    }),
    getMetaAdSetDailyCoverage({
      businessId: input.businessId,
      startDate: recentStartDate,
      endDate: recentEndDate,
    }),
    getMetaCreativeDailyCoverage({
      businessId: input.businessId,
      startDate: recentStartDate,
      endDate: recentEndDate,
    }),
    getMetaAdDailyCoverage({
      businessId: input.businessId,
      startDate: recentStartDate,
      endDate: recentEndDate,
    }),
    sql.query(
      `
        WITH recent_reclaims AS (
          SELECT
            COUNT(*) FILTER (WHERE event_type = 'reclaimed')::int AS reclaimed_last_window,
            COUNT(*) FILTER (WHERE event_type = 'skipped_active_lease')::int AS skipped_active_lease_last_window
          FROM sync_reclaim_events
          WHERE provider_scope = 'meta'
            AND business_id = $1
            AND created_at >= now() - ($2::int || ' minutes')::interval
        )
        SELECT
          COUNT(*) FILTER (
            WHERE status = 'succeeded'
              AND finished_at >= now() - ($2::int || ' minutes')::interval
          )::int AS completed_last_window,
          COUNT(*) FILTER (
            WHERE status = 'cancelled'
              AND finished_at >= now() - ($2::int || ' minutes')::interval
          )::int AS cancelled_last_window,
          COUNT(*) FILTER (
            WHERE status = 'dead_letter'
              AND finished_at >= now() - ($2::int || ' minutes')::interval
          )::int AS dead_lettered_last_window,
          COUNT(*) FILTER (
            WHERE created_at >= now() - ($2::int || ' minutes')::interval
          )::int AS created_last_window,
          COUNT(*) FILTER (
            WHERE status = 'failed'
              AND updated_at >= now() - ($2::int || ' minutes')::interval
          )::int AS failed_last_window,
          COUNT(*) FILTER (WHERE status = 'succeeded')::int AS total_succeeded,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS total_cancelled,
          COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS total_dead_lettered,
          COUNT(*)::int AS total_partitions,
          MAX(updated_at) AS latest_activity_at,
          COALESCE(
            (SELECT reclaimed_last_window FROM recent_reclaims),
            0
          )::int AS reclaimed_last_window,
          COALESCE(
            (SELECT skipped_active_lease_last_window FROM recent_reclaims),
            0
          )::int AS skipped_active_lease_last_window
        FROM meta_sync_partitions
        WHERE business_id = $1
      `,
      [input.businessId, recentWindowMinutes],
    ),
    sql.query(
      `
        SELECT
          lane,
          scope,
          status,
          COUNT(*)::int AS count
        FROM meta_sync_partitions
        WHERE business_id = $1
        GROUP BY lane, scope, status
        ORDER BY lane, scope, status
      `,
      [input.businessId],
    ),
  ]);

  const recentWindowRow = recentWindowRows[0] ?? {};
  const summaryCoverage = normalizeCoverageRow(accountCoverage, recentTotalDays);
  const campaignsCoverage = normalizeCoverageRow(campaignCoverage, recentTotalDays);
  const adsetsCoverage = normalizeCoverageRow(adsetCoverage, recentTotalDays);
  const creativesCoverage = normalizeCoverageRow(creativeCoverage, recentTotalDays);
  const adsCoverage = normalizeCoverageRow(adCoverage, recentTotalDays);
  const normalizedLaneScopeRows = laneScopeRows.map((row) => ({
    lane: String(row.lane ?? ""),
    scope: String(row.scope ?? ""),
    status: String(row.status ?? ""),
    count: toNumber(row.count),
  }));
  const completedLastWindow = toNumber(recentWindowRow.completed_last_window);
  const cancelledLastWindow = toNumber(recentWindowRow.cancelled_last_window);
  const deadLetteredLastWindow = toNumber(
    recentWindowRow.dead_lettered_last_window,
  );
  const createdLastWindow = toNumber(recentWindowRow.created_last_window);
  const latestActivityAt = latestIsoTimestamp([
    queueHealth.latestCoreActivityAt,
    queueHealth.latestExtendedActivityAt,
    queueHealth.latestMaintenanceActivityAt,
    toIsoTimestamp(recentWindowRow.latest_activity_at),
    metaBusiness.latestPartitionActivityAt ?? null,
  ]);

  return {
    businessId: input.businessId,
    businessName: metaBusiness.businessName,
    capturedAt,
    windows: {
      recent: {
        startDate: recentStartDate,
        endDate: recentEndDate,
        totalDays: recentTotalDays,
      },
      priority: {
        startDate: priorityStartDate,
        endDate: priorityEndDate,
        totalDays: priorityTotalDays,
      },
      recentWindowMinutes,
    },
    latestSync: latestSync
      ? {
          syncType:
            typeof latestSync.sync_type === "string"
              ? latestSync.sync_type
              : null,
          scope:
            typeof latestSync.scope === "string" ? latestSync.scope : null,
          status:
            typeof latestSync.status === "string" ? latestSync.status : null,
          triggerSource:
            typeof latestSync.trigger_source === "string"
              ? latestSync.trigger_source
              : null,
          triggeredAt: toIsoTimestamp(latestSync.triggered_at),
          startedAt: toIsoTimestamp(latestSync.started_at),
          finishedAt: toIsoTimestamp(latestSync.finished_at),
          lastError:
            typeof latestSync.last_error === "string"
              ? latestSync.last_error
              : null,
        }
      : null,
    operator: {
      progressState: metaBusiness.progressState ?? null,
      activityState: metaBusiness.activityState ?? null,
      stallFingerprints: [...(metaBusiness.stallFingerprints ?? [])],
      repairBacklog: metaBusiness.repairBacklog ?? 0,
      validationFailures24h: metaBusiness.validationFailures24h ?? 0,
      lastSuccessfulPublishAt: metaBusiness.lastSuccessfulPublishAt ?? null,
      d1FinalizeNonTerminalCount:
        metaBusiness.d1FinalizeNonTerminalCount ?? 0,
      workerOnline: admin.syncHealth.summary.workerOnline ?? null,
      workerLastHeartbeatAt:
        admin.syncHealth.summary.workerLastHeartbeatAt ?? null,
      dbConstraint:
        admin.syncHealth.dbDiagnostics?.summary.likelyPrimaryConstraint ?? null,
      dbBacklogState:
        admin.syncHealth.dbDiagnostics?.summary.metaBacklogState ?? null,
    },
    queue: {
      queueDepth: queueHealth.queueDepth,
      leasedPartitions: queueHealth.leasedPartitions,
      retryableFailedPartitions: queueHealth.retryableFailedPartitions,
      deadLetterPartitions: queueHealth.deadLetterPartitions,
      staleLeasePartitions: metaBusiness.staleLeasePartitions,
      oldestQueuedPartition: queueHealth.oldestQueuedPartition,
      latestActivityAt,
      pendingByLane: summarizePendingByLane(normalizedLaneScopeRows),
      pendingByScope: summarizePendingByScope(normalizedLaneScopeRows),
      laneSourceStatusCounts: queueComposition.laneSourceStatusCounts,
      laneScopeStatusCounts: normalizedLaneScopeRows,
    },
    userFacing: {
      recentCore: buildRecentCoreSummary({
        summaryCoverage,
        campaignCoverage: campaignsCoverage,
      }),
      recentExtended: {
        adsets: adsetsCoverage,
        creatives: creativesCoverage,
        ads: adsCoverage,
      },
      recentSelectedRangeTruth: buildTruthWindowSummary({
        startDate: recentStartDate,
        endDate: recentEndDate,
        totalDays: recentTruth.totalDays,
        completedCoreDays: recentTruth.completedCoreDays,
        truthReady: recentTruth.truthReady,
        state: recentTruth.state,
        verificationState: recentTruth.verificationState,
        blockingReasons: recentTruth.blockingReasons,
        detectorReasonCodes: recentTruth.detectorReasonCodes,
        asOf: recentTruth.asOf,
      }),
      priorityWindowTruth: buildTruthWindowSummary({
        startDate: priorityStartDate,
        endDate: priorityEndDate,
        totalDays: priorityTruth.totalDays,
        completedCoreDays: priorityTruth.completedCoreDays,
        truthReady: priorityTruth.truthReady,
        state: priorityTruth.state,
        verificationState: priorityTruth.verificationState,
        blockingReasons: priorityTruth.blockingReasons,
        detectorReasonCodes: priorityTruth.detectorReasonCodes,
        asOf: priorityTruth.asOf,
      }),
    },
    syncState: {
      lastCheckpointUpdatedAt: metaBusiness.latestCheckpointUpdatedAt ?? null,
      readyThroughDates: {
        recent_summary: summaryCoverage.readyThroughDate,
        recent_campaigns: campaignsCoverage.readyThroughDate,
        recent_adsets: adsetsCoverage.readyThroughDate,
        recent_creatives: creativesCoverage.readyThroughDate,
        recent_ads: adsCoverage.readyThroughDate,
        account_state: metaBusiness.accountReadyThroughDate ?? null,
        adset_state: metaBusiness.adsetReadyThroughDate ?? null,
        creative_state: metaBusiness.creativeReadyThroughDate ?? null,
        ad_state: metaBusiness.adReadyThroughDate ?? null,
      },
    },
    velocity: {
      completedLastWindow,
      cancelledLastWindow,
      deadLetteredLastWindow,
      createdLastWindow,
      failedLastWindow: toNumber(recentWindowRow.failed_last_window),
      reclaimedLastWindow: toNumber(recentWindowRow.reclaimed_last_window),
      skippedActiveLeaseLastWindow: toNumber(
        recentWindowRow.skipped_active_lease_last_window,
      ),
      netDrainEstimate:
        completedLastWindow +
        cancelledLastWindow +
        deadLetteredLastWindow -
        createdLastWindow,
      drainState: classifyMetaDrainState({
        queueDepth: queueHealth.queueDepth,
        leasedPartitions: queueHealth.leasedPartitions,
        completedLastWindow,
        createdLastWindow,
        latestActivityAt,
        windowMinutes: recentWindowMinutes,
      }),
    },
    counters: {
      totalSucceeded: toNumber(recentWindowRow.total_succeeded),
      totalCancelled: toNumber(recentWindowRow.total_cancelled),
      totalDeadLettered: toNumber(recentWindowRow.total_dead_lettered),
      totalPartitions: toNumber(recentWindowRow.total_partitions),
    },
    authoritative: {
      publishedProgression: authoritative.progression.published,
      repairBacklog: authoritative.progression.repairBacklog,
      validationFailures24h: authoritative.validationFailures24h,
      d1SlaBreaches: authoritative.d1FinalizeSla.breachedAccounts,
      lastSuccessfulPublishAt: authoritative.lastSuccessfulPublishAt,
    },
  };
}
