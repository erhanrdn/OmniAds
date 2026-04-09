import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";

export interface ActiveBusinessRow {
  id: string;
  name: string;
}

export async function getActiveBusinesses(limit?: number) {
  const readiness = await getDbSchemaReadiness({
    tables: ["businesses"],
  }).catch(() => null);
  if (!readiness?.ready) {
    return [];
  }
  const sql = getDb();
  return (await sql`
    SELECT id, name
    FROM businesses
    WHERE is_demo_business = FALSE
    ORDER BY created_at
    LIMIT ${Math.max(1, limit ?? 500)}
  `) as ActiveBusinessRow[];
}
