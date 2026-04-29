import { getDb, type DbClient } from "@/lib/db";
import type {
  CreativeCanonicalResolverFlag,
  CreativeCanonicalResolverServerFlagRecord,
} from "@/lib/creative-decision-feature-flag";

function db(client?: DbClient) {
  return client ?? getDb();
}

export async function loadCreativeCanonicalResolverFlagAssignment(
  businessId: string,
  client?: DbClient,
): Promise<CreativeCanonicalResolverServerFlagRecord | null> {
  const rows = await db(client).query<{
    business_id: string;
    assignment: CreativeCanonicalResolverFlag;
    assigned_at: string | Date;
    source: CreativeCanonicalResolverServerFlagRecord["source"];
  }>(
    `
      SELECT business_id, assignment, assigned_at, source
      FROM creative_canonical_resolver_flags
      WHERE business_id = $1
      LIMIT 1
    `,
    [businessId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    businessId: row.business_id,
    assignment: row.assignment,
    assignedAt: new Date(row.assigned_at).toISOString(),
    source: row.source,
  };
}

export async function persistCreativeCanonicalResolverFlagAssignment(
  record: CreativeCanonicalResolverServerFlagRecord,
  client?: DbClient,
) {
  await db(client).query(
    `
      INSERT INTO creative_canonical_resolver_flags (
        business_id,
        assignment,
        source,
        assigned_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (business_id)
      DO UPDATE SET
        assignment = EXCLUDED.assignment,
        source = EXCLUDED.source,
        updated_at = now()
    `,
    [record.businessId, record.assignment, record.source, record.assignedAt],
  );
}
