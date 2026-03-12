import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsSearchTerms, isDemoBusinessId } from "@/lib/demo-business";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
  calculateCpa,
  calculateCtr,
} from "@/lib/google-ads-gaql";
import { classifySearchIntent, classifySearchTerms } from "@/lib/google-ads-intelligence";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const accountId = searchParams.get("accountId");
  const dateRange = (searchParams.get("dateRange") || "30") as "7" | "14" | "30" | "custom";
  const filter = searchParams.get("search")?.toLowerCase().trim() ?? "";

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(getDemoGoogleAdsSearchTerms());
  }

  try {
    const { startDate, endDate } = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({ data: [], count: 0 });
    }

    const accountsToQuery =
      accountId && accountId !== "all" ? [accountId] : assignedAccounts;

    // Fetch search terms and existing keywords in parallel to flag keyword-matched terms
    const [termResults, keywordResults] = await Promise.all([
      Promise.all(
        accountsToQuery.map((customerId) =>
          executeGaqlQuery({
            businessId,
            customerId,
            query: `
              SELECT
                search_term_view.search_term,
                search_term_view.status,
                campaign.name,
                ad_group.name,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.conversions_value
              FROM search_term_view
              WHERE segments.date >= '${startDate}'
                AND segments.date <= '${endDate}'
              ORDER BY metrics.cost_micros DESC
              LIMIT 500
            `,
          }).catch(() => ({ results: [] }))
        )
      ),
      Promise.all(
        accountsToQuery.map((customerId) =>
          executeGaqlQuery({
            businessId,
            customerId,
            query: `
              SELECT
                ad_group_criterion.keyword.text
              FROM keyword_view
              WHERE ad_group_criterion.status != 'REMOVED'
              LIMIT 5000
            `,
          }).catch(() => ({ results: [] }))
        )
      ),
    ]);

    const keywordSet = new Set<string>();
    for (const r of keywordResults.flatMap((r) => r.results ?? [])) {
      const text = (r as any).ad_group_criterion?.keyword?.text;
      if (text) keywordSet.add(text.toLowerCase());
    }

    const terms = termResults
      .flatMap((r) => r.results ?? [])
      .map((row: any) => {
        const st = row.search_term_view ?? {};
        const m = row.metrics ?? {};
        const spend = normalizeCostMicros(m.cost_micros ?? 0);
        const conversions = parseFloat(m.conversions ?? "0");
        const revenue = parseFloat(m.conversions_value ?? "0");
        const clicks = parseInt(m.clicks ?? "0");
        const impressions = parseInt(m.impressions ?? "0");
        const searchTerm = st.search_term ?? "";
        return {
          searchTerm,
          status: st.status ?? "UNSPECIFIED",
          campaign: row.campaign?.name ?? "",
          adGroup: row.ad_group?.name ?? "",
          spend,
          conversions,
          revenue,
          roas: calculateRoas(revenue, spend),
          cpa: calculateCpa(spend, conversions),
          ctr: calculateCtr(clicks, impressions),
          impressions,
          clicks,
          intent: classifySearchIntent(searchTerm),
          isKeyword: keywordSet.has(searchTerm.toLowerCase()),
        };
      })
      .filter((t) => !filter || t.searchTerm.includes(filter));

    const classified = classifySearchTerms(terms);

    return NextResponse.json({
      data: terms,
      count: terms.length,
      summary: {
        wastefulCount: classified.wasteful.length,
        negativeKeywordCandidates: classified.negativeKeywordCandidates.length,
        highPerformingCount: classified.highPerforming.length,
        keywordOpportunities: classified.keywordOpportunities.length,
        wastefulSpend: classified.wasteful.reduce((s, t) => s + t.spend, 0),
      },
    });
  } catch (error) {
    console.error("[google-ads/search-terms]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
