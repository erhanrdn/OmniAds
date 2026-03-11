export const SEARCH_CONSOLE_CONFIG = {
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
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/api/oauth/search_console/callback`;
  },
  authUrl: "https://accounts.google.com/o/oauth2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
} as const;
