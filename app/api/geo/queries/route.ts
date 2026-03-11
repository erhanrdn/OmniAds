import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";
import { scoreQueryIntent } from "@/lib/geo-intelligence";
import { scoreQueryGeo, assignPriority, assignConfidence } from "@/lib/geo-scoring";

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

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  let context: Awaited<ReturnType<typeof resolveSearchConsoleContext>>;
  try {
    context = await resolveSearchConsoleContext({
      businessId,
      requireSite: true,
    });
  } catch (err) {
    if (err instanceof SearchConsoleAuthError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status }
      );
    }
    throw err;
  }

  const endpointSite = encodeURIComponent(context.siteUrl ?? "");
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${endpointSite}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit: 500,
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "sc_fetch_failed", message: "Could not fetch Search Console queries." },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
  };

  const rows = (data.rows ?? []).map((row) => {
    const query = row.keys?.[0] ?? "";
    const wordCount = query.trim().split(/\s+/).length;
    const intent = scoreQueryIntent(query);
    const impressions = Math.round(row.impressions ?? 0);
    const clicks = Math.round(row.clicks ?? 0);
    const ctr = row.ctr ?? 0;
    const position = Math.round((row.position ?? 0) * 10) / 10;

    // v2 GEO scoring
    const scored = scoreQueryGeo({
      impressions,
      position,
      ctr,
      isAiStyle: intent.isAiStyle,
      wordCount,
    });
    const geoScore = scored.total;
    const priority = assignPriority(geoScore, impressions);
    const confidence = assignConfidence(false, true, impressions > 100 ? 10 : impressions > 10 ? 5 : 1);

    // Derive a short recommendation from intent
    let recommendation: string | null = intent.opportunityLabel;
    if (!recommendation && geoScore >= 60) {
      recommendation = "High-value GEO target — create dedicated content";
    } else if (!recommendation && position >= 5 && position <= 15 && impressions > 50) {
      recommendation = "Near page 1 — improve content depth to rank higher";
    }

    return {
      query,
      clicks,
      impressions,
      ctr,
      position,
      intent: intent.intent,
      isAiStyle: intent.isAiStyle,
      opportunityLabel: intent.opportunityLabel,
      geoScore,
      priority,
      confidence,
      recommendation,
    };
  });

  // Sort AI-style queries first, then by geoScore
  rows.sort((a, b) => {
    if (a.isAiStyle !== b.isAiStyle) return b.isAiStyle ? 1 : -1;
    return b.geoScore - a.geoScore;
  });

  return NextResponse.json({ queries: rows, total: rows.length });
}
