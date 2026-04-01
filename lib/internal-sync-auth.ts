import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import type { SessionContext } from "@/lib/auth";

type InternalSyncAccess =
  | { kind: "internal"; error?: never; session?: never }
  | { kind: "admin"; session: SessionContext; error?: never }
  | { kind?: never; error: NextResponse; session?: never };

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

export async function requireInternalOrAdminSyncAccess(
  request: NextRequest
): Promise<InternalSyncAccess> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const bearerToken = getBearerToken(request);
  if (cronSecret && bearerToken === cronSecret) {
    return { kind: "internal" };
  }

  const admin = await requireAdmin(request);
  if (admin.error) return { error: admin.error };
  return { kind: "admin", session: admin.session! };
}

export async function businessExists(businessId: string): Promise<boolean> {
  const sql = getDb();
  const rows = (await sql`
    SELECT 1
    FROM businesses
    WHERE id = ${businessId}
    LIMIT 1
  `) as Array<{ "?column?": number }>;
  return rows.length > 0;
}
