import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";

// ── Meta API types ────────────────────────────────────────────────────────────

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface MetaAdInsightRecord {
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  ctr?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

// ── Public response shape ─────────────────────────────────────────────────────

export interface MetaCreativeRow {
  creative_id: string;
  name: string;
  preview_url: string | null;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  purchases: number;
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

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "6", 10), 20);

  console.log("[meta-top-creatives] request", { businessId, startDate, endDate, limit });

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 }
    );
  }

  const resolvedStart = startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = endDate ?? toISODate(new Date());

  // Step 1: Assigned accounts
  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  console.log("[meta-top-creatives] assigned accounts", {
    businessId,
    count: assignedAccountIds.length,
  });

  if (assignedAccountIds.length === 0) {
    return NextResponse.json({ status: "no_accounts_assigned", rows: [] });
  }

  // Step 2: Access token
  const integration = await getIntegration(businessId, "meta").catch(() => null);
  const accessToken = integration?.access_token ?? null;

  if (!accessToken) {
    return NextResponse.json({ status: "no_access_token", rows: [] });
  }

  // Step 3: Fetch ad-level insights per account
  const allRows: MetaCreativeRow[] = [];

  for (const accountId of assignedAccountIds) {
    try {
      const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
      url.searchParams.set("level", "ad");
      url.searchParams.set(
        "fields",
        "ad_id,ad_name,spend,ctr,actions,action_values,purchase_roas"
      );
      url.searchParams.set("time_range", JSON.stringify({ since: resolvedStart, until: resolvedEnd }));
      url.searchParams.set("sort", "spend_descending");
      url.searchParams.set("limit", "50");
      url.searchParams.set("access_token", accessToken);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        console.warn("[meta-top-creatives] insights non-ok", {
          accountId,
          status: res.status,
          raw: raw.slice(0, 300),
        });
        continue;
      }

      const json = (await res.json()) as { data?: MetaAdInsightRecord[] };
      const data = json.data ?? [];

      for (const insight of data) {
        const spend = parseFloat(insight.spend ?? "0") || 0;
        if (spend === 0) continue;

        const purchases = parseAction(insight.actions, "purchase");
        const revenueFromValues = parseAction(insight.action_values, "purchase");
        const purchaseRoasVal = parseAction(insight.purchase_roas, "omni_purchase");
        const revenue = revenueFromValues > 0 ? revenueFromValues : spend * purchaseRoasVal;
        const roas = spend > 0 ? revenue / spend : 0;
        const ctr = parseFloat(insight.ctr ?? "0") || 0;

        allRows.push({
          creative_id: insight.ad_id ?? "",
          name: insight.ad_name ?? "Unknown Ad",
          preview_url: null, // Fetching thumbnails requires an additional API call per ad
          spend: r2(spend),
          revenue: r2(revenue),
          roas: r2(roas),
          ctr: r2(ctr),
          purchases: Math.round(purchases),
        });
      }
    } catch (e: unknown) {
      console.warn("[meta-top-creatives] account processing failed", {
        businessId,
        accountId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Sort by ROAS desc, then spend desc; return top N
  allRows.sort((a, b) => b.roas - a.roas || b.spend - a.spend);
  const rows = allRows.slice(0, limit);

  console.log("[meta-top-creatives] response", { businessId, rowCount: rows.length });
  return NextResponse.json({ rows });
}
