/**
 * Meta OAuth configuration.
 *
 * Required env vars:
 *   META_APP_ID         – Facebook App ID
 *   META_APP_SECRET     – Facebook App Secret
 *   NEXT_PUBLIC_APP_URL – e.g. http://localhost:3000 or https://yourdomain.com
 */

export const META_CONFIG = {
  get appId() {
    const v = process.env.META_APP_ID;
    if (!v) throw new Error("META_APP_ID is not set in environment variables.");
    return v;
  },
  get appSecret() {
    const v = process.env.META_APP_SECRET;
    if (!v) throw new Error("META_APP_SECRET is not set in environment variables.");
    return v;
  },
  get redirectUri() {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/api/oauth/meta/callback`;
  },
  authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
  tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
  meUrl: "https://graph.facebook.com/v21.0/me",
  scopes: [
    "ads_read",
    "ads_management",
    "business_management",
    "read_insights",
  ],
} as const;
