import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/oauth/shopify-config", () => ({
  SHOPIFY_CONFIG: {
    clientId: "client_id",
    clientSecret: "secret",
    scopes:
      "read_all_orders,read_analytics,read_customer_events,read_customers,read_discounts,read_fulfillments,read_inventory,read_locations,read_marketing_events,read_markets,read_online_store_pages,read_orders,read_price_rules,read_product_listings,read_products,read_reports,read_returns,write_pixels",
    redirectUri: "https://adsecute.com/api/oauth/shopify/callback",
    authUrl: (shop: string) => `https://${shop}/admin/oauth/authorize`,
  },
}));

vi.mock("@/lib/shopify/oauth-hmac", () => ({
  verifyShopifyQueryHmac: vi.fn(),
}));

const auth = await import("@/lib/auth");
const hmac = await import("@/lib/shopify/oauth-hmac");
const { GET } = await import("@/app/api/oauth/shopify/start/route");

describe("GET /api/oauth/shopify/start", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(auth.getSessionFromRequest).mockResolvedValue(null);
  });

  it("accepts valid signed install requests", async () => {
    vi.mocked(hmac.verifyShopifyQueryHmac).mockReturnValue(true);

    const response = await GET(
      new NextRequest(
        "https://adsecute.com/api/oauth/shopify/start?shop=test-shop.myshopify.com&hmac=ok&timestamp=1711939200",
      ),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain(
      "https://test-shop.myshopify.com/admin/oauth/authorize",
    );
    expect(location).toContain(
      "redirect_uri=https%3A%2F%2Fadsecute.com%2Fapi%2Foauth%2Fshopify%2Fcallback",
    );
    expect(location).toContain(
      "scope=read_all_orders%2Cread_analytics%2Cread_customer_events%2Cread_customers%2Cread_discounts%2Cread_fulfillments%2Cread_inventory%2Cread_locations%2Cread_marketing_events%2Cread_markets%2Cread_online_store_pages%2Cread_orders%2Cread_price_rules%2Cread_product_listings%2Cread_products%2Cread_reports%2Cread_returns%2Cwrite_pixels",
    );
    expect(location).toContain("state=");
  });

  it("falls back safely on invalid signed install requests", async () => {
    vi.mocked(hmac.verifyShopifyQueryHmac).mockReturnValue(false);

    const response = await GET(
      new NextRequest(
        "https://adsecute.com/api/oauth/shopify/start?shop=test-shop.myshopify.com&hmac=bad&timestamp=1711939200",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://adsecute.com/shopify/connect",
    );
  });

  it("does not redirect browsers back to a bind-all dev host", async () => {
    vi.mocked(hmac.verifyShopifyQueryHmac).mockReturnValue(false);

    const response = await GET(
      new NextRequest(
        "http://0.0.0.0:3000/api/oauth/shopify/start?shop=test-shop.myshopify.com&hmac=bad&timestamp=1711939200",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/shopify/connect",
    );
  });
});
