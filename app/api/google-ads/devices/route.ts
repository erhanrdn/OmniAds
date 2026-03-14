import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsDevices } from "@/lib/demo-business";
import { getGoogleAdsDevicesReport } from "@/lib/google-ads/reporting";
import { parseGoogleAdsRequestParams } from "@/lib/google-ads-request-params";
import { getCachedRouteReport, setCachedRouteReport } from "@/lib/route-report-cache";

export async function GET(request: NextRequest) {
  const { businessId, accountId, dateRange, customStart, customEnd, debug } =
    parseGoogleAdsRequestParams(request.nextUrl.searchParams);

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsDevices());
  }

  const cached = await getCachedRouteReport<Record<string, unknown>>({
    businessId,
    provider: "google_ads",
    reportType: "google_ads_devices",
    searchParams: request.nextUrl.searchParams,
  });
  if (cached) return NextResponse.json(cached);

  const report = await getGoogleAdsDevicesReport({
    businessId,
    accountId,
    dateRange,
    customStart,
    customEnd,
    debug,
  });

  const payload = {
    data: report.rows,
    rows: report.rows,
    insights: report.insights,
    summary: report.summary,
    meta: report.meta,
  };
  await setCachedRouteReport({
    businessId,
    provider: "google_ads",
    reportType: "google_ads_devices",
    searchParams: request.nextUrl.searchParams,
    payload,
  });
  return NextResponse.json(payload);
}
