import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations", () => ({
  getIntegrationMetadata: vi.fn(async () => ({ status: "connected" })),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(async () => ({
    account_ids: ["acc_1"],
  })),
}));

vi.mock("@/lib/provider-account-snapshots", () => ({
  readProviderAccountSnapshot: vi.fn(),
}));

vi.mock("@/lib/business-cost-model", () => ({
  getBusinessCostModel: vi.fn(async () => null),
}));

vi.mock("@/lib/google-ads-gaql", () => ({
  getDateRangeForQuery: vi.fn(
    (_dateRange: string, customStart?: string | null, customEnd?: string | null) => ({
      startDate: customStart ?? "2026-04-05",
      endDate: customEnd ?? "2026-04-17",
    }),
  ),
}));

vi.mock("@/lib/google-ads/decision-snapshot", () => ({
  buildGoogleAdsDecisionSnapshotMetadata: vi.fn(() => ({
    analysisMode: "debug_custom",
    asOfDate: "2026-04-17",
    selectedWindowKey: "custom",
  })),
  buildGoogleAdsDecisionSummaryTotals: vi.fn(() => null),
  normalizeGoogleAdsDecisionSnapshotPayload: vi.fn(({ advisorPayload }) => advisorPayload),
}));

vi.mock("@/lib/google-ads/reporting", () => ({
  getGoogleAdsCampaignsReport: vi.fn(),
  getGoogleAdsOverviewReport: vi.fn(),
  classifySearchAction: vi.fn(() => "Monitor"),
}));

vi.mock("@/lib/google-ads/growth-advisor", () => ({
  buildGoogleGrowthAdvisor: vi.fn(() => ({
    summary: {
      headline: "headline",
      operatorNote: "note",
      demandMap: "map",
      topPriority: "priority",
      totalRecommendations: 1,
      actRecommendationCount: 1,
      accountState: "scaling_ready",
      accountOperatingMode: "mode",
      topConstraint: "constraint",
      topGrowthLever: "lever",
      recommendedFocusToday: "focus",
      watchouts: [],
      dataTrustSummary: "trust",
      campaignRoles: [],
    },
    recommendations: [
      {
        id: "rec_1",
        title: "Recommendation",
        recommendedAction: "Act",
        doBucket: "do_now",
        decisionState: "act",
        integrityState: "ready",
      },
    ],
    sections: [
      {
        id: "section_1",
        title: "Section",
        recommendations: [{ id: "rec_1" }],
      },
    ],
    clusters: [],
    metadata: {
      decisionSummaryTotals: null,
      selectedRangeTotals: null,
      selectedRangeContext: null,
      aggregateIntelligence: null,
    },
  })),
}));

vi.mock("@/lib/google-ads/advisor-handoff", () => ({
  decorateAdvisorRecommendationsForExecution: vi.fn(({ recommendations }) => recommendations),
}));

vi.mock("@/lib/google-ads/advisor-memory", () => ({
  annotateAdvisorMemory: vi.fn(async ({ recommendations }) => recommendations),
  getAdvisorExecutionCalibration: vi.fn(async () => null),
}));

vi.mock("@/lib/google-ads/action-clusters", () => ({
  buildActionClusters: vi.fn(() => []),
}));

vi.mock("@/lib/google-ads/advisor-aggregate-intelligence", () => ({
  summarizeGoogleAdsAdvisorAggregateIntelligence: vi.fn(
    ({ queryWeeklyRows = [], clusterDailyRows = [], supportWindowStart, supportWindowEnd }) => ({
      queryWeeklySupport: queryWeeklyRows.map((row: any) => ({
        normalizedQuery: row.normalizedQuery,
        displayQuery: row.displayQuery,
        weeksPresent: 1,
        totalSpend: row.spend,
        totalRevenue: row.revenue,
        totalConversions: row.conversions,
        totalClicks: row.clicks,
        lastWeekEnd: row.weekEnd,
      })),
      clusterDailySupport: clusterDailyRows.map((row: any) => ({
        clusterKey: row.clusterKey,
        clusterLabel: row.clusterLabel,
        themeKey: row.themeKey ?? null,
        dominantIntentClass: row.dominantIntentClass ?? null,
        dominantOwnershipClass: row.dominantOwnershipClass ?? null,
        daysPresent: 1,
        totalUniqueQueries: row.uniqueQueryCount,
        totalSpend: row.spend,
        totalRevenue: row.revenue,
        totalConversions: row.conversions,
        totalClicks: row.clicks,
        lastSeenDate: row.date,
      })),
      metadata: {
        topQueryWeeklyAvailable: queryWeeklyRows.length > 0,
        clusterDailyAvailable: clusterDailyRows.length > 0,
        queryWeeklyRows: queryWeeklyRows.length,
        clusterDailyRows: clusterDailyRows.length,
        supportWindowStart,
        supportWindowEnd,
        note: "mocked",
      },
    }),
  ),
  loadGoogleAdsAdvisorAggregateIntelligence: vi.fn(async () => ({
    queryWeeklySupport: [],
    clusterDailySupport: [],
    metadata: {
      topQueryWeeklyAvailable: false,
      clusterDailyAvailable: false,
      queryWeeklyRows: 0,
      clusterDailyRows: 0,
      supportWindowStart: "2026-01-24",
      supportWindowEnd: "2026-04-17",
      note: "fallback",
    },
  })),
}));

vi.mock("@/lib/google-ads/warehouse", () => ({
  createGoogleAdsWarehouseFreshness: vi.fn((input: Record<string, unknown> = {}) => ({
    dataState: input.dataState ?? "ready",
    lastSyncedAt: input.lastSyncedAt ?? null,
    liveRefreshedAt: input.liveRefreshedAt ?? null,
    isPartial: input.isPartial ?? false,
    missingWindows: input.missingWindows ?? [],
    warnings: input.warnings ?? [],
  })),
  readGoogleAdsAggregatedRange: vi.fn(async ({ scope }: { scope: string }) => {
    if (scope === "asset_daily") return [{ id: "asset_1" }];
    if (scope === "asset_group_daily") return [{ id: "asset_group_1" }];
    if (scope === "geo_daily") return [{ id: "geo_1" }];
    if (scope === "device_daily") return [{ id: "device_1" }];
    return [];
  }),
  readGoogleAdsDailyRange: vi.fn(async ({ scope }: { scope: string }) => {
    if (scope === "campaign_daily") {
      return [
        {
          date: "2026-04-10",
          updatedAt: "2026-04-17T12:00:00Z",
          spend: 10,
          revenue: 30,
          conversions: 3,
          clicks: 12,
          impressions: 120,
          payloadJson: {
            id: "cmp_1",
            name: "Campaign 1",
            campaignId: "cmp_1",
            campaignName: "Campaign 1",
            status: "enabled",
            channel: "search",
            classification: "scale",
          },
        },
      ];
    }
    if (scope === "keyword_daily") {
      return [
        {
          date: "2026-04-10",
          updatedAt: "2026-04-17T12:00:00Z",
          spend: 5,
          revenue: 20,
          conversions: 2,
          clicks: 8,
          impressions: 80,
          payloadJson: {
            id: "kw_1",
            name: "keyword",
            keywordText: "brand product",
            keyword: "brand product",
            status: "enabled",
            classification: "keyword",
          },
        },
      ];
    }
    if (scope === "product_daily") {
      return [
        {
          date: "2026-04-10",
          updatedAt: "2026-04-17T12:00:00Z",
          spend: 7,
          revenue: 28,
          conversions: 2,
          clicks: 6,
          impressions: 60,
          payloadJson: {
            id: "prod_1",
            name: "Product 1",
            productTitle: "Product 1",
            title: "Product 1",
            status: "enabled",
            classification: "stable_product",
            productItemId: "item_1",
            inventory: 9,
          },
        },
      ];
    }
    return [];
  }),
  getGoogleAdsCoveredDates: vi.fn(async () => ["2026-04-10"]),
  getGoogleAdsDailyCoverage: vi.fn(async () => ({
    latest_updated_at: "2026-04-17T12:00:00Z",
  })),
  getLatestGoogleAdsSyncHealth: vi.fn(async () => null),
}));

vi.mock("@/lib/overview-summary-store", () => ({
  evaluateOverviewSummaryProjectionValidity: vi.fn(),
  readOverviewSummaryRange: vi.fn(),
}));

vi.mock("@/lib/google-ads/search-intelligence-storage", () => ({
  normalizeGoogleAdsQueryText: vi.fn((value: string) => value.trim().toLowerCase()),
  readGoogleAdsSearchQueryHotDailySupportRows: vi.fn(async () => [
    {
      date: "2026-04-10",
      providerAccountId: "acc_1",
      campaignId: "cmp_1",
      campaignName: "Campaign 1",
      adGroupId: "adg_1",
      adGroupName: "Ad Group 1",
      normalizedQuery: "brand product",
      displayQuery: "Brand Product",
      queryHash: "hash_1",
      clusterKey: "brand-product",
      clusterLabel: "Brand Product",
      intentClass: "brand",
      ownershipClass: "owned",
      spend: 5,
      revenue: 20,
      conversions: 2,
      impressions: 50,
      clicks: 10,
      sourceSnapshotId: "snap_1",
    },
  ]),
  readGoogleAdsTopQueryWeeklyRows: vi.fn(async () => [
    {
      normalizedQuery: "brand product",
      displayQuery: "Brand Product",
      queryHash: "hash_1",
      weekStart: "2026-04-07",
      weekEnd: "2026-04-13",
      spend: 5,
      revenue: 20,
      conversions: 2,
      clicks: 10,
    },
  ]),
  readGoogleAdsSearchClusterDailyRows: vi.fn(async () => [
    {
      date: "2026-04-10",
      clusterKey: "brand-product",
      clusterLabel: "Brand Product",
      themeKey: "brand",
      dominantIntentClass: "brand",
      dominantOwnershipClass: "owned",
      uniqueQueryCount: 1,
      spend: 5,
      revenue: 20,
      conversions: 2,
      clicks: 10,
    },
  ]),
}));

vi.mock("@/lib/provider-platform-date", () => ({
  getProviderPlatformCurrentDate: vi.fn(async () => "2026-04-17"),
  getTodayIsoForTimeZoneServer: vi.fn(async () => "2026-04-17"),
}));

vi.mock("@/lib/runtime-logging", () => ({
  logRuntimeDebug: vi.fn(),
}));

const warehouse = await import("@/lib/google-ads/warehouse");
const aggregateIntelligence = await import("@/lib/google-ads/advisor-aggregate-intelligence");
const searchStorage = await import("@/lib/google-ads/search-intelligence-storage");
const runtimeLogging = await import("@/lib/runtime-logging");
const { getGoogleAdsAdvisorReport } = await import("@/lib/google-ads/serving");

describe("google ads advisor read path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads heavy support surfaces once and emits advisor phase telemetry", async () => {
    const payload = await getGoogleAdsAdvisorReport({
      businessId: "biz_1",
      accountId: "all",
      dateRange: "custom",
      customStart: "2026-04-05",
      customEnd: "2026-04-17",
    });

    expect(payload.summary.headline).toBe("Recommendation");
    expect(warehouse.readGoogleAdsDailyRange).toHaveBeenCalledTimes(3);
    expect(warehouse.readGoogleAdsDailyRange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ scope: "campaign_daily" }),
    );
    expect(warehouse.readGoogleAdsDailyRange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ scope: "keyword_daily" }),
    );
    expect(warehouse.readGoogleAdsDailyRange).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ scope: "product_daily" }),
    );

    expect(searchStorage.readGoogleAdsSearchQueryHotDailySupportRows).toHaveBeenCalledTimes(1);
    expect(searchStorage.readGoogleAdsTopQueryWeeklyRows).toHaveBeenCalledTimes(1);
    expect(searchStorage.readGoogleAdsSearchClusterDailyRows).toHaveBeenCalledTimes(1);
    expect(aggregateIntelligence.loadGoogleAdsAdvisorAggregateIntelligence).not.toHaveBeenCalled();

    const aggregatedScopes = vi
      .mocked(warehouse.readGoogleAdsAggregatedRange)
      .mock.calls.map(([input]) => input.scope)
      .sort();
    expect(aggregatedScopes).toEqual([
      "asset_daily",
      "asset_group_daily",
      "device_daily",
      "geo_daily",
    ]);

    const phaseLogs = vi
      .mocked(runtimeLogging.logRuntimeDebug)
      .mock.calls.filter(([scope]) => scope === "google-ads-advisor")
      .map(([, event]) => event);
    expect(phaseLogs).toEqual([
      "advisor.support_bundle_read",
      "advisor.selected_context_reads",
      "advisor.window_slicing.index_build",
      "advisor.window_slicing.selected_materialization",
      "advisor.window_slicing.campaign_support",
      "advisor.window_slicing.product_support",
      "advisor.window_slicing.search_support",
      "advisor.window_slicing",
      "advisor.finalize_payload",
    ]);
    expect(runtimeLogging.logRuntimeDebug).toHaveBeenCalledWith(
      "google-ads-advisor",
      "advisor.support_bundle_read",
      expect.objectContaining({
        durationMs: expect.any(Number),
        campaignDailyRows: 1,
        keywordDailyRows: 1,
        productDailyRows: 1,
      }),
    );
    expect(runtimeLogging.logRuntimeDebug).toHaveBeenCalledWith(
      "google-ads-advisor",
      "advisor.window_slicing.product_support",
      expect.objectContaining({
        durationMs: expect.any(Number),
        windowCount: 6,
        assignedProductRows: expect.any(Number),
        uniqueEntityCount: expect.any(Number),
      }),
    );
    expect(runtimeLogging.logRuntimeDebug).toHaveBeenCalledWith(
      "google-ads-advisor",
      "advisor.window_slicing",
      expect.objectContaining({
        durationMs: expect.any(Number),
        windowCount: 7,
        assignedCampaignRows: expect.any(Number),
        assignedKeywordRows: expect.any(Number),
        assignedProductRows: expect.any(Number),
        windowRowCounts: expect.objectContaining({
          selected: expect.objectContaining({
            campaignDailyRows: 1,
            keywordDailyRows: 1,
            productDailyRows: 1,
          }),
          baseline_84d: expect.objectContaining({
            campaignDailyRows: 1,
            keywordDailyRows: 1,
            productDailyRows: 1,
          }),
        }),
      }),
    );
  });
});
