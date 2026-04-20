import { describe, expect, it } from "vitest";
import { resolveGoogleIntegrationProgress } from "@/lib/google-ads/integration-progress";
import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";

function buildGoogleStatus(
  overrides: Partial<GoogleAdsStatusResponse> = {},
): GoogleAdsStatusResponse {
  return {
    state: "action_required",
    connected: true,
    assignedAccountIds: ["acc_1"],
    blockerClass: "none",
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
    operations: {
      currentMode: "safe_mode",
      globalExtendedExecutionEnabled: false,
      quotaPressure: 0,
      breakerState: "closed",
      progressState: "blocked",
      blockingReasons: [],
      repairableActions: [],
      stallFingerprints: [],
      activityState: "ready",
    } as never,
    domains: {
      core: {
        state: "ready",
        label: "Core ready",
        detail: "Summary and campaign data are ready.",
      },
      selectedRange: {
        state: "ready",
        label: "Range ready",
        detail: "Selected range surfaces are ready.",
      },
      advisor: {
        state: "ready",
        label: "Analysis ready",
        detail: "Analysis inputs are ready.",
      },
    },
    panel: {
      coreUsable: true,
      extendedLimited: false,
      headline: "Google Ads is ready.",
      detail: "All primary surfaces are available.",
      surfaceStates: [],
    },
    advisor: {
      ready: true,
      readinessWindowDays: 90,
      requiredSurfaces: [],
      availableSurfaces: [],
      missingSurfaces: [],
      readyRangeStart: "2026-01-01",
      readyRangeEnd: "2026-04-19",
    },
    primaryAccountTimezone: "UTC",
    warehouse: {
      rowCount: 7,
      firstDate: "2026-04-13",
      lastDate: "2026-04-19",
      coverage: {
        selectedRange: {
          startDate: "2026-04-13",
          endDate: "2026-04-19",
          completedDays: 7,
          totalDays: 7,
          readyThroughDate: "2026-04-19",
          isComplete: true,
        },
      },
    },
    jobHealth: {
      runningJobs: 0,
      staleRunningJobs: 0,
      queueDepth: 0,
      leasedPartitions: 0,
      deadLetterPartitions: 0,
    },
    ...overrides,
  };
}

describe("resolveGoogleIntegrationProgress", () => {
  it("suppresses the attention stage when the shared control plane is closed", () => {
    const model = resolveGoogleIntegrationProgress(buildGoogleStatus(), "en");

    expect(model?.attentionNeeded).toBe(false);
    expect(model?.stages.some((stage) => stage.key === "attention")).toBe(false);
    expect(model?.stages.find((stage) => stage.key === "queue_worker")).toMatchObject({
      state: "ready",
      label: "queue clear",
    });
  });

  it("renders the attention stage when release truth is actually blocked", () => {
    const model = resolveGoogleIntegrationProgress(
      buildGoogleStatus({
        blockerClass: "queue_blocked",
        releaseGate: {
          id: "gate-2",
          gateKind: "release_gate",
          gateScope: "release_readiness",
          buildId: "build-1",
          environment: "production",
          mode: "block",
          baseResult: "fail",
          verdict: "blocked",
          blockerClass: "queue_blocked",
          summary: "queue blocked",
          breakGlass: false,
          overrideReason: null,
          evidence: {},
          emittedAt: "2026-04-20T07:22:20.362Z",
        },
        repairPlan: {
          id: "plan-2",
          buildId: "build-1",
          environment: "production",
          providerScope: "google_ads",
          planMode: "dry_run",
          eligible: true,
          blockedReason: null,
          breakGlass: false,
          summary: "1 recommendation",
          recommendations: [
            {
              action: "replay_dead_letter",
              reason: "dead letter present",
              blockerClass: "queue_blocked",
              evidence: {},
            } as never,
          ],
          emittedAt: "2026-04-20T07:22:20.672Z",
        },
        jobHealth: {
          runningJobs: 0,
          staleRunningJobs: 0,
          queueDepth: 4,
          leasedPartitions: 0,
          deadLetterPartitions: 1,
        },
      }),
      "en",
    );

    expect(model?.attentionNeeded).toBe(true);
    expect(model?.stages.some((stage) => stage.key === "attention")).toBe(true);
  });
});
