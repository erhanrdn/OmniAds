import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/demo-business", () => ({
  getDemoOverview: vi.fn(),
  getDemoSparklines: vi.fn(),
  isDemoBusinessId: vi.fn(),
}));

vi.mock("@/lib/google-ads/serving", () => ({
  getGoogleAdsOverviewReport: vi.fn(),
}));

vi.mock("@/lib/google-analytics-reporting", () => ({
  resolveGa4AnalyticsContext: vi.fn(),
  runGA4Report: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
  getIntegrationMetadata: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/reporting-cache", () => ({
  getCachedReport: vi.fn(),
  getReportingDateRangeKey: vi.fn(() => "cache-key"),
  setCachedReport: vi.fn(),
}));

vi.mock("@/lib/meta/serving", () => ({
  getMetaWarehouseSummary: vi.fn(),
}));

vi.mock("@/lib/shopify/overview", () => ({
  getShopifyOverviewAggregate: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const demo = await import("@/lib/demo-business");
const googleServing = await import("@/lib/google-ads/serving");
const integrations = await import("@/lib/integrations");
const assignments = await import("@/lib/provider-account-assignments");
const reportingCache = await import("@/lib/reporting-cache");
const metaServing = await import("@/lib/meta/serving");
const shopifyOverview = await import("@/lib/shopify/overview");
const { getOverviewData } = await import("@/lib/overview-service");

describe("getOverviewData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
    vi.mocked(demo.isDemoBusinessId).mockReturnValue(false);
    vi.mocked(reportingCache.getCachedReport).mockResolvedValue(null);
    vi.mocked(shopifyOverview.getShopifyOverviewAggregate).mockResolvedValue(null);
    vi.mocked(googleServing.getGoogleAdsOverviewReport).mockResolvedValue({
      kpis: {
        spend: 0,
        revenue: 0,
        conversions: 0,
        clicks: 0,
        impressions: 0,
        roas: 0,
        cpa: 0,
      },
    } as never);
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      id: "as_1",
      business_id: "biz",
      provider: "meta",
      account_ids: ["act_1"],
      created_at: "",
      updated_at: "",
    });
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_meta",
      business_id: "biz",
      provider: "meta",
      status: "disconnected",
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
    });
    vi.mocked(integrations.getIntegration).mockResolvedValue(null);
    vi.mocked(metaServing.getMetaWarehouseSummary).mockResolvedValue({
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
    } as never);
  });

  it("keeps historical Meta warehouse contribution even when the integration is disconnected", async () => {
    const overview = await getOverviewData({
      businessId: "biz",
      dateRange: "custom",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      includeTrends: false,
    });

    expect(metaServing.getMetaWarehouseSummary).toHaveBeenCalled();
    expect(overview.kpis.spend).toBe(120);
    expect(overview.kpis.revenue).toBe(480);
    expect(overview.kpis.purchases).toBe(6);
  });

  it("marks ecommerce KPIs as Shopify when Shopify aggregate is present", async () => {
    vi.mocked(shopifyOverview.getShopifyOverviewAggregate).mockResolvedValue({
      revenue: 900,
      purchases: 9,
      averageOrderValue: 100,
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [],
    });

    const overview = await getOverviewData({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      includeTrends: false,
    });

    expect(overview.kpis.revenue).toBe(900);
    expect(overview.kpis.purchases).toBe(9);
    expect(overview.kpis.aov).toBe(100);
    expect(overview.kpis.roas).toBe(7.5);
    expect(overview.kpiSources.revenue).toEqual({ source: "shopify", label: "Shopify" });
    expect(overview.kpiSources.purchases).toEqual({ source: "shopify", label: "Shopify" });
    expect(overview.kpiSources.aov).toEqual({ source: "shopify", label: "Shopify" });
    expect(overview.kpiSources.roas).toEqual({ source: "shopify", label: "Shopify" });
  });
});
