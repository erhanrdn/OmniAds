import { describe, expect, it } from "vitest";

import { classifyShopifyCustomerEventType } from "@/lib/shopify/customer-events-analytics";

describe("classifyShopifyCustomerEventType", () => {
  it("normalizes common Shopify customer event names", () => {
    expect(classifyShopifyCustomerEventType("page_viewed")).toBe("page_view");
    expect(classifyShopifyCustomerEventType("view_item")).toBe("product_view");
    expect(classifyShopifyCustomerEventType("add_to_cart")).toBe("add_to_cart");
    expect(classifyShopifyCustomerEventType("checkout_started")).toBe("begin_checkout");
    expect(classifyShopifyCustomerEventType("purchase")).toBe("purchase");
    expect(classifyShopifyCustomerEventType("unknown_custom_event")).toBe("other");
  });
});
