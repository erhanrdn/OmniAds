import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

export interface ActiveBusinessRow {
  id: string;
  name: string;
}

export async function getActiveBusinesses(limit?: number) {
  await runMigrations();
  const sql = getDb();
  return (await sql`
    SELECT id, name
    FROM businesses
    WHERE is_demo_business = FALSE
    ORDER BY created_at
    LIMIT ${Math.max(1, limit ?? 500)}
  `) as ActiveBusinessRow[];
}
