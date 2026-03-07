import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";

type GroupBy = "adName" | "creative" | "adSet";
type FormatFilter = "all" | "image" | "video";
type SortKey = "roas" | "spend" | "ctrAll" | "purchaseValue";

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface MetaInsightRecord {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  spend?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  date_start?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

interface MetaAdRecord {
  id?: string;
  name?: string;
  adset_id?: string;
  adset?: { id?: string; name?: string } | null;
  created_time?: string;
  creative?: {
    id?: string;
    name?: string;
    object_type?: string | null;
    thumbnail_url?: string | null;
    image_url?: string | null;
  } | null;
}

interface RawCreativeRow {
  id: string;
  creative_id: string;
  adset_id: string | null;
  adset_name: string | null;
  name: string;
  preview_url: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  is_catalog: boolean;
  launch_date: string;
  tags: string[];
  format: "image" | "video";
  spend: number;
  purchase_value: number;
  roas: number;
  cpa: number;
  cpc_link: number;
  cpm: number;
  ctr_all: number;
  purchases: number;
}

export interface MetaCreativeApiRow {
  id: string;
  creative_id: string;
  name: string;
  preview_url: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  is_catalog: boolean;
  launch_date: string;
  tags: string[];
  format: "image" | "video";
  spend: number;
  purchase_value: number;
  roas: number;
  cpa: number;
  cpc_link: number;
  cpm: number;
  ctr_all: number;
  purchases: number;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nDaysAgo(n: number) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseAction(arr: MetaActionValue[] | undefined, type: string): number {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((item) => item.action_type === type);
  return found ? parseFloat(found.value) || 0 : 0;
}

function parsePurchaseCount(actions: MetaActionValue[] | undefined): number {
  return parseAction(actions, "purchase") || parseAction(actions, "omni_purchase");
}

function parsePurchaseValue(values: MetaActionValue[] | undefined): number {
  return parseAction(values, "purchase") || parseAction(values, "omni_purchase");
}

function parsePurchaseRoas(roas: MetaActionValue[] | undefined): number {
  return parseAction(roas, "purchase") || parseAction(roas, "omni_purchase");
}

function inferFormat(objectType: string | null | undefined): "image" | "video" {
  if (!objectType) return "image";
  if (objectType.toUpperCase() === "VIDEO") return "video";
  return "image";
}

function cleanDate(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

async function fetchAssignedAccountIds(businessId: string): Promise<string[]> {
  try {
    const row = await getProviderAccountAssignments(businessId, "meta");
    return row?.account_ids ?? [];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not exist") || message.includes("relation")) {
      await runMigrations().catch(() => null);
      const row = await getProviderAccountAssignments(businessId, "meta").catch(() => null);
      return row?.account_ids ?? [];
    }
    return [];
  }
}

async function fetchAccountInsights(
  accountId: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<MetaInsightRecord[]> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
  url.searchParams.set(
    "fields",
    "ad_id,ad_name,adset_id,adset_name,spend,cpm,cpc,ctr,date_start,actions,action_values,purchase_roas"
  );
  url.searchParams.set("level", "ad");
  url.searchParams.set("time_range", JSON.stringify({ since: startDate, until: endDate }));
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    console.warn("[meta-creatives] insights non-ok", {
      accountId,
      status: res.status,
      raw: raw.slice(0, 300),
    });
    return [];
  }

  const payload = (await res.json().catch(() => null)) as { data?: MetaInsightRecord[] } | null;
  return payload?.data ?? [];
}

async function fetchAccountAdsMap(
  accountId: string,
  accessToken: string
): Promise<Map<string, MetaAdRecord>> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/ads`);
  url.searchParams.set(
    "fields",
    "id,name,adset_id,adset{id,name},created_time,creative{id,name,object_type,thumbnail_url,image_url}"
  );
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    console.warn("[meta-creatives] ads non-ok", {
      accountId,
      status: res.status,
      raw: raw.slice(0, 300),
    });
    return new Map();
  }

  const payload = (await res.json().catch(() => null)) as { data?: MetaAdRecord[] } | null;
  const map = new Map<string, MetaAdRecord>();
  for (const ad of payload?.data ?? []) {
    if (typeof ad.id === "string") {
      map.set(ad.id, ad);
    }
  }
  return map;
}

function toRawRow(insight: MetaInsightRecord, ad: MetaAdRecord | undefined): RawCreativeRow | null {
  const adId = insight.ad_id ?? ad?.id ?? "";
  if (!adId) return null;

  const spend = parseFloat(insight.spend ?? "0") || 0;
  if (spend <= 0) return null;

  const purchases = Math.round(parsePurchaseCount(insight.actions));
  const purchaseValue = parsePurchaseValue(insight.action_values);
  const purchaseRoas = parsePurchaseRoas(insight.purchase_roas);
  const derivedPurchaseValue = purchaseValue > 0 ? purchaseValue : spend * purchaseRoas;
  const cpa = purchases > 0 ? spend / purchases : 0;

  const linkClicks = parseAction(insight.actions, "link_click");
  const cpcFromInsight = parseFloat(insight.cpc ?? "0") || 0;
  const cpcLink = linkClicks > 0 ? spend / linkClicks : cpcFromInsight;
  const cpm = parseFloat(insight.cpm ?? "0") || 0;
  const ctrAll = parseFloat(insight.ctr ?? "0") || 0;

  const creative = ad?.creative ?? null;
  const isCatalog = creative?.object_type?.toUpperCase() === "DYNAMIC";
  const imageUrl = creative?.image_url ?? null;
  const thumbnailUrl = creative?.thumbnail_url ?? null;
  const previewUrl = imageUrl ?? thumbnailUrl;
  const format = inferFormat(creative?.object_type);

  const launchDate = cleanDate(ad?.created_time) || cleanDate(insight.date_start) || toISODate(new Date());
  const name = insight.ad_name ?? ad?.name ?? creative?.name ?? "Unnamed ad";
  const creativeId = creative?.id ?? adId;

  return {
    id: adId,
    creative_id: creativeId,
    adset_id: insight.adset_id ?? ad?.adset_id ?? ad?.adset?.id ?? null,
    adset_name: insight.adset_name ?? ad?.adset?.name ?? null,
    name,
    preview_url: isCatalog ? null : previewUrl,
    thumbnail_url: thumbnailUrl,
    image_url: imageUrl,
    is_catalog: isCatalog,
    launch_date: launchDate,
    tags: [],
    format,
    spend: r2(spend),
    purchase_value: r2(derivedPurchaseValue),
    roas: r2(derivedPurchaseValue > 0 ? derivedPurchaseValue / spend : 0),
    cpa: r2(cpa),
    cpc_link: r2(cpcLink),
    cpm: r2(cpm),
    ctr_all: r2(ctrAll),
    purchases,
  };
}

function groupRows(rows: RawCreativeRow[], groupBy: GroupBy): RawCreativeRow[] {
  if (groupBy === "adName") return rows;

  const map = new Map<string, RawCreativeRow[]>();
  for (const row of rows) {
    const key = groupBy === "creative" ? row.creative_id : row.adset_id ?? `adset:${row.id}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  const grouped: RawCreativeRow[] = [];
  for (const [key, list] of map.entries()) {
    const spend = list.reduce((acc, item) => acc + item.spend, 0);
    const purchaseValue = list.reduce((acc, item) => acc + item.purchase_value, 0);
    const purchases = list.reduce((acc, item) => acc + item.purchases, 0);
    const weightedCtr = spend > 0 ? list.reduce((acc, item) => acc + item.ctr_all * item.spend, 0) / spend : 0;
    const weightedCpm = spend > 0 ? list.reduce((acc, item) => acc + item.cpm * item.spend, 0) / spend : 0;
    const weightedCpc = spend > 0 ? list.reduce((acc, item) => acc + item.cpc_link * item.spend, 0) / spend : 0;
    const earliestLaunch = [...list]
      .map((item) => item.launch_date)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0];
    const sample = list[0];

    grouped.push({
      id: groupBy === "creative" ? `creative_${key}` : `adset_${key}`,
      creative_id: sample.creative_id,
      adset_id: sample.adset_id,
      adset_name: sample.adset_name,
      name: groupBy === "creative" ? sample.name : sample.adset_name ?? sample.name,
      preview_url: list.find((item) => item.preview_url)?.preview_url ?? null,
      thumbnail_url: list.find((item) => item.thumbnail_url)?.thumbnail_url ?? null,
      image_url: list.find((item) => item.image_url)?.image_url ?? null,
      is_catalog: list.every((item) => item.is_catalog),
      launch_date: earliestLaunch ?? sample.launch_date,
      tags: [],
      format: list.some((item) => item.format === "video") ? "video" : "image",
      spend: r2(spend),
      purchase_value: r2(purchaseValue),
      roas: r2(spend > 0 ? purchaseValue / spend : 0),
      cpa: r2(purchases > 0 ? spend / purchases : 0),
      cpc_link: r2(weightedCpc),
      cpm: r2(weightedCpm),
      ctr_all: r2(weightedCtr),
      purchases,
    });
  }

  return grouped;
}

function sortRows(rows: RawCreativeRow[], sort: SortKey): RawCreativeRow[] {
  const keyMap: Record<SortKey, keyof RawCreativeRow> = {
    roas: "roas",
    spend: "spend",
    ctrAll: "ctr_all",
    purchaseValue: "purchase_value",
  };
  const key = keyMap[sort];
  return [...rows].sort((a, b) => Number(b[key]) - Number(a[key]));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const businessId = params.get("businessId");
  const groupBy = (params.get("groupBy") as GroupBy | null) ?? "adName";
  const format = (params.get("format") as FormatFilter | null) ?? "all";
  const sort = (params.get("sort") as SortKey | null) ?? "roas";
  const start = params.get("start") ?? toISODate(nDaysAgo(29));
  const end = params.get("end") ?? toISODate(new Date());

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 }
    );
  }

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return NextResponse.json({ status: "no_connection", rows: [] });
  }

  if (!integration.access_token) {
    return NextResponse.json({ status: "no_access_token", rows: [] });
  }

  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  if (assignedAccountIds.length === 0) {
    return NextResponse.json({ status: "no_accounts_assigned", rows: [] });
  }

  const rawRows: RawCreativeRow[] = [];
  for (const accountId of assignedAccountIds) {
    try {
      const [insights, adMap] = await Promise.all([
        fetchAccountInsights(accountId, integration.access_token, start, end),
        fetchAccountAdsMap(accountId, integration.access_token),
      ]);

      for (const insight of insights) {
        const row = toRawRow(insight, insight.ad_id ? adMap.get(insight.ad_id) : undefined);
        if (row) rawRows.push(row);
      }
    } catch (error: unknown) {
      console.warn("[meta-creatives] account fetch failed", {
        businessId,
        accountId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let rows = groupRows(rawRows, groupBy);
  if (format !== "all") {
    rows = rows.filter((row) => row.format === format);
  }
  rows = sortRows(rows, sort);

  if (rows.length === 0) {
    return NextResponse.json({ status: "no_data", rows: [] });
  }

  const responseRows: MetaCreativeApiRow[] = rows.map((row) => ({
    id: row.id,
    creative_id: row.creative_id,
    name: row.name,
    preview_url: row.preview_url,
    thumbnail_url: row.thumbnail_url,
    image_url: row.image_url,
    is_catalog: row.is_catalog,
    launch_date: row.launch_date,
    tags: row.tags,
    format: row.format,
    spend: row.spend,
    purchase_value: row.purchase_value,
    roas: row.roas,
    cpa: row.cpa,
    cpc_link: row.cpc_link,
    cpm: row.cpm,
    ctr_all: row.ctr_all,
    purchases: row.purchases,
  }));

  return NextResponse.json({ status: "ok", rows: responseRows });
}
