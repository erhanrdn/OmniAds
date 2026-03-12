import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsKeywords, isDemoBusinessId } from "@/lib/demo-business";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
  calculateCpa,
  calculateCtr,
} from "@/lib/google-ads-gaql";

function normalizeMatchType(raw: string | undefined): string {
  if (!raw) return "Unknown";
  const lower = raw.toLowerCase();
  if (lower.includes("exact")) return "Exact";
  if (lower.includes("phrase")) return "Phrase";
  if (lower.includes("broad")) return "Broad";
  return raw;
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
    return NextResponse.json(getDemoGoogleAdsKeywords());
  }

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
              ad_group_criterion.keyword.text,
              ad_group_criterion.keyword.match_type,
              ad_group_criterion.quality_info.quality_score,
              ad_group_criterion.status,
              ad_group.name,
              campaign.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc,
              metrics.search_impression_share
            FROM keyword_view
            WHERE segments.date >= '${startDate}'
              AND segments.date <= '${endDate}'
              AND ad_group_criterion.status != 'REMOVED'
            ORDER BY metrics.cost_micros DESC
            LIMIT 1000
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const keywords = allResults
      .flatMap((r) => r.results ?? [])
      .map((row: any) => {
        const kw = row.ad_group_criterion ?? {};
        const m = row.metrics ?? {};
        const spend = normalizeCostMicros(m.cost_micros ?? 0);
        const conversions = parseFloat(m.conversions ?? "0");
        const revenue = parseFloat(m.conversions_value ?? "0");
        const clicks = parseInt(m.clicks ?? "0");
        const impressions = parseInt(m.impressions ?? "0");
        return {
          keyword: kw.keyword?.text ?? "",
          matchType: normalizeMatchType(kw.keyword?.match_type),
          status: kw.status ?? "UNKNOWN",
          qualityScore: kw.quality_info?.quality_score ?? null,
          adGroup: row.ad_group?.name ?? "",
          campaign: row.campaign?.name ?? "",
          spend,
          conversions,
          revenue,
          roas: calculateRoas(revenue, spend),
          cpa: calculateCpa(spend, conversions),
          ctr: calculateCtr(clicks, impressions),
          cpc: Number((parseFloat(m.average_cpc ?? "0") / 1_000_000).toFixed(2)),
          impressions,
          clicks,
          impressionShare: parseFloat(m.search_impression_share ?? "0") || null,
        };
      })
      .filter((k) => k.keyword !== "");

    // Insights
    const highCtrLowConv = keywords.filter(
      (k) => k.ctr > 5 && k.conversions === 0 && k.clicks >= 20
    );
    const highConvLowBudgetLimited = keywords.filter(
      (k) => k.conversions >= 3 && (k.impressionShare ?? 1) < 0.4
    );
    const deserveOwnAdGroup = keywords.filter(
      (k) => k.conversions >= 5 && k.spend > 100
    );

    return NextResponse.json({
      data: keywords,
      count: keywords.length,
      insights: {
        highCtrLowConvCount: highCtrLowConv.length,
        highConvLowBudgetCount: highConvLowBudgetLimited.length,
        deserveOwnAdGroupCount: deserveOwnAdGroup.length,
      },
    });
  } catch (error) {
    console.error("[google-ads/keywords]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
