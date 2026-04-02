import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

const db = await import("@/lib/db");
const {
  classifyShopifyCustomerEventType,
  getShopifyCustomerEventsAggregate,
} = await import("@/lib/shopify/customer-events-analytics");

describe("classifyShopifyCustomerEventType", () => {
  it("normalizes common Shopify customer event names", () => {
    expect(classifyShopifyCustomerEventType("page_viewed")).toBe("page_view");
    expect(classifyShopifyCustomerEventType("view_item")).toBe("product_view");
    expect(classifyShopifyCustomerEventType("add_to_cart")).toBe("add_to_cart");
    expect(classifyShopifyCustomerEventType("checkout_started")).toBe("begin_checkout");
    expect(classifyShopifyCustomerEventType("purchase")).toBe("purchase");
    expect(classifyShopifyCustomerEventType("unknown_custom_event")).toBe("other");
  });

  it("computes session-derived funnel rates safely", async () => {
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn().mockResolvedValue([
        {
          date: "2026-03-30",
          sessions: 4,
          page_views: 10,
          product_views: 5,
          add_to_cart: 3,
          begin_checkout: 2,
          purchases: 1,
          product_view_sessions: 3,
          add_to_cart_sessions: 2,
          begin_checkout_sessions: 2,
          purchase_sessions: 1,
        },
      ]) as never
    );

    const result = await getShopifyCustomerEventsAggregate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result).toEqual(
      expect.objectContaining({
        sessions: 4,
        productViewSessions: 3,
        addToCartSessions: 2,
        beginCheckoutSessions: 2,
        purchaseSessions: 1,
        productViewRate: 75,
        checkoutRate: 50,
        conversionRate: 25,
      })
    );
    expect(result.daily[0]).toEqual(
      expect.objectContaining({
        productViewRate: 75,
        checkoutRate: 50,
        conversionRate: 25,
      })
    );
  });
});
