import { NextRequest, NextResponse } from "next/server";
import { SHOPIFY_CONFIG } from "@/lib/oauth/shopify-config";
import { sanitizeNextPath } from "@/lib/auth-routing";
import { getSessionFromRequest } from "@/lib/auth";
import { verifyShopifyQueryHmac } from "@/lib/shopify/oauth-hmac";
import { createShopifyOAuthState } from "@/lib/shopify/oauth-state";
import { normalizeShopifyShopDomain } from "@/lib/shopify/shop-domain";

function hasValidInstallSignature(request: NextRequest): boolean {
  return verifyShopifyQueryHmac({
    url: request.nextUrl,
    clientSecret: SHOPIFY_CONFIG.clientSecret,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const shop = normalizeShopifyShopDomain(searchParams.get("shop"));
  const host = searchParams.get("host")?.trim() ?? "";
  const returnTo = sanitizeNextPath(searchParams.get("returnTo"));
  const businessId = searchParams.get("businessId")?.trim() ?? "";
  const signedInstallRequest = searchParams.has("hmac");

  if (!shop) {
    return NextResponse.redirect(new URL("/shopify/connect", request.url));
  }
  if (signedInstallRequest && !hasValidInstallSignature(request)) {
    return NextResponse.redirect(new URL("/shopify/connect", request.url));
  }

  const session = await getSessionFromRequest(request);
  const state = createShopifyOAuthState({
    businessId: businessId || session?.activeBusinessId || undefined,
    returnTo,
    host: host || undefined,
  });

  const params = new URLSearchParams({
    client_id: SHOPIFY_CONFIG.clientId,
    scope: SHOPIFY_CONFIG.scopes,
    redirect_uri: SHOPIFY_CONFIG.redirectUri,
    state,
  });

  const authorizationUrl =
    `${SHOPIFY_CONFIG.authUrl(shop)}?${params.toString()}`;

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
