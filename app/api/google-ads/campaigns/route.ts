import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
  calculateCpa,
  calculateCtr,
  normalizeStatus,
  normalizeChannelType,
} from "@/lib/google-ads-gaql";
import { getCampaignBadges } from "@/lib/google-ads-intelligence";

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

  try {
    const { startDate, endDate } = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({ data: [], count: 0 });
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
              campaign.id,
              campaign.name,
              campaign.status,
              campaign.advertising_channel_type,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc,
              metrics.search_impression_share,
              metrics.search_budget_lost_impression_share,
              metrics.search_rank_lost_impression_share
            FROM campaign
            WHERE segments.date >= '${startDate}'
              AND segments.date <= '${endDate}'
              AND campaign.status != 'REMOVED'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const campaigns = allResults
      .flatMap((r) => r.results ?? [])
      .map((row: any) => {
        const c = row.campaign ?? {};
        const m = row.metrics ?? {};
        const spend = normalizeCostMicros(m.cost_micros ?? 0);
        const conversions = parseFloat(m.conversions ?? "0");
        const revenue = parseFloat(m.conversions_value ?? "0");
        return {
          id: c.id ?? "unknown",
          name: c.name ?? "Unnamed Campaign",
          status: normalizeStatus(c.status),
          channel: normalizeChannelType(c.advertising_channel_type),
          spend,
          conversions,
          revenue,
          roas: calculateRoas(revenue, spend),
          cpa: calculateCpa(spend, conversions),
          ctr: calculateCtr(m.clicks ?? 0, m.impressions ?? 0),
          cpc: Number((parseFloat(m.average_cpc ?? "0") / 1_000_000).toFixed(2)),
          impressions: parseInt(m.impressions ?? "0"),
          clicks: parseInt(m.clicks ?? "0"),
          impressionShare: parseFloat(m.search_impression_share ?? "0") || null,
          lostIsBudget: parseFloat(m.search_budget_lost_impression_share ?? "0") || null,
          lostIsRank: parseFloat(m.search_rank_lost_impression_share ?? "0") || null,
        };
      })
      .filter((c) => c.id !== "unknown");

    // Compute account averages for badge generation
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    const accountAvgRoas = calculateRoas(totalRevenue, totalSpend);
    const accountAvgCpa = calculateCpa(totalSpend, totalConversions);

    const campaignsWithBadges = campaigns.map((c) => ({
      ...c,
      badges: getCampaignBadges(
        { ...c, lostIsBudget: c.lostIsBudget ?? undefined, impressionShare: c.impressionShare ?? undefined, lostIsRank: c.lostIsRank ?? undefined },
        accountAvgRoas,
        accountAvgCpa
      ),
    }));

    return NextResponse.json({
      data: campaignsWithBadges,
      count: campaignsWithBadges.length,
      accountAvgRoas,
      accountAvgCpa,
    });
  } catch (error) {
    console.error("[google-ads/campaigns]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
