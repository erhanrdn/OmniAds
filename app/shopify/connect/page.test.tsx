import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect,
}));

describe("GET /shopify/connect page", () => {
  beforeEach(() => {
    vi.resetModules();
    redirect.mockReset();
  });

  it("redirects Shopify signed installs with a relative start path", async () => {
    const module = await import("@/app/shopify/connect/page");

    await module.default({
      searchParams: Promise.resolve({
        shop: "test-shop.myshopify.com",
        hmac: "deadbeef",
        timestamp: "1711939200",
        host: "admin.shopify.com/store/test-shop",
      }),
    });

    expect(redirect).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/api\/oauth\/shopify\/start\?shop=test-shop\.myshopify\.com&hmac=deadbeef&timestamp=1711939200/,
      ),
    );
    expect(String(redirect.mock.calls[0][0])).not.toContain("0.0.0.0");
    expect(String(redirect.mock.calls[0][0])).not.toContain("adsecute.com");
  });
});
