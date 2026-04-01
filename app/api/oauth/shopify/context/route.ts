import { NextRequest, NextResponse } from "next/server";
import { getShopifyInstallContext } from "@/lib/shopify/install-context";
import { sanitizeNextPath } from "@/lib/auth-routing";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json(
      { error: "missing_token", message: "Context token is required." },
      { status: 400 },
    );
  }

  const context = await getShopifyInstallContext(token);
  if (!context) {
    return NextResponse.json(
      { error: "context_not_found", message: "Shopify install context not found or expired." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    context: {
      token: context.token,
      shopDomain: context.shop_domain,
      shopName: context.shop_name,
      returnTo: sanitizeNextPath(context.return_to) ?? "/integrations",
      preferredBusinessId: context.preferred_business_id,
      createdAt: context.created_at,
      expiresAt: context.expires_at,
      currency:
        context.metadata && typeof context.metadata.currency === "string"
          ? context.metadata.currency
          : null,
      ianaTimeZone:
        context.metadata && typeof context.metadata.iana_timezone === "string"
          ? context.metadata.iana_timezone
          : null,
    },
  });
}
