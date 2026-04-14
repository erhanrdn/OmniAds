import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import {
  getSearchConsoleSiteType,
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";
import {
  ProviderRequestCooldownError,
  runProviderRequestWithGovernance,
} from "@/lib/provider-request-governance";

interface SearchConsoleSiteEntry {
  siteUrl?: string;
  permissionLevel?: string;
}

const SEARCH_CONSOLE_SITES_TIMEOUT_MS = 10_000;

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
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json({
      sites: [
        { siteUrl: "sc-domain:urbantrail.co", permissionLevel: "siteOwner", siteType: "domain" },
        { siteUrl: "https://urbantrail.co/", permissionLevel: "siteOwner", siteType: "url-prefix" },
      ],
    });
  }

  try {
    const context = await resolveSearchConsoleContext({
      businessId,
      requireSite: false,
    });
    let payload;
    try {
      payload = await runProviderRequestWithGovernance({
        provider: "search_console",
        businessId,
        requestType: "sites",
        requestSource: "discovery",
        requestPath: "/api/google-search-console/sites",
        tripGlobalBreakerFor: ["quota", "auth", "permission"],
        execute: async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), SEARCH_CONSOLE_SITES_TIMEOUT_MS);
          const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
            headers: {
              Authorization: `Bearer ${context.accessToken}`,
              Accept: "application/json",
            },
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const parsed = (await response.json().catch(() => null)) as
            | { siteEntry?: SearchConsoleSiteEntry[] }
            | null;

          if (!response.ok) {
            const providerMessage = extractGoogleApiMessage(parsed);
            const error = new Error(
              providerMessage ?? "Could not fetch Search Console properties.",
            ) as Error & { status?: number };
            error.status = response.status || 502;
            throw error;
          }

          return parsed;
        },
      });
    } catch (error) {
      if (error instanceof ProviderRequestCooldownError) {
        return NextResponse.json(
          {
            error: "search_console_sites_cooldown",
            message:
              "Search Console refresh is temporarily paused after repeated failures. Please try again shortly.",
            retryAfterMs: error.retryAfterMs,
          },
          { status: 503 },
        );
      }
      throw error;
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
