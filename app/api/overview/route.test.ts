import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/overview-service", () => ({
  getOverviewData: vi.fn(),
}));

const access = await import("@/lib/access");
const overviewService = await import("@/lib/overview-service");
const { GET } = await import("@/app/api/overview/route");

describe("GET /api/overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      businessId: "biz_1",
    } as never);
    vi.mocked(overviewService.getOverviewData).mockResolvedValue({
      businessId: "biz_1",
      dateRange: { startDate: "2026-03-01", endDate: "2026-03-30" },
      kpis: {
        spend: 100,
        revenue: 240,
        roas: 2.4,
        purchases: 3,
        cpa: 33.33,
        aov: 80,
      },
      kpiSources: {
        revenue: { source: "shopify_live_fallback", label: "Shopify Live Fallback" },
      },
      totals: {
        impressions: 1000,
        clicks: 50,
        purchases: 3,
        spend: 100,
        conversions: 3,
        revenue: 240,
        ctr: 5,
        cpm: 100,
        cpc: 2,
        cpa: 33.33,
        roas: 2.4,
      },
      platformEfficiency: [
        {
          platform: "meta",
          spend: 60,
          revenue: 120,
          roas: 2,
          purchases: 2,
          cpa: 30,
        },
      ],
      trends: {
        "7d": [],
        "14d": [],
        "30d": [],
        custom: [],
      },
      shopifyServing: null,
    } as never);
  });

  it("returns the current overview contract without wrapping the payload", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/overview?businessId=biz_1&startDate=2026-03-01&endDate=2026-03-30",
    );

    const response = await GET(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toStrictEqual({
      businessId: "biz_1",
      dateRange: { startDate: "2026-03-01", endDate: "2026-03-30" },
      kpis: {
        spend: 100,
        revenue: 240,
        roas: 2.4,
        purchases: 3,
        cpa: 33.33,
        aov: 80,
      },
      kpiSources: {
        revenue: { source: "shopify_live_fallback", label: "Shopify Live Fallback" },
      },
      totals: {
        impressions: 1000,
        clicks: 50,
        purchases: 3,
        spend: 100,
        conversions: 3,
        revenue: 240,
        ctr: 5,
        cpm: 100,
        cpc: 2,
        cpa: 33.33,
        roas: 2.4,
      },
      platformEfficiency: [
        {
          platform: "meta",
          spend: 60,
          revenue: 120,
          roas: 2,
          purchases: 2,
          cpa: 30,
        },
      ],
      trends: {
        "7d": [],
        "14d": [],
        "30d": [],
        custom: [],
      },
      shopifyServing: null,
    });
  });
});
