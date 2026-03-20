import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, createSession } from "@/lib/auth";
import { DEMO_BUSINESS_ID } from "@/lib/demo-business";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function errorRedirect(message: string) {
  const url = new URL("/login", baseUrl);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url.toString());
}

async function getDemoUserId(): Promise<string | null> {
  await runMigrations();
  const sql = getDb();

  // If DEMO_USER_EMAIL is set, look up by email first
  const overrideEmail = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  if (overrideEmail) {
    const rows = (await sql`
      SELECT id FROM users WHERE email = ${overrideEmail} LIMIT 1
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  // Otherwise find the admin/owner of the demo business
  const rows = (await sql`
    SELECT m.user_id
    FROM memberships m
    WHERE m.business_id = ${DEMO_BUSINESS_ID}
      AND m.status = 'active'
      AND m.role = 'admin'
    ORDER BY m.joined_at ASC
    LIMIT 1
  `) as Array<{ user_id: string }>;
  return rows[0]?.user_id ?? null;
}

/**
 * GET /api/auth/demo-login
 *
 * Opens a session as the demo workspace owner without requiring a password.
 * Redirects straight to the dashboard with the demo workspace active.
 */
export async function GET(_request: NextRequest) {
  const userId = await getDemoUserId();
  if (!userId) {
    return errorRedirect("Demo account not found. Please contact support.");
  }

  const { token, expiresAt } = await createSession({
    userId,
    activeBusinessId: DEMO_BUSINESS_ID,
  });

  const response = NextResponse.redirect(new URL("/", baseUrl).toString());
  attachSessionCookie(response, token, expiresAt);
  return response;
}
