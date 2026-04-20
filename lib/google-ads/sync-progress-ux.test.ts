import { describe, expect, it } from "vitest";
import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import {
  getGoogleAdsStatusRefetchInterval,
  resolveGoogleAdsSyncProgress,
  shouldRenderGoogleAdsSyncProgress,
} from "@/lib/google-ads/sync-progress-ux";

const baseStatus: GoogleAdsStatusResponse = {
  state: "syncing",
  connected: true,
  assignedAccountIds: ["acct_1"],
  advisorProgress: null,
  historicalProgress: null,
};

describe("google ads sync progress ux", () => {
  it("prefers required scope completion over advisor progress for workspace sync completion", () => {
    const status: GoogleAdsStatusResponse = {
      ...baseStatus,
      requiredScopeCompletion: {
        completedDays: 97,
        totalDays: 100,
        percent: 97,
        readyThroughDate: "2026-04-05",
        complete: false,
      },
      platformDateBoundary: {
        primaryAccountId: "acct_1",
        primaryAccountTimezone: "UTC",
        currentDateInTimezone: "2026-04-07",
        previousDateInTimezone: "2026-04-06",
        selectedRangeMode: "historical_warehouse",
        mixedCurrentDates: false,
        accounts: [],
      },
      advisorProgress: {
        percent: 94,
        visible: true,
        summary: "Search term, product, and asset history are still being prepared for analysis.",
      },
    };

    expect(resolveGoogleAdsSyncProgress(status, "inline")).toEqual({
      kind: "historical",
      percent: 97,
      title: "Required sync continues",
      description: "Required Google Ads warehouse coverage is ready through 2026-04-05.",
      tone: "secondary",
    });
  });

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
        summary: "Historical sync continues in the background with recent dates prioritized first.",
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
        summary: "Historical sync continues in the background with recent dates prioritized first.",
      },
    };

    expect(resolveGoogleAdsSyncProgress(status, "inline")).toEqual({
      kind: "historical",
      percent: 61,
      title: "Historical sync continues",
      description: "Historical sync continues in the background with recent dates prioritized first.",
      tone: "secondary",
    });
  });

  it("shows historical progress even when advisor snapshot is still unavailable", () => {
    const status: GoogleAdsStatusResponse = {
      ...baseStatus,
      state: "syncing",
      advisor: {
        ready: false,
        requiredSurfaces: ["campaign_daily", "search_term_daily", "product_daily"],
        availableSurfaces: ["campaign_daily", "search_term_daily", "product_daily"],
        missingSurfaces: [],
        readyRangeStart: "2025-12-30",
        readyRangeEnd: "2026-03-29",
      },
      advisorProgress: {
        percent: 99,
        visible: false,
        summary: "Finalizing growth analysis.",
      },
      historicalProgress: {
        percent: 61,
        visible: true,
        summary: "Historical sync continues in the background with recent dates prioritized first.",
      },
    };

    expect(resolveGoogleAdsSyncProgress(status, "inline")).toEqual({
      kind: "historical",
      percent: 61,
      title: "Historical sync continues",
      description: "Historical sync continues in the background with recent dates prioritized first.",
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

  it("hides progress when shared control-plane is fully closed", () => {
    const status: GoogleAdsStatusResponse = {
      ...baseStatus,
      state: "action_required",
      blockerClass: "none",
      operations: {
        progressState: "blocked",
      } as never,
      controlPlanePersistence: {
        identity: {
          buildId: "build-1",
          environment: "production",
          providerScope: "google_ads",
        },
        exact: {
          deployGate: null,
          releaseGate: null,
          repairPlan: null,
        },
        fallbackByBuild: {
          deployGate: null,
          releaseGate: null,
          repairPlan: null,
        },
        latest: {
          deployGate: null,
          releaseGate: null,
          repairPlan: null,
        },
        missingExact: [],
        exactRowsPresent: true,
      },
      releaseGate: {
        id: "gate-1",
        gateKind: "release_gate",
        gateScope: "release_readiness",
        buildId: "build-1",
        environment: "production",
        mode: "block",
        baseResult: "pass",
        verdict: "pass",
        blockerClass: null,
        summary: "passed",
        breakGlass: false,
        overrideReason: null,
        evidence: {},
        emittedAt: "2026-04-20T07:22:20.362Z",
      },
      repairPlan: {
        id: "plan-1",
        buildId: "build-1",
        environment: "production",
        providerScope: "google_ads",
        planMode: "dry_run",
        eligible: true,
        blockedReason: null,
        breakGlass: false,
        summary: "no recommendations",
        recommendations: [],
        emittedAt: "2026-04-20T07:22:20.672Z",
      },
      historicalProgress: {
        percent: 61,
        visible: true,
        summary: "Historical sync continues in the background with recent dates prioritized first.",
      },
    };

    expect(resolveGoogleAdsSyncProgress(status, "inline")).toBeNull();
    expect(shouldRenderGoogleAdsSyncProgress(status, "inline")).toBe(false);
    expect(getGoogleAdsStatusRefetchInterval(status)).toBe(false);
  });
});
