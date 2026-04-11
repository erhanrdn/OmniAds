import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";
import {
  MetaCampaignDecisionPanel,
  MetaDecisionOsOverview,
} from "@/components/meta/meta-decision-os";

function payload() {
  const metadata = buildOperatorDecisionMetadata({
    analyticsStartDate: "2026-04-01",
    analyticsEndDate: "2026-04-05",
    decisionAsOf: "2026-04-10",
  });
  return {
    contractVersion: "meta-decision-os.v1",
    generatedAt: "2026-04-10T00:00:00.000Z",
    businessId: "biz",
    startDate: "2026-04-01",
    endDate: "2026-04-05",
    analyticsWindow: metadata.analyticsWindow,
    decisionWindows: metadata.decisionWindows,
    historicalMemory: metadata.historicalMemory,
    decisionAsOf: metadata.decisionAsOf,
    summary: {
      todayPlanHeadline: "Today plan",
      todayPlan: ["Protect winners", "Cut weak GEOs"],
      budgetShiftSummary: "One shift",
      noTouchSummary: "One no-touch",
      operatingMode: { currentMode: "Exploit", recommendedMode: "Exploit", confidence: 0.82 },
      confidence: 0.82,
    },
    campaigns: [
      {
        campaignId: "cmp_1",
        campaignName: "Campaign One",
        status: "ACTIVE",
        role: "Prospecting Scale",
        primaryAction: "scale_budget",
        confidence: 0.84,
        why: "Winning lane",
        evidence: [{ label: "ROAS", value: "3.4x", impact: "positive" }],
        guardrails: ["Scale in steps."],
        noTouch: false,
        whatWouldChangeThisDecision: [],
        adSetDecisionIds: ["decision_1"],
        laneLabel: "Scaling",
      },
    ],
    adSets: [
      {
        decisionId: "decision_1",
        adSetId: "adset_1",
        adSetName: "Scale Winner",
        campaignId: "cmp_1",
        campaignName: "Campaign One",
        actionType: "scale_budget",
        actionSize: "medium",
        priority: "high",
        confidence: 0.82,
        reasons: ["Winning ad set"],
        guardrails: ["Scale in steps."],
        relatedCreativeNeeds: [],
        relatedGeoContext: [],
        supportingMetrics: {
          spend: 900,
          revenue: 3600,
          roas: 4,
          cpa: 30,
          ctr: 1.4,
          purchases: 30,
          impressions: 60000,
          clicks: 950,
          bidStrategyLabel: "Cost Cap",
          optimizationGoal: "PURCHASE",
          dailyBudget: 600,
          lifetimeBudget: null,
        },
        whatWouldChangeThisDecision: [],
        noTouch: false,
      },
    ],
    budgetShifts: [
      {
        fromCampaignId: "cmp_2",
        fromCampaignName: "Campaign Two",
        toCampaignId: "cmp_1",
        toCampaignName: "Campaign One",
        from: "Campaign Two",
        to: "Campaign One",
        whyNow: "Move spend now.",
        riskLevel: "low",
        expectedBenefit: "Higher ROAS",
        suggestedMoveBand: "10-15% of current budget load",
        confidence: 0.78,
        guardrails: [],
      },
    ],
    geoDecisions: [
      {
        geoKey: "US:scale",
        countryCode: "US",
        label: "US",
        action: "scale",
        confidence: 0.84,
        why: "Winner geo",
        evidence: [],
        guardrails: [],
        whatWouldChangeThisDecision: [],
      },
    ],
    placementAnomalies: [
      {
        placementKey: "feed",
        label: "Feed",
        action: "exception_review",
        confidence: 0.7,
        note: "Spend is too concentrated.",
        evidence: [],
        whatWouldChangeThisDecision: [],
      },
    ],
    noTouchList: [
      {
        entityType: "campaign",
        entityId: "cmp_1",
        label: "Campaign One",
        reason: "Protect winner",
        confidence: 0.83,
        guardrails: [],
      },
    ],
    commercialTruthCoverage: {
      mode: "configured_targets",
      targetPackConfigured: true,
      countryEconomicsConfigured: true,
      promoCalendarConfigured: false,
      operatingConstraintsConfigured: true,
      missingInputs: [],
      notes: [],
    },
  } as any;
}

describe("MetaDecisionOsOverview", () => {
  it("renders the structured operator sections", () => {
    const html = renderToStaticMarkup(
      <MetaDecisionOsOverview decisionOs={payload()} isLoading={false} />,
    );

    expect(html).toContain("Today plan");
    expect(html).toContain("Decisions use live windows");
    expect(html).toContain("Budget Shift Board");
    expect(html).toContain("Top Ad Set Actions");
    expect(html).toContain("GEO OS");
    expect(html).toContain("No-Touch List");
  });

  it("renders the selected campaign decision panel", () => {
    const html = renderToStaticMarkup(
      <MetaCampaignDecisionPanel
        campaignDecision={payload().campaigns[0]}
        adSetDecisions={payload().adSets}
      />,
    );

    expect(html).toContain("Campaign Role");
    expect(html).toContain("Prospecting Scale");
    expect(html).toContain("Scale Winner");
  });
});
