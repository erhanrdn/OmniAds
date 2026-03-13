import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsSearchIntelligence } from "@/lib/demo-business";
import { getGoogleAdsSearchIntelligenceReport } from "@/lib/google-ads/reporting";
import { parseGoogleAdsRequestParams } from "@/lib/google-ads-request-params";

export async function GET(request: NextRequest) {
  const { businessId, accountId, dateRange, customStart, customEnd, debug } =
    parseGoogleAdsRequestParams(request.nextUrl.searchParams);
  const filter = request.nextUrl.searchParams.get("filter") ?? undefined;

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsSearchIntelligence());
  }

  const report = await getGoogleAdsSearchIntelligenceReport({
    businessId,
    accountId,
    dateRange,
    customStart,
    customEnd,
    filter,
    debug,
  });

  return NextResponse.json({
    data: report.rows,
    rows: report.rows,
    count: report.rows.length,
    summary: report.summary,
    insights: report.insights,
    meta: report.meta,
  });
}
