import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse", () => ({
  upsertShopifyCustomerEvents: vi.fn(),
}));

const db = await import("@/lib/db");
const warehouse = await import("@/lib/shopify/warehouse");
const { POST } = await import("@/app/api/webhooks/shopify/customer-events/route");

describe("POST /api/webhooks/shopify/customer-events", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.SHOPIFY_CUSTOMER_EVENTS_SECRET;
  });

  it("stores Shopify customer events for a connected shop", async () => {
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn().mockResolvedValue([
        {
          business_id: "biz_1",
          provider_account_id: "test-shop.myshopify.com",
        },
      ]) as never
    );
    vi.mocked(warehouse.upsertShopifyCustomerEvents).mockResolvedValue(1);

    const request = new NextRequest("http://localhost:3000/api/webhooks/shopify/customer-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-shop-domain": "test-shop.myshopify.com",
      },
      body: JSON.stringify({
        eventId: "evt_1",
        eventType: "page_viewed",
        occurredAt: "2026-04-02T10:00:00.000Z",
        sessionId: "sess_1",
        pageUrl: "https://store.example/products/1",
      }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.received).toBe(true);
    expect(payload.written).toBe(1);
    expect(warehouse.upsertShopifyCustomerEvents).toHaveBeenCalled();
  });
});
