import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { upsertIntegration } from "@/lib/integrations";
import { isDemoBusinessId } from "@/lib/demo-business";
import {
  getSearchConsoleSiteType,
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";

function normalizeSiteUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("sc-domain:")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { businessId?: unknown; siteUrl?: unknown }
    | null;

  const businessId =
    typeof body?.businessId === "string" ? body.businessId : null;
  const siteUrl = normalizeSiteUrl(body?.siteUrl);

  if (!businessId || !siteUrl) {
    return NextResponse.json(
      {
        error: "missing_fields",
        message: "businessId and siteUrl are required.",
      },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json({
      success: true,
      integration: {
        id: "demo-search-console",
        provider: "search_console",
        status: "connected",
        provider_account_id: siteUrl,
        provider_account_name: siteUrl,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          siteUrl,
          siteType: getSearchConsoleSiteType(siteUrl),
          propertyName: "urbantrail.co",
          connectedAt: new Date().toISOString(),
        },
      },
    });
  }

  try {
    const context = await resolveSearchConsoleContext({
      businessId,
      requireSite: false,
    });

    const existingMetadata =
      context.integration.metadata && typeof context.integration.metadata === "object"
        ? (context.integration.metadata as Record<string, unknown>)
        : {};

    const selected = await upsertIntegration({
      businessId,
      provider: "search_console",
      status: "connected",
      providerAccountId: siteUrl,
      providerAccountName: siteUrl,
      metadata: {
        ...existingMetadata,
        siteUrl,
        siteType: getSearchConsoleSiteType(siteUrl),
        propertyName: siteUrl,
        connectedAt:
          context.integration.connected_at ?? new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      integration: {
        id: selected.id,
        provider: selected.provider,
        status: selected.status,
        provider_account_id: selected.provider_account_id,
        provider_account_name: selected.provider_account_name,
        connected_at: selected.connected_at,
        updated_at: selected.updated_at,
        metadata: selected.metadata,
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
      { error: "search_console_select_site_failed", message: "Could not save selected site." },
      { status: 500 },
    );
  }
}
