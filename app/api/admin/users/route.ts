import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const search   = searchParams.get("search")?.trim() ?? "";
    const provider = searchParams.get("provider") ?? "";
    const status   = searchParams.get("status") ?? "";
    const page     = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit    = 30;
    const offset   = (page - 1) * limit;

    const sql = getDb();

    const condParams: unknown[] = [];
    const conditions: string[] = [];
    if (search) {
      condParams.push(`%${search}%`);
      const n = condParams.length;
      conditions.push(`(u.name ILIKE $${n} OR u.email ILIKE $${n})`);
    }
    if (provider) {
      condParams.push(provider);
      conditions.push(`u.auth_provider = $${condParams.length}`);
    }
    if (status === "suspended") conditions.push(`u.suspended_at IS NOT NULL`);
    if (status === "active")    conditions.push(`u.suspended_at IS NULL`);
    if (status === "admin")     conditions.push(`u.is_superadmin = true`);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitIdx  = condParams.length + 1;
    const offsetIdx = condParams.length + 2;
    const listParams = [...condParams, limit, offset];

    const [usersResult, countResult] = await Promise.all([
      sql.query(`
        SELECT
          u.id, u.name, u.email, u.avatar, u.created_at, u.is_superadmin,
          u.auth_provider, u.suspended_at, u.last_login_at,
          COUNT(DISTINCT m.business_id) AS business_count
        FROM users u
        LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
        ${where}
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `, listParams),
      sql.query(`SELECT COUNT(*) AS total FROM users u ${where}`, condParams),
    ]);

    return NextResponse.json({
      users: usersResult as any[],
      total: Number((countResult as any[])[0]?.total ?? 0),
      page,
      limit,
    });
  } catch (err) {
    console.error("[admin/users GET]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}
