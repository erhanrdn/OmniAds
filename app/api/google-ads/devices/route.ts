import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsDevices } from "@/lib/demo-business";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
  calculateCpa,
  calculateCtr,
} from "@/lib/google-ads-gaql";

function normalizeDevice(raw: string | undefined): string {
  if (!raw) return "Unknown";
  const lower = raw.toLowerCase();
  if (lower.includes("mobile")) return "Mobile";
  if (lower.includes("desktop")) return "Desktop";
  if (lower.includes("tablet")) return "Tablet";
  if (lower.includes("connected_tv") || lower.includes("tv")) return "Connected TV";
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
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsDevices());
  }

  try {
    const { startDate, endDate } = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({ data: [] });
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
              segments.device,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr
            FROM campaign
            WHERE segments.date >= '${startDate}'
              AND segments.date <= '${endDate}'
              AND campaign.status != 'REMOVED'
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    // Aggregate by device
    const deviceMap = new Map<string, {
      impressions: number; clicks: number; spend: number;
      conversions: number; revenue: number;
    }>();

    for (const row of allResults.flatMap((r) => r.results ?? [])) {
      const m = (row as any).metrics ?? {};
      const device = normalizeDevice((row as any).segments?.device);
      const existing = deviceMap.get(device) ?? { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 };
      deviceMap.set(device, {
        impressions: existing.impressions + parseInt(m.impressions ?? "0"),
        clicks: existing.clicks + parseInt(m.clicks ?? "0"),
        spend: existing.spend + normalizeCostMicros(m.cost_micros ?? 0),
        conversions: existing.conversions + parseFloat(m.conversions ?? "0"),
        revenue: existing.revenue + parseFloat(m.conversions_value ?? "0"),
      });
    }

    const devices = Array.from(deviceMap.entries()).map(([device, metrics]) => ({
      device,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      spend: metrics.spend,
      conversions: metrics.conversions,
      revenue: metrics.revenue,
      roas: calculateRoas(metrics.revenue, metrics.spend),
      cpa: calculateCpa(metrics.spend, metrics.conversions),
      ctr: calculateCtr(metrics.clicks, metrics.impressions),
      convRate: metrics.clicks > 0
        ? Number(((metrics.conversions / metrics.clicks) * 100).toFixed(2))
        : 0,
    }));

    // Insight: mobile CTR high but conv rate low
    const mobile = devices.find((d) => d.device === "Mobile");
    const desktop = devices.find((d) => d.device === "Desktop");
    const insights: string[] = [];
    if (mobile && desktop && mobile.ctr > desktop.ctr * 1.2 && mobile.convRate < desktop.convRate * 0.6) {
      insights.push("Mobile CTR is higher than desktop but conversion rate is significantly lower — consider mobile landing page optimisation.");
    }
    if (mobile && desktop && desktop.roas > mobile.roas * 1.5) {
      insights.push("Desktop ROAS is significantly higher — consider increasing desktop bid adjustments.");
    }

    return NextResponse.json({
      data: devices.sort((a, b) => b.spend - a.spend),
      insights,
    });
  } catch (error) {
    console.error("[google-ads/devices]", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
