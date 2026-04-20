import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";

export interface ActiveBusinessRow {
  id: string;
  name: string;
}

export interface GetActiveBusinessesOptions {
  prioritizedIds?: string[] | null;
}

function normalizeBusinessIds(value?: string[] | null) {
  return Array.from(
    new Set(
      (value ?? [])
        .map((entry) => entry?.trim())
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

export async function getActiveBusinesses(
  limit?: number,
  options?: GetActiveBusinessesOptions,
) {
  const readiness = await getDbSchemaReadiness({
    tables: ["businesses"],
  }).catch(() => null);
  if (!readiness?.ready) {
    return [];
  }
  const sql = getDb();
  const prioritizedIds = normalizeBusinessIds(options?.prioritizedIds);
  const requestedLimit = Math.max(1, limit ?? 500);
  const effectiveLimit = Math.max(requestedLimit, prioritizedIds.length || 0);
  return (await sql`
    WITH ranked_businesses AS (
      SELECT
        id,
        name,
        created_at,
        CASE
          WHEN id = ANY(${prioritizedIds}::text[]) THEN 0
          ELSE 1
        END AS priority_group,
        COALESCE(array_position(${prioritizedIds}::text[], id), 2147483647) AS priority_rank
      FROM businesses
      WHERE is_demo_business = FALSE
    )
    SELECT id, name
    FROM ranked_businesses
    ORDER BY priority_group, priority_rank, created_at
    LIMIT ${effectiveLimit}
  `) as ActiveBusinessRow[];
}
