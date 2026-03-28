import { describe, expect, it } from "vitest";
import { decorateAdvisorRecommendationsForExecution } from "@/lib/google-ads/advisor-handoff";
import type {
  AssetGroupPerformanceRow,
  AssetPerformanceRow,
  CampaignPerformanceRow,
  DevicePerformanceRow,
  GeoPerformanceRow,
  ProductPerformanceRow,
  SearchTermPerformanceRow,
} from "@/lib/google-ads/intelligence-model";
import {
  annotateAdvisorMemory,
  getAdvisorExecutionCalibration,
  updateAdvisorCompletionState,
  updateAdvisorExecutionState,
  updateAdvisorMemoryAction,
} from "@/lib/google-ads/advisor-memory";
import { buildGoogleGrowthAdvisor } from "@/lib/google-ads/growth-advisor";
import { buildQueryOwnershipContext, classifyQueryOwnership } from "@/lib/google-ads/query-ownership";

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

describe("buildGoogleGrowthAdvisor", () => {
  it("recommends non-brand expansion when only brand + pmax exist and recurring non-brand demand is present", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [
        campaign({ campaignId: "c-brand", campaignName: "Brand Search", channel: "SEARCH", spend: 120, revenue: 720, conversions: 24, roas: 6 }),
        campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 400, revenue: 1400, conversions: 30, roas: 3.5 }),
      ],
      selectedSearchTerms: [
        searchTerm(),
        searchTerm({ searchTerm: "travel weekender bag", clusterId: "travel-weekender-bag", conversions: 3, revenue: 360, roas: 3 }),
      ],
      selectedProducts: [product(), product({ productItemId: "sku-2", productTitle: "Weekender Bag", revenueShare: 22, hiddenWinnerState: "hidden_winner" })],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 })], searchTerms: [searchTerm()], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 })], searchTerms: [searchTerm()], products: [product()] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.type === "non_brand_expansion");
    expect(recommendation).toBeTruthy();
    expect(recommendation?.seedQueriesExact?.length).toBeGreaterThan(0);
    expect(recommendation?.decisionFamily).toBe("growth_unlock");
    expect(recommendation?.doBucket).toBe("do_now");
    expect(recommendation?.confidenceExplanation.length).toBeGreaterThan(0);
    expect(advisor.summary.accountOperatingMode.length).toBeGreaterThan(0);
    expect(advisor.summary.recommendedFocusToday.length).toBeGreaterThan(0);
  });

  it("recommends a shopping control launch when pmax carries catalog demand alone", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 30d",
      selectedCampaigns: [
        campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 500, revenue: 1800, conversions: 40, roas: 3.6 }),
      ],
      selectedSearchTerms: [searchTerm()],
      selectedProducts: [
        product({ hiddenWinnerState: "hidden_winner", revenueShare: 40 }),
        product({ productItemId: "sku-2", productTitle: "Weekender Bag", revenueShare: 35, roas: 3.2 }),
        product({ productItemId: "sku-3", productTitle: "Packing Cube Set", revenueShare: 25, roas: 1.3 }),
      ],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.type === "shopping_launch_or_split");
    expect(recommendation).toBeTruthy();
    expect(recommendation?.launchMode).toBeTruthy();
    expect(recommendation?.startingSkuClusters?.length).toBeGreaterThan(0);
    expect(recommendation?.playbookSteps?.length).toBeGreaterThan(0);
  });

  it("surfaces negative query governance when clear waste exists", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH", spend: 260, revenue: 280, conversions: 4, roas: 1.08 })],
      selectedSearchTerms: [
        searchTerm({ searchTerm: "cheap camping backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 130, revenue: 0, conversions: 0, roas: 0, clusterId: "cheap-camping-backpack" }),
        searchTerm({ searchTerm: "free backpack patterns pdf", wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0, clusterId: "free-backpack-patterns" }),
      ],
      selectedProducts: [product()],
      selectedAssets: [asset({ assetState: "underperforming", wasteFlag: true, expandFlag: false })],
      selectedAssetGroups: [assetGroup({ weakState: "weak", coverageRisk: true, missingAssetTypes: ["DESCRIPTION"] })],
      selectedGeos: [geo()],
      selectedDevices: [device(), device({ device: "Mobile", roas: 1.8, spend: 220 })],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 50, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 60, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 70, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 90, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 120, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 140, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
      ],
    });

    const governance = advisor.recommendations.find((entry) => entry.type === "query_governance");
    expect(governance).toBeTruthy();
    expect(governance?.negativeQueries).toContain("cheap camping backpack");
    expect(governance?.negativeGuardrails?.length).toBeGreaterThan(0);
  });

  it("surfaces brand leakage when branded demand appears outside the brand lane", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [
        campaign({
          campaignId: "c-brand",
          campaignName: "Grandmix Brand Search",
          channel: "SEARCH",
          revenueShare: 55,
          spendShare: 30,
          roas: 6,
          revenue: 1800,
          conversions: 30,
        }),
        campaign({
          campaignId: "c-pmax",
          campaignName: "Grandmix PMax",
          channel: "PERFORMANCE_MAX",
          spend: 300,
          revenue: 720,
          conversions: 12,
          roas: 2.4,
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-brand",
          campaignName: "Grandmix Brand Search",
          searchTerm: "grandmix",
          revenue: 300,
          conversions: 6,
          roas: 6,
        }),
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "Grandmix PMax",
          searchTerm: "grandmix chairs",
          spend: 60,
          revenue: 120,
          conversions: 2,
          roas: 2,
        }),
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "Grandmix PMax",
          searchTerm: "grandmix table",
          spend: 40,
          revenue: 80,
          conversions: 1,
          roas: 2,
        }),
      ],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 50, conversions: 1, roas: 2.5 })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 25, revenue: 50, conversions: 1, roas: 2 })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 50, conversions: 1, roas: 2.5 })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.id === "google-brand-leakage-control");
    expect(recommendation).toBeTruthy();
    expect(recommendation?.negativeQueries).toContain("grandmix chairs");
  });

  it("only promotes recurring proven terms into exact while leaving weaker recurring terms in phrase", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 30d",
      selectedCampaigns: [
        campaign({ campaignId: "c-brand", campaignName: "Brand Search", channel: "SEARCH", spend: 80, revenue: 480, conversions: 12, roas: 6 }),
        campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 18, roas: 3 }),
      ],
      selectedSearchTerms: [
        searchTerm({ searchTerm: "carry on backpack", conversions: 3, revenue: 360, roas: 3.2 }),
        searchTerm({ searchTerm: "weekender bag", conversions: 1, revenue: 240, roas: 3.2 }),
        searchTerm({ searchTerm: "travel duffel", conversions: 0, clicks: 20, revenue: 0, roas: 0 }),
      ],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 1, revenue: 100, roas: 2.5 })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 1, revenue: 100, roas: 2.5 }), searchTerm({ searchTerm: "weekender bag", conversions: 1, revenue: 180, roas: 3.1 })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 2, revenue: 180, roas: 2.7 })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 2, revenue: 200, roas: 3 }), searchTerm({ searchTerm: "travel duffel", conversions: 0, clicks: 20, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 1, revenue: 90, roas: 2 })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 2, revenue: 200, roas: 3 }), searchTerm({ searchTerm: "weekender bag", conversions: 1, revenue: 180, roas: 3.1 })], products: [product()] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.type === "keyword_buildout");
    expect(recommendation).toBeTruthy();
    expect(recommendation?.promoteToExact).toContain("carry on backpack");
    expect(recommendation?.promoteToExact).not.toContain("weekender bag");
    expect(recommendation?.promoteToPhrase).toContain("weekender bag");
  });

  it("adds diagnostic flags when visibility is too thin", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 7d",
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
      selectedProducts: [],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Thin Signal PMax", channel: "PERFORMANCE_MAX", conversions: 1, revenue: 30, roas: 0.5 })], searchTerms: [], products: [] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Thin Signal PMax", channel: "PERFORMANCE_MAX", conversions: 1, revenue: 30, roas: 0.5 })], searchTerms: [], products: [] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Thin Signal PMax", channel: "PERFORMANCE_MAX", conversions: 1, revenue: 30, roas: 0.5 })], searchTerms: [], products: [] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Thin Signal PMax", channel: "PERFORMANCE_MAX", conversions: 1, revenue: 30, roas: 0.5 })], searchTerms: [], products: [] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Thin Signal PMax", channel: "PERFORMANCE_MAX", conversions: 1, revenue: 30, roas: 0.5 })], searchTerms: [], products: [] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Thin Signal PMax", channel: "PERFORMANCE_MAX", conversions: 1, revenue: 30, roas: 0.5 })], searchTerms: [], products: [] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.type === "diagnostic_guardrail");
    expect(recommendation).toBeTruthy();
    expect(recommendation?.diagnosticFlags?.length).toBeGreaterThan(0);
    expect(recommendation?.playbookSteps?.length).toBeGreaterThan(0);
    expect(recommendation?.dataTrust).toBe("low");
    expect(recommendation?.doBucket).toBe("do_later");
    expect(recommendation?.confidenceDegradationReasons.length).toBeGreaterThan(0);
  });

  it("adds decision synthesis fields and keeps recommendations ranked by do bucket first", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [
        campaign({ campaignId: "c-brand", campaignName: "Brand Search", channel: "SEARCH", spend: 120, revenue: 720, conversions: 24, roas: 6 }),
        campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 400, revenue: 1400, conversions: 30, roas: 3.5 }),
        campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH", spend: 260, revenue: 280, conversions: 4, roas: 1.08 }),
      ],
      selectedSearchTerms: [
        searchTerm(),
        searchTerm({ searchTerm: "cheap camping backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 130, revenue: 0, conversions: 0, roas: 0, clusterId: "cheap-camping-backpack" }),
        searchTerm({ searchTerm: "free backpack patterns pdf", wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0, clusterId: "free-backpack-patterns" }),
      ],
      selectedProducts: [product(), product({ productItemId: "sku-2", productTitle: "Weekender Bag", revenueShare: 22, hiddenWinnerState: "hidden_winner" })],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm(), searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 50, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm(), searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 60, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm(), searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 70, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm(), searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 90, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm(), searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 120, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 20, roas: 3 }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm(), searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 140, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
      ],
    });

    expect(advisor.recommendations.length).toBeGreaterThan(0);
    expect(advisor.recommendations[0].doBucket).toBe("do_now");
    expect(advisor.recommendations.some((entry) => entry.doBucket === "do_later")).toBe(true);
    expect(advisor.recommendations.every((entry) => entry.reasonCodes.length > 0)).toBe(true);
    expect(advisor.recommendations.every((entry) => entry.validationChecklist.length > 0)).toBe(true);
    expect(advisor.recommendations.every((entry) => typeof entry.rankScore === "number")).toBe(true);
    expect(advisor.recommendations.every((entry) => entry.rankExplanation.length > 0)).toBe(true);
    expect(advisor.summary.watchouts.length).toBeGreaterThanOrEqual(0);
    expect(advisor.summary.dataTrustSummary.length).toBeGreaterThan(0);
    expect(advisor.summary.accountState).toBeTruthy();
  });

  it("downgrades expansion recommendations behind governance dependencies", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [
        campaign({ campaignId: "c-brand", campaignName: "Brand Search", channel: "SEARCH", spend: 120, revenue: 720, conversions: 24, roas: 6 }),
        campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 320, revenue: 900, conversions: 12, roas: 2.8 }),
        campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH", spend: 180, revenue: 210, conversions: 5, roas: 1.16 }),
      ],
      selectedSearchTerms: [
        searchTerm({ searchTerm: "carry on backpack", conversions: 3, revenue: 360, roas: 3.2 }),
        searchTerm({ searchTerm: "cheap backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 }),
        searchTerm({ searchTerm: "free backpack patterns pdf", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 }),
      ],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 1, revenue: 120, roas: 3 }), searchTerm({ searchTerm: "cheap backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 1, revenue: 100, roas: 2.5 }), searchTerm({ searchTerm: "cheap backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 50, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 2, revenue: 180, roas: 2.7 }), searchTerm({ searchTerm: "free backpack patterns pdf", wasteFlag: true, negativeKeywordFlag: true, spend: 60, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 2, revenue: 200, roas: 3 })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 1, revenue: 90, roas: 2 })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" }), campaign({ campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ searchTerm: "carry on backpack", conversions: 2, revenue: 200, roas: 3 })], products: [product()] },
      ],
    });

    const expansion = advisor.recommendations.find((entry) => entry.type === "keyword_buildout");
    expect(expansion).toBeTruthy();
    expect(expansion?.dependsOnRecommendationIds?.length).toBeGreaterThan(0);
    expect(expansion?.blockedByRecommendationIds?.length).toBeGreaterThan(0);
    expect(["do_next", "do_later"]).toContain(expansion?.doBucket);
    expect(expansion?.integrityState).not.toBe("suppressed");
  });

  it("classifies hybrid narrow ownership deterministically", () => {
    const context = buildQueryOwnershipContext({
      campaigns: [campaign({ campaignName: "Grandmix Brand Search" })],
      searchTerms: [searchTerm({ searchTerm: "grandmix vs herman miller" })],
      products: [product({ productItemId: "sku-99", productTitle: "Grandmix Chair 5000" })],
    });

    expect(classifyQueryOwnership("grandmix chair", context).ownershipClass).toBe("brand");
    expect(classifyQueryOwnership("grandmix chair", context).intentClass).toBe("brand_mixed");
    expect(classifyQueryOwnership("grandmix", context).intentClass).toBe("brand_core");
    expect(classifyQueryOwnership("herman miller alternative", context).ownershipClass).toBe("competitor");
    expect(classifyQueryOwnership("herman miller alternative", context).intentClass).toBe("category_mid_intent");
    expect(classifyQueryOwnership("chair5000", context).ownershipClass).toBe("sku_specific");
    expect(classifyQueryOwnership("chair5000", context).intentClass).toBe("product_specific");
    expect(classifyQueryOwnership("refund policy", context).ownershipClass).toBe("weak_commercial");
    expect(classifyQueryOwnership("refund policy", context).intentClass).toBe("support_or_post_purchase");
    expect(classifyQueryOwnership("cheap desk organizer", context).intentClass).toBe("price_sensitive");
    expect(classifyQueryOwnership("best desk organizer", context).intentClass).toBe("research_low_intent");
    expect(classifyQueryOwnership("buy ergonomic desk organizer", context).intentClass).toBe("category_high_intent");
    expect(classifyQueryOwnership("ergonomic desk organizer", context).ownershipClass).toBe("non_brand");
    expect(classifyQueryOwnership("ergonomic desk organizer", context).intentClass).toBe("category_high_intent");
  });

  it("tracks recommendation memory states across runs", async () => {
    const businessId = `test-biz-${Date.now()}-memory`;
    const accountId = "test-account";
    const recommendations = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: [
        {
          ...buildGoogleGrowthAdvisor({
            selectedLabel: "selected 7d",
            selectedCampaigns: [campaign()],
            selectedSearchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 })],
            selectedProducts: [product()],
            selectedAssets: [asset()],
            selectedAssetGroups: [assetGroup()],
            selectedGeos: [geo()],
            selectedDevices: [device()],
            windows: [
              { key: "last3", label: "last 3d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
              { key: "last7", label: "last 7d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
              { key: "last14", label: "last 14d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
              { key: "last30", label: "last 30d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
              { key: "last90", label: "last 90d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
              { key: "all_history", label: "all history", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
            ],
          }).recommendations[0],
        },
      ],
    });

    expect(recommendations[0].currentStatus).toBe("new");
    expect(recommendations[0].seenCount).toBe(1);

    const rerun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations,
    });

    expect(["persistent", "escalated", "downgraded"]).toContain(rerun[0].currentStatus ?? "");
    expect(rerun[0].seenCount).toBeGreaterThanOrEqual(2);
  });

  it("suppresses dismissed recommendations until suppression expires", async () => {
    const businessId = `test-biz-${Date.now()}-suppress`;
    const accountId = "test-account";
    const firstRun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: buildGoogleGrowthAdvisor({
        selectedLabel: "selected 7d",
        selectedCampaigns: [campaign()],
        selectedSearchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations,
    });

    await updateAdvisorMemoryAction({
      businessId,
      accountId,
      recommendationFingerprint: firstRun[0].recommendationFingerprint,
      action: "dismissed",
      dismissReason: "not now",
      suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const suppressed = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: firstRun,
    });

    expect(suppressed.find((entry) => entry.recommendationFingerprint === firstRun[0].recommendationFingerprint)).toBeUndefined();
  });

  it("detects search vs shopping overlap for sku-specific demand", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 30d",
      selectedCampaigns: [
        campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH", spend: 180, revenue: 420, conversions: 7, roas: 2.33 }),
        campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING", spend: 220, revenue: 660, conversions: 11, roas: 3 }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-search",
          campaignName: "Backpack Search",
          searchTerm: "urbantrail carry-on backpack",
          spend: 70,
          revenue: 180,
          conversions: 2,
          roas: 2.57,
        }),
      ],
      selectedProducts: [
        product({
          productItemId: "urbantrail-1234",
          productTitle: "UrbanTrail Carry-On Backpack",
          campaignIds: ["c-shop"],
          campaignNames: ["Backpack Shopping"],
          spend: 120,
          revenue: 360,
          conversions: 5,
          roas: 3,
        }),
      ],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 100, roas: 2.5 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
      ],
    });

    const overlap = advisor.recommendations.find((entry) => entry.type === "search_shopping_overlap");
    expect(overlap).toBeTruthy();
    expect(overlap?.overlapType).toBe("search_shopping_overlap");
    expect(overlap?.overlapEntities?.length).toBeGreaterThan(1);
  });

  it("escalates recurring unresolved recommendations after repeated runs", async () => {
    const businessId = `test-biz-${Date.now()}-escalate`;
    const accountId = "test-account";
    const recommendation = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 7d",
      selectedCampaigns: [campaign()],
      selectedSearchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 })],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
      ],
    }).recommendations[0];

    let run = [recommendation];
    for (let index = 0; index < 5; index += 1) {
      run = await annotateAdvisorMemory({ businessId, accountId, recommendations: run });
    }

    expect(run[0].currentStatus).toBe("escalated");
    expect(run[0].seenCount).toBeGreaterThanOrEqual(5);
  });

  it("stores a minimum outcome verdict after an applied recommendation resolves", async () => {
    const businessId = `test-biz-${Date.now()}-outcome`;
    const accountId = "test-account";
    const firstRun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: buildGoogleGrowthAdvisor({
        selectedLabel: "selected 7d",
        selectedCampaigns: [campaign()],
        selectedSearchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations,
    });

    await updateAdvisorMemoryAction({
      businessId,
      accountId,
      recommendationFingerprint: firstRun[0].recommendationFingerprint,
      action: "applied",
    });
    const fallbackRoot = (globalThis as typeof globalThis & {
      __googleAdvisorMemoryFallback?: Map<string, Map<string, Record<string, unknown>>>;
    }).__googleAdvisorMemoryFallback;
    const scope = fallbackRoot?.get(`${businessId}:${accountId}`);
    const row = scope?.get(firstRun[0].recommendationFingerprint);
    if (row && scope) {
      scope.set(firstRun[0].recommendationFingerprint, {
        ...row,
        outcome_check_at: new Date(Date.now() - 60_000).toISOString(),
      });
    }

    await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: [],
    });

    const resolved = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: firstRun,
    });

    expect(resolved[0].baselineSnapshot).toBeTruthy();
    expect(resolved[0].appliedAt).toBeTruthy();
    expect(resolved[0].outcomeCheckAt).toBeTruthy();
    expect(resolved[0].outcomeVerdict).toBeTruthy();
  });

  it("builds grouped handoff context when a recommendation spans multiple entities", () => {
    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [
        {
          ...buildGoogleGrowthAdvisor({
            selectedLabel: "selected 14d",
            selectedCampaigns: [campaign(), campaign({ campaignId: "c-2", campaignName: "Secondary Search", channel: "SEARCH" })],
            selectedSearchTerms: [searchTerm()],
            selectedProducts: [product()],
            selectedAssets: [asset()],
            selectedAssetGroups: [assetGroup()],
            selectedGeos: [geo()],
            selectedDevices: [device()],
            windows: [
              { key: "last3", label: "last 3d", campaigns: [campaign()], searchTerms: [searchTerm()], products: [product()] },
              { key: "last7", label: "last 7d", campaigns: [campaign()], searchTerms: [searchTerm()], products: [product()] },
              { key: "last14", label: "last 14d", campaigns: [campaign()], searchTerms: [searchTerm()], products: [product()] },
              { key: "last30", label: "last 30d", campaigns: [campaign()], searchTerms: [searchTerm()], products: [product()] },
              { key: "last90", label: "last 90d", campaigns: [campaign()], searchTerms: [searchTerm()], products: [product()] },
              { key: "all_history", label: "all history", campaigns: [campaign()], searchTerms: [searchTerm()], products: [product()] },
            ],
          }).recommendations[0],
          affectedCampaignIds: ["c-1", "c-2"],
          overlapEntities: ["Campaign A", "Campaign B"],
        },
      ],
    });

    expect(decorated[0].deepLinkUrl).toBeNull();
    expect(decorated[0].handoffUnavailableReason).toContain("single safe deep link");
    expect(Array.isArray(decorated[0].handoffPayload?.relatedEntities)).toBe(true);
  });

  it("blocks scale-oriented recommendations when high-confidence inventory is out of stock", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 30d",
      selectedCampaigns: [
        campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 500, revenue: 1800, conversions: 40, roas: 3.6 }),
      ],
      selectedSearchTerms: [searchTerm()],
      selectedProducts: [
        product({ productItemId: "sku-1", productTitle: "UrbanTrail Carry-On Backpack", hiddenWinnerState: "hidden_winner", revenueShare: 40 }),
      ],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      commerceContext: {
        commerceSources: [{ productItemId: "sku-1", productTitle: "UrbanTrail Carry-On Backpack", inventory: 0, availability: "out_of_stock" }],
      },
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.type === "product_allocation");
    expect(recommendation).toBeTruthy();
    expect(recommendation?.commerceSignals?.stockState).toBe("out_of_stock");
    expect(recommendation?.commerceConfidence).toBe("high");
    expect(recommendation?.integrityState).toBe("blocked");
    expect(recommendation?.doBucket).toBe("do_later");
  });

  it("downgrades scale-oriented recommendations when stock is low and confidence is high", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 30d",
      selectedCampaigns: [
        campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 500, revenue: 1800, conversions: 40, roas: 3.6 }),
      ],
      selectedSearchTerms: [searchTerm()],
      selectedProducts: [
        product({ productItemId: "sku-1", productTitle: "UrbanTrail Carry-On Backpack", hiddenWinnerState: "hidden_winner", revenueShare: 40 }),
      ],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      commerceContext: {
        commerceSources: [{ productItemId: "sku-1", productTitle: "UrbanTrail Carry-On Backpack", inventory: 4, availability: "limited" }],
      },
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.type === "product_allocation");
    expect(recommendation).toBeTruthy();
    expect(recommendation?.commerceSignals?.stockState).toBe("low_stock");
    expect(recommendation?.integrityState).toBe("downgraded");
    expect(["do_next", "do_later"]).toContain(recommendation?.doBucket);
  });

  it("treats proxy-only stock risk as a warning instead of a hard block", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 30d",
      selectedCampaigns: [
        campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 500, revenue: 1800, conversions: 40, roas: 3.6 }),
      ],
      selectedSearchTerms: [searchTerm()],
      selectedProducts: [
        product({
          productItemId: "sku-1",
          productTitle: "UrbanTrail Carry-On Backpack",
          hiddenWinnerState: "hidden_winner",
          revenueShare: 40,
          availabilityIssue: "limited visibility from feed issue",
        } as Partial<ProductPerformanceRow>),
      ],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.type === "product_allocation");
    expect(recommendation).toBeTruthy();
    expect(recommendation?.commerceSignals?.stockState).toBe("unknown");
    expect(recommendation?.commerceConfidence).toBe("low");
    expect(recommendation?.integrityState).not.toBe("blocked");
  });

  it("reduces rank priority for low-margin overlap issues compared with higher-margin ones", () => {
    const highMarginAdvisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 30d",
      selectedCampaigns: [
        campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH", spend: 180, revenue: 420, conversions: 7, roas: 2.33 }),
        campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING", spend: 220, revenue: 660, conversions: 11, roas: 3 }),
      ],
      selectedSearchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", spend: 70, revenue: 180, conversions: 2, roas: 2.57 })],
      selectedProducts: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"], contributionProxy: 200, spend: 120, revenue: 360, conversions: 5, roas: 3 })],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      commerceContext: { costModel: { cogsPercent: 0.2, shippingPercent: 0.05, feePercent: 0.05, fixedCost: 0 } },
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 100, roas: 2.5 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
      ],
    });
    const lowMarginRebuilt = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 30d",
      selectedCampaigns: [
        campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH", spend: 180, revenue: 420, conversions: 7, roas: 2.33 }),
        campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING", spend: 220, revenue: 660, conversions: 11, roas: 3 }),
      ],
      selectedSearchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", spend: 70, revenue: 180, conversions: 2, roas: 2.57 })],
      selectedProducts: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"], contributionProxy: 20, spend: 120, revenue: 360, conversions: 5, roas: 3 })],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      commerceContext: { costModel: { cogsPercent: 0.7, shippingPercent: 0.1, feePercent: 0.05, fixedCost: 0 } },
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 100, roas: 2.5 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Backpack Search", channel: "SEARCH" }), campaign({ campaignId: "c-shop", campaignName: "Backpack Shopping", channel: "SHOPPING" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Backpack Search", searchTerm: "urbantrail carry-on backpack", conversions: 1, revenue: 90, roas: 2.25 })], products: [product({ productItemId: "urbantrail-1234", productTitle: "UrbanTrail Carry-On Backpack", campaignIds: ["c-shop"], campaignNames: ["Backpack Shopping"] })] },
      ],
    });

    const highRec = highMarginAdvisor.recommendations.find((entry) => entry.type === "search_shopping_overlap");
    const lowRec = lowMarginRebuilt.recommendations.find((entry) => entry.type === "search_shopping_overlap");
    expect(highRec).toBeTruthy();
    expect(lowRec).toBeTruthy();
    expect(highRec?.commerceSignals?.marginBand).toBe("high");
    expect(lowRec?.commerceSignals?.marginBand).toBe("low");
    expect((highRec?.rankScore ?? 0)).toBeGreaterThan(lowRec?.rankScore ?? 0);
  });

  it("keeps outcome verdict unknown until the lag-aware review window is reached", async () => {
    const businessId = `test-biz-${Date.now()}-lag`;
    const accountId = "test-account";
    const firstRun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search", channel: "SEARCH" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })],
        selectedSearchTerms: [
          searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 60, revenue: 120, conversions: 2, roas: 2 }),
          searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 40, revenue: 80, conversions: 1, roas: 2 }),
        ],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 50, conversions: 1, roas: 2.5 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 25, revenue: 50, conversions: 1, roas: 2 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 50, conversions: 1, roas: 2.5 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
        ],
      }).recommendations,
    });
    const recommendation = firstRun.find((entry) => entry.type === "brand_leakage");
    expect(recommendation).toBeTruthy();

    await updateAdvisorMemoryAction({
      businessId,
      accountId,
      recommendationFingerprint: recommendation!.recommendationFingerprint,
      action: "applied",
    });

    const rerun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: [recommendation!],
    });
    expect(rerun[0].outcomeVerdict).toBe("unknown");
    expect(rerun[0].outcomeVerdictFailReason).toBe("insufficient_data_window");
    expect(rerun[0].outcomeConfidence).toBe("low");
    expect(rerun[0].outcomeCheckWindowDays).toBe(10);
  });

  it("adds overlap severity and ordered handoff steps for supported grouped overlap work", () => {
    const overlapRecommendation = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [
        campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search", channel: "SEARCH" }),
        campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" }),
      ],
      selectedSearchTerms: [
        searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 60, revenue: 120, conversions: 2, roas: 2 }),
        searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 40, revenue: 80, conversions: 1, roas: 2 }),
      ],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 50, conversions: 1, roas: 2.5 })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 25, revenue: 50, conversions: 1, roas: 2 })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 50, conversions: 1, roas: 2.5 })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
      ],
    }).recommendations.find((entry) => entry.type === "brand_leakage");

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: overlapRecommendation ? [{ ...overlapRecommendation, affectedCampaignIds: ["c-brand", "c-pmax"], overlapEntities: ["Grandmix Brand Search", "Grandmix PMax"] }] : [],
    });

    expect(decorated[0].overlapSeverity).toBeTruthy();
    expect(decorated[0].overlapTrend).toBeTruthy();
    expect(decorated[0].orderedHandoffSteps?.length).toBeGreaterThan(0);
    expect((decorated[0].estimatedOperatorMinutes ?? 0)).toBeGreaterThan(0);
  });

  it("marks supported single-campaign governance work as mutate-ready", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH", spend: 260, revenue: 280, conversions: 4, roas: 1.08 })],
      selectedSearchTerms: [
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 130, revenue: 0, conversions: 0, roas: 0, clusterId: "refund-policy" }),
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "customer service", wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0, clusterId: "customer-service" }),
      ],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 50, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 60, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 70, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 90, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 120, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 140, conversions: 0, revenue: 0, roas: 0 })], products: [product()] },
      ],
    });

    const governance = advisor.recommendations.find((entry) => entry.type === "query_governance");
    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: governance
        ? [
            {
              ...governance,
              dataTrust: "medium",
              doBucket: "do_now",
            },
          ]
        : [],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-search",
          campaignName: "Generic Search",
          searchTerm: "refund policy",
          ownershipClass: "weak_commercial",
          intentClass: "support_or_post_purchase",
        }),
        searchTerm({
          campaignId: "c-search",
          campaignName: "Generic Search",
          searchTerm: "customer service",
          ownershipClass: "weak_commercial",
          intentClass: "support_or_post_purchase",
        }),
      ],
    });

    expect(decorated[0].executionMode).toBe("mutate_ready");
    expect(decorated[0].mutateActionType).toBe("add_negative_keyword");
    expect(decorated[0].canRollback).toBe(true);
  });

  it("keeps governance work in handoff mode when negative queries span multiple campaigns", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })],
        selectedSearchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "cheap camping backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "cheap camping backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 50, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "cheap camping backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 60, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "cheap camping backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "cheap camping backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "cheap camping backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 120, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "cheap camping backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 140, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations.find((entry) => entry.type === "query_governance")!,
      dataTrust: "medium",
      doBucket: "do_now",
      negativeQueries: ["cheap camping backpack", "free backpack patterns pdf"],
    };
    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedSearchTerms: [
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "cheap camping backpack" }),
        searchTerm({ campaignId: "c-other", campaignName: "Prospecting Search", searchTerm: "free backpack patterns pdf" }),
      ],
    });

    expect(decorated[0].executionMode).toBe("handoff");
    expect(decorated[0].mutateActionType).toBeNull();
  });

  it("keeps risky mixed-intent governance work in handoff mode even when scope is single-campaign", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })],
        selectedSearchTerms: [
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy carry on backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 }),
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 }),
        ],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy carry on backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 50, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy carry on backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 60, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy carry on backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy carry on backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy carry on backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 120, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy carry on backpack", wasteFlag: true, negativeKeywordFlag: true, spend: 140, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations.find((entry) => entry.type === "query_governance")!,
      dataTrust: "medium",
      doBucket: "do_now",
      negativeQueries: ["buy carry on backpack", "refund policy"],
    };
    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-search",
          campaignName: "Generic Search",
          searchTerm: "buy carry on backpack",
          ownershipClass: "non_brand",
          intentClass: "category_high_intent",
        }),
        searchTerm({
          campaignId: "c-search",
          campaignName: "Generic Search",
          searchTerm: "refund policy",
          ownershipClass: "weak_commercial",
          intentClass: "support_or_post_purchase",
        }),
      ],
    });

    expect(decorated[0].executionMode).toBe("handoff");
    expect(decorated[0].mutateEligibilityReason).toContain("product-specific, high-intent, or brand-mixed");
  });

  it("prefers high-intent terms for exact and leaves price-sensitive demand out of exact promotion", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 30d",
      selectedCampaigns: [
        campaign({ campaignId: "c-brand", campaignName: "Brand Search", channel: "SEARCH", spend: 80, revenue: 480, conversions: 12, roas: 6 }),
        campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", spend: 300, revenue: 900, conversions: 18, roas: 3 }),
      ],
      selectedSearchTerms: [
        searchTerm({ searchTerm: "buy ergonomic desk organizer", conversions: 3, revenue: 360, roas: 3.2 }),
        searchTerm({ searchTerm: "ergonomic desk organizer", conversions: 1, revenue: 180, roas: 3.1 }),
        searchTerm({ searchTerm: "cheap desk organizer", conversions: 2, revenue: 220, roas: 3.1 }),
      ],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "buy ergonomic desk organizer", conversions: 1, revenue: 100, roas: 2.5 })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "buy ergonomic desk organizer", conversions: 1, revenue: 100, roas: 2.5 }), searchTerm({ searchTerm: "cheap desk organizer", conversions: 1, revenue: 110, roas: 3.05 })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "buy ergonomic desk organizer", conversions: 2, revenue: 180, roas: 2.7 })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "buy ergonomic desk organizer", conversions: 2, revenue: 200, roas: 3 }), searchTerm({ searchTerm: "cheap desk organizer", conversions: 1, revenue: 110, roas: 3.05 })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "buy ergonomic desk organizer", conversions: 1, revenue: 90, roas: 2 })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignName: "Brand Search" }), campaign({ campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ searchTerm: "buy ergonomic desk organizer", conversions: 2, revenue: 200, roas: 3 }), searchTerm({ searchTerm: "cheap desk organizer", conversions: 1, revenue: 80, roas: 2.2 })], products: [product()] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.type === "keyword_buildout");
    expect(recommendation?.promoteToExact).toContain("buy ergonomic desk organizer");
    expect(recommendation?.promoteToExact).not.toContain("cheap desk organizer");
    expect(recommendation?.promoteToPhrase ?? []).not.toContain("cheap desk organizer");
  });

  it("marks a single healthy PMax campaign as budget-mutate-ready", () => {
    const advisor = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          channel: "PERFORMANCE_MAX",
          spend: 320,
          revenue: 1280,
          conversions: 24,
          roas: 4,
          scaleState: "scale",
          dailyBudget: 100,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/111",
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          searchTerm: "buy carry on backpack",
          conversions: 3,
          revenue: 360,
          roas: 3.2,
          intentClass: "category_high_intent",
          intentNeedsReview: false,
        }),
      ],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", conversions: 1, revenue: 120, roas: 3, intentClass: "category_high_intent" })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", conversions: 1, revenue: 120, roas: 3, intentClass: "category_high_intent" })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", conversions: 2, revenue: 240, roas: 3.2, intentClass: "category_high_intent" })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", conversions: 2, revenue: 240, roas: 3.2, intentClass: "category_high_intent" })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", conversions: 1, revenue: 120, roas: 3, intentClass: "category_high_intent" })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", conversions: 2, revenue: 240, roas: 3.2, intentClass: "category_high_intent" })], products: [product()] },
      ],
    });

    const recommendation = advisor.recommendations.find((entry) => entry.type === "pmax_scaling_fit");
    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: recommendation ? [recommendation] : [],
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          dailyBudget: 100,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/111",
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          searchTerm: "buy carry on backpack",
          intentClass: "category_high_intent",
          intentNeedsReview: false,
        }),
      ],
      executionCalibration: {
        patterns: {
          "adjust_campaign_budget|pmax_scaling_fit|category_high_intent|none|unknown|done_trusted": {
            success: 6,
            rollback: 0,
            degraded: 0,
            failure: 0,
          },
        },
      },
    });

    const mutateReady = decorated.find((entry) => entry.type === "pmax_scaling_fit")!;
    expect(mutateReady.executionMode).toBe("mutate_ready");
    expect(mutateReady.mutateActionType).toBe("adjust_campaign_budget");
    expect(mutateReady.rollbackActionType).toBe("restore_campaign_budget");
    expect(mutateReady.budgetAdjustmentPreview?.deltaPercent).toBe(15);
  });

  it("allows account-level budget reallocation when it resolves to a deterministic zero-sum move", () => {
    const recommendation = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [
        campaign({
          campaignId: "c-brand",
          campaignName: "Brand Search",
          channel: "SEARCH",
          scaleState: "monitor",
          wasteState: "waste",
          dailyBudget: 100,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/111",
        }),
        campaign({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          wasteState: "healthy",
          dailyBudget: 80,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/222",
          roas: 5,
        }),
      ],
      selectedSearchTerms: [searchTerm()],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm()], products: [product()] },
      ],
    }).recommendations.find((entry) => entry.type === "budget_reallocation")!;

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "c-brand",
          campaignName: "Brand Search",
          channel: "SEARCH",
          scaleState: "monitor",
          wasteState: "waste",
          dailyBudget: 100,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/111",
        }),
        campaign({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          wasteState: "healthy",
          dailyBudget: 80,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/222",
          roas: 5,
        }),
      ],
      executionCalibration: {
        patterns: {
          "adjust_campaign_budget|budget_reallocation|portfolio_reallocation|none|none|done_trusted": {
            success: 6,
            rollback: 0,
            degraded: 0,
            failure: 0,
          },
        },
      },
    });

    expect(decorated[0].executionMode).toBe("mutate_ready");
    expect(decorated[0].mutateActionType).toBe("adjust_campaign_budget");
    expect(decorated[0].reallocationPreview?.netDelta).toBe(0);
    expect(decorated[0].reallocationPreview?.sourceCampaigns).toHaveLength(1);
    expect(decorated[0].reallocationPreview?.destinationCampaigns).toHaveLength(1);
  });

  it("blocks native budget mutate for shared budgets or uncertain intent", () => {
    const recommendation = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })],
      selectedSearchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
      ],
    }).recommendations.find((entry) => entry.type === "pmax_scaling_fit")!;

    const sharedDecorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          budgetExplicitlyShared: true,
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          searchTerm: "buy carry on backpack",
          intentClass: "category_high_intent",
          intentNeedsReview: false,
        }),
      ],
    });
    expect(sharedDecorated[0].executionMode).toBe("handoff");
    expect(sharedDecorated[0].mutateEligibilityReason).toContain("shared_budget");
    expect(sharedDecorated[0].sharedStateGovernanceType).toBe("shared_budget");
    expect(sharedDecorated[0].allocatorCoupled).toBe(true);
    expect(sharedDecorated[0].sharedStateMutateBlockedReason).toContain("shared budget");
    expect(sharedDecorated[0].coupledCampaignIds).toContain("c-pmax");

    const uncertainDecorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          budgetExplicitlyShared: false,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/222",
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          searchTerm: "buy carry on backpack",
          intentClass: "category_high_intent",
          intentNeedsReview: true,
        }),
      ],
    });
    expect(uncertainDecorated[0].executionMode).toBe("handoff");
    expect(uncertainDecorated[0].mutateEligibilityReason).toContain("intent_uncertain");
    expect(uncertainDecorated[0].sharedStateGovernanceType).toBe("standalone");
    expect(uncertainDecorated[0].allocatorCoupled).toBe(false);
  });

  it("marks reallocation moves as shared-state-coupled when only shared-budget campaigns are in scope", () => {
    const recommendation = {
      id: "realloc-shared",
      level: "account",
      type: "budget_reallocation",
      strategyLayer: "Budget Moves",
      decisionState: "act",
      decisionFamily: "growth_unlock",
      doBucket: "do_now",
      priority: "high",
      confidence: "high",
      dataTrust: "high",
      integrityState: "ready",
      supportStrength: "strong",
      actionability: "ready_now",
      reversibility: "medium",
      title: "Reallocate budget",
      summary: "Shift budget between lanes",
      why: "Why",
      whyNow: "Why now",
      reasonCodes: [],
      confidenceExplanation: "Confident",
      confidenceDegradationReasons: [],
      recommendedAction: "Reallocate budget between campaigns",
      potentialContribution: { label: "High", impact: "high", summary: "High" },
      impactBand: "high",
      effortScore: "low",
      validationChecklist: [],
      blockers: [],
      rankScore: 90,
      rankExplanation: "High leverage",
      impactScore: 90,
      recommendationFingerprint: "realloc-shared-fp",
      evidence: [],
      timeframeContext: {
        coreVerdict: "stable",
        selectedRangeNote: "last 14d",
        historicalSupport: "stable",
      },
      affectedCampaignIds: ["shared-a", "shared-b"],
    } as unknown as ReturnType<typeof buildGoogleGrowthAdvisor>["recommendations"][number];

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "shared-a",
          campaignName: "Shared A",
          budgetExplicitlyShared: true,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/999",
          dailyBudget: 100,
          scaleState: "hold",
          wasteState: "waste",
        }),
        campaign({
          campaignId: "shared-b",
          campaignName: "Shared B",
          budgetExplicitlyShared: true,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/999",
          dailyBudget: 100,
          scaleState: "scale",
          wasteState: "healthy",
        }),
      ],
    });

    expect(decorated[0].executionMode).toBe("handoff");
    expect(decorated[0].mutateEligibilityReason).toContain("shared_state_allocator_coupled");
    expect(decorated[0].sharedStateGovernanceType).toBe("shared_budget");
    expect(decorated[0].sharedStateContaminationFlag).toBe(false);
    expect(decorated[0].portfolioContaminationSource).toBe("shared_budget_contamination");
    expect(decorated[0].coupledCampaignIds).toEqual(expect.arrayContaining(["shared-a", "shared-b"]));
  });

  it("allows a narrow shared-budget mutate for one safe PMax-governed pool", () => {
    const recommendation = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [campaign({ campaignId: "c-pmax-a", campaignName: "PMax A", channel: "PERFORMANCE_MAX" })],
      selectedSearchTerms: [searchTerm({ campaignId: "c-pmax-a", campaignName: "PMax A", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [],
    }).recommendations.find((entry) => entry.type === "pmax_scaling_fit")!;

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax-a",
          campaignName: "PMax A",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          dailyBudget: 150,
          budgetExplicitlyShared: true,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/2001",
        }),
        campaign({
          campaignId: "c-pmax-b",
          campaignName: "PMax B",
          channel: "PERFORMANCE_MAX",
          scaleState: "monitor",
          dailyBudget: 150,
          budgetExplicitlyShared: true,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/2001",
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax-a",
          campaignName: "PMax A",
          searchTerm: "buy carry on backpack",
          intentClass: "category_high_intent",
          intentNeedsReview: false,
        }),
      ],
      executionCalibration: {
        patterns: {
          "adjust_shared_budget|pmax_scaling_fit|category_high_intent|none|unknown|done_trusted|shared_budget": {
            success: 6,
            rollback: 0,
            degraded: 0,
            failure: 0,
          },
        },
      },
    });

    expect(decorated[0].executionMode).toBe("mutate_ready");
    expect(decorated[0].mutateActionType).toBe("adjust_shared_budget");
    expect(decorated[0].rollbackActionType).toBe("restore_shared_budget");
    expect(decorated[0].sharedBudgetAdjustmentPreview?.governedCampaigns).toHaveLength(2);
    expect(decorated[0].rollbackSafetyState).toBe("safe");
  });

  it("blocks shared-budget mutate when the governed pool is too large", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-pmax-1", campaignName: "PMax 1", channel: "PERFORMANCE_MAX" })],
        selectedSearchTerms: [searchTerm({ campaignId: "c-pmax-1", campaignName: "PMax 1", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [],
      }).recommendations.find((entry) => entry.type === "pmax_scaling_fit")!,
    };

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: Array.from({ length: 6 }, (_, index) =>
        campaign({
          campaignId: `c-pool-${index + 1}`,
          campaignName: `Pool ${index + 1}`,
          channel: "PERFORMANCE_MAX",
          scaleState: index === 0 ? "scale" : "monitor",
          dailyBudget: 120,
          budgetExplicitlyShared: true,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/3001",
        })
      ),
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pool-1",
          campaignName: "Pool 1",
          searchTerm: "buy carry on backpack",
          intentClass: "category_high_intent",
          intentNeedsReview: false,
        }),
      ],
      executionCalibration: {
        patterns: {
          "adjust_shared_budget|pmax_scaling_fit|category_high_intent|none|unknown|done_trusted|shared_budget": {
            success: 6,
            rollback: 0,
            degraded: 0,
            failure: 0,
          },
        },
      },
    });

    expect(decorated[0].executionMode).toBe("handoff");
    expect(decorated[0].mutateEligibilityReason).toContain("shared_budget_scope_too_large");
  });

  it("blocks shared-budget mutate when portfolio-coupled campaigns exist in the governed set", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-pmax-a", campaignName: "PMax A", channel: "PERFORMANCE_MAX" })],
        selectedSearchTerms: [searchTerm({ campaignId: "c-pmax-a", campaignName: "PMax A", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [],
      }).recommendations.find((entry) => entry.type === "pmax_scaling_fit")!,
    };

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax-a",
          campaignName: "PMax A",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          dailyBudget: 150,
          budgetExplicitlyShared: true,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/4001",
          portfolioBidStrategyResourceName: "customers/1234567890/biddingStrategies/77",
          portfolioBidStrategyType: "TARGET_ROAS",
        }),
        campaign({
          campaignId: "c-pmax-b",
          campaignName: "PMax B",
          channel: "PERFORMANCE_MAX",
          scaleState: "monitor",
          dailyBudget: 150,
          budgetExplicitlyShared: true,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/4001",
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax-a",
          campaignName: "PMax A",
          searchTerm: "buy carry on backpack",
          intentClass: "category_high_intent",
          intentNeedsReview: false,
        }),
      ],
      executionCalibration: {
        patterns: {
          "adjust_shared_budget|pmax_scaling_fit|category_high_intent|none|unknown|done_trusted|shared_budget_and_portfolio": {
            success: 6,
            rollback: 0,
            degraded: 0,
            failure: 0,
          },
        },
      },
    });

    expect(decorated[0].executionMode).toBe("handoff");
    expect(decorated[0].mutateEligibilityReason).toContain("shared_budget_portfolio_coupled");
    expect(decorated[0].portfolioGovernanceStatus).toBe("mixed_governance");
    expect(decorated[0].portfolioCouplingStrength).toBe("medium");
    expect(decorated[0].portfolioContaminationSource).toBe("mixed_allocator_contamination");
    expect(decorated[0].portfolioBlockedReason).toContain("shared budget surface also sits under portfolio governance");
  });

  it("blocks standalone budget mutate when the campaign is portfolio-governed", () => {
    const recommendation = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
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
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [],
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
    expect(decorated[0].sharedStateGovernanceType).toBe("portfolio_bid_strategy");
    expect(decorated[0].portfolioGovernanceStatus).toBe("dominant");
    expect(decorated[0].portfolioCouplingStrength).toBe("high");
    expect(decorated[0].portfolioBidStrategyStatus).toBe("learning");
    expect(decorated[0].portfolioAttributionWindowDays).toBe(21);
    expect(decorated[0].portfolioBlockedReason).toContain("governing portfolio strategy is unstable");
  });

  it("adds portfolio caution metadata for cleanup moves without blocking native cleanup mutate", () => {
    const recommendation = {
      id: "cleanup-portfolio-aware",
      level: "campaign",
      entityId: "c-search",
      entityName: "Search Growth",
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
      title: "Add negatives",
      summary: "Remove waste query",
      why: "Wasteful traffic exists",
      whyNow: "Budget is leaking",
      reasonCodes: [],
      confidenceExplanation: "Strong query signal",
      confidenceDegradationReasons: [],
      recommendedAction: "Add negative keyword for refund intent",
      potentialContribution: { label: "Protect spend", impact: "medium", summary: "Reduce waste" },
      impactBand: "medium",
      effortScore: "low",
      validationChecklist: ["Check waste term spend declines"],
      blockers: [],
      negativeQueries: ["refund policy"],
      rankScore: 80,
      rankExplanation: "Clear waste signal",
      impactScore: 70,
      recommendationFingerprint: "cleanup-portfolio-aware-fp",
      evidence: [],
      timeframeContext: {
        coreVerdict: "stable",
        selectedRangeNote: "last 14d",
        historicalSupport: "stable",
      },
      affectedCampaignIds: ["c-search"],
      executionMode: "mutate_ready",
      mutateActionType: "add_negative_keyword",
      mutatePayloadPreview: {
        customerId: "1234567890",
        campaignId: "c-search",
        terms: ["refund policy"],
      },
      canRollback: true,
      rollbackActionType: "remove_negative_keyword",
      rollbackPayloadPreview: {
        customerId: "1234567890",
        campaignId: "c-search",
        terms: ["refund policy"],
      },
    } as unknown as ReturnType<typeof buildGoogleGrowthAdvisor>["recommendations"][number];

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "c-search",
          campaignName: "Search Growth",
          channel: "SEARCH",
          budgetExplicitlyShared: false,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/9002",
          portfolioBidStrategyResourceName: "customers/1234567890/biddingStrategies/88",
          portfolioBidStrategyType: "TARGET_CPA",
          portfolioBidStrategyStatus: "ENABLED",
          portfolioTargetType: "tCPA",
          portfolioTargetValue: 42,
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-search",
          campaignName: "Search Growth",
          searchTerm: "refund policy",
          wasteFlag: true,
          negativeKeywordFlag: true,
          ownershipClass: "weak_commercial",
          spend: 40,
          revenue: 0,
          conversions: 0,
          roas: 0,
        }),
      ],
    });

    expect(decorated[0].executionMode).toBe("mutate_ready");
    expect(decorated[0].mutateActionType).toBe("add_negative_keyword");
    expect(decorated[0].portfolioGovernanceStatus).toBe("dominant");
    expect(decorated[0].portfolioCouplingStrength).toBe("high");
    expect(decorated[0].portfolioCautionReason).toContain("portfolio allocation can absorb or mask local performance changes");
    expect(decorated[0].portfolioUnlockGuidance).toContain("re-check eligibility after the next attribution window");
  });

  it("allows a controlled budget decrease when financial bleed or high-confidence stock pressure exists", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })],
        selectedSearchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "cheap backpack", spend: 120, conversions: 0, revenue: 0, roas: 0, intentClass: "price_sensitive" })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup({ weakState: "weak", coverageRisk: true })],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "cheap backpack", spend: 80, conversions: 0, revenue: 0, roas: 0, intentClass: "price_sensitive" })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "cheap backpack", spend: 90, conversions: 0, revenue: 0, roas: 0, intentClass: "price_sensitive" })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "cheap backpack", spend: 100, conversions: 0, revenue: 0, roas: 0, intentClass: "price_sensitive" })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "cheap backpack", spend: 110, conversions: 0, revenue: 0, roas: 0, intentClass: "price_sensitive" })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "cheap backpack", spend: 120, conversions: 0, revenue: 0, roas: 0, intentClass: "price_sensitive" })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "cheap backpack", spend: 130, conversions: 0, revenue: 0, roas: 0, intentClass: "price_sensitive" })], products: [product()] },
        ],
      }).recommendations.find((entry) => entry.type === "pmax_scaling_fit")!,
      commerceSignals: { marginBand: "medium", stockState: "out_of_stock", discountState: "full_price", heroSku: false },
      commerceConfidence: "high" as const,
    };

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          dailyBudget: 100,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/333",
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          searchTerm: "cheap backpack",
          spend: 120,
          conversions: 0,
          revenue: 0,
          roas: 0,
          intentClass: "price_sensitive",
          intentNeedsReview: false,
        }),
      ],
    });

    expect(decorated[0].executionMode).toBe("mutate_ready");
    expect(decorated[0].mutateActionType).toBe("adjust_campaign_budget");
    expect(decorated[0].budgetAdjustmentPreview?.deltaPercent).toBe(-10);
  });

  it("lowers mutate readiness for rollback-heavy execution patterns", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })],
        selectedSearchTerms: [
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 }),
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "customer service", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 }),
        ],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 50, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 60, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 100, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations.find((entry) => entry.type === "query_governance")!,
      dataTrust: "medium" as const,
      doBucket: "do_now" as const,
    };

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedSearchTerms: [
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", ownershipClass: "weak_commercial", intentClass: "support_or_post_purchase" }),
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "customer service", ownershipClass: "weak_commercial", intentClass: "support_or_post_purchase" }),
      ],
      executionCalibration: {
        patterns: {
          "add_negative_keyword|query_governance|support_or_post_purchase|none|none|done_trusted": {
            success: 0,
            rollback: 2,
            degraded: 0,
            failure: 1,
          },
        },
      },
    });

    expect(decorated[0].executionMode).toBe("handoff");
    expect(decorated[0].executionTrustBand).toBe("low");
  });

  it("restores trust and shrinks budget sizing based on execution history", () => {
    const recommendation = buildGoogleGrowthAdvisor({
      selectedLabel: "selected 14d",
      selectedCampaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", scaleState: "scale" })],
      selectedSearchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent", intentNeedsReview: false })],
      selectedProducts: [product()],
      selectedAssets: [asset()],
      selectedAssetGroups: [assetGroup()],
      selectedGeos: [geo()],
      selectedDevices: [device()],
      windows: [
        { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
      ],
    }).recommendations.find((entry) => entry.type === "pmax_scaling_fit")!;

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", scaleState: "scale", dailyBudget: 100, campaignBudgetResourceName: "customers/1234567890/campaignBudgets/555" })],
      selectedSearchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent", intentNeedsReview: false })],
      executionCalibration: {
        patterns: {
          "adjust_campaign_budget|pmax_scaling_fit|category_high_intent|none|unknown|done_trusted": {
            success: 4,
            rollback: 0,
            degraded: 0,
            failure: 2,
          },
        },
      },
    });

    expect(decorated[0].executionMode).toBe("mutate_ready");
    expect(decorated[0].executionTrustBand).toBe("medium");
    expect(decorated[0].budgetAdjustmentPreview?.deltaPercent).toBe(10);
  });

  it("keeps dependency readiness unverified during stabilization hold", () => {
    const dependency = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })],
        selectedSearchTerms: [
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 }),
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "customer service", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 }),
        ],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 50, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 60, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 100, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations.find((entry) => entry.type === "query_governance")!,
      completionMode: "full" as const,
      executedAt: new Date().toISOString(),
    };
    const budgetRec = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })],
        selectedSearchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent", intentNeedsReview: false })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent" })], products: [product()] },
        ],
      }).recommendations.find((entry) => entry.type === "pmax_scaling_fit")!,
      dependsOnRecommendationIds: [dependency.id],
    };

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [budgetRec, dependency],
      selectedCampaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX", scaleState: "scale", dailyBudget: 100, campaignBudgetResourceName: "customers/1234567890/campaignBudgets/777" })],
      selectedSearchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", searchTerm: "buy carry on backpack", intentClass: "category_high_intent", intentNeedsReview: false })],
    });

    const mutateBlocked = decorated.find((entry) => entry.type === "pmax_scaling_fit")!;
    expect(mutateBlocked.executionMode).toBe("handoff");
    expect(mutateBlocked.dependencyReadiness).toBe("done_unverified");
    expect(mutateBlocked.stabilizationHoldUntil).toBeTruthy();
  });

  it("marks narrow negative-keyword batches as eligible only for identical action groups", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })],
        selectedSearchTerms: [
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 }),
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "customer service", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 }),
        ],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 50, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 60, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 70, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 90, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 100, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations.find((entry) => entry.type === "query_governance")!,
      dataTrust: "medium" as const,
      doBucket: "do_now" as const,
    };
    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedSearchTerms: [
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", ownershipClass: "weak_commercial", intentClass: "support_or_post_purchase" }),
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "customer service", ownershipClass: "weak_commercial", intentClass: "support_or_post_purchase" }),
      ],
    });

    expect(decorated[0].batchEligible).toBe(true);
    expect(decorated[0].batchGroupKey).toContain("add_negative_keyword");
  });

  it("falls back to handoff when budget mutate trust history is insufficient", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [
          campaign({
            campaignId: "c-pmax",
            campaignName: "Travel Gear Performance Max",
            channel: "PERFORMANCE_MAX",
            scaleState: "scale",
            dailyBudget: 100,
            campaignBudgetResourceName: "customers/1234567890/campaignBudgets/444",
          }),
        ],
        selectedSearchTerms: [
          searchTerm({
            campaignId: "c-pmax",
            campaignName: "Travel Gear Performance Max",
            searchTerm: "buy carry on backpack",
            intentClass: "category_high_intent",
            intentNeedsReview: false,
          }),
        ],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [],
      }).recommendations.find((entry) => entry.type === "pmax_scaling_fit")!,
    };

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [
        campaign({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          channel: "PERFORMANCE_MAX",
          scaleState: "scale",
          dailyBudget: 100,
          campaignBudgetResourceName: "customers/1234567890/campaignBudgets/444",
        }),
      ],
      selectedSearchTerms: [
        searchTerm({
          campaignId: "c-pmax",
          campaignName: "Travel Gear Performance Max",
          searchTerm: "buy carry on backpack",
          intentClass: "category_high_intent",
          intentNeedsReview: false,
        }),
      ],
    });

    expect(decorated[0].executionMode).toBe("handoff");
    expect(decorated[0].executionTrustBand).toBe("insufficient_data");
    expect(decorated[0].executionTrustSource).toBe("insufficient_data_fallback");
  });

  it("marks pause-asset recommendations as batch-eligible under the same action pattern", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-pmax", campaignName: "Travel Gear Performance Max", channel: "PERFORMANCE_MAX" })],
        selectedSearchTerms: [searchTerm()],
        selectedProducts: [product()],
        selectedAssets: [
          asset({ assetId: "a-1", assetText: "Bad headline 1", assetName: "Bad headline 1", fieldType: "HEADLINE" as never }),
          asset({ assetId: "a-2", assetText: "Bad headline 2", assetName: "Bad headline 2", fieldType: "HEADLINE" as never }),
        ],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [],
      }).recommendations.find((entry) => entry.type === "creative_asset_deployment")!,
      replaceAssets: ["Bad headline 1", "Bad headline 2"],
    };

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedAssets: [
        asset({ assetId: "a-1", assetText: "Bad headline 1", assetName: "Bad headline 1", assetGroupId: "ag-1", fieldType: "HEADLINE" as never }),
        asset({ assetId: "a-2", assetText: "Bad headline 2", assetName: "Bad headline 2", assetGroupId: "ag-1", fieldType: "HEADLINE" as never }),
      ],
      executionCalibration: {
        patterns: {
          "pause_asset|creative_asset_deployment|asset_cleanup|none|unknown|done_trusted": {
            success: 4,
            rollback: 0,
            degraded: 0,
            failure: 0,
          },
        },
      },
    });

    expect(decorated[0].executionMode).toBe("mutate_ready");
    expect(decorated[0].mutateActionType).toBe("pause_asset");
    expect(decorated[0].batchEligible).toBe(true);
    expect(decorated[0].batchGroupKey).toContain("pause_asset");
  });

  it("allows geo-device adjustment to become budget-mutate-ready for a single exact campaign", () => {
    const recommendation = {
      ...buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })],
        selectedSearchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy desk organizer", intentClass: "category_high_intent" })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo({ geoName: "New York", roas: 5 })],
        selectedDevices: [device({ device: "Desktop", roas: 5 }), device({ device: "Mobile", roas: 2 })],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy desk organizer", intentClass: "category_high_intent" })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy desk organizer", intentClass: "category_high_intent" })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy desk organizer", intentClass: "category_high_intent" })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy desk organizer", intentClass: "category_high_intent" })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy desk organizer", intentClass: "category_high_intent" })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "buy desk organizer", intentClass: "category_high_intent" })], products: [product()] },
        ],
      }).recommendations.find((entry) => entry.type === "geo_device_adjustment")!,
      affectedCampaignIds: ["c-search"],
    };

    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: [recommendation],
      selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH", dailyBudget: 100, campaignBudgetResourceName: "customers/1234567890/campaignBudgets/888" })],
      executionCalibration: {
        patterns: {
          "adjust_campaign_budget|geo_device_adjustment|geo_device_skew|none|none|done_trusted": {
            success: 6,
            rollback: 0,
            degraded: 0,
            failure: 0,
          },
        },
      },
    });

    expect(decorated[0].executionMode).toBe("mutate_ready");
    expect(decorated[0].mutateActionType).toBe("adjust_campaign_budget");
  });

  it("turns off mutate readiness after rollback/failure feedback on the same recommendation", async () => {
    const businessId = `test-biz-${Date.now()}-policy-feedback`;
    const accountId = "test-account";
    const firstRun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: buildGoogleGrowthAdvisor({
        selectedLabel: "selected 7d",
        selectedCampaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })],
        selectedSearchTerms: [
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 }),
          searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "customer service", wasteFlag: true, negativeKeywordFlag: true, spend: 60, revenue: 0, conversions: 0, roas: 0 }),
        ],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-search", campaignName: "Generic Search", channel: "SEARCH" })], searchTerms: [searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy", wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations,
    });
    const recommendation = firstRun.find((entry) => entry.type === "query_governance")!;

    await updateAdvisorExecutionState({
      businessId,
      accountId,
      recommendationFingerprint: recommendation.recommendationFingerprint,
      executionStatus: "rolled_back",
      rollbackAvailable: false,
      rollbackExecutedAt: new Date().toISOString(),
    });

    const rerun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: [recommendation],
    });
    const decorated = decorateAdvisorRecommendationsForExecution({
      accountId: "123-456-7890",
      recommendations: rerun.map((entry) => ({ ...entry, dataTrust: "medium", doBucket: "do_now" })),
      selectedSearchTerms: [
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "refund policy" }),
        searchTerm({ campaignId: "c-search", campaignName: "Generic Search", searchTerm: "customer service" }),
      ],
    });

    expect(decorated[0].executionMode).toBe("handoff");
    expect(decorated[0].mutateEligibilityReason).toContain("rolled back");
  });

  it("persists native execution state and rollback availability", async () => {
    const businessId = `test-biz-${Date.now()}-execution`;
    const accountId = "test-account";
    const firstRun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: buildGoogleGrowthAdvisor({
        selectedLabel: "selected 7d",
        selectedCampaigns: [campaign()],
        selectedSearchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations,
    });

    await updateAdvisorExecutionState({
      businessId,
      accountId,
      recommendationFingerprint: firstRun[0].recommendationFingerprint,
      executionStatus: "applied",
      rollbackAvailable: true,
      executionMetadata: { mutateActionType: "add_negative_keyword" },
    });

    const rerun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: [firstRun[0]],
    });

    expect(rerun[0].executionStatus).toBe("applied");
    expect(rerun[0].rollbackAvailable).toBe(true);
    expect(rerun[0].executedAt).toBeTruthy();
  });

  it("treats partial grouped execution as lower-confidence outcome tracking", async () => {
    const businessId = `test-biz-${Date.now()}-partial`;
    const accountId = "test-account";
    const firstRun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: buildGoogleGrowthAdvisor({
        selectedLabel: "selected 14d",
        selectedCampaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search", channel: "SEARCH" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })],
        selectedSearchTerms: [
          searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 60, revenue: 120, conversions: 2, roas: 2 }),
          searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 40, revenue: 80, conversions: 1, roas: 2 }),
        ],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 50, conversions: 1, roas: 2.5 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 25, revenue: 50, conversions: 1, roas: 2 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 50, conversions: 1, roas: 2.5 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix table", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign({ campaignId: "c-brand", campaignName: "Grandmix Brand Search" }), campaign({ campaignId: "c-pmax", campaignName: "Grandmix PMax", channel: "PERFORMANCE_MAX" })], searchTerms: [searchTerm({ campaignId: "c-pmax", campaignName: "Grandmix PMax", searchTerm: "grandmix chairs", spend: 20, revenue: 40, conversions: 1, roas: 2 })], products: [product()] },
        ],
      }).recommendations,
    });
    const recommendation = firstRun.find((entry) => entry.type === "brand_leakage")!;

    await updateAdvisorMemoryAction({
      businessId,
      accountId,
      recommendationFingerprint: recommendation.recommendationFingerprint,
      action: "applied",
    });
    await updateAdvisorCompletionState({
      businessId,
      accountId,
      recommendationFingerprint: recommendation.recommendationFingerprint,
      completionMode: "partial",
      completedStepCount: 1,
      totalStepCount: 3,
      completedStepIds: ["review_overlap"],
      skippedStepIds: ["choose_lane_owner"],
      coreStepIds: ["review_overlap", "choose_lane_owner"],
    });

    const rerun = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: [recommendation],
    });

    expect(rerun[0].completionMode).toBe("partial");
    expect(rerun[0].executionStatus).toBe("partially_applied");
    expect(rerun[0].outcomeConfidence).toBe("low");
    expect(rerun[0].skippedStepIds).toContain("choose_lane_owner");
  });

  it("aggregates calibration metrics for execution outcomes and partial applies", async () => {
    const businessId = `test-biz-${Date.now()}-calibration`;
    const accountId = "test-account";
    const seeded = await annotateAdvisorMemory({
      businessId,
      accountId,
      recommendations: buildGoogleGrowthAdvisor({
        selectedLabel: "selected 7d",
        selectedCampaigns: [campaign()],
        selectedSearchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 80, revenue: 0, conversions: 0, roas: 0 })],
        selectedProducts: [product()],
        selectedAssets: [asset()],
        selectedAssetGroups: [assetGroup()],
        selectedGeos: [geo()],
        selectedDevices: [device()],
        windows: [
          { key: "last3", label: "last 3d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last7", label: "last 7d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last14", label: "last 14d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last30", label: "last 30d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "last90", label: "last 90d", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
          { key: "all_history", label: "all history", campaigns: [campaign()], searchTerms: [searchTerm({ wasteFlag: true, negativeKeywordFlag: true, spend: 40, revenue: 0, conversions: 0, roas: 0 })], products: [product()] },
        ],
      }).recommendations.slice(0, 2),
    });

    await updateAdvisorExecutionState({
      businessId,
      accountId,
      recommendationFingerprint: seeded[0].recommendationFingerprint,
      executionStatus: "applied",
      rollbackAvailable: true,
    });
    await updateAdvisorCompletionState({
      businessId,
      accountId,
      recommendationFingerprint: seeded[0].recommendationFingerprint,
      completionMode: "full",
      completedStepCount: 1,
      totalStepCount: 1,
    });
    await updateAdvisorExecutionState({
      businessId,
      accountId,
      recommendationFingerprint: seeded[0].recommendationFingerprint,
      executionStatus: "rolled_back",
      rollbackAvailable: false,
      rollbackExecutedAt: new Date().toISOString(),
    });

    await updateAdvisorExecutionState({
      businessId,
      accountId,
      recommendationFingerprint: seeded[1].recommendationFingerprint,
      executionStatus: "failed",
      executionError: "simulated failure",
    });
    await updateAdvisorCompletionState({
      businessId,
      accountId,
      recommendationFingerprint: seeded[1].recommendationFingerprint,
      completionMode: "partial",
      completedStepCount: 1,
      totalStepCount: 3,
    });

    const calibration = await getAdvisorExecutionCalibration({ businessId, accountId });
    expect(calibration.rollbackCount).toBeGreaterThanOrEqual(1);
    expect(calibration.partialCount).toBeGreaterThanOrEqual(1);
    expect(calibration.fullCount).toBeGreaterThanOrEqual(1);
    expect((calibration.executionStatuses.rolled_back ?? 0) + (calibration.executionStatuses.failed ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
