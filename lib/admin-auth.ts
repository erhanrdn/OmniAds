import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function isSuperadmin(userId: string): Promise<boolean> {
  const sql = getDb();
  const rows = (await sql`
    SELECT is_superadmin FROM users WHERE id = ${userId} LIMIT 1
  `) as Array<{ is_superadmin: boolean }>;
  return rows[0]?.is_superadmin === true;
}

export async function requireAdmin(
  request: NextRequest
): Promise<{ session: Awaited<ReturnType<typeof getSessionFromRequest>>; error?: never } | { error: NextResponse; session?: never }> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "auth_error", message: "Authentication required." },
        { status: 401 }
      ),
    };
  }
  const admin = await isSuperadmin(session.user.id);
  if (!admin) {
    return {
      error: NextResponse.json(
        { error: "forbidden", message: "Admin access required." },
        { status: 403 }
      ),
    };
  }
  return { session };
}
