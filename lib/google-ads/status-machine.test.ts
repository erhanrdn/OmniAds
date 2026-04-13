import { describe, expect, it } from "vitest";
import {
  decideGoogleAdsAdvisorReadiness,
  decideGoogleAdsFullSyncPriority,
  decideGoogleAdsStatusState,
} from "@/lib/google-ads/status-machine";

describe("decideGoogleAdsAdvisorReadiness", () => {
  it("treats required recent coverage as the top-level readiness truth", () => {
    expect(
      decideGoogleAdsAdvisorReadiness({
        connected: true,
        assignedAccountCount: 1,
        deadLetterPartitions: 0,
        recentSupportReady: true,
        snapshotAvailable: true,
      })
    ).toEqual({
      ready: true,
      notReady: false,
      readinessModel: "recent_84d_required_support",
    });

    expect(
      decideGoogleAdsAdvisorReadiness({
        connected: true,
        assignedAccountCount: 1,
        deadLetterPartitions: 2,
        recentSupportReady: true,
        snapshotAvailable: false,
      })
    ).toEqual({
      ready: true,
      notReady: false,
      readinessModel: "recent_84d_required_support",
    });
  });

  it("marks the advisor as not ready only while required recent coverage is incomplete", () => {
    expect(
      decideGoogleAdsAdvisorReadiness({
        connected: true,
        assignedAccountCount: 1,
        deadLetterPartitions: 0,
        recentSupportReady: false,
        snapshotAvailable: false,
      })
    ).toEqual({
      ready: false,
      notReady: true,
      readinessModel: "recent_84d_required_support",
    });
  });
});

describe("decideGoogleAdsStatusState", () => {
  const baseInput = {
    connected: true,
    assignedAccountCount: 1,
    coreUsable: true,
    historicalQueuePaused: false,
    deadLetterPartitions: 0,
    advisorRelevantDeadLetterPartitions: 0,
    advisorRelevantFailedPartitions: 0,
    advisorRelevantUnhealthyLeases: 0,
    latestSyncStatus: null,
    runningJobs: 0,
    staleRunningJobs: 0,
    selectedRangeCoreIncomplete: false,
    visibleSelectedRangePendingSurfaces: [],
    historicalProgressPercent: 100,
    needsBootstrap: false,
    productPendingSurfaces: [],
    selectedRangeTotalDays: 28,
    advisorMissingSurfaces: [],
    supportWindowMissingCount: 0,
    advisorNotReady: false,
  };

  it("returns ready for a fully prepared workspace", () => {
    expect(decideGoogleAdsStatusState({ ...baseInput })).toBe("ready");
  });

  it("returns partial when core history is ready but product surfaces still lag", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        visibleSelectedRangePendingSurfaces: ["product_daily"],
      })
    ).toBe("partial");
  });

  it("returns advisor_not_ready when the page is usable but canonical advisor inputs lag", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        advisorNotReady: true,
      })
    ).toBe("advisor_not_ready");
  });

  it("keeps the provider syncing while core reporting is not yet usable", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        coreUsable: false,
      })
    ).toBe("syncing");
  });

  it("keeps the provider syncing while selected-range core coverage is incomplete", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        selectedRangeCoreIncomplete: true,
      })
    ).toBe("syncing");
  });

  it("returns paused when history is incomplete and background activity stopped", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        historicalQueuePaused: true,
        historicalProgressPercent: 40,
      })
    ).toBe("paused");
  });

  it("returns action_required when advisor-relevant dead letters exist", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        deadLetterPartitions: 12,
        advisorRelevantDeadLetterPartitions: 1,
      })
    ).toBe("action_required");
  });

  it("does not return action_required when only historical dead letters exist", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        deadLetterPartitions: 12,
      })
    ).toBe("ready");
  });
});

describe("decideGoogleAdsFullSyncPriority", () => {
  it("requires full sync when advisor is blocked by search term or product history", () => {
    expect(
      decideGoogleAdsFullSyncPriority({
        advisorReady: false,
        advisorMissingSurfaces: ["search_term_daily", "asset_daily"],
      })
    ).toEqual({
      required: true,
      reason: "Advisor blocked by missing extended historical support; prioritizing full sync.",
      targetScopes: ["search_term_daily", "asset_daily"],
    });

    expect(
      decideGoogleAdsFullSyncPriority({
        advisorReady: false,
        advisorMissingSurfaces: ["product_daily"],
      })
    ).toEqual({
      required: true,
      reason: "Advisor blocked by missing extended historical support; prioritizing full sync.",
      targetScopes: ["product_daily"],
    });
  });

  it("does not require full sync when only non-primary advisor support surfaces are missing", () => {
    expect(
      decideGoogleAdsFullSyncPriority({
        advisorReady: false,
        advisorMissingSurfaces: ["asset_daily"],
      })
    ).toEqual({
      required: false,
      reason: null,
      targetScopes: ["asset_daily"],
    });
  });
});
