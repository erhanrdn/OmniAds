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
    completeMetaPartition: vi.fn(),
    createMetaSyncJob: vi.fn(),
    createMetaSyncRun: vi.fn(),
    expireStaleMetaSyncJobs: vi.fn(),
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
    vi.mocked(warehouse.completeMetaPartition).mockResolvedValue(true);
    vi.mocked(warehouse.updateMetaSyncRun).mockResolvedValue(undefined);
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
    expect(warehouse.completeMetaPartition).toHaveBeenCalledWith({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 7,
      status: "succeeded",
    });
  });

  it("returns false and records lease_conflict when completion loses the current epoch", async () => {
    vi.mocked(warehouse.completeMetaPartition).mockResolvedValue(false);

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
});
