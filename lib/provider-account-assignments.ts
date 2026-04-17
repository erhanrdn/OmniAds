import { getDb } from "@/lib/db";
import { isMissingRelationError } from "@/lib/db-schema-readiness";
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

async function readAssignmentRowsByBusiness(
  businessId: string,
  provider: IntegrationProviderType,
): Promise<ProviderAccountAssignmentRow | null> {
  const sql = getDb();
  try {
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

    if (rows.length > 0) {
      return rows[0] ?? null;
    }
  } catch (error) {
    if (!isMissingRelationError(error, ["business_provider_accounts", "provider_accounts"])) {
      throw error;
    }
  }

  const legacyRows = (await sql`
    SELECT *
    FROM provider_account_assignments
    WHERE business_id = ${businessId}
      AND provider = ${provider}
    LIMIT 1
  `) as ProviderAccountAssignmentRow[];
  return legacyRows[0] ?? null;
}

async function upsertNormalizedAssignments(params: {
  businessId: string;
  provider: IntegrationProviderType;
  accountIds: string[];
}): Promise<void> {
  const sql = getDb();
  const businessRefIds = await resolveBusinessReferenceIds([params.businessId]);
  try {
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
  } catch (error) {
    if (!isMissingRelationError(error, ["provider_accounts", "business_provider_accounts"])) {
      throw error;
    }
  }
}

export async function upsertProviderAccountAssignments(params: {
  businessId: string;
  provider: IntegrationProviderType;
  accountIds: string[];
}): Promise<ProviderAccountAssignmentRow> {
  const sql = getDb();
  await upsertNormalizedAssignments(params);
  const businessRefIds = await resolveBusinessReferenceIds([params.businessId]);

  const rows = (await sql`
    INSERT INTO provider_account_assignments (
      business_id,
      business_ref_id,
      provider,
      account_ids,
      updated_at
    ) VALUES (
      ${params.businessId},
      ${businessRefIds.get(params.businessId) ?? null},
      ${params.provider},
      ${params.accountIds},
      now()
    )
    ON CONFLICT (business_id, provider)
    DO UPDATE SET
      business_ref_id = COALESCE(
        provider_account_assignments.business_ref_id,
        EXCLUDED.business_ref_id
      ),
      account_ids = EXCLUDED.account_ids,
      updated_at = now()
    RETURNING *
  `) as ProviderAccountAssignmentRow[];

  return rows[0] as ProviderAccountAssignmentRow;
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
  try {
    await sql`
      DELETE FROM business_provider_accounts
      WHERE business_id = ${businessId}
        AND provider = ${provider}
    `;
  } catch (error) {
    if (!isMissingRelationError(error, ["business_provider_accounts"])) {
      throw error;
    }
  }
  await sql`
    DELETE FROM provider_account_assignments
    WHERE business_id = ${businessId}
      AND provider = ${provider}
  `;
}

export async function clearAllProviderAccountAssignmentsForProvider(
  provider: IntegrationProviderType
): Promise<void> {
  const sql = getDb();
  try {
    await sql`
      DELETE FROM business_provider_accounts
      WHERE provider = ${provider}
    `;
  } catch (error) {
    if (!isMissingRelationError(error, ["business_provider_accounts"])) {
      throw error;
    }
  }
  await sql`
    DELETE FROM provider_account_assignments
    WHERE provider = ${provider}
  `;
}
