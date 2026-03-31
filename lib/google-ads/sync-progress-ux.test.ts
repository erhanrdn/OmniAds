import { describe, expect, it } from "vitest";
import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import { resolveGoogleAdsSyncProgress, shouldRenderGoogleAdsSyncProgress } from "@/lib/google-ads/sync-progress-ux";

const baseStatus: GoogleAdsStatusResponse = {
  state: "syncing",
  connected: true,
  assignedAccountIds: ["acct_1"],
  advisorProgress: null,
  historicalProgress: null,
};

describe("google ads sync progress ux", () => {
  it("prefers advisor progress while advisor unlock is incomplete", () => {
    const status: GoogleAdsStatusResponse = {
      ...baseStatus,
      advisorProgress: {
        percent: 94,
        visible: true,
        summary: "Search term, product, and asset history are still being prepared for analysis.",
      },
      historicalProgress: {
        percent: 52,
        visible: true,
        summary: "Historical sync continues in the background.",
      },
    };

    expect(resolveGoogleAdsSyncProgress(status, "inline")).toEqual({
      kind: "advisor",
      percent: 94,
      title: "Preparing analysis inputs",
      description: "Search term, product, and asset history are still being prepared for analysis.",
      tone: "primary",
    });
  });

  it("switches to historical progress only after advisor unlock progress disappears", () => {
    const status: GoogleAdsStatusResponse = {
      ...baseStatus,
      state: "ready",
      advisorProgress: {
        percent: 100,
        visible: false,
        summary: "Growth analysis is ready.",
      },
      historicalProgress: {
        percent: 61,
        visible: true,
        summary: "Historical sync continues in the background.",
      },
    };

    expect(resolveGoogleAdsSyncProgress(status, "inline")).toEqual({
      kind: "historical",
      percent: 61,
      title: "Historical sync continues",
      description: "Historical sync continues in the background.",
      tone: "secondary",
    });
  });

  it("hides the progress surface when neither phase is visible", () => {
    const status: GoogleAdsStatusResponse = {
      ...baseStatus,
      state: "ready",
      advisorProgress: {
        percent: 100,
        visible: false,
        summary: "Growth analysis is ready.",
      },
      historicalProgress: {
        percent: 100,
        visible: false,
        summary: "Historical sync is complete.",
      },
    };

    expect(shouldRenderGoogleAdsSyncProgress(status, "inline")).toBe(false);
    expect(resolveGoogleAdsSyncProgress(status, "inline")).toBeNull();
  });
});
