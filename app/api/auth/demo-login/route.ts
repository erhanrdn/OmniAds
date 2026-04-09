import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, createSession } from "@/lib/auth";
import { DEMO_BUSINESS_ID } from "@/lib/demo-business-support";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { getDb } from "@/lib/db";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function errorRedirect(message: string) {
  const url = new URL("/login", baseUrl);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url.toString());
}

async function getDemoUserId(): Promise<string | null> {
  const readiness = await getDbSchemaReadiness({
    tables: ["memberships", "sessions", "users"],
  });
  if (!readiness.ready) {
    return null;
  }
  const sql = getDb();

  // If DEMO_USER_EMAIL is explicitly set, use it.
  const overrideEmail = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  if (overrideEmail) {
    const users = (await sql`
      SELECT id
      FROM users
      WHERE lower(email) = lower(${overrideEmail})
      LIMIT 1
    `) as Array<{ id: string }>;
    return users[0]?.id ?? null;
  }

  // Fallback: find the first admin of the demo business.
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
 * Opens a passwordless session as the demo workspace owner.
 * Clears existing sessions for the demo user first to avoid token collisions.
 */
export async function GET(_request: NextRequest) {
  try {
    const userId = await getDemoUserId();
    if (!userId) {
      return errorRedirect("Demo account not found.");
    }

    const sql = getDb();
    // Clear stale sessions to prevent token_hash unique constraint collisions.
    await sql`DELETE FROM sessions WHERE user_id = ${userId}`;

    const { token, expiresAt } = await createSession({
      userId,
      activeBusinessId: DEMO_BUSINESS_ID,
    });

    const response = NextResponse.redirect(new URL("/", baseUrl).toString());
    attachSessionCookie(response, token, expiresAt);
    return response;
  } catch {
    return errorRedirect("Demo login failed. Please try again.");
  }
}
