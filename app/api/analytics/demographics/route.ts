import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import {
  getDemoAnalyticsDemographics,
} from "@/lib/demo-business";
import { requireBusinessAccess } from "@/lib/access";
import {
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import {
  GA4_DEMOGRAPHICS_DIMENSIONS,
  type Ga4DemographicsDimension,
  getGa4DetailedDemographicsData,
} from "@/lib/ga4-user-facing-reports";
import { getCachedRouteReport } from "@/lib/route-report-cache";
import { runWithGoogleRequestAuditContext } from "@/lib/google-request-audit";
import { ProviderRequestCooldownError } from "@/lib/provider-request-governance";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ?? "30daysAgo";
  const endDate = request.nextUrl.searchParams.get("endDate") ?? "yesterday";
  const rawDimension =
    request.nextUrl.searchParams.get("dimension") ?? "country";

  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }

  const dimension = GA4_DEMOGRAPHICS_DIMENSIONS.includes(rawDimension as Ga4DemographicsDimension)
    ? (rawDimension as Ga4DemographicsDimension)
    : "country";

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoAnalyticsDemographics(dimension));
  }

  const cached = await getCachedRouteReport<{
    dimension: string;
    rows: Array<Record<string, unknown>>;
    summary: Record<string, unknown> | null;
  }>({
    businessId,
    provider: "ga4",
    reportType: "ga4_detailed_demographics",
    searchParams: request.nextUrl.searchParams,
  });
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const payload = await runWithGoogleRequestAuditContext(
      {
        provider: "ga4",
        businessId,
        requestSource: "live_report",
        requestPath: "/api/analytics/demographics",
        requestType: "ga4_detailed_demographics",
      },
      () =>
        getGa4DetailedDemographicsData({
          businessId,
          startDate,
          endDate,
          dimension,
        }),
    );
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof ProviderRequestCooldownError) {
      return NextResponse.json(
        {
          error: "ga4_live_cooldown",
          message:
            "GA4 live refresh is temporarily suppressed after repeated Google failures. Please retry after cooldown.",
          retryAfterMs: err.retryAfterMs,
        },
        { status: 503 }
      );
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
