import { NextRequest, NextResponse } from "next/server";
import { SEARCH_CONSOLE_CONFIG } from "@/lib/oauth/search-console-config";
import { upsertIntegration } from "@/lib/integrations";
import { requireBusinessAccess } from "@/lib/access";
import { resolveRequestLanguage } from "@/lib/request-language";

export async function GET(request: NextRequest) {
  const language = await resolveRequestLanguage(request);
  const tr = (english: string, turkish: string) => (language === "tr" ? turkish : english);
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
        tr("Missing code or state parameter.", "Code veya state parametresi eksik."),
      )}`,
    );
  }

  const cookieState = request.cookies.get("search_console_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/search_console?status=error&error=${encodeURIComponent(
        tr("Invalid OAuth state. Please try again.", "OAuth state geçersiz. Lütfen tekrar deneyin."),
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
        tr("Malformed OAuth state.", "OAuth state bozuk."),
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
        tr("You do not have permission to connect integrations for this business.", "Bu business için integration bağlama yetkiniz yok."),
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
          tr("Failed to exchange authorization code.", "Authorization code değişimi başarısız oldu."),
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
      providerAccountName: language === "tr" ? "Secilmedi" : "Not selected",
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
        : tr("Unknown error during Search Console OAuth.", "Search Console OAuth sirasinda bilinmeyen bir hata olüstu.");

    return NextResponse.redirect(
      `${baseUrl}/integrations/callback/search_console?status=error&businessId=${businessId}&error=${encodeURIComponent(
        message,
      )}`,
    );
  }
}
