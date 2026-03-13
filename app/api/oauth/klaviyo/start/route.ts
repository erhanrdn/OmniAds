import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { upsertIntegration } from "@/lib/integrations";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const returnTo = searchParams.get("returnTo") ?? "/integrations/callback/klaviyo";

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  const integration = await upsertIntegration({
    businessId,
    provider: "klaviyo",
    status: "connected",
    providerAccountId: `klaviyo-${businessId.slice(0, 8)}`,
    providerAccountName: "Klaviyo workspace",
    metadata: {
      connectionMode: "preview",
      syncedAt: new Date().toISOString(),
      benchmarkMode: "baseline",
    },
  });

  const callbackUrl = new URL(returnTo, request.nextUrl.origin);
  callbackUrl.searchParams.set("businessId", businessId);
  callbackUrl.searchParams.set("status", "success");
  callbackUrl.searchParams.set("integrationId", integration.id);

  return NextResponse.redirect(callbackUrl);
}
