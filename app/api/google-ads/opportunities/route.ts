import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsOpportunities } from "@/lib/demo-business";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
  calculateCpa,
  calculateCtr,
  normalizeChannelType,
} from "@/lib/google-ads-gaql";
import { generateOpportunities, classifySearchIntent } from "@/lib/google-ads-intelligence";

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
    return NextResponse.json(getDemoGoogleAdsOpportunities());
  }

  try {
    const { startDate, endDate } = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const accountsToQuery =
      accountId && accountId !== "all" ? [accountId] : assignedAccounts;

    // Fetch campaigns, keywords, search terms, and ads in parallel
    const [campaignRes, keywordRes, stRes, adRes] = await Promise.all([
      Promise.all(accountsToQuery.map((customerId) =>
        executeGaqlQuery({ businessId, customerId, query: `
          SELECT campaign.id, campaign.name, campaign.advertising_channel_type,
            metrics.cost_micros, metrics.conversions, metrics.conversions_value,
            metrics.impressions, metrics.clicks,
            metrics.search_impression_share, metrics.search_budget_lost_impression_share
          FROM campaign
          WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
            AND campaign.status != 'REMOVED'
          ORDER BY metrics.cost_micros DESC
        ` }).catch(() => ({ results: [] }))
      )),
      Promise.all(accountsToQuery.map((customerId) =>
        executeGaqlQuery({ businessId, customerId, query: `
          SELECT ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score,
            ad_group.name, campaign.name,
            metrics.cost_micros, metrics.conversions, metrics.conversions_value,
            metrics.impressions, metrics.clicks, metrics.search_impression_share
          FROM keyword_view
          WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
            AND ad_group_criterion.status != 'REMOVED'
          ORDER BY metrics.cost_micros DESC LIMIT 500
        ` }).catch(() => ({ results: [] }))
      )),
      Promise.all(accountsToQuery.map((customerId) =>
        executeGaqlQuery({ businessId, customerId, query: `
          SELECT search_term_view.search_term, campaign.name, ad_group.name,
            metrics.cost_micros, metrics.conversions, metrics.conversions_value,
            metrics.impressions, metrics.clicks
          FROM search_term_view
          WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
          ORDER BY metrics.cost_micros DESC LIMIT 500
        ` }).catch(() => ({ results: [] }))
      )),
      Promise.all(accountsToQuery.map((customerId) =>
        executeGaqlQuery({ businessId, customerId, query: `
          SELECT ad_group_ad.ad.id, ad_group.name, campaign.name,
            metrics.cost_micros, metrics.conversions, metrics.conversions_value,
            metrics.ctr, metrics.impressions, metrics.clicks
          FROM ad_group_ad
          WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
            AND ad_group_ad.status != 'REMOVED'
          ORDER BY metrics.cost_micros DESC LIMIT 200
        ` }).catch(() => ({ results: [] }))
      )),
    ]);

    // Also get the keyword set for isKeyword flag
    const keywordSet = new Set(
      keywordRes.flatMap((r) => r.results ?? []).map((row: any) =>
        row.ad_group_criterion?.keyword?.text?.toLowerCase() ?? ""
      ).filter(Boolean)
    );

    const campaigns = campaignRes.flatMap((r) => r.results ?? []).map((row: any) => {
      const c = row.campaign ?? {}, m = row.metrics ?? {};
      const spend = normalizeCostMicros(m.cost_micros ?? 0);
      const conv = parseFloat(m.conversions ?? "0");
      const rev = parseFloat(m.conversions_value ?? "0");
      return {
        id: c.id ?? "", name: c.name ?? "", status: "active",
        channel: normalizeChannelType(c.advertising_channel_type),
        spend, conversions: conv, revenue: rev,
        roas: calculateRoas(rev, spend), cpa: calculateCpa(spend, conv),
        ctr: calculateCtr(m.clicks ?? 0, m.impressions ?? 0),
        impressions: parseInt(m.impressions ?? "0"), clicks: parseInt(m.clicks ?? "0"),
        impressionShare: parseFloat(m.search_impression_share ?? "0") || undefined,
        lostIsBudget: parseFloat(m.search_budget_lost_impression_share ?? "0") || undefined,
      };
    });

    const keywords = keywordRes.flatMap((r) => r.results ?? []).map((row: any) => {
      const kw = row.ad_group_criterion ?? {}, m = row.metrics ?? {};
      const spend = normalizeCostMicros(m.cost_micros ?? 0);
      const conv = parseFloat(m.conversions ?? "0");
      const rev = parseFloat(m.conversions_value ?? "0");
      return {
        keyword: kw.keyword?.text ?? "", matchType: kw.keyword?.match_type ?? "",
        campaign: row.campaign?.name ?? "", adGroup: row.ad_group?.name ?? "",
        spend, conversions: conv, revenue: rev,
        roas: calculateRoas(rev, spend), cpa: calculateCpa(spend, conv),
        ctr: calculateCtr(m.clicks ?? 0, m.impressions ?? 0),
        impressions: parseInt(m.impressions ?? "0"), clicks: parseInt(m.clicks ?? "0"),
        qualityScore: kw.quality_info?.quality_score ?? undefined,
        impressionShare: parseFloat(m.search_impression_share ?? "0") || undefined,
      };
    });

    const searchTerms = stRes.flatMap((r) => r.results ?? []).map((row: any) => {
      const st = row.search_term_view ?? {}, m = row.metrics ?? {};
      const spend = normalizeCostMicros(m.cost_micros ?? 0);
      const conv = parseFloat(m.conversions ?? "0");
      const rev = parseFloat(m.conversions_value ?? "0");
      const term = st.search_term ?? "";
      return {
        searchTerm: term, campaign: row.campaign?.name ?? "", adGroup: row.ad_group?.name ?? "",
        spend, conversions: conv, revenue: rev,
        roas: calculateRoas(rev, spend), cpa: calculateCpa(spend, conv),
        ctr: calculateCtr(m.clicks ?? 0, m.impressions ?? 0),
        impressions: parseInt(m.impressions ?? "0"), clicks: parseInt(m.clicks ?? "0"),
        intent: classifySearchIntent(term),
        isKeyword: keywordSet.has(term.toLowerCase()),
      };
    });

    const ads = adRes.flatMap((r) => r.results ?? []).map((row: any) => {
      const ad = row.ad_group_ad?.ad ?? {}, m = row.metrics ?? {};
      const spend = normalizeCostMicros(m.cost_micros ?? 0);
      const conv = parseFloat(m.conversions ?? "0");
      const rev = parseFloat(m.conversions_value ?? "0");
      return {
        id: ad.id ?? "", headline: "", description: "",
        campaign: row.campaign?.name ?? "", adGroup: row.ad_group?.name ?? "",
        spend, conversions: conv, revenue: rev,
        ctr: parseFloat(m.ctr ?? "0") * 100, cpa: calculateCpa(spend, conv),
        impressions: parseInt(m.impressions ?? "0"),
      };
    });

    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    const accountAvgRoas = calculateRoas(totalRevenue, totalSpend);
    const accountAvgCpa = calculateCpa(totalSpend, totalConversions);

    const opportunities = generateOpportunities({
      campaigns, keywords, searchTerms, ads, accountAvgRoas, accountAvgCpa,
    });

    return NextResponse.json({ data: opportunities, count: opportunities.length });
  } catch (error) {
    console.error("[google-ads/opportunities]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
