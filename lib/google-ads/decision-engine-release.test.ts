import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleAdvisorPanel } from "@/components/google/google-advisor-panel";
import { decorateAdvisorRecommendationsForExecution } from "@/lib/google-ads/advisor-handoff";
import { buildGoogleAdsDecisionSnapshotMetadata } from "@/lib/google-ads/decision-snapshot";
import { buildGoogleGrowthAdvisor } from "@/lib/google-ads/growth-advisor";
import type {
  AssetGroupPerformanceRow,
  AssetPerformanceRow,
  CampaignPerformanceRow,
  DevicePerformanceRow,
  GeoPerformanceRow,
  ProductPerformanceRow,
  SearchTermPerformanceRow,
} from "@/lib/google-ads/intelligence-model";
import { buildGoogleAdsSelectedRangeContext } from "@/lib/google-ads/serving";

function campaign(overrides: Partial<CampaignPerformanceRow> = {}): CampaignPerformanceRow {
  return {
    campaignId: "c-1",
    campaignName: "Brand Search",
    status: "ENABLED",
    channel: "SEARCH",
    servingStatus: "SERVING",
    dailyBudget: 100,
    campaignBudgetResourceName: "customers/1234567890/campaignBudgets/9001",
    budgetDeliveryMethod: "STANDARD",
    budgetExplicitlyShared: false,
    portfolioBidStrategyType: null,
    portfolioBidStrategyResourceName: null,
    portfolioBidStrategyStatus: null,
    portfolioTargetType: null,
    portfolioTargetValue: null,
    impressionShare: 0.5,
    lostIsBudget: 0.1,
    lostIsRank: 0.1,
    searchTopImpressionShare: 0.3,
    searchAbsoluteTopImpressionShare: 0.1,
    topImpressionPercentage: 0.3,
    absoluteTopImpressionPercentage: 0.1,
    spendShare: 10,
    revenueShare: 10,
    roasDeltaVsAccount: 0,
    scaleState: "monitor",
    wasteState: "healthy",
    impressions: 1000,
    clicks: 100,
    spend: 100,
    revenue: 400,
    conversions: 10,
    ctr: 10,
    cpa: 10,
    roas: 4,
    ...overrides,
  };
}

function searchTerm(overrides: Partial<SearchTermPerformanceRow> = {}): SearchTermPerformanceRow {
  return {
    searchTerm: "carry on backpack for travel",
    campaignId: "c-2",
    campaignName: "Travel Gear Performance Max",
    adGroupId: null,
    adGroupName: "Campaign scope",
    intentClass: "transactional",
    wasteFlag: false,
    keywordOpportunityFlag: true,
    negativeKeywordFlag: false,
    clusterId: "carry-backpack-travel",
    impressions: 1000,
    clicks: 100,
    spend: 120,
    revenue: 520,
    conversions: 4,
    ctr: 10,
    cpa: 30,
    roas: 4.33,
    ...overrides,
  };
}

function product(overrides: Partial<ProductPerformanceRow> = {}): ProductPerformanceRow {
  return {
    productItemId: "sku-1",
    productTitle: "UrbanTrail Carry-On Backpack",
    merchantCenterId: null,
    feedPrice: 89,
    campaignIds: ["c-2"],
    campaignNames: ["Travel Gear Performance Max"],
    spendShare: 20,
    revenueShare: 30,
    contributionProxy: 500,
    scaleState: "scale",
    underperformingState: "healthy",
    hiddenWinnerState: "visible",
    impressions: 1000,
    clicks: 80,
    spend: 100,
    revenue: 400,
    conversions: 5,
    ctr: 8,
    cpa: 20,
    roas: 4,
    ...overrides,
  };
}

function asset(overrides: Partial<AssetPerformanceRow> = {}): AssetPerformanceRow {
  return {
    assetId: "a-1",
    assetType: "TEXT",
    assetText: "Carry-on headline",
    assetName: "Carry-on headline",
    imageUrl: null,
    campaignId: "c-2",
    campaignName: "Travel Gear Performance Max",
    assetGroupId: "ag-1",
    assetGroupName: "Travel Gear Prospecting",
    assetState: "top",
    spendShareWithinGroup: 20,
    revenueShareWithinGroup: 20,
    wasteFlag: false,
    expandFlag: true,
    impressions: 1000,
    clicks: 80,
    spend: 100,
    revenue: 400,
    conversions: 5,
    ctr: 8,
    cpa: 20,
    roas: 4,
    ...overrides,
  };
}

function assetGroup(overrides: Partial<AssetGroupPerformanceRow> = {}): AssetGroupPerformanceRow {
  return {
    assetGroupId: "ag-1",
    assetGroupName: "Travel Gear Prospecting",
    campaignId: "c-2",
    campaignName: "Travel Gear Performance Max",
    status: "ENABLED",
    adStrength: "GOOD",
    finalUrls: [],
    assetCountByType: {},
    missingAssetTypes: [],
    audienceSignals: [],
    searchThemesConfigured: ["carry on travel backpack"],
    spendShare: 20,
    revenueShare: 30,
    scaleState: "scale",
    weakState: "healthy",
    coverageRisk: false,
    messagingAlignmentScore: 0.8,
    impressions: 1000,
    clicks: 80,
    spend: 100,
    revenue: 400,
    conversions: 5,
    ctr: 8,
    cpa: 20,
    roas: 4,
    ...overrides,
  };
}

function geo(overrides: Partial<GeoPerformanceRow> = {}): GeoPerformanceRow {
  return {
    geoId: 1,
    geoName: "California",
    geoState: "scale",
    scaleFlag: true,
    reduceFlag: false,
    impressions: 1000,
    clicks: 100,
    spend: 100,
    revenue: 400,
    conversions: 10,
    ctr: 10,
    cpa: 10,
    roas: 4,
    ...overrides,
  };
}

function device(overrides: Partial<DevicePerformanceRow> = {}): DevicePerformanceRow {
  return {
    device: "Desktop",
    deviceState: "scale",
    scaleFlag: true,
    weakFlag: false,
    impressions: 1000,
    clicks: 100,
    spend: 100,
    revenue: 400,
    conversions: 10,
    ctr: 10,
    cpa: 10,
    roas: 4,
    ...overrides,
  };
}

function buildAdvisorScenario(input: {
  selectedCampaigns: CampaignPerformanceRow[];
  selectedSearchTerms: SearchTermPerformanceRow[];
  windows?: Array<{
    key: "last3" | "last7" | "last14" | "last30" | "last90" | "all_history";
    searchTerms: SearchTermPerformanceRow[];
    campaigns?: CampaignPerformanceRow[];
  }>;
}) {
  return buildGoogleGrowthAdvisor({
    selectedLabel: "selected 14d",
    selectedCampaigns: input.selectedCampaigns,
    selectedSearchTerms: input.selectedSearchTerms,
    selectedProducts: [product()],
    selectedAssets: [asset()],
    selectedAssetGroups: [assetGroup()],
    selectedGeos: [geo()],
    selectedDevices: [device()],
    windows:
      input.windows?.map((window) => ({
        key: window.key,
        label: window.key,
        campaigns: window.campaigns ?? input.selectedCampaigns,
        searchTerms: window.searchTerms,
        products: [product()],
      })) ??
      [],
  });
}

describe("Google Ads Decision Engine V2 release fixtures", () => {
  it("suppresses a brand query with low ROAS instead of recommending a negative", () => {
    const advisor = buildAdvisorScenario({
      selectedCampaigns: [
        campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search", channel: "SEARCH", roas: 6, conversions: 20, revenue: 1200 }),
        campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH", roas: 1, conversions: 2, revenue: 100 }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-search",
          campaignName: "Generic Search",
          searchTerm: "grandmix chairs",
          spend: 90,
          revenue: 0,
          conversions: 0,
          roas: 0,
          wasteFlag: true,
          negativeKeywordFlag: true,
        }),
        searchTerm({
          campaignId: "c-search",
          campaignName: "Generic Search",
          searchTerm: "grandmix table",
          spend: 70,
          revenue: 0,
          conversions: 0,
          roas: 0,
          wasteFlag: true,
          negativeKeywordFlag: true,
        }),
      ],
      windows: [
        { key: "last7", searchTerms: [searchTerm({ searchTerm: "grandmix chairs", campaignId: "c-search", campaignName: "Generic Search", spend: 40, conversions: 0, revenue: 0, roas: 0, wasteFlag: true, negativeKeywordFlag: true })] },
        { key: "last30", searchTerms: [searchTerm({ searchTerm: "grandmix table", campaignId: "c-search", campaignName: "Generic Search", spend: 70, conversions: 0, revenue: 0, roas: 0, wasteFlag: true, negativeKeywordFlag: true })] },
      ],
    });

    const governance = advisor.recommendations.find((entry) => entry.type === "query_governance");
    const brandLeakage = advisor.recommendations.find((entry) => entry.type === "brand_leakage");
    expect(governance?.negativeQueries ?? []).toHaveLength(0);
    expect(governance?.suppressionReasons).toContain("branded_query");
    expect(brandLeakage).toBeTruthy();
    expect(brandLeakage?.decision.decisionFamily).toBe("brand_governance");
  });

  it("keeps thin conversion depth from escalating growth actions recklessly", () => {
    const advisor = buildAdvisorScenario({
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax",
          campaignName: "Thin Signal PMax",
          channel: "PERFORMANCE_MAX",
          spend: 90,
          revenue: 60,
          conversions: 2,
          roas: 0.67,
        }),
      ],
      selectedSearchTerms: [],
      windows: [
        { key: "last3", searchTerms: [], campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Thin Signal PMax", channel: "PERFORMANCE_MAX", conversions: 1, revenue: 30, roas: 0.5 })] },
        { key: "last7", searchTerms: [], campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Thin Signal PMax", channel: "PERFORMANCE_MAX", conversions: 1, revenue: 30, roas: 0.5 })] },
      ],
    });

    const diagnostic = advisor.recommendations.find((entry) => entry.type === "diagnostic_guardrail");
    expect(diagnostic).toBeTruthy();
    expect(diagnostic?.dataTrust).toBe("low");
    expect(diagnostic?.doBucket).toBe("do_later");
  });

  it("treats a recent learning period as execution-blocking even when the recommendation exists", () => {
    const recommendation = buildAdvisorScenario({
      selectedCampaigns: [campaign({ campaignId: "c-pmax", campaignName: "PMax Growth", channel: "PERFORMANCE_MAX" })],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "PMax Growth",
          searchTerm: "buy carry on backpack",
          intentClass: "category_high_intent",
          intentNeedsReview: false,
        }),
      ],
    }).recommendations.find((entry) => entry.type === "pmax_scaling_fit")!;

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax",
          campaignName: "PMax Growth",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          dailyBudget: 150,
          budgetExplicitlyShared: false,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/9009",
          portfolioBidStrategyResourceName: "customers/1234567890/biddingStrategies/77",
          portfolioBidStrategyType: "TARGET_ROAS",
          portfolioBidStrategyStatus: "LEARNING",
          portfolioTargetType: "tROAS",
          portfolioTargetValue: 250,
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "PMax Growth",
          searchTerm: "buy carry on backpack",
          intentClass: "category_high_intent",
          intentNeedsReview: false,
        }),
      ],
      executionCalibration: {
        patterns: {
          "adjust_campaign_budget|pmax_scaling_fit|category_high_intent|none|unknown|done_trusted|portfolio_bid_strategy:dominant:high": {
            success: 8,
            rollback: 0,
            degraded: 0,
            failure: 0,
          },
        },
      },
    });

    expect(decorated[0].executionMode).toBe("handoff");
    expect(decorated[0].mutateEligibilityReason).toContain("portfolio_strategy_unstable");
  });

  it("keeps selected-range noise contextual when the anchored decision windows remain stable", () => {
    const selectedRangeContext = buildGoogleAdsSelectedRangeContext({
      canonicalAsOfDate: "2026-03-31",
      canonicalTotals: { spend: 100, revenue: 300, conversions: 12, roas: 3 },
      selectedRangeStart: "2026-03-25",
      selectedRangeEnd: "2026-03-31",
      selectedTotals: { spend: 35, revenue: 70, conversions: 2, roas: 2 },
    });

    expect(selectedRangeContext.state).toBe("volatile");
    expect(selectedRangeContext.summary).toContain("multi-window decision snapshot");
  });

  it("keeps obvious waste queries eligible only when they are exact-negative-safe", () => {
    const advisor = buildAdvisorScenario({
      selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH", spend: 260, revenue: 280, conversions: 4, roas: 1.08 })],
      selectedSearchTerms: [
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 130, revenue: 0, conversions: 0, roas: 0, clusterId: "refund-policy", intentClass: "support_or_post_purchase", ownershipClass: "weak_commercial", ownershipConfidence: "high", intentConfidence: "high", intentNeedsReview: false, ownershipNeedsReview: false }),
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "customer service", wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0, clusterId: "customer-service", intentClass: "support_or_post_purchase", ownershipClass: "weak_commercial", ownershipConfidence: "high", intentConfidence: "high", intentNeedsReview: false, ownershipNeedsReview: false }),
      ],
      windows: [
        { key: "last7", searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0, clusterId: "refund-policy", intentClass: "support_or_post_purchase", ownershipClass: "weak_commercial", ownershipConfidence: "high", intentConfidence: "high", intentNeedsReview: false, ownershipNeedsReview: false })] },
      ],
    });

    const governance = advisor.recommendations.find((entry) => entry.type === "query_governance");
    expect(governance?.negativeQueries).toContain("refund policy");
    expect(governance?.negativeKeywordPolicy?.requiredMatchType).toBe("exact");
  });

  it("suppresses ambiguous and SKU/product-specific query governance cases", () => {
    const advisor = buildAdvisorScenario({
      selectedCampaigns: [
        campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search", channel: "SEARCH" }),
        campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" }),
      ],
      selectedSearchTerms: [
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "cheap camping gear", wasteFlag: true, negativeKeywordFlag: true, spend: 60, revenue: 0, conversions: 0, roas: 0 }),
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "chair5000", wasteFlag: true, negativeKeywordFlag: true, spend: 75, revenue: 0, conversions: 0, roas: 0 }),
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "UrbanTrail Carry-On Backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 }),
      ],
    });

    const governance = advisor.recommendations.find((entry) => entry.type === "query_governance");
    expect(governance?.negativeQueries ?? []).toHaveLength(0);
    expect(governance?.suppressionReasons).toContain("ambiguous_intent");
    expect(governance?.suppressionReasons).toContain("sku_specific_query");
    expect(governance?.suppressionReasons).toContain("product_specific_query");
  });

  it("keeps weak PMax signal from presenting as an autonomous action surface", () => {
    const advisor = buildAdvisorScenario({
      selectedCampaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 70, revenue: 40, conversions: 1, roas: 0.57 })],
      selectedSearchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent", conversions: 0, revenue: 0, spend: 25, roas: 0 })],
    });
    const html = renderToStaticMarkup(
      React.createElement(GoogleAdvisorPanel, {
        advisor: {
          ...advisor,
          metadata: buildGoogleAdsDecisionSnapshotMetadata({
            analysisMode: "snapshot",
            asOfDate: "2026-04-08",
            selectedWindowKey: "operational_28d",
            historicalSupport: null,
            decisionSummaryTotals: {
              windowKey: "operational_28d",
              windowLabel: "operational 28d",
              spend: 70,
              revenue: 40,
              conversions: 1,
              roas: 0.57,
            },
            selectedRangeContext: null,
          }),
        },
      })
    );

    expect(html).toContain("Manual plan only");
    expect(html).toContain("Write-back disabled");
    expect(html).not.toContain("Apply");
    expect(html).not.toContain("Autonomous");
  });

  it("preserves Decision Snapshot V2 metadata in release fixtures", () => {
    const metadata = buildGoogleAdsDecisionSnapshotMetadata({
      analysisMode: "snapshot",
      asOfDate: "2026-04-08",
      selectedWindowKey: "operational_28d",
      historicalSupport: null,
      decisionSummaryTotals: {
        windowKey: "operational_28d",
        windowLabel: "operational 28d",
        spend: 120,
        revenue: 420,
        conversions: 12,
        roas: 3.5,
      },
      selectedRangeContext: null,
    });

    expect(metadata.snapshotModel).toBe("decision_snapshot_v2");
    expect(metadata.primaryWindowKey).toBe("operational_28d");
    expect(metadata.queryWindowKey).toBe("query_governance_56d");
    expect(metadata.baselineWindowKey).toBe("baseline_84d");
  });
});
