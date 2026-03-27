import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsDevices } from "@/lib/demo-business";
import { getGoogleAdsDevicesReport } from "@/lib/google-ads/serving";
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
    return NextResponse.json(getDemoGoogleAdsDevices());
  }

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
  return NextResponse.json(payload);
}
