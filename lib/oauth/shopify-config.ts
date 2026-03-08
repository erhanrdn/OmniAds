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
  get redirectUri() {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/api/oauth/shopify/callback`;
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
} as const;

/**
 * Normalize a user-entered shop value to a valid `*.myshopify.com` hostname.
 * Accepts:
 *   - "mystore"
 *   - "mystore.myshopify.com"
 *   - "https://mystore.myshopify.com"
 *   - "https://mystore.myshopify.com/admin"
 * Returns null if the input cannot be normalized.
 */
export function normalizeShopDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  // If it looks like a URL, extract the hostname
  let hostname = trimmed;
  if (hostname.startsWith("http://") || hostname.startsWith("https://")) {
    try {
      hostname = new URL(hostname).hostname;
    } catch {
      return null;
    }
  }

  // Remove any path after the hostname
  hostname = hostname.split("/")[0];

  // If bare name (no dots), append .myshopify.com
  if (!hostname.includes(".")) {
    hostname = `${hostname}.myshopify.com`;
  }

  // Basic validation: must end with .myshopify.com
  if (!hostname.endsWith(".myshopify.com")) return null;

  // Must have at least one character before the suffix
  const prefix = hostname.replace(".myshopify.com", "");
  if (!prefix || !/^[a-z0-9][a-z0-9-]*$/.test(prefix)) return null;

  return hostname;
}
