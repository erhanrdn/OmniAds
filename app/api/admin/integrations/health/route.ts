import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminIntegrationHealth } from "@/lib/admin-integration-health";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const integrationHealth = await getAdminIntegrationHealth();
    return NextResponse.json(integrationHealth);
  } catch (err) {
    console.error("[admin/integrations/health GET]", err);
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}
