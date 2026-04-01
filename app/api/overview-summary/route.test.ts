import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn().mockResolvedValue({ businessId: "biz" }),
}));

vi.mock("@/lib/business-cost-model", () => ({
  getBusinessCostModel: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/account-store", () => ({
  getBusinessTimezone: vi.fn().mockResolvedValue("Europe/Istanbul"),
}));

vi.mock("@/lib/analytics-overview", () => ({
  GA4AuthError: class GA4AuthError extends Error {},
  getAnalyticsOverviewData: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/integration-status", () => ({
  getIntegrationStatusByBusiness: vi.fn().mockResolvedValue({ shopify: true }),
}));

vi.mock("@/lib/overview-service", () => ({
  getOverviewData: vi.fn(),
}));

vi.mock("@/lib/shopify/overview", () => ({
  getShopifyOverviewAggregate: vi.fn(),
}));

vi.mock("@/lib/request-language", () => ({
  resolveRequestLanguage: vi.fn().mockResolvedValue("en"),
}));

vi.mock("@/lib/overview-summary-support", () => ({
  buildAttributionRows: vi.fn(() => []),
  buildMetricCard: vi.fn((params) => ({
    id: params.id,
    title: params.title,
    helperText: params.helperText,
    dataSource: { key: params.sourceKey, label: params.sourceLabel },
    value: params.value,
  })),
  buildPlatformSections: vi.fn(() => []),
  buildUnavailableMetric: vi.fn((params) => ({
    id: params.id,
    title: params.title,
    helperText: params.helperText,
    dataSource: { key: params.sourceKey ?? "unavailable", label: params.sourceLabel ?? "Unavailable" },
    value: null,
  })),
  getGa4DailyTrendSnapshot: vi.fn(() => []),
  getGa4LtvSnapshot: vi.fn().mockResolvedValue(null),
  getPreviousWindow: vi.fn(() => ({ startDate: "2026-02-01", endDate: "2026-02-28" })),
  mapInsights: vi.fn(() => []),
  parseIsoDate: vi.fn((value, fallback) => (value ? new Date(value) : fallback)),
  roundSparklineValue: vi.fn((value) => value),
  toCostModelData: vi.fn(() => null),
  toIsoDate: vi.fn((date) => date.toISOString().slice(0, 10)),
  toPercentSparklineSeries: vi.fn(() => []),
  toRatioSparklineSeries: vi.fn(() => []),
  toSparklineSeries: vi.fn(() => []),
}));

const overviewService = await import("@/lib/overview-service");
const shopifyOverview = await import("@/lib/shopify/overview");
const accountStore = await import("@/lib/account-store");
const { GET } = await import("@/app/api/overview-summary/route");

describe("GET /api/overview-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(overviewService.getOverviewData).mockResolvedValue({
      businessId: "biz",
      dateRange: { startDate: "2026-03-01", endDate: "2026-03-31" },
      kpis: {
        spend: 100,
        revenue: 250,
        roas: 2.5,
        purchases: 5,
        cpa: 20,
        aov: 50,
      },
      kpiSources: {
        spend: { source: "ad_platforms", label: "Ad platforms" },
        revenue: { source: "shopify", label: "Shopify" },
        roas: { source: "shopify", label: "Shopify" },
        purchases: { source: "shopify", label: "Shopify" },
        cpa: { source: "ad_platforms", label: "Ad platforms" },
        aov: { source: "shopify", label: "Shopify" },
      },
      totals: {
        impressions: 0,
        clicks: 0,
        purchases: 5,
        spend: 100,
        conversions: 5,
        revenue: 250,
        ctr: 0,
        cpm: 0,
        cpc: 0,
        cpa: 20,
        roas: 2.5,
      },
      platformEfficiency: [],
      providerTrends: {},
      trends: { "7d": [], "14d": [], "30d": [], custom: [] },
    } as never);
    vi.mocked(shopifyOverview.getShopifyOverviewAggregate).mockResolvedValue({
      revenue: 250,
      purchases: 5,
      averageOrderValue: 50,
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [],
    });
  });

  it("removes connect helper text from Shopify-first commerce cards and labels MER correctly", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/overview-summary?businessId=biz&startDate=2026-03-01&endDate=2026-03-31&compareMode=none"
    );

    const response = await GET(request);
    const payload = await response.json();
    const pins = payload.summary.pins as Array<{ id: string; helperText?: string; dataSource: { label: string } }>;
    const storeMetrics = payload.summary.storeMetrics as Array<{ id: string; helperText?: string }>;

    expect(pins.find((card) => card.id === "pins-revenue")?.helperText).toBeUndefined();
    expect(pins.find((card) => card.id === "pins-orders")?.helperText).toBeUndefined();
    expect(pins.find((card) => card.id === "pins-mer")?.helperText).toBeUndefined();
    expect(pins.find((card) => card.id === "pins-mer")?.dataSource.label).toBe("Shopify + ad platforms");
    expect(pins.find((card) => card.id === "pins-blended-roas")?.helperText).toBeUndefined();
    expect(storeMetrics.find((card) => card.id === "store-aov")?.helperText).toBeUndefined();
  });

  it("uses the business timezone when overview dates are omitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T21:30:00.000Z"));
    vi.mocked(accountStore.getBusinessTimezone).mockResolvedValueOnce("Europe/Istanbul");

    const request = new NextRequest(
      "http://localhost:3000/api/overview-summary?businessId=biz&compareMode=none"
    );

    await GET(request);

    expect(overviewService.getOverviewData).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        startDate: "2026-03-03",
        endDate: "2026-04-01",
        includeTrends: false,
      })
    );

    vi.useRealTimers();
  });
});
