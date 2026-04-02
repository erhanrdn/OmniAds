import { describe, expect, it } from "vitest";
import { buildGoogleAdsAdvisorProgress } from "@/lib/google-ads/advisor-progress";

describe("buildGoogleAdsAdvisorProgress", () => {
  it("uses recent-90 day coverage instead of surface count", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: false,
      coverages: [
        { completedDays: 90 },
        { completedDays: 89 },
        { completedDays: 89 },
      ],
    });

    expect(result).toEqual({
      percent: 99,
      visible: true,
      summary: "Campaign, search term, and product history are still being prepared for analysis.",
    });
  });

  it("keeps the percentage high when only one required day is missing", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: false,
      coverages: [
        { completedDays: 90 },
        { completedDays: 90 },
        { completedDays: 89 },
      ],
    });

    expect(result.percent).toBe(99);
    expect(result.visible).toBe(true);
  });

  it("ignores optional asset coverage because advisor gating is required-surface only", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: false,
      coverages: [
        { completedDays: 90 },
        { completedDays: 90 },
        { completedDays: 90 },
      ],
    });

    expect(result.visible).toBe(false);
    expect(result.percent).toBe(100);
  });

  it("hides advisor progress once advisor is ready", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: true,
      coverages: [
        { completedDays: 90 },
        { completedDays: 90 },
        { completedDays: 90 },
      ],
    });

    expect(result).toEqual({
      percent: 100,
      visible: false,
      summary: "Finalizing growth analysis.",
    });
  });

  it("does not collapse to zero when one required coverage is temporarily unavailable", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: false,
      coverages: [
        { completedDays: 90 },
        { completedDays: 89 },
        { completedDays: null },
      ],
    });

    expect(result).toEqual({
      percent: 99,
      visible: true,
      summary: "Finalizing growth analysis.",
    });
  });

  it("hides advisor progress once required coverage is complete even before a snapshot exists", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: false,
      coverages: [
        { completedDays: 90 },
        { completedDays: 90 },
        { completedDays: 90 },
      ],
    });

    expect(result).toEqual({
      percent: 100,
      visible: false,
      summary: "Finalizing growth analysis.",
    });
  });
});
