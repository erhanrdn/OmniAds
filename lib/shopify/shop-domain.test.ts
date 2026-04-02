import { describe, expect, it } from "vitest";

import {
  isValidShopifyShopDomain,
  normalizeShopifyShopDomain,
} from "@/lib/shopify/shop-domain";

describe("shopify shop domain helpers", () => {
  it("normalizes valid domains", () => {
    expect(normalizeShopifyShopDomain(" Test-Shop.myshopify.com ")).toBe(
      "test-shop.myshopify.com",
    );
  });

  it("rejects malformed domains", () => {
    expect(normalizeShopifyShopDomain("not-shopify.example.com")).toBeNull();
    expect(isValidShopifyShopDomain("invalid domain")).toBe(false);
  });
});
