import { describe, expect, it } from "vitest";
import {
  buildMetaCoverageSummary,
  classifyMetaDrainState,
  resolveMetaBusinessCurrentDayReference,
  resolveMetaBenchmarkTruthWindows,
  summarizeMetaSyncBenchmarkSeries,
  type MetaSyncBenchmarkSnapshot,
} from "@/lib/meta-sync-benchmark";

function buildSnapshot(
  overrides: Partial<MetaSyncBenchmarkSnapshot> = {},
): MetaSyncBenchmarkSnapshot {
  const capturedAt = overrides.capturedAt ?? "2026-04-15T09:00:00.000Z";
  return {
    businessId: "biz-1",
    businessName: "Benchmark Biz",
    capturedAt,
    windows: {
      recent: {
        startDate: "2026-04-02",
        endDate: "2026-04-15",
        totalDays: 14,
      },
      priority: {
        startDate: "2026-04-13",
        endDate: "2026-04-15",
        totalDays: 3,
      },
      recentWindowMinutes: 15,
    },
    latestSync: null,
    operator: {
      progressState: "partial_progressing",
      activityState: "busy",
      stallFingerprints: [],
      repairBacklog: 0,
      validationFailures24h: 0,
      lastSuccessfulPublishAt: "2026-04-15T08:55:00.000Z",
      d1FinalizeNonTerminalCount: 0,
      workerOnline: true,
      workerLastHeartbeatAt: "2026-04-15T08:59:30.000Z",
      dbConstraint: "none",
      dbBacklogState: "draining",
    },
    queue: {
      queueDepth: 12,
      leasedPartitions: 3,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
      staleLeasePartitions: 0,
      oldestQueuedPartition: "2026-04-08",
      latestActivityAt: "2026-04-15T08:58:00.000Z",
      pendingByLane: {
        core: 4,
        extended: 8,
      },
      pendingByScope: {
        account_daily: 4,
        campaign_daily: 4,
        creative_daily: 4,
      },
      laneSourceStatusCounts: [],
      laneScopeStatusCounts: [],
    },
    userFacing: {
      recentCore: {
        summary: {
          completedDays: 10,
          totalDays: 14,
          readyThroughDate: "2026-04-11",
          percent: 71,
          complete: false,
        },
        campaigns: {
          completedDays: 10,
          totalDays: 14,
          readyThroughDate: "2026-04-11",
          percent: 71,
          complete: false,
        },
        percent: 71,
        complete: false,
        readyThroughDate: "2026-04-11",
      },
      recentExtended: {
        adsets: {
          completedDays: 10,
          totalDays: 14,
          readyThroughDate: "2026-04-11",
          percent: 71,
          complete: false,
        },
        creatives: {
          completedDays: 8,
          totalDays: 14,
          readyThroughDate: "2026-04-10",
          percent: 57,
          complete: false,
        },
        ads: {
          completedDays: 8,
          totalDays: 14,
          readyThroughDate: "2026-04-10",
          percent: 57,
          complete: false,
        },
      },
      recentSelectedRangeTruth: {
        startDate: "2026-04-02",
        endDate: "2026-04-15",
        totalDays: 14,
        completedCoreDays: 10,
        percent: 71,
        truthReady: false,
        state: "processing",
        verificationState: "processing",
        blockingReasons: [],
        detectorReasonCodes: [],
        asOf: "2026-04-15T08:55:00.000Z",
      },
      priorityWindowTruth: {
        startDate: "2026-04-13",
        endDate: "2026-04-15",
        totalDays: 3,
        completedCoreDays: 2,
        percent: 66,
        truthReady: false,
        state: "processing",
        verificationState: "processing",
        blockingReasons: [],
        detectorReasonCodes: [],
        asOf: "2026-04-15T08:55:00.000Z",
      },
    },
    syncState: {
      lastCheckpointUpdatedAt: "2026-04-15T08:58:00.000Z",
      readyThroughDates: {
        recent_summary: "2026-04-11",
        recent_campaigns: "2026-04-11",
        recent_creatives: "2026-04-10",
      },
    },
    velocity: {
      completedLastWindow: 4,
      cancelledLastWindow: 0,
      deadLetteredLastWindow: 0,
      createdLastWindow: 2,
      failedLastWindow: 0,
      reclaimedLastWindow: 1,
      skippedActiveLeaseLastWindow: 0,
      netDrainEstimate: 2,
      drainState: "large_but_draining",
    },
    counters: {
      totalSucceeded: 100,
      totalCancelled: 2,
      totalDeadLettered: 1,
      totalPartitions: 130,
    },
    authoritative: {
      publishedProgression: 40,
      repairBacklog: 0,
      validationFailures24h: 0,
      d1SlaBreaches: 0,
      lastSuccessfulPublishAt: "2026-04-15T08:55:00.000Z",
    },
    ...overrides,
  };
}

describe("buildMetaCoverageSummary", () => {
  it("clamps incomplete coverage below 100 percent", () => {
    expect(
      buildMetaCoverageSummary({
        completedDays: 13,
        totalDays: 14,
        readyThroughDate: "2026-04-14",
      }),
    ).toEqual({
      completedDays: 13,
      totalDays: 14,
      readyThroughDate: "2026-04-14",
      percent: 92,
      complete: false,
    });
  });
});

describe("classifyMetaDrainState", () => {
  it("returns clear when no queue backlog exists", () => {
    expect(
      classifyMetaDrainState({
        queueDepth: 0,
        leasedPartitions: 0,
        completedLastWindow: 0,
        createdLastWindow: 0,
        latestActivityAt: null,
        windowMinutes: 15,
      }),
    ).toBe("clear");
  });

  it("recognizes draining backlog from current leases", () => {
    expect(
      classifyMetaDrainState({
        queueDepth: 8,
        leasedPartitions: 2,
        completedLastWindow: 0,
        createdLastWindow: 0,
        latestActivityAt: null,
        windowMinutes: 15,
      }),
    ).toBe("large_but_draining");
  });

  it("recognizes backlog that is busy-looking but not actually moving", () => {
    expect(
      classifyMetaDrainState({
        queueDepth: 8,
        leasedPartitions: 0,
        completedLastWindow: 0,
        createdLastWindow: 2,
        latestActivityAt: "2026-04-10T07:00:00.000Z",
        windowMinutes: 15,
      }),
    ).toBe("large_and_not_draining");
  });
});

describe("resolveMetaBenchmarkTruthWindows", () => {
  it("bases recent truth windows on the last completed day when current-day reference is present", () => {
    expect(
      resolveMetaBenchmarkTruthWindows({
        capturedAt: "2026-04-16T00:15:00.000Z",
        currentDayReference: "2026-04-15",
        recentDays: 14,
        priorityWindowDays: 3,
      }),
    ).toMatchObject({
      recentEndDate: "2026-04-14",
      recentStartDate: "2026-04-01",
      priorityEndDate: "2026-04-14",
      priorityStartDate: "2026-04-12",
    });
  });

  it("falls back to captured day and still excludes the live current day", () => {
    expect(
      resolveMetaBenchmarkTruthWindows({
        capturedAt: "2026-04-16T09:00:00.000Z",
        currentDayReference: null,
        recentDays: 7,
        priorityWindowDays: 2,
      }),
    ).toMatchObject({
      recentEndDate: "2026-04-15",
      recentStartDate: "2026-04-09",
      priorityEndDate: "2026-04-15",
      priorityStartDate: "2026-04-14",
    });
  });
});

describe("resolveMetaBusinessCurrentDayReference", () => {
  it("prefers the explicit warehouse reference when it is available", () => {
    expect(
      resolveMetaBusinessCurrentDayReference({
        capturedAt: "2026-04-19T04:50:00.000Z",
        currentDayReference: "2026-04-18",
        providerDateBoundaries: [{ currentDate: "2026-04-19" }],
        authoritativeAccountTimeZones: ["UTC"],
      }),
    ).toBe("2026-04-18");
  });

  it("prefers authoritative account timezones over stale provider boundaries", () => {
    expect(
      resolveMetaBusinessCurrentDayReference({
        capturedAt: "2026-04-19T04:50:00.000Z",
        currentDayReference: null,
        providerDateBoundaries: [{ currentDate: "2026-04-19" }],
        authoritativeAccountTimeZones: ["America/Chicago", "America/Chicago"],
      }),
    ).toBe("2026-04-18");
  });

  it("prefers the earliest provider account current day over a missing warehouse reference", () => {
    expect(
      resolveMetaBusinessCurrentDayReference({
        capturedAt: "2026-04-16T02:00:00.000Z",
        currentDayReference: null,
        providerDateBoundaries: [
          { currentDate: "2026-04-16" },
          { currentDate: "2026-04-15" },
        ],
      }),
    ).toBe("2026-04-15");
  });

  it("falls back to the warehouse reference when provider boundaries are unavailable", () => {
    expect(
      resolveMetaBusinessCurrentDayReference({
        capturedAt: "2026-04-16T09:00:00.000Z",
        currentDayReference: "2026-04-15",
        providerDateBoundaries: [],
        authoritativeAccountTimeZones: [],
      }),
    ).toBe("2026-04-15");
  });
});

describe("summarizeMetaSyncBenchmarkSeries", () => {
  it("marks a sampled series as busy when queue depth falls and ready-through advances", () => {
    const start = buildSnapshot({
      capturedAt: "2026-04-15T09:00:00.000Z",
    });
    const end = buildSnapshot({
      capturedAt: "2026-04-15T09:15:00.000Z",
      queue: {
        ...start.queue,
        queueDepth: 6,
        leasedPartitions: 2,
      },
      userFacing: {
        ...start.userFacing,
        recentCore: {
          ...start.userFacing.recentCore,
          summary: {
            ...start.userFacing.recentCore.summary,
            completedDays: 12,
            readyThroughDate: "2026-04-13",
            percent: 85,
          },
          campaigns: {
            ...start.userFacing.recentCore.campaigns,
            completedDays: 12,
            readyThroughDate: "2026-04-13",
            percent: 85,
          },
          percent: 85,
          readyThroughDate: "2026-04-13",
        },
      },
      syncState: {
        ...start.syncState,
        readyThroughDates: {
          recent_summary: "2026-04-13",
          recent_campaigns: "2026-04-13",
          recent_creatives: "2026-04-11",
        },
      },
      counters: {
        totalSucceeded: 106,
        totalCancelled: 2,
        totalDeadLettered: 1,
        totalPartitions: 131,
      },
    });

    const summary = summarizeMetaSyncBenchmarkSeries([start, end]);

    expect(summary).toMatchObject({
      observedState: "busy",
      progressObserved: true,
      queueDepthDelta: -6,
      terminalPartitionsDuringSample: 6,
      createdPartitionsDuringSample: 1,
    });
    expect(summary.readyThroughAdvancements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "recent_summary",
          from: "2026-04-11",
          to: "2026-04-13",
          dayDelta: 2,
        }),
      ]),
    );
  });

  it("marks backlog as blocked when selected-range truth is blocked", () => {
    const blocked = buildSnapshot({
      operator: {
        ...buildSnapshot().operator,
        progressState: "blocked",
        activityState: "blocked",
      },
      queue: {
        ...buildSnapshot().queue,
        deadLetterPartitions: 1,
      },
      userFacing: {
        ...buildSnapshot().userFacing,
        recentSelectedRangeTruth: {
          ...buildSnapshot().userFacing.recentSelectedRangeTruth,
          state: "blocked",
        },
      },
    });

    const summary = summarizeMetaSyncBenchmarkSeries([blocked]);

    expect(summary.observedState).toBe("blocked");
    expect(summary.finalDrainState).toBe("large_but_draining");
  });

  it("marks a non-moving queued series as stalled instead of merely waiting", () => {
    const waiting = buildSnapshot({
      capturedAt: "2026-04-15T09:00:00.000Z",
      operator: {
        ...buildSnapshot().operator,
        progressState: "partial_stuck",
        activityState: "stalled",
      },
      queue: {
        ...buildSnapshot().queue,
        leasedPartitions: 0,
      },
      velocity: {
        ...buildSnapshot().velocity,
        completedLastWindow: 0,
        createdLastWindow: 2,
        netDrainEstimate: -2,
        drainState: "large_and_not_draining",
      },
    });

    const summary = summarizeMetaSyncBenchmarkSeries([waiting]);

    expect(summary).toMatchObject({
      observedState: "stalled",
      progressObserved: false,
      queueDepthDelta: 0,
      terminalPartitionsDuringSample: 0,
      readyThroughAdvancements: [],
    });
  });
});
