import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import {
  getDemoAnalyticsOverview,
} from "@/lib/demo-business";
import { requireBusinessAccess } from "@/lib/access";
import {
  getGA4TokenAndProperty,
  runGA4Report,
  GA4AuthError,
  generateInsights,
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
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoAnalyticsOverview());
  }

  let accessToken: string;
  let propertyId: string;
  let propertyName: string;
  try {
    ({ accessToken, propertyId, propertyName } =
      await getGA4TokenAndProperty(businessId));
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

  const dateRanges = [{ startDate, endDate }];

  const [overviewReport, newVsReturningReport] = await Promise.all([
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges,
      metrics: [
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
        { name: "averageSessionDuration" },
      ],
    }),
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges,
      dimensions: [{ name: "newVsReturning" }],
      metrics: [
        { name: "sessions" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
        { name: "engagementRate" },
      ],
      limit: 5,
    }),
  ]);

  // Parse overview totals
  const totalsRow = overviewReport.totals?.[0] ?? overviewReport.rows[0];
  const sessions = parseFloat(totalsRow?.metrics[0] ?? "0");
  const engagedSessions = parseFloat(totalsRow?.metrics[1] ?? "0");
  const engagementRate = parseFloat(totalsRow?.metrics[2] ?? "0");
  const purchases = parseFloat(totalsRow?.metrics[3] ?? "0");
  const revenue = parseFloat(totalsRow?.metrics[4] ?? "0");
  const avgSessionDuration = parseFloat(totalsRow?.metrics[5] ?? "0");
  const purchaseCvr = sessions > 0 ? purchases / sessions : 0;

  // Parse new vs returning
  let newSessions = 0;
  let newPurchases = 0;
  let returningSessions = 0;
  let returningPurchases = 0;
  for (const row of newVsReturningReport.rows) {
    const type = row.dimensions[0];
    const s = parseFloat(row.metrics[0] ?? "0");
    const p = parseFloat(row.metrics[1] ?? "0");
    if (type === "new") {
      newSessions = s;
      newPurchases = p;
    } else if (type === "returning") {
      returningSessions = s;
      returningPurchases = p;
    }
  }

  // Generate insights from overview data only
  const insights = generateInsights({
    overview: { sessions, engagedSessions, purchases, revenue },
    audience: { newSessions, newPurchases, returningSessions, returningPurchases },
  });

  return NextResponse.json({
    propertyName,
    kpis: {
      sessions,
      engagedSessions,
      engagementRate,
      purchases,
      purchaseCvr,
      revenue,
      avgSessionDuration,
    },
    newVsReturning: {
      new: {
        sessions: newSessions,
        purchases: newPurchases,
        purchaseCvr: newSessions > 0 ? newPurchases / newSessions : 0,
      },
      returning: {
        sessions: returningSessions,
        purchases: returningPurchases,
        purchaseCvr:
          returningSessions > 0 ? returningPurchases / returningSessions : 0,
      },
    },
    insights,
  });
}
