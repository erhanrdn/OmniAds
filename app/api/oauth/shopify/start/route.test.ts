import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/oauth/shopify-config", () => ({
  SHOPIFY_CONFIG: {
    clientId: "client_id",
    clientSecret: "secret",
    scopes: "read_orders",
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
});
