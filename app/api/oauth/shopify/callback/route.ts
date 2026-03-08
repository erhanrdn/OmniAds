import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { SHOPIFY_CONFIG } from "@/lib/oauth/shopify-config";
import { upsertIntegration } from "@/lib/integrations";
import { requireBusinessAccess } from "@/lib/access";

/**
 * GET /api/oauth/shopify/callback?code=...&shop=...&state=...&hmac=...&timestamp=...
 *
 * Handles the OAuth redirect from Shopify:
 *   1. Validates the HMAC signature
 *   2. Validates the state parameter against the cookie
 *   3. Exchanges the authorization code for a permanent access token
 *   4. Fetches shop metadata
 *   5. Upserts the integration record in the DB
 *   6. Redirects to the frontend callback page with status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");
  const hmac = searchParams.get("hmac");
  const timestamp = searchParams.get("timestamp");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  function errorRedirect(msg: string, businessId?: string) {
    const url = new URL("/integrations/callback/shopify", baseUrl);
    url.searchParams.set("status", "error");
    url.searchParams.set("error", msg);
    if (businessId) url.searchParams.set("businessId", businessId);
    return NextResponse.redirect(url.toString());
  }

  // ── Validate required params ───────────────────────────────
  if (!code || !shop || !state || !hmac || !timestamp) {
    return errorRedirect("Missing required Shopify callback parameters.");
  }

  // ── Validate HMAC signature ────────────────────────────────
  // Build the message string from all query params except hmac
  const params = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (key !== "hmac") {
      params.set(key, value);
    }
  }
  // Sort params alphabetically for HMAC (required by Shopify)
  const sortedParams = new URLSearchParams(
    [...params.entries()].sort(([a], [b]) => a.localeCompare(b)),
  );
  const message = sortedParams.toString();
  const expectedHmac = crypto
    .createHmac("sha256", SHOPIFY_CONFIG.clientSecret)
    .update(message)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
    console.error("[shopify-oauth-callback] HMAC verification failed", {
      shop,
      expected: expectedHmac,
      received: hmac,
    });
    return errorRedirect("HMAC verification failed. Request may be tampered.");
  }

  // ── Validate state against cookie ──────────────────────────
  const cookieState = request.cookies.get("shopify_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return errorRedirect("Invalid OAuth state. Please try again.");
  }

  // Decode businessId from state
  let businessId: string;
  try {
    const payload = JSON.parse(Buffer.from(state, "base64url").toString());
    businessId = payload.businessId;
    if (!businessId) throw new Error("No businessId in state payload");
  } catch {
    return errorRedirect("Malformed OAuth state.");
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) {
    return errorRedirect(
      "You do not have permission to connect integrations for this business.",
      businessId,
    );
  }

  try {
    // ── Exchange code for permanent access token ───────────────
    const tokenRes = await fetch(SHOPIFY_CONFIG.tokenUrl(shop), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: SHOPIFY_CONFIG.clientId,
        client_secret: SHOPIFY_CONFIG.clientSecret,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      throw new Error(
        tokenData.error_description ||
          tokenData.error ||
          `Shopify token exchange failed (HTTP ${tokenRes.status}).`,
      );
    }

    const accessToken: string = tokenData.access_token;
    const grantedScopes: string = tokenData.scope ?? "";

    // ── Fetch shop metadata ─────────────────────────────────────
    let shopName: string = shop;
    try {
      const shopRes = await fetch(SHOPIFY_CONFIG.shopInfoUrl(shop), {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          Accept: "application/json",
        },
      });
      if (shopRes.ok) {
        const shopData = await shopRes.json();
        shopName = shopData.shop?.name ?? shop;
      }
    } catch (shopErr) {
      console.warn(
        "[shopify-oauth-callback] Failed to fetch shop info (non-fatal):",
        shopErr,
      );
    }

    // ── Save to DB ──────────────────────────────────────────────
    // Shopify permanent tokens do not expire, so no token_expires_at.
    const integration = await upsertIntegration({
      businessId,
      provider: "shopify",
      status: "connected",
      providerAccountId: shop, // Shop domain as the unique account identifier
      providerAccountName: shopName, // Human-readable shop name
      accessToken,
      scopes: grantedScopes,
    });

    console.log("[shopify-oauth-callback] integration upserted", {
      businessId,
      integrationId: integration.id,
      shop,
      shopName,
    });

    // ── Redirect to frontend callback with success ──────────────
    const redirectUrl = new URL("/integrations/callback/shopify", baseUrl);
    redirectUrl.searchParams.set("status", "success");
    redirectUrl.searchParams.set("businessId", businessId);
    redirectUrl.searchParams.set("integrationId", integration.id);

    const response = NextResponse.redirect(redirectUrl.toString());
    // Clear the state cookie
    response.cookies.set("shopify_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error during Shopify OAuth.";
    console.error("[shopify-oauth-callback] error", {
      businessId,
      shop,
      message,
    });
    return errorRedirect(message, businessId);
  }
}
