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
 * GET /api/google/ad-groups
 *
 * Fetch real ad group data from Google Ads API
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
              ad_group.id,
              ad_group.name,
              ad_group.status,
              campaign.id,
              campaign.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc
            FROM ad_group
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch((error) => {
          console.error(`[ad-groups] Query failed for account ${customerId}:`, error);
          return { results: [] };
        })
      )
    );

    const adGroups = allResults
      .flatMap((result) => result.results || [])
      .map((row) => {
        const adGroup = row.ad_group as any;
        const campaign = row.campaign as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const conversions = parseInt(metrics.metrics?.conversions || "0");
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");

        return {
          id: adGroup?.id || "unknown",
          name: adGroup?.name || "Unnamed Ad Group",
          status: normalizeStatus(adGroup?.status),
          campaignId: campaign?.id || "",
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
      .filter((ag) => ag.id !== "unknown");

    const uniqueAdGroups = Array.from(
      new Map(adGroups.map((ag) => [ag.id, ag])).values()
    );

    return NextResponse.json({
      data: uniqueAdGroups,
      count: uniqueAdGroups.length,
    });
  } catch (error) {
    console.error("[ad-groups] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch ad groups" },
      { status: 500 }
    );
  }
}
