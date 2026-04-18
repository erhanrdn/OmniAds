import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    (_dateRange: string, customStart?: string | null, customEnd?: string | null) => ({
      startDate: customStart ?? "2026-03-01",
      endDate: customEnd ?? "2026-03-31",
    }),
  ),
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
  readGoogleAdsAggregatedRange: vi.fn(),
  readGoogleAdsDailyRange: vi.fn(),
  getGoogleAdsCoveredDates: vi.fn(),
  getGoogleAdsDailyCoverage: vi.fn(),
  getLatestGoogleAdsSyncHealth: vi.fn(),
}));

vi.mock("@/lib/overview-summary-store", () => ({
  evaluateOverviewSummaryProjectionValidity: vi.fn(),
  readOverviewSummaryRange: vi.fn(),
}));

vi.mock("@/lib/google-ads/reporting", () => ({
  getGoogleAdsCampaignsReport: vi.fn(),
  getGoogleAdsOverviewReport: vi.fn(),
}));

const integrations = await import("@/lib/integrations");
const assignments = await import("@/lib/provider-account-assignments");
const snapshots = await import("@/lib/provider-account-snapshots");
const warehouse = await import("@/lib/google-ads/warehouse");
const overviewStore = await import("@/lib/overview-summary-store");
const liveReporting = await import("@/lib/google-ads/reporting");
const {
  getGoogleAdsCampaignsReport,
  getGoogleCanonicalOverviewSummary,
  getGoogleCanonicalOverviewTrends,
  getGoogleAdsOverviewReport,
  getGoogleAdsProductsReport,
} = await import("@/lib/google-ads/serving");

describe("google canonical overview helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00Z"));
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
    } as never);
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      account_ids: ["acc_1"],
    } as never);
    vi.mocked(warehouse.getGoogleAdsCoveredDates).mockResolvedValue([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ] as never);
    vi.mocked(warehouse.getGoogleAdsDailyCoverage).mockResolvedValue({
      latest_updated_at: "2026-03-03T12:00:00Z",
    } as never);
    vi.mocked(warehouse.getLatestGoogleAdsSyncHealth).mockResolvedValue(null as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses account_daily as the canonical KPI truth grain", async () => {
    vi.mocked(warehouse.readGoogleAdsAggregatedRange).mockImplementation(async (input) => {
      if (input.scope === "campaign_daily") {
        return [
          {
            spend: 100,
            revenue: 250,
            conversions: 5,
            clicks: 40,
            impressions: 1000,
          },
        ] as never;
      }
      return [
        {
          spend: 100,
          revenue: 250,
          conversions: 5,
          clicks: 40,
          impressions: 1000,
        },
      ] as never;
    });

    const result = await getGoogleCanonicalOverviewSummary({
      businessId: "biz",
      dateRange: "custom",
      customStart: "2026-03-01",
      customEnd: "2026-03-03",
      compareMode: "none",
    });

    expect(warehouse.readGoogleAdsAggregatedRange).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "account_daily",
      }),
    );
    expect(result.summary.readSource).toBe("warehouse_account_aggregate");
    expect(result.meta.readSource).toBe("warehouse_account_aggregate");
    expect(result.kpis).toEqual(
      expect.objectContaining({
        spend: 100,
        revenue: 250,
        conversions: 5,
        roas: 2.5,
      }),
    );
  });

  it("uses live overlay summary helpers for the provider current day", async () => {
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "acc_1", timezone: "UTC" }],
      meta: {} as never,
    } as never);
    vi.mocked(liveReporting.getGoogleAdsOverviewReport).mockResolvedValue({
      kpis: {
        spend: 14,
        revenue: 28,
        conversions: 2,
        roas: 2,
        cpa: 7,
        cpc: 1.4,
        ctr: 4,
        impressions: 100,
        clicks: 10,
        convRate: 20,
      },
      kpiDeltas: undefined,
      topCampaigns: [],
      insights: [],
      summary: { topCampaignCount: 1 },
      meta: {
        partial: false,
        warnings: [],
        failed_queries: [],
        unavailable_metrics: [],
        query_names: ["customer_summary"],
        row_counts: { customer_summary: 1 },
        report_families: {},
      },
    } as never);

    const result = await getGoogleCanonicalOverviewSummary({
      businessId: "biz",
      dateRange: "custom",
      customStart: "2026-04-07",
      customEnd: "2026-04-07",
      compareMode: "none",
    });

    expect(liveReporting.getGoogleAdsOverviewReport).toHaveBeenCalled();
    expect(result.summary.readSource).toBe("live_overlay_current_day");
    expect(result.summary.overlayApplied).toBe(true);
    expect(result.summary.liveSegmentStartDate).toBe("2026-04-07");
    expect(result.kpis).toEqual(
      expect.objectContaining({
        spend: 14,
        revenue: 28,
        conversions: 2,
      }),
    );
  });

  it("uses live overlay campaign helpers for the provider current day", async () => {
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "acc_1", timezone: "UTC" }],
      meta: {} as never,
    } as never);
    vi.mocked(liveReporting.getGoogleAdsCampaignsReport).mockResolvedValue({
      rows: [{ id: "cmp_1", name: "Campaign 1", spend: 12 }],
      summary: { totalSpend: 12, totalRevenue: 24, accountAvgRoas: 2 },
      meta: {
        partial: false,
        warnings: [],
        failed_queries: [],
        unavailable_metrics: [],
        query_names: ["campaign_core_basic"],
        row_counts: { campaign_core_basic: 1 },
        report_families: {},
      },
    } as never);

    const result = await getGoogleAdsCampaignsReport({
      businessId: "biz",
      dateRange: "custom",
      customStart: "2026-04-07",
      customEnd: "2026-04-07",
      compareMode: "none",
    });

    expect(liveReporting.getGoogleAdsCampaignsReport).toHaveBeenCalled();
    expect(result.summary).toEqual(
      expect.objectContaining({
        readSource: "live_overlay_current_day",
        overlayApplied: true,
        liveSegmentStartDate: "2026-04-07",
      }),
    );
    expect(result.rows).toEqual([{ id: "cmp_1", name: "Campaign 1", spend: 12 }]);
  });

  it("falls back to campaign_daily when account_daily materially underreports", async () => {
    vi.mocked(warehouse.readGoogleAdsAggregatedRange).mockImplementation(async (input) => {
      if (input.scope === "campaign_daily") {
        return [
          {
            spend: 2200,
            revenue: 4800,
            conversions: 20,
            clicks: 2000,
            impressions: 180000,
          },
        ] as never;
      }
      return [
        {
          spend: 2.5,
          revenue: 0,
          conversions: 0,
          clicks: 12,
          impressions: 869,
        },
      ] as never;
    });

    const result = await getGoogleCanonicalOverviewSummary({
      businessId: "biz",
      dateRange: "custom",
      customStart: "2026-03-01",
      customEnd: "2026-03-03",
      compareMode: "none",
    });

    expect(result.summary.readSource).toBe("warehouse_campaign_aggregate_fallback");
    expect(result.meta.readSource).toBe("warehouse_campaign_aggregate_fallback");
    expect(result.kpis).toEqual(
      expect.objectContaining({
        spend: 2200,
        revenue: 4800,
        conversions: 20,
      }),
    );
  });

  it("never falls back to projection for mutable windows", async () => {
    vi.mocked(warehouse.readGoogleAdsDailyRange).mockRejectedValue(new Error("timeout"));
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "acc_1", timezone: "UTC" }],
      meta: {} as never,
    } as never);

    const result = await getGoogleCanonicalOverviewTrends({
      businessId: "biz",
      startDate: "2026-04-07",
      endDate: "2026-04-07",
    });

    expect(overviewStore.readOverviewSummaryRange).not.toHaveBeenCalled();
    expect(result.meta.readSource).toBe("provider_truth_unavailable");
    expect(result.meta.fallbackReason).toBe("mutable_window");
    expect(result.meta.degraded).toBe(true);
    expect(result.points).toEqual([]);
  });

  it("treats provider-account current day as mutable even before UTC day rollover", async () => {
    vi.setSystemTime(new Date("2026-04-07T12:00:00Z"));
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "acc_1", timezone: "Pacific/Kiritimati" }],
      meta: {} as never,
    } as never);
    vi.mocked(warehouse.readGoogleAdsDailyRange).mockRejectedValue(new Error("timeout"));

    const result = await getGoogleCanonicalOverviewTrends({
      businessId: "biz",
      startDate: "2026-04-08",
      endDate: "2026-04-08",
    });

    expect(overviewStore.readOverviewSummaryRange).not.toHaveBeenCalled();
    expect(result.meta.readSource).toBe("provider_truth_unavailable");
    expect(result.meta.fallbackReason).toBe("mutable_window");
  });

  it("allows projection fallback only after provider failure on historical verified windows", async () => {
    vi.mocked(warehouse.readGoogleAdsDailyRange).mockRejectedValue(new Error("timeout"));
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "acc_1", timezone: "UTC" }],
      meta: {} as never,
    } as never);
    vi.mocked(overviewStore.readOverviewSummaryRange).mockResolvedValue({
      hydrated: true,
      manifest: {
        rowCount: 3,
        expectedRowCount: 3,
        coverageComplete: true,
        maxSourceUpdatedAt: "2026-03-03T12:00:00Z",
        truthState: "finalized",
        projectionVersion: 1,
        invalidationReason: null,
        hydratedAt: "2026-03-04T00:00:00Z",
      },
      rows: [
        {
          businessId: "biz",
          provider: "google",
          providerAccountId: "acc_1",
          date: "2026-03-01",
          spend: 10,
          revenue: 20,
          purchases: 1,
          impressions: 100,
          clicks: 10,
          sourceUpdatedAt: "2026-03-03T12:00:00Z",
          updatedAt: "2026-03-03T12:00:00Z",
        },
        {
          businessId: "biz",
          provider: "google",
          providerAccountId: "acc_1",
          date: "2026-03-02",
          spend: 15,
          revenue: 30,
          purchases: 2,
          impressions: 150,
          clicks: 15,
          sourceUpdatedAt: "2026-03-03T12:00:00Z",
          updatedAt: "2026-03-03T12:00:00Z",
        },
        {
          businessId: "biz",
          provider: "google",
          providerAccountId: "acc_1",
          date: "2026-03-03",
          spend: 5,
          revenue: 10,
          purchases: 1,
          impressions: 50,
          clicks: 5,
          sourceUpdatedAt: "2026-03-03T12:00:00Z",
          updatedAt: "2026-03-03T12:00:00Z",
        },
      ],
    } as never);
    vi.mocked(overviewStore.evaluateOverviewSummaryProjectionValidity).mockReturnValue({
      valid: true,
      reason: "valid",
    } as never);

    const result = await getGoogleCanonicalOverviewTrends({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-03",
    });

    expect(overviewStore.readOverviewSummaryRange).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        provider: "google",
        startDate: "2026-03-01",
        endDate: "2026-03-03",
      }),
    );
    expect(result.meta.readSource).toBe("projection_fallback");
    expect(result.meta.fallbackReason).toBe("provider_truth_operational_failure");
    expect(result.points).toEqual([
      expect.objectContaining({ date: "2026-03-01", spend: 10, revenue: 20, conversions: 1 }),
      expect.objectContaining({ date: "2026-03-02", spend: 15, revenue: 30, conversions: 2 }),
      expect.objectContaining({ date: "2026-03-03", spend: 5, revenue: 10, conversions: 1 }),
    ]);
  });

  it("falls back to campaign_daily trends when account_daily materially underreports", async () => {
    vi.mocked(warehouse.readGoogleAdsDailyRange).mockImplementation(async (input) => {
      if (input.scope === "campaign_daily") {
        return [
          {
            businessId: "biz",
            providerAccountId: "acc_1",
            date: "2026-03-01",
            entityKey: "c1",
            spend: 100,
            revenue: 200,
            conversions: 2,
            impressions: 1000,
            clicks: 100,
            updatedAt: "2026-03-03T12:00:00Z",
          },
          {
            businessId: "biz",
            providerAccountId: "acc_1",
            date: "2026-03-02",
            entityKey: "c2",
            spend: 120,
            revenue: 240,
            conversions: 3,
            impressions: 1100,
            clicks: 110,
            updatedAt: "2026-03-03T12:00:00Z",
          },
        ] as never;
      }
      return [
        {
          businessId: "biz",
          providerAccountId: "acc_1",
          date: "2026-03-01",
          entityKey: "acc_1",
          spend: 2,
          revenue: 0,
          conversions: 0,
          impressions: 10,
          clicks: 1,
          updatedAt: "2026-03-03T12:00:00Z",
        },
        {
          businessId: "biz",
          providerAccountId: "acc_1",
          date: "2026-03-02",
          entityKey: "acc_1",
          spend: 0,
          revenue: 0,
          conversions: 0,
          impressions: 0,
          clicks: 0,
          updatedAt: "2026-03-03T12:00:00Z",
        },
      ] as never;
    });

    const result = await getGoogleCanonicalOverviewTrends({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
    });

    expect(result.meta.readSource).toBe("warehouse_campaign_daily_fallback");
    expect(result.points).toEqual([
      expect.objectContaining({ date: "2026-03-01", spend: 100, revenue: 200, conversions: 2 }),
      expect.objectContaining({ date: "2026-03-02", spend: 120, revenue: 240, conversions: 3 }),
    ]);
  });

  it("keeps product report names aligned with the typed dimension title in the daily fallback path", async () => {
    const oomError = Object.assign(new Error("out of memory"), { code: "53200" });
    vi.mocked(warehouse.readGoogleAdsAggregatedRange).mockRejectedValue(oomError as never);
    vi.mocked(warehouse.readGoogleAdsDailyRange).mockResolvedValue([
      {
        businessId: "biz",
        providerAccountId: "acc_1",
        date: "2026-03-01",
        accountTimezone: "UTC",
        accountCurrency: "USD",
        entityKey: "prod_1",
        entityLabel: "Dimension Product",
        campaignId: "cmp_1",
        campaignName: "Campaign 1",
        adGroupId: null,
        adGroupName: null,
        status: "enabled",
        channel: "shopping",
        classification: "retail",
        payloadJson: {
          name: "Stale Product Name",
          productTitle: "Fact Product",
          title: "Fact Product",
        },
        sourceSnapshotId: "snap_1",
        spend: 10,
        revenue: 20,
        conversions: 2,
        impressions: 100,
        clicks: 10,
        ctr: 10,
        cpc: 1,
        cpa: 5,
        roas: 2,
        conversionRate: 20,
        interactionRate: 10,
        updatedAt: "2026-03-01T01:00:00.000Z",
      },
    ] as never);

    const result = await getGoogleAdsProductsReport({
      businessId: "biz",
      dateRange: "custom",
      customStart: "2026-03-01",
      customEnd: "2026-03-03",
    });

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        name: "Dimension Product",
        productTitle: "Dimension Product",
        title: "Dimension Product",
      }),
    );
  });
});
