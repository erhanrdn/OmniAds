import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * GET /api/oauth/sign-with-google/start
 *
 * Redirects the user to Google's OAuth consent screen for authentication.
 * Uses the SIGN_WITH_GOOGLE_* environment variables (separate from Google Ads / GA4 OAuth).
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.SIGN_WITH_GOOGLE_CLIENT_ID;
  const redirectUri = process.env.SIGN_WITH_GOOGLE_REDIRECT_URI;
  const scopes = process.env.SIGN_WITH_GOOGLE_SCOPES ?? "openid email profile";

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Google Sign-In is not configured." },
      { status: 500 },
    );
  }

  // Preserve ?next= param for post-login redirect
  const nextPath = request.nextUrl.searchParams.get("next") ?? "";

  const statePayload = JSON.stringify({
    nonce: crypto.randomBytes(16).toString("hex"),
    next: nextPath,
  });
  const state = Buffer.from(statePayload).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.replace(/"/g, ""),
    state,
    access_type: "online",
    prompt: "consent",
  });

  const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  // Store state in httpOnly cookie for CSRF validation
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("google_login_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
