import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/request-language", () => ({
  resolveRequestLanguage: vi.fn().mockResolvedValue("en"),
}));

vi.mock("@/lib/shopify/oauth-hmac", () => ({
  verifyShopifyQueryHmac: vi.fn(),
}));

vi.mock("@/lib/oauth/shopify-config", () => ({
  SHOPIFY_CONFIG: {
    appUrl: "https://adsecute.com",
    validatedAppUrl: "https://adsecute.com/",
    clientId: "client_id",
    clientSecret: "secret",
    tokenUrl: () => "https://shopify.test/admin/oauth/access_token",
    shopInfoUrl: () => "https://shopify.test/admin/api/2024-10/shop.json",
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  upsertIntegration: vi.fn(),
}));

vi.mock("@/lib/account-store", () => ({
  updateBusinessCurrency: vi.fn(),
}));

vi.mock("@/lib/shopify/install-context", () => ({
  createShopifyInstallContext: vi.fn(),
}));

const hmac = await import("@/lib/shopify/oauth-hmac");
const access = await import("@/lib/access");
const integrations = await import("@/lib/integrations");
const installContext = await import("@/lib/shopify/install-context");
const { GET } = await import("@/app/api/oauth/shopify/callback/route");

describe("GET /api/oauth/shopify/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects invalid HMAC callback requests", async () => {
    vi.mocked(hmac.verifyShopifyQueryHmac).mockReturnValue(false);

    const response = await GET(
      new NextRequest(
        "https://adsecute.com/api/oauth/shopify/callback?code=abc&shop=test-shop.myshopify.com&state=opaque&hmac=bad&timestamp=1711939200",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "https://adsecute.com/integrations/callback/shopify?status=error",
    );
  });

  it("creates a pending install context when no verified business is available", async () => {
    vi.mocked(hmac.verifyShopifyQueryHmac).mockReturnValue(true);
    vi.mocked(installContext.createShopifyInstallContext).mockResolvedValue({
      id: "ctx_1",
      token: "ctx_token",
      shop_domain: "test-shop.myshopify.com",
      shop_name: "Test Shop",
      access_token: "permanent_token",
      scopes: "read_orders",
      metadata: { currency: "USD" },
      return_to: "/integrations",
      session_id: null,
      user_id: null,
      preferred_business_id: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    } as never);
    vi.mocked(global.fetch as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "permanent_token",
          scope: "read_orders",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          shop: {
            name: "Test Shop",
            currency: "USD",
          },
        }),
      });

    const response = await GET(
      new NextRequest(
        "https://adsecute.com/api/oauth/shopify/callback?code=abc&shop=test-shop.myshopify.com&state=opaque&hmac=ok&timestamp=1711939200",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://adsecute.com/shopify/connect?context=ctx_token",
    );
  });

  it("directly upserts the integration when state and business access are verified", async () => {
    const state = Buffer.from(
      JSON.stringify({
        businessId: "biz_1",
        returnTo: "/integrations",
      }),
    ).toString("base64url");

    vi.mocked(hmac.verifyShopifyQueryHmac).mockReturnValue(true);
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(integrations.upsertIntegration).mockResolvedValue({
      id: "int_1",
      provider: "shopify",
      provider_account_id: "test-shop.myshopify.com",
      provider_account_name: "Test Shop",
      connected_at: null,
    } as never);
    vi.mocked(global.fetch as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "permanent_token",
          scope: "read_orders",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          shop: {
            name: "Test Shop",
            currency: "USD",
          },
        }),
      });

    const request = new NextRequest(
      `https://adsecute.com/api/oauth/shopify/callback?code=abc&shop=test-shop.myshopify.com&state=${state}&hmac=ok&timestamp=1711939200`,
      {
        headers: {
          cookie: `shopify_oauth_state=${state}`,
        },
      },
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "https://adsecute.com/integrations/callback/shopify?status=success&businessId=biz_1&integrationId=int_1",
    );
  });
});
