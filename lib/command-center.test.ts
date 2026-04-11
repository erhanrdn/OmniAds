import { describe, expect, it } from "vitest";
import {
  aggregateCommandCenterActions,
  canTransitionCommandCenterStatus,
  filterCommandCenterActionsByView,
  resolveNextCommandCenterStatus,
  sanitizeCommandCenterSavedViewDefinition,
} from "@/lib/command-center";
import type { CreativeDecisionOsV1Response } from "@/lib/creative-decision-os";
import type { MetaDecisionOsV1Response } from "@/lib/meta/decision-os";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";

function decisionMetadata() {
  return buildOperatorDecisionMetadata({
    analyticsStartDate: "2026-04-01",
    analyticsEndDate: "2026-04-10",
    decisionAsOf: "2026-04-10",
  });
}

function metaFixture(): MetaDecisionOsV1Response {
  const metadata = decisionMetadata();
  return {
    contractVersion: "meta-decision-os.v1",
    generatedAt: "2026-04-10T00:00:00.000Z",
    businessId: "biz",
    startDate: "2026-04-01",
    endDate: "2026-04-10",
    analyticsWindow: metadata.analyticsWindow,
    decisionWindows: metadata.decisionWindows,
    historicalMemory: metadata.historicalMemory,
    decisionAsOf: metadata.decisionAsOf,
    summary: {
      todayPlanHeadline: "Today plan",
      todayPlan: ["Shift budget", "Review geo"],
      budgetShiftSummary: "1 shift",
      noTouchSummary: "1 no touch",
      operatingMode: {
        currentMode: "Stabilize",
        recommendedMode: "Exploit",
        confidence: 0.84,
      },
      confidence: 0.82,
    },
    campaigns: [],
    adSets: [
      {
        decisionId: "adset:1",
        adSetId: "adset_1",
        adSetName: "Prospecting A",
        campaignId: "cmp_1",
        campaignName: "Promo Spring",
        actionType: "scale_budget",
        actionSize: "medium",
        priority: "high",
        confidence: 0.9,
        reasons: ["ROAS is beating target."],
        guardrails: ["Scale in controlled steps."],
        relatedCreativeNeeds: [],
        relatedGeoContext: [],
        supportingMetrics: {
          spend: 500,
          revenue: 1800,
          roas: 3.6,
          cpa: 20,
          ctr: 1.8,
          purchases: 25,
          impressions: 10000,
          clicks: 180,
          bidStrategyLabel: null,
          optimizationGoal: "PURCHASE",
          dailyBudget: 200,
          lifetimeBudget: null,
        },
        whatWouldChangeThisDecision: [],
        noTouch: false,
      },
    ],
    budgetShifts: [
      {
        fromCampaignId: "cmp_2",
        fromCampaignName: "Validation",
        toCampaignId: "cmp_1",
        toCampaignName: "Promo Spring",
        from: "Validation",
        to: "Promo Spring",
        whyNow: "Scale demand is clean.",
        riskLevel: "medium",
        expectedBenefit: "Move budget to stronger lane.",
        suggestedMoveBand: "$250-$400",
        confidence: 0.77,
        guardrails: ["Keep donor alive."],
      },
    ],
    geoDecisions: [
      {
        geoKey: "geo:us",
        countryCode: "US",
        label: "United States",
        action: "scale",
        confidence: 0.76,
        why: "US is outperforming.",
        evidence: [{ label: "ROAS", value: "3.2x", impact: "positive" }],
        guardrails: ["Do not cut CA yet."],
        whatWouldChangeThisDecision: [],
      },
    ],
    placementAnomalies: [],
    noTouchList: [
      {
        entityType: "campaign",
        entityId: "cmp_3",
        label: "Retargeting",
        reason: "Do not disturb until checkout issue is resolved.",
        confidence: 0.71,
        guardrails: ["Keep budgets stable."],
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
  };
}

function creativeFixture(): CreativeDecisionOsV1Response {
  const metadata = decisionMetadata();
  return {
    contractVersion: "creative-decision-os.v1",
    engineVersion: "2026-04-10-phase-04-v1",
    generatedAt: "2026-04-10T00:00:00.000Z",
    businessId: "biz",
    startDate: "2026-04-01",
    endDate: "2026-04-10",
    analyticsWindow: metadata.analyticsWindow,
    decisionWindows: metadata.decisionWindows,
    historicalMemory: metadata.historicalMemory,
    decisionAsOf: metadata.decisionAsOf,
    summary: {
      totalCreatives: 2,
      scaleReadyCount: 1,
      keepTestingCount: 0,
      fatiguedCount: 0,
      blockedCount: 0,
      comebackCount: 0,
      message:
        "Decision OS highlights which creatives to scale, keep in test, refresh, block, or retest.",
      operatingMode: "Exploit",
    },
    creatives: [
      {
        creativeId: "creative_1",
        familyId: "family_1",
        familyLabel: "Promo UGC",
        familySource: "copy_signature",
        name: "Promo Hook A",
        creativeFormat: "video",
        creativeAgeDays: 14,
        spend: 300,
        purchaseValue: 960,
        roas: 3.2,
        cpa: 24,
        ctr: 1.9,
        purchases: 12,
        impressions: 9000,
        linkClicks: 140,
        score: 88,
        confidence: 0.83,
        lifecycleState: "scale_ready",
        primaryAction: "promote_to_scaling",
        legacyAction: "scale",
        legacyLifecycleState: "emerging_winner",
        decisionSignals: ["Benchmark beat on ROAS."],
        summary: "Promote this concept into scaling.",
        benchmark: {
          selectedCohort: "family",
          selectedCohortLabel: "Family",
          sampleSize: 8,
          fallbackChain: ["family"],
          missingContext: [],
          metrics: {
            roas: { current: 3.2, benchmark: 2.2, deltaPct: 0.45, status: "better" },
            cpa: { current: 24, benchmark: 30, deltaPct: -0.2, status: "better" },
            ctr: { current: 1.9, benchmark: 1.2, deltaPct: 0.58, status: "better" },
            clickToPurchase: { current: 0.08, benchmark: 0.05, deltaPct: 0.6, status: "better" },
            attention: {
              label: "Hook rate",
              current: 0.31,
              benchmark: 0.24,
              deltaPct: 0.29,
              status: "better",
            },
          },
        },
        fatigue: {
          status: "none",
          confidence: 0.74,
          ctrDecay: 0.02,
          clickToPurchaseDecay: 0.01,
          roasDecay: 0.03,
          spendConcentration: 0.2,
          frequencyPressure: 1.3,
          winnerMemory: false,
          evidence: [],
          missingContext: [],
        },
        deployment: {
          metaFamily: "purchase_value",
          metaFamilyLabel: "purchase/value",
          targetLane: "Scaling",
          targetAdSetRole: "scaling_hero",
          preferredCampaignIds: ["cmp_1"],
          preferredCampaignNames: ["Promo Spring"],
          preferredAdSetIds: ["adset_1"],
          preferredAdSetNames: ["Prospecting A"],
          geoContext: "scale",
          constraints: ["Keep promo spend monitored."],
          whatWouldChangeThisDecision: [],
        },
        pattern: {
          hook: "Promo hook",
          angle: "offer",
          format: "video",
        },
        report: {
          creativeId: "creative_1",
          creativeName: "Promo Hook A",
          action: "scale",
          score: 88,
          confidence: 0.83,
          summary: "Promote this concept into scaling.",
          accountContext: {
            roasAvg: 2,
            cpaAvg: 30,
            ctrAvg: 1.2,
            spendMedian: 100,
            spendP20: 40,
            spendP80: 220,
          },
          factors: [],
          deterministicDecision: {
            lifecycleState: "scale_ready",
            primaryAction: "promote_to_scaling",
            legacyAction: "scale",
          },
        },
      },
      {
        creativeId: "creative_2",
        familyId: "family_2",
        familyLabel: "Holdout",
        familySource: "singleton",
        name: "Holdout Creative",
        creativeFormat: "image",
        creativeAgeDays: 4,
        spend: 60,
        purchaseValue: 90,
        roas: 1.5,
        cpa: 35,
        ctr: 1.1,
        purchases: 2,
        impressions: 2000,
        linkClicks: 24,
        score: 55,
        confidence: 0.65,
        lifecycleState: "validating",
        primaryAction: "hold_no_touch",
        legacyAction: "watch",
        legacyLifecycleState: "volatile",
        decisionSignals: ["Needs more clean learning."],
        summary: "Keep this out of the primary queue.",
        benchmark: {
          selectedCohort: "account",
          selectedCohortLabel: "Account",
          sampleSize: 12,
          fallbackChain: ["account"],
          missingContext: [],
          metrics: {
            roas: { current: 1.5, benchmark: 2.1, deltaPct: -0.28, status: "worse" },
            cpa: { current: 35, benchmark: 30, deltaPct: 0.17, status: "worse" },
            ctr: { current: 1.1, benchmark: 1.2, deltaPct: -0.08, status: "near" },
            clickToPurchase: { current: 0.03, benchmark: 0.04, deltaPct: -0.25, status: "worse" },
            attention: {
              label: "Hook rate",
              current: 0.22,
              benchmark: 0.24,
              deltaPct: -0.08,
              status: "near",
            },
          },
        },
        fatigue: {
          status: "unknown",
          confidence: 0.4,
          ctrDecay: null,
          clickToPurchaseDecay: null,
          roasDecay: null,
          spendConcentration: null,
          frequencyPressure: null,
          winnerMemory: false,
          evidence: [],
          missingContext: [],
        },
        deployment: {
          metaFamily: "purchase_value",
          metaFamilyLabel: "purchase/value",
          targetLane: null,
          targetAdSetRole: null,
          preferredCampaignIds: [],
          preferredCampaignNames: [],
          preferredAdSetIds: [],
          preferredAdSetNames: [],
          geoContext: "none",
          constraints: [],
          whatWouldChangeThisDecision: [],
        },
        pattern: {
          hook: "Hold",
          angle: "neutral",
          format: "image",
        },
        report: {
          creativeId: "creative_2",
          creativeName: "Holdout Creative",
          action: "watch",
          score: 55,
          confidence: 0.65,
          summary: "Keep this out of the primary queue.",
          accountContext: {
            roasAvg: 2,
            cpaAvg: 30,
            ctrAvg: 1.2,
            spendMedian: 100,
            spendP20: 40,
            spendP80: 220,
          },
          factors: [],
          deterministicDecision: {
            lifecycleState: "validating",
            primaryAction: "hold_no_touch",
            legacyAction: "watch",
          },
        },
      },
    ],
    families: [],
    patterns: [],
    lifecycleBoard: [],
    operatorQueues: [],
    commercialTruthCoverage: {
      operatingMode: "Exploit",
      confidence: 0.82,
      missingInputs: [],
      activeInputs: [],
      guardrails: [],
      configuredSections: {
        targetPack: true,
        countryEconomics: false,
        promoCalendar: false,
        operatingConstraints: true,
      },
    },
  };
}

describe("command center domain", () => {
  it("keeps action fingerprints stable across date ranges", () => {
    const rangeA = aggregateCommandCenterActions({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      metaDecisionOs: metaFixture(),
      creativeDecisionOs: creativeFixture(),
    });
    const rangeB = aggregateCommandCenterActions({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      metaDecisionOs: metaFixture(),
      creativeDecisionOs: creativeFixture(),
    });

    expect(rangeA[0]?.actionFingerprint).toBe(rangeB[0]?.actionFingerprint);
  });

  it("keeps source decisions stable across analytics ranges", () => {
    const april = aggregateCommandCenterActions({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      metaDecisionOs: metaFixture(),
      creativeDecisionOs: creativeFixture(),
    });
    const marchMeta = metaFixture();
    marchMeta.startDate = "2026-03-01";
    marchMeta.endDate = "2026-03-31";
    marchMeta.analyticsWindow = {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      role: "analysis_only",
    };
    const marchCreative = creativeFixture();
    marchCreative.startDate = "2026-03-01";
    marchCreative.endDate = "2026-03-31";
    marchCreative.analyticsWindow = {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      role: "analysis_only",
    };
    const march = aggregateCommandCenterActions({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      metaDecisionOs: marchMeta,
      creativeDecisionOs: marchCreative,
    });

    expect(
      april.map((action) => ({
        fingerprint: action.actionFingerprint,
        title: action.title,
        recommendedAction: action.recommendedAction,
      })),
    ).toEqual(
      march.map((action) => ({
        fingerprint: action.actionFingerprint,
        title: action.title,
        recommendedAction: action.recommendedAction,
      })),
    );
  });

  it("marks no-touch surfaces as watchlist-only and keeps them out of primary views", () => {
    const actions = aggregateCommandCenterActions({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      metaDecisionOs: metaFixture(),
      creativeDecisionOs: creativeFixture(),
    });

    const watchlist = filterCommandCenterActionsByView(actions, {
      watchlistOnly: true,
    });

    expect(
      watchlist.some((action) => action.sourceType === "meta_no_touch_item"),
    ).toBe(true);
    expect(
      watchlist.some(
        (action) =>
          action.sourceType === "creative_primary_decision" &&
          action.recommendedAction === "hold_no_touch",
      ),
    ).toBe(true);
  });

  it("enforces workflow transition guards", () => {
    expect(canTransitionCommandCenterStatus("pending", "approved")).toBe(true);
    expect(canTransitionCommandCenterStatus("approved", "completed_manual")).toBe(true);
    expect(canTransitionCommandCenterStatus("approved", "rejected")).toBe(false);
    expect(
      resolveNextCommandCenterStatus({
        currentStatus: "pending",
        mutation: "approve",
      }),
    ).toBe("approved");
    expect(
      resolveNextCommandCenterStatus({
        currentStatus: "rejected",
        mutation: "reopen",
      }),
    ).toBe("pending");
  });

  it("sanitizes saved-view definitions to typed allowlists", () => {
    expect(
      sanitizeCommandCenterSavedViewDefinition({
        sourceTypes: ["meta_budget_shift", "invalid"],
        statuses: ["pending", "wat"],
        tags: ["budget_shifts"],
        watchlistOnly: true,
      }),
    ).toEqual({
      sourceTypes: ["meta_budget_shift"],
      statuses: ["pending"],
      tags: ["budget_shifts"],
      watchlistOnly: true,
    });
  });
});
