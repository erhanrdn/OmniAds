import { describe, expect, it } from "vitest";
import { buildMetaDecisionOs } from "@/lib/meta/decision-os";
import { createEmptyBusinessCommercialTruthSnapshot } from "@/src/types/business-commercial";

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmp_1",
    accountId: "act_1",
    name: "Prospecting Scale Campaign",
    status: "ACTIVE",
    objective: "Sales",
    spend: 1200,
    purchases: 42,
    revenue: 4200,
    roas: 3.5,
    cpa: 28.57,
    ctr: 1.8,
    cpm: 12,
    cpc: 1,
    cpp: 0,
    impressions: 100000,
    reach: 80000,
    frequency: 1.2,
    clicks: 1800,
    uniqueClicks: 1700,
    uniqueCtr: 1.7,
    inlineLinkClickCtr: 1.6,
    outboundClicks: 1400,
    outboundCtr: 1.4,
    uniqueOutboundClicks: 1300,
    uniqueOutboundCtr: 1.3,
    landingPageViews: 1100,
    costPerLandingPageView: 1,
    addToCart: 120,
    addToCartValue: 1500,
    costPerAddToCart: 10,
    initiateCheckout: 80,
    initiateCheckoutValue: 1000,
    costPerCheckoutInitiated: 15,
    leads: 0,
    leadsValue: 0,
    costPerLead: 0,
    registrationsCompleted: 0,
    registrationsCompletedValue: 0,
    costPerRegistrationCompleted: 0,
    searches: 0,
    searchesValue: 0,
    costPerSearch: 0,
    addPaymentInfo: 0,
    addPaymentInfoValue: 0,
    costPerAddPaymentInfo: 0,
    pageLikes: 0,
    costPerPageLike: 0,
    postEngagement: 0,
    costPerEngagement: 0,
    postReactions: 0,
    costPerReaction: 0,
    postComments: 0,
    costPerPostComment: 0,
    postShares: 0,
    costPerPostShare: 0,
    messagingConversationsStarted: 0,
    costPerMessagingConversationStarted: 0,
    appInstalls: 0,
    costPerAppInstall: 0,
    contentViews: 0,
    contentViewsValue: 0,
    costPerContentView: 0,
    videoViews3s: 0,
    videoViews15s: 0,
    videoViews25: 0,
    videoViews50: 0,
    videoViews75: 0,
    videoViews95: 0,
    videoViews100: 0,
    costPerVideoView: 0,
    currency: "USD",
    optimizationGoal: "Purchase",
    bidStrategyType: "cost_cap",
    bidStrategyLabel: "Cost Cap",
    manualBidAmount: null,
    previousManualBidAmount: null,
    bidValue: 2400,
    bidValueFormat: "currency",
    previousBidValue: 2200,
    previousBidValueFormat: "currency",
    previousBidValueCapturedAt: "2026-03-20T00:00:00.000Z",
    dailyBudget: 1200,
    lifetimeBudget: null,
    previousDailyBudget: 900,
    previousLifetimeBudget: null,
    previousBudgetCapturedAt: "2026-03-20T00:00:00.000Z",
    isBudgetMixed: false,
    isConfigMixed: false,
    isOptimizationGoalMixed: false,
    isBidStrategyMixed: false,
    isBidValueMixed: false,
    ...overrides,
  } as any;
}

function adSet(overrides: Record<string, unknown> = {}) {
  return {
    id: "adset_1",
    accountId: "act_1",
    name: "Scale Winner",
    campaignId: "cmp_1",
    status: "ACTIVE",
    dailyBudget: 600,
    lifetimeBudget: null,
    optimizationGoal: "PURCHASE",
    bidStrategyType: "cost_cap",
    bidStrategyLabel: "Cost Cap",
    manualBidAmount: null,
    previousManualBidAmount: null,
    bidValue: 2200,
    bidValueFormat: "currency",
    previousBidValue: 2000,
    previousBidValueFormat: "currency",
    previousBidValueCapturedAt: "2026-03-20T00:00:00.000Z",
    previousDailyBudget: 500,
    previousLifetimeBudget: null,
    previousBudgetCapturedAt: "2026-03-20T00:00:00.000Z",
    isBudgetMixed: false,
    isConfigMixed: false,
    isOptimizationGoalMixed: false,
    isBidStrategyMixed: false,
    isBidValueMixed: false,
    spend: 900,
    purchases: 30,
    revenue: 3600,
    roas: 4,
    cpa: 30,
    ctr: 1.6,
    cpm: 11,
    impressions: 60000,
    clicks: 960,
    inlineLinkClickCtr: 1.45,
    ...overrides,
  } as any;
}

describe("buildMetaDecisionOs", () => {
  it("keeps promo role precedence above retargeting-style naming", () => {
    const snapshot = createEmptyBusinessCommercialTruthSnapshot("biz");
    snapshot.targetPack = {
      targetCpa: 40,
      targetRoas: 2.5,
      breakEvenCpa: 55,
      breakEvenRoas: 1.7,
      contributionMarginAssumption: null,
      aovAssumption: null,
      newCustomerWeight: null,
      defaultRiskPosture: "balanced",
      sourceLabel: "manual",
      updatedAt: null,
      updatedByUserId: null,
    };
    snapshot.promoCalendar = [
      {
        eventId: "promo_1",
        title: "Promo",
        promoType: "sale",
        severity: "high",
        startDate: "2026-04-01",
        endDate: "2026-04-05",
        affectedScope: null,
        notes: null,
        sourceLabel: "manual",
        updatedAt: null,
        updatedByUserId: null,
      },
    ];

    const result = buildMetaDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      decisionAsOf: "2026-04-10",
      campaigns: [campaign({ name: "Promo Retargeting Push" })],
      adSets: [adSet()],
      breakdowns: { location: [], placement: [] },
      commercialTruth: snapshot,
    });

    expect(result.campaigns[0]?.role).toBe("Promo / Clearance");
  });

  it("downgrades aggressive actions to hold when commercial targets are missing", () => {
    const snapshot = createEmptyBusinessCommercialTruthSnapshot("biz");

    const result = buildMetaDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      decisionAsOf: "2026-04-10",
      campaigns: [campaign()],
      adSets: [adSet()],
      breakdowns: { location: [], placement: [] },
      commercialTruth: snapshot,
    });

    expect(result.commercialTruthCoverage.mode).toBe("conservative_fallback");
    expect(result.adSets[0]?.actionType).toBe("hold");
    expect(result.adSets[0]?.trust.truthState).toBe("degraded_missing_truth");
    expect(result.summary.surfaceSummary.degradedCount).toBeGreaterThan(0);
  });

  it("downgrades hard pauses to review-safe actions when commercial truth is missing", () => {
    const snapshot = createEmptyBusinessCommercialTruthSnapshot("biz");

    const result = buildMetaDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      decisionAsOf: "2026-04-10",
      campaigns: [campaign()],
      adSets: [
        adSet({
          spend: 420,
          purchases: 6,
          revenue: 180,
          roas: 0.43,
          cpa: 70,
          ctr: 0.6,
          impressions: 28000,
          clicks: 180,
        }),
      ],
      breakdowns: { location: [], placement: [] },
      commercialTruth: snapshot,
    });

    expect(result.adSets[0]?.actionType).not.toBe("pause");
    expect(result.adSets[0]?.trust.truthState).toBe("degraded_missing_truth");
    expect(result.adSets[0]?.trust.operatorDisposition).not.toBe("standard");
  });

  it("marks stable winners as no-touch when commercial targets are configured", () => {
    const snapshot = createEmptyBusinessCommercialTruthSnapshot("biz");
    snapshot.targetPack = {
      targetCpa: 40,
      targetRoas: 2.5,
      breakEvenCpa: 55,
      breakEvenRoas: 1.7,
      contributionMarginAssumption: null,
      aovAssumption: null,
      newCustomerWeight: null,
      defaultRiskPosture: "balanced",
      sourceLabel: "manual",
      updatedAt: null,
      updatedByUserId: null,
    };
    snapshot.operatingConstraints = {
      siteIssueStatus: "none",
      checkoutIssueStatus: "none",
      conversionTrackingIssueStatus: "none",
      feedIssueStatus: "none",
      stockPressureStatus: "healthy",
      landingPageConcern: "Refresh landing page tomorrow, so keep the winner stable until then.",
      merchandisingConcern: null,
      manualDoNotScaleReason: null,
      sourceLabel: "manual",
      updatedAt: null,
      updatedByUserId: null,
    };

    const result = buildMetaDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      decisionAsOf: "2026-04-10",
      campaigns: [campaign({ name: "Retargeting Winner" })],
      adSets: [adSet({ status: "ACTIVE" })],
      breakdowns: { location: [], placement: [] },
      commercialTruth: snapshot,
    });

    expect(result.campaigns[0]?.primaryAction).toBe("hold");
    expect(result.campaigns[0]?.noTouch).toBe(true);
    expect(result.noTouchList[0]?.entityType).toBe("campaign");
  });

  it("turns blocked geos into cut decisions and flags placement anomalies", () => {
    const snapshot = createEmptyBusinessCommercialTruthSnapshot("biz");
    snapshot.targetPack = {
      targetCpa: 40,
      targetRoas: 2.5,
      breakEvenCpa: 55,
      breakEvenRoas: 1.7,
      contributionMarginAssumption: null,
      aovAssumption: null,
      newCustomerWeight: null,
      defaultRiskPosture: "balanced",
      sourceLabel: "manual",
      updatedAt: null,
      updatedByUserId: null,
    };
    snapshot.countryEconomics = [
      {
        countryCode: "DE",
        economicsMultiplier: null,
        marginModifier: null,
        serviceability: "blocked",
        priorityTier: "tier_3",
        scaleOverride: "deprioritize",
        notes: null,
        sourceLabel: "manual",
        updatedAt: null,
        updatedByUserId: null,
      },
    ];

    const result = buildMetaDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      decisionAsOf: "2026-04-10",
      campaigns: [campaign()],
      adSets: [adSet()],
      breakdowns: {
        location: [
          { key: "DE", label: "DE", spend: 320, revenue: 220, purchases: 4, clicks: 80, impressions: 9000 } as any,
        ],
        placement: [
          { key: "feed", label: "Feed", spend: 700, revenue: 900 } as any,
          { key: "reels", label: "Reels", spend: 180, revenue: 900 } as any,
        ],
      },
      commercialTruth: snapshot,
    });

    expect(result.geoDecisions[0]?.action).toBe("cut");
    expect(result.placementAnomalies[0]?.action).toBe("exception_review");
  });

  it("keeps decisions stable when only the analytics window changes", () => {
    const snapshot = createEmptyBusinessCommercialTruthSnapshot("biz");
    snapshot.targetPack = {
      targetCpa: 40,
      targetRoas: 2.5,
      breakEvenCpa: 55,
      breakEvenRoas: 1.7,
      contributionMarginAssumption: null,
      aovAssumption: null,
      newCustomerWeight: null,
      defaultRiskPosture: "balanced",
      sourceLabel: "manual",
      updatedAt: null,
      updatedByUserId: null,
    };

    const april = buildMetaDecisionOs({
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      decisionAsOf: "2026-04-10",
      campaigns: [campaign()],
      adSets: [adSet()],
      breakdowns: { location: [], placement: [] },
      commercialTruth: snapshot,
    });
    const march = buildMetaDecisionOs({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      decisionAsOf: "2026-04-10",
      campaigns: [campaign()],
      adSets: [adSet()],
      breakdowns: { location: [], placement: [] },
      commercialTruth: snapshot,
    });

    expect(april.adSets[0]?.actionType).toBe(march.adSets[0]?.actionType);
    expect(april.campaigns[0]?.role).toBe(march.campaigns[0]?.role);
    expect(april.decisionWindows.primary30d).toEqual(
      march.decisionWindows.primary30d,
    );
    expect(april.analyticsWindow.startDate).toBe("2026-04-01");
    expect(march.analyticsWindow.startDate).toBe("2026-03-01");
  });
});
