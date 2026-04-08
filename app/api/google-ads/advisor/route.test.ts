import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/google-ads/advisor/route";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/google-ads/advisor-snapshots", () => ({
  getOrCreateGoogleAdsAdvisorSnapshot: vi.fn(),
}));

vi.mock("@/lib/google-ads/serving", () => ({
  buildGoogleAdsSelectedRangeContext: vi.fn((input) => ({
    eligible: true,
    state: "aligned",
    label: "Selected range aligned",
    summary: `Selected ${input.selectedRangeStart} to ${input.selectedRangeEnd} is contextual.`,
    selectedRangeStart: input.selectedRangeStart,
    selectedRangeEnd: input.selectedRangeEnd,
    deltaPercent: 0,
    metricKey: "roas",
  })),
  getGoogleAdsAdvisorReport: vi.fn(),
  getGoogleAdsCampaignsReport: vi.fn(),
}));

const access = await import("@/lib/access");
const businessMode = await import("@/lib/business-mode.server");
const snapshots = await import("@/lib/google-ads/advisor-snapshots");
const serving = await import("@/lib/google-ads/serving");

describe("GET /api/google-ads/advisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_ADS_DECISION_ENGINE_V2", "true");
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("returns the V2 decision snapshot metadata shape and keeps selected range contextual", async () => {
    vi.mocked(snapshots.getOrCreateGoogleAdsAdvisorSnapshot).mockResolvedValue({
      advisorPayload: {
        summary: {
          headline: "headline",
          operatorNote: "note",
          demandMap: "map",
          topPriority: "priority",
          totalRecommendations: 0,
          actRecommendationCount: 0,
          accountState: "scaling_ready",
          accountOperatingMode: "mode",
          topConstraint: "constraint",
          topGrowthLever: "lever",
          recommendedFocusToday: "focus",
          watchouts: [],
          dataTrustSummary: "trust",
          campaignRoles: [],
        },
        recommendations: [],
        sections: [],
        clusters: [],
        metadata: {
          analysisMode: "snapshot",
          asOfDate: "2026-04-08",
          decisionEngineVersion: "v2",
          snapshotModel: "decision_snapshot_v2",
          selectedWindowKey: "operational_28d",
          primaryWindowKey: "operational_28d",
          queryWindowKey: "query_governance_56d",
          baselineWindowKey: "baseline_84d",
          maturityCutoffDays: 84,
          lagAdjustedEndDate: {
            available: false,
            value: null,
            note: "Lag-adjusted end date is not yet computed in the current Google Ads serving architecture.",
          },
          selectedRangeRole: "contextual_only",
          analysisWindows: {
            healthAlarmWindows: [],
            operationalWindow: {
              key: "operational_28d",
              label: "operational 28d",
              startDate: "2026-03-12",
              endDate: "2026-04-08",
              days: 28,
              role: "operational_decision",
            },
            queryGovernanceWindow: {
              key: "query_governance_56d",
              label: "query governance 56d",
              startDate: "2026-02-12",
              endDate: "2026-04-08",
              days: 56,
              role: "query_governance",
            },
            baselineWindow: {
              key: "baseline_84d",
              label: "baseline 84d",
              startDate: "2026-01-15",
              endDate: "2026-04-08",
              days: 84,
              role: "baseline",
            },
          },
          executionSurface: {
            mode: "operator_first_manual_plan",
            decisionEngineV2Enabled: true,
            writebackEnabled: false,
            mutateVerified: false,
            rollbackVerified: false,
            capabilityGateReason: "reason",
            summary: "summary",
          },
          historicalSupportAvailable: false,
          historicalSupport: null,
          decisionSummaryTotals: {
            windowKey: "operational_28d",
            windowLabel: "operational 28d",
            spend: 100,
            revenue: 320,
            conversions: 10,
            roas: 3.2,
          },
          canonicalWindowTotals: {
            spend: 100,
            revenue: 320,
            conversions: 10,
            roas: 3.2,
          },
          selectedRangeContext: null,
        },
      },
    } as never);
    vi.mocked(serving.getGoogleAdsCampaignsReport).mockResolvedValue({
      rows: [{ spend: 10, revenue: 32, conversions: 1 }],
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/google-ads/advisor?businessId=biz&dateRange=custom&customStart=2026-04-01&customEnd=2026-04-08"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.metadata).toMatchObject({
      snapshotModel: "decision_snapshot_v2",
      primaryWindowKey: "operational_28d",
      queryWindowKey: "query_governance_56d",
      baselineWindowKey: "baseline_84d",
      maturityCutoffDays: 84,
      selectedRangeRole: "contextual_only",
      decisionSummaryTotals: {
        windowKey: "operational_28d",
      },
      lagAdjustedEndDate: {
        available: false,
        value: null,
      },
    });
    expect(payload.metadata.selectedRangeContext.summary).toContain("contextual");
  });
});
