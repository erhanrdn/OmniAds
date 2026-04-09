import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import {
  getDemoAnalyticsCohorts,
} from "@/lib/demo-business";
import { requireBusinessAccess } from "@/lib/access";
import {
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import { getGa4DetailedCohortsData } from "@/lib/ga4-user-facing-reports";
import { getCachedRouteReport } from "@/lib/route-report-cache";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ?? "90daysAgo";
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
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoAnalyticsCohorts());
  }

  const cached = await getCachedRouteReport<{
    cohortWeeks: Array<Record<string, unknown>>;
    monthlyData: Array<Record<string, unknown>>;
  }>({
    businessId,
    provider: "ga4",
    reportType: "ga4_detailed_cohorts",
    searchParams: request.nextUrl.searchParams,
  });
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const payload = await getGa4DetailedCohortsData({
      businessId,
      startDate,
      endDate,
    });
    return NextResponse.json(payload);
  } catch (err) {
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
