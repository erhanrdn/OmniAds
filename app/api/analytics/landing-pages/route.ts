import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import {
  getDemoAnalyticsLandingPages,
} from "@/lib/demo-business";
import { requireBusinessAccess } from "@/lib/access";
import {
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import { getGa4DetailedLandingPagesData } from "@/lib/ga4-user-facing-reports";
import { getCachedRouteReport } from "@/lib/route-report-cache";
import { runWithGoogleRequestAuditContext } from "@/lib/google-request-audit";
import { ProviderRequestCooldownError } from "@/lib/provider-request-governance";

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
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoAnalyticsLandingPages());
  }

  const cached = await getCachedRouteReport<{ pages: Array<Record<string, unknown>> }>({
    businessId,
    provider: "ga4",
    reportType: "ga4_detailed_landing_pages",
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
        requestPath: "/api/analytics/landing-pages",
        requestType: "ga4_detailed_landing_pages",
      },
      () =>
        getGa4DetailedLandingPagesData({
          businessId,
          startDate,
          endDate,
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
