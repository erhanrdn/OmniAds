import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shopify/overview", () => ({
  getShopifyOverviewAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/status", () => ({
  getShopifyStatus: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse-overview", () => ({
  getShopifyWarehouseOverviewAggregate: vi.fn(),
}));

const overview = await import("@/lib/shopify/overview");
const status = await import("@/lib/shopify/status");
const warehouse = await import("@/lib/shopify/warehouse-overview");
const { getShopifyOverviewReadCandidate } = await import("@/lib/shopify/read-adapter");

describe("getShopifyOverviewReadCandidate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.SHOPIFY_WAREHOUSE_READ_CANARY;
  });

  it("prefers live when canary is disabled", async () => {
    vi.mocked(status.getShopifyStatus).mockResolvedValue({
      state: "ready",
      connected: true,
      shopId: "shop",
      warehouse: null,
      sync: null,
      issues: [],
    } as never);
    vi.mocked(overview.getShopifyOverviewAggregate).mockResolvedValue({
      revenue: 1000,
      purchases: 10,
      averageOrderValue: 100,
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [],
    } as never);
    vi.mocked(warehouse.getShopifyWarehouseOverviewAggregate).mockResolvedValue({
      revenue: 1001,
      grossRevenue: 1020,
      refundedRevenue: 19,
      purchases: 10,
      averageOrderValue: 100.1,
      daily: [],
    } as never);

    const result = await getShopifyOverviewReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.preferredSource).toBe("live");
    expect(result.canServeWarehouse).toBe(false);
    expect(result.divergence?.withinThreshold).toBe(true);
  });

  it("allows warehouse canary when status is ready and divergence is within threshold", async () => {
    process.env.SHOPIFY_WAREHOUSE_READ_CANARY = "true";
    vi.mocked(status.getShopifyStatus).mockResolvedValue({
      state: "ready",
      connected: true,
      shopId: "shop",
      warehouse: null,
      sync: null,
      issues: [],
    } as never);
    vi.mocked(overview.getShopifyOverviewAggregate).mockResolvedValue({
      revenue: 1000,
      purchases: 10,
      averageOrderValue: 100,
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [],
    } as never);
    vi.mocked(warehouse.getShopifyWarehouseOverviewAggregate).mockResolvedValue({
      revenue: 1005,
      grossRevenue: 1030,
      refundedRevenue: 25,
      purchases: 10,
      averageOrderValue: 100.5,
      daily: [],
    } as never);

    const result = await getShopifyOverviewReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.preferredSource).toBe("warehouse");
    expect(result.canServeWarehouse).toBe(true);
  });
});
