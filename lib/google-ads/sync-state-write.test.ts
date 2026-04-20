import { describe, expect, it } from "vitest";
import { mergeGoogleAdsSyncStateWrite } from "@/lib/google-ads/sync-state-write";
import type { GoogleAdsSyncStateRecord } from "@/lib/google-ads/warehouse-types";

const baseState: GoogleAdsSyncStateRecord = {
  businessId: "biz",
  providerAccountId: "acct",
  scope: "campaign_daily",
  historicalTargetStart: "2024-01-01",
  historicalTargetEnd: "2025-12-31",
  effectiveTargetStart: "2024-01-01",
  effectiveTargetEnd: "2025-12-31",
  readyThroughDate: "2025-12-31",
  lastSuccessfulPartitionDate: "2025-12-31",
  latestBackgroundActivityAt: "2026-03-31T07:00:00.000Z",
  latestSuccessfulSyncAt: "2026-03-31T07:00:00.000Z",
  completedDays: 730,
  deadLetterCount: 0,
};

describe("mergeGoogleAdsSyncStateWrite", () => {
  it("preserves known coverage when a refresh tries to overwrite it with zero", () => {
    const result = mergeGoogleAdsSyncStateWrite({
      existing: baseState,
      next: {
        ...baseState,
        completedDays: 0,
        readyThroughDate: null,
        lastSuccessfulPartitionDate: null,
        latestSuccessfulSyncAt: null,
      },
    });

    expect(result.completedDays).toBe(730);
    expect(result.readyThroughDate).toBe("2025-12-31");
    expect(result.lastSuccessfulPartitionDate).toBe("2025-12-31");
  });

  it("allows valid non-zero updates through", () => {
    const result = mergeGoogleAdsSyncStateWrite({
      existing: baseState,
      next: {
        ...baseState,
        completedDays: 731,
        readyThroughDate: "2026-01-01",
        lastSuccessfulPartitionDate: "2026-01-01",
      },
    });

    expect(result.completedDays).toBe(731);
    expect(result.readyThroughDate).toBe("2026-01-01");
  });

  it("preserves the last real activity and success timestamps when a no-op refresh reports none", () => {
    const result = mergeGoogleAdsSyncStateWrite({
      existing: baseState,
      next: {
        ...baseState,
        latestBackgroundActivityAt: null,
        latestSuccessfulSyncAt: null,
      },
    });

    expect(result.latestBackgroundActivityAt).toBe(
      "2026-03-31T07:00:00.000Z",
    );
    expect(result.latestSuccessfulSyncAt).toBe("2026-03-31T07:00:00.000Z");
  });

  it("accepts newer real activity timestamps", () => {
    const result = mergeGoogleAdsSyncStateWrite({
      existing: baseState,
      next: {
        ...baseState,
        latestBackgroundActivityAt: "2026-04-01T07:00:00.000Z",
        latestSuccessfulSyncAt: "2026-04-01T07:00:00.000Z",
      },
    });

    expect(result.latestBackgroundActivityAt).toBe(
      "2026-04-01T07:00:00.000Z",
    );
    expect(result.latestSuccessfulSyncAt).toBe("2026-04-01T07:00:00.000Z");
  });
});
