import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoMetaCampaigns } from "@/lib/demo-business";
import {
  getCachedRouteReport,
  setCachedRouteReport,
} from "@/lib/route-report-cache";

// ── Meta API types ────────────────────────────────────────────────────────────

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface MetaCampaignInsightRecord {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  ctr?: string;
  cpm?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

interface MetaCampaignRecord {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
}

// ── Public response shape ─────────────────────────────────────────────────────

export interface MetaCampaignRow {
  id: string;
  name: string;
  status: string;
  spend: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  impressions: number;
  clicks: number;
  currency: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAction(arr: MetaActionValue[] | undefined, type: string): number {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) || 0 : 0;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function fetchAssignedAccountIds(businessId: string): Promise<string[]> {
  try {
    const row = await getProviderAccountAssignments(businessId, "meta");
    return row?.account_ids ?? [];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("does not exist") || msg.includes("relation")) {
      try {
        await runMigrations();
        const row = await getProviderAccountAssignments(businessId, "meta");
        return row?.account_ids ?? [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

async function fetchAccountCurrency(
  accountId: string,
  accessToken: string
): Promise<string> {
  try {
    const url = new URL(`https://graph.facebook.com/v25.0/${accountId}`);
    url.searchParams.set("fields", "currency");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return "USD";
    const json = (await res.json()) as { currency?: string };
    return json.currency ?? "USD";
  } catch {
    return "USD";
  }
}

async function fetchCampaignStatuses(
  accountId: string,
  accessToken: string
): Promise<Map<string, string>> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/campaigns`);
  url.searchParams.set("fields", "id,name,effective_status,status");
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return new Map();
    const json = (await res.json()) as { data?: MetaCampaignRecord[] };
    const map = new Map<string, string>();
    for (const c of json.data ?? []) {
      map.set(c.id, c.effective_status ?? c.status ?? "UNKNOWN");
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchCampaignInsights(
  accountId: string,
  since: string,
  until: string,
  accessToken: string
): Promise<MetaCampaignInsightRecord[]> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set(
    "fields",
    "campaign_id,campaign_name,spend,ctr,cpm,impressions,clicks,actions,action_values,purchase_roas"
  );
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      console.warn("[meta-campaigns] insights non-ok", { accountId, status: res.status, raw: raw.slice(0, 300) });
      return [];
    }
    const json = (await res.json()) as { data?: MetaCampaignInsightRecord[] };
    return json.data ?? [];
  } catch (e: unknown) {
    console.warn("[meta-campaigns] insights fetch threw", { accountId, message: String(e) });
    return [];
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  console.log("[meta-campaigns] request", { businessId, startDate, endDate });

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 }
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoMetaCampaigns());
  }

  const cached = await getCachedRouteReport<{ rows: MetaCampaignRow[] }>({
    businessId,
    provider: "meta",
    reportType: "meta_campaigns_list",
    searchParams,
  });
  if (cached) {
    return NextResponse.json(cached);
  }

  const resolvedStart = startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = endDate ?? toISODate(new Date());

  // Step 1: Assigned accounts
  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  console.log("[meta-campaigns] assigned accounts", { businessId, count: assignedAccountIds.length });

  if (assignedAccountIds.length === 0) {
    return NextResponse.json({ status: "no_accounts_assigned", rows: [] });
  }

  // Step 2: Access token
  const integration = await getIntegration(businessId, "meta").catch(() => null);
  const accessToken = integration?.access_token ?? null;

  if (!accessToken) {
    return NextResponse.json({ status: "no_access_token", rows: [] });
  }

  // Step 3: Fetch insights + campaign statuses per account
  const allRows: MetaCampaignRow[] = [];

  for (const accountId of assignedAccountIds) {
    try {
      const [statusMap, insights, currency] = await Promise.all([
        fetchCampaignStatuses(accountId, accessToken),
        fetchCampaignInsights(accountId, resolvedStart, resolvedEnd, accessToken),
        fetchAccountCurrency(accountId, accessToken),
      ]);

      for (const insight of insights) {
        const spend = parseFloat(insight.spend ?? "0") || 0;
        const purchases = parseAction(insight.actions, "purchase");
        const revenueFromValues = parseAction(insight.action_values, "purchase");
        const purchaseRoasVal = parseAction(insight.purchase_roas, "omni_purchase");
        const revenue = revenueFromValues > 0 ? revenueFromValues : spend * purchaseRoasVal;
        const roas = spend > 0 ? revenue / spend : 0;
        const cpa = purchases > 0 ? spend / purchases : 0;
        const ctr = parseFloat(insight.ctr ?? "0") || 0;
        const cpm = parseFloat(insight.cpm ?? "0") || 0;
        const impressions = parseInt(insight.impressions ?? "0", 10) || 0;
        const clicks = parseInt(insight.clicks ?? "0", 10) || 0;
        const campaignId = insight.campaign_id ?? "";

        allRows.push({
          id: campaignId,
          name: insight.campaign_name ?? "Unknown Campaign",
          status: statusMap.get(campaignId) ?? "UNKNOWN",
          spend: r2(spend),
          purchases: Math.round(purchases),
          revenue: r2(revenue),
          roas: r2(roas),
          cpa: r2(cpa),
          ctr: r2(ctr),
          cpm: r2(cpm),
          impressions,
          clicks,
          currency,
        });
      }
    } catch (e: unknown) {
      console.warn("[meta-campaigns] account processing failed", {
        businessId,
        accountId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Sort by spend descending
  allRows.sort((a, b) => b.spend - a.spend);

  console.log("[meta-campaigns] response", { businessId, rowCount: allRows.length });
  const payload = { rows: allRows };
  await setCachedRouteReport({
    businessId,
    provider: "meta",
    reportType: "meta_campaigns_list",
    searchParams,
    payload,
  });
  return NextResponse.json(payload);
}
