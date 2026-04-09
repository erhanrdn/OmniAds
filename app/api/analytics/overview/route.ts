import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import {
  GA4AuthError,
  getAnalyticsOverviewData,
} from "@/lib/analytics-overview";
import { getCachedRouteReport } from "@/lib/route-report-cache";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ?? "30daysAgo";
  const endDate = request.nextUrl.searchParams.get("endDate") ?? "yesterday";

  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  const cached = await getCachedRouteReport<Awaited<ReturnType<typeof getAnalyticsOverviewData>>>({
    businessId,
    provider: "ga4",
    reportType: "ga4_analytics_overview",
    searchParams: request.nextUrl.searchParams,
  });
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const payload = await getAnalyticsOverviewData({
      businessId,
      startDate,
      endDate,
    });
    return NextResponse.json(payload);
  } catch (err) {
    if (await isDemoBusiness(businessId)) {
      throw err;
    }
    if (err instanceof GA4AuthError) {
      return NextResponse.json(
        {
          error: err.code,
          message: err.message,
          action: err.action,
          reconnectRequired: err.action === "reconnect_ga4",
        },
        { status: err.status }
      );
    }
    throw err;
  }
}
