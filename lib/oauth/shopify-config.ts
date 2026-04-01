import { logStartupError, logStartupEvent } from "@/lib/startup-diagnostics";

let hasLoggedShopifyConfig = false;

function isUnsafePublicHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0"
  );
}

function validatePublicShopifyUrl(input: {
  label: string;
  value: string;
  allowLocalhostInDevelopment?: boolean;
}) {
  const allowLocalhostInDevelopment =
    input.allowLocalhostInDevelopment !== false &&
    process.env.NODE_ENV !== "production";

  try {
    const url = new URL(input.value);
    if (isUnsafePublicHostname(url.hostname) && !allowLocalhostInDevelopment) {
      throw new Error(
        `${input.label} resolved to unsafe public hostname: ${url.hostname}`,
      );
    }
    return url;
  } catch (error) {
    logStartupError("shopify_config_invalid_public_url", error, {
      label: input.label,
      value: input.value,
      nodeEnv: process.env.NODE_ENV ?? "unknown",
    });
    throw error;
  }
}

function logShopifyConfigDiagnostics(appUrl: string, redirectUri: string) {
  if (hasLoggedShopifyConfig) return;
  hasLoggedShopifyConfig = true;

  try {
    const app = validatePublicShopifyUrl({
      label: "SHOPIFY_APP_URL",
      value: appUrl,
    });
    const redirect = validatePublicShopifyUrl({
      label: "SHOPIFY_REDIRECT_URI",
      value: redirectUri,
      allowLocalhostInDevelopment: false,
    });
    logStartupEvent("shopify_config_resolved", {
      appUrl: app.toString(),
      redirectUri: redirect.toString(),
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() ?? null,
      shopifyAppUrl: process.env.SHOPIFY_APP_URL?.trim() ?? null,
      shopifyRedirectUri: process.env.SHOPIFY_REDIRECT_URI?.trim() ?? null,
    });

    if (process.env.NODE_ENV === "production" && isUnsafePublicHostname(app.hostname)) {
      logStartupEvent("shopify_config_warning_unsafe_public_app_url", {
        appUrl: app.toString(),
      });
    }

    if (redirect.pathname !== "/api/oauth/shopify/callback") {
      logStartupEvent("shopify_config_warning_unexpected_callback_path", {
        redirectUri: redirect.toString(),
      });
    }

    if (redirect.origin !== app.origin) {
      logStartupEvent("shopify_config_warning_origin_mismatch", {
        appUrl: app.toString(),
        redirectUri: redirect.toString(),
      });
    }
  } catch {
    logStartupEvent("shopify_config_warning_invalid_url", {
      appUrl,
      redirectUri,
    });
  }
}

/**
 * Shopify OAuth configuration.
 *
 * Required env vars:
 *   SHOPIFY_CLIENT_ID     – Shopify App API key
 *   SHOPIFY_CLIENT_SECRET – Shopify App API secret
 *   SHOPIFY_SCOPES        – Comma-separated OAuth scopes
 *   NEXT_PUBLIC_APP_URL   – e.g. https://localhost:3000 or https://yourdomain.com
 */

export const SHOPIFY_CONFIG = {
  get clientId() {
    const v = process.env.SHOPIFY_CLIENT_ID;
    if (!v)
      throw new Error("SHOPIFY_CLIENT_ID is not set in environment variables.");
    return v;
  },
  get clientSecret() {
    const v = process.env.SHOPIFY_CLIENT_SECRET;
    if (!v)
      throw new Error(
        "SHOPIFY_CLIENT_SECRET is not set in environment variables.",
      );
    return v;
  },
  get scopes() {
    const v = process.env.SHOPIFY_SCOPES;
    if (!v)
      throw new Error("SHOPIFY_SCOPES is not set in environment variables.");
    return v;
  },
  get appUrl() {
    const v =
      process.env.SHOPIFY_APP_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      "http://localhost:3000";
    return v;
  },
  get redirectUri() {
    const v = process.env.SHOPIFY_REDIRECT_URI?.trim();
    const redirectUri = v || `${this.appUrl}/api/oauth/shopify/callback`;
    logShopifyConfigDiagnostics(this.appUrl, redirectUri);
    return redirectUri;
  },
  get validatedAppUrl() {
    const url = validatePublicShopifyUrl({
      label: "SHOPIFY_APP_URL",
      value: this.appUrl,
    });
    return url.toString();
  },
  get validatedAppOrigin() {
    return new URL(this.validatedAppUrl).origin;
  },
  /**
   * Build the authorization URL for a given shop domain.
   * @param shop – e.g. "mystore.myshopify.com"
   */
  authUrl(shop: string) {
    return `https://${shop}/admin/oauth/authorize`;
  },
  /**
   * Build the access token exchange URL for a given shop domain.
   * @param shop – e.g. "mystore.myshopify.com"
   */
  tokenUrl(shop: string) {
    return `https://${shop}/admin/oauth/access_token`;
  },
  /**
   * Build the shop info API URL for a given shop domain.
   * @param shop – e.g. "mystore.myshopify.com"
   */
  shopInfoUrl(shop: string) {
    return `https://${shop}/admin/api/2024-10/shop.json`;
  },
  appStoreUrl: "https://apps.shopify.com/adsecute",
} as const;
