import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/shopify/webhook-verification", () => ({
  verifyShopifyWebhook: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/lib/sync/shopify-sync", () => ({
  syncShopifyCommerceReports: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse", () => ({
  getShopifyWebhookDelivery: vi.fn(),
  upsertShopifyWebhookDelivery: vi.fn(),
}));

const verification = await import("@/lib/shopify/webhook-verification");
const db = await import("@/lib/db");
const shopifySync = await import("@/lib/sync/shopify-sync");
const warehouse = await import("@/lib/shopify/warehouse");
const { POST } = await import("@/app/api/webhooks/shopify/sync/route");

describe("POST /api/webhooks/shopify/sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(warehouse.getShopifyWebhookDelivery).mockResolvedValue(null as never);
  });

  it("records and processes a matched Shopify sync webhook", async () => {
    vi.mocked(verification.verifyShopifyWebhook).mockResolvedValue({
      valid: true,
      body: JSON.stringify({ id: "order_1" }),
    } as never);
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn().mockResolvedValue([
        {
          business_id: "biz_1",
          provider_account_id: "test-shop.myshopify.com",
        },
      ]) as never
    );
    vi.mocked(shopifySync.syncShopifyCommerceReports).mockResolvedValue({
      success: true,
      reason: "ok",
    } as never);
    vi.mocked(warehouse.upsertShopifyWebhookDelivery).mockResolvedValue(undefined);

    const request = new NextRequest("http://localhost:3000/api/webhooks/shopify/sync", {
      method: "POST",
      headers: {
        "x-shopify-topic": "ORDERS_UPDATED",
        "x-shopify-shop-domain": "test-shop.myshopify.com",
        "x-shopify-webhook-id": "wh_1",
      },
      body: JSON.stringify({ id: "order_1" }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.received).toBe(true);
    expect(shopifySync.syncShopifyCommerceReports).toHaveBeenCalledWith("biz_1", {
      recentWindowDays: 3,
      triggerReason: "webhook:orders:update",
      recentTargets: {
        orders: true,
        returns: false,
      },
      allowHistorical: false,
    });
    expect(warehouse.upsertShopifyWebhookDelivery).toHaveBeenCalled();
  });

  it("ignores unsupported webhook topics without triggering sync", async () => {
    vi.mocked(verification.verifyShopifyWebhook).mockResolvedValue({
      valid: true,
      body: JSON.stringify({ id: "order_2" }),
    } as never);
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn().mockResolvedValue([
        {
          business_id: "biz_1",
          provider_account_id: "test-shop.myshopify.com",
        },
      ]) as never
    );
    vi.mocked(warehouse.upsertShopifyWebhookDelivery).mockResolvedValue(undefined);

    const request = new NextRequest("http://localhost:3000/api/webhooks/shopify/sync", {
      method: "POST",
      headers: {
        "x-shopify-topic": "PRODUCTS_UPDATE",
        "x-shopify-shop-domain": "test-shop.myshopify.com",
        "x-shopify-webhook-id": "wh_2",
      },
      body: JSON.stringify({ id: "order_2" }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ignored).toBe(true);
    expect(shopifySync.syncShopifyCommerceReports).not.toHaveBeenCalled();
  });

  it("skips duplicate processed deliveries without triggering sync again", async () => {
    vi.mocked(verification.verifyShopifyWebhook).mockResolvedValue({
      valid: true,
      body: JSON.stringify({ id: "order_3" }),
    } as never);
    vi.mocked(warehouse.getShopifyWebhookDelivery).mockResolvedValue({
      processingState: "processed",
    } as never);

    const request = new NextRequest("http://localhost:3000/api/webhooks/shopify/sync", {
      method: "POST",
      headers: {
        "x-shopify-topic": "ORDERS_UPDATED",
        "x-shopify-shop-domain": "test-shop.myshopify.com",
        "x-shopify-webhook-id": "wh_3",
      },
      body: JSON.stringify({ id: "order_3" }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.duplicate).toBe(true);
    expect(shopifySync.syncShopifyCommerceReports).not.toHaveBeenCalled();
  });
});
