import { describe, expect, it } from "vitest";
import {
  buildAdminDbDiagnostics,
  buildWorkerDbProcessDiagnostics,
} from "@/lib/admin-db-diagnostics";
import type { DbRuntimeDiagnostics } from "@/lib/db";

function buildDbSnapshot(
  overrides: Partial<DbRuntimeDiagnostics> = {},
): DbRuntimeDiagnostics {
  return {
    sampledAt: "2026-04-14T09:00:00.000Z",
    runtime: "worker",
    applicationName: "omniads-worker",
    settings: {
      runtime: "worker",
      applicationName: "omniads-worker",
      poolMax: 20,
      queryTimeoutMs: 30_000,
      connectionTimeoutMs: 10_000,
      idleTimeoutMs: 30_000,
      maxLifetimeSeconds: 900,
      statementTimeoutMs: null,
      idleInTransactionSessionTimeoutMs: null,
      retryAttempts: 4,
      retryBackoffMs: 400,
      retryMaxBackoffMs: 4_000,
      allowExitOnIdle: true,
    },
    pool: {
      max: 20,
      totalCount: 8,
      idleCount: 2,
      waitingCount: 0,
      utilizationPercent: 40,
      saturationState: "idle",
      maxObservedWaitingCount: 0,
      maxObservedUtilizationPercent: 40,
      poolWaitEventCount: 0,
      lastPoolWaitAt: null,
    },
    counters: {
      queryCount: 100,
      successCount: 100,
      failureCount: 0,
      retriedQueryCount: 0,
      retryAttemptCount: 0,
      retryableErrorCount: 0,
      timeoutCount: 0,
      connectionErrorCount: 0,
      lastSuccessfulQueryAt: "2026-04-14T08:59:00.000Z",
      lastRetryableErrorAt: null,
      lastTimeoutAt: null,
      lastConnectionErrorAt: null,
    },
    lastError: null,
    ...overrides,
  };
}

describe("buildWorkerDbProcessDiagnostics", () => {
  it("extracts worker DB diagnostics from heartbeat metaJson", () => {
    const workers = buildWorkerDbProcessDiagnostics([
      {
        workerId: "worker-1:meta",
        providerScope: "meta",
        status: "running",
        lastHeartbeatAt: "2026-04-14T09:00:00.000Z",
        metaJson: {
          dbRuntime: buildDbSnapshot(),
        },
      },
    ]);

    expect(workers).toHaveLength(1);
    expect(workers[0]).toMatchObject({
      workerId: "worker-1:meta",
      providerScope: "meta",
      workerStatus: "running",
      applicationName: "omniads-worker",
      pool: {
        max: 20,
      },
    });
  });
});

describe("buildAdminDbDiagnostics", () => {
  it("classifies a draining Meta queue with healthy worker DB pressure", () => {
    const diagnostics = buildAdminDbDiagnostics({
      web: buildDbSnapshot({
        runtime: "web",
        applicationName: "omniads-web",
        settings: {
          ...buildDbSnapshot().settings,
          runtime: "web",
          applicationName: "omniads-web",
          poolMax: 10,
          queryTimeoutMs: 8_000,
        },
      }),
      workers: [buildDbSnapshot()],
      metaQueueDepth: 14,
      metaLeasedPartitions: 3,
      metaBusinesses: [
        {
          queueDepth: 14,
          leasedPartitions: 3,
          progressState: "syncing",
          activityState: "busy",
        },
      ],
      nowMs: new Date("2026-04-14T09:05:00.000Z").getTime(),
    });

    expect(diagnostics.summary).toMatchObject({
      webPressureState: "healthy",
      workerPressureState: "healthy",
      metaBacklogState: "draining",
      likelyPrimaryConstraint: "none",
    });
    expect(diagnostics.summary.headline).toContain("draining");
  });

  it("classifies worker DB saturation when waiters and recent timeouts are present", () => {
    const worker = buildDbSnapshot({
      pool: {
        ...buildDbSnapshot().pool,
        waitingCount: 3,
        totalCount: 20,
        idleCount: 0,
        utilizationPercent: 100,
        saturationState: "saturated",
        maxObservedWaitingCount: 5,
        maxObservedUtilizationPercent: 100,
        poolWaitEventCount: 4,
        lastPoolWaitAt: "2026-04-14T09:04:30.000Z",
      },
      counters: {
        ...buildDbSnapshot().counters,
        retryableErrorCount: 3,
        timeoutCount: 2,
        lastRetryableErrorAt: "2026-04-14T09:04:00.000Z",
        lastTimeoutAt: "2026-04-14T09:04:10.000Z",
      },
      lastError: {
        at: "2026-04-14T09:04:10.000Z",
        code: "57014",
        message: "Database query timed out after 30000ms.",
        retryable: false,
        timeout: true,
        connection: false,
      },
    });

    const diagnostics = buildAdminDbDiagnostics({
      web: null,
      workers: [worker],
      metaQueueDepth: 24,
      metaLeasedPartitions: 4,
      metaBusinesses: [
        {
          queueDepth: 24,
          leasedPartitions: 4,
          progressState: "syncing",
          activityState: "busy",
        },
      ],
      nowMs: new Date("2026-04-14T09:05:00.000Z").getTime(),
    });

    expect(diagnostics.summary).toMatchObject({
      workerPressureState: "saturated",
      metaBacklogState: "draining",
      likelyPrimaryConstraint: "db",
      workerCurrentPoolWaiters: 3,
      workerMaxObservedPoolWaiters: 5,
      workerTimeoutCount: 2,
      workerRetryableErrorCount: 3,
    });
  });

  it("classifies stalled backlog separately from worker DB pressure", () => {
    const diagnostics = buildAdminDbDiagnostics({
      web: null,
      workers: [buildDbSnapshot()],
      metaQueueDepth: 9,
      metaLeasedPartitions: 0,
      metaBusinesses: [
        {
          queueDepth: 9,
          leasedPartitions: 0,
          progressState: "partial_stuck",
          activityState: "stalled",
        },
      ],
      nowMs: new Date("2026-04-14T09:05:00.000Z").getTime(),
    });

    expect(diagnostics.summary).toMatchObject({
      workerPressureState: "healthy",
      metaBacklogState: "stalled",
      likelyPrimaryConstraint: "scheduler_or_queue",
    });
    expect(diagnostics.summary.headline).toContain("scheduler");
  });

  it("classifies stalled backlog as worker-unavailable when no fresh Meta worker heartbeat exists", () => {
    const diagnostics = buildAdminDbDiagnostics({
      web: null,
      workers: [],
      metaQueueDepth: 9,
      metaLeasedPartitions: 0,
      metaBusinesses: [
        {
          queueDepth: 9,
          leasedPartitions: 0,
          progressState: "partial_stuck",
          activityState: "stalled",
          workerOnline: false,
        },
      ],
      nowMs: new Date("2026-04-14T09:05:00.000Z").getTime(),
    });

    expect(diagnostics.summary).toMatchObject({
      workerPressureState: "unknown",
      metaBacklogState: "stalled",
      likelyPrimaryConstraint: "worker_unavailable",
    });
    expect(diagnostics.summary.headline).toContain("no fresh Meta worker heartbeat");
  });
});
