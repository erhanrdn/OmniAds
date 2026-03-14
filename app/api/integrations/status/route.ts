import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoIntegrations } from "@/lib/demo-business";
import { getIntegrationsByBusiness } from "@/lib/integrations";

const PROVIDERS = [
  "meta",
  "google",
  "tiktok",
  "pinterest",
  "snapchat",
  "klaviyo",
  "shopify",
  "ga4",
  "search_console",
] as const;

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId is required." },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const integrations = (await isDemoBusiness(businessId))
    ? getDemoIntegrations()
    : await getIntegrationsByBusiness(businessId);

  const status = Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      integrations.some(
        (integration) => integration.provider === provider && integration.status === "connected"
      ),
    ])
  );

  return NextResponse.json(status);
}
