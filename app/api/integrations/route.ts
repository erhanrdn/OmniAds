import { NextRequest, NextResponse } from "next/server";
import {
  getIntegrationsByBusiness,
  getIntegration,
  disconnectIntegration,
} from "@/lib/integrations";
import type { IntegrationProviderType } from "@/lib/integrations";

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

  const provider = searchParams.get(
    "provider",
  ) as IntegrationProviderType | null;

  if (provider) {
    const integration = await getIntegration(businessId, provider);
    return NextResponse.json({ integration });
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

  await disconnectIntegration(businessId, provider);
  return NextResponse.json({ status: "disconnected" });
}
