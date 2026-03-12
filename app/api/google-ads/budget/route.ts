import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsBudget } from "@/lib/demo-business";
import { getGoogleAdsBudgetReport } from "@/lib/google-ads/reporting";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const accountId = searchParams.get("accountId");
  const dateRange = (searchParams.get("dateRange") || "30") as
    | "7"
    | "14"
    | "30"
    | "custom";
  const debug = searchParams.get("debug") === "1";

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsBudget());
  }

  const report = await getGoogleAdsBudgetReport({
    businessId,
    accountId,
    dateRange,
    debug,
  });

  return NextResponse.json({
    data: report.rows,
    rows: report.rows,
    recommendations: report.insights,
    summary: report.summary,
    totalSpend: report.summary?.totalSpend ?? 0,
    accountAvgRoas: report.summary?.accountAvgRoas ?? 0,
    meta: report.meta,
  });
}
