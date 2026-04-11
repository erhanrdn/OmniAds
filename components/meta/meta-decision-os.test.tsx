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
      winnerScaleSummary: {
        candidateCount: 1,
        protectedCount: 1,
        headline: "1 active winner scale candidate is ready for controlled growth.",
      },
      operatingMode: { currentMode: "Exploit", recommendedMode: "Exploit", confidence: 0.82 },
      confidence: 0.82,
      surfaceSummary: {
        actionCoreCount: 3,
        watchlistCount: 1,
        archiveCount: 0,
        degradedCount: 1,
      },
      geoSummary: {
        actionCoreCount: 1,
        watchlistCount: 1,
        queuedCount: 1,
        pooledClusterCount: 1,
        sourceFreshness: {
          dataState: "ready",
          lastSyncedAt: "2026-04-10T06:30:00.000Z",
          isPartial: false,
          verificationState: "finalized_verified",
          reason: "Country-only warehouse rows are serving the GEO board.",
        },
        countryEconomics: {
          configured: true,
          updatedAt: "2026-04-09T09:00:00.000Z",
          sourceLabel: "manual",
        },
      },
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
        policy: {
          strategyClass: "scale_budget",
          objectiveFamily: "sales",
          bidRegime: "cost_cap",
          primaryDriver: "roas_outperforming",
          secondaryDrivers: ["signal_density"],
          winnerState: "scale_candidate",
        },
        trust: {
          surfaceLane: "action_core",
          truthState: "live_confident",
          operatorDisposition: "standard",
          reasons: ["Winning lane"],
        },
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
        policy: {
          strategyClass: "scale_budget",
          objectiveFamily: "sales",
          bidRegime: "cost_cap",
          primaryDriver: "roas_outperforming",
          secondaryDrivers: ["signal_density"],
          winnerState: "scale_candidate",
        },
        trust: {
          surfaceLane: "action_core",
          truthState: "live_confident",
          operatorDisposition: "standard",
          reasons: ["Winning ad set"],
        },
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
        queueEligible: true,
        confidence: 0.84,
        why: "Winner geo",
        evidence: [],
        guardrails: [],
        whatWouldChangeThisDecision: [],
        clusterKey: null,
        clusterLabel: null,
        grouped: false,
        groupMemberCount: 1,
        groupMemberLabels: ["US"],
        materiality: {
          thinSignal: false,
          material: true,
          archiveContext: false,
        },
        supportingMetrics: {
          spend: 620,
          revenue: 2108,
          roas: 3.4,
          purchases: 16,
          clicks: 240,
          impressions: 9200,
          spendShare: 0.58,
        },
        freshness: {
          dataState: "ready",
          lastSyncedAt: "2026-04-10T06:30:00.000Z",
          isPartial: false,
          verificationState: "finalized_verified",
          reason: null,
        },
        commercialContext: {
          serviceability: "full",
          priorityTier: "tier_1",
          scaleOverride: "prefer_scale",
          economicsMultiplier: null,
          marginModifier: null,
          countryEconomicsConfigured: true,
          countryEconomicsUpdatedAt: "2026-04-09T09:00:00.000Z",
          countryEconomicsSourceLabel: "manual",
        },
        trust: {
          surfaceLane: "action_core",
          truthState: "live_confident",
          operatorDisposition: "standard",
          reasons: ["Winner geo"],
        },
      },
      {
        geoKey: "DE:pool",
        countryCode: "DE",
        label: "Germany",
        action: "pool",
        queueEligible: false,
        confidence: 0.68,
        why: "Thin-signal GEOs should validate in a pooled cluster.",
        evidence: [],
        guardrails: [],
        whatWouldChangeThisDecision: [],
        clusterKey: "pool:tier_3:full:live_confident",
        clusterLabel: "pool • tier 3 • full",
        grouped: true,
        groupMemberCount: 2,
        groupMemberLabels: ["Germany", "France"],
        materiality: {
          thinSignal: true,
          material: true,
          archiveContext: false,
        },
        supportingMetrics: {
          spend: 180,
          revenue: 324,
          roas: 1.8,
          purchases: 3,
          clicks: 74,
          impressions: 4300,
          spendShare: 0.21,
        },
        freshness: {
          dataState: "ready",
          lastSyncedAt: "2026-04-10T06:30:00.000Z",
          isPartial: false,
          verificationState: "finalized_verified",
          reason: "Country-only warehouse rows are serving the GEO board.",
        },
        commercialContext: {
          serviceability: "full",
          priorityTier: "tier_3",
          scaleOverride: "default",
          economicsMultiplier: null,
          marginModifier: null,
          countryEconomicsConfigured: true,
          countryEconomicsUpdatedAt: "2026-04-09T09:00:00.000Z",
          countryEconomicsSourceLabel: "manual",
        },
        trust: {
          surfaceLane: "watchlist",
          truthState: "live_confident",
          operatorDisposition: "monitor_low_truth",
          reasons: ["Thin-signal GEOs should validate in a pooled cluster."],
        },
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
    winnerScaleCandidates: [
      {
        candidateId: "cmp_1:adset_1",
        campaignId: "cmp_1",
        campaignName: "Campaign One",
        adSetId: "adset_1",
        adSetName: "Scale Winner",
        confidence: 0.87,
        why: "This ad set is beating target with strong clean signal and still has room for controlled scale.",
        suggestedMoveBand: "10-15% of current budget load",
        evidence: [],
        guardrails: ["Scale in steps."],
        supportingMetrics: {
          spend: 900,
          revenue: 3600,
          roas: 4,
          cpa: 30,
          ctr: 1.4,
          purchases: 30,
          dailyBudget: 600,
          bidStrategyLabel: "Cost Cap",
          optimizationGoal: "PURCHASE",
        },
        policy: {
          strategyClass: "scale_budget",
          objectiveFamily: "sales",
          bidRegime: "cost_cap",
          primaryDriver: "roas_outperforming",
          secondaryDrivers: ["signal_density"],
          winnerState: "scale_candidate",
        },
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
    expect(html).toContain("Winner Scale Candidates");
    expect(html).toContain("winner scale candidate");
    expect(html).toContain("Top Ad Set Actions");
    expect(html).toContain("GEO OS");
    expect(html).toContain("Action Core GEOs");
    expect(html).toContain("Watchlist / Pooled Validation");
    expect(html).toContain("Country-only warehouse rows are serving the GEO board.");
    expect(html).toContain("Members Germany, France");
    expect(html).toContain("No-Touch List");
    expect(html).toContain("Commercial truth is incomplete");
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
    expect(html).toContain("strategy scale budget");
  });
});
