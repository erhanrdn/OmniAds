import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/shopify/status", () => ({
  getShopifyStatus: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse-overview", () => ({
  getShopifyWarehouseOverviewAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/revenue-ledger", () => ({
  getShopifyRevenueLedgerAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/customer-events-analytics", () => ({
  getShopifyCustomerEventsAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse", () => ({
  listShopifyReconciliationRuns: vi.fn(),
  getShopifyServingOverride: vi.fn(),
  getShopifyServingState: vi.fn(),
  listShopifyServingStateHistory: vi.fn(),
  upsertShopifyServingOverride: vi.fn(),
}));

const adminAuth = await import("@/lib/admin-auth");
const shopifyStatus = await import("@/lib/shopify/status");
const shopifyWarehouse = await import("@/lib/shopify/warehouse");
const warehouseOverview = await import("@/lib/shopify/warehouse-overview");
const revenueLedger = await import("@/lib/shopify/revenue-ledger");
const customerEventsAnalytics = await import("@/lib/shopify/customer-events-analytics");
const { GET, PATCH } = await import("@/app/api/admin/integrations/health/shopify/route");

describe("GET /api/admin/integrations/health/shopify", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(adminAuth.requireAdmin).mockResolvedValue({
      session: { user: { id: "admin_1", role: "admin" } },
    } as never);
    vi.mocked(shopifyWarehouse.getShopifyServingOverride).mockResolvedValue(null as never);
    vi.mocked(shopifyWarehouse.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    vi.mocked(warehouseOverview.getShopifyWarehouseOverviewAggregate).mockResolvedValue(null as never);
    vi.mocked(revenueLedger.getShopifyRevenueLedgerAggregate).mockResolvedValue(null as never);
    vi.mocked(customerEventsAnalytics.getShopifyCustomerEventsAggregate).mockResolvedValue(null as never);
  });

  it("returns a range-aware Shopify canary inspection payload", async () => {
    vi.mocked(shopifyStatus.getShopifyStatus).mockResolvedValue({
      state: "partial",
      connected: true,
      shopId: "test-shop.myshopify.com",
      warehouse: null,
      sync: null,
      serving: null,
      reconciliation: null,
      issues: ["Shopify warehouse canary is blocked by trust checks."],
    } as never);
    vi.mocked(shopifyWarehouse.getShopifyServingState).mockResolvedValue({
      canaryKey: "overview_shopify:2026-03-01:2026-03-31:shop_local",
      canServeWarehouse: false,
      decisionReasons: ["divergence_above_threshold"],
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      timeZoneBasis: "shop_local",
    } as never);
    vi.mocked(shopifyWarehouse.listShopifyServingStateHistory).mockResolvedValue([
      {
        canaryKey: "overview_shopify:2026-03-01:2026-03-31:shop_local",
        canServeWarehouse: false,
        decisionReasons: ["divergence_above_threshold"],
        assessedAt: "2026-04-02T10:00:00.000Z",
      },
    ] as never);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/integrations/health/shopify?businessId=biz_1&startDate=2026-03-01&endDate=2026-03-31"
    );

    const response = await GET(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(shopifyStatus.getShopifyStatus).toHaveBeenCalledWith({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(payload.canaryKey).toBe("overview_shopify:2026-03-01:2026-03-31:shop_local");
    expect(payload.serving?.decisionReasons).toEqual(["divergence_above_threshold"]);
    expect(payload.history).toHaveLength(1);
    expect(payload.reconciliationHistory).toEqual([]);
    expect(payload.ledgerConsistency).toBeNull();
    expect(payload.customerEventsAggregate).toBeNull();
  });

  it("updates a Shopify serving override", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/admin/integrations/health/shopify",
      {
        method: "PATCH",
        body: JSON.stringify({
          businessId: "biz_1",
          providerAccountId: "test-shop.myshopify.com",
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          mode: "force_live",
          reason: "manual_validation",
        }),
      }
    );

    const response = await PATCH(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(shopifyWarehouse.upsertShopifyServingOverride).toHaveBeenCalled();
  });
});
