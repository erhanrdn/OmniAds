import { describe, expect, it } from "vitest";
import {
  decideGoogleAdsAdvisorReadiness,
  decideGoogleAdsStatusState,
} from "@/lib/google-ads/status-machine";

describe("decideGoogleAdsAdvisorReadiness", () => {
  it("requires full selected-range coverage and zero dead letters", () => {
    expect(
      decideGoogleAdsAdvisorReadiness({
        connected: true,
        assignedAccountCount: 1,
        selectedRangeTotalDays: 28,
        advisorMissingSurfaces: [],
        supportWindowMissingCount: 0,
        deadLetterPartitions: 0,
        historicalProgressPercent: 100,
        selectedRangeIncomplete: false,
      })
    ).toEqual({ ready: true, notReady: false });

    expect(
      decideGoogleAdsAdvisorReadiness({
        connected: true,
        assignedAccountCount: 1,
        selectedRangeTotalDays: 28,
        advisorMissingSurfaces: [],
        supportWindowMissingCount: 0,
        deadLetterPartitions: 2,
        historicalProgressPercent: 100,
        selectedRangeIncomplete: false,
      })
    ).toEqual({ ready: false, notReady: true });
  });

  it("stays blocked when support windows are still missing required surfaces", () => {
    expect(
      decideGoogleAdsAdvisorReadiness({
        connected: true,
        assignedAccountCount: 1,
        selectedRangeTotalDays: 1,
        advisorMissingSurfaces: [],
        supportWindowMissingCount: 2,
        deadLetterPartitions: 0,
        historicalProgressPercent: 100,
        selectedRangeIncomplete: false,
      })
    ).toEqual({ ready: false, notReady: true });
  });
});

describe("decideGoogleAdsStatusState", () => {
  const baseInput = {
    connected: true,
    assignedAccountCount: 1,
    historicalQueuePaused: false,
    deadLetterPartitions: 0,
    latestSyncStatus: null,
    runningJobs: 0,
    staleRunningJobs: 0,
    selectedRangeIncomplete: false,
    historicalProgressPercent: 100,
    needsBootstrap: false,
    productPendingSurfaces: [],
    selectedRangeTotalDays: 28,
    advisorMissingSurfaces: [],
    supportWindowMissingCount: 0,
    advisorNotReady: false,
  } as const;

  it("returns ready for a fully prepared workspace", () => {
    expect(decideGoogleAdsStatusState({ ...baseInput })).toBe("ready");
  });

  it("returns partial when core history is ready but product surfaces still lag", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        historicalProgressPercent: 80,
        productPendingSurfaces: ["campaign_daily"],
      })
    ).toBe("partial");
  });

  it("returns advisor_not_ready when selected range is complete but advisor inputs are not", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        advisorNotReady: true,
      })
    ).toBe("advisor_not_ready");
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

  it("returns action_required when dead letters exist", () => {
    expect(
      decideGoogleAdsStatusState({
        ...baseInput,
        deadLetterPartitions: 1,
      })
    ).toBe("action_required");
  });
});
