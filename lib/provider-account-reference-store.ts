import { getDb } from "@/lib/db";
import { isMissingRelationError } from "@/lib/db-schema-readiness";

export interface ProviderAccountReferenceInput {
  externalAccountId: string;
  accountName?: string | null;
  currency?: string | null;
  timezone?: string | null;
  isManager?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

function normalizeText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function dedupeProviderAccountInputs(accounts: ProviderAccountReferenceInput[]) {
  const byExternalId = new Map<string, ProviderAccountReferenceInput>();

  for (const account of accounts) {
    const externalAccountId = normalizeText(account.externalAccountId);
    if (!externalAccountId) continue;

    const current = byExternalId.get(externalAccountId);
    byExternalId.set(externalAccountId, {
      externalAccountId,
      accountName: normalizeText(account.accountName) ?? current?.accountName ?? null,
      currency: normalizeText(account.currency) ?? current?.currency ?? null,
      timezone: normalizeText(account.timezone) ?? current?.timezone ?? null,
      isManager:
        typeof account.isManager === "boolean"
          ? account.isManager
          : current?.isManager ?? null,
      metadata: {
        ...(current?.metadata ?? {}),
        ...(account.metadata ?? {}),
      },
    });
  }

  return [...byExternalId.values()];
}

export async function resolveBusinessReferenceIds(businessIds: string[]) {
  const normalizedBusinessIds = [...new Set(businessIds.map((value) => value.trim()).filter(Boolean))];
  if (normalizedBusinessIds.length === 0) {
    return new Map<string, string>();
  }

  const sql = getDb();

  try {
    const rows = (await sql.query(
      `
        SELECT
          id::text AS business_id,
          id::text AS business_ref_id
        FROM businesses
        WHERE id::text = ANY($1::text[])
      `,
      [normalizedBusinessIds],
    )) as Array<{ business_id: string; business_ref_id: string }>;

    return new Map(rows.map((row) => [row.business_id, row.business_ref_id] as const));
  } catch (error) {
    if (isMissingRelationError(error, ["businesses"])) {
      return new Map<string, string>();
    }
    throw error;
  }
}

export async function ensureProviderAccountReferenceIds(input: {
  provider: string;
  accounts: ProviderAccountReferenceInput[];
}) {
  const accounts = dedupeProviderAccountInputs(input.accounts);
  if (accounts.length === 0) {
    return new Map<string, string>();
  }

  const sql = getDb();
  const payload = JSON.stringify(
    accounts.map((account) => ({
      external_account_id: account.externalAccountId,
      account_name: account.accountName ?? null,
      currency: account.currency ?? null,
      timezone: account.timezone ?? null,
      is_manager: account.isManager ?? null,
      metadata: account.metadata ?? {},
    })),
  );

  try {
    await sql.query(
      `
        WITH input_accounts AS (
          SELECT
            NULLIF(TRIM(record.external_account_id), '') AS external_account_id,
            NULLIF(TRIM(record.account_name), '') AS account_name,
            NULLIF(TRIM(record.currency), '') AS currency,
            NULLIF(TRIM(record.timezone), '') AS timezone,
            record.is_manager AS is_manager,
            COALESCE(record.metadata, '{}'::jsonb) AS metadata
          FROM jsonb_to_recordset($1::jsonb) AS record(
            external_account_id text,
            account_name text,
            currency text,
            timezone text,
            is_manager boolean,
            metadata jsonb
          )
        )
        INSERT INTO provider_accounts (
          provider,
          external_account_id,
          account_name,
          currency,
          timezone,
          is_manager,
          metadata,
          created_at,
          updated_at
        )
        SELECT
          $2::text,
          external_account_id,
          account_name,
          currency,
          timezone,
          is_manager,
          metadata,
          now(),
          now()
        FROM input_accounts
        WHERE external_account_id IS NOT NULL
        ON CONFLICT (provider, external_account_id) DO UPDATE SET
          account_name = COALESCE(EXCLUDED.account_name, provider_accounts.account_name),
          currency = COALESCE(EXCLUDED.currency, provider_accounts.currency),
          timezone = COALESCE(EXCLUDED.timezone, provider_accounts.timezone),
          is_manager = COALESCE(EXCLUDED.is_manager, provider_accounts.is_manager),
          metadata = CASE
            WHEN EXCLUDED.metadata = '{}'::jsonb THEN provider_accounts.metadata
            ELSE provider_accounts.metadata || EXCLUDED.metadata
          END,
          updated_at = now()
      `,
      [payload, input.provider],
    );

    const rows = (await sql.query(
      `
        SELECT
          id::text AS provider_account_ref_id,
          external_account_id
        FROM provider_accounts
        WHERE provider = $1
          AND external_account_id = ANY($2::text[])
      `,
      [input.provider, accounts.map((account) => account.externalAccountId)],
    )) as Array<{ provider_account_ref_id: string; external_account_id: string }>;

    return new Map(
      rows.map((row) => [row.external_account_id, row.provider_account_ref_id] as const),
    );
  } catch (error) {
    if (isMissingRelationError(error, ["provider_accounts"])) {
      return new Map<string, string>();
    }
    throw error;
  }
}
