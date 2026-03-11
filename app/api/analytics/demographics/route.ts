import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  getGA4TokenAndProperty,
  runGA4Report,
  GA4AuthError,
} from "@/lib/google-analytics-reporting";

const ALLOWED_DIMENSIONS = [
  "country",
  "region",
  "city",
  "language",
  "userAgeBracket",
  "userGender",
  "brandingInterest",
] as const;
type DemoDimension = (typeof ALLOWED_DIMENSIONS)[number];

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

  const dimension = ALLOWED_DIMENSIONS.includes(rawDimension as DemoDimension)
    ? (rawDimension as DemoDimension)
    : "country";

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

  const report = await runGA4Report({
    propertyId,
    accessToken,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: dimension }],
    metrics: [
      { name: "sessions" },
      { name: "engagedSessions" },
      { name: "engagementRate" },
      { name: "ecommercePurchases" },
      { name: "purchaseRevenue" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 50,
  });

  const rows = report.rows.map((row) => {
    const value = row.dimensions[0] ?? "(unknown)";
    const sessions = parseFloat(row.metrics[0] ?? "0");
    const engagedSessions = parseFloat(row.metrics[1] ?? "0");
    const engagementRate = parseFloat(row.metrics[2] ?? "0");
    const purchases = parseFloat(row.metrics[3] ?? "0");
    const revenue = parseFloat(row.metrics[4] ?? "0");
    return {
      value,
      sessions,
      engagedSessions,
      engagementRate,
      purchases,
      revenue,
      purchaseCvr: sessions > 0 ? purchases / sessions : 0,
    };
  });

  // Summary: top converting value
  const withPurchases = rows.filter((r) => r.purchases > 0);
  const topByPurchaseCvr = withPurchases.sort(
    (a, b) => b.purchaseCvr - a.purchaseCvr
  )[0];
  const avgPurchaseCvr =
    rows.length > 0
      ? rows.reduce((sum, r) => sum + r.purchaseCvr, 0) / rows.length
      : 0;

  return NextResponse.json({
    dimension,
    rows,
    summary: topByPurchaseCvr
      ? {
          topValue: topByPurchaseCvr.value,
          topValuePurchaseCvr: topByPurchaseCvr.purchaseCvr,
          avgPurchaseCvr,
        }
      : null,
  });
}
