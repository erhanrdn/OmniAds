import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleAdvisorPanel } from "@/components/google/google-advisor-panel";
import type {
  GoogleAdvisorResponse,
  GoogleRecommendation,
} from "@/lib/google-ads/growth-advisor-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => undefined,
    push: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  }),
}));

function buildRecommendation(
  id: string,
  lane: GoogleRecommendation["decision"]["lane"],
  overrides: Partial<GoogleRecommendation> = {}
): GoogleRecommendation {
  const integrityState =
    lane === "suppressed" ? "suppressed" : lane === "watch" ? "downgraded" : "ready";
  return {
    id,
    level: "account",
    type: lane === "suppressed" ? "query_governance" : "brand_leakage",
    strategyLayer: "Search Governance",
    decisionState: lane === "test" ? "test" : lane === "watch" ? "watch" : "act",
    decisionFamily: lane === "suppressed" ? "waste_control" : "brand_governance",
    doBucket: lane === "test" ? "do_next" : lane === "watch" || lane === "suppressed" ? "do_later" : "do_now",
    priority: "high",
    confidence: lane === "watch" ? "medium" : "high",
    dataTrust: "high",
    integrityState,
    supportStrength: "strong",
    actionability: lane === "suppressed" ? "not_ready" : "ready_now",
    reversibility: "high",
    title: `${lane} recommendation`,
    summary: `${lane} summary`,
    why: `${lane} why`,
    decision: {
      decisionFamily: lane === "suppressed" ? "waste_control" : "brand_governance",
      lane,
      riskLevel: lane === "suppressed" ? "high" : "medium",
      blastRadius: lane === "suppressed" ? "account" : "campaign",
      confidence: lane === "watch" ? 0.62 : 0.88,
      windowsUsed: {
        healthWindow: "alarm_7d",
        primaryWindow: "operational_28d",
        queryWindow: "query_governance_56d",
        baselineWindow: "baseline_84d",
        maturityCutoffDays: 84,
      },
      whyNow: `${lane} why now`,
      whyNot: lane === "suppressed" ? ["Unsafe query cleanup is suppressed in V1."] : [],
      blockers: lane === "suppressed" ? ["Unsafe query cleanup is suppressed in V1."] : [],
      validationPlan: ["Check the next review window."],
      rollbackPlan: ["Reverse manually in Google Ads if the plan is executed."],
      evidenceSummary: `${lane} evidence summary`,
      evidencePoints: [{ label: "Evidence", value: `${lane} evidence` }],
    },
    decisionNarrative: {
      whatHappened: `${lane} what happened`,
      whyItHappened: `${lane} why it happened`,
      whatToDo: `${lane} what to do`,
      risk: `${lane} risk`,
      howToValidate: ["Check the next review window."],
      howToRollBack: "Reverse manually in Google Ads if the plan is executed.",
    },
    whyNow: `${lane} why now`,
    reasonCodes: ["reason_code"],
    confidenceExplanation: "Confidence is based on multi-window support.",
    confidenceDegradationReasons: [],
    recommendedAction: `${lane} action`,
    potentialContribution: {
      label: "Control gain",
      impact: "medium",
      summary: `${lane} contribution`,
    },
    impactBand: "medium",
    effortScore: "low",
    rollbackGuidance: "Reverse manually in Google Ads if needed.",
    validationChecklist: ["Check the next review window."],
    blockers: lane === "suppressed" ? ["Unsafe query cleanup is suppressed in V1."] : [],
    rankScore: 10,
    rankExplanation: "Rank rationale",
    impactScore: 5,
    recommendationFingerprint: `fp_${id}`,
    evidence: [{ label: "Evidence", value: `${lane} evidence` }],
    timeframeContext: {
      coreVerdict: "core",
      selectedRangeNote: "selected range note",
      historicalSupport: "history",
    },
    suppressionReasons: lane === "suppressed" ? ["branded_query", "ambiguous_intent"] : [],
    suppressedQueries: lane === "suppressed" ? ["grandmix chairs"] : [],
    negativeQueries: lane === "suppressed" ? [] : undefined,
    negativeKeywordPolicy:
      lane === "suppressed"
        ? {
            requiredMatchType: "exact",
            exactOnlyEnforced: true,
            eligibleQueryCount: 0,
            suppressedQueryCount: 1,
            suppressionReasons: ["branded_query", "ambiguous_intent"],
          }
        : null,
    ...overrides,
  };
}

function buildAdvisor(recommendations: GoogleRecommendation[] = []): GoogleAdvisorResponse {
  return {
    summary: {
      headline: "Stabilize paid search waste first",
      operatorNote: "Multi-window analysis is active.",
      demandMap: "Brand Search 40% spend",
      topPriority: "Review waste-control plan",
      totalRecommendations: recommendations.length,
      actRecommendationCount: recommendations.filter((entry) => entry.decisionState === "act").length,
      accountState: "scaling_ready",
      accountOperatingMode: "Operator-first",
      topConstraint: "Waste in non-brand search",
      topGrowthLever: "Demand capture",
      recommendedFocusToday: "Review search governance",
      watchouts: [],
      dataTrustSummary: "Signal quality is stable.",
      campaignRoles: [],
    },
    recommendations,
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
        healthAlarmWindows: [
          {
            key: "alarm_7d",
            label: "health 7d",
            startDate: "2026-04-02",
            endDate: "2026-04-08",
            days: 7,
            role: "health_alarm",
          },
        ],
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
  it("renders the operator queue grouped by review, test, watch, and suppressed lanes", () => {
    const html = renderToStaticMarkup(
      React.createElement(GoogleAdvisorPanel, {
        advisor: buildAdvisor([
          buildRecommendation("r1", "review"),
          buildRecommendation("r2", "test"),
          buildRecommendation("r3", "watch"),
          buildRecommendation("r4", "suppressed"),
        ]),
      })
    );

    expect(html).toContain("Account Pulse");
    expect(html).toContain("Decision Snapshot");
    expect(html).toContain("Opportunity Queue");
    expect(html).toContain("Review");
    expect(html).toContain("Test");
    expect(html).toContain("Watch");
    expect(html).toContain("Suppressed");
  });

  it("renders operationally complete recommendation fields and manual-plan semantics", () => {
    const html = renderToStaticMarkup(
      React.createElement(GoogleAdvisorPanel, {
        advisor: buildAdvisor([buildRecommendation("r1", "review")]),
      })
    );

    expect(html).toContain("What happened");
    expect(html).toContain("Why it happened");
    expect(html).toContain("What to do");
    expect(html).toContain("Why now");
    expect(html).toContain("Windows used");
    expect(html).toContain("Validation plan");
    expect(html).toContain("Rollback plan");
    expect(html).toContain("Manual plan only");
    expect(html).toContain("Write-back disabled");
  });

  it("renders suppressed recommendations with explicit suppression reasons and contextual selected-range language", () => {
    const html = renderToStaticMarkup(
      React.createElement(GoogleAdvisorPanel, {
        advisor: buildAdvisor([buildRecommendation("r4", "suppressed")]),
      })
    );

    expect(html).toContain("Suppression reasons");
    expect(html).toContain("branded query");
    expect(html).toContain("grandmix chairs");
    expect(html).toContain("selected range is context only");
    expect(html).not.toContain("canonical 90-day");
    expect(html).not.toContain("90-day snapshot");
  });

  it("shows honest empty lane states when no recommendations are present", () => {
    const html = renderToStaticMarkup(
      React.createElement(GoogleAdvisorPanel, {
        advisor: buildAdvisor([]),
      })
    );

    expect(html).toContain("No decisions in this lane right now.");
  });
});
