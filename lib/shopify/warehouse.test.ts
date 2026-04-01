import { describe, expect, it } from "vitest";

import { buildShopifyRawSnapshotHash } from "@/lib/shopify/warehouse";

describe("shopify warehouse groundwork", () => {
  it("builds a stable snapshot hash for the same payload window", () => {
    const payload = { orders: [{ id: "gid://shopify/Order/1", total: "42.00" }] };
    const first = buildShopifyRawSnapshotHash({
      businessId: "biz_1",
      providerAccountId: "test-shop.myshopify.com",
      endpointName: "orders",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      payload,
    });
    const second = buildShopifyRawSnapshotHash({
      businessId: "biz_1",
      providerAccountId: "test-shop.myshopify.com",
      endpointName: "orders",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      payload,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{40}$/);
  });

  it("changes the hash when the requested endpoint window changes", () => {
    const payload = { orders: [{ id: "gid://shopify/Order/1", total: "42.00" }] };
    const first = buildShopifyRawSnapshotHash({
      businessId: "biz_1",
      providerAccountId: "test-shop.myshopify.com",
      endpointName: "orders",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      payload,
    });
    const second = buildShopifyRawSnapshotHash({
      businessId: "biz_1",
      providerAccountId: "test-shop.myshopify.com",
      endpointName: "customer_events",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      payload,
    });

    expect(first).not.toBe(second);
  });
});
