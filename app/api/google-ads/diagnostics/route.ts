import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsDiagnostics } from "@/lib/demo-business";
import { getGoogleAdsDiagnosticsReport } from "@/lib/google-ads/serving";
import { parseGoogleAdsRequestParams } from "@/lib/google-ads-request-params";

export async function GET(request: NextRequest) {
  const { businessId, accountId, dateRange, customStart, customEnd, debug } =
    parseGoogleAdsRequestParams(request.nextUrl.searchParams);

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsDiagnostics());
  }

  const report = await getGoogleAdsDiagnosticsReport({
    businessId,
    accountId,
    dateRange,
    customStart,
    customEnd,
    debug,
    source: "google_ads_diagnostics_route",
  });

  const payload = {
    data: report.rows,
    rows: report.rows,
    count: report.rows.length,
    summary: report.summary,
    insights: report.insights,
    meta: report.meta,
  };
  return NextResponse.json(payload);
}
