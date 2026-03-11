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
} from "@/lib/google-ads-gaql";

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
              ad_group_ad.ad.id,
              ad_group_ad.ad.name,
              ad_group_ad.ad.type,
              ad_group_ad.ad.responsive_search_ad.headlines,
              ad_group_ad.ad.responsive_search_ad.descriptions,
              ad_group_ad.ad.expanded_text_ad.headline_part1,
              ad_group_ad.ad.expanded_text_ad.description,
              ad_group_ad.status,
              ad_group.name,
              campaign.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr
            FROM ad_group_ad
            WHERE segments.date >= '${startDate}'
              AND segments.date <= '${endDate}'
              AND ad_group_ad.status != 'REMOVED'
            ORDER BY metrics.cost_micros DESC
            LIMIT 500
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const ads = allResults
      .flatMap((r) => r.results ?? [])
      .map((row: any) => {
        const adData = row.ad_group_ad?.ad ?? {};
        const adGroupAd = row.ad_group_ad ?? {};
        const m = row.metrics ?? {};
        const spend = normalizeCostMicros(m.cost_micros ?? 0);
        const conversions = parseFloat(m.conversions ?? "0");
        const revenue = parseFloat(m.conversions_value ?? "0");
        const clicks = parseInt(m.clicks ?? "0");
        const impressions = parseInt(m.impressions ?? "0");

        // Extract headline text
        let headline = adData.name || "";
        if (!headline) {
          const rsaHeadlines = adData.responsive_search_ad?.headlines;
          if (Array.isArray(rsaHeadlines) && rsaHeadlines.length > 0) {
            headline = rsaHeadlines
              .slice(0, 3)
              .map((h: any) => h.text ?? "")
              .filter(Boolean)
              .join(" | ");
          } else {
            headline = adData.expanded_text_ad?.headline_part1 ?? `Ad (${adData.type ?? "unknown"})`;
          }
        }

        const rsaDescs = adData.responsive_search_ad?.descriptions;
        const description = Array.isArray(rsaDescs) && rsaDescs.length > 0
          ? rsaDescs[0]?.text ?? ""
          : adData.expanded_text_ad?.description ?? "";

        return {
          id: adData.id ?? "unknown",
          headline,
          description,
          type: adData.type ?? "unknown",
          status: normalizeStatus(adGroupAd.status),
          adGroup: row.ad_group?.name ?? "",
          campaign: row.campaign?.name ?? "",
          spend,
          conversions,
          revenue,
          roas: calculateRoas(revenue, spend),
          cpa: calculateCpa(spend, conversions),
          ctr: calculateCtr(clicks, impressions),
          convRate: clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(2)) : 0,
          impressions,
          clicks,
        };
      })
      .filter((a) => a.id !== "unknown");

    // Ad copy insights
    const sorted = [...ads].sort((a, b) => b.conversions - a.conversions);
    const topQuartile = sorted.slice(0, Math.max(1, Math.ceil(ads.length * 0.25)));
    const bottomQuartile = sorted.slice(Math.floor(ads.length * 0.75));
    const avgTopCtr = topQuartile.reduce((s, a) => s + a.ctr, 0) / (topQuartile.length || 1);
    const avgBottomCtr = bottomQuartile.reduce((s, a) => s + a.ctr, 0) / (bottomQuartile.length || 1);

    return NextResponse.json({
      data: ads,
      count: ads.length,
      insights: {
        topPerformerCtr: Number(avgTopCtr.toFixed(2)),
        bottomPerformerCtr: Number(avgBottomCtr.toFixed(2)),
        bestAd: topQuartile[0] ?? null,
        worstAd: bottomQuartile[bottomQuartile.length - 1] ?? null,
      },
    });
  } catch (error) {
    console.error("[google-ads/ads]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
