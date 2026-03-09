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
  console.log("[google-ads-accounts] 🔹 fetchGoogleAdsAccounts STARTED");

  let developerToken: string;
  try {
    developerToken = GOOGLE_CONFIG.developerToken;
    console.log("[google-ads-accounts] ✓ developerToken loaded");
  } catch (err) {
    console.error("[google-ads-accounts] ❌ DEVELOPER TOKEN MISSING", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: "Google Ads Developer Token is not configured. Please set GOOGLE_ADS_DEVELOPER_TOKEN in environment variables.",
      customers: [],
    };
  }

  const listUrl = `${GOOGLE_CONFIG.adsApiBase}/customers:listAccessibleCustomers`;
  console.log("[google-ads-accounts] 🔄 Calling listAccessibleCustomers", { listUrl });

  const listResult = await googleAdsRequest({
    url: listUrl,
    method: "POST",
    accessToken,
    developerToken,
    body: {},
    logLabel: "customers:listAccessibleCustomers",
  });

  console.log("[google-ads-accounts] ✓ listAccessibleCustomers response received", {
    ok: listResult.ok,
    status: listResult.status,
    isJson: listResult.isJson,
  });

  if (!listResult.ok) {
    console.error("[google-ads-accounts] ❌ listAccessibleCustomers HTTP ERROR", {
      status: listResult.status,
      statusText: listResult.bodyText.slice(0, 500),
    });
    return {
      ok: false,
      error: `HTTP ${listResult.status}: ${GOOGLE_ADS_FETCH_FAILED_MESSAGE}`,
      customers: [],
    };
  }

  if (hasGoogleAdsError(listResult.payload)) {
    const errorMsg = getGoogleAdsErrorMessage(listResult.payload);
    console.error("[google-ads-accounts] ❌ listAccessibleCustomers API ERROR", {
      error: errorMsg,
      payload: (listResult.payload as GoogleAdsErrorPayload).error,
    });
    return {
      ok: false,
      error: `${GOOGLE_ADS_FETCH_FAILED_MESSAGE} (${errorMsg})`,
      customers: [],
    };
  }

  const resourceNames = readResourceNames(listResult.payload);
  console.log("[google-ads-accounts] ℹ readResourceNames result", {
    count: resourceNames.length,
    resourceNames: resourceNames.slice(0, 10),
  });
  
  if (resourceNames.length === 0) {
    console.warn("[google-ads-accounts] ⚠ No accessible customers found", {
      payloadKeys: listResult.payload && typeof listResult.payload === "object" ? Object.keys(listResult.payload) : [],
    });
    return { ok: true, customers: [] };
  }

  console.log("[google-ads-accounts] ✓ listAccessibleCustomers success", {
    count: resourceNames.length,
    resourceNames: resourceNames.slice(0, 5),
  });

  const customerIds = resourceNames
    .map((name) => {
      const extracted = name.replace("customers/", "").trim();
      return extracted;
    })
    .filter((id) => /^\d+$/.test(id));

  console.log("[google-ads-accounts] ℹ Customer ID extraction", {
    resourceNameCount: resourceNames.length,
    validIdCount: customerIds.length,
    sampleIds: customerIds.slice(0, 5),
  });

  if (customerIds.length === 0) {
    console.error("[google-ads-accounts] ❌ NO VALID CUSTOMER IDS EXTRACTED", {
      resourceNames: resourceNames.slice(0, 10),
    });
    return { ok: true, customers: [] };
  }

  console.log("[google-ads-accounts] 🔄 Fetching customer details for " + customerIds.length + ' IDs');

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

  const successCount = detailResults.filter((item) => item !== null).length;
  console.log("[google-ads-accounts] ✓ Customer detail fetch COMPLETE", {
    requested: customerIds.length,
    succeeded: successCount,
    failed: customerIds.length - successCount,
    customers: customers.map((c) => ({ id: c.id, name: c.name })),
  });

  return { ok: true, customers };
}
    resourceNames: resourceNames.slice(0, 5), // Log first 5 for debugging
  });

  const customerIds = resourceNames
    .map((name) => name.replace("customers/", "").trim())
    .filter((id) => /^\d+$/.test(id));

  if (customerIds.length === 0) {
    console.error("[google-ads-accounts] no valid customer IDs extracted", {
      resourceNames,
    });
    return { ok: true, customers: [] };
  }

  console.log("[google-ads-accounts] extracted customer IDs", {
    count: customerIds.length,
    ids: customerIds.slice(0, 5),
  });

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

  const successCount = detailResults.filter((item) => item !== null).length;
  console.log("[google-ads-accounts] customer detail fetch summary", {
    requested: customerIds.length,
    succeeded: successCount,
    failed: customerIds.length - successCount,
    customers: customers.map((c) => ({ id: c.id, name: c.name })),
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

  if (!result.ok) {
    console.error("[google-ads-accounts] customer details fetch HTTP error", {
      customerId,
      status: result.status,
      message: getGoogleAdsErrorMessage(result.payload),
      bodyPreview: result.bodyText.slice(0, 300),
    });
    return null;
  }

  if (hasGoogleAdsError(result.payload)) {
    console.error("[google-ads-accounts] customer details API error", {
      customerId,
      error: (result.payload as GoogleAdsErrorPayload).error,
      bodyPreview: result.bodyText.slice(0, 300),
    });
    return null;
  }

  const customer = readCustomerFromSearchPayload(result.payload);
  if (!customer) {
    console.error("[google-ads-accounts] failed to parse customer response", {
      customerId,
      payloadKeys: Object.keys((result.payload as Record<string, unknown>) ?? {}),
      bodyPreview: result.bodyText.slice(0, 300),
    });
    return null;
  }

  console.log("[google-ads-accounts] customer details fetched successfully", {
    customerId,
    name: customer.name,
  });

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

  try {
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

    if (!res.ok) {
      console.warn("[google-ads-accounts] HTTP error response", {
        endpoint: logLabel,
        method,
        status: res.status,
        statusText: res.statusText,
        isJson,
        responseBody: bodyText.slice(0, 500),
      });
    } else {
      console.log("[google-ads-accounts] HTTP success", {
        endpoint: logLabel,
        method,
        status: res.status,
        isJson,
      });
    }

    return {
      ok: res.ok,
      status: res.status,
      isJson,
      bodyText,
      payload: parsed,
    };
  } catch (err) {
    console.error("[google-ads-accounts] fetch error", {
      endpoint: logLabel,
      method,
      error: (err as Error).message,
    });
    return {
      ok: false,
      status: 0,
      isJson: false,
      bodyText: (err as Error).message,
      payload: null,
    };
  }
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
  if (!payload || typeof payload !== "object") {
    console.warn("[google-ads-accounts] response is not an object", {
      type: typeof payload,
      value: String(payload).slice(0, 100),
    });
    return [];
  }

  const resourceNames = (payload as { resourceNames?: unknown }).resourceNames;
  
  if (!resourceNames) {
    console.warn("[google-ads-accounts] resourceNames field missing from response", {
      keys: Object.keys(payload),
    });
    return [];
  }

  if (!Array.isArray(resourceNames)) {
    console.warn("[google-ads-accounts] resourceNames is not an array", {
      type: typeof resourceNames,
      value: String(resourceNames).slice(0, 100),
    });
    return [];
  }

  const filtered = resourceNames.filter((item): item is string => typeof item === "string");
  
  if (filtered.length !== resourceNames.length) {
    console.warn("[google-ads-accounts] some resourceNames are not strings", {
      total: resourceNames.length,
      strings: filtered.length,
    });
  }

  return filtered;
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
  if (!Array.isArray(results) || results.length === 0) {
    console.warn("[google-ads-accounts] response had no results", { payload });
    return null;
  }

  const first = results[0] as { customer?: unknown };
  if (!first || typeof first !== "object" || !first.customer || typeof first.customer !== "object") {
    console.warn("[google-ads-accounts] response structure invalid", { first });
    return null;
  }

  const customer = first.customer as Record<string, unknown>;

  // Handle both snake_case and camelCase field names from API response
  const id = String(customer.id ?? customer.ID ?? "");
  const name = String(
    customer.descriptiveName ||
    customer.descriptive_name ||
    customer.descriptive_name ||
    customer.name ||
    ""
  );
  const currency =
    typeof customer.currencyCode === "string" || typeof customer.currency_code === "string"
      ? (customer.currencyCode as string) || (customer.currency_code as string)
      : null;
  const timezone =
    typeof customer.timeZone === "string" || typeof customer.time_zone === "string"
      ? (customer.timeZone as string) || (customer.time_zone as string)
      : null;
  const isManager = customer.manager === true || customer.manager === "true";

  if (!id) {
    console.warn("[google-ads-accounts] customer ID not found in response", {
      customer,
    });
    return null;
  }

  return {
    id,
    name: name || id,
    currency,
    timezone,
    isManager,
  };
}
