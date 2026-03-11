import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";
import { scoreQueryGeo, assignPriority, assignConfidence } from "@/lib/geo-scoring";
import {
  classifyQuery,
  deriveOpportunityLabel,
  FORMAT_LABELS,
  INTENT_LABELS,
} from "@/lib/geo-query-classification";
import { computeMomentum, computePreviousPeriod } from "@/lib/geo-momentum";

type ScRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function fetchSCQueries(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<ScRow[]> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 500 }),
      cache: "no-store",
    }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { rows?: ScRow[] };
  return data.rows ?? [];
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ??
    new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const endDate =
    request.nextUrl.searchParams.get("endDate") ??
    new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "collaborator" });
  if ("error" in access) return access.error;

  let context: Awaited<ReturnType<typeof resolveSearchConsoleContext>>;
  try {
    context = await resolveSearchConsoleContext({ businessId, requireSite: true });
  } catch (err) {
    if (err instanceof SearchConsoleAuthError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    throw err;
  }

  const { prevStart, prevEnd } = computePreviousPeriod(startDate, endDate);
  const siteUrl = context.siteUrl ?? "";
  const token = context.accessToken;

  // Fetch current + previous periods in parallel
  const [currentRows, previousRows] = await Promise.all([
    fetchSCQueries(token, siteUrl, startDate, endDate),
    fetchSCQueries(token, siteUrl, prevStart, prevEnd),
  ]);

  if (currentRows.length === 0) {
    return NextResponse.json(
      { error: "sc_fetch_failed", message: "Could not fetch Search Console queries." },
      { status: 502 }
    );
  }

  // Build previous-period lookup
  const prevImpMap = new Map<string, number>();
  for (const r of previousRows) {
    prevImpMap.set(r.keys?.[0] ?? "", Math.round(r.impressions ?? 0));
  }

  const rows = currentRows.map((row) => {
    const query = row.keys?.[0] ?? "";
    const wordCount = query.trim().split(/\s+/).length;
    const impressions = Math.round(row.impressions ?? 0);
    const clicks = Math.round(row.clicks ?? 0);
    const ctr = row.ctr ?? 0;
    const position = Math.round((row.position ?? 0) * 10) / 10;

    // v3 semantic classification (replaces simple heuristic)
    const cls = classifyQuery(query);
    const opportunityLabel = deriveOpportunityLabel(cls);

    // GEO scoring with breakdown
    const geoScored = scoreQueryGeo({
      impressions,
      position,
      ctr,
      isAiStyle: cls.isAiStyle,
      wordCount,
    });
    const geoScore = geoScored.total;
    const priority = assignPriority(geoScore, impressions);
    const confidence = assignConfidence(false, true, impressions > 100 ? 10 : impressions > 10 ? 5 : 1);

    // Momentum
    const prevImpressions = prevImpMap.get(query) ?? 0;
    const momentum = computeMomentum(impressions, prevImpressions, 5);

    // Richer recommendation: combine classification + GEO score + position
    let recommendation: string | null = opportunityLabel;
    if (!recommendation) {
      if (geoScore >= 65 && position > 5) recommendation = "High-value GEO target — deepen content to rank in top 5";
      else if (geoScore >= 65) recommendation = "Strong GEO query — ensure full answer-first structure";
      else if (position >= 5 && position <= 12 && impressions > 50) recommendation = "Near page 1 — add FAQ + structured data to push over";
      else if (cls.format === "comparison" && ctr < 0.04) recommendation = "Comparison intent — add a comparison table to improve CTR";
    }

    return {
      query,
      clicks,
      impressions,
      ctr,
      position,
      // v2 compat fields
      intent: INTENT_LABELS[cls.intent],
      isAiStyle: cls.isAiStyle,
      opportunityLabel,
      // v3 classification
      classification: {
        intent: cls.intent,
        intentLabel: INTENT_LABELS[cls.intent],
        format: cls.format,
        formatLabel: FORMAT_LABELS[cls.format],
        confidence: cls.confidence,
        signals: cls.signals,
      },
      geoScore,
      geoScoreBreakdown: geoScored.components,
      momentum: {
        status: momentum.status,
        label: momentum.label,
        score: momentum.score,
        growthRate: momentum.growthRate,
      },
      priority,
      confidence,
      recommendation,
    };
  });

  // Sort: breakout/rising AI-style queries first, then by geoScore
  rows.sort((a, b) => {
    const aBreaking = a.isAiStyle && (a.momentum.status === "breakout" || a.momentum.status === "rising");
    const bBreaking = b.isAiStyle && (b.momentum.status === "breakout" || b.momentum.status === "rising");
    if (aBreaking !== bBreaking) return bBreaking ? 1 : -1;
    if (a.isAiStyle !== b.isAiStyle) return b.isAiStyle ? 1 : -1;
    return b.geoScore - a.geoScore;
  });

  return NextResponse.json({ queries: rows, total: rows.length });
}
