import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import { refreshGoogleAccessToken } from "@/lib/google-ads-accounts";

interface SearchConsoleSiteRow {
  siteUrl: string;
  permissionLevel?: string;
}

function normalizePropertyUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("sc-domain:")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function getValidAccessToken(businessId: string) {
  const integration = await getIntegration(businessId, "search_console");
  if (!integration || integration.status !== "connected") {
    return { error: "Search Console integration is not connected.", status: 404 as const };
  }

  let accessToken = integration.access_token;
  if (!accessToken) {
    return { error: "Search Console access token is missing.", status: 401 as const };
  }

  if (integration.token_expires_at) {
    const expired = new Date(integration.token_expires_at).getTime() <= Date.now();
    if (expired) {
      if (!integration.refresh_token) {
        return {
          error:
            "Search Console access token expired and no refresh token is available. Reconnect required.",
          status: 401 as const,
        };
      }

      const refreshed = await refreshGoogleAccessToken(integration.refresh_token);
      accessToken = refreshed.accessToken;

      await upsertIntegration({
        businessId,
        provider: "search_console",
        status: "connected",
        providerAccountId: integration.provider_account_id ?? undefined,
        providerAccountName: integration.provider_account_name ?? undefined,
        accessToken: refreshed.accessToken,
        refreshToken: integration.refresh_token ?? undefined,
        tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        scopes: integration.scopes ?? undefined,
      });
    }
  }

  return { integration, accessToken };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  const tokenResult = await getValidAccessToken(businessId);
  if ("error" in tokenResult) {
    return NextResponse.json(
      { error: "search_console_access_error", message: tokenResult.error },
      { status: tokenResult.status },
    );
  }

  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: {
      Authorization: `Bearer ${tokenResult.accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        error: "search_console_sites_fetch_failed",
        message: "Could not fetch Search Console properties.",
        details: payload,
      },
      { status: response.status || 502 },
    );
  }

  const sites = Array.isArray((payload as { siteEntry?: unknown[] } | null)?.siteEntry)
    ? ((payload as { siteEntry: SearchConsoleSiteRow[] }).siteEntry ?? [])
    : [];

  return NextResponse.json({ data: sites });
}

export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  const integration = await getIntegration(businessId, "search_console");
  if (!integration || integration.status !== "connected") {
    return NextResponse.json(
      {
        error: "search_console_not_connected",
        message: "Search Console integration is not connected for this business.",
      },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  const propertyUrl = normalizePropertyUrl(
    (body as { property_url?: unknown } | null)?.property_url,
  );

  if (!propertyUrl) {
    return NextResponse.json(
      {
        error: "invalid_property_url",
        message: "A valid property_url is required.",
      },
      { status: 400 },
    );
  }

  const updated = await upsertIntegration({
    businessId,
    provider: "search_console",
    status: "connected",
    providerAccountId: propertyUrl,
    providerAccountName: propertyUrl,
    accessToken: integration.access_token ?? undefined,
    refreshToken: integration.refresh_token ?? undefined,
    tokenExpiresAt: integration.token_expires_at
      ? new Date(integration.token_expires_at)
      : undefined,
    scopes: integration.scopes ?? undefined,
  });

  return NextResponse.json({ success: true, integration: updated });
}
