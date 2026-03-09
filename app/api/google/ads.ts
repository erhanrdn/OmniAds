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
  calculateCpm,
  normalizeStatus,
} from "@/lib/google-ads-gaql";

/**
 * GET /api/google/ads
 *
 * Fetch real ad data from Google Ads API
 * Query params:
 *   - businessId: required
 *   - accountId: optional (specific customer account ID, or "all" for aggregation)
 *   - dateRange: required ("7" | "14" | "30" | "custom")
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const accountId = searchParams.get("accountId");
  const dateRange = (searchParams.get("dateRange") || "30") as "7" | "14" | "30" | "custom";

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId is required" },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  try {
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json(
        { error: "No Google Ads accounts assigned to this business" },
        { status: 404 }
      );
    }

    const accountsToQuery =
      accountId && accountId !== "all"
        ? [accountId]
        : assignedAccounts;

    const allResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              ad_group_ad.ad.id,
              ad_group_ad.ad.name,
              ad_group_ad.status,
              ad_group_ad.ad.type,
              ad_group.name,
              campaign.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc
            FROM ad_group_ad
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch((error) => {
          console.error(`[ads] Query failed for account ${customerId}:`, error);
          return { results: [] };
        })
      )
    );

    const ads = allResults
      .flatMap((result) => result.results || [])
      .map((row: any) => {
        const ad = row.ad_group_ad?.ad as any;
        const adGroupAd = row.ad_group_ad as any;
        const adGroup = row.ad_group as any;
        const campaign = row.campaign as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const conversions = parseInt(metrics.metrics?.conversions || "0");
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");

        return {
          id: ad?.id || "unknown",
          name: ad?.name || `Ad (${ad?.type || "unknown"} type)`,
          status: normalizeStatus(adGroupAd?.status),
          type: ad?.type || "unknown",
          adGroupName: adGroup?.name || "Unknown Ad Group",
          campaignName: campaign?.name || "Unknown Campaign",
          metrics: {
            impressions: parseInt(metrics.metrics?.impressions || "0"),
            clicks: parseInt(metrics.metrics?.clicks || "0"),
            spend: cost,
            conversions,
            revenue: convValue,
            roas: calculateRoas(convValue, cost),
            cpa: calculateCpa(cost, conversions),
            ctr: calculateCtr(
              metrics.metrics?.clicks || 0,
              metrics.metrics?.impressions || 0
            ),
            cpm: calculateCpm(cost, metrics.metrics?.impressions || 0),
          },
        };
      })
      .filter((a) => a.id !== "unknown");

    const uniqueAds = Array.from(
      new Map(ads.map((a) => [a.id, a])).values()
    );

    return NextResponse.json({
      data: uniqueAds,
      count: uniqueAds.length,
    });
  } catch (error) {
    console.error("[ads] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch ads" },
      { status: 500 }
    );
  }
}
