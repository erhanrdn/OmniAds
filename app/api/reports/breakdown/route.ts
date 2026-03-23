import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import type { CustomReportBreakdown } from "@/lib/custom-reports";

export interface ReportBreakdownRow {
  key: string;
  label: string;
  value: number;
}

export interface ReportBreakdownResponse {
  status: "ok" | "no_connection" | "no_accounts_assigned" | "unsupported";
  rows: ReportBreakdownRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface MetaBreakdownInsightRow {
  age?: string;
  gender?: string;
  country?: string;
  region?: string;
  spend?: string;
  clicks?: string;
  impressions?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  reach?: string;
  frequency?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

function parseAction(arr: MetaActionValue[] | undefined, type: string): number {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) || 0 : 0;
}

function parseNum(v: string | undefined): number {
  return v ? parseFloat(v) || 0 : 0;
}

function metaBreakdownParam(breakdown: CustomReportBreakdown): string {
  if (breakdown === "age") return "age";
  if (breakdown === "gender") return "gender";
  if (breakdown === "country") return "country";
  if (breakdown === "region") return "region";
  return "";
}

function extractDimKey(row: MetaBreakdownInsightRow, breakdown: CustomReportBreakdown): { key: string; label: string } {
  if (breakdown === "age") return { key: row.age ?? "unknown", label: row.age ?? "Unknown" };
  if (breakdown === "gender") {
    const g = row.gender ?? "unknown";
    const label = g === "male" ? "Male" : g === "female" ? "Female" : g;
    return { key: g, label };
  }
  if (breakdown === "country") return { key: row.country ?? "unknown", label: row.country ?? "Unknown" };
  if (breakdown === "region") return { key: row.region ?? "unknown", label: row.region ?? "Unknown" };
  return { key: "unknown", label: "Unknown" };
}

function extractMetricValue(row: MetaBreakdownInsightRow, metricKey: string): number {
  // Strip platform prefix (e.g. "meta.spend" → "spend")
  const key = metricKey.includes(".") ? metricKey.split(".").pop()! : metricKey;

  switch (key) {
    case "spend": return parseNum(row.spend);
    case "clicks": return parseNum(row.clicks);
    case "impressions": return parseNum(row.impressions);
    case "ctr": return parseNum(row.ctr);
    case "cpm": return parseNum(row.cpm);
    case "cpc": return parseNum(row.cpc);
    case "reach": return parseNum(row.reach);
    case "frequency": return parseNum(row.frequency);
    case "revenue":
    case "purchases_value": {
      const rv = parseAction(row.action_values, "purchase");
      const roas = parseAction(row.purchase_roas, "omni_purchase");
      const spend = parseNum(row.spend);
      return rv > 0 ? rv : spend * roas;
    }
    case "purchases": return parseAction(row.actions, "purchase");
    case "roas": {
      const rv = parseAction(row.action_values, "purchase");
      const roas = parseAction(row.purchase_roas, "omni_purchase");
      const spend = parseNum(row.spend);
      const revenue = rv > 0 ? rv : spend * roas;
      return spend > 0 ? revenue / spend : 0;
    }
    case "addToCart": return parseAction(row.actions, "add_to_cart");
    case "initiateCheckout": return parseAction(row.actions, "initiate_checkout");
    case "leads": return parseAction(row.actions, "lead");
    case "contentViews": return parseAction(row.actions, "view_content");
    case "registrationsCompleted": return parseAction(row.actions, "complete_registration");
    case "searches": return parseAction(row.actions, "search");
    case "addPaymentInfo": return parseAction(row.actions, "add_payment_info");
    case "appInstalls": return parseAction(row.actions, "app_install");
    case "videoViews3s": return parseAction(row.actions, "video_view");
    case "postEngagement": return parseAction(row.actions, "post_engagement");
    case "postReactions": return parseAction(row.actions, "post_reaction");
    case "postComments": return parseAction(row.actions, "comment");
    case "postShares": return parseAction(row.actions, "post");
    default: return parseNum(row.spend);
  }
}

async function fetchMetaDimensionBreakdown(input: {
  accountId: string;
  accessToken: string;
  since: string;
  until: string;
  breakdown: CustomReportBreakdown;
}): Promise<MetaBreakdownInsightRow[]> {
  const { accountId, accessToken, since, until, breakdown } = input;
  const breakdownParam = metaBreakdownParam(breakdown);
  if (!breakdownParam) return [];

  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
  url.searchParams.set("level", "adset");
  url.searchParams.set("breakdowns", breakdownParam);
  url.searchParams.set(
    "fields",
    "spend,clicks,impressions,ctr,cpm,cpc,reach,frequency,actions,action_values,purchase_roas"
  );
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: MetaBreakdownInsightRow[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const platform = searchParams.get("platform") ?? "meta";
  const breakdown = (searchParams.get("breakdown") ?? "age") as CustomReportBreakdown;
  const metricKey = searchParams.get("metricKey") ?? "spend";
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  const isDimension = breakdown === "age" || breakdown === "gender" || breakdown === "country" || breakdown === "region";
  if (!isDimension) {
    return NextResponse.json({ status: "unsupported", rows: [] } satisfies ReportBreakdownResponse);
  }

  if (platform !== "meta") {
    return NextResponse.json({ status: "unsupported", rows: [] } satisfies ReportBreakdownResponse);
  }

  // Meta dimension breakdown
  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected" || !integration.access_token) {
    return NextResponse.json({ status: "no_connection", rows: [] } satisfies ReportBreakdownResponse);
  }

  const accountRow = await getProviderAccountAssignments(businessId, "meta").catch(() => null);
  const accountIds = accountRow?.account_ids ?? [];
  if (accountIds.length === 0) {
    return NextResponse.json({ status: "no_accounts_assigned", rows: [] } satisfies ReportBreakdownResponse);
  }

  const since = startDate ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const until = endDate ?? new Date().toISOString().slice(0, 10);

  const allRows: MetaBreakdownInsightRow[] = [];
  await Promise.all(
    accountIds.map(async (accountId) => {
      const rows = await fetchMetaDimensionBreakdown({
        accountId,
        accessToken: integration.access_token!,
        since,
        until,
        breakdown,
      });
      allRows.push(...rows);
    })
  );

  // Aggregate by dimension key
  const map = new Map<string, { label: string; value: number }>();
  for (const row of allRows) {
    const { key, label } = extractDimKey(row, breakdown);
    const value = extractMetricValue(row, metricKey);
    const existing = map.get(key);
    if (existing) {
      existing.value += value;
    } else {
      map.set(key, { label, value });
    }
  }

  const rows: ReportBreakdownRow[] = Array.from(map.entries())
    .map(([key, { label, value }]) => ({ key, label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  return NextResponse.json({ status: "ok", rows } satisfies ReportBreakdownResponse);
}
