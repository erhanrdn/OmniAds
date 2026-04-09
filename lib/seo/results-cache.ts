import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type SeoCacheType = "overview" | "findings";

export async function getSeoResultsCache<T>(params: {
  businessId: string;
  cacheType: SeoCacheType;
  startDate: string;
  endDate: string;
}): Promise<T | null> {
  const readiness = await getDbSchemaReadiness({
    tables: ["seo_results_cache"],
  });
  if (!readiness.ready) {
    return null;
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT payload, generated_at
    FROM seo_results_cache
    WHERE business_id  = ${params.businessId}
      AND cache_type   = ${params.cacheType}
      AND start_date   = ${params.startDate}::date
      AND end_date     = ${params.endDate}::date
    LIMIT 1
  `) as { payload: T; generated_at: string }[];

  const row = rows[0];
  if (!row) return null;

  const age = Date.now() - new Date(row.generated_at).getTime();
  if (age > CACHE_TTL_MS) return null;

  return row.payload;
}
