import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoGoogleAdsAdvisor } from "@/lib/demo-business";
import { parseGoogleAdsRequestParams } from "@/lib/google-ads-request-params";
import { getGoogleAdsAdvisorReport } from "@/lib/google-ads/serving";

export async function GET(request: NextRequest) {
  const { businessId, accountId, dateRange, customStart, customEnd, debug } = parseGoogleAdsRequestParams(
    request.nextUrl.searchParams
  );

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsAdvisor());
  }

  const payload = await getGoogleAdsAdvisorReport({
    businessId,
    accountId,
    dateRange,
    customStart,
    customEnd,
    debug,
  });

  return NextResponse.json(payload);
}
