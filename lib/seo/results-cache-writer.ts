import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { resolveBusinessReferenceIds } from "@/lib/provider-account-reference-store";
import type { SeoCacheType } from "@/lib/seo/results-cache";

const SEO_RESULTS_CACHE_TABLES = ["seo_results_cache"] as const;

/**
 * Explicit owner for user-facing SEO durable cache rows.
 * Passive reads stay in lib/seo/results-cache.ts.
 */
export async function writeSeoResultsCacheEntry<T>(params: {
  businessId: string;
  cacheType: SeoCacheType;
  startDate: string;
  endDate: string;
  payload: T;
}): Promise<void> {
  const readiness = await getDbSchemaReadiness({
    tables: [...SEO_RESULTS_CACHE_TABLES],
  });
  if (!readiness.ready) {
    return;
  }
  const businessRefIds = await resolveBusinessReferenceIds([params.businessId]);
  const sql = getDb();
  await sql`
    INSERT INTO seo_results_cache (
      business_id,
      business_ref_id,
      cache_type,
      start_date,
      end_date,
      payload,
      generated_at
    )
    VALUES (
      ${params.businessId},
      ${businessRefIds.get(params.businessId) ?? null},
      ${params.cacheType},
      ${params.startDate}::date,
      ${params.endDate}::date,
      ${JSON.stringify(params.payload)}::jsonb,
      now()
    )
    ON CONFLICT (business_id, cache_type, start_date, end_date) DO UPDATE SET
      business_ref_id = COALESCE(seo_results_cache.business_ref_id, EXCLUDED.business_ref_id),
      payload      = EXCLUDED.payload,
      generated_at = now()
  `;
}
