import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";

interface SearchConsoleRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ??
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 28).toISOString().slice(0, 10);
  const endDate =
    request.nextUrl.searchParams.get("endDate") ??
    new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().slice(0, 10);
  const rowLimit = Math.min(
    500,
    Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("rowLimit") ?? "200", 10)),
  );

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  try {
    const context = await resolveSearchConsoleContext({
      businessId,
      requireSite: true,
    });

    const endpointSite = encodeURIComponent(context.siteUrl ?? "");
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${endpointSite}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["query", "page"],
          rowLimit,
        }),
        cache: "no-store",
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { rows?: SearchConsoleRow[] }
      | null;

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "search_console_analytics_failed",
          message: "Could not fetch Search Console analytics.",
          details: payload,
        },
        { status: response.status || 502 },
      );
    }

    const rows = (payload?.rows ?? []).map((row) => ({
      query: typeof row.keys?.[0] === "string" ? row.keys[0] : "",
      page: typeof row.keys?.[1] === "string" ? row.keys[1] : "",
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      ctr: Number(row.ctr ?? 0),
      position: Number(row.position ?? 0),
    }));

    return NextResponse.json({
      rows,
      meta: {
        siteUrl: context.siteUrl,
        startDate,
        endDate,
        rowCount: rows.length,
      },
    });
  } catch (error) {
    if (error instanceof SearchConsoleAuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "search_console_analytics_failed",
        message: "Could not fetch Search Console analytics.",
      },
      { status: 500 },
    );
  }
}
