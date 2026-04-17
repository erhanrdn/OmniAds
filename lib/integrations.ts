import { getDb } from "@/lib/db";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  isEncryptedIntegrationSecret,
} from "@/lib/integration-secrets";
import { resolveBusinessReferenceIds } from "@/lib/provider-account-reference-store";
import { recomputeBusinessDerivedTimezone } from "@/lib/business-timezone";

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

export const INTEGRATION_REQUIRED_TABLES = [
  "provider_connections",
  "integration_credentials",
] as const;

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

interface NormalizedIntegrationConnectionRow {
  id: string;
  business_id: string;
  provider: IntegrationProviderType;
  status: string;
  provider_account_ref_id: string | null;
  provider_account_id: string | null;
  provider_account_name: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface NormalizedIntegrationCredentialRow {
  provider_connection_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

function hydrateIntegrationRowFromNormalized(input: {
  connection: NormalizedIntegrationConnectionRow;
  credentials: NormalizedIntegrationCredentialRow | null;
}): IntegrationRow {
  return hydrateIntegrationRow({
    id: input.connection.id,
    business_id: input.connection.business_id,
    provider: input.connection.provider,
    status: input.connection.status,
    provider_account_id: input.connection.provider_account_id,
    provider_account_name: input.connection.provider_account_name,
    access_token: input.credentials?.access_token ?? null,
    refresh_token: input.credentials?.refresh_token ?? null,
    token_expires_at: input.credentials?.token_expires_at ?? null,
    scopes: input.credentials?.scopes ?? null,
    error_message: input.credentials?.error_message ?? null,
    metadata: input.credentials?.metadata ?? {},
    connected_at: input.connection.connected_at,
    disconnected_at: input.connection.disconnected_at,
    created_at: input.connection.created_at,
    updated_at: input.connection.updated_at,
  });
}

async function readIntegrationRowsByBusiness(
  businessId: string,
  provider?: IntegrationProviderType,
): Promise<IntegrationRow[]> {
  const sql = getDb();
  const normalizedRows = provider
    ? ((await sql`
        SELECT
          pc.id,
          pc.business_id,
          pc.provider,
          pc.status,
          pc.provider_account_id,
          pc.provider_account_name,
          pc.connected_at,
          pc.disconnected_at,
          pc.created_at,
          pc.updated_at,
          ic.access_token,
          ic.refresh_token,
          ic.token_expires_at,
          ic.scopes,
          ic.error_message,
          COALESCE(ic.metadata, '{}'::jsonb) AS metadata
        FROM provider_connections pc
        LEFT JOIN integration_credentials ic
          ON ic.provider_connection_id = pc.id
        WHERE pc.business_id = ${businessId}
          AND pc.provider = ${provider}
        ORDER BY pc.provider
      `) as Array<NormalizedIntegrationConnectionRow & NormalizedIntegrationCredentialRow>)
    : ((await sql`
        SELECT
          pc.id,
          pc.business_id,
          pc.provider,
          pc.status,
          pc.provider_account_id,
          pc.provider_account_name,
          pc.connected_at,
          pc.disconnected_at,
          pc.created_at,
          pc.updated_at,
          ic.access_token,
          ic.refresh_token,
          ic.token_expires_at,
          ic.scopes,
          ic.error_message,
          COALESCE(ic.metadata, '{}'::jsonb) AS metadata
        FROM provider_connections pc
        LEFT JOIN integration_credentials ic
          ON ic.provider_connection_id = pc.id
        WHERE pc.business_id = ${businessId}
        ORDER BY pc.provider
      `) as Array<NormalizedIntegrationConnectionRow & NormalizedIntegrationCredentialRow>);

  return normalizedRows.map((row) =>
    hydrateIntegrationRowFromNormalized({
      connection: row,
      credentials: {
        provider_connection_id: row.id,
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        token_expires_at: row.token_expires_at,
        scopes: row.scopes,
        error_message: row.error_message,
        metadata: row.metadata,
      },
    }),
  );
}

async function readIntegrationByBusiness(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<IntegrationRow | null> {
  const rows = await readIntegrationRowsByBusiness(businessId, provider);
  return rows[0] ?? null;
}

// ── Queries ────────────────────────────────────────────────────────

/** Get all integrations for a business */
export async function getIntegrationsByBusiness(
  businessId: string,
): Promise<IntegrationRow[]> {
  return readIntegrationRowsByBusiness(businessId);
}

/** Get a specific integration by business + provider */
export async function getIntegration(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<IntegrationRow | null> {
  return readIntegrationByBusiness(businessId, provider);
}

export async function getIntegrationsMetadataByBusiness(
  businessId: string,
): Promise<IntegrationMetadataRow[]> {
  return (await readIntegrationRowsByBusiness(businessId)).map((row) =>
    hydrateIntegrationMetadataRow({
      id: row.id,
      business_id: row.business_id,
      provider: row.provider,
      status: row.status,
      provider_account_id: row.provider_account_id,
      provider_account_name: row.provider_account_name,
      token_expires_at: row.token_expires_at,
      scopes: row.scopes,
      error_message: row.error_message,
      metadata: row.metadata,
      connected_at: row.connected_at,
      disconnected_at: row.disconnected_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
  );
}

export async function getIntegrationMetadata(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<IntegrationMetadataRow | null> {
  const row = await readIntegrationByBusiness(businessId, provider);
  if (!row) return null;
  return hydrateIntegrationMetadataRow({
    id: row.id,
    business_id: row.business_id,
    provider: row.provider,
    status: row.status,
    provider_account_id: row.provider_account_id,
    provider_account_name: row.provider_account_name,
    token_expires_at: row.token_expires_at,
    scopes: row.scopes,
    error_message: row.error_message,
    metadata: row.metadata,
    connected_at: row.connected_at,
    disconnected_at: row.disconnected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
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

  let providerAccountRefId: string | null = null;
  if (params.providerAccountId) {
    const providerAccounts = (await sql`
      INSERT INTO provider_accounts (
        provider,
        external_account_id,
        account_name,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        ${params.provider},
        ${params.providerAccountId},
        ${params.providerAccountName ?? null},
        ${metadataJson}::jsonb,
        ${now},
        ${now}
      )
      ON CONFLICT (provider, external_account_id) DO UPDATE SET
        account_name = COALESCE(EXCLUDED.account_name, provider_accounts.account_name),
        metadata = CASE
          WHEN EXCLUDED.metadata = '{}'::jsonb THEN provider_accounts.metadata
          ELSE provider_accounts.metadata || EXCLUDED.metadata
        END,
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `) as Array<{ id: string }>;
    providerAccountRefId = providerAccounts[0]?.id ?? null;
  }

  const businessRefIds = await resolveBusinessReferenceIds([params.businessId]);
  const connections = (await sql`
    INSERT INTO provider_connections (
      business_id,
      business_ref_id,
      provider,
      status,
      provider_account_ref_id,
      provider_account_id,
      provider_account_name,
      connected_at,
      disconnected_at,
      created_at,
      updated_at
    ) VALUES (
      ${params.businessId},
      ${businessRefIds.get(params.businessId) ?? null},
      ${params.provider},
      ${params.status},
      ${providerAccountRefId},
      ${params.providerAccountId ?? null},
      ${params.providerAccountName ?? null},
      ${params.status === "connected" ? now : null},
      ${params.status === "disconnected" ? now : null},
      ${now},
      ${now}
    )
    ON CONFLICT (business_id, provider) DO UPDATE SET
      business_ref_id = COALESCE(provider_connections.business_ref_id, EXCLUDED.business_ref_id),
      status = EXCLUDED.status,
      provider_account_ref_id = COALESCE(EXCLUDED.provider_account_ref_id, provider_connections.provider_account_ref_id),
      provider_account_id = COALESCE(EXCLUDED.provider_account_id, provider_connections.provider_account_id),
      provider_account_name = COALESCE(EXCLUDED.provider_account_name, provider_connections.provider_account_name),
      connected_at = COALESCE(provider_connections.connected_at, EXCLUDED.connected_at),
      disconnected_at = CASE
        WHEN EXCLUDED.status = 'disconnected'
          THEN COALESCE(EXCLUDED.disconnected_at, provider_connections.disconnected_at, now())
        ELSE provider_connections.disconnected_at
      END,
      updated_at = EXCLUDED.updated_at
    RETURNING *
  `) as NormalizedIntegrationConnectionRow[];
  const connection = connections[0];
  if (!connection) {
    throw new Error("Failed to upsert provider connection.");
  }

  const credentials = (await sql`
    INSERT INTO integration_credentials (
      provider_connection_id,
      access_token,
      refresh_token,
      token_expires_at,
      scopes,
      error_message,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      ${connection.id},
      ${accessToken},
      ${refreshToken},
      ${params.tokenExpiresAt?.toISOString() ?? null},
      ${params.scopes ?? null},
      ${params.errorMessage ?? null},
      ${metadataJson}::jsonb,
      ${now},
      ${now}
    )
    ON CONFLICT (provider_connection_id) DO UPDATE SET
      access_token = COALESCE(EXCLUDED.access_token, integration_credentials.access_token),
      refresh_token = COALESCE(EXCLUDED.refresh_token, integration_credentials.refresh_token),
      token_expires_at = COALESCE(EXCLUDED.token_expires_at, integration_credentials.token_expires_at),
      scopes = COALESCE(EXCLUDED.scopes, integration_credentials.scopes),
      error_message = COALESCE(EXCLUDED.error_message, integration_credentials.error_message),
      metadata = CASE
        WHEN EXCLUDED.metadata = '{}'::jsonb THEN integration_credentials.metadata
        ELSE integration_credentials.metadata || EXCLUDED.metadata
      END,
      updated_at = EXCLUDED.updated_at
    RETURNING *
  `) as Array<NormalizedIntegrationCredentialRow>;

  const integration = hydrateIntegrationRowFromNormalized({
    connection,
    credentials: credentials[0] ?? null,
  });
  if (params.provider === "shopify" || params.provider === "ga4") {
    await recomputeBusinessDerivedTimezone(params.businessId).catch((error: unknown) => {
      console.warn("[integrations] business_timezone_recompute_failed", {
        businessId: params.businessId,
        provider: params.provider,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
  return integration;
}

/** Mark an integration as disconnected */
export async function disconnectIntegration(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<void> {
  const sql = getDb();
  const connectionRows = (await sql`
    SELECT id
    FROM provider_connections
    WHERE business_id = ${businessId} AND provider = ${provider}
    LIMIT 1
  `) as Array<{ id: string }>;
  const connectionId = connectionRows[0]?.id ?? null;
  if (connectionId) {
    await sql`
      UPDATE provider_connections SET
        status           = 'disconnected',
        disconnected_at  = now(),
        updated_at       = now()
      WHERE id = ${connectionId}
    `;
    await sql`
      UPDATE integration_credentials SET
        access_token     = NULL,
        refresh_token    = NULL,
        token_expires_at = NULL,
        error_message    = NULL,
        metadata         = '{}'::jsonb,
        updated_at       = now()
      WHERE provider_connection_id = ${connectionId}
    `;
  }
  if (provider === "shopify" || provider === "ga4") {
    await recomputeBusinessDerivedTimezone(businessId).catch((error: unknown) => {
      console.warn("[integrations] business_timezone_recompute_failed", {
        businessId,
        provider,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

export async function disconnectAllIntegrationsForProvider(
  provider: IntegrationProviderType
): Promise<void> {
  const sql = getDb();
  const impactedBusinessIds = new Set<string>();
  const impactedRows = (await sql`
    SELECT DISTINCT business_id
    FROM provider_connections
    WHERE provider = ${provider}
  `) as Array<{ business_id: string }>;
  for (const row of impactedRows) {
    if (row.business_id) impactedBusinessIds.add(row.business_id);
  }
  await sql`
    UPDATE provider_connections SET
      status           = 'disconnected',
      disconnected_at  = now(),
      updated_at       = now()
    WHERE provider = ${provider}
  `;
  await sql`
    UPDATE integration_credentials ic
    SET
      access_token     = NULL,
      refresh_token    = NULL,
      token_expires_at = NULL,
      error_message    = NULL,
      metadata         = '{}'::jsonb,
      updated_at       = now()
    FROM provider_connections pc
    WHERE pc.id = ic.provider_connection_id
      AND pc.provider = ${provider}
  `;
  if (provider === "shopify" || provider === "ga4") {
    await Promise.all(
      [...impactedBusinessIds].map((businessId) =>
        recomputeBusinessDerivedTimezone(businessId).catch((error: unknown) => {
          console.warn("[integrations] business_timezone_recompute_failed", {
            businessId,
            provider,
            message: error instanceof Error ? error.message : String(error),
          });
        }),
      ),
    );
  }
}

/** Mark an integration as error */
export async function setIntegrationError(
  businessId: string,
  provider: IntegrationProviderType,
  errorMessage: string,
): Promise<void> {
  const sql = getDb();
  const connectionRows = (await sql`
    SELECT id
    FROM provider_connections
    WHERE business_id = ${businessId} AND provider = ${provider}
    LIMIT 1
  `) as Array<{ id: string }>;
  const connectionId = connectionRows[0]?.id ?? null;
  if (connectionId) {
    await sql`
      UPDATE provider_connections SET
        status     = 'error',
        updated_at = now()
      WHERE id = ${connectionId}
    `;
    await sql`
      UPDATE integration_credentials SET
        error_message = ${errorMessage},
        updated_at    = now()
      WHERE provider_connection_id = ${connectionId}
    `;
  }
}

export async function mergeIntegrationMetadata(params: {
  businessId: string;
  provider: IntegrationProviderType;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const sql = getDb();
  const metadataJson = JSON.stringify(params.metadata ?? {});
  const connectionRows = (await sql`
    SELECT id
    FROM provider_connections
    WHERE business_id = ${params.businessId}
      AND provider = ${params.provider}
    LIMIT 1
  `) as Array<{ id: string }>;
  const connectionId = connectionRows[0]?.id ?? null;
  if (connectionId) {
    await sql`
      UPDATE integration_credentials
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${metadataJson}::jsonb,
          updated_at = now()
      WHERE provider_connection_id = ${connectionId}
    `;
  }
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
      SELECT
        ic.id,
        pc.business_id,
        pc.provider,
        ic.access_token,
        ic.refresh_token
      FROM integration_credentials ic
      JOIN provider_connections pc
        ON pc.id = ic.provider_connection_id
      WHERE
        (ic.access_token IS NOT NULL AND ic.access_token NOT LIKE 'enc:v1:%')
        OR
        (ic.refresh_token IS NOT NULL AND ic.refresh_token NOT LIKE 'enc:v1:%')
      ORDER BY ic.id ASC
      LIMIT ${batchSize}
    `) as Array<{
      id: string;
      business_id: string;
      provider: string;
      access_token: string | null;
      refresh_token: string | null;
    }>;

    if (rows.length === 0) break;
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
        UPDATE integration_credentials
        SET
          access_token = ${nextAccessToken},
          refresh_token = ${nextRefreshToken},
          updated_at = now()
        WHERE id = ${row.id}
      `;
      updated += 1;
    }

    if (rows.length < batchSize) break;
  }

  return { scanned, updated };
}
