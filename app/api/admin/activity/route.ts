import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAuditLogs } from "@/lib/admin-logger";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));

    const { rows, total } = await getAuditLogs({ page, limit: 50 });

    return NextResponse.json({ rows, total, page });
  } catch (err) {
    console.error("[admin/activity GET]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}
