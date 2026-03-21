import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type SeoCacheType = "overview" | "findings";

export async function getSeoResultsCache<T>(params: {
  businessId: string;
  cacheType: SeoCacheType;
  startDate: string;
  endDate: string;
}): Promise<T | null> {
  await runMigrations({ reason: "seo_results_cache_read" });
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

export async function setSeoResultsCache<T>(params: {
  businessId: string;
  cacheType: SeoCacheType;
  startDate: string;
  endDate: string;
  payload: T;
}): Promise<void> {
  await runMigrations({ reason: "seo_results_cache_write" });
  const sql = getDb();
  await sql`
    INSERT INTO seo_results_cache (business_id, cache_type, start_date, end_date, payload, generated_at)
    VALUES (
      ${params.businessId},
      ${params.cacheType},
      ${params.startDate}::date,
      ${params.endDate}::date,
      ${JSON.stringify(params.payload)}::jsonb,
      now()
    )
    ON CONFLICT (business_id, cache_type, start_date, end_date) DO UPDATE SET
      payload      = EXCLUDED.payload,
      generated_at = now()
  `;
}
