import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";
import { requireBusinessAccess } from "@/lib/access";
import {
  CreativeFormat,
  CreativePreviewState,
  normalizeCreativePreview,
  shouldLogMetaPreviewDebug,
} from "@/lib/meta-creative-preview";

type GroupBy = "adName" | "creative" | "adSet";
type FormatFilter = "all" | "image" | "video";
type SortKey = "roas" | "spend" | "ctrAll" | "purchaseValue";
type AiTagKey =
  | "assetType"
  | "visualFormat"
  | "intendedAudience"
  | "messagingAngle"
  | "seasonality"
  | "offerType"
  | "hookTactic"
  | "headlineTactic";
type MetaAiTags = Partial<Record<AiTagKey, string[]>>;

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
  impressions?: string;
  inline_link_clicks?: string;
  date_start?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
  video_play_actions?: MetaActionValue[];
  video_p25_watched_actions?: MetaActionValue[];
  video_p50_watched_actions?: MetaActionValue[];
  video_p75_watched_actions?: MetaActionValue[];
  video_p100_watched_actions?: MetaActionValue[];
}

interface MetaAccountRecord {
  id?: string;
  name?: string;
  currency?: string | null;
}

interface MetaAdRecord {
  id?: string;
  name?: string;
  adset_id?: string;
  adset?: {
    id?: string;
    name?: string;
    promoted_object?: {
      product_set_id?: string | null;
      catalog_id?: string | null;
    } | null;
  } | null;
  promoted_object?: {
    product_set_id?: string | null;
    catalog_id?: string | null;
  } | null;
  created_time?: string;
  creative?: {
    id?: string;
    name?: string;
    object_type?: string | null;
    effective_object_story_id?: string | null;
    thumbnail_url?: string | null;
    image_url?: string | null;
    object_story_spec?: {
      link_data?: {
        picture?: string | null;
        image_hash?: string | null;
        child_attachments?: Array<{ picture?: string | null; image_url?: string | null }> | null;
      } | null;
      video_data?: { image_url?: string | null; thumbnail_url?: string | null } | null;
      photo_data?: { image_url?: string | null } | null;
      template_data?: Record<string, unknown> | null;
    } | null;
    asset_feed_spec?: {
      catalog_id?: string | null;
      product_set_id?: string | null;
      images?: Array<{
        url?: string | null;
        image_url?: string | null;
        original_url?: string | null;
        hash?: string | null;
        image_hash?: string | null;
      }> | null;
      videos?: Array<{ thumbnail_url?: string | null; image_url?: string | null }> | null;
    } | null;
  } | null;
}

interface MetaAccountMeta {
  id: string;
  name: string | null;
  currency: string | null;
}

interface RawCreativeRow {
  id: string;
  creative_id: string;
  associated_ads_count: number;
  account_id: string;
  account_name: string | null;
  currency: string | null;
  adset_id: string | null;
  adset_name: string | null;
  name: string;
  preview_url: string | null;
  preview_source: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  is_catalog: boolean;
  preview_state: CreativePreviewState;
  launch_date: string;
  tags: string[];
  ai_tags: MetaAiTags;
  format: CreativeFormat;
  spend: number;
  purchase_value: number;
  roas: number;
  cpa: number;
  cpc_link: number;
  cpm: number;
  ctr_all: number;
  purchases: number;
  impressions: number;
  link_clicks: number;
  add_to_cart: number;
  thumbstop: number;
  click_to_atc: number;
  atc_to_purchase: number;
  video25: number;
  video50: number;
  video75: number;
  video100: number;
}

export interface MetaCreativeApiRow {
  id: string;
  creative_id: string;
  associated_ads_count: number;
  account_id: string;
  account_name: string | null;
  currency: string | null;
  name: string;
  preview_url: string | null;
  preview_source: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  is_catalog: boolean;
  /** "catalog" | "preview" | "unavailable" — use this to drive UI rendering */
  preview_state: CreativePreviewState;
  launch_date: string;
  tags: string[];
  ai_tags: MetaAiTags;
  format: CreativeFormat;
  spend: number;
  purchase_value: number;
  roas: number;
  cpa: number;
  cpc_link: number;
  cpm: number;
  ctr_all: number;
  purchases: number;
  impressions: number;
  link_clicks: number;
  add_to_cart: number;
  thumbstop: number;
  click_to_atc: number;
  atc_to_purchase: number;
  video25: number;
  video50: number;
  video75: number;
  video100: number;
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


function cleanDate(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

const AI_TAG_LABEL_TO_KEY: Record<string, AiTagKey> = {
  "asset type": "assetType",
  "visual format": "visualFormat",
  "intended audience": "intendedAudience",
  "messaging angle": "messagingAngle",
  seasonality: "seasonality",
  "offer type": "offerType",
  "hook tactic": "hookTactic",
  "headline tactic": "headlineTactic",
};

function normalizeAiTags(rawTags: string[] | undefined): MetaAiTags {
  if (!Array.isArray(rawTags) || rawTags.length === 0) return {};

  const next: MetaAiTags = {};
  for (const rawTag of rawTags) {
    if (typeof rawTag !== "string") continue;
    const trimmed = rawTag.trim();
    if (!trimmed) continue;

    const separator = trimmed.includes(":") ? ":" : trimmed.includes("=") ? "=" : null;
    if (!separator) continue;
    const [rawLabel, rawValue] = trimmed.split(separator, 2);
    const key = AI_TAG_LABEL_TO_KEY[rawLabel.trim().toLowerCase()];
    const value = rawValue?.trim();
    if (!key || !value) continue;
    const existing = next[key] ?? [];
    if (!existing.includes(value)) existing.push(value);
    next[key] = existing;
  }

  return next;
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
  if (shouldLogMetaPreviewDebug()) {
    console.log("[meta-creatives] insights query", {
      account_id: accountId,
      time_range: { since: startDate, until: endDate },
      level: "ad",
      fields: "ad_id,ad_name,adset_id,adset_name,spend,cpm,cpc,ctr,date_start,actions,action_values,purchase_roas",
    });
  }

  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
  url.searchParams.set(
    "fields",
    "ad_id,ad_name,adset_id,adset_name,spend,cpm,cpc,ctr,impressions,inline_link_clicks,date_start,actions,action_values,purchase_roas,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions"
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
  if (shouldLogMetaPreviewDebug()) {
    console.log("[meta-creatives] insights response", {
      account_id: accountId,
      rows: payload?.data?.length ?? 0,
    });
  }
  return payload?.data ?? [];
}

async function fetchAccountMeta(
  accountId: string,
  accessToken: string
): Promise<MetaAccountMeta> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}`);
  url.searchParams.set("fields", "id,name,currency");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    return { id: accountId, name: null, currency: null };
  }

  const payload = (await res.json().catch(() => null)) as MetaAccountRecord | null;
  return {
    id: payload?.id ?? accountId,
    name: payload?.name ?? null,
    currency: typeof payload?.currency === "string" ? payload.currency : null,
  };
}

async function fetchAccountAdsMap(
  accountId: string,
  accessToken: string
): Promise<Map<string, MetaAdRecord>> {
  const map = new Map<string, MetaAdRecord>();
  let nextUrl: string | null = null;

  do {
    const url = nextUrl ? new URL(nextUrl) : new URL(`https://graph.facebook.com/v25.0/${accountId}/ads`);
    if (!nextUrl) {
      url.searchParams.set(
        "fields",
        [
          "id",
          "name",
          "adset_id",
          "adset{id,name,promoted_object{product_set_id,catalog_id}}",
          "promoted_object{product_set_id,catalog_id}",
          "created_time",
          [
            "creative{",
            "id,name,object_type,effective_object_story_id,thumbnail_url,image_url,",
            "object_story_spec{link_data{picture,image_hash,child_attachments{picture,image_url}},video_data{image_url,thumbnail_url},photo_data{image_url},template_data},",
            "asset_feed_spec{catalog_id,product_set_id,images{url,image_url,original_url,hash,image_hash},videos{thumbnail_url,image_url}}",
            "}",
          ].join(""),
        ].join(",")
      );
      url.searchParams.set("limit", "500");
      url.searchParams.set(
        "effective_status",
        JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED", "PENDING_REVIEW", "DISAPPROVED"])
      );
      url.searchParams.set("access_token", accessToken);
    }

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
      return map;
    }

    const payload = (await res.json().catch(() => null)) as
      | { data?: MetaAdRecord[]; paging?: { next?: string } }
      | null;

    for (const ad of payload?.data ?? []) {
      if (typeof ad.id === "string") {
        map.set(ad.id, ad);
      }
    }

    nextUrl = payload?.paging?.next ?? null;
  } while (nextUrl);

  return map;
}

/**
 * Batch-fetch ads by their IDs using the `?ids=` endpoint.
 * Used as a fallback when fetchAccountAdsMap misses ads that appear in insights.
 */
async function batchFetchAdsByIds(
  adIds: string[],
  accessToken: string
): Promise<Map<string, MetaAdRecord>> {
  const map = new Map<string, MetaAdRecord>();
  const uniqueIds = Array.from(new Set(adIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) return map;

  const fields = [
    "id",
    "name",
    "adset_id",
    "adset{id,name,promoted_object{product_set_id,catalog_id}}",
    "promoted_object{product_set_id,catalog_id}",
    "created_time",
    [
      "creative{",
      "id,name,object_type,effective_object_story_id,thumbnail_url,image_url,",
      "object_story_spec{link_data{picture,image_hash,child_attachments{picture,image_url}},video_data{image_url,thumbnail_url},photo_data{image_url},template_data},",
      "asset_feed_spec{catalog_id,product_set_id,images{url,image_url,original_url,hash,image_hash},videos{thumbnail_url,image_url}}",
      "}",
    ].join(""),
  ].join(",");

  const chunkSize = 40;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const idsChunk = uniqueIds.slice(i, i + chunkSize);
    const url = new URL("https://graph.facebook.com/v25.0/");
    url.searchParams.set("ids", idsChunk.join(","));
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", accessToken);

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn("[meta-creatives] batchFetchAdsByIds non-ok", {
          status: res.status,
          chunk: i,
          count: idsChunk.length,
        });
        continue;
      }
      const payload = (await res.json().catch(() => null)) as Record<string, MetaAdRecord> | null;
      if (!payload || typeof payload !== "object") continue;

      for (const [adId, ad] of Object.entries(payload)) {
        if (!ad || typeof ad !== "object") continue;
        map.set(adId, { ...ad, id: ad.id ?? adId });
      }
    } catch (e: unknown) {
      console.warn("[meta-creatives] batchFetchAdsByIds threw", {
        chunk: i,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return map;
}

async function fetchCreativeDetailsMap(
  creativeIds: string[],
  accessToken: string
): Promise<Map<string, NonNullable<MetaAdRecord["creative"]>>> {
  const map = new Map<string, NonNullable<MetaAdRecord["creative"]>>();
  const uniqueIds = Array.from(new Set(creativeIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) return map;

  const fields = [
    "id",
    "name",
    "object_type",
    "effective_object_story_id",
    "thumbnail_url",
    "image_url",
    "object_story_spec{link_data{picture,image_hash,child_attachments{picture,image_url}},video_data{image_url,thumbnail_url},photo_data{image_url},template_data}",
    "asset_feed_spec{catalog_id,product_set_id,images{url,image_url,original_url,hash,image_hash},videos{thumbnail_url,image_url}}",
  ].join(",");

  const chunkSize = 40;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const idsChunk = uniqueIds.slice(i, i + chunkSize);
    const url = new URL("https://graph.facebook.com/v25.0/");
    url.searchParams.set("ids", idsChunk.join(","));
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", accessToken);

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        console.warn("[meta-creatives] creative details non-ok", {
          status: res.status,
          chunk: i,
          count: idsChunk.length,
          raw: raw.slice(0, 300),
        });
        continue;
      }

      const payload = (await res.json().catch(() => null)) as Record<string, MetaAdRecord["creative"]> | null;
      if (!payload || typeof payload !== "object") continue;

      for (const [creativeId, creative] of Object.entries(payload)) {
        if (!creative || typeof creative !== "object") continue;
        map.set(creativeId, creative as NonNullable<MetaAdRecord["creative"]>);
      }
    } catch (e: unknown) {
      console.warn("[meta-creatives] creative details threw", {
        chunk: i,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return map;
}

function toRawRow(
  insight: MetaInsightRecord,
  ad: MetaAdRecord | undefined,
  accountMeta: MetaAccountMeta
): RawCreativeRow | null {
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

  const impressions = parseFloat(insight.impressions ?? "0") || 0;
  const inlineLinkClicks = parseFloat(insight.inline_link_clicks ?? "0") || 0;
  const effectiveLinkClicks = linkClicks || inlineLinkClicks;
  const addToCart = Math.round(
    parseAction(insight.actions, "omni_add_to_cart") ||
    parseAction(insight.actions, "add_to_cart") ||
    parseAction(insight.actions, "fb_mobile_add_to_cart")
  );
  const video3sViews = parseFloat(insight.video_play_actions?.[0]?.value ?? "0") || 0;
  const video25Views = parseFloat(insight.video_p25_watched_actions?.[0]?.value ?? "0") || 0;
  const video50Views = parseFloat(insight.video_p50_watched_actions?.[0]?.value ?? "0") || 0;
  const video75Views = parseFloat(insight.video_p75_watched_actions?.[0]?.value ?? "0") || 0;
  const video100Views = parseFloat(insight.video_p100_watched_actions?.[0]?.value ?? "0") || 0;

  const thumbstop = impressions > 0 ? r2((video3sViews / impressions) * 100) : 0;
  const clickToAtc = effectiveLinkClicks > 0 ? r2((addToCart / effectiveLinkClicks) * 100) : 0;
  const atcToPurchase = addToCart > 0 ? r2((purchases / addToCart) * 100) : 0;
  const video25Rate = impressions > 0 ? r2((video25Views / impressions) * 100) : 0;
  const video50Rate = impressions > 0 ? r2((video50Views / impressions) * 100) : 0;
  const video75Rate = impressions > 0 ? r2((video75Views / impressions) * 100) : 0;
  const video100Rate = impressions > 0 ? r2((video100Views / impressions) * 100) : 0;

  const creative = ad?.creative ?? null;
  const promotedObject = ad?.promoted_object ?? ad?.adset?.promoted_object ?? null;
  const normalizedPreview = normalizeCreativePreview({ creative, promotedObject });
  // Use insight video signals as a secondary signal: if Meta reports any video
  // watch events but the creative payload lacks explicit video fields, treat as video.
  const hasInsightVideoSignals = video3sViews > 0 || video25Views > 0 || video50Views > 0 || video75Views > 0 || video100Views > 0;
  const format =
    normalizedPreview.format === "catalog"
      ? "catalog"
      : normalizedPreview.format === "video" || hasInsightVideoSignals
      ? "video"
      : "image" as const;

  const launchDate = cleanDate(ad?.created_time) || cleanDate(insight.date_start) || toISODate(new Date());
  const name = insight.ad_name ?? ad?.name ?? creative?.name ?? "Unnamed ad";
  const creativeId = creative?.id ?? adId;

  if (shouldLogMetaPreviewDebug()) {
    console.log("[meta-creatives] preview normalization", {
      creative_id: creativeId,
      name,
      account_id: accountMeta.id,
      currency: accountMeta.currency,
      has_thumbnail_url: normalizedPreview.debug.has_thumbnail_url,
      has_image_url: normalizedPreview.debug.has_image_url,
      has_object_story_spec: normalizedPreview.debug.has_object_story_spec,
      has_asset_feed_spec: normalizedPreview.debug.has_asset_feed_spec,
      has_link_data_picture: normalizedPreview.debug.has_link_data_picture,
      has_link_data_image_hash: normalizedPreview.debug.has_link_data_image_hash,
      has_video_data_thumbnail_url: normalizedPreview.debug.has_video_data_thumbnail_url,
      has_asset_feed_images: normalizedPreview.debug.has_asset_feed_images,
      has_asset_feed_videos: normalizedPreview.debug.has_asset_feed_videos,
      has_promoted_product_set_id: normalizedPreview.debug.has_promoted_product_set_id,
      final_preview_state: normalizedPreview.preview_state,
      final_preview_url: normalizedPreview.preview_url,
      final_preview_source: normalizedPreview.preview_source,
      selected_source: normalizedPreview.debug.source,
    });
  }

  return {
    id: adId,
    creative_id: creativeId,
    associated_ads_count: 1,
    account_id: accountMeta.id,
    account_name: accountMeta.name,
    currency: accountMeta.currency,
    adset_id: insight.adset_id ?? ad?.adset_id ?? ad?.adset?.id ?? null,
    adset_name: insight.adset_name ?? ad?.adset?.name ?? null,
    name,
    preview_url: normalizedPreview.preview_url,
    preview_source: normalizedPreview.preview_source,
    thumbnail_url: normalizedPreview.thumbnail_url,
    image_url: normalizedPreview.image_url,
    is_catalog: normalizedPreview.is_catalog,
    preview_state: normalizedPreview.preview_state,
    launch_date: launchDate,
    tags: [],
    ai_tags: {},
    format,
    spend: r2(spend),
    purchase_value: r2(derivedPurchaseValue),
    roas: r2(derivedPurchaseValue > 0 ? derivedPurchaseValue / spend : 0),
    cpa: r2(cpa),
    cpc_link: r2(cpcLink),
    cpm: r2(cpm),
    ctr_all: r2(ctrAll),
    purchases,
    impressions,
    link_clicks: effectiveLinkClicks,
    add_to_cart: addToCart,
    thumbstop,
    click_to_atc: clickToAtc,
    atc_to_purchase: atcToPurchase,
    video25: video25Rate,
    video50: video50Rate,
    video75: video75Rate,
    video100: video100Rate,
  };
}

function groupRows(
  rows: RawCreativeRow[],
  groupBy: GroupBy,
  creativeUsageMap: Map<string, Set<string>>
): RawCreativeRow[] {
  if (groupBy === "adName") {
    return rows.map((row) => ({
      ...row,
      associated_ads_count: creativeUsageMap.get(row.creative_id)?.size ?? row.associated_ads_count ?? 1,
    }));
  }

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
    const impressions = list.reduce((acc, item) => acc + item.impressions, 0);
    const linkClicks = list.reduce((acc, item) => acc + item.link_clicks, 0);
    const addToCart = list.reduce((acc, item) => acc + item.add_to_cart, 0);
    const video3sViews = list.reduce((acc, item) => acc + (impressions > 0 ? (item.thumbstop / 100) * item.impressions : 0), 0);
    const video25Views = list.reduce((acc, item) => acc + (item.impressions > 0 ? (item.video25 / 100) * item.impressions : 0), 0);
    const video50Views = list.reduce((acc, item) => acc + (item.impressions > 0 ? (item.video50 / 100) * item.impressions : 0), 0);
    const video75Views = list.reduce((acc, item) => acc + (item.impressions > 0 ? (item.video75 / 100) * item.impressions : 0), 0);
    const video100Views = list.reduce((acc, item) => acc + (item.impressions > 0 ? (item.video100 / 100) * item.impressions : 0), 0);
    const weightedCtr = spend > 0 ? list.reduce((acc, item) => acc + item.ctr_all * item.spend, 0) / spend : 0;
    const weightedCpm = spend > 0 ? list.reduce((acc, item) => acc + item.cpm * item.spend, 0) / spend : 0;
    const weightedCpc = spend > 0 ? list.reduce((acc, item) => acc + item.cpc_link * item.spend, 0) / spend : 0;
    const earliestLaunch = [...list]
      .map((item) => item.launch_date)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0];
    const sample = list[0];
    const uniqueCurrencies = Array.from(new Set(list.map((item) => item.currency).filter(Boolean)));
    if (uniqueCurrencies.length > 1 && shouldLogMetaPreviewDebug()) {
      console.log("[meta-creatives] mixed currencies in grouped row", {
        groupBy,
        groupKey: key,
        currencies: uniqueCurrencies,
      });
    }
    const groupedPreviewUrl = list.find((item) => item.preview_url)?.preview_url ?? null;
    const groupedIsCatalog = list.every((item) => item.is_catalog);
    const groupedPreviewState: CreativePreviewState = groupedIsCatalog
      ? "catalog"
      : groupedPreviewUrl
      ? "preview"
      : "unavailable";

    grouped.push({
      id: groupBy === "creative" ? `creative_${key}` : `adset_${key}`,
      creative_id: sample.creative_id,
      associated_ads_count: creativeUsageMap.get(sample.creative_id)?.size ?? 1,
      account_id: sample.account_id,
      account_name: sample.account_name,
      currency: sample.currency,
      adset_id: sample.adset_id,
      adset_name: sample.adset_name,
      name: groupBy === "creative" ? sample.name : sample.adset_name ?? sample.name,
      preview_url: groupedPreviewUrl,
      preview_source: list.find((item) => item.preview_source)?.preview_source ?? null,
      thumbnail_url: list.find((item) => item.thumbnail_url)?.thumbnail_url ?? null,
      image_url: list.find((item) => item.image_url)?.image_url ?? null,
      is_catalog: groupedIsCatalog,
      preview_state: groupedPreviewState,
      launch_date: earliestLaunch ?? sample.launch_date,
      tags: [],
      ai_tags: list.reduce<MetaAiTags>((acc, item) => {
        for (const [rawKey, values] of Object.entries(item.ai_tags)) {
          const key = rawKey as AiTagKey;
          if (!Array.isArray(values) || values.length === 0) continue;
          const merged = new Set([...(acc[key] ?? []), ...values]);
          acc[key] = Array.from(merged);
        }
        return acc;
      }, {}),
      format: list.some((item) => item.format === "catalog")
        ? "catalog"
        : list.some((item) => item.format === "video")
        ? "video"
        : "image",
      spend: r2(spend),
      purchase_value: r2(purchaseValue),
      roas: r2(spend > 0 ? purchaseValue / spend : 0),
      cpa: r2(purchases > 0 ? spend / purchases : 0),
      cpc_link: r2(weightedCpc),
      cpm: r2(weightedCpm),
      ctr_all: r2(weightedCtr),
      purchases,
      impressions,
      link_clicks: linkClicks,
      add_to_cart: addToCart,
      thumbstop: impressions > 0 ? r2((video3sViews / impressions) * 100) : 0,
      click_to_atc: linkClicks > 0 ? r2((addToCart / linkClicks) * 100) : 0,
      atc_to_purchase: addToCart > 0 ? r2((purchases / addToCart) * 100) : 0,
      video25: impressions > 0 ? r2((video25Views / impressions) * 100) : 0,
      video50: impressions > 0 ? r2((video50Views / impressions) * 100) : 0,
      video75: impressions > 0 ? r2((video75Views / impressions) * 100) : 0,
      video100: impressions > 0 ? r2((video100Views / impressions) * 100) : 0,
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
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

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
      const [insights, adMap, accountMeta] = await Promise.all([
        fetchAccountInsights(accountId, integration.access_token, start, end),
        fetchAccountAdsMap(accountId, integration.access_token),
        fetchAccountMeta(accountId, integration.access_token),
      ]);

      // ── Fallback: batch-fetch any ads missing from the adMap ──────────────
      const insightAdIds = insights
        .map((item) => item.ad_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      const missingAdIds = insightAdIds.filter((id) => !adMap.has(id));

      if (missingAdIds.length > 0) {
        console.log("[meta-creatives] adMap miss — batch-fetching missing ads", {
          account_id: accountId,
          insights_count: insightAdIds.length,
          adMap_size: adMap.size,
          missing: missingAdIds.length,
        });
        const fallbackAds = await batchFetchAdsByIds(missingAdIds, integration.access_token);
        for (const [id, ad] of fallbackAds) {
          adMap.set(id, ad);
        }
      }

      // ── Fetch creative details for all creative IDs found ─────────────────
      const creativeIds = Array.from(
        new Set(
          [...adMap.values()]
            .map((ad) => ad.creative?.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      );
      const creativeDetailsMap = await fetchCreativeDetailsMap(creativeIds, integration.access_token);

      // Always log coverage in non-production for diagnostics
      if (process.env.NODE_ENV !== "production") {
        const matchedAds = insightAdIds.filter((id) => adMap.has(id)).length;
        const withCreative = insightAdIds.filter((id) => {
          const ad = adMap.get(id);
          return ad?.creative?.thumbnail_url || ad?.creative?.image_url || ad?.creative?.object_story_spec;
        }).length;
        console.log("[meta-creatives] account coverage", {
          account_id: accountMeta.id,
          account_name: accountMeta.name,
          currency: accountMeta.currency,
          insights: insights.length,
          ads_loaded: adMap.size,
          creative_ids_seen: creativeIds.length,
          creative_details_loaded: creativeDetailsMap.size,
          matched_ads: matchedAds,
          with_creative_data: withCreative,
          fallback_fetched: missingAdIds.length > 0 ? missingAdIds.length : 0,
        });
      }

      let debugSamplesLogged = 0;
      for (const insight of insights) {
        const ad = insight.ad_id ? adMap.get(insight.ad_id) : undefined;
        // Merge creative details — prefer non-null values from either source
        const baseCreative = ad?.creative ?? null;
        const detailCreative = baseCreative?.id ? creativeDetailsMap.get(baseCreative.id) : undefined;
        const mergedCreative: MetaAdRecord["creative"] = baseCreative
          ? {
              ...baseCreative,
              ...(detailCreative ?? {}),
              // Preserve non-null URL fields from either source (don't overwrite valid with null)
              thumbnail_url: detailCreative?.thumbnail_url ?? baseCreative.thumbnail_url ?? null,
              image_url: detailCreative?.image_url ?? baseCreative.image_url ?? null,
              object_story_spec: detailCreative?.object_story_spec ?? baseCreative.object_story_spec ?? null,
              asset_feed_spec: detailCreative?.asset_feed_spec ?? baseCreative.asset_feed_spec ?? null,
            }
          : detailCreative ?? null;
        const enrichedAd: MetaAdRecord | undefined = ad
          ? { ...ad, creative: mergedCreative }
          : undefined;
        const row = toRawRow(
          insight,
          enrichedAd,
          accountMeta
        );
        if (row) {
          rawRows.push(row);
          if (process.env.NODE_ENV !== "production" && debugSamplesLogged < 3) {
            debugSamplesLogged += 1;
            console.log("[meta-creatives] preview sample", {
              ad_id: row.id,
              ad_name: row.name,
              creative_id: row.creative_id,
              ad_found_in_map: Boolean(ad),
              creative_from_ad: Boolean(baseCreative),
              creative_from_details: Boolean(detailCreative),
              merged_thumbnail_url: mergedCreative?.thumbnail_url?.slice(0, 80) ?? null,
              merged_image_url: mergedCreative?.image_url?.slice(0, 80) ?? null,
              has_object_story_spec: Boolean(mergedCreative?.object_story_spec),
              has_video_data: Boolean(mergedCreative?.object_story_spec?.video_data),
              has_link_data_picture: Boolean(mergedCreative?.object_story_spec?.link_data?.picture),
              has_asset_feed_spec: Boolean(mergedCreative?.asset_feed_spec),
              final_preview_url: row.preview_url?.slice(0, 80) ?? null,
              final_preview_source: row.preview_source,
              final_preview_state: row.preview_state,
              final_format: row.format,
            });
          }
        }
      }
    } catch (error: unknown) {
      console.warn("[meta-creatives] account fetch failed", {
        businessId,
        accountId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const scopedRows = format === "all" ? rawRows : rawRows.filter((row) => row.format === format);
  const creativeUsageMap = scopedRows.reduce<Map<string, Set<string>>>((acc, row) => {
    const existing = acc.get(row.creative_id) ?? new Set<string>();
    existing.add(row.id);
    acc.set(row.creative_id, existing);
    return acc;
  }, new Map<string, Set<string>>());

  let rows = groupRows(scopedRows, groupBy, creativeUsageMap);
  rows = sortRows(rows, sort);

  if (rows.length === 0) {
    return NextResponse.json({ status: "no_data", rows: [] });
  }

  const responseRows: MetaCreativeApiRow[] = rows.map((row) => {
    const previewState: CreativePreviewState = row.is_catalog
      ? "catalog"
      : row.preview_url
      ? "preview"
      : row.preview_state;

    return {
      id: row.id,
      creative_id: row.creative_id,
      associated_ads_count: row.associated_ads_count,
      account_id: row.account_id,
      account_name: row.account_name,
      currency: row.currency,
      name: row.name,
      preview_url: row.preview_url,
      preview_source: row.preview_source,
      thumbnail_url: row.thumbnail_url,
      image_url: row.image_url,
      is_catalog: row.is_catalog,
      preview_state: previewState,
      launch_date: row.launch_date,
      tags: row.tags,
      ai_tags: Object.keys(row.ai_tags).length > 0 ? row.ai_tags : normalizeAiTags(row.tags),
      format: row.format,
      spend: row.spend,
      purchase_value: row.purchase_value,
      roas: row.roas,
      cpa: row.cpa,
      cpc_link: row.cpc_link,
      cpm: row.cpm,
      ctr_all: row.ctr_all,
      purchases: row.purchases,
      impressions: row.impressions,
      link_clicks: row.link_clicks,
      add_to_cart: row.add_to_cart,
      thumbstop: row.thumbstop,
      click_to_atc: row.click_to_atc,
      atc_to_purchase: row.atc_to_purchase,
      video25: row.video25,
      video50: row.video50,
      video75: row.video75,
      video100: row.video100,
    };
  });

  if (process.env.NODE_ENV !== "production") {
    const withPreview = responseRows.filter((r) => r.preview_url).length;
    const withThumb = responseRows.filter((r) => r.thumbnail_url).length;
    const withImage = responseRows.filter((r) => r.image_url).length;
    console.log("[meta-creatives] preview summary", {
      total: responseRows.length,
      preview_url_set: withPreview,
      thumbnail_url_set: withThumb,
      image_url_set: withImage,
      state_counts: {
        preview: responseRows.filter((r) => r.preview_state === "preview").length,
        catalog: responseRows.filter((r) => r.preview_state === "catalog").length,
        unavailable: responseRows.filter((r) => r.preview_state === "unavailable").length,
      },
      samples: responseRows.slice(0, 3).map((r) => ({
        id: r.id,
        name: r.name.slice(0, 40),
        preview_state: r.preview_state,
        preview_url: r.preview_url ? r.preview_url.slice(0, 80) : null,
        preview_source: r.preview_source,
        thumbnail_url: r.thumbnail_url ? r.thumbnail_url.slice(0, 80) : null,
        image_url: r.image_url ? r.image_url.slice(0, 80) : null,
        is_catalog: r.is_catalog,
      })),
    });
  }

  return NextResponse.json({ status: "ok", rows: responseRows });
}
