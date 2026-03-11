import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  getSearchConsoleSiteType,
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";

interface SearchConsoleSiteEntry {
  siteUrl?: string;
  permissionLevel?: string;
}

function extractGoogleApiMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as {
    error?: { message?: unknown; status?: unknown };
  };
  const msg = root.error?.message;
  return typeof msg === "string" && msg.trim() ? msg : null;
}

function isServiceDisabled(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const root = payload as { error?: { status?: unknown } };
  return root.error?.status === "PERMISSION_DENIED";
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
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
      requireSite: false,
    });

    const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | { siteEntry?: SearchConsoleSiteEntry[] }
      | null;

    if (!response.ok) {
      const providerMessage = extractGoogleApiMessage(payload);
      return NextResponse.json(
        {
          error: isServiceDisabled(payload)
            ? "search_console_api_disabled"
            : "search_console_sites_fetch_failed",
          message:
            providerMessage ??
            "Could not fetch Search Console properties.",
          details: payload,
        },
        { status: response.status || 502 },
      );
    }

    const sites = (payload?.siteEntry ?? [])
      .map((row) => {
        const siteUrl = typeof row.siteUrl === "string" ? row.siteUrl : "";
        if (!siteUrl) return null;
        return {
          siteUrl,
          permissionLevel:
            typeof row.permissionLevel === "string" ? row.permissionLevel : "unknown",
          siteType: getSearchConsoleSiteType(siteUrl),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    return NextResponse.json({
      sites,
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
        error: "search_console_sites_fetch_failed",
        message: "Could not fetch Search Console properties.",
      },
      { status: 500 },
    );
  }
}
