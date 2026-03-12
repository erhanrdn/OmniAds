import { NextRequest, NextResponse } from "next/server";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getIntegration } from "@/lib/integrations";
import { runMigrations } from "@/lib/migrations";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoOverview, isDemoBusinessId } from "@/lib/demo-business";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrendPoint {
  label: string;
  spend: number;
  revenue: number;
  purchases: number;
}

interface PlatformEfficiencyRow {
  platform: string;
  spend: number;
  revenue: number;
  roas: number;
  purchases: number;
  cpa: number;
}

interface OverviewResponse {
  businessId: string;
  dateRange: { startDate: string; endDate: string };
  status?: string;
  kpis: {
    spend: number;
    revenue: number;
    roas: number;
    purchases: number;
    cpa: number;
    aov: number;
  };
  totals: {
    impressions: number;
    clicks: number;
    purchases: number;
    spend: number;
    conversions: number;
    revenue: number;
    ctr: number;
    cpm: number;
    cpc: number;
    cpa: number;
    roas: number;
  };
  platformEfficiency: PlatformEfficiencyRow[];
  trends: {
    "7d": TrendPoint[];
    "14d": TrendPoint[];
    "30d": TrendPoint[];
    custom: TrendPoint[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEmptyOverview(
  businessId: string,
  startDate: string,
  endDate: string,
  status?: string
): OverviewResponse {
  const kpis = { spend: 0, revenue: 0, roas: 0, purchases: 0, cpa: 0, aov: 0 };
  return {
    businessId,
    dateRange: { startDate, endDate },
    ...(status ? { status } : {}),
    kpis,
    totals: {
      impressions: 0,
      clicks: 0,
      purchases: 0,
      spend: 0,
      conversions: 0,
      revenue: 0,
      ctr: 0,
      cpm: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
    },
    platformEfficiency: [],
    trends: { "7d": [], "14d": [], "30d": [], custom: [] },
  };
}

function parseActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  actionType: string
): number {
  if (!Array.isArray(actions)) return 0;
  const found = actions.find((a) => a.action_type === actionType);
  return found ? parseFloat(found.value) || 0 : 0;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  console.log("[overview] request", { businessId, startDate, endDate });

  // Step 1: Validate businessId
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId query parameter is required." },
      { status: 400 }
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(getDemoOverview());
  }

  const resolvedStart = startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = endDate ?? toISODate(new Date());

  // Step 2: Read assigned Meta ad accounts from DB
  // Auto-run migrations if table is missing, then retry once.
  let assignedAccountIds: string[] = [];
  try {
    const row = await getProviderAccountAssignments(businessId, "meta");
    assignedAccountIds = row?.account_ids ?? [];
  } catch (firstError: unknown) {
    const msg = firstError instanceof Error ? firstError.message : String(firstError);
    console.warn("[overview] assignment read failed (first attempt)", { businessId, message: msg });

    const isMissingTable = msg.includes("does not exist") || msg.includes("relation");
    if (isMissingTable) {
      try {
        console.log("[overview] running migrations to create missing table");
        await runMigrations();
        const row = await getProviderAccountAssignments(businessId, "meta");
        assignedAccountIds = row?.account_ids ?? [];
      } catch (retryError: unknown) {
        const retryMsg =
          retryError instanceof Error ? retryError.message : String(retryError);
        console.error("[overview] assignment read failed after migration", {
          businessId,
          message: retryMsg,
        });
        // Non-fatal: continue with empty assignments
        assignedAccountIds = [];
      }
    } else {
      console.error("[overview] assignment read failed (non-table error)", {
        businessId,
        message: msg,
      });
      assignedAccountIds = [];
    }
  }

  console.log("[overview] assigned accounts", { businessId, count: assignedAccountIds.length });

  // Step 3: No assigned accounts → empty metrics (not an error)
  if (assignedAccountIds.length === 0) {
    console.log("[overview] no assigned accounts, returning empty metrics", { businessId });
    return NextResponse.json(
      buildEmptyOverview(businessId, resolvedStart, resolvedEnd, "no_accounts_assigned")
    );
  }

  // Step 4: Get Meta integration for access token
  let accessToken: string | null = null;
  try {
    const integration = await getIntegration(businessId, "meta");
    accessToken = integration?.access_token ?? null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[overview] integration read failed", { businessId, message: msg });
  }

  if (!accessToken) {
    console.log("[overview] no access token, returning empty metrics", { businessId });
    return NextResponse.json(
      buildEmptyOverview(businessId, resolvedStart, resolvedEnd, "no_access_token")
    );
  }

  // Step 5: Fetch Meta Graph API insights per account
  let totalSpend = 0;
  let totalRevenue = 0;
  let totalPurchases = 0;
  const platformEfficiency: PlatformEfficiencyRow[] = [];

  for (const accountId of assignedAccountIds) {
    try {
      const insightsUrl = new URL(
        `https://graph.facebook.com/v25.0/${accountId}/insights`
      );
      insightsUrl.searchParams.set(
        "fields",
        "spend,actions,action_values,purchase_roas"
      );
      insightsUrl.searchParams.set(
        "time_range",
        JSON.stringify({ since: resolvedStart, until: resolvedEnd })
      );
      insightsUrl.searchParams.set("access_token", accessToken);

      console.log("[overview] fetching meta insights", { businessId, accountId });
      const res = await fetch(insightsUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        console.warn("[overview] meta insights non-ok", {
          businessId,
          accountId,
          status: res.status,
          raw: raw.slice(0, 200),
        });
        continue;
      }

      const json = (await res.json()) as {
        data?: Array<{
          spend?: string;
          actions?: Array<{ action_type: string; value: string }>;
          action_values?: Array<{ action_type: string; value: string }>;
          purchase_roas?: Array<{ action_type: string; value: string }>;
        }>;
      };

      const data = json?.data?.[0];
      if (!data) {
        console.log("[overview] meta insights empty data", { businessId, accountId });
        continue;
      }

      const spend = parseFloat(data.spend ?? "0") || 0;
      const purchases = parseActionValue(data.actions, "purchase");
      // prefer action_values for revenue; fall back to spend * purchase_roas
      const revenueFromActionValues = parseActionValue(data.action_values, "purchase");
      const purchaseRoasValue = parseActionValue(
        data.purchase_roas as Array<{ action_type: string; value: string }> | undefined,
        "omni_purchase"
      );
      const revenue =
        revenueFromActionValues > 0
          ? revenueFromActionValues
          : spend * purchaseRoasValue;

      console.log("[overview] meta insights parsed", {
        businessId,
        accountId,
        spend,
        purchases,
        revenue,
      });

      totalSpend += spend;
      totalRevenue += revenue;
      totalPurchases += purchases;

      platformEfficiency.push({
        platform: "meta",
        spend,
        revenue,
        roas: spend > 0 ? revenue / spend : 0,
        purchases,
        cpa: purchases > 0 ? spend / purchases : 0,
      });
    } catch (accountError: unknown) {
      const msg = accountError instanceof Error ? accountError.message : String(accountError);
      console.warn("[overview] meta insights fetch failed for account", {
        businessId,
        accountId,
        message: msg,
      });
      // Skip this account, continue with others
    }
  }

  // Step 6: Build and return OverviewData
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const cpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const aov = totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

  // If all account fetches failed, return no_data fallback
  if (platformEfficiency.length === 0 && assignedAccountIds.length > 0) {
    console.log("[overview] all account fetches failed, returning no_data", { businessId });
    return NextResponse.json(
      buildEmptyOverview(businessId, resolvedStart, resolvedEnd, "no_data")
    );
  }

  const overview: OverviewResponse = {
    businessId,
    dateRange: { startDate: resolvedStart, endDate: resolvedEnd },
    kpis: {
      spend: round2(totalSpend),
      revenue: round2(totalRevenue),
      roas: round2(roas),
      purchases: Math.round(totalPurchases),
      cpa: round2(cpa),
      aov: round2(aov),
    },
    totals: {
      impressions: 0,
      clicks: 0,
      purchases: Math.round(totalPurchases),
      spend: round2(totalSpend),
      conversions: Math.round(totalPurchases),
      revenue: round2(totalRevenue),
      ctr: 0,
      cpm: 0,
      cpc: 0,
      cpa: round2(cpa),
      roas: round2(roas),
    },
    platformEfficiency: platformEfficiency.map((row) => ({
      ...row,
      spend: round2(row.spend),
      revenue: round2(row.revenue),
      roas: round2(row.roas),
      purchases: Math.round(row.purchases),
      cpa: round2(row.cpa),
    })),
    trends: { "7d": [], "14d": [], "30d": [], custom: [] },
  };

  console.log("[overview] response", {
    businessId,
    spend: overview.kpis.spend,
    revenue: overview.kpis.revenue,
    roas: overview.kpis.roas,
    purchases: overview.kpis.purchases,
  });

  return NextResponse.json(overview);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
