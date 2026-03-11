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
        { error: err.code, message: err.message },
        { status: err.code === "integration_not_found" ? 404 : 401 }
      );
    }
    throw err;
  }

  const report = await runGA4Report({
    propertyId,
    accessToken,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "itemName" }],
    metrics: [
      { name: "itemViews" },
      { name: "addToCarts" },
      { name: "checkouts" },
      { name: "ecommercePurchases" },
      { name: "itemRevenue" },
    ],
    orderBys: [{ metric: { metricName: "itemViews" }, desc: true }],
    limit: 100,
  });

  const products = report.rows.map((row) => {
    const name = row.dimensions[0] ?? "(unknown)";
    const views = parseFloat(row.metrics[0] ?? "0");
    const addToCarts = parseFloat(row.metrics[1] ?? "0");
    const checkouts = parseFloat(row.metrics[2] ?? "0");
    const purchases = parseFloat(row.metrics[3] ?? "0");
    const revenue = parseFloat(row.metrics[4] ?? "0");

    return {
      name,
      views,
      addToCarts,
      checkouts,
      purchases,
      revenue,
      atcRate: views > 0 ? addToCarts / views : 0,
      checkoutRate: addToCarts > 0 ? checkouts / addToCarts : 0,
      purchaseRate: checkouts > 0 ? purchases / checkouts : 0,
    };
  });

  return NextResponse.json({ products });
}
