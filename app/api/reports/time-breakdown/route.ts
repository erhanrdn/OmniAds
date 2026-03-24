import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface MetaTimeRow {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  cpp?: string;
  reach?: string;
  frequency?: string;
  impressions?: string;
  clicks?: string;
  unique_clicks?: string;
  unique_ctr?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

export interface TimeBreakdownRow {
  date: string; // "YYYY-MM-DD" (date_start)
  spend: number;
  revenue: number;
  purchases: number;
  roas: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpm: number;
  cpc: number;
  reach: number;
  frequency: number;
  uniqueClicks: number;
  uniqueCtr: number;
  addToCart: number;
  initiateCheckout: number;
  leads: number;
  contentViews: number;
  landingPageViews: number;
}

export interface TimeBreakdownResponse {
  status: "ok" | "no_connection" | "no_accounts_assigned" | "error";
  rows: TimeBreakdownRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAction(arr: MetaActionValue[] | undefined, type: string): number {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) || 0 : 0;
}

function normalizeActionType(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseActionAny(arr: MetaActionValue[] | undefined, candidates: string[]): number {
  if (!Array.isArray(arr)) return 0;
  const normalized = new Set(candidates.map(normalizeActionType));
  let total = 0;
  for (const item of arr) {
    if (normalized.has(normalizeActionType(item.action_type ?? "")))
      total += parseFloat(item.value) || 0;
  }
  return total;
}

function parseNum(v: string | undefined): number {
  return v ? parseFloat(v) || 0 : 0;
}

function rowFromMeta(raw: MetaTimeRow): Omit<TimeBreakdownRow, "date"> {
  const spend = parseNum(raw.spend);
  // Try all known purchase value action_types before falling back to spend × roas
  const revenueFromValues = parseAction(raw.action_values, "purchase");
  const purchaseRoasVal = parseAction(raw.purchase_roas, "omni_purchase");
  const revenue = revenueFromValues > 0 ? revenueFromValues : spend * purchaseRoasVal;
  const roas = spend > 0 ? revenue / spend : 0;
  const purchases = parseActionAny(raw.actions, ["purchase", "omni_purchase"]);
  const clicks = parseNum(raw.clicks);
  const impressions = parseNum(raw.impressions);
  const reach = parseNum(raw.reach);

  return {
    spend,
    revenue,
    purchases,
    roas: spend > 0 ? revenue / spend : 0,
    clicks,
    impressions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    reach,
    frequency: parseNum(raw.frequency),
    uniqueClicks: parseNum(raw.unique_clicks),
    uniqueCtr: parseNum(raw.unique_ctr),
    addToCart: parseActionAny(raw.actions, [
      "add_to_cart", "omni_add_to_cart",
      "offsite_conversion_fb_pixel_add_to_cart",
      "offsite_conversion.fb_pixel_add_to_cart",
      "fb_mobile_add_to_cart",
    ]),
    initiateCheckout: parseActionAny(raw.actions, [
      "initiate_checkout", "initiated_checkout", "omni_initiated_checkout",
      "offsite_conversion_fb_pixel_initiate_checkout",
      "offsite_conversion.fb_pixel_initiate_checkout",
    ]),
    leads: parseActionAny(raw.actions, [
      "lead", "onsite_conversion_lead",
      "offsite_conversion_fb_pixel_lead",
      "offsite_conversion.fb_pixel_lead",
    ]),
    contentViews: parseActionAny(raw.actions, [
      "view_content", "omni_view_content",
      "offsite_conversion_fb_pixel_view_content",
      "offsite_conversion.fb_pixel_view_content",
    ]),
    landingPageViews: parseActionAny(raw.actions, [
      "landing_page_view", "omni_landing_page_view",
      "offsite_conversion_fb_pixel_landing_page_view",
      "offsite_conversion.fb_pixel_landing_page_view",
    ]),
  };
}

async function fetchMetaTimeBreakdown(input: {
  accountId: string;
  accessToken: string;
  since: string;
  until: string;
  timeIncrement: string; // "1" | "7" | "monthly"
}): Promise<TimeBreakdownRow[]> {
  const { accountId, accessToken, since, until, timeIncrement } = input;

  // Use level=campaign (same as campaigns endpoint) so revenue attribution matches exactly
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set(
    "fields",
    "date_start,spend,impressions,clicks,reach,frequency,unique_clicks,actions,action_values,purchase_roas"
  );
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("time_increment", timeIncrement);
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: MetaTimeRow[] };

    // Aggregate campaign rows by date (sum across campaigns per day)
    const byDate = new Map<string, TimeBreakdownRow>();
    for (const raw of json.data ?? []) {
      if (!raw.date_start) continue;
      const r = rowFromMeta(raw);
      const existing = byDate.get(raw.date_start);
      if (!existing) {
        byDate.set(raw.date_start, { date: raw.date_start, ...r });
      } else {
        const spend = existing.spend + r.spend;
        const revenue = existing.revenue + r.revenue;
        const purchases = existing.purchases + r.purchases;
        const clicks = existing.clicks + r.clicks;
        const impressions = existing.impressions + r.impressions;
        const reach = existing.reach + r.reach;
        byDate.set(raw.date_start, {
          date: raw.date_start,
          spend,
          revenue,
          purchases,
          roas: spend > 0 ? revenue / spend : 0,
          clicks,
          impressions,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          reach,
          frequency: reach > 0
            ? (existing.frequency * existing.reach + r.frequency * r.reach) / reach
            : 0,
          uniqueClicks: existing.uniqueClicks + r.uniqueClicks,
          uniqueCtr: existing.uniqueCtr + r.uniqueCtr,
          addToCart: existing.addToCart + r.addToCart,
          initiateCheckout: existing.initiateCheckout + r.initiateCheckout,
          leads: existing.leads + r.leads,
          contentViews: existing.contentViews + r.contentViews,
          landingPageViews: existing.landingPageViews + r.landingPageViews,
        });
      }
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const dimension = searchParams.get("dimension") ?? "day"; // day | week | month
  const platform = searchParams.get("platform") ?? "meta";
  const accountId = searchParams.get("accountId");

  if (!businessId || !startDate || !endDate) {
    return NextResponse.json({ status: "error", rows: [] } satisfies TimeBreakdownResponse, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (platform !== "meta") {
    return NextResponse.json({ status: "error", rows: [] } satisfies TimeBreakdownResponse);
  }

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected" || !integration.access_token) {
    return NextResponse.json({ status: "no_connection", rows: [] } satisfies TimeBreakdownResponse);
  }

  const timeIncrement = dimension === "month" ? "monthly" : dimension === "week" ? "7" : "1";

  const accountRow = await getProviderAccountAssignments(businessId, "meta").catch(() => null);
  const accountIds = accountId ? [accountId] : (accountRow?.account_ids ?? []);
  if (accountIds.length === 0) {
    return NextResponse.json({ status: "no_accounts_assigned", rows: [] } satisfies TimeBreakdownResponse);
  }

  // Fetch all accounts in parallel — each makes ONE call to Meta
  const allRows: TimeBreakdownRow[] = [];
  await Promise.all(
    accountIds.map(async (id) => {
      const rows = await fetchMetaTimeBreakdown({
        accountId: id,
        accessToken: integration.access_token!,
        since: startDate,
        until: endDate,
        timeIncrement,
      });
      allRows.push(...rows);
    })
  );

  // Aggregate by date (sum across accounts)
  const byDate = new Map<string, TimeBreakdownRow>();
  for (const row of allRows) {
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, { ...row });
    } else {
      const spend = existing.spend + row.spend;
      const revenue = existing.revenue + row.revenue;
      const purchases = existing.purchases + row.purchases;
      const clicks = existing.clicks + row.clicks;
      const impressions = existing.impressions + row.impressions;
      const reach = existing.reach + row.reach;
      byDate.set(row.date, {
        date: row.date,
        spend,
        revenue,
        purchases,
        roas: spend > 0 ? revenue / spend : 0,
        clicks,
        impressions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        reach,
        frequency: reach > 0 ? (existing.frequency * existing.reach + row.frequency * row.reach) / reach : 0,
        uniqueClicks: existing.uniqueClicks + row.uniqueClicks,
        uniqueCtr: existing.uniqueCtr + row.uniqueCtr,
        addToCart: existing.addToCart + row.addToCart,
        initiateCheckout: existing.initiateCheckout + row.initiateCheckout,
        leads: existing.leads + row.leads,
        contentViews: existing.contentViews + row.contentViews,
        landingPageViews: existing.landingPageViews + row.landingPageViews,
      });
    }
  }

  const rows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json({ status: "ok", rows } satisfies TimeBreakdownResponse);
}
