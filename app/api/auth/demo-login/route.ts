import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, createSession } from "@/lib/auth";
import { getUserByEmail } from "@/lib/account-store";
import { DEMO_BUSINESS_ID } from "@/lib/demo-business";

const DEMO_USER_EMAIL =
  process.env.DEMO_USER_EMAIL?.trim().toLowerCase() ?? "demo-owner@adsecute.local";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function errorRedirect(message: string) {
  const url = new URL("/login", baseUrl);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url.toString());
}

/**
 * GET /api/auth/demo-login
 *
 * Opens a session as the demo user without requiring a password.
 * Only works for the configured DEMO_USER_EMAIL account.
 * Redirects straight to the dashboard with the demo workspace active.
 */
export async function GET(_request: NextRequest) {
  const user = await getUserByEmail(DEMO_USER_EMAIL);
  if (!user) {
    return errorRedirect("Demo account is not set up. Please contact support.");
  }

  const { token, expiresAt } = await createSession({
    userId: user.id,
    activeBusinessId: DEMO_BUSINESS_ID,
  });

  const response = NextResponse.redirect(new URL("/", baseUrl).toString());
  attachSessionCookie(response, token, expiresAt);
  return response;
}
