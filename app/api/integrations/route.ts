import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import {
  getIntegrationsByBusiness,
  getIntegration,
  disconnectIntegration,
} from "@/lib/integrations";
import type { IntegrationProviderType } from "@/lib/integrations";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoIntegrations } from "@/lib/demo-business";

/**
 * GET /api/integrations?businessId=...&provider=...
 *
 * Returns integrations for a business.
 * If provider is specified, returns a single integration.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId is required." },
      { status: 400 },
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const provider = searchParams.get(
    "provider",
  ) as IntegrationProviderType | null;

  if (provider) {
    if (await isDemoBusiness(businessId)) {
      const integration = getDemoIntegrations().find((item) => item.provider === provider) ?? null;
      return NextResponse.json({ integration });
    }
    const integration = await getIntegration(businessId, provider);
    return NextResponse.json({ integration });
  }

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json({ integrations: getDemoIntegrations() });
  }

  const integrations = await getIntegrationsByBusiness(businessId);
  return NextResponse.json({ integrations });
}

/**
 * DELETE /api/integrations?businessId=...&provider=...
 *
 * Disconnects a specific integration.
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const provider = searchParams.get(
    "provider",
  ) as IntegrationProviderType | null;

  if (!businessId || !provider) {
    return NextResponse.json(
      { error: "businessId and provider are required." },
      { status: 400 },
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json({ status: "disconnected" });
  }

  await disconnectIntegration(businessId, provider);
  return NextResponse.json({ status: "disconnected" });
}
