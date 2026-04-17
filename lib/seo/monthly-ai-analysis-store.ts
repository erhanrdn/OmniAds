import { getDb } from "@/lib/db";
import { assertDbSchemaReady, getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { resolveBusinessReferenceIds } from "@/lib/provider-account-reference-store";
import type { SeoAiAnalysis } from "@/lib/seo/intelligence";

export interface SeoMonthlyAiAnalysisRecord {
  id: string;
  business_id: string;
  analysis_month: string;
  period_start: string;
  period_end: string;
  analysis: SeoAiAnalysis | null;
  raw_response: unknown;
  status: "success" | "failed";
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function getSeoMonthlyAiAnalysis(params: {
  businessId: string;
  analysisMonth: string;
}) {
  const readiness = await getDbSchemaReadiness({
    tables: ["seo_ai_monthly_analyses"],
  });
  if (!readiness.ready) {
    return null;
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM seo_ai_monthly_analyses
    WHERE business_id = ${params.businessId}
      AND analysis_month = ${params.analysisMonth}::date
    LIMIT 1
  `) as SeoMonthlyAiAnalysisRecord[];

  return rows[0] ?? null;
}

export async function saveSeoMonthlyAiAnalysisSuccess(params: {
  businessId: string;
  analysisMonth: string;
  periodStart: string;
  periodEnd: string;
  analysis: SeoAiAnalysis;
  rawResponse?: unknown;
}) {
  await assertDbSchemaReady({
    tables: ["seo_ai_monthly_analyses"],
    context: "seo_monthly_ai_analysis_success",
  });
  const businessRefIds = await resolveBusinessReferenceIds([params.businessId]);
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO seo_ai_monthly_analyses (
      business_id,
      business_ref_id,
      analysis_month,
      period_start,
      period_end,
      analysis,
      raw_response,
      status,
      error_message,
      updated_at
    ) VALUES (
      ${params.businessId},
      ${businessRefIds.get(params.businessId) ?? null},
      ${params.analysisMonth}::date,
      ${params.periodStart}::date,
      ${params.periodEnd}::date,
      ${JSON.stringify(params.analysis)}::jsonb,
      ${JSON.stringify(params.rawResponse ?? null)}::jsonb,
      'success',
      NULL,
      now()
    )
    ON CONFLICT (business_id, analysis_month) DO UPDATE SET
      business_ref_id = COALESCE(
        seo_ai_monthly_analyses.business_ref_id,
        EXCLUDED.business_ref_id
      ),
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      analysis = EXCLUDED.analysis,
      raw_response = EXCLUDED.raw_response,
      status = 'success',
      error_message = NULL,
      updated_at = now()
    RETURNING *
  `) as SeoMonthlyAiAnalysisRecord[];

  return rows[0];
}

export async function saveSeoMonthlyAiAnalysisFailure(params: {
  businessId: string;
  analysisMonth: string;
  periodStart: string;
  periodEnd: string;
  errorMessage: string;
  rawResponse?: unknown;
}) {
  await assertDbSchemaReady({
    tables: ["seo_ai_monthly_analyses"],
    context: "seo_monthly_ai_analysis_failure",
  });
  const businessRefIds = await resolveBusinessReferenceIds([params.businessId]);
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO seo_ai_monthly_analyses (
      business_id,
      business_ref_id,
      analysis_month,
      period_start,
      period_end,
      analysis,
      raw_response,
      status,
      error_message,
      updated_at
    ) VALUES (
      ${params.businessId},
      ${businessRefIds.get(params.businessId) ?? null},
      ${params.analysisMonth}::date,
      ${params.periodStart}::date,
      ${params.periodEnd}::date,
      NULL,
      ${JSON.stringify(params.rawResponse ?? null)}::jsonb,
      'failed',
      ${params.errorMessage},
      now()
    )
    ON CONFLICT (business_id, analysis_month) DO UPDATE SET
      business_ref_id = COALESCE(
        seo_ai_monthly_analyses.business_ref_id,
        EXCLUDED.business_ref_id
      ),
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      raw_response = COALESCE(EXCLUDED.raw_response, seo_ai_monthly_analyses.raw_response),
      status = 'failed',
      error_message = EXCLUDED.error_message,
      updated_at = now()
    RETURNING *
  `) as SeoMonthlyAiAnalysisRecord[];

  return rows[0];
}
