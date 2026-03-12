import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsCreatives } from "@/lib/demo-business";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
  calculateCpa,
  calculateCtr,
} from "@/lib/google-ads-gaql";

function normalizePerformanceLabel(raw: string | undefined): "Best" | "Good" | "Low" | "Learning" | "Unknown" {
  if (!raw) return "Unknown";
  const upper = raw.toUpperCase();
  if (upper.includes("BEST")) return "Best";
  if (upper.includes("GOOD")) return "Good";
  if (upper.includes("LOW") || upper.includes("POOR")) return "Low";
  if (upper.includes("LEARN") || upper.includes("PENDING")) return "Learning";
  return "Unknown";
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
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsCreatives());
  }

  try {
    const { startDate, endDate } = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const accountsToQuery =
      accountId && accountId !== "all" ? [accountId] : assignedAccounts;

    // Fetch asset groups (Performance Max creatives)
    const allResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              asset_group.id,
              asset_group.name,
              asset_group.status,
              asset_group.ad_strength,
              campaign.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM asset_group
            WHERE segments.date >= '${startDate}'
              AND segments.date <= '${endDate}'
              AND asset_group.status != 'REMOVED'
            ORDER BY metrics.cost_micros DESC
            LIMIT 100
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const creatives = allResults
      .flatMap((r) => r.results ?? [])
      .map((row: any) => {
        const ag = row.asset_group ?? {};
        const m = row.metrics ?? {};
        const spend = normalizeCostMicros(m.cost_micros ?? 0);
        const conversions = parseFloat(m.conversions ?? "0");
        const revenue = parseFloat(m.conversions_value ?? "0");
        const clicks = parseInt(m.clicks ?? "0");
        const impressions = parseInt(m.impressions ?? "0");
        return {
          id: ag.id ?? "unknown",
          name: ag.name ?? "Unnamed Asset Group",
          type: "Performance Max" as const,
          status: ag.status ?? "UNKNOWN",
          adStrength: normalizePerformanceLabel(ag.ad_strength),
          campaign: row.campaign?.name ?? "",
          spend,
          conversions,
          revenue,
          roas: calculateRoas(revenue, spend),
          cpa: calculateCpa(spend, conversions),
          ctr: calculateCtr(clicks, impressions),
          impressions,
          clicks,
        };
      })
      .filter((c) => c.id !== "unknown");

    const insights: string[] = [];
    const bestCreatives = creatives.filter((c) => c.adStrength === "Best");
    const lowCreatives = creatives.filter((c) => c.adStrength === "Low");
    if (bestCreatives.length > 0 && lowCreatives.length > 0) {
      const bestAvgRoas = bestCreatives.reduce((s, c) => s + c.roas, 0) / bestCreatives.length;
      const lowAvgRoas = lowCreatives.reduce((s, c) => s + c.roas, 0) / lowCreatives.length;
      if (bestAvgRoas > lowAvgRoas * 1.3) {
        insights.push(`"Best" strength asset groups average ${bestAvgRoas.toFixed(1)}x ROAS vs ${lowAvgRoas.toFixed(1)}x for "Low" — improve low-strength asset groups with more creative variety.`);
      }
    }
    if (lowCreatives.length > 0) {
      insights.push(`${lowCreatives.length} asset group${lowCreatives.length > 1 ? "s have" : " has"} Low ad strength — add more headlines, descriptions, and images.`);
    }

    return NextResponse.json({ data: creatives, count: creatives.length, insights });
  } catch (error) {
    console.error("[google-ads/creatives]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
