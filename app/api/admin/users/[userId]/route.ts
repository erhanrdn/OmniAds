import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-logger";
import { PLAN_ORDER } from "@/lib/pricing/plans";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { userId } = await params;
    const sql = getDb();

    const [users, subscription, businesses, redemptions, sessions] = await Promise.all([
      sql`
        SELECT id, name, email, avatar, created_at, is_superadmin, auth_provider,
               suspended_at, last_login_at, plan_override
        FROM users WHERE id = ${userId} LIMIT 1
      `,
      sql`
        SELECT plan_id, status, billing_cycle, shop_id
        FROM shopify_subscriptions
        WHERE user_id = ${userId} AND status = 'active'
        ORDER BY updated_at DESC LIMIT 1
      `,
      sql`
        SELECT b.id, b.name, b.created_at, b.plan_override, m.role,
               ss.plan_id, ss.status AS subscription_status
        FROM memberships m
        JOIN businesses b ON b.id = m.business_id
        LEFT JOIN shopify_subscriptions ss ON ss.business_id = b.id AND ss.status = 'active'
        WHERE m.user_id = ${userId} AND m.status = 'active'
        ORDER BY b.created_at DESC
      `,
      sql`
        SELECT dr.id, dc.code, dr.plan_id, dr.amount_off, dr.redeemed_at
        FROM discount_redemptions dr
        JOIN discount_codes dc ON dc.id = dr.code_id
        WHERE dr.user_id = ${userId}
        ORDER BY dr.redeemed_at DESC
      `,
      sql`
        SELECT id, created_at, expires_at,
               CASE WHEN expires_at < now() THEN 'expired' ELSE 'active' END AS session_status
        FROM sessions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 10
      `,
    ]);

    const user = (users as any[])[0];
    if (!user) {
      return NextResponse.json({ error: "not_found", message: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({
      user,
      subscription: (subscription as any[])[0] ?? null,
      businesses,
      redemptions,
      sessions,
    });
  } catch (err) {
    console.error("[admin/users/[userId] GET]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { userId } = await params;
    const body = await request.json().catch(() => null);
    const sql = getDb();

    if (typeof body?.is_superadmin === "boolean") {
      await sql`UPDATE users SET is_superadmin = ${body.is_superadmin} WHERE id = ${userId}`;
      await logAdminAction({
        adminId: auth.session!.user.id,
        action: body.is_superadmin ? "user.set_admin" : "user.revoke_admin",
        targetType: "user",
        targetId: userId,
      });
    }

    if ("plan_override" in (body ?? {})) {
      const planOverride = body.plan_override;
      if (planOverride !== null && !PLAN_ORDER.includes(planOverride)) {
        return NextResponse.json({ error: "invalid_payload", message: "Geçersiz plan." }, { status: 400 });
      }
      await sql`UPDATE users SET plan_override = ${planOverride} WHERE id = ${userId}`;
      await logAdminAction({
        adminId: auth.session!.user.id,
        action: "business.plan_override",
        targetType: "user",
        targetId: userId,
        meta: { planOverride },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/users/[userId] PATCH]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { userId } = await params;

    if (auth.session!.user.id === userId) {
      return NextResponse.json(
        { error: "forbidden", message: "Kendi hesabınızı silemezsiniz." },
        { status: 403 }
      );
    }

    const sql = getDb();
    const rows = (await sql`SELECT name, email FROM users WHERE id = ${userId} LIMIT 1`) as any[];
    await sql`DELETE FROM users WHERE id = ${userId}`;

    await logAdminAction({
      adminId: auth.session!.user.id,
      action: "user.delete",
      targetType: "user",
      targetId: userId,
      meta: { name: rows[0]?.name, email: rows[0]?.email },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/users/[userId] DELETE]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}
