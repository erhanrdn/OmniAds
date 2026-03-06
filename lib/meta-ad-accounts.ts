export interface MetaAdAccountNormalized {
  id: string;
  raw_id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  account_status: number | null;
}

interface MetaGraphError {
  message?: string;
  type?: string;
  code?: number;
  fbtrace_id?: string;
}

interface MetaGraphAdAccountsResponse {
  data?: Array<{
    id?: string;
    name?: string;
    currency?: string;
    timezone_name?: string;
    account_status?: number;
  }>;
  error?: MetaGraphError;
}

export interface MetaAdAccountsFetchResult {
  status: number;
  ok: boolean;
  rawBody: string;
  body: MetaGraphAdAccountsResponse | null;
  normalized: MetaAdAccountNormalized[];
}

function normalizeAccountId(input: string) {
  if (input.startsWith("act_")) {
    return {
      id: input,
      rawId: input.slice(4),
    };
  }

  return {
    id: `act_${input}`,
    rawId: input,
  };
}

export async function fetchMetaAdAccounts(
  accessToken: string
): Promise<MetaAdAccountsFetchResult> {
  const url =
    "https://graph.facebook.com/v25.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name";

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const rawBody = await response.text();

  let body: MetaGraphAdAccountsResponse | null = null;
  try {
    body = JSON.parse(rawBody) as MetaGraphAdAccountsResponse;
  } catch {
    body = null;
  }

  const normalized = Array.isArray(body?.data)
    ? body.data
        .filter((item) => typeof item.id === "string" && typeof item.name === "string")
        .map((item) => {
          const idInfo = normalizeAccountId(item.id as string);
          return {
            id: idInfo.id,
            raw_id: idInfo.rawId,
            name: item.name as string,
            currency: item.currency ?? null,
            timezone: item.timezone_name ?? null,
            account_status:
              typeof item.account_status === "number" ? item.account_status : null,
          };
        })
    : [];

  return {
    status: response.status,
    ok: response.ok,
    rawBody,
    body,
    normalized,
  };
}

export function getMetaApiErrorMessage(result: MetaAdAccountsFetchResult) {
  const bodyError = result.body?.error?.message;
  if (bodyError) return bodyError;
  if (result.rawBody) return result.rawBody;
  return `Meta API request failed with status ${result.status}`;
}
