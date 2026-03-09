import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";

/**
 * Normalized Google Ads customer account.
 */
export interface GoogleAdsCustomerNormalized {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  isManager: boolean;
}

export interface GoogleAdsAccountsFetchResult {
  ok: boolean;
  error?: string;
  customers: GoogleAdsCustomerNormalized[];
}

const GOOGLE_ADS_FETCH_FAILED_MESSAGE =
  "Could not load accessible Google Ads accounts.";

interface GoogleAdsHttpResult {
  ok: boolean;
  status: number;
  isJson: boolean;
  bodyText: string;
  payload: unknown;
}

interface GoogleAdsErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Refreshes a Google OAuth access token using a stored refresh token.
 * Returns the new access token and its expiry in seconds.
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const res = await fetch(GOOGLE_CONFIG.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CONFIG.clientId,
      client_secret: GOOGLE_CONFIG.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(
      data.error_description ||
        data.error ||
        "Failed to refresh Google access token.",
    );
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

/**
 * Fetches all accessible Google Ads customer accounts for the authenticated user.
 * Flow:
 *   1) POST customers:listAccessibleCustomers
 *   2) For each customer ID, query customer metadata via googleAds:search
 */
export async function fetchGoogleAdsAccounts(
  accessToken: string,
): Promise<GoogleAdsAccountsFetchResult> {
  const developerToken = GOOGLE_CONFIG.developerToken;

  const listUrl = `${GOOGLE_CONFIG.adsApiBase}/customers:listAccessibleCustomers`;
  const listResult = await googleAdsRequest({
    url: listUrl,
    method: "POST",
    accessToken,
    developerToken,
    body: {},
    logLabel: "customers:listAccessibleCustomers",
  });

  if (!listResult.ok || hasGoogleAdsError(listResult.payload)) {
    const googleMessage = getGoogleAdsErrorMessage(listResult.payload);
    console.error("[google-ads-accounts] accessible customers fetch failed", {
      status: listResult.status,
      isJson: listResult.isJson,
      googleMessage,
      bodyExcerpt: listResult.bodyText.slice(0, 200),
    });
    return {
      ok: false,
      error: GOOGLE_ADS_FETCH_FAILED_MESSAGE,
      customers: [],
    };
  }

  const resourceNames = readResourceNames(listResult.payload);
  console.log("[google-ads-accounts] accessible customers response", {
    count: resourceNames.length,
  });

  const customerIds = resourceNames
    .map((name) => name.replace("customers/", "").trim())
    .filter((id) => /^\d+$/.test(id));

  if (customerIds.length === 0) {
    return { ok: true, customers: [] };
  }

  const detailResults = await Promise.all(
    customerIds.map((customerId) =>
      fetchCustomerDetails({
        accessToken,
        developerToken,
        customerId,
      }),
    ),
  );

  const customers = detailResults.map((detail, index) => {
    const fallbackId = customerIds[index];
    return (
      detail ?? {
        id: fallbackId,
        name: fallbackId,
        currency: null,
        timezone: null,
        isManager: false,
      }
    );
  });

  console.log("[google-ads-accounts] customer detail fetch summary", {
    requested: customerIds.length,
    succeeded: detailResults.filter((item) => item !== null).length,
  });

  return { ok: true, customers };
}

async function fetchCustomerDetails({
  accessToken,
  developerToken,
  customerId,
}: {
  accessToken: string;
  developerToken: string;
  customerId: string;
}): Promise<GoogleAdsCustomerNormalized | null> {
  const searchUrl = `${GOOGLE_CONFIG.adsApiBase}/customers/${customerId}/googleAds:search`;
  const query =
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer";

  const result = await googleAdsRequest({
    url: searchUrl,
    method: "POST",
    accessToken,
    developerToken,
    body: { query },
    logLabel: `googleAds:search customer=${customerId}`,
  });

  if (!result.ok || hasGoogleAdsError(result.payload)) {
    console.warn("[google-ads-accounts] customer details fetch failed", {
      customerId,
      status: result.status,
      isJson: result.isJson,
      googleMessage: getGoogleAdsErrorMessage(result.payload),
      bodyExcerpt: result.bodyText.slice(0, 180),
    });
    return null;
  }

  const customer = readCustomerFromSearchPayload(result.payload);
  if (!customer) return null;

  return {
    id: customer.id || customerId,
    name: customer.name || customer.id || customerId,
    currency: customer.currency,
    timezone: customer.timezone,
    isManager: customer.isManager,
  };
}

async function googleAdsRequest({
  url,
  method,
  accessToken,
  developerToken,
  body,
  logLabel,
}: {
  url: string;
  method: "GET" | "POST";
  accessToken: string;
  developerToken: string;
  body?: unknown;
  logLabel: string;
}): Promise<GoogleAdsHttpResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    Accept: "application/json",
  };
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    cache: "no-store",
  });

  const bodyText = await res.text().catch(() => "");
  const contentType = res.headers.get("content-type") ?? "";
  const parsed = safeJsonParse(bodyText);
  const isJson =
    contentType.toLowerCase().includes("application/json") || parsed !== null;

  console.log("[google-ads-accounts] request", {
    endpoint: logLabel,
    method,
    status: res.status,
    isJson,
  });

  return {
    ok: res.ok,
    status: res.status,
    isJson,
    bodyText,
    payload: parsed,
  };
}

function safeJsonParse(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hasGoogleAdsError(payload: unknown): payload is GoogleAdsErrorPayload {
  if (!payload || typeof payload !== "object") return false;
  return "error" in payload;
}

function getGoogleAdsErrorMessage(payload: unknown): string | null {
  if (!hasGoogleAdsError(payload)) return null;
  const message = payload.error?.message;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : null;
}

function readResourceNames(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const resourceNames = (payload as { resourceNames?: unknown }).resourceNames;
  if (!Array.isArray(resourceNames)) return [];
  return resourceNames.filter((item): item is string => typeof item === "string");
}

function readCustomerFromSearchPayload(payload: unknown): {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  isManager: boolean;
} | null {
  if (!payload || typeof payload !== "object") return null;

  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) return null;

  const first = results[0] as { customer?: unknown };
  if (!first || typeof first !== "object" || !first.customer || typeof first.customer !== "object") {
    return null;
  }

  const customer = first.customer as {
    id?: string | number;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
    manager?: boolean;
  };

  const id =
    typeof customer.id === "number"
      ? String(customer.id)
      : typeof customer.id === "string"
      ? customer.id
      : "";

  return {
    id,
    name: typeof customer.descriptiveName === "string" ? customer.descriptiveName : "",
    currency: typeof customer.currencyCode === "string" ? customer.currencyCode : null,
    timezone: typeof customer.timeZone === "string" ? customer.timeZone : null,
    isManager: customer.manager === true,
  };
}
