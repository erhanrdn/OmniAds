import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const plan   = searchParams.get("plan") ?? "";
    const status = searchParams.get("status") ?? "";
    const page   = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit  = 30;
    const offset = (page - 1) * limit;

    const sql = getDb();

    const condParams: unknown[] = [];
    const conditions: string[] = [];
    if (plan) {
      condParams.push(plan);
      conditions.push(`ss.plan_id = $${condParams.length}`);
    }
    if (status) {
      condParams.push(status);
      conditions.push(`ss.status = $${condParams.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limitIdx  = condParams.length + 1;
    const offsetIdx = condParams.length + 2;
    const listParams = [...condParams, limit, offset];

    const [subsResult, countResult, planSummary] = await Promise.all([
      sql.query(`
        SELECT
          ss.id, ss.plan_id, ss.status, ss.billing_cycle, ss.created_at, ss.updated_at,
          ss.shop_id, ss.business_id,
          b.name AS business_name,
          u.id AS owner_id, u.name AS owner_name, u.email AS owner_email
        FROM shopify_subscriptions ss
        LEFT JOIN users u ON u.id = ss.user_id
        LEFT JOIN businesses b ON b.id = ss.business_id
        ${where}
        ORDER BY ss.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `, listParams),
      sql.query(`SELECT COUNT(*) AS total FROM shopify_subscriptions ss ${where}`, condParams),
      sql`
        SELECT plan_id, status, COUNT(*) AS count
        FROM shopify_subscriptions
        GROUP BY plan_id, status
        ORDER BY plan_id, status
      `,
    ]);

    return NextResponse.json({
      subscriptions: subsResult as any[],
      total: Number((countResult as any[])[0]?.total ?? 0),
      page,
      limit,
      planSummary,
    });
  } catch (err) {
    console.error("[admin/subscriptions GET]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}
