import { NextRequest, NextResponse } from "next/server";
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

  const dateRanges = [{ startDate, endDate }];

  const [newVsReturning, channelReport] = await Promise.all([
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges,
      dimensions: [{ name: "newVsReturning" }],
      metrics: [
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
      ],
    }),
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges,
      dimensions: [{ name: "sessionSourceMedium" }],
      metrics: [
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
      ],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20,
    }),
  ]);

  // New vs returning breakdown
  const segments: Record<
    string,
    {
      sessions: number;
      engagedSessions: number;
      engagementRate: number;
      purchases: number;
      revenue: number;
      purchaseCvr: number;
    }
  > = {};
  for (const row of newVsReturning.rows) {
    const type = row.dimensions[0];
    const sessions = parseFloat(row.metrics[0] ?? "0");
    const engagedSessions = parseFloat(row.metrics[1] ?? "0");
    const engagementRate = parseFloat(row.metrics[2] ?? "0");
    const purchases = parseFloat(row.metrics[3] ?? "0");
    const revenue = parseFloat(row.metrics[4] ?? "0");
    segments[type] = {
      sessions,
      engagedSessions,
      engagementRate,
      purchases,
      revenue,
      purchaseCvr: sessions > 0 ? purchases / sessions : 0,
    };
  }

  // Channel / source-medium rows
  const channels = channelReport.rows.map((row) => {
    const sourceMedium = row.dimensions[0] ?? "(direct) / (none)";
    const sessions = parseFloat(row.metrics[0] ?? "0");
    const engagedSessions = parseFloat(row.metrics[1] ?? "0");
    const engagementRate = parseFloat(row.metrics[2] ?? "0");
    const purchases = parseFloat(row.metrics[3] ?? "0");
    const revenue = parseFloat(row.metrics[4] ?? "0");
    return {
      sourceMedium,
      sessions,
      engagedSessions,
      engagementRate,
      purchases,
      revenue,
      purchaseCvr: sessions > 0 ? purchases / sessions : 0,
    };
  });

  return NextResponse.json({ segments, channels });
}
