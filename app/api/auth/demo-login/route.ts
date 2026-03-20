import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, createSession } from "@/lib/auth";
import { getUserByEmail } from "@/lib/account-store";
import { DEMO_BUSINESS_ID } from "@/lib/demo-business-support";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

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
 * Requires DEMO_USER_EMAIL env var to be set.
 */
export async function GET(_request: NextRequest) {
  const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  if (!email) {
    return errorRedirect("Demo is not configured.");
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return errorRedirect("Demo account not found.");
    }

    // Clear existing sessions for the demo user to prevent token_hash collisions
    // caused by concurrent requests or stale sessions accumulating over time.
    await runMigrations({ reason: "demo_login" });
    const sql = getDb();
    await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;

    const { token, expiresAt } = await createSession({
      userId: user.id,
      activeBusinessId: DEMO_BUSINESS_ID,
    });

    const response = NextResponse.redirect(new URL("/", baseUrl).toString());
    attachSessionCookie(response, token, expiresAt);
    return response;
  } catch {
    return errorRedirect("Demo login failed. Please try again.");
  }
}
