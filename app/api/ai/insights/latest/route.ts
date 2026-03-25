import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { resolveRequestLanguage } from "@/lib/request-language";

interface AiInsightRow {
  insight_date: string;
  summary: string;
  risks: unknown;
  opportunities: unknown;
  recommendations: unknown;
  created_at: string;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;
  const locale = await resolveRequestLanguage(request);

  const sql = getDb();
  const rows = (await sql`
    SELECT insight_date::text AS insight_date, summary, risks, opportunities, recommendations, created_at
    FROM ai_daily_insights
    WHERE business_id = ${businessId}
      AND locale = ${locale}
      AND status = 'success'
    ORDER BY insight_date DESC, created_at DESC
    LIMIT 1
  `) as AiInsightRow[];

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ insight: null });
  }

  return NextResponse.json({
    insight: {
      insightDate: row.insight_date,
      summary: row.summary,
      risks: toStringArray(row.risks),
      opportunities: toStringArray(row.opportunities),
      recommendations: toStringArray(row.recommendations),
      createdAt: row.created_at,
    },
  });
}
