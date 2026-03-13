import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsAssets } from "@/lib/demo-business";
import { getGoogleAdsAssetsReport } from "@/lib/google-ads/reporting";
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
    return NextResponse.json(getDemoGoogleAdsAssets());
  }

  const report = await getGoogleAdsAssetsReport({
    businessId,
    accountId,
    dateRange,
    customStart,
    customEnd,
    debug,
  });

  return NextResponse.json({
    data: report.rows,
    rows: report.rows,
    count: report.rows.length,
    summary: report.summary,
    meta: report.meta,
  });
}
