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
} from "@/lib/google-ads-gaql";
import { generateOverviewInsights } from "@/lib/google-ads-intelligence";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const dateRange = (searchParams.get("dateRange") || "30") as
    | "7"
    | "14"
    | "30"
    | "custom";

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId is required" },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  try {
    const { startDate, endDate } = getDateRangeForQuery(dateRange);
    console.log("Dates:", startDate, endDate);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({ error: "no_accounts" }, { status: 404 });
    }

    // Fetch account-level totals + campaign breakdown in parallel
    const totalsQuery = `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`;
    const campaignQuery = `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign.status != 'REMOVED'`;
    const [totalsResults, campaignResults] = await Promise.all([
      Promise.all(
        assignedAccounts.map((customerId) =>
          executeGaqlQuery({
            businessId,
            customerId,
            query: totalsQuery,
            // query: `
            //   SELECT
            //     metrics.impressions,
            //     metrics.clicks,
            //     metrics.cost_micros,
            //     metrics.conversions,
            //     metrics.conversions_value,
            //     metrics.ctr
            //   FROM customer
            //   WHERE segments.date >= '${startDate}'
            //     AND segments.date <= '${endDate}'
            // `,
          }).catch(() => ({ results: [] })),
        ),
      ),
      Promise.all(
        assignedAccounts.map((customerId) =>
          executeGaqlQuery({
            businessId,
            customerId,
            query: campaignQuery,
            // query: `
            //   SELECT
            //     campaign.id,
            //     campaign.name,
            //     campaign.status,
            //     campaign.advertising_channel_type,
            //     metrics.impressions,
            //     metrics.clicks,
            //     metrics.cost_micros,
            //     metrics.conversions,
            //     metrics.conversions_value,
            //     metrics.search_impression_share,
            //     metrics.search_budget_lost_impression_share
            //   FROM campaign
            //   WHERE segments.date >= '${startDate}'
            //     AND segments.date <= '${endDate}'
            //     AND campaign.status != 'REMOVED'
            //   ORDER BY metrics.cost_micros DESC
            // `,
          }).catch(() => ({ results: [] })),
        ),
      ),
    ]);

    // Aggregate totals
    let impressions = 0,
      clicks = 0,
      spend = 0,
      conversions = 0,
      revenue = 0;
    for (const result of totalsResults) {
      for (const row of result.results ?? []) {
        const m = (row as any).metrics ?? {};
        impressions += parseInt(m.impressions ?? "0");
        clicks += parseInt(m.clicks ?? "0");
        spend += normalizeCostMicros(m.cost_micros ?? 0);
        conversions += parseFloat(m.conversions ?? "0");
        revenue += parseFloat(m.conversions_value ?? "0");
      }
    }

    const roas = calculateRoas(revenue, spend);
    const cpa = calculateCpa(spend, conversions);
    const ctr = calculateCtr(clicks, impressions);
    const cpc = clicks > 0 ? spend / clicks : 0;
    const convRate = clicks > 0 ? conversions / clicks : 0;

    // Build campaign rows for insight generation
    const campaigns = campaignResults
      .flatMap((r) => r.results ?? [])
      .map((row: any) => {
        const c = row.campaign ?? {};
        const m = row.metrics ?? {};
        const s = normalizeCostMicros(m.cost_micros ?? 0);
        const conv = parseFloat(m.conversions ?? "0");
        const rev = parseFloat(m.conversions_value ?? "0");
        return {
          id: c.id ?? "unknown",
          name: c.name ?? "Unnamed",
          status: c.status ?? "UNKNOWN",
          channel: c.advertising_channel_type ?? "",
          spend: s,
          conversions: conv,
          revenue: rev,
          roas: calculateRoas(rev, s),
          cpa: calculateCpa(s, conv),
          ctr: calculateCtr(m.clicks ?? 0, m.impressions ?? 0),
          impressions: parseInt(m.impressions ?? "0"),
          clicks: parseInt(m.clicks ?? "0"),
          impressionShare: parseFloat(m.search_impression_share ?? "0"),
          lostIsBudget: parseFloat(
            m.search_budget_lost_impression_share ?? "0",
          ),
        };
      })
      .filter((c) => c.id !== "unknown");

    const insights = generateOverviewInsights({
      campaigns,
      totalSpend: spend,
      totalConversions: conversions,
      totalRevenue: revenue,
      roas,
      cpa,
    });

    // Top campaigns by spend
    const topCampaigns = [...campaigns]
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    return NextResponse.json({
      kpis: {
        spend,
        conversions,
        revenue,
        roas,
        cpa,
        ctr,
        cpc: Number(cpc.toFixed(2)),
        impressions,
        clicks,
        convRate,
      },
      topCampaigns,
      insights,
      period: { startDate, endDate },
    });
  } catch (error) {
    console.error("[google-ads/overview]", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
