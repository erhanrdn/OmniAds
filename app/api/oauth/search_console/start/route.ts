import { NextRequest, NextResponse } from "next/server";
import { SEARCH_CONSOLE_CONFIG } from "@/lib/oauth/search-console-config";
import crypto from "crypto";
import { requireBusinessAccess } from "@/lib/access";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");

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

  const statePayload = JSON.stringify({
    businessId,
    nonce: crypto.randomBytes(16).toString("hex"),
  });
  const state = Buffer.from(statePayload).toString("base64url");

  const params = new URLSearchParams({
    client_id: SEARCH_CONSOLE_CONFIG.clientId,
    redirect_uri: SEARCH_CONSOLE_CONFIG.redirectUri,
    scope: SEARCH_CONSOLE_CONFIG.scopes.join(" "),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const authorizationUrl = `${SEARCH_CONSOLE_CONFIG.authUrl}?${params.toString()}`;

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("search_console_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
