import { describe, expect, it } from "vitest";
import { buildGoogleAdsAdvisorProgress } from "@/lib/google-ads/advisor-progress";

describe("buildGoogleAdsAdvisorProgress", () => {
  it("uses recent-84 day coverage instead of surface count", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: false,
      coverages: [
        { completedDays: 84 },
        { completedDays: 83 },
        { completedDays: 83 },
      ],
    });

    expect(result).toEqual({
      percent: 99,
      visible: true,
      summary:
        "Campaign, search term, and product history are still being prepared for the 84-day decision snapshot.",
    });
  });

  it("keeps the percentage high when only one required day is missing", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: false,
      coverages: [
        { completedDays: 84 },
        { completedDays: 84 },
        { completedDays: 83 },
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
        { completedDays: 84 },
        { completedDays: 84 },
        { completedDays: 84 },
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
        { completedDays: 84 },
        { completedDays: 84 },
        { completedDays: 84 },
      ],
    });

    expect(result).toEqual({
      percent: 100,
      visible: false,
      summary: "Finalizing 84-day decision snapshot support.",
    });
  });

  it("does not collapse to zero when one required coverage is temporarily unavailable", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: false,
      coverages: [
        { completedDays: 84 },
        { completedDays: 83 },
        { completedDays: null },
      ],
    });

    expect(result).toEqual({
      percent: 99,
      visible: true,
      summary: "Finalizing 84-day decision snapshot support.",
    });
  });

  it("hides advisor progress once required coverage is complete even before a snapshot exists", () => {
    const result = buildGoogleAdsAdvisorProgress({
      connected: true,
      assignedAccountCount: 1,
      coreUsable: true,
      advisorReady: false,
      coverages: [
        { completedDays: 84 },
        { completedDays: 84 },
        { completedDays: 84 },
      ],
    });

    expect(result).toEqual({
      percent: 100,
      visible: false,
      summary: "Finalizing 84-day decision snapshot support.",
    });
  });
});
