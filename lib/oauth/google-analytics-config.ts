/**
 * Google Analytics OAuth configuration.
 *
 * Uses the same Google OAuth client credentials as Google Ads
 * (GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET) since they share
 * the same Google Cloud project.
 *
 * GA-specific env vars:
 *   GOOGLE_ANALYTICS_REDIRECT_URI – callback URL (defaults to /api/oauth/google-analytics/callback)
 *   GOOGLE_ANALYTICS_SCOPES       – defaults to analytics.readonly
 */

export const GA_CONFIG = {
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
  get redirectUri() {
    const explicit = process.env.GOOGLE_ANALYTICS_REDIRECT_URI;
    if (explicit) return explicit;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/api/oauth/google-analytics/callback`;
  },
  get scopes() {
    const raw = process.env.GOOGLE_ANALYTICS_SCOPES;
    const analyticsScopes = raw
      ? raw.split(/[\s,]+/).filter(Boolean)
      : ["https://www.googleapis.com/auth/analytics.readonly"];
    // Always include userinfo scopes — needed for provider identity in callback
    const required = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ];
    return [...new Set([...analyticsScopes, ...required])];
  },
  authUrl: "https://accounts.google.com/o/oauth2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userinfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  /** Google Analytics Admin API base for account/property discovery */
  adminApiBase: "https://analyticsadmin.googleapis.com/v1beta",
} as const;
