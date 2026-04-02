import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shopify/admin", () => ({
  shopifyAdminGraphql: vi.fn(),
}));

const admin = await import("@/lib/shopify/admin");
const {
  SHOPIFY_SYNC_WEBHOOK_TOPICS,
  buildShopifyWebhookCallbackUrl,
  classifyShopifySyncWebhookTopic,
  registerShopifySyncWebhooks,
} = await import("@/lib/shopify/webhooks");

describe("shopify webhook foundation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  });

  it("builds a canonical callback url", () => {
    expect(buildShopifyWebhookCallbackUrl("/api/webhooks/shopify/sync")).toBe(
      "https://app.example.com/api/webhooks/shopify/sync"
    );
  });

  it("registers only missing sync webhook topics", async () => {
    vi.mocked(admin.shopifyAdminGraphql)
      .mockResolvedValueOnce({
        webhookSubscriptions: {
          nodes: [
            {
              topic: "ORDERS_CREATE",
              endpoint: {
                __typename: "WebhookHttpEndpoint",
                callbackUrl: "https://app.example.com/api/webhooks/shopify/sync",
              },
            },
          ],
        },
      } as never)
      .mockResolvedValue({
        webhookSubscriptionCreate: {
          userErrors: [],
        },
      } as never);

    const result = await registerShopifySyncWebhooks({
      shopId: "test-shop.myshopify.com",
      accessToken: "shpat_test",
    });

    expect(result.callbackUrl).toBe("https://app.example.com/api/webhooks/shopify/sync");
    expect(result.existingTopics).toEqual(["ORDERS_CREATE"]);
    expect(result.desiredTopics).toEqual([...SHOPIFY_SYNC_WEBHOOK_TOPICS]);
    expect(result.created).toEqual(["ORDERS_UPDATED", "ORDERS_CANCELLED", "REFUNDS_CREATE"]);
    expect(admin.shopifyAdminGraphql).toHaveBeenCalledTimes(4);
  });

  it("classifies supported topics into explicit repair policy", () => {
    const orderPolicy = classifyShopifySyncWebhookTopic("ORDERS_UPDATED");
    const refundPolicy = classifyShopifySyncWebhookTopic("REFUNDS_CREATE");
    const ignoredPolicy = classifyShopifySyncWebhookTopic("PRODUCTS_UPDATE");

    expect(orderPolicy).toEqual(
      expect.objectContaining({
        supported: true,
        entity: "orders",
        action: "update",
        recentTargets: { orders: true, returns: false },
        allowHistorical: false,
        triggerReason: "webhook:orders:update",
      })
    );
    expect(refundPolicy).toEqual(
      expect.objectContaining({
        supported: true,
        entity: "refunds",
        action: "create",
        recentTargets: { orders: true, returns: true },
      })
    );
    expect(ignoredPolicy).toEqual(
      expect.objectContaining({
        supported: false,
        shouldTriggerSync: false,
        recentTargets: { orders: false, returns: false },
      })
    );
  });
});
