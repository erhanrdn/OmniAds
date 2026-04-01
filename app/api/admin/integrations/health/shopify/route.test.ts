import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/shopify/status", () => ({
  getShopifyStatus: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse", () => ({
  getShopifyServingState: vi.fn(),
}));

const adminAuth = await import("@/lib/admin-auth");
const shopifyStatus = await import("@/lib/shopify/status");
const shopifyWarehouse = await import("@/lib/shopify/warehouse");
const { GET } = await import("@/app/api/admin/integrations/health/shopify/route");

describe("GET /api/admin/integrations/health/shopify", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(adminAuth.requireAdmin).mockResolvedValue({
      session: { user: { id: "admin_1", role: "admin" } },
    } as never);
  });

  it("returns a range-aware Shopify canary inspection payload", async () => {
    vi.mocked(shopifyStatus.getShopifyStatus).mockResolvedValue({
      state: "partial",
      connected: true,
      shopId: "test-shop.myshopify.com",
      warehouse: null,
      sync: null,
      serving: null,
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
  });
});
