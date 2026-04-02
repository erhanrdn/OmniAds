import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shopify/admin", () => ({
  shopifyAdminGraphql: vi.fn(),
}));

const admin = await import("@/lib/shopify/admin");
const {
  SHOPIFY_SYNC_WEBHOOK_TOPICS,
  buildShopifyWebhookCallbackUrl,
  classifyShopifySyncWebhookTopic,
  resolveShopifySyncWebhookRepairPolicy,
  registerShopifySyncWebhooks,
  verifyShopifySyncWebhooks,
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
    expect(result.created).toEqual(SHOPIFY_SYNC_WEBHOOK_TOPICS.filter((topic) => topic !== "ORDERS_CREATE"));
    expect(admin.shopifyAdminGraphql).toHaveBeenCalledTimes(1 + SHOPIFY_SYNC_WEBHOOK_TOPICS.length - 1);
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
    expect(classifyShopifySyncWebhookTopic("RETURNS_UPDATE")).toEqual(
      expect.objectContaining({
        supported: true,
        entity: "returns",
        shouldTriggerSync: true,
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

  it("expands the repair window for stale webhook payloads", () => {
    const policy = resolveShopifySyncWebhookRepairPolicy({
      topic: "ORDERS_UPDATED",
      payload: {
        id: "order_1",
        updated_at: "2026-03-20T10:00:00Z",
      },
      receivedAt: new Date("2026-04-02T10:00:00Z"),
    });

    expect(policy.eventTimestamp).toBe("2026-03-20T10:00:00.000Z");
    expect(policy.eventAgeDays).toBe(13);
    expect(policy.recentWindowDays).toBe(14);
    expect(policy.windowExpanded).toBe(true);
  });

  it("verifies missing webhook topics without creating duplicates", async () => {
    vi.mocked(admin.shopifyAdminGraphql).mockResolvedValueOnce({
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
    } as never);

    const result = await verifyShopifySyncWebhooks({
      shopId: "test-shop.myshopify.com",
      accessToken: "shpat_test",
    });

    expect(result.missingTopics).toContain("RETURNS_UPDATE");
    expect(result.extraTopics).toEqual([]);
  });
});
