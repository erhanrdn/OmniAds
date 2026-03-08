import { getDb } from "@/lib/db";

export type IntegrationProviderType =
  | "shopify"
  | "meta"
  | "google"
  | "tiktok"
  | "pinterest"
  | "snapchat"
  | "ga4";

export interface IntegrationRow {
  id: string;
  business_id: string;
  provider: IntegrationProviderType;
  status: string;
  provider_account_id: string | null;
  provider_account_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string | null;
  error_message: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Queries ────────────────────────────────────────────────────────

/** Get all integrations for a business */
export async function getIntegrationsByBusiness(
  businessId: string,
): Promise<IntegrationRow[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM integrations
    WHERE business_id = ${businessId}
    ORDER BY provider
  `;
  return rows as IntegrationRow[];
}

/** Get a specific integration by business + provider */
export async function getIntegration(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<IntegrationRow | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM integrations
    WHERE business_id = ${businessId} AND provider = ${provider}
    LIMIT 1
  `;
  return (rows[0] as IntegrationRow) ?? null;
}

/** Upsert an integration record after successful OAuth */
export async function upsertIntegration(params: {
  businessId: string;
  provider: IntegrationProviderType;
  status: string;
  providerAccountId?: string;
  providerAccountName?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scopes?: string;
  errorMessage?: string;
}): Promise<IntegrationRow> {
  const sql = getDb();
  const now = new Date().toISOString();

  const rows = await sql`
    INSERT INTO integrations (
      business_id, provider, status,
      provider_account_id, provider_account_name,
      access_token, refresh_token, token_expires_at,
      scopes, error_message, connected_at, updated_at
    ) VALUES (
      ${params.businessId},
      ${params.provider},
      ${params.status},
      ${params.providerAccountId ?? null},
      ${params.providerAccountName ?? null},
      ${params.accessToken ?? null},
      ${params.refreshToken ?? null},
      ${params.tokenExpiresAt?.toISOString() ?? null},
      ${params.scopes ?? null},
      ${params.errorMessage ?? null},
      ${params.status === "connected" ? now : null},
      ${now}
    )
    ON CONFLICT (business_id, provider) DO UPDATE SET
      status              = EXCLUDED.status,
      provider_account_id = EXCLUDED.provider_account_id,
      provider_account_name = EXCLUDED.provider_account_name,
      access_token        = EXCLUDED.access_token,
      refresh_token       = COALESCE(EXCLUDED.refresh_token, integrations.refresh_token),
      token_expires_at    = EXCLUDED.token_expires_at,
      scopes              = EXCLUDED.scopes,
      error_message       = EXCLUDED.error_message,
      connected_at        = COALESCE(integrations.connected_at, EXCLUDED.connected_at),
      updated_at          = EXCLUDED.updated_at
    RETURNING *
  `;
  return rows[0] as IntegrationRow;
}

/** Mark an integration as disconnected */
export async function disconnectIntegration(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE integrations SET
      status           = 'disconnected',
      access_token     = NULL,
      refresh_token    = NULL,
      token_expires_at = NULL,
      error_message    = NULL,
      disconnected_at  = now(),
      updated_at       = now()
    WHERE business_id = ${businessId} AND provider = ${provider}
  `;
}

/** Mark an integration as error */
export async function setIntegrationError(
  businessId: string,
  provider: IntegrationProviderType,
  errorMessage: string,
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE integrations SET
      status        = 'error',
      error_message = ${errorMessage},
      updated_at    = now()
    WHERE business_id = ${businessId} AND provider = ${provider}
  `;
}
