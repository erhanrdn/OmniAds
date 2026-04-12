import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/account-store", () => ({
  getBusinessTimezone: vi.fn(),
}));

vi.mock("@/lib/analytics-overview", () => ({
  GA4AuthError: class GA4AuthError extends Error {},
  getAnalyticsOverviewData: vi.fn(),
}));

vi.mock("@/lib/business-cost-model", () => ({
  getBusinessCostModel: vi.fn(),
}));

vi.mock("@/lib/integration-status", () => ({
  getIntegrationStatusByBusiness: vi.fn(),
}));

vi.mock("@/lib/overview-service", () => ({
  getOverviewData: vi.fn(),
  getShopifyOverviewServingData: vi.fn(),
}));

vi.mock("@/lib/overview-summary-support", async () => {
  const actual = await vi.importActual<object>("@/lib/overview-summary-support");
  return {
    ...actual,
    getGa4DailyTrendSnapshot: vi.fn().mockResolvedValue([]),
    getGa4LtvSnapshot: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("@/lib/request-language", () => ({
  resolveRequestLanguage: vi.fn(),
}));

const access = await import("@/lib/access");
const accountStore = await import("@/lib/account-store");
const analyticsOverview = await import("@/lib/analytics-overview");
const businessCostModel = await import("@/lib/business-cost-model");
const integrationStatus = await import("@/lib/integration-status");
const overviewService = await import("@/lib/overview-service");
const requestLanguage = await import("@/lib/request-language");
const { GET } = await import("@/app/api/overview-summary/route");

describe("GET /api/overview-summary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requestLanguage.resolveRequestLanguage).mockResolvedValue("en" as never);
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      businessId: "biz_1",
    } as never);
    vi.mocked(accountStore.getBusinessTimezone).mockResolvedValue("UTC" as never);
    vi.mocked(businessCostModel.getBusinessCostModel).mockResolvedValue(null as never);
    vi.mocked(integrationStatus.getIntegrationStatusByBusiness).mockResolvedValue({
      shopify: true,
    } as never);
    vi.mocked(analyticsOverview.getAnalyticsOverviewData).mockResolvedValue(null as never);
    vi.mocked(overviewService.getOverviewData).mockResolvedValue({
      businessId: "biz_1",
      dateRange: { startDate: "2026-03-01", endDate: "2026-03-30" },
      kpis: { spend: 100, revenue: 200, roas: 2, purchases: 2, cpa: 50, aov: 100 },
      kpiSources: {
        revenue: { source: "shopify_live_fallback", label: "Shopify Live Fallback" },
        purchases: { source: "shopify_live_fallback", label: "Shopify Live Fallback" },
        aov: { source: "shopify_live_fallback", label: "Shopify Live Fallback" },
        roas: { source: "shopify_live_fallback", label: "Shopify Live Fallback" },
      },
      totals: {
        impressions: 10,
        clicks: 5,
        purchases: 2,
        spend: 100,
        conversions: 2,
        revenue: 200,
        ctr: 50,
        cpm: 10,
        cpc: 20,
        cpa: 50,
        roas: 2,
      },
      platformEfficiency: [],
      trends: { "7d": [], "14d": [], "30d": [], custom: [] },
      shopifyServing: {
        source: "live",
        provider: "shopify",
        trustState: "live_fallback",
        fallbackReason: "pending_repair",
        lastSyncedAt: "2026-04-02T10:00:00.000Z",
        coverageStatus: "historical_incomplete",
        productionMode: "auto",
        pendingRepair: true,
        pendingRepairStartedAt: "2026-04-02T10:05:00.000Z",
        pendingRepairLastTopic: "REFUNDS_CREATE",
        pendingRepairLastReceivedAt: "2026-04-02T10:05:00.000Z",
        selectedRevenueTruthBasis: "current_total_price",
        basisSelectionReason: "closest_current_order_revenue",
        transactionCoverageOrderRate: 70,
        transactionCoverageAmountRate: 82,
        explainedAdjustmentRevenue: 5,
        unexplainedAdjustmentRevenue: 0,
      },
    } as never);
    vi.mocked(overviewService.getShopifyOverviewServingData).mockResolvedValue({
      aggregate: {
        revenue: 200,
        grossRevenue: 240,
        refundedRevenue: 40,
        purchases: 2,
        returnEvents: 1,
        averageOrderValue: 100,
        conversionRate: null,
        newCustomers: null,
        returningCustomers: null,
        sessions: null,
        dailyTrends: [
          {
            date: "2026-03-01",
            revenue: 200,
            grossRevenue: 240,
            refundedRevenue: 40,
            purchases: 2,
            returnEvents: 1,
            sessions: null,
            conversionRate: null,
            newCustomers: null,
            returningCustomers: null,
          },
        ],
      },
      serving: {
        source: "live",
      },
    } as never);
  });

  it("returns a non-blank summary contract with shopify serving metadata", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/overview-summary?businessId=biz_1&startDate=2026-03-01&endDate=2026-03-30&compareMode=none"
    );

    const response = await GET(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(payload)).toEqual(["summary"]);
    expect(Object.keys(payload.summary).sort()).toEqual(
      [
        "attribution",
        "businessId",
        "comparison",
        "costModel",
        "customMetrics",
        "dateRange",
        "effectiveEndDate",
        "expenses",
        "insights",
        "isStaleSnapshot",
        "lastWarehouseWriteAt",
        "ltv",
        "pins",
        "platforms",
        "requestedEndDate",
        "shopifyServing",
        "storeMetrics",
        "warehouseReadyThroughDate",
        "webAnalytics",
      ].sort()
    );
    expect(payload.summary.comparison).toEqual({
      mode: "none",
      startDate: null,
      endDate: null,
    });
    expect(payload.summary.pins.map((metric: { id: string }) => metric.id)).toEqual([
      "pins-revenue",
      "pins-spend",
      "pins-mer",
      "pins-blended-roas",
      "pins-conversion-rate",
      "pins-orders",
    ]);
    expect(payload.summary.shopifyServing).toEqual(
      expect.objectContaining({
        source: "live",
        trustState: "live_fallback",
        fallbackReason: "pending_repair",
      })
    );
    expect(Array.isArray(payload.summary.storeMetrics)).toBe(true);
    expect(payload.summary.storeMetrics.map((metric: { id: string }) => metric.id)).toEqual([
      "store-aov",
      "store-gross-sales",
      "store-refunded-revenue",
      "store-refund-rate",
      "store-return-events",
      "store-return-rate",
    ]);
    expect(payload.summary.platforms).toEqual([]);
  });
});
