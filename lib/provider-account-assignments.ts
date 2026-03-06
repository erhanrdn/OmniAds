import { getDb } from "@/lib/db";
import type { IntegrationProviderType } from "@/lib/integrations";

export interface ProviderAccountAssignmentRow {
  id: string;
  business_id: string;
  provider: IntegrationProviderType;
  account_ids: string[];
  created_at: string;
  updated_at: string;
}

export async function upsertProviderAccountAssignments(params: {
  businessId: string;
  provider: IntegrationProviderType;
  accountIds: string[];
}): Promise<ProviderAccountAssignmentRow> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO provider_account_assignments (
      business_id,
      provider,
      account_ids,
      updated_at
    ) VALUES (
      ${params.businessId},
      ${params.provider},
      ${params.accountIds},
      now()
    )
    ON CONFLICT (business_id, provider)
    DO UPDATE SET
      account_ids = EXCLUDED.account_ids,
      updated_at = now()
    RETURNING *
  `;

  return rows[0] as ProviderAccountAssignmentRow;
}

export async function getProviderAccountAssignments(
  businessId: string,
  provider: IntegrationProviderType
): Promise<ProviderAccountAssignmentRow | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT *
    FROM provider_account_assignments
    WHERE business_id = ${businessId}
      AND provider = ${provider}
    LIMIT 1
  `;

  return (rows[0] as ProviderAccountAssignmentRow) ?? null;
}
