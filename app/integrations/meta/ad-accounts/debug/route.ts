import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { fetchMetaAdAccounts } from "@/lib/meta-ad-accounts";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const businessId = request.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json(
      {
        error: "missing_business_id",
        message: "businessId query parameter is required.",
      },
      { status: 400 }
    );
  }

  const integration = await getIntegration(businessId, "meta");
  if (!integration) {
    return NextResponse.json(
      {
        error: "integration_not_found",
        message: "Meta integration not found for this business.",
      },
      { status: 404 }
    );
  }

  if (!integration.access_token) {
    return NextResponse.json(
      {
        error: "missing_access_token",
        message: "Meta access token is missing for this business integration.",
      },
      { status: 401 }
    );
  }

  const result = await fetchMetaAdAccounts(integration.access_token);
  return NextResponse.json({
    businessId,
    integration: {
      id: integration.id,
      status: integration.status,
      token_expires_at: integration.token_expires_at,
      has_access_token: Boolean(integration.access_token),
      scopes: integration.scopes,
    },
    meta: {
      status: result.status,
      ok: result.ok,
      body: result.body,
      raw: result.rawBody,
      normalized_count: result.normalized.length,
    },
  });
}
