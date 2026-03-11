import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  getGA4TokenAndProperty,
  runGA4Report,
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import {
  GA4_AI_SOURCE_FILTER,
} from "@/lib/geo-intelligence";
import {
  scorePageGeo,
  assignPriority,
  assignEffort,
  assignConfidence,
} from "@/lib/geo-scoring";

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

  const [aiPagesReport, totalPagesReport] = await Promise.all([
    // AI-origin traffic by landing page
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "landingPage" }],
      metrics: [
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
      ],
      dimensionFilter: GA4_AI_SOURCE_FILTER,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 100,
    }),
    // All traffic by landing page (for share calculation)
    runGA4Report({
      propertyId,
      accessToken,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "ecommercePurchases" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 100,
    }),
  ]);

  // Build total sessions map for share calculation
  const totalSessionsMap = new Map<string, number>();
  for (const row of totalPagesReport.rows) {
    totalSessionsMap.set(
      row.dimensions[0],
      parseFloat(row.metrics[0] ?? "0")
    );
  }

  // Site-average CVR for delta calculations
  const totalSiteSessions = totalPagesReport.rows.reduce(
    (s, r) => s + parseFloat(r.metrics[0] ?? "0"),
    0
  );
  const totalSitePurchases = totalPagesReport.rows.reduce(
    (s, r) => s + parseFloat(r.metrics[1] ?? "0"),
    0
  );
  const siteAvgCvr = totalSiteSessions > 0 ? totalSitePurchases / totalSiteSessions : 0;

  const pages = aiPagesReport.rows.map((row) => {
    const path = row.dimensions[0] ?? "/";
    const aiSessions = parseFloat(row.metrics[0] ?? "0");
    const engagedSessions = parseFloat(row.metrics[1] ?? "0");
    const engagementRate = parseFloat(row.metrics[2] ?? "0");
    const purchases = parseFloat(row.metrics[3] ?? "0");
    const revenue = parseFloat(row.metrics[4] ?? "0");
    const totalSessions = totalSessionsMap.get(path) ?? 0;
    const purchaseCvr = aiSessions > 0 ? purchases / aiSessions : 0;

    // v2 scoring
    const scored = scorePageGeo({
      aiSessions,
      totalSessions,
      aiEngagementRate: engagementRate,
      aiPurchaseCvr: purchaseCvr,
    });
    const geoScore = scored.total;

    const priority = assignPriority(geoScore, aiSessions, purchaseCvr - siteAvgCvr);
    const effort = assignEffort(
      purchaseCvr < siteAvgCvr * 0.5 ? "add_faq" : "expand_guide"
    );
    const confidence = assignConfidence(true, false, Math.round(aiSessions));

    // Strongest signal for display
    let strongestSignal: string;
    if (purchaseCvr >= 0.03) strongestSignal = "Strong AI CVR";
    else if (engagementRate >= 0.7) strongestSignal = "High engagement";
    else if (aiSessions >= 50) strongestSignal = "High AI traffic";
    else strongestSignal = "Emerging AI page";

    // Recommendation
    let recommendation: string | null = null;
    if (engagementRate < 0.4 && aiSessions > 20)
      recommendation = "Improve content relevance";
    else if (purchaseCvr < 0.01 && aiSessions > 30)
      recommendation = "Add commercial intent CTAs";
    else if (purchaseCvr >= 0.03)
      recommendation = "Scale AI content strategy";
    else if (engagementRate >= 0.7)
      recommendation = "Expand topic depth";

    return {
      path,
      aiSessions,
      engagedSessions,
      engagementRate,
      purchases,
      revenue,
      purchaseCvr,
      totalSessions,
      geoScore,
      priority,
      effort,
      confidence,
      strongestSignal,
      recommendation,
    };
  });

  // Sort by geoScore desc
  pages.sort((a, b) => b.geoScore - a.geoScore);

  return NextResponse.json({ pages });
}
