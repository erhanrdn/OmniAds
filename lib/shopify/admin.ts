import { getIntegration } from "@/lib/integrations";

const SHOPIFY_ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2025-10";

export interface ShopifyAdminCredentials {
  businessId: string;
  shopId: string;
  accessToken: string;
  scopes: string | null;
  metadata: Record<string, unknown>;
}

export function hasShopifyScope(scopes: string | null | undefined, scope: string) {
  return (scopes ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(scope);
}

export async function resolveShopifyAdminCredentials(
  businessId: string
): Promise<ShopifyAdminCredentials | null> {
  const integration = await getIntegration(businessId, "shopify").catch(() => null);
  if (
    !integration ||
    integration.status !== "connected" ||
    !integration.provider_account_id ||
    !integration.access_token
  ) {
    return null;
  }

  return {
    businessId,
    shopId: integration.provider_account_id,
    accessToken: integration.access_token,
    scopes: integration.scopes,
    metadata: integration.metadata ?? {},
  };
}

export async function shopifyAdminGraphql<T>(input: {
  shopId: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}) {
  const response = await fetch(
    `https://${input.shopId}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": input.accessToken,
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        variables: input.variables ?? {},
      }),
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; errors?: Array<{ message?: string }> }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.errors?.[0]?.message ?? `Shopify GraphQL query failed (${response.status}).`
    );
  }

  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "Shopify GraphQL query failed.");
  }

  if (!payload?.data) {
    throw new Error("Shopify GraphQL response missing data.");
  }

  return payload.data;
}
