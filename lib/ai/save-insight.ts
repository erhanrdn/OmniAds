import { getDb } from "@/lib/db";
import type { AiDailyInsight } from "@/lib/ai/generate-daily-insights";
import type { AppLanguage } from "@/lib/i18n";
import { resolveBusinessReferenceIds } from "@/lib/provider-account-reference-store";

export interface AiDailyInsightRow {
  id: string;
  business_id: string;
  insight_date: string;
  locale: AppLanguage;
  summary: string;
  risks: string[];
  opportunities: string[];
  recommendations: string[];
  raw_response: unknown;
  status: "success" | "failed";
  error_message: string | null;
  created_at: string;
}

/**
 * Save a successfully parsed AI insight to the database.
 */
export async function saveInsight(params: {
  businessId: string;
  insightDate: string;
  locale: AppLanguage;
  insight: AiDailyInsight;
  rawResponse: unknown;
}): Promise<AiDailyInsightRow> {
  const businessRefIds = await resolveBusinessReferenceIds([params.businessId]);
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO ai_daily_insights (
      business_id, business_ref_id, insight_date, locale, summary,
      risks, opportunities, recommendations,
      raw_response, status
    ) VALUES (
      ${params.businessId},
      ${businessRefIds.get(params.businessId) ?? null},
      ${params.insightDate},
      ${params.locale},
      ${params.insight.summary},
      ${JSON.stringify(params.insight.risks)}::jsonb,
      ${JSON.stringify(params.insight.opportunities)}::jsonb,
      ${JSON.stringify(params.insight.recommendations)}::jsonb,
      ${JSON.stringify(params.rawResponse)}::jsonb,
      'success'
    )
    ON CONFLICT (business_id, insight_date, locale) DO UPDATE SET
      business_ref_id  = COALESCE(ai_daily_insights.business_ref_id, EXCLUDED.business_ref_id),
      summary         = EXCLUDED.summary,
      risks           = EXCLUDED.risks,
      opportunities   = EXCLUDED.opportunities,
      recommendations = EXCLUDED.recommendations,
      raw_response    = EXCLUDED.raw_response,
      status          = 'success',
      error_message   = NULL,
      created_at      = now()
    RETURNING *
  `) as AiDailyInsightRow[];
  return rows[0];
}

/**
 * Save a failed AI insight attempt so we have an audit trail.
 */
export async function saveInsightFailure(params: {
  businessId: string;
  insightDate: string;
  locale: AppLanguage;
  errorMessage: string;
  rawResponse?: unknown;
}): Promise<void> {
  const businessRefIds = await resolveBusinessReferenceIds([params.businessId]);
  const sql = getDb();
  await sql`
    INSERT INTO ai_daily_insights (
      business_id, business_ref_id, insight_date, locale, summary,
      risks, opportunities, recommendations,
      raw_response, status, error_message
    ) VALUES (
      ${params.businessId},
      ${businessRefIds.get(params.businessId) ?? null},
      ${params.insightDate},
      ${params.locale},
      '',
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      ${JSON.stringify(params.rawResponse ?? null)}::jsonb,
      'failed',
      ${params.errorMessage}
    )
    ON CONFLICT (business_id, insight_date, locale) DO UPDATE SET
      business_ref_id = COALESCE(ai_daily_insights.business_ref_id, EXCLUDED.business_ref_id),
      status        = 'failed',
      error_message = EXCLUDED.error_message,
      raw_response  = COALESCE(EXCLUDED.raw_response, ai_daily_insights.raw_response),
      created_at    = now()
  `;
}
