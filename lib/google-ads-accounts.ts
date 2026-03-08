import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";

/**
 * Normalized Google Ads customer account.
 */
export interface GoogleAdsCustomerNormalized {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  manager: boolean;
  status: string | null;
}

export interface GoogleAdsAccountsFetchResult {
  ok: boolean;
  error?: string;
  customers: GoogleAdsCustomerNormalized[];
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
 *
 * Uses the Google Ads REST API:
 *   1. listAccessibleCustomers – returns resource names
 *   2. For each customer, fetch details via GoogleAdsService.searchStream (or customer resource)
 */
export async function fetchGoogleAdsAccounts(
  accessToken: string,
): Promise<GoogleAdsAccountsFetchResult> {
  const developerToken = GOOGLE_CONFIG.developerToken;

  // Step 1: List accessible customer resource names
  const listUrl = `${GOOGLE_CONFIG.adsApiBase}/customers:listAccessibleCustomers`;
  const listRes = await fetch(listUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const listBody = await listRes.text();
  let listData: {
    resourceNames?: string[];
    error?: { message?: string };
  } | null;
  try {
    listData = JSON.parse(listBody);
  } catch {
    return {
      ok: false,
      error: `Invalid response from Google Ads API: ${listBody.slice(0, 200)}`,
      customers: [],
    };
  }

  if (!listRes.ok || listData?.error) {
    const message =
      listData?.error?.message ??
      `Google Ads API returned status ${listRes.status}`;
    return { ok: false, error: message, customers: [] };
  }

  const resourceNames = listData?.resourceNames ?? [];
  if (resourceNames.length === 0) {
    return { ok: true, customers: [] };
  }

  // Extract customer IDs from resource names like "customers/1234567890"
  const customerIds = resourceNames
    .map((rn) => rn.replace("customers/", ""))
    .filter(Boolean);

  // Step 2: Fetch details for each customer
  const customers: GoogleAdsCustomerNormalized[] = [];

  for (const customerId of customerIds) {
    try {
      const detail = await fetchCustomerDetails(
        accessToken,
        developerToken,
        customerId,
      );
      if (detail) {
        customers.push(detail);
      }
    } catch (err) {
      // If we can't fetch details for one customer, still include it with minimal info
      console.warn(
        `[google-ads-accounts] Failed to fetch details for customer ${customerId}:`,
        err,
      );
      customers.push({
        id: customerId,
        name: `Account ${customerId}`,
        currency: null,
        timezone: null,
        manager: false,
        status: null,
      });
    }
  }

  return { ok: true, customers };
}

/**
 * Fetches details for a single Google Ads customer using the searchStream endpoint.
 */
async function fetchCustomerDetails(
  accessToken: string,
  developerToken: string,
  customerId: string,
): Promise<GoogleAdsCustomerNormalized | null> {
  const url = `${GOOGLE_CONFIG.adsApiBase}/customers/${customerId}/googleAds:searchStream`;
  const query =
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, " +
    "customer.time_zone, customer.manager, customer.status " +
    "FROM customer LIMIT 1";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
      // Use the customer ID itself as the login-customer-id for non-manager accounts.
      // For manager accounts, this would need the manager customer ID, but for the
      // listAccessibleCustomers flow, each customer is directly accessible.
      "login-customer-id": customerId,
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.warn(
      `[google-ads-accounts] customer ${customerId} query failed: ${errBody.slice(0, 300)}`,
    );
    return null;
  }

  const data = await res.json();
  // searchStream returns an array of result batches
  const results = Array.isArray(data) ? data : [data];
  const firstBatch = results[0];
  const row = firstBatch?.results?.[0]?.customer;

  if (!row) {
    return null;
  }

  return {
    id: String(row.id ?? customerId),
    name: row.descriptiveName ?? `Account ${customerId}`,
    currency: row.currencyCode ?? null,
    timezone: row.timeZone ?? null,
    manager: row.manager === true,
    status: typeof row.status === "string" ? row.status : null,
  };
}
