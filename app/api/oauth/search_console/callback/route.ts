import { NextRequest, NextResponse } from "next/server";
import { SEARCH_CONSOLE_CONFIG } from "@/lib/oauth/search-console-config";
import { upsertIntegration } from "@/lib/integrations";
import { requireBusinessAccess } from "@/lib/access";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (error) {
    const msg = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/search_console?status=error&error=${msg}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/search_console?status=error&error=${encodeURIComponent(
        "Missing code or state parameter.",
      )}`,
    );
  }

  const cookieState = request.cookies.get("search_console_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/search_console?status=error&error=${encodeURIComponent(
        "Invalid OAuth state. Please try again.",
      )}`,
    );
  }

  let businessId: string;
  try {
    const payload = JSON.parse(Buffer.from(state, "base64url").toString());
    businessId = payload.businessId;
    if (!businessId) throw new Error("No businessId in state payload");
  } catch {
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/search_console?status=error&error=${encodeURIComponent(
        "Malformed OAuth state.",
      )}`,
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) {
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/search_console?status=error&businessId=${businessId}&error=${encodeURIComponent(
        "You do not have permission to connect integrations for this business.",
      )}`,
    );
  }

  try {
    const tokenRes = await fetch(SEARCH_CONSOLE_CONFIG.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: SEARCH_CONSOLE_CONFIG.clientId,
        client_secret: SEARCH_CONSOLE_CONFIG.clientSecret,
        redirect_uri: SEARCH_CONSOLE_CONFIG.redirectUri,
        grant_type: "authorization_code",
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(
        tokenData.error_description ||
          tokenData.error ||
          "Failed to exchange authorization code.",
      );
    }

    const accessToken: string = tokenData.access_token;
    const refreshToken: string | undefined = tokenData.refresh_token;
    const expiresIn: number | undefined = tokenData.expires_in;

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : undefined;

    const integration = await upsertIntegration({
      businessId,
      provider: "search_console",
      status: "connected",
      providerAccountName: "Not selected",
      accessToken,
      refreshToken,
      tokenExpiresAt,
      scopes: SEARCH_CONSOLE_CONFIG.scopes.join(" "),
    });

    const redirectUrl = new URL("/integrations/callback/search_console", baseUrl);
    redirectUrl.searchParams.set("status", "success");
    redirectUrl.searchParams.set("businessId", businessId);
    redirectUrl.searchParams.set("integrationId", integration.id);

    const response = NextResponse.redirect(redirectUrl.toString());
    response.cookies.set("search_console_oauth_state", "", {
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
        : "Unknown error during Search Console OAuth.";

    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/search_console?status=error&businessId=${businessId}&error=${encodeURIComponent(
        message,
      )}`,
    );
  }
}
