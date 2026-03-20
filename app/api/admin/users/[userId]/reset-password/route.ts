import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { userId } = await params;
    const body = await request.json().catch(() => null);
    const newPassword = body?.password?.trim() ?? "";

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "invalid_payload", message: "Şifre en az 8 karakter olmalıdır." },
        { status: 400 }
      );
    }

    const sql = getDb();
    const hash = await hashPassword(newPassword);

    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${userId}`;
    await sql`DELETE FROM sessions WHERE user_id = ${userId}`;

    await logAdminAction({
      adminId: auth.session!.user.id,
      action: "user.reset_password",
      targetType: "user",
      targetId: userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/users/reset-password]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}
