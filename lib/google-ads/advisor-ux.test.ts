import { describe, expect, it } from "vitest";
import {
  canOpenGoogleAdsAdvisor,
  getGoogleAdsAdvisorButtonLabel,
  getGoogleAdsAdvisorCtaState,
  getGoogleAdsAdvisorHelperText,
  getGoogleAdsAdvisorIdleState,
} from "@/lib/google-ads/advisor-ux";
import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";

function buildOperations(
  overrides: Partial<NonNullable<GoogleAdsStatusResponse["operations"]>> = {}
): NonNullable<GoogleAdsStatusResponse["operations"]> {
  return {
    currentMode: "global_backfill",
    globalExtendedExecutionEnabled: false,
    quotaPressure: 0,
    breakerState: "closed",
    ...overrides,
  };
}

function buildStatus(
  overrides: Partial<GoogleAdsStatusResponse> = {}
): GoogleAdsStatusResponse {
  return {
    ...overrides,
    state: "advisor_not_ready",
    connected: true,
    assignedAccountIds: ["acct_1"],
    operations: buildOperations(overrides.operations ?? undefined),
  };
}

describe("google ads advisor ux helpers", () => {
  it("maps CTA states to user-facing labels", () => {
    expect(
      getGoogleAdsAdvisorButtonLabel({
        isLoading: false,
        ctaState: "open",
      })
    ).toBe("Open Decision Snapshot");

    expect(
      getGoogleAdsAdvisorButtonLabel({
        isLoading: false,
        ctaState: "prepare",
      })
    ).toBe("Prepare Decision Snapshot");

    expect(
      getGoogleAdsAdvisorButtonLabel({
        isLoading: false,
        ctaState: "refreshable",
      })
    ).toBe("Refresh Decision Snapshot");

    expect(
      getGoogleAdsAdvisorButtonLabel({
        isLoading: false,
        ctaState: "blocked",
      })
    ).toBe("Decision Snapshot Unavailable");
  });

  it("derives blocked state without changing enablement semantics", () => {
    expect(
      getGoogleAdsAdvisorCtaState({
        status: buildStatus(),
        canOpen: false,
        hasCurrentAnalysis: false,
      })
    ).toBe("blocked");

    expect(
      getGoogleAdsAdvisorCtaState({
        status: buildStatus(),
        canOpen: true,
        hasCurrentAnalysis: false,
        snapshotReady: false,
      })
    ).toBe("prepare");

    expect(
      getGoogleAdsAdvisorCtaState({
        status: buildStatus(),
        canOpen: true,
        hasCurrentAnalysis: true,
        snapshotReady: true,
      })
    ).toBe("refreshable");

    expect(
      getGoogleAdsAdvisorCtaState({
        status: buildStatus(),
        canOpen: true,
        hasCurrentAnalysis: false,
        snapshotReady: true,
      })
    ).toBe("open");
  });

  it("maps blocker reasons to product copy", () => {
    expect(
      getGoogleAdsAdvisorHelperText({
        status: buildStatus({
          operations: buildOperations({ advisorSnapshotBlockedReason: "recent84_incomplete" }),
        }),
        ctaState: "blocked",
        advisorIsStale: false,
        lastAnalyzedLabel: null,
      })
    ).toBe(
      "Campaign, search term, and product history are still being prepared for the 84-day decision snapshot."
    );

    expect(
      getGoogleAdsAdvisorHelperText({
        status: buildStatus({
          operations: buildOperations({
            advisorSnapshotBlockedReason: "recent_required_dead_letter_partitions",
          }),
        }),
        ctaState: "blocked",
        advisorIsStale: false,
        lastAnalyzedLabel: null,
      })
    ).toBe("Some analysis inputs need recovery before insights can open.");
  });

  it("keeps helper copy aligned to the multi-window decision snapshot", () => {
    expect(
      getGoogleAdsAdvisorHelperText({
        status: buildStatus(),
        ctaState: "open",
        advisorIsStale: false,
        lastAnalyzedLabel: null,
      })
    ).toBe(
      "Uses a multi-window decision snapshot backed by recent 84-day support. The date picker only changes contextual dashboard views."
    );

    expect(
      getGoogleAdsAdvisorHelperText({
        status: buildStatus(),
        ctaState: "open",
        advisorIsStale: false,
        lastAnalyzedLabel: "2 hours ago",
      })
    ).toBe("Decision snapshot updated 2 hours ago");
  });

  it("surfaces status loading and error states explicitly", () => {
    expect(
      getGoogleAdsAdvisorHelperText({
        status: undefined,
        ctaState: "blocked",
        advisorIsStale: false,
        lastAnalyzedLabel: null,
      })
    ).toBe("Analysis readiness is still being checked.");

    expect(
      getGoogleAdsAdvisorHelperText({
        status: undefined,
        ctaState: "blocked",
        advisorIsStale: false,
        lastAnalyzedLabel: null,
        isStatusError: true,
      })
    ).toBe("Analysis status could not be loaded. Retry the sync status check.");

    expect(
      getGoogleAdsAdvisorIdleState(
        buildStatus({
          operations: buildOperations({
            statusDegraded: true,
            statusDegradedReason: "Analysis status is degraded: queue_health timed out.",
          }),
        })
      )
    ).toEqual({
      title: "Analysis status is degraded",
      description: "Analysis status is degraded: queue_health timed out.",
    });
  });

  it("keeps full-sync blocker copy user-facing", () => {
    expect(
      getGoogleAdsAdvisorIdleState(
        buildStatus({
          operations: buildOperations({
            fullSyncPriorityRequired: true,
            fullSyncPriorityReason:
              "Advisor blocked by missing extended historical support; prioritizing full sync.",
          }),
        })
      )
    ).toEqual({
      title: "Deeper analysis is still syncing",
      description:
        "Core campaign reporting is live. Campaign, search term, and product history are still syncing for the 84-day decision snapshot.",
    });
  });

  it("describes ready state as a decision snapshot instead of a single-window analysis", () => {
    expect(
      getGoogleAdsAdvisorIdleState(
        buildStatus({
          state: "ready",
          advisor: {
            ready: true,
            requiredSurfaces: [],
            availableSurfaces: [],
            missingSurfaces: [],
            readyRangeStart: null,
            readyRangeEnd: null,
          },
        })
      )
    ).toEqual({
      title: "Growth analysis is ready",
      description: "The multi-window decision snapshot is ready.",
    });
  });

  it("keeps advisor input readiness separate from snapshot availability", () => {
    expect(
      getGoogleAdsAdvisorIdleState(
        buildStatus({
          state: "ready",
          advisor: {
            ready: true,
            snapshotReady: false,
            requiredSurfaces: [],
            availableSurfaces: [],
            missingSurfaces: [],
            readyRangeStart: "2026-01-09",
            readyRangeEnd: "2026-04-08",
          },
          operations: buildOperations({
            advisorSnapshotReady: false,
          }),
        })
      )
    ).toEqual({
      title: "Decision snapshot can be prepared",
      description:
        "Campaign, search term, and product history are ready for the 84-day decision snapshot. Generate it when you want to review it.",
    });
  });

  it("allows opening analysis once required inputs are ready even if the snapshot is still missing", () => {
    expect(
      canOpenGoogleAdsAdvisor({
        connected: true,
        assignedAccountCount: 1,
        advisorSnapshotReady: false,
        advisorSnapshotBlockedReason: "snapshot_missing",
        fullSyncPriorityRequired: false,
        advisorMissingSurfaces: [],
      })
    ).toBe(true);
  });

  it("keeps analysis blocked when required sync inputs are still missing", () => {
    expect(
      canOpenGoogleAdsAdvisor({
        connected: true,
        assignedAccountCount: 1,
        advisorSnapshotReady: false,
        advisorSnapshotBlockedReason: "recent84_incomplete",
        fullSyncPriorityRequired: true,
        advisorMissingSurfaces: ["search_term_daily"],
      })
    ).toBe(false);
  });
});
