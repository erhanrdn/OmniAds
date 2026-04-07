import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsOverview } from "@/lib/demo-business";
import { getGoogleAdsOverviewReport } from "@/lib/google-ads/serving";
import { parseGoogleAdsRequestParams } from "@/lib/google-ads-request-params";
import { logPerfEvent } from "@/lib/perf";

export async function GET(request: NextRequest) {
  const requestStartedAt = Date.now();
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

  const payload = {
    kpis: report.kpis,
    kpiDeltas: report.kpiDeltas,
    topCampaigns: report.topCampaigns,
    insights: report.insights,
    summary: report.summary,
    meta: report.meta,
  };
  logPerfEvent("google_ads_overview_route", {
    businessId,
    accountId,
    dateRange,
    customStart,
    customEnd,
    compareMode,
    topCampaignCount: payload.topCampaigns.length,
    durationMs: Date.now() - requestStartedAt,
  });
  return NextResponse.json(payload);
}
