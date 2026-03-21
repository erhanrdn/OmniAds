import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminOperationsHealth } from "@/lib/admin-operations-health";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const data = await getAdminOperationsHealth();
    return NextResponse.json(data.revenueRisk);
  } catch (err) {
    console.error("[admin/revenue-risk GET]", err);
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}
