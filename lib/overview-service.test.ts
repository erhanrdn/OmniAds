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
  getGoogleAdsOverviewSummaryAggregate: vi.fn(),
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

vi.mock("@/lib/shopify/read-adapter", () => ({
  getShopifyOverviewReadCandidate: vi.fn(),
  getShopifyOverviewSummaryReadCandidate: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const demo = await import("@/lib/demo-business");
const googleServing = await import("@/lib/google-ads/serving");
const integrations = await import("@/lib/integrations");
const assignments = await import("@/lib/provider-account-assignments");
const reportingCache = await import("@/lib/reporting-cache");
const metaServing = await import("@/lib/meta/serving");
const shopifyOverview = await import("@/lib/shopify/overview");
const shopifyReadAdapter = await import("@/lib/shopify/read-adapter");
const { getOverviewData, getShopifyOverviewServingData } = await import("@/lib/overview-service");

function buildReadCandidate(
  overrides: Partial<Awaited<ReturnType<typeof shopifyReadAdapter.getShopifyOverviewReadCandidate>>> = {}
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

function buildShopifyStatus(
  overrides: Partial<Awaited<ReturnType<typeof shopifyReadAdapter.getShopifyOverviewReadCandidate>>["status"]> = {}
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

describe("getOverviewData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
    vi.mocked(demo.isDemoBusinessId).mockReturnValue(false);
    vi.mocked(reportingCache.getCachedReport).mockResolvedValue(null);
    vi.mocked(shopifyOverview.getShopifyOverviewAggregate).mockResolvedValue(null);
    vi.mocked(shopifyReadAdapter.getShopifyOverviewReadCandidate).mockResolvedValue(
      buildReadCandidate({
        decisionReasons: ["warehouse_read_canary_disabled"],
      }) as never
    );
    vi.mocked(shopifyReadAdapter.getShopifyOverviewSummaryReadCandidate).mockResolvedValue(
      buildReadCandidate({
        decisionReasons: ["warehouse_read_canary_disabled"],
      }) as never
    );
    vi.mocked(googleServing.getGoogleAdsOverviewSummaryAggregate).mockResolvedValue({
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
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      includeTrends: false,
    });

    expect(metaServing.getMetaWarehouseSummary).toHaveBeenCalled();
    expect(googleServing.getGoogleAdsOverviewSummaryAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        source: "overview_aggregation_route",
      })
    );
    expect(shopifyReadAdapter.getShopifyOverviewSummaryReadCandidate).toHaveBeenCalled();
    expect(overview.kpis.spend).toBe(120);
    expect(overview.kpis.revenue).toBe(480);
    expect(overview.kpis.purchases).toBe(6);
  });

  it("marks ecommerce KPIs as Shopify live fallback when only live aggregate is present", async () => {
    vi.mocked(shopifyReadAdapter.getShopifyOverviewSummaryReadCandidate).mockResolvedValue({
      status: buildShopifyStatus({
        state: "ready",
        connected: true,
        shopId: "test-shop.myshopify.com",
      }),
      live: {
        revenue: 900,
        purchases: 9,
        averageOrderValue: 100,
        sessions: null,
        conversionRate: null,
        newCustomers: null,
        returningCustomers: null,
        dailyTrends: [],
      },
      warehouse: null,
      divergence: null,
      decisionReasons: ["warehouse_aggregate_unavailable"],
      canaryEnabled: false,
      preferredSource: "live",
      canServeWarehouse: false,
    } as never);

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
    expect(overview.kpiSources.revenue).toEqual({
      source: "shopify_live_fallback",
      label: "Shopify Live Fallback",
    });
    expect(overview.kpiSources.purchases).toEqual({
      source: "shopify_live_fallback",
      label: "Shopify Live Fallback",
    });
    expect(overview.kpiSources.aov).toEqual({
      source: "shopify_live_fallback",
      label: "Shopify Live Fallback",
    });
    expect(overview.kpiSources.roas).toEqual({
      source: "shopify_live_fallback",
      label: "Shopify Live Fallback",
    });
  });

  it("uses warehouse canary aggregate when it is selected", async () => {
    vi.mocked(shopifyReadAdapter.getShopifyOverviewSummaryReadCandidate).mockResolvedValue({
      status: buildShopifyStatus({
        state: "ready",
        connected: true,
        shopId: "test-shop.myshopify.com",
      }),
      live: {
        revenue: 900,
        purchases: 9,
        averageOrderValue: 100,
        sessions: null,
        conversionRate: null,
        newCustomers: null,
        returningCustomers: null,
        dailyTrends: [],
      },
      warehouse: {
        revenue: 840,
        grossRevenue: 900,
        refundedRevenue: 60,
        purchases: 8,
        returnEvents: 1,
        averageOrderValue: 105,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 900,
            refundedRevenue: 60,
            netRevenue: 840,
            orders: 8,
            returnEvents: 1,
          },
        ],
      },
      divergence: {
        liveRevenue: 900,
        warehouseRevenue: 840,
        revenueDelta: -60,
        revenueDeltaPercent: 6.67,
        livePurchases: 9,
        warehousePurchases: 8,
        purchaseDelta: -1,
        liveAov: 100,
        warehouseAov: 105,
        aovDelta: 5,
        maxDailyRevenueDeltaPercent: 6.67,
        maxDailyPurchaseDelta: 1,
        withinThreshold: true,
      },
      decisionReasons: [],
      canaryEnabled: true,
      preferredSource: "warehouse",
      canServeWarehouse: true,
      servingMetadata: {
        source: "warehouse",
        provider: "shopify",
        trustState: "trusted",
        fallbackReason: null,
        lastSyncedAt: "2026-04-02T10:00:00.000Z",
        coverageStatus: "recent_ready",
        productionMode: "auto",
        pendingRepair: false,
        pendingRepairStartedAt: null,
        pendingRepairLastTopic: null,
        pendingRepairLastReceivedAt: null,
        selectedRevenueTruthBasis: "gross_minus_total_refunded",
        basisSelectionReason: "closest_gross_minus_refunds_revenue",
        transactionCoverageOrderRate: 88,
        transactionCoverageAmountRate: 92,
        explainedAdjustmentRevenue: 0,
        unexplainedAdjustmentRevenue: 0,
      },
    } as never);

    const overview = await getOverviewData({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      includeTrends: false,
    });

    expect(overview.kpis.revenue).toBe(840);
    expect(overview.kpis.purchases).toBe(8);
    expect(overview.kpis.aov).toBe(105);
    expect(overview.kpiSources.revenue).toEqual({
      source: "shopify_warehouse",
      label: "Shopify Warehouse",
    });
  });

  it("preserves warehouse-only Shopify store metrics for summary surfaces", async () => {
    vi.mocked(shopifyReadAdapter.getShopifyOverviewReadCandidate).mockResolvedValue({
      status: buildShopifyStatus({
        state: "ready",
        connected: true,
        shopId: "test-shop.myshopify.com",
      }),
      live: {
        revenue: 900,
        purchases: 9,
        averageOrderValue: 100,
        grossRevenue: null,
        refundedRevenue: null,
        returnEvents: null,
        sessions: null,
        conversionRate: null,
        newCustomers: null,
        returningCustomers: null,
        dailyTrends: [],
      },
      warehouse: {
        revenue: 840,
        grossRevenue: 900,
        refundedRevenue: 60,
        purchases: 8,
        returnEvents: 1,
        averageOrderValue: 105,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 900,
            refundedRevenue: 60,
            netRevenue: 840,
            orders: 8,
            returnEvents: 1,
          },
        ],
      },
      divergence: {
        liveRevenue: 900,
        warehouseRevenue: 840,
        revenueDelta: -60,
        revenueDeltaPercent: 6.67,
        livePurchases: 9,
        warehousePurchases: 8,
        purchaseDelta: -1,
        liveAov: 100,
        warehouseAov: 105,
        aovDelta: 5,
        maxDailyRevenueDeltaPercent: 6.67,
        maxDailyPurchaseDelta: 1,
        withinThreshold: true,
      },
      decisionReasons: [],
      canaryEnabled: true,
      preferredSource: "warehouse",
      canServeWarehouse: true,
      servingMetadata: {
        source: "warehouse",
        provider: "shopify",
        trustState: "trusted",
        fallbackReason: null,
        lastSyncedAt: "2026-04-02T10:00:00.000Z",
        coverageStatus: "recent_ready",
        productionMode: "auto",
        pendingRepair: false,
        pendingRepairStartedAt: null,
        pendingRepairLastTopic: null,
        pendingRepairLastReceivedAt: null,
        selectedRevenueTruthBasis: "gross_minus_total_refunded",
        basisSelectionReason: "closest_gross_minus_refunds_revenue",
        transactionCoverageOrderRate: 88,
        transactionCoverageAmountRate: 92,
        explainedAdjustmentRevenue: 0,
        unexplainedAdjustmentRevenue: 0,
      },
    } as never);

    const result = await getShopifyOverviewServingData({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
    });

    expect(result.aggregate).toEqual(
      expect.objectContaining({
        revenue: 840,
        grossRevenue: 900,
        refundedRevenue: 60,
        purchases: 8,
        returnEvents: 1,
      })
    );
    expect(result.aggregate?.dailyTrends[0]).toEqual(
      expect.objectContaining({
        date: "2026-03-01",
        revenue: 840,
        grossRevenue: 900,
        refundedRevenue: 60,
        purchases: 8,
        returnEvents: 1,
      })
    );
  });

  it("prefers ledger revenue truth when ledger serving is selected", async () => {
    vi.mocked(shopifyReadAdapter.getShopifyOverviewSummaryReadCandidate).mockResolvedValue({
      status: buildShopifyStatus({
        state: "ready",
        connected: true,
        shopId: "test-shop.myshopify.com",
      }),
      live: {
        revenue: 900,
        purchases: 9,
        averageOrderValue: 100,
        sessions: null,
        conversionRate: null,
        newCustomers: null,
        returningCustomers: null,
        dailyTrends: [],
      },
      warehouse: {
        revenue: 840,
        grossRevenue: 900,
        refundedRevenue: 60,
        purchases: 8,
        returnEvents: 1,
        averageOrderValue: 105,
        daily: [],
      },
      ledger: {
        revenue: 780,
        grossRevenue: 900,
        refundedRevenue: 120,
        purchases: 8,
        returnEvents: 1,
        averageOrderValue: 97.5,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 900,
            refundedRevenue: 120,
            netRevenue: 780,
            orders: 8,
            returnEvents: 1,
            orderEventCount: 8,
            adjustmentEventCount: 0,
            refundEventCount: 1,
            adjustmentRevenue: 0,
            refundPressure: 120,
            dailySemanticDrift: 120,
          },
        ],
        ledgerRows: 1,
        orderEventCount: 8,
        adjustmentEventCount: 0,
        refundEventCount: 1,
        adjustmentRevenue: 0,
        refundPressure: 120,
        dailySemanticDrift: 120,
        currentOrderRevenue: 900,
        grossMinusRefundsOrderRevenue: 780,
        transactionCapturedRevenue: null,
        transactionRefundedRevenue: null,
        transactionNetRevenue: null,
        transactionCoveredOrders: 0,
        transactionCoveredRevenue: null,
        transactionCoverageRate: null,
        transactionCoverageAmountRate: null,
      },
      divergence: null,
      override: null,
      ledgerConsistency: {
        withinThreshold: true,
        revenueDelta: 60,
        revenueDeltaPercent: 7.14,
        purchaseDelta: 0,
        returnEventDelta: 0,
        refundedRevenueDelta: 60,
        adjustmentRevenueDelta: 0,
        refundPressureDelta: 60,
        orderRevenueTruthDelta: 0,
        transactionRevenueDelta: null,
        currentOrderRevenue: 900,
        grossMinusRefundsOrderRevenue: 780,
        preferredOrderRevenueBasis: "gross_minus_total_refunded",
        transactionNetRevenue: null,
        transactionCoveredOrders: 0,
        transactionCoveredRevenue: null,
        transactionCoverageRate: null,
        transactionCoverageAmountRate: null,
        warehouseRevenue: 840,
        ledgerRevenue: 780,
        warehousePurchases: 8,
        ledgerPurchases: 8,
        warehouseReturnEvents: 1,
        ledgerReturnEvents: 1,
        warehouseRefundedRevenue: 60,
        ledgerRefundedRevenue: 120,
        ledgerAdjustmentRevenue: 0,
        maxDailyRevenueDeltaPercent: null,
        maxDailyPurchaseDelta: null,
        maxDailyRefundPressureDelta: null,
        maxDailyAdjustmentDelta: null,
        maxDailySemanticDrift: null,
        consistencyScore: 92.86,
        failureReasons: [],
      },
      decisionReasons: [],
      canaryEnabled: true,
      preferredSource: "ledger",
      canServeWarehouse: true,
      servingMetadata: {
        source: "ledger",
        provider: "shopify",
        trustState: "trusted",
        fallbackReason: null,
        lastSyncedAt: "2026-04-02T10:00:00.000Z",
        coverageStatus: "recent_ready",
        productionMode: "auto",
        pendingRepair: false,
        pendingRepairStartedAt: null,
        pendingRepairLastTopic: null,
        pendingRepairLastReceivedAt: null,
        selectedRevenueTruthBasis: "gross_minus_total_refunded",
        basisSelectionReason: "closest_gross_minus_refunds_revenue",
        transactionCoverageOrderRate: null,
        transactionCoverageAmountRate: null,
        explainedAdjustmentRevenue: 0,
        unexplainedAdjustmentRevenue: 0,
      },
    } as never);

    const overview = await getOverviewData({
      businessId: "biz",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      includeTrends: false,
    });

    expect(overview.kpis.revenue).toBe(780);
    expect(overview.kpiSources.revenue).toEqual({
      source: "shopify_ledger",
      label: "Shopify Ledger",
    });
  });
});
