import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueMetaScheduledWork = vi.fn();
const syncMetaRepairRange = vi.fn();
const enqueueGoogleAdsScheduledWork = vi.fn();

vi.mock("@/lib/sync/meta-sync", () => ({
  enqueueMetaScheduledWork,
  syncMetaRepairRange,
}));

vi.mock("@/lib/sync/google-ads-sync", () => ({
  enqueueGoogleAdsScheduledWork,
}));

vi.mock("@/lib/meta/warehouse", () => ({
  cleanupMetaPartitionOrchestration: vi.fn(),
  replayMetaDeadLetterPartitions: vi.fn(),
  requeueMetaRetryableFailedPartitions: vi.fn(),
  getMetaQueueHealth: vi.fn(),
  getMetaWarehouseIntegrityIncidents: vi.fn(),
}));

vi.mock("@/lib/google-ads/warehouse", () => ({
  cleanupGoogleAdsPartitionOrchestration: vi.fn(),
  replayGoogleAdsDeadLetterPartitions: vi.fn(),
  forceReplayGoogleAdsPoisonedPartitions: vi.fn(),
  getGoogleAdsQueueHealth: vi.fn(),
  getGoogleAdsCheckpointHealth: vi.fn(),
}));

describe("provider repair engine", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("surfaces Meta cleanup summary on successful repair", async () => {
    const metaWarehouse = await import("@/lib/meta/warehouse");
    vi.mocked(metaWarehouse.cleanupMetaPartitionOrchestration).mockResolvedValue({
      candidateCount: 2,
      stalePartitionCount: 1,
      aliveSlowCount: 1,
      reconciledRunCount: 1,
      staleRunCount: 0,
      staleLegacyCount: 0,
      reclaimReasons: {
        stalledReclaimable: ["lease_expired_no_progress"],
      },
      preservedByReason: {
        recentCheckpointProgress: 1,
        matchingRunnerLeasePresent: 0,
        leaseNotExpired: 0,
      },
    } as never);
    vi.mocked(metaWarehouse.replayMetaDeadLetterPartitions).mockResolvedValue({
      outcome: "no_matching_partitions",
      partitions: [],
      matchedCount: 0,
      changedCount: 0,
      skippedActiveLeaseCount: 0,
    } as never);
    vi.mocked(metaWarehouse.requeueMetaRetryableFailedPartitions).mockResolvedValue([] as never);
    vi.mocked(metaWarehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 0,
      leasedPartitions: 0,
      deadLetterPartitions: 0,
      retryableFailedPartitions: 0,
    } as never);
    vi.mocked(metaWarehouse.getMetaWarehouseIntegrityIncidents).mockResolvedValue([] as never);

    const { runMetaRepairCycle } = await import("@/lib/sync/provider-repair-engine");
    const result = await runMetaRepairCycle("biz-1", { enqueueScheduledWork: false });

    expect(result.repair.blocked).toBe(false);
    expect(result.repair.reclaimed).toBe(1);
    expect(result.repair.meta).toEqual(
      expect.objectContaining({
        cleanupSummary: expect.objectContaining({
          candidateCount: 2,
          stalePartitionCount: 1,
          reconciledRunCount: 1,
        }),
        cleanupError: null,
        integrityIncidentCount: 0,
      })
    );
  });

  it("surfaces cleanup_error when Meta cleanup throws", async () => {
    const metaWarehouse = await import("@/lib/meta/warehouse");
    vi.mocked(metaWarehouse.cleanupMetaPartitionOrchestration).mockRejectedValue(
      new Error("cleanup blew up")
    );
    vi.mocked(metaWarehouse.replayMetaDeadLetterPartitions).mockResolvedValue({
      outcome: "no_matching_partitions",
      partitions: [],
      matchedCount: 0,
      changedCount: 0,
      skippedActiveLeaseCount: 0,
    } as never);
    vi.mocked(metaWarehouse.requeueMetaRetryableFailedPartitions).mockResolvedValue([] as never);
    vi.mocked(metaWarehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 0,
      leasedPartitions: 0,
      deadLetterPartitions: 0,
      retryableFailedPartitions: 0,
    } as never);
    vi.mocked(metaWarehouse.getMetaWarehouseIntegrityIncidents).mockResolvedValue([] as never);

    const { runMetaRepairCycle } = await import("@/lib/sync/provider-repair-engine");
    const result = await runMetaRepairCycle("biz-1", { enqueueScheduledWork: false });

    expect(result.repair.reclaimed).toBe(0);
    expect(result.repair.blocked).toBe(true);
    expect(result.repair.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "cleanup_error",
          repairable: true,
        }),
      ])
    );
    expect(result.repair.meta).toEqual(
      expect.objectContaining({
        cleanupSummary: null,
        cleanupError: "cleanup blew up",
      })
    );
  });

  it("queues integrity repair windows when warehouse incidents are found", async () => {
    const metaWarehouse = await import("@/lib/meta/warehouse");
    vi.mocked(metaWarehouse.cleanupMetaPartitionOrchestration).mockResolvedValue({
      candidateCount: 0,
      stalePartitionCount: 0,
      aliveSlowCount: 0,
      reconciledRunCount: 0,
      staleRunCount: 0,
      staleLegacyCount: 0,
      reclaimReasons: {},
      preservedByReason: {},
    } as never);
    vi.mocked(metaWarehouse.replayMetaDeadLetterPartitions).mockResolvedValue({
      outcome: "no_matching_partitions",
      partitions: [],
      matchedCount: 0,
      changedCount: 0,
      skippedActiveLeaseCount: 0,
    } as never);
    vi.mocked(metaWarehouse.requeueMetaRetryableFailedPartitions).mockResolvedValue([] as never);
    vi.mocked(metaWarehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 0,
      leasedPartitions: 0,
      deadLetterPartitions: 0,
      retryableFailedPartitions: 0,
    } as never);
    vi.mocked(metaWarehouse.getMetaWarehouseIntegrityIncidents).mockResolvedValue([
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-01",
        scope: "system",
        severity: "error",
        metricsCompared: ["spend"],
        delta: {},
        provenanceState: "missing_source_run",
        repairRecommended: true,
        repairStatus: "pending",
        suspectedCause: "missing_provenance",
      },
      {
        businessId: "biz-1",
        providerAccountId: "act_1",
        date: "2026-04-02",
        scope: "system",
        severity: "error",
        metricsCompared: ["clicks"],
        delta: {},
        provenanceState: "legacy_schema",
        repairRecommended: true,
        repairStatus: "pending",
        suspectedCause: "legacy_click_semantics",
      },
    ] as never);
    syncMetaRepairRange.mockResolvedValue({
      businessId: "biz-1",
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });

    const { runMetaRepairCycle } = await import("@/lib/sync/provider-repair-engine");
    const result = await runMetaRepairCycle("biz-1", {
      enqueueScheduledWork: false,
      queueWarehouseRepairs: true,
    });

    expect(syncMetaRepairRange).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-1",
        startDate: "2026-04-01",
        endDate: "2026-04-02",
        triggerSource: "priority_window",
      }),
    );
    expect(result.repair.meta).toEqual(
      expect.objectContaining({
        integrityIncidentCount: 2,
        queuedWarehouseRepairs: 1,
        integrityRepairRanges: [
          { startDate: "2026-04-01", endDate: "2026-04-02" },
        ],
      }),
    );
  });
});
