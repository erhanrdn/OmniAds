import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getLatestShopifyInstallContextForActor } from "@/lib/shopify/install-context";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "auth_error", message: "Authentication required." },
      { status: 401 },
    );
  }

  const context = await getLatestShopifyInstallContextForActor({
    sessionId: session.sessionId,
    userId: session.user.id,
  });

  if (!context) {
    return NextResponse.json({ context: null });
  }

  return NextResponse.json({
    context: {
      token: context.token,
      shopDomain: context.shop_domain,
      shopName: context.shop_name,
      returnTo: context.return_to,
      preferredBusinessId: context.preferred_business_id,
      createdAt: context.created_at,
      expiresAt: context.expires_at,
    },
  });
}
