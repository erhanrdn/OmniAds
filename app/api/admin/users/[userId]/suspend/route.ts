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

    if (auth.session!.user.id === userId) {
      return NextResponse.json(
        { error: "forbidden", message: "Kendi hesabınızı askıya alamazsınız." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const unsuspend = body?.unsuspend === true;
    const sql = getDb();

    if (unsuspend) {
      await sql`UPDATE users SET suspended_at = NULL WHERE id = ${userId}`;
      await logAdminAction({
        adminId: auth.session!.user.id,
        action: "user.unsuspend",
        targetType: "user",
        targetId: userId,
      });
    } else {
      await sql`UPDATE users SET suspended_at = now() WHERE id = ${userId}`;
      await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
      await logAdminAction({
        adminId: auth.session!.user.id,
        action: "user.suspend",
        targetType: "user",
        targetId: userId,
      });
    }

    return NextResponse.json({ ok: true, suspended: !unsuspend });
  } catch (err) {
    console.error("[admin/users/suspend]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}
