import { describe, expect, it } from "vitest";
import { buildGoogleAdsCoreReadiness } from "@/lib/google-ads/core-readiness";

describe("buildGoogleAdsCoreReadiness", () => {
  it("uses warehouse coverage as the primary authority for core readiness", () => {
    const result = buildGoogleAdsCoreReadiness({
      connected: true,
      assignedAccountCount: 1,
      totalDays: 730,
      accountCoverageDays: 730,
      campaignCoverageDays: 730,
      campaignReadyThroughDate: "2026-03-30",
    });

    expect(result.coreUsable).toBe(true);
    expect(result.productPendingSurfaces).toEqual([]);
    expect(result.historicalProgressPercent).toBe(100);
    expect(result.needsBootstrap).toBe(false);
  });

  it("does not let a stale state table force core back into preparing mode", () => {
    const result = buildGoogleAdsCoreReadiness({
      connected: true,
      assignedAccountCount: 1,
      totalDays: 730,
      accountCoverageDays: 730,
      campaignCoverageDays: 730,
      campaignReadyThroughDate: "2026-03-30",
    });

    expect(result.coreUsable).toBe(true);
    expect(result.overallCompletedDays).toBe(730);
  });

  it("marks campaign as pending only when warehouse campaign coverage is actually incomplete", () => {
    const result = buildGoogleAdsCoreReadiness({
      connected: true,
      assignedAccountCount: 1,
      totalDays: 730,
      accountCoverageDays: 730,
      campaignCoverageDays: 412,
      campaignReadyThroughDate: "2025-05-16",
    });

    expect(result.productPendingSurfaces).toEqual(["campaign_daily"]);
    expect(result.historicalProgressPercent).toBe(56);
    expect(result.needsBootstrap).toBe(true);
  });
});
