import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleAdvisorPanel } from "@/components/google/google-advisor-panel";
import type { GoogleAdvisorResponse } from "@/lib/google-ads/growth-advisor-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => undefined,
    push: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  }),
}));

function buildAdvisor(): GoogleAdvisorResponse {
  return {
    summary: {
      headline: "Stabilize paid search waste first",
      operatorNote: "Multi-window analysis is active.",
      demandMap: "Brand Search 40% spend",
      topPriority: "Review waste-control plan",
      totalRecommendations: 0,
      actRecommendationCount: 0,
      accountState: "scaling_ready",
      accountOperatingMode: "Operator-first",
      topConstraint: "Waste in non-brand search",
      topGrowthLever: "Demand capture",
      recommendedFocusToday: "Review search governance",
      watchouts: [],
      dataTrustSummary: "Signal quality is stable.",
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
        capabilityGateReason: "Write-back is disabled.",
        summary: "Operator-first manual plan surface.",
      },
      historicalSupportAvailable: false,
      historicalSupport: null,
      decisionSummaryTotals: {
        windowKey: "operational_28d",
        windowLabel: "operational 28d",
        spend: 100,
        revenue: 300,
        conversions: 10,
        roas: 3,
      },
      canonicalWindowTotals: {
        spend: 100,
        revenue: 300,
        conversions: 10,
        roas: 3,
      },
      selectedRangeContext: {
        eligible: true,
        state: "aligned",
        label: "Selected range aligned",
        summary: "Selected 7-day view is broadly aligned with the multi-window decision snapshot.",
        selectedRangeStart: "2026-04-02",
        selectedRangeEnd: "2026-04-08",
        deltaPercent: 0,
        metricKey: "roas",
      },
    },
  };
}

describe("GoogleAdvisorPanel", () => {
  it("renders multi-window decision snapshot language without implying a single 90-day brain", () => {
    const html = renderToStaticMarkup(
      React.createElement(GoogleAdvisorPanel, {
        advisor: buildAdvisor(),
        businessId: "biz",
        accountId: "acc_1",
      })
    );

    expect(html).toContain("Multi-Window Analysis");
    expect(html).toContain("selected range is contextual");
    expect(html).not.toContain("canonical 90-day");
    expect(html).not.toContain("90-day snapshot");
  });
});
