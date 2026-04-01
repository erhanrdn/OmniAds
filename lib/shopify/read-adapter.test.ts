import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildShopifyOverviewCanaryKey, SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS } from "@/lib/shopify/serving";

vi.mock("@/lib/shopify/overview", () => ({
  getShopifyOverviewAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/status", () => ({
  getShopifyStatus: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse-overview", () => ({
  getShopifyWarehouseOverviewAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse", () => ({
  upsertShopifyServingState: vi.fn(),
}));

const overview = await import("@/lib/shopify/overview");
const status = await import("@/lib/shopify/status");
const warehouse = await import("@/lib/shopify/warehouse-overview");
const warehouseState = await import("@/lib/shopify/warehouse");
const { getShopifyOverviewReadCandidate } = await import("@/lib/shopify/read-adapter");

describe("getShopifyOverviewReadCandidate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.SHOPIFY_WAREHOUSE_READ_CANARY;
    vi.mocked(warehouseState.upsertShopifyServingState).mockResolvedValue(undefined);
  });

  it("prefers live when canary is disabled", async () => {
    vi.mocked(status.getShopifyStatus).mockResolvedValue({
      state: "ready",
      connected: true,
      shopId: "shop",
      warehouse: null,
      sync: null,
      serving: null,
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
      returnEvents: 0,
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
    expect(result.decisionReasons).toContain("warehouse_read_canary_disabled");
    expect(warehouseState.upsertShopifyServingState).toHaveBeenCalled();
  });

  it("allows warehouse canary when status is ready and divergence is within threshold", async () => {
    process.env.SHOPIFY_WAREHOUSE_READ_CANARY = "true";
    vi.mocked(status.getShopifyStatus).mockResolvedValue({
      state: "ready",
      connected: true,
      shopId: "shop",
      warehouse: null,
      sync: null,
      serving: null,
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
      dailyTrends: [
        {
          date: "2026-03-01",
          revenue: 1000,
          purchases: 10,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
      ],
    } as never);
    vi.mocked(warehouse.getShopifyWarehouseOverviewAggregate).mockResolvedValue({
      revenue: 1005,
      grossRevenue: 1030,
      refundedRevenue: 25,
      purchases: 10,
      returnEvents: 0,
      averageOrderValue: 100.5,
      daily: [
        {
          date: "2026-03-01",
          orderRevenue: 1030,
          refundedRevenue: 25,
          netRevenue: 1005,
          orders: 10,
          returnEvents: 0,
        },
      ],
    } as never);

    const result = await getShopifyOverviewReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.preferredSource).toBe("warehouse");
    expect(result.canServeWarehouse).toBe(true);
    expect(result.decisionReasons).toEqual([]);
    expect(warehouseState.upsertShopifyServingState).toHaveBeenCalledWith(
      expect.objectContaining({
        canaryKey: buildShopifyOverviewCanaryKey({
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
        }),
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
        preferredSource: "warehouse",
        canServeWarehouse: true,
      })
    );
  });
});
