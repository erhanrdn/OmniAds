import { describe, expect, it } from "vitest";
import {
  attachGoogleAdsAdvisorActionContract,
  buildGoogleAdsOperatorActionCard,
} from "@/lib/google-ads/advisor-action-contract";
import type {
  GoogleAdvisorResponse,
  GoogleRecommendation,
} from "@/lib/google-ads/growth-advisor-types";

function buildRecommendation(overrides: Partial<GoogleRecommendation>): GoogleRecommendation {
  return {
    id: "rec-1",
    level: "account",
    type: "query_governance",
    strategyLayer: "Search Governance",
    decisionState: "act",
    decisionFamily: "waste_control",
    doBucket: "do_now",
    priority: "high",
    confidence: "high",
    dataTrust: "high",
    integrityState: "ready",
    supportStrength: "strong",
    actionability: "ready_now",
    reversibility: "high",
    title: "Recommendation",
    summary: "Summary",
    why: "Why",
    decision: {
      decisionFamily: "waste_control",
      lane: "review",
      riskLevel: "low",
      blastRadius: "campaign",
      confidence: 0.88,
      windowsUsed: {
        healthWindow: "alarm_7d",
        primaryWindow: "operational_28d",
        queryWindow: "query_governance_56d",
        baselineWindow: "baseline_84d",
        maturityCutoffDays: 84,
      },
      whyNow: "Why now",
      whyNot: [],
      blockers: [],
      validationPlan: ["Check the next window."],
      rollbackPlan: ["Reverse manually in Google Ads."],
      evidenceSummary: "Evidence summary",
      evidencePoints: [{ label: "Evidence", value: "1" }],
    },
    decisionNarrative: {
      whatHappened: "What happened",
      whyItHappened: "Why it happened",
      whatToDo: "What to do",
      risk: "Risk",
      howToValidate: ["Check the next window."],
      howToRollBack: "Reverse manually in Google Ads.",
    },
    whyNow: "Why now",
    reasonCodes: ["reason"],
    confidenceExplanation: "Confidence explanation",
    confidenceDegradationReasons: [],
    recommendedAction: "Take the manual action.",
    potentialContribution: {
      label: "Control gain",
      impact: "medium",
      summary: "Improve control without claiming exact uplift.",
    },
    impactBand: "medium",
    effortScore: "low",
    rollbackGuidance: "Reverse manually in Google Ads.",
    validationChecklist: ["Check the next window."],
    blockers: [],
    rankScore: 10,
    rankExplanation: "Rank explanation",
    impactScore: 6,
    recommendationFingerprint: "fp-1",
    evidence: [{ label: "Evidence", value: "1" }],
    timeframeContext: {
      coreVerdict: "Core verdict",
      selectedRangeNote: "Selected note",
      historicalSupport: "Historical note",
    },
    ...overrides,
  };
}

function buildAdvisorResponse(recommendation: GoogleRecommendation): GoogleAdvisorResponse {
  return {
    summary: {
      headline: "Headline",
      operatorNote: "Operator note",
      demandMap: "Demand map",
      topPriority: "Top priority",
      totalRecommendations: 1,
      actRecommendationCount: 1,
      accountState: "scaling_ready",
      accountOperatingMode: "Operator-first",
      topConstraint: "Constraint",
      topGrowthLever: "Growth lever",
      recommendedFocusToday: "Focus",
      watchouts: [],
      dataTrustSummary: "Trust",
      campaignRoles: [],
    },
    recommendations: [recommendation],
    sections: [
      {
        id: "section-1",
        title: recommendation.strategyLayer,
        recommendations: [recommendation],
      },
    ],
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
        note: null,
      },
      selectedRangeRole: "contextual_only",
      analysisWindows: {
        healthAlarmWindows: [],
        operationalWindow: {
          key: "operational_28d",
          label: "Operational 28d",
          startDate: "2026-03-12",
          endDate: "2026-04-08",
          days: 28,
          role: "operational_decision",
        },
        queryGovernanceWindow: {
          key: "query_governance_56d",
          label: "Query governance 56d",
          startDate: "2026-02-12",
          endDate: "2026-04-08",
          days: 56,
          role: "query_governance",
        },
        baselineWindow: {
          key: "baseline_84d",
          label: "Baseline 84d",
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
        capabilityGateReason: "Write-back disabled",
        summary: "Operator-first manual plan surface.",
      },
      historicalSupportAvailable: false,
      historicalSupport: null,
      decisionSummaryTotals: {
        windowKey: "operational_28d",
        windowLabel: "Operational 28d",
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
      selectedRangeContext: null,
    },
  };
}

describe("advisor action contract mapper", () => {
  it("maps query governance into exact negatives plus suppressed queries", () => {
    const card = buildGoogleAdsOperatorActionCard(
      buildRecommendation({
        type: "query_governance",
        negativeQueries: ["refund policy"],
        suppressedQueries: ["brand chairs"],
        suppressionReasons: ["branded_query", "ambiguous_intent"],
        negativeGuardrails: ["brand", "sku"],
        negativeKeywordPolicy: {
          requiredMatchType: "exact",
          exactOnlyEnforced: true,
          eligibleQueryCount: 1,
          suppressedQueryCount: 1,
          suppressionReasons: ["branded_query", "ambiguous_intent"],
        },
        potentialContribution: {
          label: "Waste recovery",
          impact: "medium",
          summary: "Recover waste without widening blast radius.",
          estimatedWasteRecoveryRange: "$20-$40",
        },
      }),
      "native"
    );

    expect(card.exactChangePayload).toMatchObject({
      kind: "negative_keyword_cleanup",
      addNow: ["refund policy"],
      suppressed: ["brand chairs"],
      suppressionReasonLabels: ["Branded query", "Ambiguous intent"],
    });
    expect(card.primaryAction).toBe("Add 1 exact negative keyword now.");
    expect(card.exactChanges[0]).toMatchObject({
      label: "Add exact negatives now",
      kind: "change",
      tone: "primary",
    });
  });

  it("maps keyword buildout into exact, phrase, and broad discovery groups", () => {
    const card = buildGoogleAdsOperatorActionCard(
      buildRecommendation({
        type: "keyword_buildout",
        promoteToExact: ["carry on backpack"],
        promoteToPhrase: ["weekender bag"],
        broadDiscoveryThemes: ["travel backpack"],
        negativeGuardrails: ["cheap"],
      }),
      "native"
    );

    expect(card.exactChangePayload).toMatchObject({
      kind: "keyword_buildout",
      addAsExact: ["carry on backpack"],
      addAsPhrase: ["weekender bag"],
      keepAsBroadTheme: ["travel backpack"],
      negativeGuardrails: ["cheap"],
    });
    expect(card.primaryAction).toContain("1 exact addition");
    expect(card.exactChanges[2]).toMatchObject({
      label: "Keep as broad discovery theme",
      kind: "preview",
    });
  });

  it("maps shopping launch recommendations into a structure payload", () => {
    const card = buildGoogleAdsOperatorActionCard(
      buildRecommendation({
        type: "shopping_launch_or_split",
        strategyLayer: "Shopping & Products",
        launchMode: "hero_sku_shopping",
        heroSkuClusters: ["Hero Backpack"],
        startingSkuClusters: ["Hero Backpack", "Carry-On Pack"],
      }),
      "native"
    );

    expect(card.exactChangePayload).toMatchObject({
      kind: "shopping_structure",
      launchMode: "hero_sku_shopping",
      heroClusters: ["Hero Backpack"],
      startingClusters: ["Hero Backpack", "Carry-On Pack"],
      isolateClusters: ["Hero Backpack", "Carry-On Pack"],
      estimationState: "deterministic",
    });
    expect(card.primaryAction).toContain("hero-SKU Shopping");
  });

  it("maps asset group restructuring into split, keep-separate, and replacement lists", () => {
    const card = buildGoogleAdsOperatorActionCard(
      buildRecommendation({
        type: "asset_group_structure",
        strategyLayer: "Assets & Testing",
        weakAssetGroups: ["Winter Themes"],
        keepSeparateAssetGroups: ["Sale Themes"],
        replaceAssets: ["Image Asset 1"],
        replacementAngles: ["Durability proof"],
      }),
      "native"
    );

    expect(card.exactChangePayload).toMatchObject({
      kind: "asset_group_restructure",
      splitAssetGroups: ["Winter Themes"],
      keepSeparateAssetGroups: ["Sale Themes"],
      replaceAssets: ["Image Asset 1"],
      replacementAngles: ["Durability proof"],
    });
    expect(card.primaryAction).toContain("1 asset group to split");
  });

  it("maps budget reallocation previews into source and destination deltas", () => {
    const card = buildGoogleAdsOperatorActionCard(
      buildRecommendation({
        type: "budget_reallocation",
        strategyLayer: "Budget Moves",
        reallocationBand: "10-15%",
        reallocationPreview: {
          sourceCampaigns: [{ id: "c1", name: "Brand Search", previousAmount: 100, proposedAmount: 90 }],
          destinationCampaigns: [{ id: "c2", name: "Non-Brand Search", previousAmount: 50, proposedAmount: 60 }],
          netDelta: 0,
        },
      }),
      "native"
    );

    expect(card.exactChangePayload).toMatchObject({
      kind: "budget_reallocation",
      budgetBand: "10-15%",
      estimateMode: "bounded_preview",
      sourceCampaigns: [
        {
          id: "c1",
          name: "Brand Search",
          previousAmount: 100,
          proposedAmount: 90,
          deltaAmount: -10,
          deltaPercent: -10,
        },
      ],
      destinationCampaigns: [
        {
          id: "c2",
          name: "Non-Brand Search",
          previousAmount: 50,
          proposedAmount: 60,
          deltaAmount: 10,
          deltaPercent: 20,
        },
      ],
    });
    expect(card.expectedEffect.estimationMode).toBe("not_confidently_estimable");
  });

  it("maps target strategy previews when tROAS or tCPA values are safely previewable", () => {
    const card = buildGoogleAdsOperatorActionCard(
      buildRecommendation({
        type: "pmax_scaling_fit",
        strategyLayer: "PMax Scaling",
        portfolioTargetType: "tROAS",
        portfolioTargetValue: 300,
        portfolioTargetAdjustmentPreview: {
          portfolioBidStrategyResourceName: "portfolio-1",
          portfolioBidStrategyType: "TARGET_ROAS",
          targetType: "tROAS",
          previousValue: 300,
          proposedValue: 270,
          deltaPercent: -10,
          governedCampaigns: [
            { id: "c1", name: "PMax Scale" },
            { id: "c2", name: "PMax Prospecting" },
          ],
          boundedDelta: true,
          attributionWindowDays: 21,
        },
      }),
      "native"
    );

    expect(card.exactChangePayload).toMatchObject({
      kind: "target_strategy_adjustment",
      state: "preview_available",
      previewState: "preview_available",
      previewMode: "portfolio_target",
      currentTargetType: "tROAS",
      currentTargetValue: 300,
      proposedTargetValue: 270,
      deltaPercent: -10,
      boundedDelta: true,
      validationWindowDays: 21,
    });
    expect(card.primaryAction).toContain("Change tROAS from 300 to 270");
  });

  it("marks target strategy recommendations as blocked when preview is not safely available", () => {
    const card = buildGoogleAdsOperatorActionCard(
      buildRecommendation({
        type: "pmax_scaling_fit",
        strategyLayer: "PMax Scaling",
        portfolioTargetType: "tCPA",
        portfolioTargetValue: 45,
        mutateEligibilityReason:
          "portfolio_target_blocked: the target surface is not yet eligible for a safe native preview.",
      }),
      "native"
    );

    expect(card.exactChangePayload).toMatchObject({
      kind: "target_strategy_adjustment",
      state: "blocked",
      previewState: "blocked",
      previewMode: "directional_only",
      currentTargetType: "tCPA",
      currentTargetValue: 45,
      proposedTargetValue: null,
    });
    expect(card.blockedBecause[0]).toContain("portfolio_target_blocked");
  });

  it("keeps non-target recommendations out of the target strategy contract when only portfolio metadata exists", () => {
    const card = buildGoogleAdsOperatorActionCard(
      buildRecommendation({
        type: "budget_reallocation",
        strategyLayer: "Budget Moves",
        portfolioTargetType: "tROAS",
        portfolioTargetValue: 250,
        reallocationBand: "10-15%",
      }),
      "native"
    );

    expect(card.exactChangePayload.kind).toBe("budget_reallocation");
  });

  it("falls back to explicit insufficient evidence when no deterministic change payload exists", () => {
    const card = buildGoogleAdsOperatorActionCard(
      buildRecommendation({
        type: "diagnostic_guardrail",
        strategyLayer: "Diagnostics",
        playbookSteps: [],
        orderedHandoffSteps: [],
        confidenceDegradationReasons: ["support window is too thin"],
      }),
      "native"
    );

    expect(card.primaryAction).toBe("Hold this as a watch item. No deterministic change is specified yet.");
    expect(card.exactChangePayload).toMatchObject({
      kind: "blocked_or_insufficient_evidence",
      state: "insufficient_evidence",
    });
    expect(card.exactChanges[0]).toMatchObject({
      label: "Insufficient evidence",
      tone: "muted",
    });
  });

  it("marks attached cards as compatibility-derived when normalizing legacy payloads", () => {
    const recommendation = buildRecommendation({
      type: "query_governance",
      negativeQueries: ["refund policy"],
    });
    const payload = attachGoogleAdsAdvisorActionContract({
      advisorPayload: buildAdvisorResponse(recommendation),
      source: "compatibility_derived",
    });

    expect(payload.metadata?.actionContract?.version).toBe("google_ads_advisor_action_v2");
    expect(payload.metadata?.actionContract?.source).toBe("compatibility_derived");
    expect(payload.recommendations[0]?.operatorActionCard?.contractSource).toBe("compatibility_derived");
    expect(payload.sections[0]?.recommendations[0]?.operatorActionCard?.contractSource).toBe(
      "compatibility_derived"
    );
  });
});
