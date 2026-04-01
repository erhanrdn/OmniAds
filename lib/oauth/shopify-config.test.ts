import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
  SHOPIFY_REDIRECT_URI: process.env.SHOPIFY_REDIRECT_URI,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET,
  SHOPIFY_SCOPES: process.env.SHOPIFY_SCOPES,
};

async function loadConfig() {
  vi.resetModules();
  return import("@/lib/oauth/shopify-config");
}

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  process.env.SHOPIFY_APP_URL = ORIGINAL_ENV.SHOPIFY_APP_URL;
  process.env.SHOPIFY_REDIRECT_URI = ORIGINAL_ENV.SHOPIFY_REDIRECT_URI;
  process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_ENV.NEXT_PUBLIC_APP_URL;
  process.env.SHOPIFY_CLIENT_ID = ORIGINAL_ENV.SHOPIFY_CLIENT_ID;
  process.env.SHOPIFY_CLIENT_SECRET = ORIGINAL_ENV.SHOPIFY_CLIENT_SECRET;
  process.env.SHOPIFY_SCOPES = ORIGINAL_ENV.SHOPIFY_SCOPES;
});

describe("SHOPIFY_CONFIG", () => {
  it("rejects unsafe public app URLs in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.SHOPIFY_APP_URL = "https://0.0.0.0:3000";
    process.env.SHOPIFY_REDIRECT_URI = "https://adsecute.com/api/oauth/shopify/callback";

    const { SHOPIFY_CONFIG } = await loadConfig();

    expect(() => SHOPIFY_CONFIG.validatedAppUrl).toThrow(
      /unsafe public hostname/i,
    );
  });

  it("allows localhost app URLs outside production", async () => {
    process.env.NODE_ENV = "development";
    process.env.SHOPIFY_APP_URL = "http://localhost:3000";
    process.env.SHOPIFY_REDIRECT_URI = "http://localhost:3000/api/oauth/shopify/callback";

    const { SHOPIFY_CONFIG } = await loadConfig();

    expect(SHOPIFY_CONFIG.validatedAppUrl).toBe("http://localhost:3000/");
  });
});
