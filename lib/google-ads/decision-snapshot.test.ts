import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsDecisionSnapshotMetadata,
  normalizeGoogleAdsDecisionSnapshotPayload,
} from "@/lib/google-ads/decision-snapshot";

describe("Google Ads decision snapshot metadata", () => {
  it("builds Decision Snapshot V2 metadata with explicit primary/query/baseline fields", () => {
    const metadata = buildGoogleAdsDecisionSnapshotMetadata({
      analysisMode: "snapshot",
      asOfDate: "2026-04-08",
      selectedWindowKey: "operational_28d",
      historicalSupport: null,
      decisionSummaryTotals: {
        windowKey: "operational_28d",
        windowLabel: "operational 28d",
        spend: 1200,
        revenue: 4200,
        conversions: 35,
        roas: 3.5,
      },
      selectedRangeContext: null,
    });

    expect(metadata).toMatchObject({
      analysisMode: "snapshot",
      asOfDate: "2026-04-08",
      decisionEngineVersion: "v2",
      snapshotModel: "decision_snapshot_v2",
      selectedWindowKey: "operational_28d",
      primaryWindowKey: "operational_28d",
      queryWindowKey: "query_governance_56d",
      baselineWindowKey: "baseline_84d",
      maturityCutoffDays: 84,
      selectedRangeRole: "contextual_only",
      lagAdjustedEndDate: {
        available: false,
        value: null,
      },
      decisionSummaryTotals: {
        windowKey: "operational_28d",
        spend: 1200,
        revenue: 4200,
        conversions: 35,
        roas: 3.5,
      },
      canonicalWindowTotals: {
        spend: 1200,
        revenue: 4200,
        conversions: 35,
        roas: 3.5,
      },
    });
  });

  it("normalizes older payloads into the Decision Snapshot V2 shape", () => {
    const payload = normalizeGoogleAdsDecisionSnapshotPayload({
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
          selectedWindowKey: "operational_28d",
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
          canonicalWindowTotals: {
            spend: 100,
            revenue: 350,
            conversions: 12,
            roas: 3.5,
          },
          selectedRangeContext: null,
        },
      },
      analysisMode: "snapshot",
      asOfDate: "2026-04-08",
      selectedWindowKey: "operational_28d",
      historicalSupport: null,
    });

    expect(payload.metadata).toMatchObject({
      snapshotModel: "decision_snapshot_v2",
      primaryWindowKey: "operational_28d",
      queryWindowKey: "query_governance_56d",
      baselineWindowKey: "baseline_84d",
      selectedRangeRole: "contextual_only",
      decisionSummaryTotals: {
        windowKey: "operational_28d",
        spend: 100,
        revenue: 350,
        conversions: 12,
        roas: 3.5,
      },
    });
  });
});
