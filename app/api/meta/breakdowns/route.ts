import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";
import {
  getCachedRouteReport,
  setCachedRouteReport,
} from "@/lib/route-report-cache";

type BreakdownType = "age" | "country" | "placement" | "adset" | "campaign";

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface BreakdownInsightRow {
  age?: string;
  country?: string;
  publisher_platform?: string;
  platform_position?: string;
  impression_device?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  clicks?: string;
  impressions?: string;
  cpm?: string;
  ctr?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

interface AggregatedBreakdownRow {
  key: string;
  label: string;
  spend: number;
  purchases: number;
  revenue: number;
  clicks: number;
  impressions: number;
}

export interface MetaBreakdownsResponse {
  status?:
    | "ok"
    | "no_access_token"
    | "no_connection"
    | "no_accounts_assigned";
  age: AggregatedBreakdownRow[];
  location: AggregatedBreakdownRow[];
  placement: AggregatedBreakdownRow[];
  budget: {
    campaign: Array<{ key: string; label: string; spend: number }>;
    adset: Array<{ key: string; label: string; spend: number }>;
  };
  audience: {
    available: boolean;
    reason?: string;
  };
  products: {
    available: boolean;
    reason?: string;
  };
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function parseAction(arr: MetaActionValue[] | undefined, type: string): number {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) || 0 : 0;
}

function parseNum(input: string | undefined): number {
  return input ? parseFloat(input) || 0 : 0;
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

function breakdownParam(type: BreakdownType): { level: "ad" | "adset" | "campaign"; breakdowns?: string } {
  if (type === "age") return { level: "adset", breakdowns: "age" };
  if (type === "country") return { level: "adset", breakdowns: "country" };
  if (type === "placement") return { level: "adset", breakdowns: "publisher_platform,platform_position,impression_device" };
  if (type === "adset") return { level: "adset" };
  return { level: "campaign" };
}

async function fetchBreakdownInsights(input: {
  accountId: string;
  accessToken: string;
  since: string;
  until: string;
  type: BreakdownType;
}): Promise<BreakdownInsightRow[]> {
  const { accountId, accessToken, since, until, type } = input;
  const cfg = breakdownParam(type);
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
  url.searchParams.set("level", cfg.level);
  if (cfg.breakdowns) url.searchParams.set("breakdowns", cfg.breakdowns);
  url.searchParams.set(
    "fields",
    [
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "spend",
      "clicks",
      "impressions",
      "ctr",
      "cpm",
      "actions",
      "action_values",
      "purchase_roas",
    ].join(",")
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
    const json = (await res.json()) as { data?: BreakdownInsightRow[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

function aggregateRows(rows: BreakdownInsightRow[], type: BreakdownType): AggregatedBreakdownRow[] {
  const map = new Map<string, AggregatedBreakdownRow>();
  for (const row of rows) {
    let key = "unknown";
    let label = "Unknown";
    if (type === "age") {
      key = row.age ?? "unknown";
      label = row.age ?? "Unknown";
    } else if (type === "country") {
      key = row.country ?? "unknown";
      label = row.country ?? "Unknown";
    } else if (type === "placement") {
      const p = row.publisher_platform ?? "unknown";
      const pos = row.platform_position ?? "unknown";
      const device = row.impression_device ?? "unknown";
      key = `${p}|${pos}|${device}`;
      label = [p, pos, device].filter(Boolean).join(" • ");
    } else if (type === "adset") {
      key = row.adset_id ?? row.adset_name ?? "unknown";
      label = row.adset_name ?? "Unknown ad set";
    } else if (type === "campaign") {
      key = row.campaign_id ?? row.campaign_name ?? "unknown";
      label = row.campaign_name ?? "Unknown campaign";
    }

    const spend = parseNum(row.spend);
    const purchases = parseAction(row.actions, "purchase");
    const revenueFromValues = parseAction(row.action_values, "purchase");
    const purchaseRoas = parseAction(row.purchase_roas, "omni_purchase");
    const revenue = revenueFromValues > 0 ? revenueFromValues : spend * purchaseRoas;
    const clicks = parseNum(row.clicks);
    const impressions = parseNum(row.impressions);

    const existing = map.get(key);
    if (existing) {
      existing.spend += spend;
      existing.purchases += purchases;
      existing.revenue += revenue;
      existing.clicks += clicks;
      existing.impressions += impressions;
    } else {
      map.set(key, {
        key,
        label,
        spend,
        purchases,
        revenue,
        clicks,
        impressions,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const startDate = searchParams.get("startDate") ?? toISODate(nDaysAgo(29));
  const endDate = searchParams.get("endDate") ?? toISODate(new Date());

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const cached = await getCachedRouteReport<MetaBreakdownsResponse>({
    businessId: businessId!,
    provider: "meta",
    reportType: "meta_breakdown",
    searchParams,
  });
  if (cached) {
    return NextResponse.json(cached);
  }

  const integration = await getIntegration(businessId!, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    const payload = {
      status: "no_connection",
      age: [],
      location: [],
      placement: [],
      budget: { campaign: [], adset: [] },
      audience: { available: false, reason: "Audience type classification unavailable." },
      products: { available: false, reason: "Catalog product breakdown unavailable for current setup." },
    } satisfies MetaBreakdownsResponse;
    await setCachedRouteReport({
      businessId: businessId!,
      provider: "meta",
      reportType: "meta_breakdown",
      searchParams,
      payload,
    });
    return NextResponse.json(payload);
  }
  if (!integration.access_token) {
    const payload = {
      status: "no_access_token",
      age: [],
      location: [],
      placement: [],
      budget: { campaign: [], adset: [] },
      audience: { available: false, reason: "Audience type classification unavailable." },
      products: { available: false, reason: "Catalog product breakdown unavailable for current setup." },
    } satisfies MetaBreakdownsResponse;
    await setCachedRouteReport({
      businessId: businessId!,
      provider: "meta",
      reportType: "meta_breakdown",
      searchParams,
      payload,
    });
    return NextResponse.json(payload);
  }

  const assignedAccountIds = await fetchAssignedAccountIds(businessId!);
  if (assignedAccountIds.length === 0) {
    const payload = {
      status: "no_accounts_assigned",
      age: [],
      location: [],
      placement: [],
      budget: { campaign: [], adset: [] },
      audience: { available: false, reason: "Audience type classification unavailable." },
      products: { available: false, reason: "Catalog product breakdown unavailable for current setup." },
    } satisfies MetaBreakdownsResponse;
    await setCachedRouteReport({
      businessId: businessId!,
      provider: "meta",
      reportType: "meta_breakdown",
      searchParams,
      payload,
    });
    return NextResponse.json(payload);
  }

  const ageRows: BreakdownInsightRow[] = [];
  const countryRows: BreakdownInsightRow[] = [];
  const placementRows: BreakdownInsightRow[] = [];
  const adsetRows: BreakdownInsightRow[] = [];
  const campaignRows: BreakdownInsightRow[] = [];

  await Promise.all(
    assignedAccountIds.map(async (accountId) => {
      const [age, country, placement, adset, campaign] = await Promise.all([
        fetchBreakdownInsights({
          accountId,
          accessToken: integration.access_token!,
          since: startDate,
          until: endDate,
          type: "age",
        }),
        fetchBreakdownInsights({
          accountId,
          accessToken: integration.access_token!,
          since: startDate,
          until: endDate,
          type: "country",
        }),
        fetchBreakdownInsights({
          accountId,
          accessToken: integration.access_token!,
          since: startDate,
          until: endDate,
          type: "placement",
        }),
        fetchBreakdownInsights({
          accountId,
          accessToken: integration.access_token!,
          since: startDate,
          until: endDate,
          type: "adset",
        }),
        fetchBreakdownInsights({
          accountId,
          accessToken: integration.access_token!,
          since: startDate,
          until: endDate,
          type: "campaign",
        }),
      ]);
      ageRows.push(...age);
      countryRows.push(...country);
      placementRows.push(...placement);
      adsetRows.push(...adset);
      campaignRows.push(...campaign);
    })
  );

  const ageAgg = aggregateRows(ageRows, "age");
  const countryAgg = aggregateRows(countryRows, "country");
  const placementAgg = aggregateRows(placementRows, "placement");
  const adsetAgg = aggregateRows(adsetRows, "adset").map((row) => ({
    key: row.key,
    label: row.label,
    spend: row.spend,
  }));
  const campaignAgg = aggregateRows(campaignRows, "campaign").map((row) => ({
    key: row.key,
    label: row.label,
    spend: row.spend,
  }));

  const payload = {
    status: "ok",
    age: ageAgg,
    location: countryAgg,
    placement: placementAgg,
    budget: {
      campaign: campaignAgg,
      adset: adsetAgg,
    },
    audience: {
      available: false,
      reason:
        "Audience Performance unavailable: no reliable audience-type dimension from current Meta account setup.",
    },
    products: {
      available: false,
      reason:
        "Top Products unavailable: product-level catalog breakdown is not available from current Meta insights endpoint/tokens.",
    },
  } satisfies MetaBreakdownsResponse;
  await setCachedRouteReport({
    businessId: businessId!,
    provider: "meta",
    reportType: "meta_breakdown",
    searchParams,
    payload,
  });
  return NextResponse.json(payload);
}
