import { describe, expect, it } from "vitest";
import { verifyShopifyQueryHmac } from "@/lib/shopify/oauth-hmac";
import crypto from "crypto";

function signQuery(input: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

describe("verifyShopifyQueryHmac", () => {
  it("accepts a valid raw signed query", () => {
    const secret = "test_secret";
    const base =
      "code=abc123&host=admin.shopify.com%2Fstore%2Fdemo&shop=test-shop.myshopify.com&state=opaque&timestamp=1711939200";
    const hmac = signQuery(base, secret);
    const url = new URL(`https://adsecute.com/api/oauth/shopify/callback?${base}&hmac=${hmac}`);

    expect(
      verifyShopifyQueryHmac({
        url,
        clientSecret: secret,
      }),
    ).toBe(true);
  });

  it("rejects an invalid signed query", () => {
    const url = new URL(
      "https://adsecute.com/api/oauth/shopify/callback?code=abc123&shop=test-shop.myshopify.com&timestamp=1711939200&hmac=deadbeef",
    );

    expect(
      verifyShopifyQueryHmac({
        url,
        clientSecret: "test_secret",
      }),
    ).toBe(false);
  });
});
