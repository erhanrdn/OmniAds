/**
 * Google OAuth configuration for Google Ads integration.
 *
 * Required env vars:
 *   GOOGLE_ADS_CLIENT_ID       – Google OAuth Client ID
 *   GOOGLE_ADS_CLIENT_SECRET   – Google OAuth Client Secret
 *   GOOGLE_ADS_DEVELOPER_TOKEN – Google Ads API Developer Token
 *   NEXT_PUBLIC_APP_URL        – e.g. https://localhost:3000 or https://yourdomain.com
 */

export const GOOGLE_CONFIG = {
  get clientId() {
    const v = process.env.GOOGLE_ADS_CLIENT_ID;
    if (!v)
      throw new Error(
        "GOOGLE_ADS_CLIENT_ID is not set in environment variables.",
      );
    return v;
  },
  get clientSecret() {
    const v = process.env.GOOGLE_ADS_CLIENT_SECRET;
    if (!v)
      throw new Error(
        "GOOGLE_ADS_CLIENT_SECRET is not set in environment variables.",
      );
    return v;
  },
  get developerToken() {
    const v = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!v)
      throw new Error(
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set in environment variables.",
      );
    return v;
  },
  get redirectUri() {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/api/oauth/google/callback`;
  },
  authUrl: "https://accounts.google.com/o/oauth2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userinfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  scopes: [
    "https://www.googleapis.com/auth/adwords",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
  /** Google Ads REST API base (env override, defaults to v22) */
  get adsApiBase() {
    const raw = (process.env.GOOGLE_ADS_API_VERSION ?? "v22").trim();

    // Allow full URL override (for legacy env values like
    // "https://googleads.googleapis.com/v22").
    if (/^https?:\/\//i.test(raw)) {
      return raw.replace(/\/+$/, "");
    }

    // Support plain numbers ("22"), version tags ("v22"), or path-ish values ("/v22").
    const cleaned = raw.replace(/^\/+/, "");
    const version = cleaned.startsWith("v") ? cleaned : `v${cleaned}`;
    return `https://googleads.googleapis.com/${version}`;
  },
} as const;
