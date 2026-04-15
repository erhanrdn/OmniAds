import type { DbRuntimeDiagnostics, DbRuntimeRole } from "@/lib/db";

const RECENT_DB_PRESSURE_WINDOW_MS = 15 * 60_000;

export type AdminDbPressureState = "healthy" | "elevated" | "saturated" | "unknown";
export type AdminMetaBacklogState = "clear" | "draining" | "stalled";
export type AdminDbPrimaryConstraint =
  | "none"
  | "db"
  | "worker_unavailable"
  | "scheduler_or_queue"
  | "mixed"
  | "unknown";

export interface AdminDbProcessDiagnostics extends DbRuntimeDiagnostics {
  workerId?: string | null;
  providerScope?: string | null;
  workerStatus?: string | null;
  lastHeartbeatAt?: string | null;
}

export interface AdminDbDiagnosticsPayload {
  sampledAt: string;
  web: AdminDbProcessDiagnostics | null;
  workers: AdminDbProcessDiagnostics[];
  summary: {
    webPressureState: AdminDbPressureState;
    workerPressureState: AdminDbPressureState;
    metaBacklogState: AdminMetaBacklogState;
    likelyPrimaryConstraint: AdminDbPrimaryConstraint;
    headline: string;
    evidence: string[];
    workerCount: number;
    metaQueueDepth: number;
    metaLeasedPartitions: number;
    workerCurrentPoolWaiters: number;
    workerMaxObservedPoolWaiters: number;
    workerTimeoutCount: number;
    workerRetryableErrorCount: number;
    workerConnectionErrorCount: number;
  };
}

interface AdminDbWorkerInput {
  workerId: string;
  providerScope: string;
  status: string;
  lastHeartbeatAt: string | null;
  metaJson?: Record<string, unknown> | null;
}

interface AdminMetaBacklogInput {
  queueDepth: number;
  leasedPartitions: number;
  progressState?: string | null;
  activityState?: string | null;
  workerOnline?: boolean | null;
}

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readRuntime(value: unknown): DbRuntimeRole | null {
  return value === "web" || value === "worker" ? value : null;
}

function readSaturationState(value: unknown): DbRuntimeDiagnostics["pool"]["saturationState"] {
  return value === "busy" || value === "saturated" ? value : "idle";
}

function isRecent(timestamp: string | null | undefined, nowMs: number) {
  if (!timestamp) return false;
  const ts = new Date(timestamp).getTime();
  return Number.isFinite(ts) && nowMs - ts <= RECENT_DB_PRESSURE_WINDOW_MS;
}

function coerceDbRuntimeDiagnostics(value: unknown): DbRuntimeDiagnostics | null {
  if (!isRecord(value)) return null;
  const settings = isRecord(value.settings) ? value.settings : null;
  const pool = isRecord(value.pool) ? value.pool : null;
  const counters = isRecord(value.counters) ? value.counters : null;
  if (!settings || !pool || !counters) return null;

  const runtime = readRuntime(value.runtime);
  const settingsRuntime = readRuntime(settings.runtime);
  if (!runtime || !settingsRuntime) return null;
  const applicationName = readString(value.applicationName) ?? readString(settings.applicationName);
  if (!applicationName) return null;

  const lastError =
    isRecord(value.lastError) && readString(value.lastError.message)
      ? {
          at: readString(value.lastError.at) ?? nowIso(),
          code: readString(value.lastError.code),
          message: readString(value.lastError.message) ?? "unknown",
          retryable: Boolean(value.lastError.retryable),
          timeout: Boolean(value.lastError.timeout),
          connection: Boolean(value.lastError.connection),
        }
      : null;

  return {
    sampledAt: readString(value.sampledAt) ?? nowIso(),
    runtime,
    applicationName,
    settings: {
      runtime: settingsRuntime,
      applicationName: readString(settings.applicationName) ?? applicationName,
      poolMax: readNumber(settings.poolMax, 0),
      queryTimeoutMs: readNumber(settings.queryTimeoutMs, 0),
      connectionTimeoutMs: readNumber(settings.connectionTimeoutMs, 0),
      idleTimeoutMs: readNumber(settings.idleTimeoutMs, 0),
      maxLifetimeSeconds:
        settings.maxLifetimeSeconds == null ? null : readNumber(settings.maxLifetimeSeconds, 0),
      statementTimeoutMs:
        settings.statementTimeoutMs == null ? null : readNumber(settings.statementTimeoutMs, 0),
      idleInTransactionSessionTimeoutMs:
        settings.idleInTransactionSessionTimeoutMs == null
          ? null
          : readNumber(settings.idleInTransactionSessionTimeoutMs, 0),
      retryAttempts: readNumber(settings.retryAttempts, 0),
      retryBackoffMs: readNumber(settings.retryBackoffMs, 0),
      retryMaxBackoffMs: readNumber(settings.retryMaxBackoffMs, 0),
      allowExitOnIdle: Boolean(settings.allowExitOnIdle),
    },
    pool: {
      max: readNumber(pool.max, 0),
      totalCount: readNumber(pool.totalCount, 0),
      idleCount: readNumber(pool.idleCount, 0),
      waitingCount: readNumber(pool.waitingCount, 0),
      utilizationPercent: readNumber(pool.utilizationPercent, 0),
      saturationState: readSaturationState(pool.saturationState),
      maxObservedWaitingCount: readNumber(pool.maxObservedWaitingCount, 0),
      maxObservedUtilizationPercent: readNumber(pool.maxObservedUtilizationPercent, 0),
      poolWaitEventCount: readNumber(pool.poolWaitEventCount, 0),
      lastPoolWaitAt: readString(pool.lastPoolWaitAt),
    },
    counters: {
      queryCount: readNumber(counters.queryCount, 0),
      successCount: readNumber(counters.successCount, 0),
      failureCount: readNumber(counters.failureCount, 0),
      retriedQueryCount: readNumber(counters.retriedQueryCount, 0),
      retryAttemptCount: readNumber(counters.retryAttemptCount, 0),
      retryableErrorCount: readNumber(counters.retryableErrorCount, 0),
      timeoutCount: readNumber(counters.timeoutCount, 0),
      connectionErrorCount: readNumber(counters.connectionErrorCount, 0),
      lastSuccessfulQueryAt: readString(counters.lastSuccessfulQueryAt),
      lastRetryableErrorAt: readString(counters.lastRetryableErrorAt),
      lastTimeoutAt: readString(counters.lastTimeoutAt),
      lastConnectionErrorAt: readString(counters.lastConnectionErrorAt),
    },
    lastError,
  };
}

export function buildWorkerDbProcessDiagnostics(workers: AdminDbWorkerInput[] = []) {
  const diagnostics: AdminDbProcessDiagnostics[] = [];
  for (const worker of workers) {
    const dbRuntime = coerceDbRuntimeDiagnostics(worker.metaJson?.dbRuntime);
    if (!dbRuntime) continue;
    diagnostics.push({
      ...dbRuntime,
      workerId: worker.workerId,
      providerScope: worker.providerScope,
      workerStatus: worker.status,
      lastHeartbeatAt: worker.lastHeartbeatAt,
    });
  }
  return diagnostics;
}

function classifyDbPressureState(
  processes: Array<Pick<AdminDbProcessDiagnostics, "pool" | "counters" | "lastError">>,
  nowMs: number,
): AdminDbPressureState {
  if (processes.length === 0) return "unknown";
  const currentWaiters = Math.max(...processes.map((process) => process.pool.waitingCount), 0);
  const maxObservedWaiters = Math.max(
    ...processes.map((process) => process.pool.maxObservedWaitingCount),
    0,
  );
  const maxUtilization = Math.max(
    ...processes.map((process) => process.pool.utilizationPercent),
    0,
  );
  const maxObservedUtilization = Math.max(
    ...processes.map((process) => process.pool.maxObservedUtilizationPercent),
    0,
  );
  const hasRecentTimeout = processes.some(
    (process) =>
      isRecent(process.counters.lastTimeoutAt, nowMs) ||
      (process.lastError?.timeout && isRecent(process.lastError.at, nowMs)),
  );
  const hasRecentConnectionPressure = processes.some(
    (process) =>
      isRecent(process.counters.lastConnectionErrorAt, nowMs) ||
      (process.lastError?.connection && isRecent(process.lastError.at, nowMs)),
  );
  const hasRecentRetryPressure = processes.some((process) =>
    isRecent(process.counters.lastRetryableErrorAt, nowMs),
  );

  if (
    currentWaiters > 0 ||
    maxObservedWaiters > 0 ||
    (hasRecentTimeout && Math.max(maxUtilization, maxObservedUtilization) >= 80)
  ) {
    return "saturated";
  }
  if (
    hasRecentTimeout ||
    hasRecentConnectionPressure ||
    hasRecentRetryPressure ||
    maxUtilization >= 80 ||
    maxObservedUtilization >= 80 ||
    processes.some((process) => process.pool.saturationState === "busy")
  ) {
    return "elevated";
  }
  return "healthy";
}

function classifyMetaBacklogState(
  metaQueueDepth: number,
  metaBusinesses: AdminMetaBacklogInput[],
): AdminMetaBacklogState {
  if (metaQueueDepth <= 0) return "clear";
  const draining = metaBusinesses.some(
    (business) =>
      business.leasedPartitions > 0 ||
      business.activityState === "busy" ||
      business.progressState === "syncing" ||
      business.progressState === "partial_progressing",
  );
  return draining ? "draining" : "stalled";
}

function derivePrimaryConstraint(input: {
  metaBacklogState: AdminMetaBacklogState;
  workerPressureState: AdminDbPressureState;
  workerUnavailable: boolean;
}): AdminDbPrimaryConstraint {
  if (input.metaBacklogState === "clear") return "none";
  if (input.workerUnavailable) return "worker_unavailable";
  if (input.workerPressureState === "unknown") return "unknown";
  if (input.metaBacklogState === "draining" && input.workerPressureState !== "healthy") {
    return "db";
  }
  if (input.metaBacklogState === "stalled" && input.workerPressureState === "healthy") {
    return "scheduler_or_queue";
  }
  if (input.metaBacklogState === "stalled" && input.workerPressureState !== "healthy") {
    return "mixed";
  }
  return "none";
}

function buildHeadline(input: {
  metaBacklogState: AdminMetaBacklogState;
  workerPressureState: AdminDbPressureState;
  likelyPrimaryConstraint: AdminDbPrimaryConstraint;
}) {
  if (input.metaBacklogState === "clear") {
    return "Meta queue is clear and worker DB pressure is not currently evident.";
  }
  if (input.likelyPrimaryConstraint === "worker_unavailable") {
    return "Meta backlog is not draining because no fresh Meta worker heartbeat or active lease is visible for the stalled business backlog.";
  }
  if (input.workerPressureState === "unknown") {
    return "Meta backlog exists, but worker DB pressure is not yet visible in heartbeat diagnostics.";
  }
  if (input.likelyPrimaryConstraint === "db") {
    return "Meta backlog is still draining, but worker DB pressure now looks like the practical ceiling.";
  }
  if (input.likelyPrimaryConstraint === "scheduler_or_queue") {
    return "Meta backlog is not draining and worker DB pressure looks healthy, so scheduler or queue ownership is the likelier bottleneck.";
  }
  if (input.likelyPrimaryConstraint === "mixed") {
    return "Meta backlog is not draining and worker DB pressure is elevated, so scheduler and DB effects may both be contributing.";
  }
  return "Meta backlog is draining and worker DB pressure currently looks healthy.";
}

export function buildAdminDbDiagnostics(input: {
  web: DbRuntimeDiagnostics | null;
  workers?: AdminDbProcessDiagnostics[];
  metaQueueDepth: number;
  metaLeasedPartitions: number;
  metaBusinesses?: AdminMetaBacklogInput[];
  nowMs?: number;
}): AdminDbDiagnosticsPayload {
  const nowMs = input.nowMs ?? Date.now();
  const workers = [...(input.workers ?? [])];
  const metaBusinesses = input.metaBusinesses ?? [];
  const web =
    input.web == null
      ? null
      : ({
          ...input.web,
        } satisfies AdminDbProcessDiagnostics);
  const webPressureState = web ? classifyDbPressureState([web], nowMs) : "unknown";
  const workerPressureState = classifyDbPressureState(workers, nowMs);
  const metaBacklogState = classifyMetaBacklogState(input.metaQueueDepth, metaBusinesses);
  const workerUnavailable = metaBusinesses.some(
    (business) =>
      business.queueDepth > 0 &&
      business.leasedPartitions === 0 &&
      business.workerOnline === false,
  );
  const likelyPrimaryConstraint = derivePrimaryConstraint({
    metaBacklogState,
    workerPressureState,
    workerUnavailable,
  });
  const workerCurrentPoolWaiters = workers.reduce(
    (sum, worker) => sum + worker.pool.waitingCount,
    0,
  );
  const workerMaxObservedPoolWaiters = workers.reduce(
    (max, worker) => Math.max(max, worker.pool.maxObservedWaitingCount),
    0,
  );
  const workerTimeoutCount = workers.reduce(
    (sum, worker) => sum + worker.counters.timeoutCount,
    0,
  );
  const workerRetryableErrorCount = workers.reduce(
    (sum, worker) => sum + worker.counters.retryableErrorCount,
    0,
  );
  const workerConnectionErrorCount = workers.reduce(
    (sum, worker) => sum + worker.counters.connectionErrorCount,
    0,
  );
  const evidence: string[] = [];
  if (metaBacklogState === "draining") {
    evidence.push(
      `Meta backlog is draining with ${input.metaLeasedPartitions} leased partition(s).`,
    );
  } else if (metaBacklogState === "stalled") {
    evidence.push("Meta backlog exists without active drain evidence.");
  } else {
    evidence.push("Meta queue depth is currently zero.");
  }
  if (workerUnavailable) {
    evidence.push(
      "No fresh Meta worker heartbeat or active lease is visible for the stalled Meta backlog.",
    );
  }
  if (workerPressureState === "saturated") {
    evidence.push(
      `Worker pool waiters observed: current=${workerCurrentPoolWaiters}, max=${workerMaxObservedPoolWaiters}.`,
    );
  } else if (workerPressureState === "elevated") {
    evidence.push(
      `Worker DB pressure elevated: timeouts=${workerTimeoutCount}, retryable=${workerRetryableErrorCount}, connection=${workerConnectionErrorCount}.`,
    );
  } else if (workerPressureState === "healthy") {
    evidence.push("Worker DB pressure looks healthy from the latest heartbeat snapshots.");
  } else {
    evidence.push("Worker DB pressure is unavailable because no heartbeat snapshot included DB diagnostics.");
  }
  if (webPressureState !== "unknown") {
    evidence.push(`Web admin process DB pressure is ${webPressureState}.`);
  }

  return {
    sampledAt: nowIso(),
    web,
    workers,
    summary: {
      webPressureState,
      workerPressureState,
      metaBacklogState,
      likelyPrimaryConstraint,
      headline: buildHeadline({
        metaBacklogState,
        workerPressureState,
        likelyPrimaryConstraint,
      }),
      evidence,
      workerCount: workers.length,
      metaQueueDepth: input.metaQueueDepth,
      metaLeasedPartitions: input.metaLeasedPartitions,
      workerCurrentPoolWaiters,
      workerMaxObservedPoolWaiters,
      workerTimeoutCount,
      workerRetryableErrorCount,
      workerConnectionErrorCount,
    },
  };
}
