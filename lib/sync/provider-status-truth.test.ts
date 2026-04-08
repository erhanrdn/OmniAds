import { describe, expect, it } from "vitest";
import {
  buildRequiredCoverage,
  buildProviderProgressEvidence,
  deriveProviderStallFingerprints,
  deriveProviderProgressState,
  hasRecentProviderAdvancement,
} from "@/lib/sync/provider-status-truth";

describe("buildRequiredCoverage", () => {
  it("does not round incomplete coverage up to 100 percent", () => {
    expect(
      buildRequiredCoverage({
        completedDays: 729,
        totalDays: 730,
        readyThroughDate: "2026-04-02",
      })
    ).toEqual(
      expect.objectContaining({
        percent: 99,
        complete: false,
      })
    );
  });
});

describe("buildProviderProgressEvidence", () => {
  it("uses bottleneck aggregation for lane progress evidence", () => {
    const evidence = buildProviderProgressEvidence({
      states: [
        {
          completedDays: 10,
          readyThroughDate: "2026-03-20",
          latestSuccessfulSyncAt: "2026-04-02T10:00:00.000Z",
          updatedAt: "2026-04-02T10:00:00.000Z",
        },
        {
          completedDays: 8,
          readyThroughDate: "2026-03-18",
          latestSuccessfulSyncAt: "2026-04-02T09:30:00.000Z",
          updatedAt: "2026-04-02T09:30:00.000Z",
        },
      ],
      aggregation: "bottleneck",
      recentActivityWindowMinutes: 20,
    });

    expect(evidence.lastCompletedAt).toBe("2026-04-02T09:30:00.000Z");
  });
});

describe("hasRecentProviderAdvancement", () => {
  it("treats reduced backlog as advancement even without timestamps", () => {
    expect(
      hasRecentProviderAdvancement({
        progressEvidence: {
          lastCheckpointAdvancedAt: null,
          lastReadyThroughAdvancedAt: null,
          lastCompletedAt: null,
          backlogDelta: -2,
          completedPartitionDelta: null,
          lastReplayAt: null,
          lastReclaimAt: null,
          recentActivityWindowMinutes: 20,
        },
      })
    ).toBe(true);
  });
});

describe("deriveProviderProgressState", () => {
  it("marks backlog as partial_progressing only when evidence is recent", () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    const state = deriveProviderProgressState({
      queueDepth: 5,
      leasedPartitions: 0,
      checkpointLagMinutes: 5,
      latestPartitionActivityAt: null,
      blocked: false,
      fullyReady: false,
      progressEvidence: {
        lastCheckpointAdvancedAt: recent,
        lastReadyThroughAdvancedAt: null,
        lastCompletedAt: null,
        backlogDelta: null,
        completedPartitionDelta: null,
        lastReplayAt: null,
        lastReclaimAt: null,
        recentActivityWindowMinutes: 20,
      },
    });

    expect(state).toBe("partial_progressing");
  });

  it("marks idle backlog as partial_stuck when evidence is stale", () => {
    const stale = new Date(Date.now() - 45 * 60_000).toISOString();
    const state = deriveProviderProgressState({
      queueDepth: 5,
      leasedPartitions: 0,
      checkpointLagMinutes: 25,
      latestPartitionActivityAt: null,
      blocked: false,
      fullyReady: false,
      progressEvidence: {
        lastCheckpointAdvancedAt: stale,
        lastReadyThroughAdvancedAt: null,
        lastCompletedAt: null,
        backlogDelta: null,
        completedPartitionDelta: null,
        lastReplayAt: null,
        lastReclaimAt: null,
        recentActivityWindowMinutes: 20,
      },
    });

    expect(state).toBe("partial_stuck");
  });
});

describe("deriveProviderStallFingerprints", () => {
  it("flags historical starvation when backlog exists without advancement", () => {
    const stale = new Date(Date.now() - 45 * 60_000).toISOString();
    const fingerprints = deriveProviderStallFingerprints({
      queueDepth: 8,
      leasedPartitions: 0,
      checkpointLagMinutes: 30,
      latestPartitionActivityAt: null,
      blocked: false,
      progressEvidence: {
        lastCheckpointAdvancedAt: stale,
        lastReadyThroughAdvancedAt: null,
        lastCompletedAt: null,
        backlogDelta: null,
        completedPartitionDelta: null,
        lastReplayAt: null,
        lastReclaimAt: null,
        recentActivityWindowMinutes: 20,
      },
      historicalBacklogDepth: 5,
    });

    expect(fingerprints).toContain("historical_starvation");
    expect(fingerprints).toContain("checkpoint_not_advancing");
  });

  it("flags dead-letter completion blockers explicitly", () => {
    const fingerprints = deriveProviderStallFingerprints({
      queueDepth: 1,
      leasedPartitions: 0,
      checkpointLagMinutes: null,
      latestPartitionActivityAt: null,
      blocked: true,
      blockedReasonCodes: ["required_dead_letter_partitions"],
      progressEvidence: null,
    });

    expect(fingerprints).toContain("dead_letter_blocking_completion");
  });
});
