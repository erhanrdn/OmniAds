import { describe, expect, it } from "vitest";
import type {
  AssetGroupPerformanceRow,
  AssetPerformanceRow,
  CampaignPerformanceRow,
  DevicePerformanceRow,
  GeoPerformanceRow,
  ProductPerformanceRow,
  SearchTermPerformanceRow,
} from "@/lib/google-ads/intelligence-model";
import { buildGoogleGrowthAdvisor } from "@/lib/google-ads/growth-advisor";

function campaign(overrides: Partial<CampaignPerformanceRow> = {}): CampaignPerformanceRow {
  return {
    campaignId: "c-1",
    campaignName: "Brand Search",
    status: "ENABLED",
    channel: "SEARCH",
    servingStatus: "SERVING",
    dailyBudget: 100,
    budgetDeliveryMethod: "STANDARD",
    budgetExplicitlyShared: false,
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
  });
});
