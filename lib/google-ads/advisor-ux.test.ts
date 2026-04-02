import { describe, expect, it } from "vitest";
import {
  canOpenGoogleAdsAdvisor,
  getGoogleAdsAdvisorButtonLabel,
  getGoogleAdsAdvisorCtaState,
  getGoogleAdsAdvisorHelperText,
  getGoogleAdsAdvisorIdleState,
} from "@/lib/google-ads/advisor-ux";
import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";

function buildStatus(
  overrides: Partial<GoogleAdsStatusResponse> = {}
): GoogleAdsStatusResponse {
  return {
    state: "advisor_not_ready",
    connected: true,
    assignedAccountIds: ["acct_1"],
    operations: {},
    ...overrides,
  };
}

describe("google ads advisor ux helpers", () => {
  it("maps CTA states to user-facing labels", () => {
    expect(
      getGoogleAdsAdvisorButtonLabel({
        isLoading: false,
        ctaState: "ready",
      })
    ).toBe("View Growth Analysis");

    expect(
      getGoogleAdsAdvisorButtonLabel({
        isLoading: false,
        ctaState: "refreshable",
      })
    ).toBe("Refresh Analysis");

    expect(
      getGoogleAdsAdvisorButtonLabel({
        isLoading: false,
        ctaState: "blocked",
      })
    ).toBe("Analysis Preparing");
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
      })
    ).toBe("ready");

    expect(
      getGoogleAdsAdvisorCtaState({
        status: buildStatus(),
        canOpen: true,
        hasCurrentAnalysis: true,
      })
    ).toBe("refreshable");
  });

  it("maps blocker reasons to product copy", () => {
    expect(
      getGoogleAdsAdvisorHelperText({
        status: buildStatus({
          operations: { advisorSnapshotBlockedReason: "recent90_incomplete" },
        }),
        ctaState: "blocked",
        advisorIsStale: false,
        lastAnalyzedLabel: null,
      })
    ).toBe(
      "Search term and product history are still being prepared. Analysis will unlock automatically."
    );

    expect(
      getGoogleAdsAdvisorHelperText({
        status: buildStatus({
          operations: {
            advisorSnapshotBlockedReason: "recent_required_dead_letter_partitions",
          },
        }),
        ctaState: "blocked",
        advisorIsStale: false,
        lastAnalyzedLabel: null,
      })
    ).toBe("Some analysis inputs need recovery before insights can open.");
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
          operations: {
            statusDegraded: true,
            statusDegradedReason: "Analysis status is degraded: queue_health timed out.",
          },
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
          operations: {
            fullSyncPriorityRequired: true,
            fullSyncPriorityReason:
              "Advisor blocked by missing extended historical support; prioritizing full sync.",
          },
        })
      )
    ).toEqual({
      title: "Deeper analysis is still syncing",
      description:
        "Core campaign reporting is live. Search term and product history are still being prepared for analysis.",
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
        advisorSnapshotBlockedReason: "recent90_incomplete",
        fullSyncPriorityRequired: true,
        advisorMissingSurfaces: ["search_term_daily"],
      })
    ).toBe(false);
  });
});
