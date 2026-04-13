import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations", () => ({
  getIntegrationMetadata: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/provider-account-snapshots", () => ({
  readProviderAccountSnapshot: vi.fn(),
}));

vi.mock("@/lib/google-ads-gaql", () => ({
  getDateRangeForQuery: vi.fn(
    (range: string, customStart?: string | null, customEnd?: string | null) => ({
      startDate: customStart ?? "2026-04-01",
      endDate: customEnd ?? "2026-04-05",
      key: range,
      label: range,
    }),
  ),
}));

vi.mock("@/lib/provider-platform-date", () => ({
  getProviderPlatformCurrentDate: vi.fn().mockResolvedValue("2026-04-05"),
  getTodayIsoForTimeZoneServer: vi.fn(() => "2026-04-05"),
}));

vi.mock("@/lib/google-ads/warehouse", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-ads/warehouse")>(
    "@/lib/google-ads/warehouse",
  );
  return {
    ...actual,
    readGoogleAdsAggregatedRange: vi.fn(),
    readGoogleAdsDailyRange: vi.fn(),
    getGoogleAdsCoveredDates: vi.fn().mockResolvedValue([]),
    getGoogleAdsDailyCoverage: vi.fn(),
    getLatestGoogleAdsSyncHealth: vi.fn().mockResolvedValue({
      updated_at: "2026-04-06T00:00:00.000Z",
      last_error: null,
    }),
  };
});

vi.mock("@/lib/google-ads/search-intelligence-storage", () => ({
  normalizeGoogleAdsQueryText: vi.fn((value: string) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .trim()
      .replace(/\s+/g, " "),
  ),
  readGoogleAdsSearchQueryHotDailySupportRows: vi.fn(),
  readGoogleAdsSearchClusterDailyRows: vi.fn(),
  readGoogleAdsTopQueryWeeklyRows: vi.fn(),
}));

const integrations = await import("@/lib/integrations");
const assignments = await import("@/lib/provider-account-assignments");
const snapshots = await import("@/lib/provider-account-snapshots");
const warehouse = await import("@/lib/google-ads/warehouse");
const searchStorage = await import("@/lib/google-ads/search-intelligence-storage");
const serving = await import("@/lib/google-ads/serving");

function hotWindowStart(date: string, retentionDays: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - (retentionDays - 1));
  return value.toISOString().slice(0, 10);
}

describe("Google Ads search serving hot window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_google",
      business_id: "biz",
      provider: "google",
      status: "connected",
      provider_account_id: null,
      provider_account_name: null,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      scopes: null,
      error_message: null,
      metadata: {},
      connected_at: null,
      disconnected_at: null,
      created_at: "",
      updated_at: "",
    } as never);
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      id: "asg_google",
      business_id: "biz",
      provider: "google",
      account_ids: ["acc_1"],
      created_at: "",
      updated_at: "",
    } as never);
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "acc_1", timezone: "UTC" }],
      meta: {
        source: "snapshot",
      },
    } as never);
    vi.mocked(searchStorage.readGoogleAdsSearchQueryHotDailySupportRows).mockResolvedValue([
      {
        businessId: "biz",
        providerAccountId: "acc_1",
        date: "2026-04-04",
        accountTimezone: "UTC",
        accountCurrency: "USD",
        queryHash: "hash_buy_shoes",
        campaignId: "cmp_1",
        campaignName: "Brand Search",
        adGroupId: "ag_1",
        adGroupName: "Core",
        clusterKey: "buy-shoes",
        clusterLabel: "buy-shoes",
        themeKey: "category_high_intent",
        intentClass: "category_high_intent",
        ownershipClass: "non_brand",
        spend: 12,
        revenue: 36,
        conversions: 2,
        impressions: 120,
        clicks: 12,
        sourceSnapshotId: "snap_1",
        normalizedQuery: "buy shoes",
        displayQuery: "Buy Shoes",
      },
    ] as never);
    vi.mocked(searchStorage.readGoogleAdsSearchClusterDailyRows).mockResolvedValue([] as never);
    vi.mocked(searchStorage.readGoogleAdsTopQueryWeeklyRows).mockResolvedValue([] as never);
    vi.mocked(warehouse.readGoogleAdsAggregatedRange).mockImplementation(
      async ({ scope }) => {
        if (scope === "keyword_daily") {
          return [{ keywordText: "buy shoes" }] as never;
        }
        if (scope === "product_daily") {
          return [{ productTitle: "Travel Shoes" }] as never;
        }
        return [] as never;
      },
    );
  });

  it("serves search terms from the persisted hot source and clamps reads to the 120-day window", async () => {
    const report = await serving.getGoogleAdsSearchTermsReport({
      businessId: "biz",
      accountId: "acc_1",
      dateRange: "custom",
      customStart: "2025-11-01",
      customEnd: "2026-04-05",
    });

    expect(searchStorage.readGoogleAdsSearchQueryHotDailySupportRows).toHaveBeenCalledWith({
      businessId: "biz",
      providerAccountId: "acc_1",
      startDate: hotWindowStart("2026-04-05", 120),
      endDate: "2026-04-05",
    });
    expect(
      vi
        .mocked(warehouse.readGoogleAdsAggregatedRange)
        .mock.calls.some(([input]) => input.scope === "search_term_daily"),
    ).toBe(false);
    expect(report.rows).toEqual([
      expect.objectContaining({
        searchTerm: "Buy Shoes",
        source: "search_query_hot_daily",
        isKeyword: true,
        recommendation: "Promote in headlines",
      }),
    ]);
    expect(report.meta.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("120 days"),
      ]),
    );
  });

  it("builds search-intelligence summaries without reading warehouse search_term_daily history", async () => {
    const report = await serving.getGoogleAdsSearchIntelligenceReport({
      businessId: "biz",
      accountId: "acc_1",
      dateRange: "custom",
      customStart: "2026-04-01",
      customEnd: "2026-04-05",
    });

    expect(report.summary).toEqual(
      expect.objectContaining({
        wastefulSpend: 0,
        keywordOpportunityCount: 0,
        negativeKeywordCount: 0,
      }),
    );
    expect(report.rows[0]).toEqual(
      expect.objectContaining({
        searchTerm: "Buy Shoes",
        recommendation: "Promote in headlines",
      }),
    );
  });

  it("falls back to additive weekly query intelligence when the request is outside the raw hot window", async () => {
    vi.mocked(searchStorage.readGoogleAdsSearchQueryHotDailySupportRows).mockResolvedValue(
      [] as never
    );
    vi.mocked(searchStorage.readGoogleAdsTopQueryWeeklyRows).mockResolvedValue([
      {
        businessId: "biz",
        providerAccountId: "acc_1",
        weekStart: "2025-10-27",
        weekEnd: "2025-11-02",
        queryHash: "hash_hiking_backpack",
        queryCountDays: 5,
        spend: 48,
        revenue: 144,
        conversions: 4,
        impressions: 0,
        clicks: 16,
        normalizedQuery: "hiking backpack",
        displayQuery: "Hiking Backpack",
      },
    ] as never);
    vi.mocked(searchStorage.readGoogleAdsSearchClusterDailyRows).mockResolvedValue([
      {
        businessId: "biz",
        providerAccountId: "acc_1",
        date: "2025-11-01",
        clusterKey: "hiking-backpack",
        clusterLabel: "Hiking backpack demand",
        themeKey: "category_high_intent",
        dominantIntentClass: "category_high_intent",
        dominantOwnershipClass: "non_brand",
        uniqueQueryCount: 3,
        spend: 48,
        revenue: 144,
        conversions: 4,
        impressions: 0,
        clicks: 16,
      },
    ] as never);

    const report = await serving.getGoogleAdsSearchIntelligenceReport({
      businessId: "biz",
      accountId: "acc_1",
      dateRange: "custom",
      customStart: "2025-11-01",
      customEnd: "2025-11-05",
    });

    expect(report.rows).toEqual([
      expect.objectContaining({
        searchTerm: "Hiking Backpack",
        source: "top_query_weekly",
        matchSource: "AGGREGATE",
        recommendation: "Add as exact keyword",
      }),
    ]);
    expect(report.insights).toEqual(
      expect.objectContaining({
        semanticClusters: expect.arrayContaining([
          expect.objectContaining({
            cluster: "Hiking backpack demand",
            spend: 48,
            conversions: 4,
          }),
        ]),
      })
    );
    expect(report.meta.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("120 days"),
        expect.stringContaining("Long-range search intelligence is served from additive query and cluster aggregates"),
      ])
    );
    expect(
      vi
        .mocked(warehouse.readGoogleAdsAggregatedRange)
        .mock.calls.some(([input]) => input.scope === "search_term_daily"),
    ).toBe(false);
  });
});
