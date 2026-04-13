import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopifyStatusResponse } from "@/lib/shopify/status";

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/demo-business", () => ({
  getDemoOverview: vi.fn(),
  getDemoSparklines: vi.fn(),
  isDemoBusinessId: vi.fn(),
}));

vi.mock("@/lib/google-ads/serving", () => ({
  getGoogleCanonicalOverviewSummary: vi.fn(),
  getGoogleCanonicalOverviewTrends: vi.fn(),
}));

vi.mock("@/lib/google-analytics-reporting", () => ({
  resolveGa4AnalyticsContext: vi.fn(),
  runGA4Report: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
  getIntegrationMetadata: vi.fn(),
}));

vi.mock("@/lib/meta/canonical-overview", () => ({
  getMetaCanonicalOverviewSummary: vi.fn(),
  getMetaCanonicalOverviewTrends: vi.fn(),
}));

vi.mock("@/lib/reporting-cache", () => ({
  getCachedReport: vi.fn(),
  getReportingDateRangeKey: vi.fn(() => "cache-key"),
  setCachedReport: vi.fn(),
}));

vi.mock("@/lib/shopify/read-adapter", () => ({
  getShopifyOverviewReadCandidate: vi.fn(),
  getShopifyOverviewSummaryReadCandidate: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const demo = await import("@/lib/demo-business");
const googleServing = await import("@/lib/google-ads/serving");
const integrations = await import("@/lib/integrations");
const metaCanonical = await import("@/lib/meta/canonical-overview");
const reportingCache = await import("@/lib/reporting-cache");
const shopifyReadAdapter = await import("@/lib/shopify/read-adapter");
const {
  getOverviewData,
  getOverviewTrendBundle,
  getShopifyOverviewServingData,
} = await import("@/lib/overview-service");

function buildShopifyStatus(
  overrides: Partial<ShopifyStatusResponse> = {},
): ShopifyStatusResponse {
  return {
    state: "not_connected",
    connected: false,
    shopId: null,
    warehouse: null,
    sync: null,
    serving: null,
    reconciliation: null,
    issues: [],
    ...overrides,
  };
}

function buildReadCandidate(
  overrides: Partial<
    Awaited<ReturnType<typeof shopifyReadAdapter.getShopifyOverviewReadCandidate>>
  > = {},
): Awaited<ReturnType<typeof shopifyReadAdapter.getShopifyOverviewReadCandidate>> {
  return {
    status: buildShopifyStatus(),
    live: null,
    warehouse: null,
    ledger: null,
    override: null,
    divergence: null,
    ledgerConsistency: null,
    decisionReasons: [],
    canaryEnabled: false,
    preferredSource: "none",
    canServeWarehouse: false,
    servingMetadata: {
      source: "none",
      provider: "shopify",
      trustState: "no_data",
      fallbackReason: null,
      lastSyncedAt: null,
      coverageStatus: "unknown",
      productionMode: "disabled",
      pendingRepair: false,
      pendingRepairStartedAt: null,
      pendingRepairLastTopic: null,
      pendingRepairLastReceivedAt: null,
      selectedRevenueTruthBasis: null,
      basisSelectionReason: null,
      transactionCoverageOrderRate: null,
      transactionCoverageAmountRate: null,
      explainedAdjustmentRevenue: 0,
      unexplainedAdjustmentRevenue: 0,
    },
    ...overrides,
  };
}

describe("overview-service canonical orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
    vi.mocked(demo.isDemoBusinessId).mockReturnValue(false);
    vi.mocked(reportingCache.getCachedReport).mockResolvedValue(null);
    vi.mocked(integrations.getIntegration).mockResolvedValue(null);
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue(null);
    vi.mocked(metaCanonical.getMetaCanonicalOverviewSummary).mockResolvedValue({
      totals: { spend: 120, revenue: 480, conversions: 6 },
      accounts: [
        {
          providerAccountId: "act_1",
          spend: 120,
          revenue: 480,
          conversions: 6,
          roas: 4,
        },
      ],
      isPartial: false,
      notReadyReason: null,
      readSource: "warehouse",
    } as never);
    vi.mocked(metaCanonical.getMetaCanonicalOverviewTrends).mockResolvedValue({
      points: [],
      isPartial: false,
      notReadyReason: null,
      readSource: "warehouse_published",
      meta: { readSource: "warehouse_published" },
    } as never);
    vi.mocked(googleServing.getGoogleCanonicalOverviewSummary).mockResolvedValue({
      kpis: {
        spend: 30,
        revenue: 90,
        conversions: 3,
        roas: 3,
        cpa: 10,
        cpc: 1,
        ctr: 2,
        impressions: 1000,
        clicks: 30,
        convRate: 10,
      },
      kpiDeltas: undefined,
      summary: {
        totalAccounts: 1,
        readSource: "warehouse_account_aggregate",
      },
      meta: {
        readSource: "warehouse_account_aggregate",
      },
    } as never);
    vi.mocked(googleServing.getGoogleCanonicalOverviewTrends).mockResolvedValue({
      points: [],
      meta: {
        readSource: "warehouse_account_daily",
        fallbackReason: null,
        degraded: false,
      },
    } as never);
    vi.mocked(shopifyReadAdapter.getShopifyOverviewReadCandidate).mockResolvedValue(
      buildReadCandidate() as never,
    );
    vi.mocked(shopifyReadAdapter.getShopifyOverviewSummaryReadCandidate).mockResolvedValue(
      buildReadCandidate() as never,
    );
  });

  it("composes Meta and Google overview fragments from canonical provider helpers", async () => {
    const overview = await getOverviewData({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      includeTrends: false,
    });

    expect(metaCanonical.getMetaCanonicalOverviewSummary).toHaveBeenCalledWith({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
    });
    expect(googleServing.getGoogleCanonicalOverviewSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        dateRange: "custom",
        customStart: "2026-03-01",
        customEnd: "2026-03-15",
        compareMode: "none",
        source: "overview_aggregation_route",
      }),
    );
    expect(overview.kpis.spend).toBe(150);
    expect(overview.kpis.revenue).toBe(570);
    expect(overview.kpis.purchases).toBe(9);
  });

  it("keeps Meta visible in overview when current-day live totals have no account rows yet", async () => {
    vi.mocked(metaCanonical.getMetaCanonicalOverviewSummary).mockResolvedValue({
      totals: { spend: 23.22, revenue: 0, conversions: 0, roas: 0 },
      accounts: [],
      isPartial: false,
      notReadyReason: null,
      readSource: "current_day_live",
    } as never);
    vi.mocked(googleServing.getGoogleCanonicalOverviewSummary).mockResolvedValue({
      kpis: {
        spend: 14.31,
        revenue: 0,
        conversions: 0,
        roas: 0,
        cpa: 0,
        cpc: 0,
        ctr: 0,
        impressions: 0,
        clicks: 0,
        convRate: 0,
      },
      kpiDeltas: undefined,
      summary: {
        totalAccounts: 1,
        readSource: "live_overlay_current_day",
      },
      meta: {
        readSource: "live_overlay_current_day",
      },
    } as never);

    const overview = await getOverviewData({
      businessId: "biz",
      startDate: "2026-04-08",
      endDate: "2026-04-08",
      includeTrends: false,
    });

    expect(overview.platformEfficiency).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: "meta",
          spend: 23.22,
        }),
      ]),
    );
    expect(overview.kpis.spend).toBe(37.53);
  });

  it("uses the summary Shopify read path for sparkline bundles", async () => {
    vi.mocked(metaCanonical.getMetaCanonicalOverviewTrends).mockResolvedValue({
      points: [{ date: "2026-03-01", spend: 10, revenue: 20, conversions: 1 }],
      isPartial: false,
      notReadyReason: null,
      readSource: "warehouse_published",
      meta: { readSource: "warehouse_published" },
    } as never);
    vi.mocked(googleServing.getGoogleCanonicalOverviewTrends).mockResolvedValue({
      points: [{ date: "2026-03-01", spend: 5, revenue: 15, conversions: 2 }],
      meta: {
        readSource: "warehouse_account_daily",
        fallbackReason: null,
        degraded: false,
      },
    } as never);

    const bundle = await getOverviewTrendBundle({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    expect(shopifyReadAdapter.getShopifyOverviewSummaryReadCandidate).toHaveBeenCalled();
    expect(shopifyReadAdapter.getShopifyOverviewReadCandidate).not.toHaveBeenCalled();
    expect(bundle.providerTrends.meta).toEqual([
      { date: "2026-03-01", spend: 10, revenue: 20, purchases: 1 },
    ]);
    expect(bundle.providerTrends.google).toEqual([
      { date: "2026-03-01", spend: 5, revenue: 15, purchases: 2 },
    ]);
    expect(bundle.combined).toEqual([
      { date: "2026-03-01", spend: 15, revenue: 35, purchases: 3 },
    ]);
  });

  it("lets Shopify canonical revenue override ad-platform revenue in combined trends without altering provider trends", async () => {
    vi.mocked(metaCanonical.getMetaCanonicalOverviewTrends).mockResolvedValue({
      points: [{ date: "2026-03-01", spend: 10, revenue: 20, conversions: 1 }],
      isPartial: false,
      notReadyReason: null,
      readSource: "warehouse_published",
      meta: { readSource: "warehouse_published" },
    } as never);
    vi.mocked(googleServing.getGoogleCanonicalOverviewTrends).mockResolvedValue({
      points: [{ date: "2026-03-01", spend: 5, revenue: 15, conversions: 2 }],
      meta: {
        readSource: "warehouse_account_daily",
        fallbackReason: null,
        degraded: false,
      },
    } as never);
    vi.mocked(shopifyReadAdapter.getShopifyOverviewSummaryReadCandidate).mockResolvedValue(
      buildReadCandidate({
        live: {
          revenue: 50,
          purchases: 4,
          averageOrderValue: 12.5,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
          dailyTrends: [
            {
              date: "2026-03-01",
              revenue: 50,
              purchases: 4,
              sessions: null,
              conversionRate: null,
              newCustomers: null,
              returningCustomers: null,
            },
          ],
        },
        preferredSource: "live",
      }) as never,
    );

    const bundle = await getOverviewTrendBundle({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    expect(bundle.providerTrends.meta).toEqual([
      { date: "2026-03-01", spend: 10, revenue: 20, purchases: 1 },
    ]);
    expect(bundle.providerTrends.google).toEqual([
      { date: "2026-03-01", spend: 5, revenue: 15, purchases: 2 },
    ]);
    expect(bundle.combined).toEqual([
      { date: "2026-03-01", spend: 15, revenue: 50, purchases: 4 },
    ]);
  });

  it("exposes the full Shopify read candidate via getShopifyOverviewServingData", async () => {
    vi.mocked(shopifyReadAdapter.getShopifyOverviewReadCandidate).mockResolvedValue(
      buildReadCandidate({
        live: {
          revenue: 75,
          purchases: 5,
          averageOrderValue: 15,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
          dailyTrends: [],
        },
        preferredSource: "live",
      }) as never,
    );

    const result = await getShopifyOverviewServingData({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
    });

    expect(shopifyReadAdapter.getShopifyOverviewReadCandidate).toHaveBeenCalled();
    expect(result.aggregate?.revenue).toBe(75);
    expect(result.aggregate?.purchases).toBe(5);
  });
});
