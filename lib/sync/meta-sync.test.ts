import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMetaFairnessLeasePlan,
  buildMetaFollowupLeasePlan,
  buildMetaLaneProgressEvidence,
  getDeprecatedMetaPartitionCancellationReason,
  getMetaExtendedHistoricalFairnessLimit,
  getMetaHistoricalCoreFairnessLimit,
  logMetaQueueVisibility,
  resolveMetaHistoricalReplaySource,
} from "@/lib/sync/meta-sync";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildMetaLaneProgressEvidence", () => {
  it("keeps historical evidence on the bottleneck timestamp", () => {
    const evidence = buildMetaLaneProgressEvidence({
      statesByScope: {
        account_daily: [
          {
            completedDays: 30,
            readyThroughDate: "2026-03-28",
            latestSuccessfulSyncAt: "2026-04-02T10:00:00.000Z",
            updatedAt: "2026-04-02T10:00:00.000Z",
          },
        ],
        campaign_daily: [
          {
            completedDays: 28,
            readyThroughDate: "2026-03-26",
            latestSuccessfulSyncAt: "2026-04-02T09:30:00.000Z",
            updatedAt: "2026-04-02T09:30:00.000Z",
          },
        ],
      },
      queueHealth: {
        latestCoreActivityAt: "2026-04-02T10:05:00.000Z",
        latestExtendedActivityAt: null,
        latestMaintenanceActivityAt: null,
      } as never,
    });

    expect(evidence.core.lastCompletedAt).toBe("2026-04-02T09:30:00.000Z");
  });
});

describe("getMetaHistoricalCoreFairnessLimit", () => {
  it("boosts historical core fairness when advancement is stale", () => {
    const limit = getMetaHistoricalCoreFairnessLimit({
      queueHealth: {
        historicalCoreQueueDepth: 8,
        historicalCoreLeasedPartitions: 0,
        latestCoreActivityAt: "2026-04-02T09:00:00.000Z",
      } as never,
      progressEvidence: {
        lastCheckpointAdvancedAt: "2026-04-02T09:00:00.000Z",
        lastReadyThroughAdvancedAt: null,
        lastCompletedAt: "2026-04-02T09:00:00.000Z",
        backlogDelta: null,
        completedPartitionDelta: null,
        lastReplayAt: null,
        lastReclaimAt: null,
        recentActivityWindowMinutes: 20,
      },
      nowMs: new Date("2026-04-02T09:30:00.000Z").getTime(),
    });

    expect(limit).toBeGreaterThan(1);
  });

  it("keeps base fairness when historical core is still advancing", () => {
    const limit = getMetaHistoricalCoreFairnessLimit({
      queueHealth: {
        historicalCoreQueueDepth: 8,
        historicalCoreLeasedPartitions: 0,
        latestCoreActivityAt: "2026-04-02T09:25:00.000Z",
      } as never,
      progressEvidence: {
        lastCheckpointAdvancedAt: "2026-04-02T09:25:00.000Z",
        lastReadyThroughAdvancedAt: null,
        lastCompletedAt: "2026-04-02T09:25:00.000Z",
        backlogDelta: null,
        completedPartitionDelta: null,
        lastReplayAt: null,
        lastReclaimAt: null,
        recentActivityWindowMinutes: 20,
      },
      nowMs: new Date("2026-04-02T09:30:00.000Z").getTime(),
    });

    expect(limit).toBe(1);
  });
});

describe("getMetaExtendedHistoricalFairnessLimit", () => {
  it("drops to zero without extended historical backlog", () => {
    const limit = getMetaExtendedHistoricalFairnessLimit({
      queueHealth: {
        extendedHistoricalQueueDepth: 0,
        extendedHistoricalLeasedPartitions: 0,
        latestExtendedActivityAt: null,
      } as never,
      progressEvidence: null,
    });

    expect(limit).toBe(0);
  });
});

describe("buildMetaFairnessLeasePlan", () => {
  it("returns boosted historical fairness limits from stale evidence", () => {
    const plan = buildMetaFairnessLeasePlan({
      queueHealth: {
        historicalCoreQueueDepth: 6,
        historicalCoreLeasedPartitions: 0,
        extendedHistoricalQueueDepth: 4,
        extendedHistoricalLeasedPartitions: 0,
        latestCoreActivityAt: "2026-04-02T09:00:00.000Z",
        latestExtendedActivityAt: "2026-04-02T09:00:00.000Z",
      } as never,
      laneProgressEvidence: {
        core: {
          lastCheckpointAdvancedAt: "2026-04-02T09:00:00.000Z",
          lastReadyThroughAdvancedAt: null,
          lastCompletedAt: "2026-04-02T09:00:00.000Z",
          backlogDelta: null,
          completedPartitionDelta: null,
          lastReplayAt: null,
          lastReclaimAt: null,
          recentActivityWindowMinutes: 20,
        },
        extended_historical: {
          lastCheckpointAdvancedAt: "2026-04-02T09:00:00.000Z",
          lastReadyThroughAdvancedAt: null,
          lastCompletedAt: "2026-04-02T09:00:00.000Z",
          backlogDelta: null,
          completedPartitionDelta: null,
          lastReplayAt: null,
          lastReclaimAt: null,
          recentActivityWindowMinutes: 20,
        },
      },
      nowMs: new Date("2026-04-02T09:30:00.000Z").getTime(),
    });

    expect(plan.coreFairnessLimit).toBeGreaterThanOrEqual(1);
    expect(plan.extendedHistoricalFairnessLimit).toBeGreaterThanOrEqual(1);
  });
});

describe("buildMetaFollowupLeasePlan", () => {
  it("keeps recent leasing off while maintenance backlog exists", () => {
    const plan = buildMetaFollowupLeasePlan({
      queueHealth: {
        maintenanceQueueDepth: 3,
        maintenanceLeasedPartitions: 0,
        extendedRecentQueueDepth: 5,
        extendedRecentLeasedPartitions: 0,
      } as never,
      leasedCoreFairnessCount: 1,
      leasedExtendedHistoricalFairnessCount: 1,
    });

    expect(plan.extendedRecentLimit).toBe(0);
    expect(plan.historicalCoreLimit).toBeGreaterThan(0);
  });

  it("holds historical tail leasing until recent backlog is drained", () => {
    const plan = buildMetaFollowupLeasePlan({
      queueHealth: {
        maintenanceQueueDepth: 0,
        maintenanceLeasedPartitions: 0,
        extendedRecentQueueDepth: 5,
        extendedRecentLeasedPartitions: 0,
      } as never,
      leasedCoreFairnessCount: 1,
      leasedExtendedHistoricalFairnessCount: 1,
      leasedExtendedRecentCount: 1,
    });

    expect(plan.extendedHistoricalLimit).toBe(0);
    expect(plan.extendedRecentLimit).toBeGreaterThan(0);
  });
});

describe("resolveMetaHistoricalReplaySource", () => {
  it("returns historical for unseen dates", () => {
    expect(resolveMetaHistoricalReplaySource(new Map())).toBe("historical");
  });

  it("returns null when a core historical date is already active", () => {
    expect(
      resolveMetaHistoricalReplaySource(
        new Map([
          [
            "account_daily",
            {
              status: "queued",
              source: "historical",
              finishedAt: null,
            },
          ],
        ]),
      ),
    ).toBeNull();
  });

  it("returns historical_recovery when a terminal partition exists but coverage is still incomplete", () => {
    expect(
      resolveMetaHistoricalReplaySource(
        new Map([
          [
            "account_daily",
            {
              status: "succeeded",
              source: "historical",
              finishedAt: "2026-04-03T09:00:00.000Z",
            },
          ],
        ]),
      ),
    ).toBe("historical_recovery");
  });
});

describe("meta creatives sync gating", () => {
  it("does not reference creativesMediaReady in partition gating or logs", () => {
    const source = readFileSync(
      new URL("./meta-sync.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("creativesMediaReady");
    expect(source).not.toContain("getMetaAdDailyPreviewCoverage");
    expect(source).not.toContain("creativesMediaReadyBefore");
    expect(source).not.toContain("creativesMediaReadyAfter");
  });

  it("cancels deprecated creative_daily partitions before any warehouse fetch runs", () => {
    expect(
      getDeprecatedMetaPartitionCancellationReason("creative_daily"),
    ).toContain("live/snapshot path");
    expect(getDeprecatedMetaPartitionCancellationReason("ad_daily")).toBeNull();
  });
});

describe("logMetaQueueVisibility", () => {
  it("emits structured background scheduling visibility events", () => {
    const infoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    logMetaQueueVisibility("meta_background_sync_already_scheduled", {
      businessId: "business-1",
      delayMs: 0,
      source: "schedule",
    });

    expect(infoSpy).toHaveBeenCalledWith(
      "[meta-sync] meta_background_sync_already_scheduled",
      expect.objectContaining({
        businessId: "business-1",
        source: "schedule",
      }),
    );
  });

  it("emits queue visibility when partitions exist but no runner lease is acquired", () => {
    const infoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    logMetaQueueVisibility("meta_queue_present_no_runner_lease", {
      businessId: "business-2",
      workerId: "worker-1",
      queueDepth: 5,
    });
    logMetaQueueVisibility("meta_runner_lease_not_acquired", {
      businessId: "business-2",
      workerId: "worker-1",
      queueDepth: 5,
    });

    expect(infoSpy).toHaveBeenNthCalledWith(
      1,
      "[meta-sync] meta_queue_present_no_runner_lease",
      expect.objectContaining({
        businessId: "business-2",
        workerId: "worker-1",
      }),
    );
    expect(infoSpy).toHaveBeenNthCalledWith(
      2,
      "[meta-sync] meta_runner_lease_not_acquired",
      expect.objectContaining({
        queueDepth: 5,
      }),
    );
  });
});
