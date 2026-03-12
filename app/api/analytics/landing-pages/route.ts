import { NextRequest, NextResponse } from "next/server";
import {
  isDemoBusinessId,
  getDemoAnalyticsLandingPages,
} from "@/lib/demo-business";
import { requireBusinessAccess } from "@/lib/access";
import {
  getGA4TokenAndProperty,
  runGA4Report,
  GA4AuthError,
} from "@/lib/google-analytics-reporting";

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
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(getDemoAnalyticsLandingPages());
  }

  let accessToken: string;
  let propertyId: string;
  try {
    ({ accessToken, propertyId } = await getGA4TokenAndProperty(businessId));
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

  const report = await runGA4Report({
    propertyId,
    accessToken,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "landingPage" }],
    metrics: [
      { name: "sessions" },
      { name: "engagedSessions" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
      { name: "ecommercePurchases" },
      { name: "bounceRate" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 100,
  });

  const pages = report.rows.map((row) => {
    const path = row.dimensions[0] ?? "/";
    const sessions = parseFloat(row.metrics[0] ?? "0");
    const engagedSessions = parseFloat(row.metrics[1] ?? "0");
    const engagementRate = parseFloat(row.metrics[2] ?? "0");
    const avgEngagementTime = parseFloat(row.metrics[3] ?? "0");
    const purchases = parseFloat(row.metrics[4] ?? "0");
    const bounceRate = parseFloat(row.metrics[5] ?? "0");

    return {
      path,
      sessions,
      engagedSessions,
      engagementRate,
      avgEngagementTime,
      purchases,
      purchaseCvr: sessions > 0 ? purchases / sessions : 0,
      bounceRate,
    };
  });

  return NextResponse.json({ pages });
}
