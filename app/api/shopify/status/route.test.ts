import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/shopify/status", () => ({
  getShopifyStatus: vi.fn(),
}));

const access = await import("@/lib/access");
const shopifyStatus = await import("@/lib/shopify/status");
const { GET } = await import("@/app/api/shopify/status/route");

describe("GET /api/shopify/status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(shopifyStatus.getShopifyStatus).mockResolvedValue({
      state: "partial",
      connected: true,
      shopId: "test-shop.myshopify.com",
      warehouse: null,
      sync: null,
      serving: null,
      reconciliation: null,
      issues: ["Historical Shopify backfill is not complete yet."],
    } as never);
  });

  it("requires business access and returns the compact Shopify status payload", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/shopify/status?businessId=biz_1"),
    );
    const payload = await response.json();

    expect(access.requireBusinessAccess).toHaveBeenCalledWith({
      request: expect.any(NextRequest),
      businessId: "biz_1",
      minRole: "guest",
    });
    expect(shopifyStatus.getShopifyStatus).toHaveBeenCalledWith("biz_1");
    expect(payload).toMatchObject({
      state: "partial",
      connected: true,
      shopId: "test-shop.myshopify.com",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("passes optional range context through to Shopify status", async () => {
    await GET(
      new NextRequest(
        "http://localhost:3000/api/shopify/status?businessId=biz_1&startDate=2026-04-01&endDate=2026-04-20",
      ),
    );

    expect(shopifyStatus.getShopifyStatus).toHaveBeenCalledWith({
      businessId: "biz_1",
      startDate: "2026-04-01",
      endDate: "2026-04-20",
    });
  });
});
