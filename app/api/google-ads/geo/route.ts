import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsGeo } from "@/lib/demo-business";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
  calculateCpa,
  calculateCtr,
} from "@/lib/google-ads-gaql";

// Google Ads criterion IDs → country names (top 30)
const COUNTRY_MAP: Record<number, string> = {
  2840: "United States", 2826: "United Kingdom", 2276: "Germany", 2250: "France",
  2380: "Italy", 2724: "Spain", 2036: "Australia", 2124: "Canada", 2392: "Japan",
  2076: "Brazil", 2484: "Mexico", 2528: "Netherlands", 2756: "Switzerland",
  2752: "Sweden", 2578: "Norway", 2208: "Denmark", 2246: "Finland", 2040: "Austria",
  2056: "Belgium", 2620: "Portugal", 2616: "Poland", 2203: "Czech Republic",
  2348: "Hungary", 2642: "Romania", 2792: "Turkey", 2356: "India", 2156: "China",
  2410: "South Korea", 2702: "Singapore", 2764: "Thailand",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const accountId = searchParams.get("accountId");
  const dateRange = (searchParams.get("dateRange") || "30") as "7" | "14" | "30" | "custom";

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsGeo());
  }

  try {
    const { startDate, endDate } = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const accountsToQuery =
      accountId && accountId !== "all" ? [accountId] : assignedAccounts;

    const allResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              geographic_view.country_criterion_id,
              geographic_view.location_type,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM geographic_view
            WHERE segments.date >= '${startDate}'
              AND segments.date <= '${endDate}'
            ORDER BY metrics.cost_micros DESC
            LIMIT 100
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    // Aggregate by country
    const countryMap = new Map<number, {
      impressions: number; clicks: number; spend: number;
      conversions: number; revenue: number;
    }>();

    for (const row of allResults.flatMap((r) => r.results ?? [])) {
      const gv = (row as any).geographic_view ?? {};
      const m = (row as any).metrics ?? {};
      const criterionId = parseInt(gv.country_criterion_id ?? "0");
      if (!criterionId) continue;
      const existing = countryMap.get(criterionId) ?? { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 };
      countryMap.set(criterionId, {
        impressions: existing.impressions + parseInt(m.impressions ?? "0"),
        clicks: existing.clicks + parseInt(m.clicks ?? "0"),
        spend: existing.spend + normalizeCostMicros(m.cost_micros ?? 0),
        conversions: existing.conversions + parseFloat(m.conversions ?? "0"),
        revenue: existing.revenue + parseFloat(m.conversions_value ?? "0"),
      });
    }

    const totalConversions = Array.from(countryMap.values()).reduce((s, v) => s + v.conversions, 0);
    const avgCpa = Array.from(countryMap.values()).reduce((s, v) => s + v.spend, 0) /
      (totalConversions || 1);

    const geoData = Array.from(countryMap.entries())
      .map(([criterionId, metrics]) => ({
        country: COUNTRY_MAP[criterionId] ?? `Country #${criterionId}`,
        criterionId,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        spend: metrics.spend,
        conversions: metrics.conversions,
        revenue: metrics.revenue,
        roas: calculateRoas(metrics.revenue, metrics.spend),
        cpa: calculateCpa(metrics.spend, metrics.conversions),
        ctr: calculateCtr(metrics.clicks, metrics.impressions),
        convRate: metrics.clicks > 0
          ? Number(((metrics.conversions / metrics.clicks) * 100).toFixed(2))
          : 0,
        vsAvgCpa: metrics.conversions > 0
          ? Number(((calculateCpa(metrics.spend, metrics.conversions) / avgCpa - 1) * 100).toFixed(0))
          : null,
      }))
      .sort((a, b) => b.spend - a.spend);

    // Insights
    const insights: string[] = [];
    const top = geoData[0];
    const highConvLowSpend = geoData.find((g) => g.roas > 3 && g.spend < geoData[0].spend * 0.1);
    if (top) {
      insights.push(`${top.country} drives the most spend — ensure targeting and bids are optimised for this market.`);
    }
    if (highConvLowSpend) {
      insights.push(`${highConvLowSpend.country} has strong ROAS (${highConvLowSpend.roas.toFixed(1)}x) but low spend — consider increasing budget allocation.`);
    }

    return NextResponse.json({ data: geoData, insights });
  } catch (error) {
    console.error("[google-ads/geo]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
