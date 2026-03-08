import { NextRequest, NextResponse } from "next/server";
import {
  SHOPIFY_CONFIG,
  normalizeShopDomain,
} from "@/lib/oauth/shopify-config";
import crypto from "crypto";
import { requireBusinessAccess } from "@/lib/access";

/**
 * GET /api/oauth/shopify/start?businessId=...&shop=...
 *
 * Redirects the user to the Shopify OAuth consent screen for the given shop.
 * Generates a cryptographic nonce (state) to prevent CSRF.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const shopRaw = searchParams.get("shop");

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  if (!shopRaw) {
    return NextResponse.json(
      { error: "shop query parameter is required." },
      { status: 400 },
    );
  }

  const shop = normalizeShopDomain(shopRaw);
  if (!shop) {
    return NextResponse.json(
      {
        error: "invalid_shop",
        message:
          "Invalid shop domain. Please enter a valid *.myshopify.com store name.",
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

  // Generate a random state that encodes the businessId and shop
  const statePayload = JSON.stringify({
    businessId,
    shop,
    nonce: crypto.randomBytes(16).toString("hex"),
  });
  const state = Buffer.from(statePayload).toString("base64url");

  const params = new URLSearchParams({
    client_id: SHOPIFY_CONFIG.clientId,
    scope: SHOPIFY_CONFIG.scopes,
    redirect_uri: SHOPIFY_CONFIG.redirectUri,
    state,
  });

  const authorizationUrl = `${SHOPIFY_CONFIG.authUrl(shop)}?${params.toString()}`;

  console.log("[shopify-oauth-start]", {
    businessId,
    shop,
    redirectUri: SHOPIFY_CONFIG.redirectUri,
  });

  // Set state in a short-lived httpOnly cookie for validation in callback
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
