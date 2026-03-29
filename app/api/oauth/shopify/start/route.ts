import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { SHOPIFY_CONFIG } from "@/lib/oauth/shopify-config";
import { sanitizeNextPath } from "@/lib/auth-routing";
import { getSessionFromRequest } from "@/lib/auth";

const SHOP_DOMAIN_PATTERN =
  /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function isValidShopDomain(value: string): boolean {
  return SHOP_DOMAIN_PATTERN.test(value);
}

function hasValidInstallSignature(request: NextRequest): boolean {
  const hmac = request.nextUrl.searchParams.get("hmac")?.trim() ?? "";
  if (!hmac) return false;

  const params = new URLSearchParams();
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (key !== "hmac") {
      params.set(key, value);
    }
  }
  const sortedParams = new URLSearchParams(
    [...params.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  const message = sortedParams.toString();
  const expectedHmac = crypto
    .createHmac("sha256", SHOPIFY_CONFIG.clientSecret)
    .update(message)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedHmac);
  const receivedBuffer = Buffer.from(hmac);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const shop = searchParams.get("shop")?.trim().toLowerCase() ?? "";
  const host = searchParams.get("host")?.trim() ?? "";
  const returnTo = sanitizeNextPath(searchParams.get("returnTo"));
  const businessId = searchParams.get("businessId")?.trim() ?? "";
  const signedInstallRequest = searchParams.has("hmac");

  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.redirect(new URL("/shopify/connect", request.url));
  }
  if (signedInstallRequest && !hasValidInstallSignature(request)) {
    return NextResponse.redirect(new URL("/shopify/connect", request.url));
  }

  const session = await getSessionFromRequest(request);
  const statePayload = JSON.stringify({
    businessId: businessId || session?.activeBusinessId || undefined,
    returnTo,
    host: host || undefined,
    nonce: crypto.randomBytes(16).toString("hex"),
  });
  const state = Buffer.from(statePayload).toString("base64url");

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
