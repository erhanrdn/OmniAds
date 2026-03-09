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

interface RecommendationEvidence {
  label: string;
  value: string;
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  impact: "High" | "Med" | "Low";
  summary: string[];
  evidence: RecommendationEvidence[];
}

/**
 * GET /api/google/recommendations
 *
 * Compute real, evidence-based growth advice from account performance data
 * Query params:
 *   - businessId: required
 *   - accountId: optional
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
      return NextResponse.json({
        data: [],
        count: 0,
      });
    }

    const accountsToQuery =
      accountId && accountId !== "all"
        ? [accountId]
        : assignedAccounts;

    const recommendations: Recommendation[] = [];

    // Fetch search terms for waste analysis
    const searchTermResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              search_term_view.search_term,
              campaign.name,
              ad_group.name,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM search_term_view
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const allSearchTerms = searchTermResults.flatMap((r) => r.results || []);
    const searchTermWasteRec = computeSearchTermWaste(allSearchTerms);
    if (searchTermWasteRec) recommendations.push(searchTermWasteRec);

    // Fetch campaigns for concentration analysis
    const campaignResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              campaign.name,
              campaign.status,
              metrics.cost_micros,
              metrics.conversions_value,
              metrics.conversions
            FROM campaign
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const allCampaigns = campaignResults.flatMap((r) => r.results || []);
    const concentrationRec = computeSpendConcentration(allCampaigns);
    if (concentrationRec) recommendations.push(concentrationRec);

    // Zero-conversion analysis
    const zeroConvRec = computeZeroConversionSpend(allCampaigns);
    if (zeroConvRec) recommendations.push(zeroConvRec);

    // Asset performance (if PMax campaigns exist)
    const assetResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              asset_group_asset.performance_label,
              metrics.cost_micros,
              metrics.conversions_value,
              metrics.conversions
            FROM asset_group_asset
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const allAssets = assetResults.flatMap((r) => r.results || []);
    const assetRec = computeAssetGaps(allAssets);
    if (assetRec) recommendations.push(assetRec);

    return NextResponse.json({
      data: recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    console.error("[recommendations] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}

/**
 * Identifies search terms with high spend but low/no conversions as waste
 */
function computeSearchTermWaste(terms: any[]): Recommendation | null {
  if (!terms.length) return null;

  let totalCost = 0;
  let wastefulTerms: any[] = [];

  for (const term of terms) {
    const metrics = term as any;
    const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
    const conversions = parseInt(metrics.metrics?.conversions || "0");
    const clicks = parseInt(metrics.metrics?.clicks || "0");

    totalCost += cost;

    // Wasteful = high clicks, low/no conversions
    if (clicks >= 20 && conversions === 0 && cost >= 5) {
      wastefulTerms.push({
        term: metrics.search_term_view?.search_term || "unknown",
        cost,
        clicks,
        conversions,
      });
    }
  }

  if (wastefulTerms.length < 3) return null;

  const wasteCost = wastefulTerms.reduce((sum, t) => sum + t.cost, 0);
  const wastePct = totalCost > 0 ? ((wasteCost / totalCost) * 100).toFixed(1) : "0";

  return {
    id: "rec-search-waste",
    title: "Search term waste opportunity",
    description: "Identify high-spend search terms with no conversions to exclude",
    impact: "High",
    summary: [
      `${wastefulTerms.length} search terms consumed $${wasteCost.toFixed(0)} with zero conversions.`,
      `These represent ${wastePct}% of total search spend.`,
      "Adding negative keywords can immediately improve efficiency.",
    ],
    evidence: [
      { label: "Waste terms found", value: String(wastefulTerms.length) },
      { label: "Waste spend", value: `$${wasteCost.toFixed(0)}` },
      { label: "% of total spend", value: `${wastePct}%` },
    ],
  };
}

/**
 * Identifies spend concentration risk (too much budget in weak campaigns)
 */
function computeSpendConcentration(campaigns: any[]): Recommendation | null {
  if (!campaigns.length) return null;

  const campaignData = campaigns
    .map((c) => {
      const metrics = c as any;
      const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
      const convValue = parseFloat(metrics.metrics?.conversions_value || "0");
      const conversions = parseInt(metrics.metrics?.conversions || "0");

      return {
        name: metrics.campaign?.name || "unknown",
        cost,
        roas: calculateRoas(convValue, cost),
        conversions,
      };
    })
    .filter((c) => c.cost > 0)
    .sort((a, b) => b.cost - a.cost);

  if (campaignData.length < 2) return null;

  const totalCost = campaignData.reduce((sum, c) => sum + c.cost, 0);
  const avgRoas = campaignData.reduce((sum, c) => sum + c.roas, 0) / campaignData.length;

  // Find weak campaigns with high spend
  const weakCampaigns = campaignData.filter(
    (c) => c.roas < avgRoas * 0.7 && c.cost > totalCost * 0.1
  );

  if (weakCampaigns.length === 0) return null;

  const weakSpend = weakCampaigns.reduce((sum, c) => sum + c.cost, 0);

  return {
    id: "rec-concentration",
    title: "Spend concentration risk",
    description: "Reallocate budget from underperforming campaigns to winners",
    impact: "Med",
    summary: [
      `${weakCampaigns.length} campaigns have ROAS below average but high spend share.`,
      `${(((weakSpend / totalCost) * 100).toFixed(1))}% of budget is at risk.`,
      "Consider reallocating to top-performing campaigns.",
    ],
    evidence: [
      { label: "Weak campaigns", value: String(weakCampaigns.length) },
      { label: "Account avg ROAS", value: avgRoas.toFixed(2) },
      { label: "Risk spend", value: `$${weakSpend.toFixed(0)}` },
    ],
  };
}

/**
 * Identifies campaigns/products spending without conversions
 */
function computeZeroConversionSpend(campaigns: any[]): Recommendation | null {
  const zeroConvCampaigns = campaigns
    .map((c) => {
      const metrics = c as any;
      const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
      const conversions = parseInt(metrics.metrics?.conversions || "0");
      return {
        name: metrics.campaign?.name || "unknown",
        cost,
        conversions,
      };
    })
    .filter((c) => c.cost >= 10 && c.conversions === 0);

  if (zeroConvCampaigns.length === 0) return null;

  const zeroSpend = zeroConvCampaigns.reduce((sum, c) => sum + c.cost, 0);

  return {
    id: "rec-zero-conv",
    title: "Zero-conversion spend",
    description: "Pause or optimize campaigns with no conversions",
    impact: "High",
    summary: [
      `${zeroConvCampaigns.length} campaigns have spent $${zeroSpend.toFixed(0)} with zero conversions.`,
      "These may need creative refresh, audience adjustments, or pausing.",
      "Review targeting and bids to improve conversion probability.",
    ],
    evidence: [
      { label: "Campaigns at risk", value: String(zeroConvCampaigns.length) },
      { label: "Spend with 0 conv", value: `$${zeroSpend.toFixed(0)}` },
      { label: "Recommended action", value: "Optimize or pause" },
    ],
  };
}

/**
 * Identifies Performance Max asset performance gaps
 */
function computeAssetGaps(assets: any[]): Recommendation | null {
  if (!assets.length) return null;

  const lowAssets = assets.filter((a) => {
    const label = (a.asset_group_asset?.performance_label || "").toLowerCase();
    return label.includes("low");
  });

  if (lowAssets.length === 0) return null;

  const lowCost = lowAssets.reduce((sum, a) => {
    return sum + normalizeCostMicros((a as any).metrics?.cost_micros || 0);
  }, 0);

  return {
    id: "rec-asset-gaps",
    title: "PMax asset performance gaps",
    description: "Deploy new creatives to replace low-performing assets",
    impact: "Med",
    summary: [
      `${lowAssets.length} assets marked with low performance.`,
      `These assets have spent $${lowCost.toFixed(0)}.`,
      "Test new headlines, images, or videos to improve engagement.",
    ],
    evidence: [
      { label: "Low-performing assets", value: String(lowAssets.length) },
      { label: "Spend on low assets", value: `$${lowCost.toFixed(0)}` },
      { label: "Recommended action", value: "Refresh creatives" },
    ],
  };
}
