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
  vi.unstubAllEnvs();
  if (ORIGINAL_ENV.NODE_ENV === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  } else {
    vi.stubEnv("NODE_ENV", ORIGINAL_ENV.NODE_ENV);
  }
  if (ORIGINAL_ENV.SHOPIFY_APP_URL === undefined) {
    delete (process.env as Record<string, string | undefined>).SHOPIFY_APP_URL;
  } else {
    vi.stubEnv("SHOPIFY_APP_URL", ORIGINAL_ENV.SHOPIFY_APP_URL);
  }
  if (ORIGINAL_ENV.SHOPIFY_REDIRECT_URI === undefined) {
    delete (process.env as Record<string, string | undefined>).SHOPIFY_REDIRECT_URI;
  } else {
    vi.stubEnv("SHOPIFY_REDIRECT_URI", ORIGINAL_ENV.SHOPIFY_REDIRECT_URI);
  }
  if (ORIGINAL_ENV.NEXT_PUBLIC_APP_URL === undefined) {
    delete (process.env as Record<string, string | undefined>).NEXT_PUBLIC_APP_URL;
  } else {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", ORIGINAL_ENV.NEXT_PUBLIC_APP_URL);
  }
  if (ORIGINAL_ENV.SHOPIFY_CLIENT_ID === undefined) {
    delete (process.env as Record<string, string | undefined>).SHOPIFY_CLIENT_ID;
  } else {
    vi.stubEnv("SHOPIFY_CLIENT_ID", ORIGINAL_ENV.SHOPIFY_CLIENT_ID);
  }
  if (ORIGINAL_ENV.SHOPIFY_CLIENT_SECRET === undefined) {
    delete (process.env as Record<string, string | undefined>).SHOPIFY_CLIENT_SECRET;
  } else {
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", ORIGINAL_ENV.SHOPIFY_CLIENT_SECRET);
  }
  if (ORIGINAL_ENV.SHOPIFY_SCOPES === undefined) {
    delete (process.env as Record<string, string | undefined>).SHOPIFY_SCOPES;
  } else {
    vi.stubEnv("SHOPIFY_SCOPES", ORIGINAL_ENV.SHOPIFY_SCOPES);
  }
});

describe("SHOPIFY_CONFIG", () => {
  it("rejects unsafe public app URLs in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHOPIFY_APP_URL", "https://0.0.0.0:3000");
    vi.stubEnv("SHOPIFY_REDIRECT_URI", "https://adsecute.com/api/oauth/shopify/callback");

    const { SHOPIFY_CONFIG } = await loadConfig();

    expect(() => SHOPIFY_CONFIG.validatedAppUrl).toThrow(
      /unsafe public hostname/i,
    );
  });

  it("allows localhost app URLs outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SHOPIFY_APP_URL", "http://localhost:3000");
    vi.stubEnv("SHOPIFY_REDIRECT_URI", "http://localhost:3000/api/oauth/shopify/callback");

    const { SHOPIFY_CONFIG } = await loadConfig();

    expect(SHOPIFY_CONFIG.validatedAppUrl).toBe("http://localhost:3000/");
  });

  it("normalizes bind-all dev URLs before using them in Shopify OAuth redirects", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SHOPIFY_APP_URL", "http://0.0.0.0:3000");
    vi.stubEnv(
      "SHOPIFY_REDIRECT_URI",
      "http://0.0.0.0:3000/api/oauth/shopify/callback",
    );

    const { SHOPIFY_CONFIG } = await loadConfig();

    expect(SHOPIFY_CONFIG.validatedAppUrl).toBe("http://localhost:3000/");
    expect(SHOPIFY_CONFIG.redirectUri).toBe(
      "http://localhost:3000/api/oauth/shopify/callback",
    );
  });

  it("builds the default Shopify redirect URI from the normalized app URL", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SHOPIFY_APP_URL", "http://0.0.0.0:3000");
    vi.stubEnv("SHOPIFY_REDIRECT_URI", "");

    const { SHOPIFY_CONFIG } = await loadConfig();

    expect(SHOPIFY_CONFIG.redirectUri).toBe(
      "http://localhost:3000/api/oauth/shopify/callback",
    );
  });
});
