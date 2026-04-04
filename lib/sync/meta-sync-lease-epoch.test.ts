import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meta/creatives-warehouse", () => ({
  syncMetaCreativesWarehouseDay: vi.fn(),
}));

vi.mock("@/lib/api/meta", () => ({
  resolveMetaCredentials: vi.fn(),
  syncMetaAccountCoreWarehouseDay: vi.fn(),
  syncMetaAccountBreakdownWarehouseDay: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta/warehouse")>(
    "@/lib/meta/warehouse"
  );
  return {
    ...actual,
    cancelObsoleteMetaCoreScopePartitions: vi.fn(),
    cleanupMetaPartitionOrchestration: vi.fn(),
    completeMetaPartitionAttempt: vi.fn(),
    completeMetaPartition: vi.fn(),
    createMetaSyncJob: vi.fn(),
    createMetaSyncRun: vi.fn(),
    expireStaleMetaSyncJobs: vi.fn(),
    getLatestMetaCheckpointForPartition: vi.fn(),
    getLatestRunningMetaSyncRunIdForPartition: vi.fn(),
    heartbeatMetaPartitionLease: vi.fn().mockResolvedValue(true),
    getLatestMetaSyncHealth: vi.fn(),
    getMetaAdDailyCoverage: vi.fn(),
    getMetaAdSetDailyCoverage: vi.fn(),
    getMetaAccountDailyCoverage: vi.fn(),
    getMetaCampaignDailyCoverage: vi.fn(),
    getMetaCreativeDailyCoverage: vi.fn(),
    getMetaIncompleteCoreDates: vi.fn(),
    getMetaPartitionStatesForDate: vi.fn(),
    getMetaQueueComposition: vi.fn(),
    getMetaPartitionHealth: vi.fn(),
    getMetaQueueHealth: vi.fn(),
    getMetaRawSnapshotCoverageByEndpoint: vi.fn(),
    getMetaSyncCheckpoint: vi.fn(),
    getMetaSyncState: vi.fn(),
    leaseMetaSyncPartitions: vi.fn(),
    markMetaPartitionRunning: vi.fn(),
    queueMetaSyncPartition: vi.fn(),
    replayMetaDeadLetterPartitions: vi.fn(),
    requeueMetaRetryableFailedPartitions: vi.fn(),
    updateMetaSyncJob: vi.fn(),
    updateMetaSyncRun: vi.fn(),
    upsertMetaSyncCheckpoint: vi.fn(),
    upsertMetaSyncState: vi.fn(),
  };
});

const apiMeta = await import("@/lib/api/meta");
const warehouse = await import("@/lib/meta/warehouse");
const { processMetaLifecyclePartition } = await import("@/lib/sync/meta-sync");

describe("processMetaLifecyclePartition lease epoch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiMeta.resolveMetaCredentials).mockResolvedValue({
      businessId: "biz-1",
      accessToken: "token-1",
      accountIds: ["act_1"],
      currency: "USD",
      accountProfiles: {},
    } as never);
    vi.mocked(apiMeta.syncMetaAccountCoreWarehouseDay).mockResolvedValue({
      accountRowsWritten: 1,
      campaignRowsWritten: 1,
      adsetRowsWritten: 0,
      adRowsWritten: 0,
      positiveSpendAdIds: [],
      pageCount: 1,
      restoredPageCount: 0,
      throttleCount: 0,
      lastUsagePercent: 0,
      memoryInstrumentation: {
        maxHeapUsedBytes: 0,
        maxRowsBuffered: 0,
        flushThresholdRows: 0,
        oversizeWarning: false,
      },
    } as never);
    vi.mocked(apiMeta.syncMetaAccountBreakdownWarehouseDay).mockResolvedValue(undefined);
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 0,
      latest_updated_at: null,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 0,
      latest_updated_at: null,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaAdDailyCoverage).mockResolvedValue({
      completed_days: 0,
      latest_updated_at: null,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.markMetaPartitionRunning).mockResolvedValue(true);
    vi.mocked(warehouse.createMetaSyncRun).mockResolvedValue("run-1");
    vi.mocked(warehouse.heartbeatMetaPartitionLease).mockResolvedValue(true);
    vi.mocked(warehouse.completeMetaPartitionAttempt).mockResolvedValue({
      ok: true,
      runUpdated: true,
      closedCheckpointGroups: [],
    });
    vi.mocked(warehouse.completeMetaPartition).mockResolvedValue(true);
    vi.mocked(warehouse.updateMetaSyncRun).mockResolvedValue(undefined);
    vi.mocked(warehouse.getLatestRunningMetaSyncRunIdForPartition).mockResolvedValue(null);
    vi.mocked(warehouse.getMetaPartitionStatesForDate).mockResolvedValue(new Map());
    vi.mocked(warehouse.queueMetaSyncPartition).mockResolvedValue({
      id: "queued-1",
      businessId: "biz-1",
      providerAccountId: "act_1",
      lane: "extended",
      scope: "ad_daily",
      partitionDate: "2026-04-03",
      status: "queued",
      priority: 55,
      source: "recent_recovery",
      leaseOwner: null,
      leaseExpiresAt: null,
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
      createdAt: "2026-04-04T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      updatedAt: "2026-04-04T00:00:00.000Z",
      leaseEpoch: 0,
    } as never);
    vi.mocked(warehouse.getLatestMetaCheckpointForPartition).mockResolvedValue({
      checkpointScope: "account_daily",
      phase: "finalize",
      status: "running",
      updatedAt: "2026-04-04T00:00:00.000Z",
    });
  });

  it("threads leaseEpoch through run creation, core sync, breakdown sync, and completion", async () => {
    const processed = await processMetaLifecyclePartition({
      partition: {
        id: "partition-1",
        businessId: "biz-1",
        providerAccountId: "act_1",
        lane: "extended",
        scope: "account_daily",
        partitionDate: "2026-04-03",
        attemptCount: 2,
        leaseEpoch: 7,
        source: "recent_recovery",
      },
      workerId: "worker-1",
    });

    expect(processed).toBe(true);
    expect(warehouse.markMetaPartitionRunning).toHaveBeenCalledWith({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 7,
      leaseMinutes: 15,
    });
    expect(apiMeta.syncMetaAccountCoreWarehouseDay).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionId: "partition-1",
        workerId: "worker-1",
        leaseEpoch: 7,
      })
    );
    expect(
      vi.mocked(apiMeta.syncMetaAccountBreakdownWarehouseDay).mock.calls.every(
        ([input]) => input.leaseEpoch === 7
      )
    ).toBe(true);
    expect(warehouse.createMetaSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionId: "partition-1",
        metaJson: {
          source: "recent_recovery",
          leaseEpoch: 7,
        },
      })
    );
    expect(warehouse.completeMetaPartitionAttempt).toHaveBeenCalledWith({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 7,
      runId: "run-1",
      partitionStatus: "succeeded",
      runStatus: "succeeded",
      durationMs: expect.any(Number),
      finishedAt: expect.any(String),
    });
    expect(warehouse.heartbeatMetaPartitionLease).toHaveBeenCalledWith({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 7,
      leaseMinutes: 15,
    });
    expect(
      vi.mocked(warehouse.heartbeatMetaPartitionLease).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(warehouse.completeMetaPartitionAttempt).mock.invocationCallOrder[0]!);
  });

  it("returns false and records lease_conflict when completion loses the current epoch", async () => {
    vi.mocked(warehouse.completeMetaPartitionAttempt).mockResolvedValue({
      ok: false,
      reason: "lease_conflict",
    });

    const processed = await processMetaLifecyclePartition({
      partition: {
        id: "partition-2",
        businessId: "biz-1",
        providerAccountId: "act_1",
        lane: "extended",
        scope: "account_daily",
        partitionDate: "2026-04-03",
        attemptCount: 4,
        leaseEpoch: 12,
        source: "recent_recovery",
      },
      workerId: "worker-1",
    });

    expect(processed).toBe(false);
    expect(warehouse.updateMetaSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "run-1",
        status: "failed",
        errorClass: "lease_conflict",
        errorMessage: "partition lost ownership before success completion",
      })
    );
  });

  it("skips completion when the pre-completion heartbeat loses the current epoch", async () => {
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 1,
      latest_updated_at: null,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 1,
      latest_updated_at: null,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.heartbeatMetaPartitionLease).mockResolvedValue(false);

    const processed = await processMetaLifecyclePartition({
      partition: {
        id: "partition-3",
        businessId: "biz-1",
        providerAccountId: "act_1",
        lane: "extended",
        scope: "account_daily",
        partitionDate: "2026-04-03",
        attemptCount: 1,
        leaseEpoch: 15,
        source: "recent_recovery",
      },
      workerId: "worker-1",
    });

    expect(processed).toBe(false);
    expect(warehouse.completeMetaPartitionAttempt).not.toHaveBeenCalled();
    expect(warehouse.updateMetaSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "run-1",
        status: "failed",
        errorClass: "lease_conflict",
        errorMessage: "partition lost ownership before success completion",
      })
    );
  });

  it("does not misclassify operational completion errors as lease_conflict", async () => {
    vi.mocked(warehouse.completeMetaPartitionAttempt)
      .mockRejectedValueOnce(new Error("db completion timeout"))
      .mockResolvedValueOnce({
        ok: true,
        runUpdated: true,
        closedCheckpointGroups: [],
      });

    const processed = await processMetaLifecyclePartition({
      partition: {
        id: "partition-4",
        businessId: "biz-1",
        providerAccountId: "act_1",
        lane: "extended",
        scope: "account_daily",
        partitionDate: "2026-04-03",
        attemptCount: 1,
        leaseEpoch: 18,
        source: "recent_recovery",
      },
      workerId: "worker-1",
    });

    expect(processed).toBe(false);
    expect(warehouse.updateMetaSyncRun).not.toHaveBeenCalledWith(
      expect.objectContaining({
        errorClass: "lease_conflict",
        errorMessage: "partition lost ownership before success completion",
      })
    );
    expect(warehouse.completeMetaPartitionAttempt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        partitionStatus: "failed",
        runStatus: "failed",
        errorClass: expect.any(String),
        errorMessage: "db completion timeout",
      })
    );
  });

  it("backfills the run terminal state when partition completion succeeds without updating the run row", async () => {
    vi.mocked(warehouse.completeMetaPartitionAttempt).mockResolvedValue({
      ok: true,
      runUpdated: false,
      closedCheckpointGroups: [],
    });

    const processed = await processMetaLifecyclePartition({
      partition: {
        id: "partition-4b",
        businessId: "biz-1",
        providerAccountId: "act_1",
        lane: "extended",
        scope: "account_daily",
        partitionDate: "2026-04-03",
        attemptCount: 1,
        leaseEpoch: 19,
        source: "recent_recovery",
      },
      workerId: "worker-1",
    });

    expect(processed).toBe(true);
    expect(warehouse.updateMetaSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "run-1",
        status: "succeeded",
        finishedAt: expect.any(String),
        onlyIfCurrentStatus: "running",
      })
    );
  });

  it("recovers the current running run id when run creation returns null", async () => {
    vi.mocked(warehouse.createMetaSyncRun).mockResolvedValue(null);
    vi.mocked(warehouse.getLatestRunningMetaSyncRunIdForPartition).mockResolvedValue("run-recovered");

    const processed = await processMetaLifecyclePartition({
      partition: {
        id: "partition-4c",
        businessId: "biz-1",
        providerAccountId: "act_1",
        lane: "extended",
        scope: "account_daily",
        partitionDate: "2026-04-03",
        attemptCount: 1,
        leaseEpoch: 20,
        source: "recent_recovery",
      },
      workerId: "worker-1",
    });

    expect(processed).toBe(true);
    expect(warehouse.getLatestRunningMetaSyncRunIdForPartition).toHaveBeenCalledWith({
      partitionId: "partition-4c",
    });
    expect(warehouse.completeMetaPartitionAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-recovered",
        partitionStatus: "succeeded",
      })
    );
  });

  it("completes core partitions before enqueueing extended follow-up work", async () => {
    const processed = await processMetaLifecyclePartition({
      partition: {
        id: "partition-5",
        businessId: "biz-1",
        providerAccountId: "act_1",
        lane: "core",
        scope: "account_daily",
        partitionDate: "2026-04-03",
        attemptCount: 1,
        leaseEpoch: 21,
        source: "recent_recovery",
      },
      workerId: "worker-1",
    });

    expect(processed).toBe(true);
    expect(warehouse.completeMetaPartitionAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionStatus: "succeeded",
        runStatus: "succeeded",
      })
    );
    expect(warehouse.queueMetaSyncPartition).toHaveBeenCalled();
    expect(
      vi.mocked(warehouse.completeMetaPartitionAttempt).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(warehouse.queueMetaSyncPartition).mock.invocationCallOrder[0]!);
  });

  it("keeps parent success when post-success extended enqueue retries fail", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(warehouse.queueMetaSyncPartition).mockRejectedValue(new Error("queue write failed"));

    const processed = await processMetaLifecyclePartition({
      partition: {
        id: "partition-6",
        businessId: "biz-1",
        providerAccountId: "act_1",
        lane: "core",
        scope: "account_daily",
        partitionDate: "2026-04-03",
        attemptCount: 1,
        leaseEpoch: 22,
        source: "recent_recovery",
      },
      workerId: "worker-1",
    });

    expect(processed).toBe(true);
    expect(warehouse.completeMetaPartitionAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionStatus: "succeeded",
        runStatus: "succeeded",
      })
    );
    expect(warehouse.queueMetaSyncPartition).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(
      "[meta-sync] post_success_extended_enqueue_failed",
      expect.objectContaining({
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-03",
        attempts: 3,
        message: "queue write failed",
      })
    );
  });
});
