import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
  calculateCtr,
  calculateCpm,
  normalizeStatus,
  normalizeChannelType,
} from "@/lib/google-ads-gaql";

/**
 * GET /api/google/campaigns
 *
 * Fetch real campaign data from Google Ads API
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
        {
          error: "No Google Ads accounts assigned to this business",
        },
        { status: 404 }
      );
    }

    // Determine which accounts to query
    const accountsToQuery =
      accountId && accountId !== "all"
        ? [accountId]
        : assignedAccounts;

    // Execute queries for each account
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
              campaign.advertising_channel_sub_type,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc
            FROM campaign
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch((error) => {
          console.error(`[campaigns] Query failed for account ${customerId}:`, error);
          return { results: [] };
        })
      )
    );

    // Flatten and normalize results
    const campaigns = allResults
      .flatMap((result) => result.results || [])
      .map((row) => {
        const campaign = row.campaign as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");

        return {
          id: campaign?.id || "unknown",
          name: campaign?.name || "Unnamed Campaign",
          status: normalizeStatus(campaign?.status),
          channel: normalizeChannelType(campaign?.advertising_channel_type),
          subChannel: campaign?.advertising_channel_sub_type || "",
          metrics: {
            impressions: parseInt(metrics.metrics?.impressions || "0"),
            clicks: parseInt(metrics.metrics?.clicks || "0"),
            spend: cost,
            conversions: parseInt(metrics.metrics?.conversions || "0"),
            revenue: convValue,
            roas: calculateRoas(convValue, cost),
            cpc: parseFloat(metrics.metrics?.average_cpc || "0") / 1000000,
            ctr: calculateCtr(
              metrics.metrics?.clicks || 0,
              metrics.metrics?.impressions || 0
            ),
            cpm: calculateCpm(
              cost,
              metrics.metrics?.impressions || 0
            ),
          },
        };
      })
      .filter((c) => c.id !== "unknown");

    // Deduplicate by campaign ID if aggregating across accounts
    const uniqueCampaigns = Array.from(
      new Map(campaigns.map((c) => [c.id, c])).values()
    );

    return NextResponse.json({
      data: uniqueCampaigns,
      count: uniqueCampaigns.length,
    });
  } catch (error) {
    console.error("[campaigns] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}
