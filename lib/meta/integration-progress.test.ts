import { describe, expect, it } from "vitest";
import { resolveMetaIntegrationProgress } from "@/lib/meta/integration-progress";
import type { MetaStatusResponse } from "@/lib/meta/status-types";

function buildStatus(
  overrides: Partial<MetaStatusResponse> = {}
): MetaStatusResponse {
  return {
    state: "syncing",
    connected: true,
    assignedAccountIds: ["act_1"],
    primaryAccountTimezone: "UTC",
    latestSync: {
      status: "running",
      readyThroughDate: "2026-04-10",
      progressPercent: 71,
    },
    coreReadiness: {
      state: "ready",
      usable: true,
      complete: true,
      percent: 100,
      reason: null,
      summary: "Summary and campaign data are ready for Meta's primary reporting surfaces.",
      missingSurfaces: [],
      blockedSurfaces: [],
      surfaces: {} as never,
    },
    extendedCompleteness: {
      state: "syncing",
      complete: false,
      percent: 33,
      reason: "Breakdown data is still being prepared for the selected range.",
      summary: "Breakdown data is still being prepared for the selected range.",
      missingSurfaces: ["breakdowns.age"],
      blockedSurfaces: [],
      surfaces: {} as never,
    },
    rangeCompletionBySurface: {
      account_daily: {
        recentCompletedDays: 10,
        recentTotalDays: 14,
        historicalCompletedDays: 180,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-10",
      },
      campaign_daily: {
        recentCompletedDays: 10,
        recentTotalDays: 14,
        historicalCompletedDays: 180,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-10",
      },
      adset_daily: {
        recentCompletedDays: 8,
        recentTotalDays: 14,
        historicalCompletedDays: 160,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-08",
      },
      creative_daily: {
        recentCompletedDays: 6,
        recentTotalDays: 14,
        historicalCompletedDays: 120,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-06",
      },
      ad_daily: {
        recentCompletedDays: 6,
        recentTotalDays: 14,
        historicalCompletedDays: 110,
        historicalTotalDays: 365,
        readyThroughDate: "2026-04-05",
      },
    },
    recentExtendedReady: false,
    historicalExtendedReady: false,
    warehouse: {
      coverage: {
        pendingSurfaces: ["creative_daily", "ad_daily"],
      },
    } as never,
    jobHealth: {
      queueDepth: 8,
      leasedPartitions: 2,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
    } as never,
    operations: {
      progressState: "syncing",
      blockingReasons: [],
      repairableActions: [],
      stallFingerprints: [],
    },
    ...overrides,
  };
}

describe("resolveMetaIntegrationProgress", () => {
  it("returns null when Meta is disconnected or no account is assigned", () => {
    expect(
      resolveMetaIntegrationProgress(
        buildStatus({ connected: false })
      )
    ).toBeNull();
    expect(
      resolveMetaIntegrationProgress(
        buildStatus({ assignedAccountIds: [] })
      )
    ).toBeNull();
  });

  it("builds a compact stage list for active Meta sync progress", () => {
    const model = resolveMetaIntegrationProgress(buildStatus());

    expect(model?.stages.map((stage) => stage.title)).toEqual([
      "Connection",
      "Queue / worker",
      "Core data",
      "Priority range / recent window",
      "Extended surfaces",
    ]);
    expect(model?.stages[0]).toMatchObject({
      state: "ready",
      label: "connected",
    });
    expect(model?.stages[1]).toMatchObject({
      state: "working",
      label: "worker active",
      evidence: "Queue 8 • Leased 2",
    });
    expect(model?.stages[2]).toMatchObject({
      state: "ready",
      label: "core ready",
    });
    expect(model?.stages[3]).toMatchObject({
      state: "working",
      label: "recent window preparing",
      percent: 71,
    });
    expect(model?.stages[4]).toMatchObject({
      state: "working",
      label: "breakdowns preparing",
      percent: 33,
      evidence: expect.stringContaining("Pending creatives, ads"),
    });
    expect(model?.attentionNeeded).toBe(false);
  });

  it("overrides optimistic queue visuals when Meta is paused", () => {
    const model = resolveMetaIntegrationProgress(
      buildStatus({
        state: "paused",
        latestSync: {
          status: "pending",
        },
        jobHealth: {
          queueDepth: 12,
          leasedPartitions: 0,
          retryableFailedPartitions: 0,
          deadLetterPartitions: 0,
        } as never,
        operations: {
          progressState: "partial_stuck",
          blockingReasons: [],
          repairableActions: [],
          stallFingerprints: [],
        },
      })
    );

    expect(model?.stages.find((stage) => stage.key === "queue_worker")).toMatchObject({
      state: "waiting",
      label: "queue waiting",
      evidence: "Queue 12",
    });
    expect(model?.stages.find((stage) => stage.key === "attention")).toMatchObject({
      state: "waiting",
      label: "queue waiting",
      detail: "Queued work is safe. Sync will resume automatically when the worker becomes active again.",
    });
  });

  it("shows a blocked priority stage when selected-range truth is not publishable yet", () => {
    const model = resolveMetaIntegrationProgress(
      buildStatus({
        state: "action_required",
        priorityWindow: {
          startDate: "2026-04-01",
          endDate: "2026-04-07",
          completedDays: 3,
          totalDays: 7,
          isActive: false,
        },
        selectedRangeTruth: {
          truthReady: false,
          state: "blocked",
          verificationState: "blocked",
          totalDays: 7,
          completedCoreDays: 3,
          blockingReasons: ["validation_failed"],
          reasonCounts: { validation_failed: 1 },
        },
        operations: {
          progressState: "blocked",
          blockingReasons: [
            {
              code: "blocked_publication_mismatch",
              detail: "Historical Meta selected-range truth is not yet published.",
              repairable: false,
            },
          ],
          repairableActions: [],
          stallFingerprints: [],
        },
      })
    );

    expect(model?.stages.find((stage) => stage.key === "priority_window")).toMatchObject({
      state: "blocked",
      label: "priority blocked",
      percent: 43,
      evidence: expect.stringContaining("Published truth blocked"),
    });
    expect(model?.stages.find((stage) => stage.key === "attention")).toMatchObject({
      state: "blocked",
      label: "attention needed",
    });
  });

  it("renders a recovery stage when repairable backlog is progressing", () => {
    const model = resolveMetaIntegrationProgress(
      buildStatus({
        state: "partial",
        jobHealth: {
          queueDepth: 4,
          leasedPartitions: 1,
          retryableFailedPartitions: 2,
          deadLetterPartitions: 0,
        } as never,
        operations: {
          progressState: "partial_progressing",
          blockingReasons: [],
          repairableActions: [
            {
              kind: "requeue_failed",
              detail: "Requeue retryable Meta failed partitions.",
              available: true,
            },
          ],
          stallFingerprints: ["repair_loop_without_progress"],
        },
      })
    );

    expect(model?.stages.find((stage) => stage.key === "attention")).toMatchObject({
      state: "working",
      label: "recovery running",
      detail: "Meta is clearing retryable work in the background.",
      evidence: expect.stringContaining("Recovery available: Retry failed partitions"),
    });
  });
});
