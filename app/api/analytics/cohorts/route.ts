import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import {
  getDemoAnalyticsCohorts,
} from "@/lib/demo-business";
import { requireBusinessAccess } from "@/lib/access";
import {
  getGA4TokenAndProperty,
  runGA4Report,
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import {
  getCachedRouteReport,
  setCachedRouteReport,
} from "@/lib/route-report-cache";

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

  // Use weekly acquisition cohorts via the cohortSpec in runReport
  // We approximate with weekly date dimension + new vs returning breakdown
  const [weeklyReport, returningTrend] = await Promise.all([
    // Weekly sessions breakdown: new vs returning by week
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "week" }, { name: "newVsReturning" }],
      metrics: [
        { name: "sessions" },
        { name: "ecommercePurchases" },
        { name: "engagementRate" },
      ],
      orderBys: [{ dimension: { dimensionName: "week" }, desc: false }],
      limit: 200,
    }),
    // Monthly new user trend for cohort approximation
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "month" }],
      metrics: [
        { name: "newUsers" },
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
      ],
      orderBys: [{ dimension: { dimensionName: "month" }, desc: false }],
      limit: 12,
    }),
  ]);

  // Build weekly cohort-like structure
  const weekMap: Record<
    string,
    { week: string; new: { sessions: number; purchases: number }; returning: { sessions: number; purchases: number } }
  > = {};

  for (const row of weeklyReport.rows) {
    const week = row.dimensions[0];
    const type = row.dimensions[1];
    const sessions = parseFloat(row.metrics[0] ?? "0");
    const purchases = parseFloat(row.metrics[1] ?? "0");

    if (!weekMap[week]) {
      weekMap[week] = {
        week,
        new: { sessions: 0, purchases: 0 },
        returning: { sessions: 0, purchases: 0 },
      };
    }
    if (type === "new") {
      weekMap[week].new.sessions += sessions;
      weekMap[week].new.purchases += purchases;
    } else {
      weekMap[week].returning.sessions += sessions;
      weekMap[week].returning.purchases += purchases;
    }
  }

  const cohortWeeks = Object.values(weekMap).map((w) => ({
    week: w.week,
    newSessions: w.new.sessions,
    returningSessions: w.returning.sessions,
    newPurchases: w.new.purchases,
    returningPurchases: w.returning.purchases,
    retentionRate:
      w.new.sessions > 0
        ? w.returning.sessions / (w.new.sessions + w.returning.sessions)
        : 0,
  }));

  // Monthly summary
  const monthlyData = returningTrend.rows.map((row) => {
    const month = row.dimensions[0];
    const newUsers = parseFloat(row.metrics[0] ?? "0");
    const activeUsers = parseFloat(row.metrics[1] ?? "0");
    const sessions = parseFloat(row.metrics[2] ?? "0");
    const purchases = parseFloat(row.metrics[3] ?? "0");
    const revenue = parseFloat(row.metrics[4] ?? "0");
    return {
      month,
      newUsers,
      activeUsers,
      sessions,
      purchases,
      revenue,
      purchaseCvr: sessions > 0 ? purchases / sessions : 0,
    };
  });

  const payload = { cohortWeeks, monthlyData };
  await setCachedRouteReport({
    businessId,
    provider: "ga4",
    reportType: "ga4_detailed_cohorts",
    searchParams: request.nextUrl.searchParams,
    payload,
  });
  return NextResponse.json(payload);
}
