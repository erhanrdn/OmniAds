import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, createSession } from "@/lib/auth";
import { findOrCreateGoogleUser } from "@/lib/account-store";
import { listUserBusinesses } from "@/lib/access";
import { logServerAuthEvent } from "@/lib/auth-diagnostics";

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

/**
 * GET /api/oauth/sign-with-google/callback
 *
 * Handles the OAuth redirect from Google after user consents.
 * Exchanges code for tokens, fetches profile, creates/links user, creates session.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000";

  function errorRedirect(msg: string) {
    const url = new URL("/login", baseUrl);
    url.searchParams.set("error", msg);
    return NextResponse.redirect(url.toString());
  }

  // Google returned an error (e.g. user denied consent)
  if (error) {
    logServerAuthEvent("google_login_oauth_error", { error });
    return errorRedirect("Google sign-in was cancelled.");
  }

  if (!code || !state) {
    return errorRedirect("Missing authorization code or state.");
  }

  // ── Validate state (CSRF protection) ──────────────────────
  const cookieState = request.cookies.get("google_login_state")?.value;
  if (!cookieState || cookieState !== state) {
    logServerAuthEvent("google_login_state_mismatch", {});
    return errorRedirect("Invalid OAuth state. Please try again.");
  }

  // Decode state to extract next path
  let nextPath = "";
  try {
    const payload = JSON.parse(Buffer.from(state, "base64url").toString());
    nextPath = payload.next ?? "";
  } catch {
    // non-fatal
  }

  const clientId = process.env.SIGN_WITH_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.SIGN_WITH_GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.SIGN_WITH_GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return errorRedirect("Google Sign-In is not configured.");
  }

  try {
    // ── Exchange code for tokens ──────────────────────────────
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenRes.ok || tokenData.error) {
      logServerAuthEvent("google_login_token_exchange_failed", {
        error: tokenData.error,
        description: tokenData.error_description,
      });
      return errorRedirect("Failed to exchange Google authorization code.");
    }

    if (!tokenData.access_token) {
      return errorRedirect("Google did not return an access token.");
    }

    // ── Fetch user profile from Google ────────────────────────
    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );

    if (!userInfoRes.ok) {
      return errorRedirect("Failed to fetch Google profile.");
    }

    const profile = (await userInfoRes.json()) as GoogleUserInfo;

    if (!profile.email_verified) {
      logServerAuthEvent("google_login_email_not_verified", {
        email: profile.email,
      });
      return errorRedirect("Your Google email is not verified.");
    }

    if (!profile.email || !profile.sub) {
      return errorRedirect("Missing required profile information from Google.");
    }

    // ── Find or create user ───────────────────────────────────
    const user = await findOrCreateGoogleUser({
      googleId: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email.split("@")[0],
      avatar: profile.picture ?? null,
    });

    // ── Create session ────────────────────────────────────────
    const businesses = await listUserBusinesses(user.id);
    const firstActiveBusiness =
      businesses.find((b) => b.membershipStatus === "active")?.id ?? null;

    const { token, expiresAt } = await createSession({
      userId: user.id,
      activeBusinessId: firstActiveBusiness,
    });

    logServerAuthEvent("google_login_succeeded", {
      userId: user.id,
      email: user.email,
      membershipCount: businesses.length,
      activeBusinessId: firstActiveBusiness,
      isNewUser: !user.created_at, // approximate
    });

    // ── Redirect to app ───────────────────────────────────────
    let destination = "/overview";
    if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
      destination = nextPath;
    } else if (businesses.length === 0) {
      destination = "/businesses/new";
    } else if (!firstActiveBusiness) {
      destination = "/select-business";
    }

    const response = NextResponse.redirect(
      new URL(destination, baseUrl).toString(),
    );
    attachSessionCookie(response, token, expiresAt);

    // Clear state cookie
    response.cookies.set("google_login_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error during Google sign-in.";
    logServerAuthEvent("google_login_error", { message });
    return errorRedirect("An error occurred during Google sign-in.");
  }
}
