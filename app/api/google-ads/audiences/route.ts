import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsAudiences, isDemoBusinessId } from "@/lib/demo-business";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
  calculateCpa,
  calculateCtr,
} from "@/lib/google-ads-gaql";

function normalizeAudienceType(raw: string | undefined): string {
  if (!raw) return "Unknown";
  const lower = raw.toLowerCase();
  if (lower.includes("user_list") || lower.includes("remarketing")) return "Remarketing";
  if (lower.includes("user_interest") || lower.includes("affinity")) return "Affinity";
  if (lower.includes("in_market")) return "In-Market";
  if (lower.includes("life_event")) return "Life Events";
  if (lower.includes("custom_intent")) return "Custom Intent";
  if (lower.includes("similar")) return "Similar Audiences";
  return raw.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

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
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(getDemoGoogleAdsAudiences());
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
              ad_group_criterion.type,
              ad_group_criterion.criterion_id,
              ad_group.name,
              campaign.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM ad_group_audience_view
            WHERE segments.date >= '${startDate}'
              AND segments.date <= '${endDate}'
            ORDER BY metrics.cost_micros DESC
            LIMIT 200
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const audiences = allResults
      .flatMap((r) => r.results ?? [])
      .map((row: any) => {
        const crit = row.ad_group_criterion ?? {};
        const m = row.metrics ?? {};
        const spend = normalizeCostMicros(m.cost_micros ?? 0);
        const conversions = parseFloat(m.conversions ?? "0");
        const revenue = parseFloat(m.conversions_value ?? "0");
        const clicks = parseInt(m.clicks ?? "0");
        const impressions = parseInt(m.impressions ?? "0");
        return {
          criterionId: crit.criterion_id ?? "",
          type: normalizeAudienceType(crit.type),
          adGroup: row.ad_group?.name ?? "",
          campaign: row.campaign?.name ?? "",
          spend,
          conversions,
          revenue,
          roas: calculateRoas(revenue, spend),
          cpa: calculateCpa(spend, conversions),
          ctr: calculateCtr(clicks, impressions),
          impressions,
          clicks,
        };
      });

    // Group by type for insight
    const byType = audiences.reduce<Record<string, { conversions: number; spend: number; revenue: number }>>((acc, a) => {
      const t = a.type;
      if (!acc[t]) acc[t] = { conversions: 0, spend: 0, revenue: 0 };
      acc[t].conversions += a.conversions;
      acc[t].spend += a.spend;
      acc[t].revenue += a.revenue;
      return acc;
    }, {});

    const insights: string[] = [];
    const remarketing = byType["Remarketing"];
    const inMarket = byType["In-Market"];
    if (remarketing && inMarket) {
      const remRoas = calculateRoas(remarketing.revenue, remarketing.spend);
      const imRoas = calculateRoas(inMarket.revenue, inMarket.spend);
      if (remRoas > imRoas * 2) {
        insights.push(`Remarketing audiences convert ${(remRoas / imRoas).toFixed(1)}x better than in-market — increase remarketing bid adjustments.`);
      }
    }

    return NextResponse.json({
      data: audiences.sort((a, b) => b.spend - a.spend),
      insights,
      summary: Object.entries(byType).map(([type, stats]) => ({
        type,
        conversions: stats.conversions,
        spend: stats.spend,
        roas: calculateRoas(stats.revenue, stats.spend),
      })),
    });
  } catch (error) {
    console.error("[google-ads/audiences]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
