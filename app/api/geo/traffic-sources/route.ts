import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  getGA4TokenAndProperty,
  runGA4Report,
  GA4AuthError,
} from "@/lib/google-analytics-reporting";
import {
  GA4_AI_SOURCE_FILTER,
  classifyAiSource,
  type GeoEngine,
} from "@/lib/geo-intelligence";

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
    dimensions: [{ name: "sessionSource" }],
    metrics: [
      { name: "sessions" },
      { name: "engagedSessions" },
      { name: "engagementRate" },
      { name: "ecommercePurchases" },
      { name: "purchaseRevenue" },
    ],
    dimensionFilter: GA4_AI_SOURCE_FILTER,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 50,
  });

  // Aggregate by engine (multiple source domains may map to same engine)
  const engineMap = new Map<
    GeoEngine | "Other AI",
    {
      engine: string;
      sessions: number;
      engagedSessions: number;
      engagementRate: number;
      purchases: number;
      revenue: number;
      sources: string[];
    }
  >();

  for (const row of report.rows) {
    const source = row.dimensions[0];
    const engine = classifyAiSource(source) ?? "Other AI";
    const sessions = parseFloat(row.metrics[0] ?? "0");
    const engagedSessions = parseFloat(row.metrics[1] ?? "0");
    const engagementRate = parseFloat(row.metrics[2] ?? "0");
    const purchases = parseFloat(row.metrics[3] ?? "0");
    const revenue = parseFloat(row.metrics[4] ?? "0");

    const existing = engineMap.get(engine);
    if (existing) {
      existing.sessions += sessions;
      existing.engagedSessions += engagedSessions;
      existing.engagementRate =
        (existing.engagementRate * existing.sessions + engagementRate * sessions) /
        (existing.sessions + sessions);
      existing.purchases += purchases;
      existing.revenue += revenue;
      existing.sources.push(source);
    } else {
      engineMap.set(engine, {
        engine,
        sessions,
        engagedSessions,
        engagementRate,
        purchases,
        revenue,
        sources: [source],
      });
    }
  }

  const sources = Array.from(engineMap.values())
    .map((s) => ({
      engine: s.engine,
      sessions: s.sessions,
      engagedSessions: s.engagedSessions,
      engagementRate: s.engagementRate,
      purchases: s.purchases,
      revenue: s.revenue,
      purchaseCvr: s.sessions > 0 ? s.purchases / s.sessions : 0,
      sources: s.sources,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return NextResponse.json({ sources });
}
