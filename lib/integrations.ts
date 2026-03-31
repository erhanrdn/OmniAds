import { getDb } from "@/lib/db";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  isEncryptedIntegrationSecret,
} from "@/lib/integration-secrets";

export type IntegrationProviderType =
  | "shopify"
  | "meta"
  | "google"
  | "search_console"
  | "tiktok"
  | "pinterest"
  | "snapchat"
  | "ga4"
  | "klaviyo";

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
  metadata: Record<string, unknown>;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

export type IntegrationMetadataRow = Omit<IntegrationRow, "access_token" | "refresh_token"> & {
  access_token: null;
  refresh_token: null;
};

function hydrateIntegrationRow(row: IntegrationRow): IntegrationRow {
  return {
    ...row,
    access_token: decryptIntegrationSecret(row.access_token),
    refresh_token: decryptIntegrationSecret(row.refresh_token),
  };
}

function hydrateIntegrationMetadataRow(
  row: Omit<IntegrationRow, "access_token" | "refresh_token">,
): IntegrationMetadataRow {
  return {
    ...row,
    access_token: null,
    refresh_token: null,
  };
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
  return (rows as IntegrationRow[]).map(hydrateIntegrationRow);
}

/** Get a specific integration by business + provider */
export async function getIntegration(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<IntegrationRow | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT * FROM integrations
    WHERE business_id = ${businessId} AND provider = ${provider}
    LIMIT 1
  `) as IntegrationRow[];
  return rows[0] ? hydrateIntegrationRow(rows[0]) : null;
}

export async function getIntegrationsMetadataByBusiness(
  businessId: string,
): Promise<IntegrationMetadataRow[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT
      id,
      business_id,
      provider,
      status,
      provider_account_id,
      provider_account_name,
      token_expires_at,
      scopes,
      error_message,
      metadata,
      connected_at,
      disconnected_at,
      created_at,
      updated_at
    FROM integrations
    WHERE business_id = ${businessId}
    ORDER BY provider
  `;
  return (rows as Array<Omit<IntegrationRow, "access_token" | "refresh_token">>).map(
    hydrateIntegrationMetadataRow
  );
}

export async function getIntegrationMetadata(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<IntegrationMetadataRow | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT
      id,
      business_id,
      provider,
      status,
      provider_account_id,
      provider_account_name,
      token_expires_at,
      scopes,
      error_message,
      metadata,
      connected_at,
      disconnected_at,
      created_at,
      updated_at
    FROM integrations
    WHERE business_id = ${businessId} AND provider = ${provider}
    LIMIT 1
  `) as Array<Omit<IntegrationRow, "access_token" | "refresh_token">>;
  return rows[0] ? hydrateIntegrationMetadataRow(rows[0]) : null;
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
  metadata?: Record<string, unknown>;
}): Promise<IntegrationRow> {
  const sql = getDb();
  const now = new Date().toISOString();
  const metadataJson = JSON.stringify(params.metadata ?? {});
  const accessToken = encryptIntegrationSecret(params.accessToken ?? null);
  const refreshToken = encryptIntegrationSecret(params.refreshToken ?? null);

  const rows = (await sql`
    INSERT INTO integrations (
      business_id, provider, status,
      provider_account_id, provider_account_name,
      access_token, refresh_token, token_expires_at,
      scopes, error_message, metadata, connected_at, updated_at
    ) VALUES (
      ${params.businessId},
      ${params.provider},
      ${params.status},
      ${params.providerAccountId ?? null},
      ${params.providerAccountName ?? null},
      ${accessToken},
      ${refreshToken},
      ${params.tokenExpiresAt?.toISOString() ?? null},
      ${params.scopes ?? null},
      ${params.errorMessage ?? null},
      ${metadataJson}::jsonb,
      ${params.status === "connected" ? now : null},
      ${now}
    )
    ON CONFLICT (business_id, provider) DO UPDATE SET
      status              = EXCLUDED.status,
      provider_account_id = COALESCE(EXCLUDED.provider_account_id, integrations.provider_account_id),
      provider_account_name = COALESCE(EXCLUDED.provider_account_name, integrations.provider_account_name),
      access_token        = COALESCE(EXCLUDED.access_token, integrations.access_token),
      refresh_token       = COALESCE(EXCLUDED.refresh_token, integrations.refresh_token),
      token_expires_at    = COALESCE(EXCLUDED.token_expires_at, integrations.token_expires_at),
      scopes              = COALESCE(EXCLUDED.scopes, integrations.scopes),
      error_message       = COALESCE(EXCLUDED.error_message, integrations.error_message),
      metadata            = CASE
                              WHEN EXCLUDED.metadata = '{}'::jsonb THEN integrations.metadata
                              ELSE integrations.metadata || EXCLUDED.metadata
                            END,
      connected_at        = COALESCE(integrations.connected_at, EXCLUDED.connected_at),
      updated_at          = EXCLUDED.updated_at
    RETURNING *
  `) as IntegrationRow[];
  return hydrateIntegrationRow(rows[0] as IntegrationRow);
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
      metadata         = '{}'::jsonb,
      disconnected_at  = now(),
      updated_at       = now()
    WHERE business_id = ${businessId} AND provider = ${provider}
  `;
}

export async function disconnectAllIntegrationsForProvider(
  provider: IntegrationProviderType
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE integrations SET
      status           = 'disconnected',
      access_token     = NULL,
      refresh_token    = NULL,
      token_expires_at = NULL,
      error_message    = NULL,
      metadata         = '{}'::jsonb,
      disconnected_at  = now(),
      updated_at       = now()
    WHERE provider = ${provider}
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

export async function backfillIntegrationSecretsEncryption(input?: {
  batchSize?: number;
}): Promise<{ scanned: number; updated: number }> {
  const sql = getDb();
  const batchSize = Math.max(1, Math.min(input?.batchSize ?? 100, 1000));
  let scanned = 0;
  let updated = 0;

  while (true) {
    const rows = (await sql`
      SELECT id, access_token, refresh_token
      FROM integrations
      WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL
      ORDER BY updated_at ASC
      LIMIT ${batchSize}
    `) as Array<{
      id: string;
      access_token: string | null;
      refresh_token: string | null;
    }>;

    if (rows.length === 0) break;
    let batchUpdated = 0;
    scanned += rows.length;

    for (const row of rows) {
      const nextAccessToken =
        row.access_token && !isEncryptedIntegrationSecret(row.access_token)
          ? encryptIntegrationSecret(row.access_token)
          : row.access_token;
      const nextRefreshToken =
        row.refresh_token && !isEncryptedIntegrationSecret(row.refresh_token)
          ? encryptIntegrationSecret(row.refresh_token)
          : row.refresh_token;

      if (
        nextAccessToken === row.access_token &&
        nextRefreshToken === row.refresh_token
      ) {
        continue;
      }

      await sql`
        UPDATE integrations
        SET
          access_token = ${nextAccessToken},
          refresh_token = ${nextRefreshToken},
          updated_at = now()
        WHERE id = ${row.id}
      `;
      updated += 1;
      batchUpdated += 1;
    }

    if (rows.length < batchSize || batchUpdated === 0) break;
  }

  return { scanned, updated };
}
