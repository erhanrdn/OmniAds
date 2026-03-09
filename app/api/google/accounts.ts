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
} from "@/lib/google-ads-gaql";

/**
 * GET /api/google/accounts
 *
 * Fetch account-level aggregated METRICS for ASSIGNED Google Ads accounts.
 * This endpoint is for analytics/reporting purposes, NOT for the assignment modal.
 * 
 * For discovering all accessible accounts (used by assignment modal), use:
 * /api/google/accessible-accounts
 *
 * Query params:
 *   - businessId: required
 *   - dateRange: required ("7" | "14" | "30" | "custom")
 *
 * Returns account-level performance metrics for already-assigned Google Ads accounts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
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

    // Return empty array if no accounts are assigned (not an error)
    if (assignedAccounts.length === 0) {
      console.log("[accounts] No assigned accounts found for business", { businessId });
      return NextResponse.json({
        data: [],
        count: 0,
      });
    }

    // Execute queries for each account and aggregate
    const allResults = await Promise.all(
      assignedAccounts.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              customer.id,
              customer.descriptive_name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM customer
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
          `,
        }).catch((error) => {
          console.error(`[accounts] Query failed for account ${customerId}:`, error);
          return { results: [] };
        })
      )
    );

    // Transform results to account rows
    const accounts = allResults
      .map((result, index) => {
        const row = result.results?.[0];
        if (!row) return null;

        const customerId = assignedAccounts[index];
        const customer = row as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");
        const conversions = parseInt(metrics.metrics?.conversions || "0");

        return {
          id: customerId,
          name: customer?.customer?.descriptive_name || `Account ${customerId}`,
          accountId: customerId,
          status: "active", // Google Ads accounts don't have explicit status in API
          metrics: {
            impressions: parseInt(metrics.metrics?.impressions || "0"),
            clicks: parseInt(metrics.metrics?.clicks || "0"),
            spend: cost,
            conversions,
            revenue: convValue,
            roas: calculateRoas(convValue, cost),
            cpc: cost > 0 ? cost / Math.max(metrics.metrics?.clicks || 1, 1) : 0,
            ctr: calculateCtr(
              metrics.metrics?.clicks || 0,
              metrics.metrics?.impressions || 0
            ),
            cpm: calculateCpm(
              cost,
              metrics.metrics?.impressions || 0
            ),
            cpa: conversions > 0 ? cost / conversions : 0,
          },
        };
      })
      .filter((row) => row !== null);

    return NextResponse.json({
      data: accounts,
      count: accounts.length,
    });
  } catch (error) {
    console.error("[accounts] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
