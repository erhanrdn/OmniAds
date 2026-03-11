import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";
import { scoreQueryIntent } from "@/lib/geo-intelligence";

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
    const intent = scoreQueryIntent(query);
    return {
      query,
      clicks: Math.round(row.clicks ?? 0),
      impressions: Math.round(row.impressions ?? 0),
      ctr: row.ctr ?? 0,
      position: Math.round((row.position ?? 0) * 10) / 10,
      intent: intent.intent,
      isAiStyle: intent.isAiStyle,
      opportunityLabel: intent.opportunityLabel,
    };
  });

  // Sort AI-style queries first, then by impressions
  rows.sort((a, b) => {
    if (a.isAiStyle !== b.isAiStyle) return b.isAiStyle ? 1 : -1;
    return b.impressions - a.impressions;
  });

  return NextResponse.json({ queries: rows, total: rows.length });
}
