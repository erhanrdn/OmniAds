import { getDb } from "@/lib/db";
import type { IntegrationProviderType } from "@/lib/integrations";
import { resolveBusinessReferenceIds } from "@/lib/provider-account-reference-store";

export interface ProviderAccountAssignmentRow {
  id: string;
  business_id: string;
  provider: IntegrationProviderType;
  account_ids: string[];
  created_at: string;
  updated_at: string;
}

export const PROVIDER_ACCOUNT_ASSIGNMENT_REQUIRED_TABLES = [
  "business_provider_accounts",
  "provider_accounts",
] as const;

async function readAssignmentRowsByBusiness(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<ProviderAccountAssignmentRow | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT
      (ARRAY_AGG(bpa.id ORDER BY bpa.position, bpa.id))[1] AS id,
      bpa.business_id,
      bpa.provider,
      ARRAY_AGG(pa.external_account_id ORDER BY bpa.position, bpa.id) AS account_ids,
      MIN(bpa.created_at) AS created_at,
      MAX(bpa.updated_at) AS updated_at
    FROM business_provider_accounts bpa
    INNER JOIN provider_accounts pa
      ON pa.id = bpa.provider_account_ref_id
    WHERE bpa.business_id = ${businessId}
      AND bpa.provider = ${provider}
    GROUP BY bpa.business_id, bpa.provider
    LIMIT 1
  `) as Array<ProviderAccountAssignmentRow>;

  return rows[0] ?? null;
}

async function upsertNormalizedAssignments(params: {
  businessId: string;
  provider: IntegrationProviderType;
  accountIds: string[];
}): Promise<void> {
  const sql = getDb();
  const businessRefIds = await resolveBusinessReferenceIds([params.businessId]);
  await sql`
    INSERT INTO provider_accounts (
      provider,
      external_account_id,
      created_at,
      updated_at
    )
    SELECT DISTINCT
      ${params.provider},
      account_id,
      now(),
      now()
    FROM unnest(${params.accountIds}::TEXT[]) AS account_id
    WHERE account_id IS NOT NULL AND account_id <> ''
    ON CONFLICT (provider, external_account_id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at
  `;

  await sql`
    DELETE FROM business_provider_accounts
    WHERE business_id = ${params.businessId}
      AND provider = ${params.provider}
  `;

  await sql`
    INSERT INTO business_provider_accounts (
      business_id,
      business_ref_id,
      provider,
      provider_account_ref_id,
      provider_account_id,
      position,
      created_at,
      updated_at
    )
    SELECT
      ${params.businessId},
      ${businessRefIds.get(params.businessId) ?? null},
      ${params.provider},
      pa.id,
      pa.external_account_id,
      ordinality - 1,
      now(),
      now()
    FROM unnest(${params.accountIds}::TEXT[]) WITH ORDINALITY AS account(account_id, ordinality)
    INNER JOIN provider_accounts pa
      ON pa.provider = ${params.provider}
     AND pa.external_account_id = account.account_id
    WHERE account.account_id IS NOT NULL AND account.account_id <> ''
    ON CONFLICT (business_id, provider, provider_account_ref_id) DO UPDATE SET
      business_ref_id = COALESCE(
        business_provider_accounts.business_ref_id,
        EXCLUDED.business_ref_id
      ),
      provider_account_id = EXCLUDED.provider_account_id,
      position = EXCLUDED.position,
      updated_at = EXCLUDED.updated_at
  `;
}

export async function upsertProviderAccountAssignments(params: {
  businessId: string;
  provider: IntegrationProviderType;
  accountIds: string[];
}): Promise<ProviderAccountAssignmentRow> {
  await upsertNormalizedAssignments(params);
  const row = await readAssignmentRowsByBusiness(params.businessId, params.provider);
  if (!row) {
    throw new Error("Failed to persist provider account assignments.");
  }
  return row;
}

export async function getProviderAccountAssignments(
  businessId: string,
  provider: IntegrationProviderType
): Promise<ProviderAccountAssignmentRow | null> {
  return readAssignmentRowsByBusiness(businessId, provider);
}

export async function clearProviderAccountAssignments(
  businessId: string,
  provider: IntegrationProviderType
): Promise<void> {
  const sql = getDb();
  await sql`
    DELETE FROM business_provider_accounts
    WHERE business_id = ${businessId}
      AND provider = ${provider}
  `;
}

export async function clearAllProviderAccountAssignmentsForProvider(
  provider: IntegrationProviderType
): Promise<void> {
  const sql = getDb();
  await sql`
    DELETE FROM business_provider_accounts
    WHERE provider = ${provider}
  `;
}
