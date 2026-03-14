import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsOverview } from "@/lib/demo-business";
import { getGoogleAdsOverviewReport } from "@/lib/google-ads/reporting";
import { parseGoogleAdsRequestParams } from "@/lib/google-ads-request-params";

export async function GET(request: NextRequest) {
  const {
    businessId,
    accountId,
    dateRange,
    customStart,
    customEnd,
    compareMode,
    compareStart,
    compareEnd,
    debug,
  } = parseGoogleAdsRequestParams(request.nextUrl.searchParams);

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsOverview());
  }

  const report = await getGoogleAdsOverviewReport({
    businessId,
    accountId,
    dateRange,
    customStart,
    customEnd,
    compareMode,
    compareStart,
    compareEnd,
    debug,
    source: "google_ads_workspace_overview_route",
  });

  return NextResponse.json({
    kpis: report.kpis,
    kpiDeltas: report.kpiDeltas,
    topCampaigns: report.topCampaigns,
    insights: report.insights,
    summary: report.summary,
    meta: report.meta,
  });
}
