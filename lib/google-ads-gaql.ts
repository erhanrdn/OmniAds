import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import { refreshGoogleAccessToken } from "@/lib/google-ads-accounts";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";

interface GaqlSearchResult {
  results?: Array<{
    campaign?: Record<string, unknown>;
    adGroup?: Record<string, unknown>;
    adGroupAd?: Record<string, unknown>;
    searchTermView?: Record<string, unknown>;
    shoppingProductProductView?: Record<string, unknown>;
    assetGroupAsset?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  fieldMask?: string;
}

interface GoogleAdsApiError {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      errorCode?: {
        googleAdsFailure?: {
          errors?: Array<{
            errorCode?: string;
            message?: string;
          }>;
        };
      };
    }>;
  };
}

export class GoogleAdsQueryError extends Error {
  status: number;
  apiStatus?: string;
  apiErrorCode?: string;

  constructor(params: {
    message: string;
    status: number;
    apiStatus?: string;
    apiErrorCode?: string;
  }) {
    super(params.message);
    this.name = "GoogleAdsQueryError";
    this.status = params.status;
    this.apiStatus = params.apiStatus;
    this.apiErrorCode = params.apiErrorCode;
  }
}

export interface GoogleAdsAccountQueryFailure {
  customerId: string;
  message: string;
  status?: number;
  apiStatus?: string;
  apiErrorCode?: string;
}

export function getGoogleAdsFailureMessage(
  failures: GoogleAdsAccountQueryFailure[],
): string {
  if (failures.length === 0) {
    return "Google Ads query failed.";
  }
  const first = failures[0];
  if (first.apiErrorCode === "DEVELOPER_TOKEN_INVALID") {
    return "Google Ads developer token is invalid. Reconnect Google integration with a valid developer token.";
  }
  if (first.apiStatus === "UNAUTHENTICATED") {
    return "Google Ads authentication failed. Reconnect Google integration.";
  }
  if (first.apiStatus === "PERMISSION_DENIED") {
    return "Google Ads permission denied for the assigned account. Check account access in Integrations.";
  }
  return first.message || "Google Ads query failed.";
}

/**
 * Execute a GAQL query against a Google Ads customer account.
 * Handles token refresh if needed.
 */
export async function executeGaqlQuery(params: {
  businessId: string;
  customerId: string;
  query: string;
}): Promise<GaqlSearchResult> {
  let integration = await getIntegration(params.businessId, "google");

  if (!integration || !integration.access_token) {
    throw new Error("Google Ads integration not found or not connected");
  }

  let accessToken = integration.access_token;

  // Check if token needs refresh
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    if (now >= expiresAt && integration.refresh_token) {
      try {
        const refreshed = await refreshGoogleAccessToken(
          integration.refresh_token,
        );
        await upsertIntegration({
          businessId: params.businessId,
          provider: "google",
          status: "connected",
          accessToken: refreshed.accessToken,
          refreshToken: integration.refresh_token,
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        });
        accessToken = refreshed.accessToken;
      } catch (error) {
        console.error("[google-ads-gaql] token refresh failed", error);
        throw new Error("Failed to refresh Google Ads access token");
      }
    }
  }

  const searchUrl = `${GOOGLE_CONFIG.adsApiBase}/customers/${params.customerId.replace(/^customers\//, "")}/googleAds:search`;

  const response = await fetch(searchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_CONFIG.developerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: params.query,
      pageSize: 10000,
    }),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as GoogleAdsApiError;

    // google-ads-gaql.ts içinde console.error kısmını bununla değiştirin:
    console.error("[google-ads-gaql] query failed details:", {
      customerId: params.customerId,
      status: response.status,
      message: error.error?.message,
      // Hata detaylarını daha güvenli bir şekilde logla
      apiErrors: JSON.stringify(error.error?.details, null, 2),
      fullQuery: params.query,
    });

    const message =
      error.error?.message || `Google Ads API error: ${response.status}`;
    console.error("[google-ads-gaql] query failed", {
      customerId: params.customerId,
      status: response.status,
      message,
      query: params.query.slice(0, 100),
    });
    const firstDetailError =
      error.error?.details?.[0]?.errorCode?.googleAdsFailure?.errors?.[0];
    let apiErrorCode: string | undefined;
    if (
      firstDetailError?.errorCode &&
      typeof firstDetailError.errorCode === "object"
    ) {
      const entry = Object.entries(firstDetailError.errorCode).find(
        ([, value]) => Boolean(value),
      );
      if (entry) apiErrorCode = String(entry[1]);
    }

    throw new GoogleAdsQueryError({
      message,
      status: response.status,
      apiStatus: error.error?.status,
      apiErrorCode,
    });
  }

  return data as GaqlSearchResult;
}

/**
 * Get assigned Google Ads customer accounts for a business
 */
export async function getAssignedGoogleAccounts(
  businessId: string,
): Promise<string[]> {
  const assignment = await getProviderAccountAssignments(businessId, "google");
  return assignment?.account_ids || [];
}

export async function executeGaqlForAccounts(params: {
  businessId: string;
  customerIds: string[];
  query: string;
}): Promise<{
  results: GaqlSearchResult[];
  failures: GoogleAdsAccountQueryFailure[];
}> {
  const settled = await Promise.all(
    params.customerIds.map(async (customerId) => {
      try {
        const result = await executeGaqlQuery({
          businessId: params.businessId,
          customerId,
          query: params.query,
        });
        return { result };
      } catch (error) {
        const queryError = error as GoogleAdsQueryError;
        return {
          error: {
            customerId,
            message: queryError.message || "Google Ads query failed.",
            status: queryError.status,
            apiStatus: queryError.apiStatus,
            apiErrorCode: queryError.apiErrorCode,
          } satisfies GoogleAdsAccountQueryFailure,
        };
      }
    }),
  );

  return {
    results: settled
      .map((entry) => entry.result)
      .filter((entry): entry is GaqlSearchResult => Boolean(entry)),
    failures: settled.flatMap((entry) => (entry.error ? [entry.error] : [])),
  };
}

/**
 * Normalize date range parameter to YYYY-MM-DD format for GAQL
 */
export function getDateRangeForQuery(
  dateRange: "7" | "14" | "30" | "custom",
  customStart?: string,
  customEnd?: string,
): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date(endDate);

  if (dateRange === "7") {
    startDate.setDate(endDate.getDate() - 7);
  } else if (dateRange === "14") {
    startDate.setDate(endDate.getDate() - 14);
  } else if (dateRange === "30") {
    startDate.setDate(endDate.getDate() - 30);
  } else if (dateRange === "custom" && customStart && customEnd) {
    return {
      startDate: customStart,
      endDate: customEnd,
    };
  }

  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

/**
 * Normalize cost from micros to standard currency units
 */
export function normalizeCostMicros(micros: number | string): number {
  const value = typeof micros === "string" ? parseInt(micros, 10) : micros;
  return Number((value / 1000000).toFixed(2));
}

/**
 * Calculate ROAS with safe divide
 */
export function calculateRoas(
  conversionValue: number | string,
  cost: number,
): number {
  const value =
    typeof conversionValue === "string"
      ? parseFloat(conversionValue)
      : conversionValue;
  if (cost === 0) return 0;
  return Number((value / cost).toFixed(2));
}

/**
 * Calculate CPA with safe divide
 */
export function calculateCpa(
  cost: number,
  conversions: number | string,
): number {
  const convCount =
    typeof conversions === "string" ? parseInt(conversions, 10) : conversions;
  if (convCount === 0) return 0;
  return Number((cost / convCount).toFixed(2));
}

/**
 * Calculate CTR with safe divide
 */
export function calculateCtr(
  clicks: number | string,
  impressions: number | string,
): number {
  const c = typeof clicks === "string" ? parseInt(clicks, 10) : clicks;
  const i =
    typeof impressions === "string" ? parseInt(impressions, 10) : impressions;
  if (i === 0) return 0;
  return Number(((c / i) * 100).toFixed(2));
}

/**
 * Calculate CPM with safe divide
 */
export function calculateCpm(
  cost: number,
  impressions: number | string,
): number {
  const i =
    typeof impressions === "string" ? parseInt(impressions, 10) : impressions;
  if (i === 0) return 0;
  return Number(((cost / i) * 1000).toFixed(2));
}

/**
 * Normalize Google Ads status enum to UI-safe label
 */
export function normalizeStatus(
  status: string | undefined,
): "active" | "paused" | "removed" {
  if (!status) return "paused";
  const lower = status.toLowerCase();
  if (lower === "enabled") return "active";
  if (lower === "active") return "active";
  if (lower === "paused") return "paused";
  if (lower === "removed") return "removed";
  return "paused";
}

/**
 * Map Google Ads advertising channel type to readable label
 */
export function normalizeChannelType(channelType: string | undefined): string {
  if (!channelType) return "Unknown";
  const lower = channelType.toLowerCase();
  if (lower.includes("search")) return "Search";
  if (lower.includes("display")) return "Display";
  if (lower.includes("shopping")) return "Shopping";
  if (lower.includes("video")) return "Video";
  if (lower.includes("performance")) return "Performance Max";
  if (lower.includes("app")) return "App";
  return channelType;
}
