import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { userId } = await params;
    const sql = getDb();

    const result = (await sql`
      DELETE FROM sessions WHERE user_id = ${userId}
      RETURNING id
    `) as any[];

    await logAdminAction({
      adminId: auth.session!.user.id,
      action: "user.terminate_sessions",
      targetType: "user",
      targetId: userId,
      meta: { sessionsTerminated: result.length },
    });

    return NextResponse.json({ ok: true, terminated: result.length });
  } catch (err) {
    console.error("[admin/users/terminate-sessions]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}
