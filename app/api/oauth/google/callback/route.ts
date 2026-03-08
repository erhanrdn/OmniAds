import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";
import { upsertIntegration } from "@/lib/integrations";
import { requireBusinessAccess } from "@/lib/access";

/**
 * GET /api/oauth/google/callback?code=...&state=...
 *
 * Handles the OAuth redirect from Google:
 *   1. Validates the state parameter against the cookie
 *   2. Exchanges the authorization code for access + refresh tokens
 *   3. Fetches the user's Google identity
 *   4. Upserts the integration record in the DB
 *   5. Redirects to the frontend callback page with status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ── User denied or Google returned an error ────────────────
  if (error) {
    const msg = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/google?status=error&error=${msg}`
    );
  }

  // ── Validate required params ───────────────────────────────
  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/google?status=error&error=${encodeURIComponent(
        "Missing code or state parameter."
      )}`
    );
  }

  // ── Validate state against cookie ──────────────────────────
  const cookieState = request.cookies.get("google_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/google?status=error&error=${encodeURIComponent(
        "Invalid OAuth state. Please try again."
      )}`
    );
  }

  // Decode businessId from state
  let businessId: string;
  try {
    const payload = JSON.parse(Buffer.from(state, "base64url").toString());
    businessId = payload.businessId;
    if (!businessId) throw new Error("No businessId in state payload");
  } catch {
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/google?status=error&error=${encodeURIComponent(
        "Malformed OAuth state."
      )}`
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) {
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/google?status=error&businessId=${businessId}&error=${encodeURIComponent(
        "You do not have permission to connect integrations for this business."
      )}`
    );
  }

  try {
    // ── Exchange code for tokens ───────────────────────────────
    const tokenRes = await fetch(GOOGLE_CONFIG.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        client_secret: GOOGLE_CONFIG.clientSecret,
        redirect_uri: GOOGLE_CONFIG.redirectUri,
        grant_type: "authorization_code",
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(
        tokenData.error_description || tokenData.error || "Failed to exchange authorization code."
      );
    }

    const accessToken: string = tokenData.access_token;
    const refreshToken: string | undefined = tokenData.refresh_token;
    const expiresIn: number | undefined = tokenData.expires_in;

    if (!refreshToken) {
      console.warn(
        "[google-oauth-callback] No refresh_token returned. The user may have already granted access. " +
        "Consider revoking and reconnecting to obtain a new refresh token."
      );
    }

    // ── Fetch Google user identity ──────────────────────────────
    const userinfoRes = await fetch(GOOGLE_CONFIG.userinfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userinfoData = await userinfoRes.json();

    if (userinfoData.error) {
      throw new Error(
        userinfoData.error.message || "Failed to fetch Google user profile."
      );
    }

    const providerAccountId: string = userinfoData.id ?? "";
    const providerAccountName: string =
      userinfoData.name ?? userinfoData.email ?? "Google User";

    // ── Save to DB ──────────────────────────────────────────────
    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;

    const integration = await upsertIntegration({
      businessId,
      provider: "google",
      status: "connected",
      providerAccountId,
      providerAccountName,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      scopes: GOOGLE_CONFIG.scopes.join(" "),
    });

    console.log("[google-oauth-callback] integration upserted", {
      businessId,
      integrationId: integration.id,
      providerAccountId,
      providerAccountName,
      hasRefreshToken: Boolean(refreshToken),
    });

    // ── Redirect to frontend callback with success ──────────────
    const redirectUrl = new URL("/integrations/callback/google", baseUrl);
    redirectUrl.searchParams.set("status", "success");
    redirectUrl.searchParams.set("businessId", businessId);
    redirectUrl.searchParams.set("integrationId", integration.id);

    const response = NextResponse.redirect(redirectUrl.toString());
    // Clear the state cookie
    response.cookies.set("google_oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error during Google OAuth.";
    console.error("[google-oauth-callback] error", { businessId, message });

    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/google?status=error&businessId=${businessId}&error=${encodeURIComponent(
        message
      )}`
    );
  }
}
