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
} from "@/lib/google-ads-gaql";

/**
 * GET /api/google/search-terms
 *
 * Fetch real search term data from Google Ads Search Term Report
 * Query params:
 *   - businessId: required
 *   - accountId: optional (specific customer account ID, or "all" for aggregation)
 *   - dateRange: required ("7" | "14" | "30" | "custom")
 *   - search: optional (filter search terms by substring)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const accountId = searchParams.get("accountId");
  const dateRange = (searchParams.get("dateRange") || "30") as "7" | "14" | "30" | "custom";
  const searchFilter = searchParams.get("search")?.toLowerCase().trim() || "";

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
      return NextResponse.json({
        data: [],
        count: 0,
        note: "No Google Ads accounts assigned to this business",
      });
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
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch((error) => {
          console.error(`[search-terms] Query failed for account ${customerId}:`, error);
          return { results: [] };
        })
      )
    );

    const searchTerms = allResults
      .flatMap((result) => result.results || [])
      .map((row, index) => {
        const searchTermView = row.search_term_view as any;
        const campaign = row.campaign as any;
        const adGroup = row.ad_group as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const conversions = parseInt(metrics.metrics?.conversions || "0");
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");
        const clicks = parseInt(metrics.metrics?.clicks || "0");
        const impressions = parseInt(metrics.metrics?.impressions || "0");

        return {
          id: `st-${index}`,
          search_term: searchTermView?.search_term || "Unknown",
          match_type: normalizeMatchType(searchTermView?.status),
          campaign: campaign?.name || "Unknown Campaign",
          ad_group: adGroup?.name || "Unknown Ad Group",
          clicks,
          impressions,
          cost,
          conversions,
          conv_value: convValue,
          roas: calculateRoas(convValue, cost),
          cpa: calculateCpa(cost, conversions),
          ctr: calculateCtr(clicks, impressions),
          cpm: calculateCpm(cost, impressions),
        };
      })
      .filter((st) => {
        if (!searchFilter) return true;
        return st.search_term.toLowerCase().includes(searchFilter);
      });

    return NextResponse.json({
      data: searchTerms,
      count: searchTerms.length,
    });
  } catch (error) {
    console.error("[search-terms] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch search terms" },
      { status: 500 }
    );
  }
}

function normalizeMatchType(status: string | undefined): "Broad" | "Phrase" | "Exact" {
  if (!status) return "Broad";
  const lower = status.toLowerCase();
  if (lower.includes("phrase")) return "Phrase";
  if (lower.includes("exact")) return "Exact";
  return "Broad";
}
