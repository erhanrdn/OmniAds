import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";
import crypto from "crypto";
import { requireBusinessAccess } from "@/lib/access";

/**
 * GET /api/oauth/google/start?businessId=...
 *
 * Redirects the user to Google's OAuth consent screen.
 * Generates a cryptographic state parameter to prevent CSRF.
 * Requests offline access so we receive a refresh_token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const providerParam = searchParams.get("provider");
  const oauthProvider =
    providerParam === "search_console" ? "search_console" : "google";

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  // Generate a random state that encodes the businessId
  const statePayload = JSON.stringify({
    businessId,
    provider: oauthProvider,
    nonce: crypto.randomBytes(16).toString("hex"),
  });
  const state = Buffer.from(statePayload).toString("base64url");

  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    redirect_uri: GOOGLE_CONFIG.redirectUri,
    scope: GOOGLE_CONFIG.scopes.join(" "),
    response_type: "code",
    access_type: "offline",
    prompt: "consent", // Force consent to always get refresh_token
    state,
  });

  const authorizationUrl = `${GOOGLE_CONFIG.authUrl}?${params.toString()}`;

  // Set state in a short-lived httpOnly cookie for validation in callback
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
