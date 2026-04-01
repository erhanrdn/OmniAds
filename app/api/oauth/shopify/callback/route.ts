import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { SHOPIFY_CONFIG } from "@/lib/oauth/shopify-config";
import { upsertIntegration } from "@/lib/integrations";
import { updateBusinessCurrency } from "@/lib/account-store";
import { requireBusinessAccess } from "@/lib/access";
import { resolveRequestLanguage } from "@/lib/request-language";
import { createShopifyInstallContext } from "@/lib/shopify/install-context";
import { getSessionFromRequest } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/auth-routing";
import { verifyShopifyQueryHmac } from "@/lib/shopify/oauth-hmac";

/**
 * GET /api/oauth/shopify/callback?code=...&shop=...&state=...&hmac=...&timestamp=...
 *
 * Handles the OAuth redirect from Shopify:
 *   1. Validates the HMAC signature
 *   2. Validates the state parameter against the cookie when present
 *   3. Exchanges the authorization code for a permanent access token
 *   4. Fetches shop metadata
 *   5. Either upserts the integration directly or stores a pending install context
 *   6. Redirects to onboarding / callback UI with status
 */
export async function GET(request: NextRequest) {
  const language = await resolveRequestLanguage(request);
  const tr = (english: string, turkish: string) => (language === "tr" ? turkish : english);
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const state = searchParams.get("state");
  const hmac = searchParams.get("hmac");
  const timestamp = searchParams.get("timestamp");

  const baseUrl = SHOPIFY_CONFIG.appUrl;

  function errorRedirect(msg: string, businessId?: string) {
    const url = new URL("/integrations/callback/shopify", baseUrl);
    url.searchParams.set("status", "error");
    url.searchParams.set("error", msg);
    if (businessId) url.searchParams.set("businessId", businessId);
    return NextResponse.redirect(url.toString());
  }

  // ── Validate required params ───────────────────────────────
  if (!code || !shop || !hmac || !timestamp) {
    return errorRedirect(tr("Missing required Shopify callback parameters.", "Gerekli Shopify callback parametreleri eksik."));
  }

  // ── Validate HMAC signature ────────────────────────────────
  if (!verifyShopifyQueryHmac({
    url: request.nextUrl,
    clientSecret: SHOPIFY_CONFIG.clientSecret,
  })) {
    console.error("[shopify-oauth-callback] HMAC verification failed", {
      shop,
      received: hmac,
    });
    return errorRedirect(tr("HMAC verification failed. Request may be tampered.", "HMAC doğrulamasi başarısız. Istekle oynanmis olabilir."));
  }

  let stateBusinessId: string | null = null;
  let stateReturnTo: string | null = null;
  if (state) {
    try {
      const payload = JSON.parse(Buffer.from(state, "base64url").toString()) as {
        businessId?: string;
        returnTo?: string;
      };
      stateBusinessId = typeof payload.businessId === "string" ? payload.businessId : null;
      stateReturnTo = sanitizeNextPath(payload.returnTo) ?? null;
    } catch {
      console.warn("[shopify-oauth-callback] Ignoring malformed state payload");
    }
  }

  const cookieState = request.cookies.get("shopify_oauth_state")?.value;
  const hasVerifiedState = Boolean(state && cookieState && cookieState === state);
  const session = await getSessionFromRequest(request);

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
    let shopCurrency: string | null = null;
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
        shopCurrency = shopData.shop?.currency ?? null;
      }
    } catch (shopErr) {
      console.warn(
        "[shopify-oauth-callback] Failed to fetch shop info (non-fatal):",
        shopErr,
      );
    }

    const metadata = shopCurrency ? { currency: shopCurrency } : undefined;

    if (hasVerifiedState && stateBusinessId) {
      const access = await requireBusinessAccess({
        request,
        businessId: stateBusinessId,
        minRole: "collaborator",
      });

      if (!("error" in access)) {
        const integration = await upsertIntegration({
          businessId: stateBusinessId,
          provider: "shopify",
          status: "connected",
          providerAccountId: shop,
          providerAccountName: shopName,
          accessToken,
          scopes: grantedScopes,
          metadata,
        });

        if (shopCurrency) {
          try {
            await updateBusinessCurrency(stateBusinessId, shopCurrency);
          } catch (currencyErr) {
            console.warn("[shopify-oauth-callback] Failed to sync shop currency (non-fatal):", currencyErr);
          }
        }

        console.log("[shopify-oauth-callback] integration upserted", {
          businessId: stateBusinessId,
          integrationId: integration.id,
          shop,
          shopName,
        });

        const redirectUrl = new URL("/integrations/callback/shopify", baseUrl);
        redirectUrl.searchParams.set("status", "success");
        redirectUrl.searchParams.set("businessId", stateBusinessId);
        redirectUrl.searchParams.set("integrationId", integration.id);
        if (stateReturnTo) {
          redirectUrl.searchParams.set("returnTo", stateReturnTo);
        }

        const response = NextResponse.redirect(redirectUrl.toString());
        response.cookies.set("shopify_oauth_state", "", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 0,
          path: "/",
        });
        return response;
      }
    }

    const context = await createShopifyInstallContext({
      shopDomain: shop,
      shopName,
      accessToken,
      scopes: grantedScopes,
      metadata,
      returnTo: stateReturnTo,
      sessionId: session?.sessionId ?? null,
      userId: session?.user.id ?? null,
      preferredBusinessId: stateBusinessId,
    });

    console.log("[shopify-oauth-callback] pending install context created", {
      contextId: context.id,
      shop,
      shopName,
      userId: session?.user.id ?? null,
      preferredBusinessId: stateBusinessId,
    });

    const onboardingUrl = new URL("/shopify/connect", baseUrl);
    onboardingUrl.searchParams.set("context", context.token);
    if (stateReturnTo) {
      onboardingUrl.searchParams.set("returnTo", stateReturnTo);
    }
    const response = NextResponse.redirect(onboardingUrl.toString());
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
      businessId: stateBusinessId,
      shop,
      message,
    });
    return errorRedirect(message, stateBusinessId ?? undefined);
  }
}
