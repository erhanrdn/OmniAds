import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";
import { requireBusinessAccess } from "@/lib/access";
import { MediaCacheService } from "@/lib/media-cache/media-service";
import { getDemoMetaCreatives, isDemoBusinessId } from "@/lib/demo-business";

type GroupBy = "adName" | "creative" | "adSet";
type FormatFilter = "all" | "image" | "video";
type SortKey = "roas" | "spend" | "ctrAll" | "purchaseValue";
type CreativeFormat = "image" | "video" | "catalog";
type CreativeType = "feed" | "video" | "flexible" | "feed_catalog";
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
type LegacyPreviewState = "preview" | "catalog" | "unavailable";
type PreviewRenderMode = "video" | "image" | "unavailable";
type NormalizedPreviewSource =
  | "preview_url"
  | "thumbnail_url"
  | "image_url"
  | "image_hash"
  | null;
interface NormalizedRenderPreviewPayload {
  render_mode: PreviewRenderMode;
  image_url: string | null;
  video_url: string | null;
  poster_url: string | null;
  source: NormalizedPreviewSource;
  is_catalog: boolean;
}

interface UrlValidationResult {
  isValid: boolean;
  method: "HEAD" | "GET" | "none";
  status: number | null;
  finalUrl: string | null;
  contentType: string | null;
  contentLength: string | null;
  error: string | null;
}

interface PreviewAuditCandidate {
  source: string;
  url: string;
  validation: UrlValidationResult;
}

interface PreviewAuditSample {
  account_id: string;
  ad_id: string;
  creative_id: string | null;
  creative_name: string;
  creative_object_type: string | null;
  direct: {
    thumbnail_url: string | null;
    image_url: string | null;
    image_hash: string | null;
  };
  object_story_spec: {
    video_data_video_id: string | null;
    video_data_thumbnail_url: string | null;
    video_data_image_url: string | null;
    photo_data_image_url: string | null;
    link_data_picture: string | null;
    link_data_image_hash: string | null;
    link_data_child_attachments: Array<{ picture: string | null; image_url: string | null; image_hash: string | null }>;
  };
  asset_feed_spec: {
    catalog_id: string | null;
    product_set_id: string | null;
    images: Array<{ image_url: string | null; url: string | null; original_url: string | null; hash: string | null }>;
    videos: Array<{ video_id: string | null; thumbnail_url: string | null; image_url: string | null }>;
  };
  promoted_object: {
    promoted_product_set_id: string | null;
    promoted_catalog_id: string | null;
    adset_promoted_product_set_id: string | null;
    adset_promoted_catalog_id: string | null;
  };
  image_hash_lookup: Array<{ hash: string; resolved: boolean; resolved_url: string | null }>;
  candidates: PreviewAuditCandidate[];
  chosen_preview_source: string | null;
  chosen_preview_url: string | null;
  chosen_render_mode: PreviewRenderMode;
  is_catalog: boolean;
  format: CreativeFormat;
}

type MetaPromotedObjectLike = {
  product_set_id?: string | null;
  catalog_id?: string | null;
} | null;

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface MetaInsightRecord {
  ad_id?: string;
  ad_name?: string;
  campaign_id?: string;
  campaign_name?: string;
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

interface MetaAdImageRecord {
  hash?: string;
  url?: string | null;
  url_128?: string | null;
  url_256?: string | null;
  permalink_url?: string | null;
}

interface MetaAdRecord {
  id?: string;
  name?: string;
  object_story_id?: string | null;
  effective_object_story_id?: string | null;
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
    body?: string | null;
    title?: string | null;
    text?: string | null;
    message?: string | null;
    description?: string | null;
    object_type?: string | null;
    video_id?: string | null;
    object_story_id?: string | null;
    effective_object_story_id?: string | null;
    thumbnail_id?: string | null;
    thumbnail_url?: string | null;
    image_url?: string | null;
    image_hash?: string | null;
    object_story_spec?: {
      link_data?: {
        message?: string | null;
        name?: string | null;
        description?: string | null;
        picture?: string | null;
        image_hash?: string | null;
        child_attachments?: Array<{ picture?: string | null; image_url?: string | null; image_hash?: string | null }> | null;
      } | null;
      video_data?: { video_id?: string | null; image_url?: string | null; thumbnail_url?: string | null; message?: string | null; title?: string | null } | null;
      photo_data?: { image_url?: string | null; message?: string | null; caption?: string | null } | null;
      template_data?: Record<string, unknown> | null;
    } | null;
    asset_feed_spec?: {
      catalog_id?: string | null;
      product_set_id?: string | null;
      bodies?: Array<{ text?: string | null }> | null;
      titles?: Array<{ text?: string | null }> | null;
      descriptions?: Array<{ text?: string | null }> | null;
      images?: Array<{
        url?: string | null;
        image_url?: string | null;
        original_url?: string | null;
        hash?: string | null;
        image_hash?: string | null;
      }> | null;
      videos?: Array<{ video_id?: string | null; thumbnail_url?: string | null; image_url?: string | null }> | null;
    } | null;
  } | null;
}

interface MetaAdCreativeMediaOnlyRecord {
  id?: string;
  creative?: MetaAdRecord["creative"];
}

interface MetaAccountMeta {
  id: string;
  name: string | null;
  currency: string | null;
}

interface MetaCreativePreviewHtmlResponse {
  data?: Array<{ body?: string | null }>;
}

interface RawCreativeRow {
  id: string;
  creative_id: string;
  object_story_id?: string | null;
  effective_object_story_id?: string | null;
  post_id?: string | null;
  associated_ads_count: number;
  account_id: string;
  account_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  currency: string | null;
  adset_id: string | null;
  adset_name: string | null;
  name: string;
  copy_text: string | null;
  copy_variants: string[];
  headline_variants: string[];
  description_variants: string[];
  copy_source: CopySourceLabel | null;
  copy_debug_sources?: string[];
  unresolved_reason?: string | null;
  preview_url: string | null;
  preview_source: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  table_thumbnail_url?: string | null;
  card_preview_url?: string | null;
  is_catalog: boolean;
  preview_state: LegacyPreviewState;
  preview: NormalizedRenderPreviewPayload;
  launch_date: string;
  tags: string[];
  ai_tags: MetaAiTags;
  format: CreativeFormat;
  creative_type: CreativeType;
  creative_type_label: string;
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
  debug_stage_fetch_source?: string | null;
  debug_stage_has_raw_ad?: boolean;
  debug_stage_raw_ad_id?: string | null;
  debug_stage_raw_ad_creative?: boolean;
  debug_stage_raw_ad_creative_thumbnail_url?: string | null;
  debug_stage_enriched_ad_creative?: boolean;
  debug_stage_enriched_ad_creative_thumbnail_url?: string | null;
  debug_stage_row_input_thumbnail_url?: string | null;
  debug_stage_final_thumbnail_url?: string | null;
  debug_stage_null_reason?: string | null;
  debug_raw_creative_thumbnail_url?: string | null;
  debug_enriched_creative_thumbnail_url?: string | null;
  debug_resolved_thumbnail_source?: string | null;
  debug_resolution_stage?: string | null;
  debug_creative_object_type?: string | null;
  debug_creative_video_ids?: string[] | null;
  debug_creative_effective_object_story_id?: string | null;
  debug_creative_object_story_id?: string | null;
  debug_creative_object_story_video_id?: string | null;
  debug_creative_asset_video_ids?: string[] | null;
}

export interface MetaCreativeApiRow {
  id: string;
  creative_id: string;
  object_story_id?: string | null;
  effective_object_story_id?: string | null;
  post_id?: string | null;
  associated_ads_count: number;
  account_id: string;
  account_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  currency: string | null;
  name: string;
  copy_text?: string | null;
  copy_variants?: string[];
  headline_variants?: string[];
  description_variants?: string[];
  copy_source?: CopySourceLabel | null;
  copy_debug_sources?: string[];
  unresolved_reason?: string | null;
  preview_url: string | null;
  preview_source: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  table_thumbnail_url?: string | null;
  card_preview_url?: string | null;
  is_catalog: boolean;
  /** "catalog" | "preview" | "unavailable" — use this to drive UI rendering */
  preview_state: LegacyPreviewState;
  preview: NormalizedRenderPreviewPayload;
  launch_date: string;
  tags: string[];
  ai_tags: MetaAiTags;
  format: CreativeFormat;
  creative_type: CreativeType;
  creative_type_label: string;
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
  /** Internal cached URL. Prefer over thumbnail_url/image_url when available. */
  cached_thumbnail_url?: string | null;
  debug_stage_fetch_source?: string | null;
  debug_stage_has_raw_ad?: boolean;
  debug_stage_raw_ad_id?: string | null;
  debug_stage_raw_ad_creative?: boolean;
  debug_stage_raw_ad_creative_thumbnail_url?: string | null;
  debug_stage_enriched_ad_creative?: boolean;
  debug_stage_enriched_ad_creative_thumbnail_url?: string | null;
  debug_stage_row_input_thumbnail_url?: string | null;
  debug_stage_final_thumbnail_url?: string | null;
  debug_stage_null_reason?: string | null;
  debug_raw_creative_thumbnail_url?: string | null;
  debug_enriched_creative_thumbnail_url?: string | null;
  debug_resolved_thumbnail_source?: string | null;
  debug_resolution_stage?: string | null;
  debug_creative_object_type?: string | null;
  debug_creative_video_ids?: string[] | null;
  debug_creative_effective_object_story_id?: string | null;
  debug_creative_object_story_id?: string | null;
  debug_creative_object_story_video_id?: string | null;
  debug_creative_asset_video_ids?: string[] | null;
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

/** Deterministic short hash for composite grouping keys (not cryptographic). */
function simpleHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
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

function normalizeCopyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return null;
  if (normalized.length < 2) return null;
  return normalized;
}

type CopySourceLabel =
  | "asset_feed_spec.bodies"
  | "asset_feed_spec.titles"
  | "asset_feed_spec.descriptions"
  | "object_story_spec.message"
  | "object_story_spec.name"
  | "object_story_spec.description"
  | "creative.body"
  | "creative.title"
  | "creative.description"
  | "story_lookup"
  | "preview_html";

type CopyExtraction = {
  copy_text: string | null;
  copy_variants: string[];
  headline_variants: string[];
  description_variants: string[];
  copy_source: CopySourceLabel | null;
};

type StoryCopyPayload = {
  message: string[];
  headline: string[];
  description: string[];
};

function uniqueNormalizedText(values: Array<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeCopyText(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function chooseBestCopyText(extraction: Pick<CopyExtraction, "copy_variants" | "headline_variants" | "description_variants">) {
  if (extraction.copy_variants.length > 0) return extraction.copy_variants[0];
  if (extraction.headline_variants.length > 0) return extraction.headline_variants[0];
  if (extraction.description_variants.length > 0) return extraction.description_variants[0];
  return null;
}

function resolveCreativeCopyExtraction(creative: MetaAdRecord["creative"]): CopyExtraction {
  if (!creative) {
    return {
      copy_text: null,
      copy_variants: [],
      headline_variants: [],
      description_variants: [],
      copy_source: null,
    };
  }

  const assetFeedBodies = uniqueNormalizedText((creative.asset_feed_spec?.bodies ?? []).map((item) => item?.text));
  const assetFeedTitles = uniqueNormalizedText((creative.asset_feed_spec?.titles ?? []).map((item) => item?.text));
  const assetFeedDescriptions = uniqueNormalizedText((creative.asset_feed_spec?.descriptions ?? []).map((item) => item?.text));

  const objectMessages = uniqueNormalizedText([
    creative.object_story_spec?.link_data?.message,
    creative.object_story_spec?.video_data?.message,
    creative.object_story_spec?.photo_data?.message,
  ]);
  const objectHeadlines = uniqueNormalizedText([
    creative.object_story_spec?.link_data?.name,
    creative.object_story_spec?.video_data?.title,
  ]);
  const objectDescriptions = uniqueNormalizedText([
    creative.object_story_spec?.link_data?.description,
    creative.object_story_spec?.photo_data?.caption,
  ]);

  const directBodies = uniqueNormalizedText([creative.body, creative.text, creative.message]);
  const directHeadlines = uniqueNormalizedText([creative.title]);
  const directDescriptions = uniqueNormalizedText([creative.description]);

  const copyVariants = uniqueNormalizedText([
    ...assetFeedBodies,
    ...objectMessages,
    ...directBodies,
  ]);
  const headlineVariants = uniqueNormalizedText([
    ...assetFeedTitles,
    ...objectHeadlines,
    ...directHeadlines,
  ]);
  const descriptionVariants = uniqueNormalizedText([
    ...assetFeedDescriptions,
    ...objectDescriptions,
    ...directDescriptions,
  ]);

  const copyText = chooseBestCopyText({
    copy_variants: copyVariants,
    headline_variants: headlineVariants,
    description_variants: descriptionVariants,
  });

  let copySource: CopySourceLabel | null = null;
  if (copyText) {
    if (assetFeedBodies.includes(copyText)) copySource = "asset_feed_spec.bodies";
    else if (objectMessages.includes(copyText)) copySource = "object_story_spec.message";
    else if (directBodies.includes(copyText)) copySource = "creative.body";
    else if (assetFeedTitles.includes(copyText)) copySource = "asset_feed_spec.titles";
    else if (objectHeadlines.includes(copyText)) copySource = "object_story_spec.name";
    else if (directHeadlines.includes(copyText)) copySource = "creative.title";
    else if (assetFeedDescriptions.includes(copyText)) copySource = "asset_feed_spec.descriptions";
    else if (objectDescriptions.includes(copyText)) copySource = "object_story_spec.description";
    else if (directDescriptions.includes(copyText)) copySource = "creative.description";
  }

  return {
    copy_text: copyText,
    copy_variants: copyVariants,
    headline_variants: headlineVariants,
    description_variants: descriptionVariants,
    copy_source: copySource,
  };
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

const CREATIVE_TYPE_LABELS: Record<CreativeType, string> = {
  feed: "Feed",
  video: "Video",
  flexible: "Flexible ad",
  feed_catalog: "Feed (Catalog ads)",
};

function toCreativeTypeLabel(type: CreativeType): string {
  return CREATIVE_TYPE_LABELS[type] ?? "Feed";
}

function resolveGroupedCreativeType(rows: RawCreativeRow[]): CreativeType {
  if (rows.some((row) => row.creative_type === "feed_catalog")) return "feed_catalog";
  if (rows.some((row) => row.creative_type === "flexible")) return "flexible";
  if (rows.some((row) => row.creative_type === "video")) return "video";
  return "feed";
}

function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return /^https?:\/\//i.test(url) ? url : null;
}

function extractPostIdFromStoryIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Common Meta object_story_id format: <actor_id>_<post_id>
  const underscoreMatch = trimmed.match(/^\d+_(\d+)$/);
  if (underscoreMatch?.[1]) return underscoreMatch[1];

  // Already a direct post id.
  const directMatch = trimmed.match(/^\d{6,}$/);
  if (directMatch) return directMatch[0];

  // Last resort: pick long numeric token if clearly present.
  const tokens = trimmed.match(/\d{6,}/g);
  if (!tokens || tokens.length === 0) return null;
  return tokens[tokens.length - 1] ?? null;
}

function parsePreviewSizeFromUrl(url: string): { width: number; height: number } | null {
  const match = url.match(/p(\d+)x(\d+)/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

function isLikelyLowResCreativeUrl(value: unknown): boolean {
  const url = normalizeMediaUrl(value);
  if (!url) return false;
  const parsedSize = parsePreviewSizeFromUrl(url);
  if (!parsedSize) return false;
  return Math.max(parsedSize.width, parsedSize.height) <= 220;
}

function isThumbnailLikeUrl(value: unknown): boolean {
  const url = normalizeMediaUrl(value);
  if (!url) return false;
  if (isLikelyLowResCreativeUrl(url)) return true;
  return /thumbnail|thumb|_p\d+x\d+|emg1|\/t39\.2147-6\//i.test(url);
}

function resolveThumbnailUrl(input: {
  cachedThumbnailUrl?: string | null;
  creative?: MetaAdRecord["creative"] | null;
}): { url: string | null; source: "cached_thumbnail_url" | "creative.thumbnail_url" | "creative.image_url" | "none" } {
  const cached = normalizeMediaUrl(input.cachedThumbnailUrl ?? null);
  if (cached) return { url: cached, source: "cached_thumbnail_url" };
  const creativeThumb = normalizeMediaUrl(input.creative?.thumbnail_url ?? null);
  if (creativeThumb) return { url: creativeThumb, source: "creative.thumbnail_url" };
  const creativeImage = normalizeMediaUrl(input.creative?.image_url ?? null);
  if (creativeImage) return { url: creativeImage, source: "creative.image_url" };
  return { url: null, source: "none" };
}

function isPreviewContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return normalized.startsWith("image/");
}

async function validateMediaUrl(url: string, cache: Map<string, UrlValidationResult>): Promise<UrlValidationResult> {
  const cached = cache.get(url);
  if (cached) return cached;

  const buildResult = (
    method: "HEAD" | "GET" | "none",
    status: number | null,
    finalUrl: string | null,
    contentType: string | null,
    contentLength: string | null,
    error: string | null
  ): UrlValidationResult => ({
    isValid: Boolean(status && status >= 200 && status < 300 && isPreviewContentType(contentType)),
    method,
    status,
    finalUrl,
    contentType,
    contentLength,
    error,
  });

  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
    });
    const headContentType = head.headers.get("content-type");
    const headContentLength = head.headers.get("content-length");
    if (head.ok && isPreviewContentType(headContentType)) {
      const result = buildResult("HEAD", head.status, head.url || url, headContentType, headContentLength, null);
      cache.set(url, result);
      return result;
    }
  } catch (error) {
    // continue to GET
    const result = buildResult(
      "none",
      null,
      null,
      null,
      null,
      error instanceof Error ? error.message : String(error)
    );
    cache.set(`${url}::head_error`, result);
  }

  try {
    const get = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
    });
    const contentType = get.headers.get("content-type");
    const contentLength = get.headers.get("content-length");
    const result = buildResult("GET", get.status, get.url || url, contentType, contentLength, null);
    cache.set(url, result);
    return result;
  } catch (error) {
    const result = buildResult(
      "none",
      null,
      null,
      null,
      null,
      error instanceof Error ? error.message : String(error)
    );
    cache.set(url, result);
    return result;
  }
}

function pushCandidate(
  list: Array<{ source: string; url: string }>,
  source: string,
  value: unknown
) {
  const url = normalizeMediaUrl(value);
  if (!url) return;
  list.push({ source, url });
}

function detectIsCatalog(
  creative: MetaAdRecord["creative"],
  promotedObject: MetaPromotedObjectLike
): boolean {
  // Sadece DYNAMIC object_type'ı catalog olarak işaretle
  // Diğer tüm creative'ler normal görsel/video olarak işlensin
  const objectType = creative?.object_type?.toUpperCase() ?? "";
  return objectType === "DYNAMIC";
}

function extractImageHashesFromCreative(creative: MetaAdRecord["creative"]): string[] {
  const hashes = new Set<string>();
  const addHash = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    hashes.add(trimmed);
    hashes.add(trimmed.toLowerCase());
  };

  addHash(creative?.image_hash);
  addHash(creative?.object_story_spec?.link_data?.image_hash);
  for (const attachment of creative?.object_story_spec?.link_data?.child_attachments ?? []) {
    addHash(attachment?.image_hash);
  }
  for (const image of creative?.asset_feed_spec?.images ?? []) {
    addHash(image?.hash);
    addHash(image?.image_hash);
  }

  return Array.from(hashes);
}

function collectPreviewCandidates(
  creative: MetaAdRecord["creative"],
  imageHashLookup: Map<string, string>
): {
  candidates: Array<{ source: string; url: string }>;
  imageHashResolutions: Array<{ hash: string; resolved: boolean; resolved_url: string | null }>;
} {
  const candidates: Array<{ source: string; url: string }> = [];

  // Priority order
  pushCandidate(candidates, "thumbnail_url", creative?.thumbnail_url);
  pushCandidate(candidates, "image_url", creative?.image_url);
  pushCandidate(candidates, "object_story_spec.video_data.thumbnail_url", creative?.object_story_spec?.video_data?.thumbnail_url);
  pushCandidate(candidates, "object_story_spec.video_data.image_url", creative?.object_story_spec?.video_data?.image_url);
  pushCandidate(candidates, "object_story_spec.photo_data.image_url", creative?.object_story_spec?.photo_data?.image_url);
  pushCandidate(candidates, "object_story_spec.link_data.picture", creative?.object_story_spec?.link_data?.picture);

  for (const attachment of creative?.object_story_spec?.link_data?.child_attachments ?? []) {
    pushCandidate(candidates, "object_story_spec.link_data.child_attachments[].picture", attachment?.picture);
  }
  for (const attachment of creative?.object_story_spec?.link_data?.child_attachments ?? []) {
    pushCandidate(candidates, "object_story_spec.link_data.child_attachments[].image_url", attachment?.image_url);
  }
  for (const video of creative?.asset_feed_spec?.videos ?? []) {
    pushCandidate(candidates, "asset_feed_spec.videos[].thumbnail_url", video?.thumbnail_url);
  }
  for (const video of creative?.asset_feed_spec?.videos ?? []) {
    pushCandidate(candidates, "asset_feed_spec.videos[].image_url", video?.image_url);
  }
  for (const image of creative?.asset_feed_spec?.images ?? []) {
    pushCandidate(candidates, "asset_feed_spec.images[].image_url", image?.image_url);
  }
  for (const image of creative?.asset_feed_spec?.images ?? []) {
    pushCandidate(candidates, "asset_feed_spec.images[].url", image?.url);
  }
  for (const image of creative?.asset_feed_spec?.images ?? []) {
    pushCandidate(candidates, "asset_feed_spec.images[].original_url", image?.original_url);
  }

  const hashes = extractImageHashesFromCreative(creative);
  const imageHashResolutions = hashes.map((hash) => {
    const resolved = imageHashLookup.get(hash) ?? imageHashLookup.get(hash.toLowerCase()) ?? null;
    const normalized = normalizeMediaUrl(resolved);
    if (normalized) {
      pushCandidate(candidates, "image_hash_lookup", normalized);
    }
    return {
      hash,
      resolved: Boolean(normalized),
      resolved_url: normalized,
    };
  });

  const deduped: Array<{ source: string; url: string }> = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    deduped.push(candidate);
  }

  return { candidates: deduped, imageHashResolutions };
}

function buildNormalizedPreview(input: {
  creative: MetaAdRecord["creative"];
  promotedObject: MetaPromotedObjectLike;
  imageHashLookup: Map<string, string>;
  videoSourceLookup: Map<string, { source: string | null; picture: string | null }>;
}): {
  preview: NormalizedRenderPreviewPayload;
  legacy: {
    preview_url: string | null;
    preview_source: string | null;
    preview_state: LegacyPreviewState;
    thumbnail_url: string | null;
    image_url: string | null;
    is_catalog: boolean;
  };
  tiers: {
    table_thumbnail_url: string | null;
    card_preview_url: string | null;
    image_url: string | null;
    preview_url: string | null;
    preview_image_url: string | null;
    preview_poster_url: string | null;
    source: string | null;
  };
  candidateAudit: PreviewAuditCandidate[];
  imageHashResolutions: Array<{ hash: string; resolved: boolean; resolved_url: string | null }>;
} {
  const { creative, promotedObject, imageHashLookup, videoSourceLookup } = input;
  const isCatalog = detectIsCatalog(creative, promotedObject);
  const { candidates, imageHashResolutions } = collectPreviewCandidates(creative, imageHashLookup);

  const mapSource = (source: string | null): NormalizedPreviewSource => {
    if (!source) return null;
    if (source === "thumbnail_url") return "thumbnail_url";
    if (source === "image_hash_lookup") return "image_hash";
    return "image_url";
  };

  const isThumbnailNamedSource = (source: string) => source.includes("thumbnail_url");
  const firstAny = candidates[0] ?? null;
  const firstHighQuality = candidates.find((candidate) => !isLikelyLowResCreativeUrl(candidate.url)) ?? null;
  const firstNonThumbnailNamed = candidates.find((candidate) => !isThumbnailNamedSource(candidate.source)) ?? null;
  const firstHighQualityNonThumbnailNamed =
    candidates.find((candidate) => !isThumbnailNamedSource(candidate.source) && !isLikelyLowResCreativeUrl(candidate.url)) ?? null;
  const firstThumbnailNamed = candidates.find((candidate) => isThumbnailNamedSource(candidate.source)) ?? null;
  const secondHighQuality =
    candidates.find((candidate) => candidate !== firstHighQuality && !isLikelyLowResCreativeUrl(candidate.url)) ?? null;
  const isVideo = creative?.object_type?.toUpperCase() === "VIDEO";
  const resolvedThumbnail = resolveThumbnailUrl({ creative });

  const tableTier = firstThumbnailNamed?.url ?? resolvedThumbnail.url ?? firstAny?.url ?? null;
  const cardTier =
    firstHighQualityNonThumbnailNamed?.url ??
    firstHighQuality?.url ??
    firstNonThumbnailNamed?.url ??
    firstAny?.url ??
    resolvedThumbnail.url ??
    null;
  const imageTier =
    firstHighQualityNonThumbnailNamed?.url ??
    firstHighQuality?.url ??
    normalizeMediaUrl(creative?.image_url ?? null) ??
    firstNonThumbnailNamed?.url ??
    cardTier ??
    tableTier;
  const previewImageTier =
    firstHighQuality?.url ??
    imageTier ??
    cardTier ??
    tableTier;
  const previewPosterTier =
    secondHighQuality?.url ??
    previewImageTier ??
    cardTier ??
    tableTier;
  const previewTier = previewImageTier ?? previewPosterTier ?? cardTier ?? tableTier;
  const previewSource = firstHighQuality?.source ?? firstAny?.source ?? null;
  const videoIds = extractVideoIdsFromCreative(creative);
  const resolvedVideoSource = videoIds
    .map((videoId) => videoSourceLookup.get(videoId)?.source ?? null)
    .find((source): source is string => Boolean(source))
    ?? null;
  const resolvedVideoPoster = videoIds
    .map((videoId) => videoSourceLookup.get(videoId)?.picture ?? null)
    .find((poster): poster is string => Boolean(poster))
    ?? null;
  const renderMode: PreviewRenderMode = resolvedVideoSource
    ? "video"
    : previewTier
      ? (isVideo ? "image" : "image")
      : "unavailable";

  const preview: NormalizedRenderPreviewPayload = {
    render_mode: renderMode,
    image_url: previewImageTier,
    video_url: resolvedVideoSource,
    poster_url: resolvedVideoPoster ?? previewPosterTier,
    source: mapSource(previewSource),
    is_catalog: isCatalog,
  };

  const thumbnailCandidate = tableTier;
  const imageCandidate = imageTier ?? previewImageTier ?? cardTier ?? tableTier;

  if (process.env.NODE_ENV !== "production") {
    const resolvedSource = previewSource ?? "none";
    const label =
      resolvedSource === "thumbnail_url" ? "creative_thumbnail" :
      resolvedSource === "image_url" ? "creative_image" :
      resolvedSource === "image_hash_lookup" ? "image_hash" :
      resolvedSource === "none" ? "none" : resolvedSource;
    console.log("[preview-resolve]", {
      creative_id: creative?.id ?? null,
      resolved_source: label,
      url: previewTier?.slice(0, 80) ?? null,
      candidates_count: candidates.length,
    });
  }

  return {
    preview,
    legacy: {
      preview_url: previewTier,
      preview_source: preview.source,
      preview_state: previewTier ? "preview" : "unavailable",
      thumbnail_url: thumbnailCandidate,
      image_url: imageCandidate,
      is_catalog: isCatalog,
    },
    tiers: {
      table_thumbnail_url: tableTier,
      card_preview_url: cardTier,
      image_url: imageTier,
      preview_url: previewTier,
      preview_image_url: previewImageTier,
      preview_poster_url: previewPosterTier,
      source: previewSource,
    },
    candidateAudit: [],
    imageHashResolutions,
  };
}

function toAdAccountNodeId(accountId: string): string {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}

function pickAdImageUrl(record: MetaAdImageRecord | null | undefined): string | null {
  if (!record) return null;
  return (
    normalizeMediaUrl(record.url) ??
    normalizeMediaUrl(record.url_256) ??
    normalizeMediaUrl(record.url_128) ??
    normalizeMediaUrl(record.permalink_url)
  );
}


function mergeCreativeData(
  baseCreative: MetaAdRecord["creative"],
  detailCreative: NonNullable<MetaAdRecord["creative"]> | undefined
): MetaAdRecord["creative"] {
  if (!baseCreative && !detailCreative) return null;
  if (!baseCreative) return detailCreative ?? null;
  if (!detailCreative) return baseCreative;

  return {
    ...baseCreative,
    ...detailCreative,
    // Keep whichever source has a non-null media URL.
    thumbnail_id: detailCreative.thumbnail_id ?? baseCreative.thumbnail_id ?? null,
    thumbnail_url: detailCreative.thumbnail_url ?? baseCreative.thumbnail_url ?? null,
    image_url: detailCreative.image_url ?? baseCreative.image_url ?? null,
    image_hash: detailCreative.image_hash ?? baseCreative.image_hash ?? null,
    object_story_spec: detailCreative.object_story_spec ?? baseCreative.object_story_spec ?? null,
    asset_feed_spec: detailCreative.asset_feed_spec ?? baseCreative.asset_feed_spec ?? null,
  };
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
  if (process.env.NODE_ENV !== "production") {
    console.log("[meta-creatives] insights query", {
      account_id: accountId,
      time_range: { since: startDate, until: endDate },
      level: "ad",
      fields: "ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend,cpm,cpc,ctr,date_start,actions,action_values,purchase_roas",
    });
  }

  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
  url.searchParams.set(
    "fields",
    "ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend,cpm,cpc,ctr,impressions,inline_link_clicks,date_start,actions,action_values,purchase_roas,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions"
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
  if (process.env.NODE_ENV !== "production") {
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

async function fetchAdImageUrlMap(
  accountId: string,
  imageHashes: string[],
  accessToken: string
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  const uniqueHashes = Array.from(new Set(imageHashes.map((hash) => hash.trim()).filter(Boolean)));
  if (uniqueHashes.length === 0) return urlMap;

  const chunkSize = 80;
  for (let i = 0; i < uniqueHashes.length; i += chunkSize) {
    const chunk = uniqueHashes.slice(i, i + chunkSize);
    const url = new URL(`https://graph.facebook.com/v25.0/${toAdAccountNodeId(accountId)}/adimages`);
    url.searchParams.set("fields", "hash,url,url_128,url_256,permalink_url");
    url.searchParams.set("hashes", JSON.stringify(chunk));
    url.searchParams.set("access_token", accessToken);

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        console.warn("[meta-creatives] adimages non-ok", {
          accountId,
          status: res.status,
          chunk: i,
          count: chunk.length,
          raw: raw.slice(0, 300),
        });
        continue;
      }

      const payload = (await res.json().catch(() => null)) as
        | { data?: MetaAdImageRecord[]; images?: Record<string, MetaAdImageRecord> }
        | null;

      for (const record of payload?.data ?? []) {
        const hash = record?.hash?.trim();
        const imageUrl = pickAdImageUrl(record);
        if (hash && imageUrl) {
          urlMap.set(hash, imageUrl);
          urlMap.set(hash.toLowerCase(), imageUrl);
        }
      }

      const imagesMap = payload?.images;
      if (imagesMap && typeof imagesMap === "object") {
        for (const [hashKey, record] of Object.entries(imagesMap)) {
          const hash = hashKey?.trim() || record?.hash?.trim();
          const imageUrl = pickAdImageUrl(record);
          if (hash && imageUrl) {
            urlMap.set(hash, imageUrl);
            urlMap.set(hash.toLowerCase(), imageUrl);
          }
        }
      }
    } catch (error: unknown) {
      console.warn("[meta-creatives] adimages threw", {
        accountId,
        chunk: i,
        count: chunk.length,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return urlMap;
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
          `creative{${getCreativeMediaFields()}}`,
        ].join(",")
      );
      url.searchParams.set("limit", "500");
      url.searchParams.set(
        "effective_status",
        // Meta /ads endpoint rejects DELETED objects for this query shape (error_subcode 1815001)
        JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED", "PENDING_REVIEW", "DISAPPROVED"])
      );
      url.searchParams.set("thumbnail_width", "150");
      url.searchParams.set("thumbnail_height", "150");
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

function getCreativeMediaFields(): string {
  return [
    "id",
    "name",
    "body",
    "text",
    "message",
    "description",
    "title",
    "object_type",
    "video_id",
    "object_story_id",
    "effective_object_story_id",
    "thumbnail_url",
    "image_url",
    "image_hash",
    "object_story_spec{link_data{message,name,description,picture,image_hash,child_attachments{picture,image_url,image_hash}},video_data{video_id,image_url,thumbnail_url,message,title},photo_data{image_url,message,caption},template_data}",
    "asset_feed_spec{bodies{text},titles{text},descriptions{text},images{url,image_url,original_url,hash,image_hash},videos{video_id,thumbnail_url,image_url}}",
  ].join(",");
}

function getCreativeDetailFields(): string {
  return [
    "id",
    "name",
    "body",
    "text",
    "message",
    "description",
    "title",
    "object_type",
    "video_id",
    "object_story_id",
    "effective_object_story_id",
    "thumbnail_url",
    "image_url",
    "image_hash",
    // Keep this set conservative for adcreative IDs endpoint stability.
    "object_story_spec{link_data{message,name,description,picture,image_hash,child_attachments{picture,image_url,image_hash}},video_data{video_id,image_url,thumbnail_url,message,title},photo_data{image_url,message,caption}}",
    "asset_feed_spec{bodies{text},titles{text},descriptions{text},images{url,image_url,original_url,hash,image_hash},videos{video_id,thumbnail_url,image_url}}",
  ].join(",");
}

function extractVideoIdsFromCreative(creative: MetaAdRecord["creative"] | null | undefined): string[] {
  if (!creative) return [];
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    ids.add(trimmed);
  };

  add(creative.video_id);
  add(creative.object_story_spec?.video_data?.video_id);
  for (const video of creative.asset_feed_spec?.videos ?? []) {
    add(video?.video_id);
  }
  return Array.from(ids);
}

async function fetchVideoSourceMap(
  videoIds: string[],
  accessToken: string
): Promise<Map<string, { source: string | null; picture: string | null }>> {
  const map = new Map<string, { source: string | null; picture: string | null }>();
  const uniqueIds = Array.from(new Set(videoIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) return map;

  const chunkSize = 40;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const idsChunk = uniqueIds.slice(i, i + chunkSize);
    const url = new URL("https://graph.facebook.com/v25.0/");
    url.searchParams.set("ids", idsChunk.join(","));
    url.searchParams.set("fields", "source,picture");
    url.searchParams.set("access_token", accessToken);

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        console.warn("[meta-creatives] video details non-ok", {
          status: res.status,
          chunk: i,
          count: idsChunk.length,
          raw: raw.slice(0, 240),
        });
        continue;
      }

      const payload = (await res.json().catch(() => null)) as Record<string, { source?: string | null; picture?: string | null }> | null;
      if (!payload || typeof payload !== "object") continue;

      for (const [videoId, video] of Object.entries(payload)) {
        if (!video || typeof video !== "object") continue;
        map.set(videoId, {
          source: normalizeMediaUrl(video.source ?? null),
          picture: normalizeMediaUrl(video.picture ?? null),
        });
      }
    } catch (e: unknown) {
      console.warn("[meta-creatives] video details threw", {
        chunk: i,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

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
    "object_story_id",
    "effective_object_story_id",
    "adset_id",
    "created_time",
    `creative{${getCreativeMediaFields()}}`,
  ].join(",");

  const chunkSize = 40;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const idsChunk = uniqueIds.slice(i, i + chunkSize);
    const buildUrl = (ids: string[]) => {
      const url = new URL("https://graph.facebook.com/v25.0/");
      url.searchParams.set("ids", ids.join(","));
      url.searchParams.set("fields", fields);
      url.searchParams.set("thumbnail_width", "150");
      url.searchParams.set("thumbnail_height", "150");
      url.searchParams.set("access_token", accessToken);
      return url;
    };

    try {
      const res = await fetch(buildUrl(idsChunk).toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const errorPayload = (await res.json().catch(() => null)) as
          | { error?: { code?: number; error_subcode?: number; message?: string } }
          | null;
        const isDeletedObjectsError =
          errorPayload?.error?.code === 100 && errorPayload?.error?.error_subcode === 1815001;
        console.warn("[meta-creatives] batchFetchAdsByIds non-ok", {
          status: res.status,
          chunk: i,
          count: idsChunk.length,
          error_code: errorPayload?.error?.code ?? null,
          error_subcode: errorPayload?.error?.error_subcode ?? null,
          error_message: errorPayload?.error?.message ?? null,
        });
        if (isDeletedObjectsError && idsChunk.length > 1) {
          // Retry per-id so one deleted ad doesn't nuke the whole batch.
          for (const adId of idsChunk) {
            try {
              const oneRes = await fetch(buildUrl([adId]).toString(), {
                method: "GET",
                headers: { Accept: "application/json" },
                cache: "no-store",
              });
              if (!oneRes.ok) continue;
              const onePayload = (await oneRes.json().catch(() => null)) as Record<string, MetaAdRecord> | null;
              const oneAd = onePayload?.[adId];
              if (oneAd && typeof oneAd === "object") {
                map.set(adId, { ...oneAd, id: oneAd.id ?? adId });
              }
            } catch {
              // ignore per-id retry failures
            }
          }
        }
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

  const fields = getCreativeDetailFields();

  const chunkSize = 40;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const idsChunk = uniqueIds.slice(i, i + chunkSize);
    const url = new URL("https://graph.facebook.com/v25.0/");
    url.searchParams.set("ids", idsChunk.join(","));
    url.searchParams.set("fields", fields);
    url.searchParams.set("thumbnail_width", "150");
    url.searchParams.set("thumbnail_height", "150");
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

async function fetchCreativeThumbnailMap(
  creativeIds: string[],
  accessToken: string,
  width = 150,
  height = 120,
  debug = false
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniqueIds = Array.from(new Set(creativeIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) return map;

  const chunkSize = 20;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const idsChunk = uniqueIds.slice(i, i + chunkSize);
    if (debug) {
      console.log("[meta-creatives][thumb-debug] chunk start", {
        chunk_index: i / chunkSize + 1,
        chunk_size: idsChunk.length,
        width,
        height,
      });
    }
    const chunkResults = await Promise.all(
      idsChunk.map(async (creativeId) => {
        const url = new URL(`https://graph.facebook.com/v25.0/${creativeId}`);
        url.searchParams.set("thumbnail_width", String(width));
        url.searchParams.set("thumbnail_height", String(height));
        url.searchParams.set("fields", "thumbnail_url");
        url.searchParams.set("access_token", accessToken);
        if (debug) {
          const safeUrl = new URL(url.toString());
          safeUrl.searchParams.set("access_token", "<REDACTED>");
          console.log("[meta-creatives][thumb-debug] request", {
            creative_id: creativeId,
            url: safeUrl.toString(),
          });
        }
        try {
          const res = await fetch(url.toString(), {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
          });
          if (!res.ok) {
            const raw = await res.text().catch(() => "");
            if (debug) {
              console.log("[meta-creatives][thumb-debug] response non-ok", {
                creative_id: creativeId,
                status: res.status,
                body_sample: raw.slice(0, 220),
              });
            }
            return { creativeId, thumbnailUrl: null };
          }
          const payload = (await res.json().catch(() => null)) as { thumbnail_url?: string | null } | null;
          const thumbnailUrl = normalizeMediaUrl(payload?.thumbnail_url ?? null);
          if (debug) {
            console.log("[meta-creatives][thumb-debug] response ok", {
              creative_id: creativeId,
              status: res.status,
              thumbnail_url_present: Boolean(thumbnailUrl),
              thumbnail_url_sample: thumbnailUrl ? thumbnailUrl.slice(0, 180) : null,
            });
          }
          return { creativeId, thumbnailUrl };
        } catch (error: unknown) {
          if (debug) {
            console.log("[meta-creatives][thumb-debug] request failed", {
              creative_id: creativeId,
              message: error instanceof Error ? error.message : String(error),
            });
          }
          return { creativeId, thumbnailUrl: null };
        }
      })
    );

    for (const result of chunkResults) {
      if (result.thumbnailUrl) {
        map.set(result.creativeId, result.thumbnailUrl);
      }
    }
  }

  return map;
}

async function fetchAdCreativeMediaByAdIds(
  adIds: string[],
  accessToken: string
): Promise<Map<string, MetaAdCreativeMediaOnlyRecord>> {
  const map = new Map<string, MetaAdCreativeMediaOnlyRecord>();
  const uniqueIds = Array.from(new Set(adIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) return map;

  const fields = [
    "id",
    `creative{${getCreativeMediaFields()}}`,
  ].join(",");

  const chunkSize = 40;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const idsChunk = uniqueIds.slice(i, i + chunkSize);
    const buildUrl = (ids: string[]) => {
      const url = new URL("https://graph.facebook.com/v25.0/");
      url.searchParams.set("ids", ids.join(","));
      url.searchParams.set("fields", fields);
      url.searchParams.set("thumbnail_width", "150");
      url.searchParams.set("thumbnail_height", "150");
      url.searchParams.set("access_token", accessToken);
      return url;
    };

    try {
      const res = await fetch(buildUrl(idsChunk).toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const errorPayload = (await res.json().catch(() => null)) as
          | { error?: { code?: number; error_subcode?: number; message?: string } }
          | null;
        const isDeletedObjectsError =
          errorPayload?.error?.code === 100 && errorPayload?.error?.error_subcode === 1815001;
        console.warn("[meta-creatives] ad creative media fallback non-ok", {
          status: res.status,
          chunk: i,
          count: idsChunk.length,
          error_code: errorPayload?.error?.code ?? null,
          error_subcode: errorPayload?.error?.error_subcode ?? null,
          error_message: errorPayload?.error?.message ?? null,
        });
        if (isDeletedObjectsError && idsChunk.length > 1) {
          // Retry per-id; skip deleted ads but keep valid ones.
          for (const adId of idsChunk) {
            try {
              const oneRes = await fetch(buildUrl([adId]).toString(), {
                method: "GET",
                headers: { Accept: "application/json" },
                cache: "no-store",
              });
              if (!oneRes.ok) continue;
              const onePayload = (await oneRes.json().catch(() => null)) as Record<string, MetaAdCreativeMediaOnlyRecord> | null;
              const oneAd = onePayload?.[adId];
              if (oneAd && typeof oneAd === "object") {
                map.set(adId, { ...oneAd, id: oneAd.id ?? adId });
              }
            } catch {
              // ignore per-id retry failures
            }
          }
        }
        continue;
      }

      const payload = (await res.json().catch(() => null)) as Record<string, MetaAdCreativeMediaOnlyRecord> | null;
      if (!payload || typeof payload !== "object") continue;

      for (const [adId, ad] of Object.entries(payload)) {
        if (!ad || typeof ad !== "object") continue;
        map.set(adId, { ...ad, id: ad.id ?? adId });
      }
    } catch (e: unknown) {
      console.warn("[meta-creatives] ad creative media fallback threw", {
        chunk: i,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return map;
}

async function fetchAdCreativeBasicsByAdIds(
  adIds: string[],
  accessToken: string
): Promise<Map<string, MetaAdCreativeMediaOnlyRecord>> {
  const map = new Map<string, MetaAdCreativeMediaOnlyRecord>();
  const uniqueIds = Array.from(new Set(adIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) return map;

  const fields = "id,creative{id,thumbnail_url,image_url}";
  const concurrency = 20;
  for (let i = 0; i < uniqueIds.length; i += concurrency) {
    const chunk = uniqueIds.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (adId) => {
        const url = new URL(`https://graph.facebook.com/v25.0/${adId}`);
        url.searchParams.set("fields", fields);
        url.searchParams.set("thumbnail_width", "150");
        url.searchParams.set("thumbnail_height", "150");
        url.searchParams.set("access_token", accessToken);
        try {
          const res = await fetch(url.toString(), {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
          });
          if (!res.ok) return null;
          const payload = (await res.json().catch(() => null)) as MetaAdCreativeMediaOnlyRecord | null;
          if (!payload || typeof payload !== "object") return null;
          return { adId, payload: { ...payload, id: payload.id ?? adId } };
        } catch {
          return null;
        }
      })
    );
    for (const item of results) {
      if (!item) continue;
      map.set(item.adId, item.payload);
    }
  }

  return map;
}

async function fetchAdCreativeMediaDirectByAdIds(
  adIds: string[],
  accessToken: string
): Promise<Map<string, MetaAdCreativeMediaOnlyRecord>> {
  const map = new Map<string, MetaAdCreativeMediaOnlyRecord>();
  const uniqueIds = Array.from(new Set(adIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) return map;

  const fields = [
    "id",
    `creative{${getCreativeMediaFields()}}`,
  ].join(",");

  const concurrency = 20;
  for (let i = 0; i < uniqueIds.length; i += concurrency) {
    const chunk = uniqueIds.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (adId) => {
        const url = new URL(`https://graph.facebook.com/v25.0/${adId}`);
        url.searchParams.set("fields", fields);
        url.searchParams.set("thumbnail_width", "150");
        url.searchParams.set("thumbnail_height", "150");
        url.searchParams.set("access_token", accessToken);
        try {
          const res = await fetch(url.toString(), {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
          });
          if (!res.ok) return null;
          const payload = (await res.json().catch(() => null)) as MetaAdCreativeMediaOnlyRecord | null;
          if (!payload || typeof payload !== "object") return null;
          return { adId, payload: { ...payload, id: payload.id ?? adId } };
        } catch {
          return null;
        }
      })
    );
    for (const item of results) {
      if (!item) continue;
      map.set(item.adId, item.payload);
    }
  }

  return map;
}

async function fetchCreativeDetailPreviewHtml(
  creativeId: string,
  accessToken: string
): Promise<{ html: string; adFormat: string; source: "meta_creative_previews" } | null> {
  const adFormats = [
    "DESKTOP_FEED_STANDARD",
    "MOBILE_FEED_STANDARD",
    "INSTAGRAM_STANDARD",
  ];

  for (const adFormat of adFormats) {
    const url = new URL(`https://graph.facebook.com/v25.0/${creativeId}/previews`);
    url.searchParams.set("ad_format", adFormat);
    url.searchParams.set("access_token", accessToken);

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;

      const payload = (await res.json().catch(() => null)) as MetaCreativePreviewHtmlResponse | null;
      const body = payload?.data?.find((item) => typeof item?.body === "string" && item.body.trim().length > 0)?.body?.trim();
      if (!body) continue;
      return {
        html: body,
        adFormat,
        source: "meta_creative_previews",
      };
    } catch {
      // Keep trying alternate ad formats.
    }
  }

  return null;
}

async function fetchStoryCopyMap(
  storyIds: string[],
  accessToken: string
): Promise<Map<string, StoryCopyPayload>> {
  const map = new Map<string, StoryCopyPayload>();
  const ids = Array.from(new Set(storyIds.map((id) => id.trim()).filter((id) => id.length > 0)));
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const url = new URL("https://graph.facebook.com/v25.0/");
    url.searchParams.set("ids", chunk.join(","));
    url.searchParams.set("fields", "message,name,description,story,attachments{title,description}");
    url.searchParams.set("access_token", accessToken);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const payload = (await res.json().catch(() => null)) as Record<string, Record<string, unknown>> | null;
      if (!payload || typeof payload !== "object") continue;
      for (const [id, value] of Object.entries(payload)) {
        const attachmentData = Array.isArray((value?.attachments as { data?: unknown[] } | undefined)?.data)
          ? (((value?.attachments as { data?: unknown[] }).data as unknown[]) ?? [])
          : [];
        const attachmentTitles = attachmentData
          .map((item) =>
            item && typeof item === "object" && "title" in (item as Record<string, unknown>)
              ? (item as Record<string, unknown>).title
              : null
          );
        const attachmentDescriptions = attachmentData
          .map((item) =>
            item && typeof item === "object" && "description" in (item as Record<string, unknown>)
              ? (item as Record<string, unknown>).description
              : null
          );
        const message = uniqueNormalizedText([value?.message, value?.story]);
        const headline = uniqueNormalizedText([value?.name, ...attachmentTitles]);
        const description = uniqueNormalizedText([value?.description, ...attachmentDescriptions]);
        if (message.length === 0 && headline.length === 0 && description.length === 0) continue;
        map.set(id, { message, headline, description });
      }
    } catch {
      // Story lookup is best-effort fallback.
    }
  }
  return map;
}

function mergeExtraction(base: CopyExtraction, partial: {
  copy_variants?: string[];
  headline_variants?: string[];
  description_variants?: string[];
  source?: CopySourceLabel;
}): CopyExtraction {
  const mergedCopyVariants = uniqueNormalizedText([...(base.copy_variants ?? []), ...(partial.copy_variants ?? [])]);
  const mergedHeadlineVariants = uniqueNormalizedText([...(base.headline_variants ?? []), ...(partial.headline_variants ?? [])]);
  const mergedDescriptionVariants = uniqueNormalizedText([
    ...(base.description_variants ?? []),
    ...(partial.description_variants ?? []),
  ]);
  const addedContent =
    mergedCopyVariants.length > (base.copy_variants?.length ?? 0) ||
    mergedHeadlineVariants.length > (base.headline_variants?.length ?? 0) ||
    mergedDescriptionVariants.length > (base.description_variants?.length ?? 0);
  const mergedText =
    chooseBestCopyText({
      copy_variants: mergedCopyVariants,
      headline_variants: mergedHeadlineVariants,
      description_variants: mergedDescriptionVariants,
    }) ?? null;
  return {
    copy_text: mergedText,
    copy_variants: mergedCopyVariants,
    headline_variants: mergedHeadlineVariants,
    description_variants: mergedDescriptionVariants,
    copy_source: base.copy_source ?? (addedContent ? partial.source ?? null : null),
  };
}

function mergeDebugSources(base: string[] | undefined, incoming: string[] | undefined): string[] {
  const merged = new Set<string>([...(base ?? []), ...(incoming ?? [])]);
  return Array.from(merged);
}

function applyExtractionToRow(
  row: RawCreativeRow,
  extraction: CopyExtraction,
  debugSource: string,
  unresolvedReason: string | null = null
): RawCreativeRow {
  const merged = mergeExtraction(
    {
      copy_text: row.copy_text ?? null,
      copy_variants: row.copy_variants ?? [],
      headline_variants: row.headline_variants ?? [],
      description_variants: row.description_variants ?? [],
      copy_source: row.copy_source ?? null,
    },
    {
      copy_variants: extraction.copy_variants,
      headline_variants: extraction.headline_variants,
      description_variants: extraction.description_variants,
      source: extraction.copy_source ?? undefined,
    }
  );
  const hasRecoveredCopy = Boolean(
    normalizeCopyText(merged.copy_text) ||
      merged.copy_variants.length > 0 ||
      merged.headline_variants.length > 0 ||
      merged.description_variants.length > 0
  );
  return {
    ...row,
    ...merged,
    copy_debug_sources: mergeDebugSources(row.copy_debug_sources, [debugSource]),
    unresolved_reason: hasRecoveredCopy ? null : unresolvedReason ?? row.unresolved_reason ?? null,
  };
}

function extractVariantsFromPreviewHtml(html: string): {
  copy_variants: string[];
  headline_variants: string[];
  description_variants: string[];
} {
  const collectQuotedValues = (keys: string[]): string[] => {
    const values: string[] = [];
    for (const key of keys) {
      const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "gi");
      let match: RegExpExecArray | null = re.exec(html);
      while (match) {
        const candidate = match[1];
        try {
          const decoded = JSON.parse(`"${candidate}"`);
          const normalized = normalizeCopyText(decoded);
          if (normalized) values.push(normalized);
        } catch {
          const normalized = normalizeCopyText(candidate);
          if (normalized) values.push(normalized);
        }
        match = re.exec(html);
      }
    }
    return uniqueNormalizedText(values);
  };

  return {
    copy_variants: collectQuotedValues(["message", "primary_text", "body", "text", "caption"]),
    headline_variants: collectQuotedValues(["headline", "title", "name"]),
    description_variants: collectQuotedValues(["description"]),
  };
}

function toRawRow(
  insight: MetaInsightRecord,
  ad: MetaAdRecord | undefined,
  accountMeta: MetaAccountMeta,
  imageHashLookup: Map<string, string>,
  videoSourceLookup: Map<string, { source: string | null; picture: string | null }>,
  debugContext?: {
    enabled?: boolean;
    fetchSource?: string | null;
    hasRawAd?: boolean;
    rawAdId?: string | null;
    rawAdCreative?: boolean;
    rawAdCreativeThumbnailUrl?: string | null;
    enrichedAdCreative?: boolean;
    enrichedAdCreativeThumbnailUrl?: string | null;
    rawCreativeThumbnailUrl?: string | null;
    enrichedCreativeThumbnailUrl?: string | null;
  }
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
  const normalizedPreview = buildNormalizedPreview({
    creative,
    promotedObject,
    imageHashLookup,
    videoSourceLookup,
  });
  const resolvedThumbnail = resolveThumbnailUrl({ creative });
  const finalThumbnail = normalizedPreview.tiers.table_thumbnail_url ?? normalizedPreview.legacy.thumbnail_url ?? resolvedThumbnail.url;
  const finalCardPreview = normalizedPreview.tiers.card_preview_url ?? normalizedPreview.tiers.preview_image_url ?? null;
  const finalImage =
    normalizedPreview.tiers.image_url ??
    normalizedPreview.legacy.image_url ??
    normalizeMediaUrl(creative?.image_url ?? null) ??
    finalCardPreview ??
    finalThumbnail;
  const finalPreview =
    normalizedPreview.tiers.preview_url ??
    normalizedPreview.legacy.preview_url ??
    finalCardPreview ??
    finalImage ??
    finalThumbnail;
  const finalPreviewImage = normalizedPreview.tiers.preview_image_url ?? finalImage ?? finalCardPreview ?? finalThumbnail;
  const finalPreviewPoster = normalizedPreview.tiers.preview_poster_url ?? finalCardPreview ?? finalPreviewImage ?? finalThumbnail;
  const finalPreviewState: LegacyPreviewState = finalPreview ? "preview" : "unavailable";
  const stageNullReason =
    finalThumbnail
      ? null
      : !debugContext?.hasRawAd
      ? "ad_lookup_miss"
      : !debugContext?.rawAdCreative
      ? "raw_ad_creative_missing"
      : !debugContext?.enrichedAdCreative
      ? "enriched_ad_creative_missing"
      : !finalPreview
      ? "no_resolved_media_url"
      : "unknown";

  if (debugContext?.enabled) {
    console.log("[meta-creatives][thumb-trace] row-pipeline", {
      ad_id: adId,
      creative_id: creative?.id ?? null,
      debug_raw_creative_thumbnail_url: debugContext.rawCreativeThumbnailUrl ?? null,
      debug_enriched_creative_thumbnail_url: debugContext.enrichedCreativeThumbnailUrl ?? null,
      debug_build_input_creative_thumbnail_url: normalizeMediaUrl(creative?.thumbnail_url ?? null),
      debug_build_input_creative_image_url: normalizeMediaUrl(creative?.image_url ?? null),
      debug_resolved_thumbnail_source: resolvedThumbnail.source,
      debug_resolved_thumbnail_url: resolvedThumbnail.url,
      debug_final_thumbnail_url: finalThumbnail,
      debug_final_image_url: finalImage,
      debug_final_preview_url: finalPreview,
      debug_final_preview_state: finalPreviewState,
      is_catalog: normalizedPreview.legacy.is_catalog,
    });
  }
  const format: CreativeFormat = normalizedPreview.preview.is_catalog
    ? "catalog"
    : normalizedPreview.preview.render_mode === "video" || creative?.object_type?.toUpperCase() === "VIDEO"
    ? "video"
    : "image";
  const creativeType: CreativeType =
    format === "catalog"
      ? "feed_catalog"
      : format === "video"
      ? "video"
      : "feed";

  const launchDate = cleanDate(ad?.created_time) || cleanDate(insight.date_start) || toISODate(new Date());
  const name = insight.ad_name ?? ad?.name ?? creative?.name ?? "Unnamed ad";
  const copyExtraction = resolveCreativeCopyExtraction(creative);
  const creativeId = creative?.id ?? adId;
  const objectStoryId =
    typeof creative?.object_story_id === "string" && creative.object_story_id.trim().length > 0
      ? creative.object_story_id.trim()
      : typeof ad?.object_story_id === "string" && ad.object_story_id.trim().length > 0
      ? ad.object_story_id.trim()
      : null;
  const effectiveObjectStoryId =
    typeof creative?.effective_object_story_id === "string" && creative.effective_object_story_id.trim().length > 0
      ? creative.effective_object_story_id.trim()
      : typeof ad?.effective_object_story_id === "string" && ad.effective_object_story_id.trim().length > 0
      ? ad.effective_object_story_id.trim()
      : null;
  const postId =
    extractPostIdFromStoryIdentifier(objectStoryId) ??
    extractPostIdFromStoryIdentifier(effectiveObjectStoryId) ??
    null;

  return {
    id: adId,
    creative_id: creativeId,
    object_story_id: objectStoryId,
    effective_object_story_id: effectiveObjectStoryId,
    post_id: postId,
    associated_ads_count: 1,
    account_id: accountMeta.id,
    account_name: accountMeta.name,
    campaign_id: insight.campaign_id ?? null,
    campaign_name: insight.campaign_name ?? null,
    currency: accountMeta.currency,
    adset_id: insight.adset_id ?? ad?.adset_id ?? ad?.adset?.id ?? null,
    adset_name: insight.adset_name ?? ad?.adset?.name ?? null,
    name,
    copy_text: copyExtraction.copy_text,
    copy_variants: copyExtraction.copy_variants,
    headline_variants: copyExtraction.headline_variants,
    description_variants: copyExtraction.description_variants,
    copy_source: copyExtraction.copy_source,
    copy_debug_sources: copyExtraction.copy_source ? [copyExtraction.copy_source] : [],
    unresolved_reason:
      copyExtraction.copy_text || copyExtraction.copy_variants.length > 0 || copyExtraction.headline_variants.length > 0 || copyExtraction.description_variants.length > 0
        ? null
        : "no_structured_creative_text",
    preview_url: finalPreview,
    preview_source: normalizedPreview.legacy.preview_source,
    thumbnail_url: finalThumbnail,
    image_url: finalImage,
    table_thumbnail_url: finalThumbnail,
    card_preview_url: finalCardPreview ?? finalImage ?? finalPreview ?? finalThumbnail,
    is_catalog: normalizedPreview.legacy.is_catalog,
    preview_state: finalPreviewState,
    preview: {
      ...normalizedPreview.preview,
      image_url: finalPreviewImage,
      poster_url: finalPreviewPoster,
    },
    launch_date: launchDate,
    tags: [],
    ai_tags: {},
    format,
    creative_type: creativeType,
    creative_type_label: toCreativeTypeLabel(creativeType),
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
    debug_stage_fetch_source: debugContext?.fetchSource ?? null,
    debug_stage_has_raw_ad: Boolean(debugContext?.hasRawAd),
    debug_stage_raw_ad_id: debugContext?.rawAdId ?? null,
    debug_stage_raw_ad_creative: Boolean(debugContext?.rawAdCreative),
    debug_stage_raw_ad_creative_thumbnail_url: debugContext?.rawAdCreativeThumbnailUrl ?? null,
    debug_stage_enriched_ad_creative: Boolean(debugContext?.enrichedAdCreative),
    debug_stage_enriched_ad_creative_thumbnail_url: debugContext?.enrichedAdCreativeThumbnailUrl ?? null,
    debug_stage_row_input_thumbnail_url: normalizeMediaUrl(creative?.thumbnail_url ?? null),
    debug_stage_final_thumbnail_url: finalThumbnail,
    debug_stage_null_reason: stageNullReason,
    debug_raw_creative_thumbnail_url: debugContext?.rawCreativeThumbnailUrl ?? null,
    debug_enriched_creative_thumbnail_url: debugContext?.enrichedCreativeThumbnailUrl ?? null,
    debug_resolved_thumbnail_source: resolvedThumbnail.source,
    debug_resolution_stage: "toRawRow",
    debug_creative_object_type: creative?.object_type ?? null,
    debug_creative_video_ids: extractVideoIdsFromCreative(creative),
    debug_creative_effective_object_story_id:
      typeof creative?.effective_object_story_id === "string" ? creative.effective_object_story_id : null,
    debug_creative_object_story_id:
      typeof creative?.object_story_id === "string" ? creative.object_story_id : null,
    debug_creative_object_story_video_id:
      typeof creative?.object_story_spec?.video_data?.video_id === "string"
        ? creative.object_story_spec.video_data.video_id
        : null,
    debug_creative_asset_video_ids: (creative?.asset_feed_spec?.videos ?? [])
      .map((video) => (typeof video?.video_id === "string" ? video.video_id : null))
      .filter((videoId): videoId is string => Boolean(videoId)),
  };
}

function groupRows(
  rows: RawCreativeRow[],
  groupBy: GroupBy,
  creativeUsageMap: Map<string, Set<string>>
): RawCreativeRow[] {
  if (groupBy === "adName") {
    if (process.env.NODE_ENV !== "production") {
      console.log("[meta-creatives] groupRows: mode=adName, returning ad-level rows", {
        input_rows: rows.length,
        output_rows: rows.length,
      });
    }
    return rows.map((row) => ({
      ...row,
      associated_ads_count: creativeUsageMap.get(row.creative_id)?.size ?? row.associated_ads_count ?? 1,
    }));
  }

  const map = new Map<string, RawCreativeRow[]>();
  for (const row of rows) {
    const key =
      groupBy === "creative"
        ? `${row.name}\0${row.format}`
        : row.adset_id ?? `adset:${row.id}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  if (process.env.NODE_ENV !== "production") {
    const groupCounts = Array.from(map.entries()).map(([key, list]) => ({ key, count: list.length }));
    const multiAdGroups = groupCounts.filter((g) => g.count > 1);
    console.log("[meta-creatives] groupRows: grouping applied", {
      groupBy,
      input_rows: rows.length,
      unique_groups: map.size,
      output_rows: map.size,
      multi_ad_groups: multiAdGroups.length,
      sample_multi_ad_groups: multiAdGroups.slice(0, 3),
    });
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
    if (uniqueCurrencies.length > 1 && process.env.NODE_ENV !== "production") {
      console.log("[meta-creatives] mixed currencies in grouped row", {
        groupBy,
        groupKey: key,
        currencies: uniqueCurrencies,
      });
    }
    const previewRow = list.find((item) =>
      Boolean(item.preview.video_url || item.preview.image_url || item.preview.poster_url)
    ) ?? null;
    const groupedPreview = previewRow?.preview ?? {
      render_mode: "unavailable",
      html: null,
      image_url: null,
      video_url: null,
      poster_url: null,
      source: null,
      is_catalog: list.some((item) => item.preview.is_catalog),
    };
    const groupedLegacyState: LegacyPreviewState = groupedPreview.render_mode === "unavailable" ? "unavailable" : "preview";
    const groupedCreativeType = resolveGroupedCreativeType(list);
    const groupedObjectStoryId =
      list.map((item) => item.object_story_id ?? null).find((value): value is string => Boolean(value)) ?? null;
    const groupedEffectiveObjectStoryId =
      list.map((item) => item.effective_object_story_id ?? null).find((value): value is string => Boolean(value)) ?? null;
    const groupedPostId =
      list.map((item) => item.post_id ?? null).find((value): value is string => Boolean(value)) ??
      extractPostIdFromStoryIdentifier(groupedObjectStoryId) ??
      extractPostIdFromStoryIdentifier(groupedEffectiveObjectStoryId) ??
      null;
    const groupedCopyText =
      list
        .map((item) => normalizeCopyText(item.copy_text))
        .find((value): value is string => Boolean(value)) ??
      null;
    const groupedCopyVariants = uniqueNormalizedText(list.flatMap((item) => item.copy_variants ?? []));
    const groupedHeadlineVariants = uniqueNormalizedText(list.flatMap((item) => item.headline_variants ?? []));
    const groupedDescriptionVariants = uniqueNormalizedText(list.flatMap((item) => item.description_variants ?? []));
    const groupedCopySource =
      list.map((item) => item.copy_source ?? null).find((value): value is CopySourceLabel => Boolean(value)) ?? null;
    const groupedCopyDebugSources = mergeDebugSources([], list.flatMap((item) => item.copy_debug_sources ?? []));
    const groupedUnresolvedReason =
      list.map((item) => item.unresolved_reason ?? null).find((value): value is string => Boolean(value)) ?? null;

    const stableId =
      groupBy === "creative"
        ? `creative_${simpleHash(key)}`
        : `adset_${key}`;
    grouped.push({
      id: stableId,
      creative_id: sample.creative_id,
      object_story_id: groupedObjectStoryId,
      effective_object_story_id: groupedEffectiveObjectStoryId,
      post_id: groupedPostId,
      associated_ads_count: groupBy === "creative" ? list.length : (creativeUsageMap.get(sample.creative_id)?.size ?? 1),
      account_id: sample.account_id,
      account_name: sample.account_name,
      campaign_id: sample.campaign_id,
      campaign_name: sample.campaign_name,
      currency: sample.currency,
      adset_id: sample.adset_id,
      adset_name: sample.adset_name,
      name: groupBy === "creative" ? sample.name : sample.adset_name ?? sample.name,
      copy_text: groupedCopyText,
      copy_variants: groupedCopyVariants,
      headline_variants: groupedHeadlineVariants,
      description_variants: groupedDescriptionVariants,
      copy_source: groupedCopySource,
      copy_debug_sources: groupedCopyDebugSources,
      unresolved_reason: groupedUnresolvedReason,
      preview_url: groupedPreview.video_url ?? groupedPreview.image_url ?? groupedPreview.poster_url ?? null,
      preview_source: groupedPreview.source,
      thumbnail_url: previewRow?.thumbnail_url ?? groupedPreview.poster_url ?? groupedPreview.image_url ?? null,
      image_url: previewRow?.image_url ?? groupedPreview.image_url ?? groupedPreview.poster_url ?? null,
      table_thumbnail_url:
        previewRow?.table_thumbnail_url ??
        previewRow?.thumbnail_url ??
        groupedPreview.poster_url ??
        groupedPreview.image_url ??
        null,
      card_preview_url:
        previewRow?.card_preview_url ??
        previewRow?.image_url ??
        groupedPreview.image_url ??
        groupedPreview.poster_url ??
        previewRow?.thumbnail_url ??
        null,
      is_catalog: groupedPreview.is_catalog,
      preview_state: groupedLegacyState,
      preview: groupedPreview,
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
      creative_type: groupedCreativeType,
      creative_type_label: toCreativeTypeLabel(groupedCreativeType),
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

function summarizePreviewAudit(samples: PreviewAuditSample[]) {
  const sourceStats = new Map<string, { present: number; valid: number; invalid: number }>();
  for (const sample of samples) {
    for (const candidate of sample.candidates) {
      const current = sourceStats.get(candidate.source) ?? { present: 0, valid: 0, invalid: 0 };
      current.present += 1;
      if (candidate.validation.isValid) current.valid += 1;
      else current.invalid += 1;
      sourceStats.set(candidate.source, current);
    }
  }

  const ranked = Array.from(sourceStats.entries())
    .map(([source, stat]) => ({
      source,
      present: stat.present,
      valid: stat.valid,
      invalid: stat.invalid,
      stability: stat.present > 0 ? stat.valid / stat.present : 0,
    }))
    .sort((a, b) => b.valid - a.valid || b.present - a.present);

  const mostAvailable = [...ranked].sort((a, b) => b.present - a.present)[0] ?? null;
  const mostStable = [...ranked].sort((a, b) => b.stability - a.stability)[0] ?? null;
  const leastReliable = [...ranked].sort((a, b) => a.stability - b.stability)[0] ?? null;

  return {
    sources: ranked,
    most_available: mostAvailable,
    most_stable: mostStable,
    least_reliable: leastReliable,
  };
}

export async function GET(request: NextRequest) {
  const requestStartedAt = Date.now();
  const params = request.nextUrl.searchParams;
  const businessId = params.get("businessId");
  const detailPreviewCreativeId = params.get("detailPreviewCreativeId")?.trim() ?? "";
  const groupBy = (params.get("groupBy") as GroupBy | null) ?? "creative";
  const format = (params.get("format") as FormatFilter | null) ?? "all";
  const sort = (params.get("sort") as SortKey | null) ?? "roas";
  const start = params.get("start") ?? toISODate(nDaysAgo(29));
  const end = params.get("end") ?? toISODate(new Date());
  const debugPreview = params.get("debugPreview") === "1";
  const debugThumbnail = params.get("debugThumbnail") === "1";
  const debugPerf = params.get("debugPerf") === "1";
  // Keep normal /creatives rendering resilient; debug flags only expand diagnostics.
  const enableCreativeBasicsFallback = params.get("creativeBasicsFallback") !== "0";
  const enableCreativeDetails = params.get("creativeDetails") !== "0";
  const enableThumbnailBackfill = params.get("thumbnailBackfill") !== "0";
  const enableCardThumbnailBackfill = params.get("cardThumbnailBackfill") !== "0";
  const enableImageHashLookup = debugPreview || debugThumbnail || params.get("imageHashLookup") === "1";
  const enableMediaRecovery = debugPreview || debugThumbnail || params.get("recoverMedia") === "1";
  const enableMediaCache = debugPreview || debugThumbnail || params.get("mediaCache") === "1";
  const enableDeepAudit = debugPreview || debugPerf;
  const previewSampleLimit = Number(params.get("previewSampleLimit") ?? "5");
  const perAccountSampleLimit =
    Number.isFinite(previewSampleLimit) && previewSampleLimit > 0
      ? Math.min(25, Math.max(1, Math.floor(previewSampleLimit)))
      : 10;

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
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(getDemoMetaCreatives());
  }

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return NextResponse.json({ status: "no_connection", rows: [] });
  }

  if (!integration.access_token) {
    return NextResponse.json({ status: "no_access_token", rows: [] });
  }
  const accessToken = integration.access_token;

  if (detailPreviewCreativeId) {
    const preview = await fetchCreativeDetailPreviewHtml(detailPreviewCreativeId, accessToken);
    return NextResponse.json({
      status: "ok",
      detail_preview: preview
        ? {
            creative_id: detailPreviewCreativeId,
            mode: "html",
            source: preview.source,
            ad_format: preview.adFormat,
            html: preview.html,
          }
        : {
            creative_id: detailPreviewCreativeId,
            mode: "unavailable",
            source: null,
            ad_format: null,
            html: null,
          },
    });
  }

  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  if (assignedAccountIds.length === 0) {
    return NextResponse.json({ status: "no_accounts_assigned", rows: [] });
  }

  const rawRows: RawCreativeRow[] = [];
  const cardPreviewByCreativeId = new Map<string, string>();
  const urlValidationCache = new Map<string, UrlValidationResult>();
  const previewAuditSamples: PreviewAuditSample[] = [];
  let previewAuditValidationRequests = 0;
  const perf: {
    total_ms: number;
    accounts: Array<{
      account_id: string;
      insights_ms: number;
      ads_ms: number;
      account_meta_ms: number;
      missing_ads_batch_ms: number;
      creative_basics_fallback_ms: number;
      creative_details_ms: number;
      creative_thumb_small_ms: number;
      creative_thumb_card_ms: number;
      adimages_ms: number;
      rows_build_ms: number;
      rows_built: number;
      insights_rows: number;
    }>;
    stages: Record<string, number>;
    counters: Record<string, number>;
  } = {
    total_ms: 0,
    accounts: [],
    stages: {},
    counters: {},
  };
  let totalInsightAdIds = 0;
  let totalAdMapHits = 0;
  let mediaFallbackRowsRequested = 0;
  let mediaDirectFallbackRowsRequested = 0;

  const addStageMs = (name: string, ms: number) => {
    perf.stages[name] = (perf.stages[name] ?? 0) + ms;
  };

  for (const accountId of assignedAccountIds) {
    try {
      const accountPerf = {
        account_id: accountId,
        insights_ms: 0,
        ads_ms: 0,
        account_meta_ms: 0,
        missing_ads_batch_ms: 0,
        creative_basics_fallback_ms: 0,
        creative_details_ms: 0,
        video_details_ms: 0,
        creative_thumb_small_ms: 0,
        creative_thumb_card_ms: 0,
        adimages_ms: 0,
        rows_build_ms: 0,
        rows_built: 0,
        insights_rows: 0,
      };
      const tParallelStart = Date.now();
      const [insights, accountMeta] = await Promise.all([
        (async () => {
          const t = Date.now();
          const result = await fetchAccountInsights(accountId, accessToken, start, end);
          accountPerf.insights_ms += Date.now() - t;
          return result;
        })(),
        (async () => {
          const t = Date.now();
          const result = await fetchAccountMeta(accountId, accessToken);
          accountPerf.account_meta_ms += Date.now() - t;
          return result;
        })(),
      ]);
      addStageMs("parallel_fetch_ms", Date.now() - tParallelStart);
      accountPerf.insights_rows = insights.length;

      const adMap = new Map<string, MetaAdRecord>();
      const insightAdIds = insights
        .map((item) => item.ad_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      totalInsightAdIds += insightAdIds.length;
      if (insightAdIds.length > 0) {
        const tAds = Date.now();
        const insightAdsMap = await batchFetchAdsByIds(insightAdIds, accessToken);
        accountPerf.ads_ms += Date.now() - tAds;
        for (const [id, ad] of insightAdsMap.entries()) {
          adMap.set(id, ad);
        }
        totalAdMapHits += insightAdsMap.size;
      }

      const creativeMissingAdIds = insightAdIds.filter((id) => {
        const ad = adMap.get(id);
        return !ad?.creative?.thumbnail_url && !ad?.creative?.image_url;
      });
      if (enableCreativeBasicsFallback && creativeMissingAdIds.length > 0) {
        console.log("[meta-creatives] creative enrichment fallback", {
          account_id: accountId,
          missing_creative_media_ads: creativeMissingAdIds.length,
        });
        const tCreativeBasics = Date.now();
        const creativeBasicsMap = await fetchAdCreativeBasicsByAdIds(creativeMissingAdIds, accessToken);
        accountPerf.creative_basics_fallback_ms += Date.now() - tCreativeBasics;
        for (const adId of creativeMissingAdIds) {
          const existing = adMap.get(adId);
          const fallback = creativeBasicsMap.get(adId);
          if (!fallback?.creative) continue;
          if (!existing) {
            adMap.set(adId, { id: adId, creative: fallback.creative });
            continue;
          }
          adMap.set(adId, {
            ...existing,
            creative: mergeCreativeData(existing.creative ?? null, fallback.creative as NonNullable<MetaAdRecord["creative"]>),
          });
        }
      }

      const tAdCreativeMedia = Date.now();
      const adCreativeMediaMap =
        insightAdIds.length > 0
          ? await fetchAdCreativeMediaByAdIds(insightAdIds, accessToken)
          : new Map<string, MetaAdCreativeMediaOnlyRecord>();
      accountPerf.creative_details_ms += Date.now() - tAdCreativeMedia;
      for (const adId of insightAdIds) {
        const existing = adMap.get(adId);
        const mediaOnly = adCreativeMediaMap.get(adId);
        if (!mediaOnly?.creative) continue;
        if (!existing) {
          adMap.set(adId, { id: adId, creative: mediaOnly.creative });
          continue;
        }
        adMap.set(adId, {
          ...existing,
          creative: mergeCreativeData(existing.creative ?? null, mediaOnly.creative as NonNullable<MetaAdRecord["creative"]>),
        });
      }

      // ── Fetch creative details only for ads in current insights window that still need enrichment ──
      const insightAds = insightAdIds
        .map((adId) => adMap.get(adId))
        .filter((ad): ad is MetaAdRecord => Boolean(ad));
      const creativeIds = Array.from(
        new Set(
          insightAds
            .map((ad) => ad.creative?.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      );
      const creativeIdsForDetails: string[] = enableCreativeDetails
        ? creativeIds
        : [];
      const tCreativeDetails = Date.now();
      const creativeDetailsMap =
        creativeIdsForDetails.length > 0
          ? await fetchCreativeDetailsMap(creativeIdsForDetails, accessToken)
          : new Map<string, NonNullable<MetaAdRecord["creative"]>>();
      accountPerf.creative_details_ms += Date.now() - tCreativeDetails;

      const mergedCreativeById = new Map<string, MetaAdRecord["creative"]>();
      for (const ad of insightAds) {
        const baseCreative = ad.creative ?? null;
        const detailCreative = baseCreative?.id ? creativeDetailsMap.get(baseCreative.id) : undefined;
        const merged = mergeCreativeData(baseCreative, detailCreative);
        if (merged?.id) mergedCreativeById.set(merged.id, merged);
      }
      const creativeVideoIds = Array.from(
        new Set(
          Array.from(mergedCreativeById.values()).flatMap((creative) => extractVideoIdsFromCreative(creative))
        )
      );
      const tVideoDetails = Date.now();
      const videoSourceMap =
        creativeVideoIds.length > 0
          ? await fetchVideoSourceMap(creativeVideoIds, accessToken)
          : new Map<string, { source: string | null; picture: string | null }>();
      accountPerf.video_details_ms += Date.now() - tVideoDetails;

      const missingThumbnailCreativeIds = Array.from(mergedCreativeById.entries())
        .filter(([, creative]) =>
          !normalizeMediaUrl(creative?.thumbnail_url ?? null) &&
          !normalizeMediaUrl(creative?.image_url ?? null)
        )
        .map(([creativeId]) => creativeId);
      const tSmallThumbs = Date.now();
      const creativeThumbnailMap =
        enableThumbnailBackfill && missingThumbnailCreativeIds.length > 0
          ? await fetchCreativeThumbnailMap(
              missingThumbnailCreativeIds,
              accessToken,
              150,
              120,
              debugThumbnail
            )
          : new Map<string, string>();
      accountPerf.creative_thumb_small_ms += Date.now() - tSmallThumbs;
      const spendByCreativeId = insights.reduce<Map<string, number>>((acc, insight) => {
        const adId = insight.ad_id;
        if (!adId) return acc;
        const creativeId = adMap.get(adId)?.creative?.id;
        if (!creativeId) return acc;
        const spend = parseFloat(insight.spend ?? "0") || 0;
        acc.set(creativeId, (acc.get(creativeId) ?? 0) + spend);
        return acc;
      }, new Map<string, number>());
      const cardThumbnailCreativeIds = Array.from(mergedCreativeById.entries())
      .filter(([, creative]) => {
        const imageUrl = normalizeMediaUrl(creative?.image_url ?? null);
        if (!imageUrl) return true;
        return isLikelyLowResCreativeUrl(imageUrl);
      })
      .map(([creativeId]) => creativeId)
      .sort((a, b) => (spendByCreativeId.get(b) ?? 0) - (spendByCreativeId.get(a) ?? 0))
      .slice(0, 80);
      const tCardThumbs = Date.now();
      const cardThumbnailMap =
        enableCardThumbnailBackfill && cardThumbnailCreativeIds.length > 0
          ? await fetchCreativeThumbnailMap(
              cardThumbnailCreativeIds,
              accessToken,
              640,
              640,
              false
            )
          : new Map<string, string>();
      accountPerf.creative_thumb_card_ms += Date.now() - tCardThumbs;
      if (enableCardThumbnailBackfill) {
        for (const [creativeId, url] of cardThumbnailMap.entries()) {
          if (!cardPreviewByCreativeId.has(creativeId)) {
            cardPreviewByCreativeId.set(creativeId, url);
          }
        }
      }
      const accountImageHashes = enableImageHashLookup
        ? Array.from(
            new Set(
              insightAds.flatMap((ad) => {
                const detailCreative = ad.creative?.id ? creativeDetailsMap.get(ad.creative.id) : undefined;
                const mergedCreative = mergeCreativeData(ad.creative ?? null, detailCreative);
                if (mergedCreative?.id && !normalizeMediaUrl(mergedCreative.thumbnail_url) && !normalizeMediaUrl(mergedCreative.image_url)) {
                  const fallbackThumb = creativeThumbnailMap.get(mergedCreative.id) ?? null;
                  if (fallbackThumb) {
                    mergedCreative.thumbnail_url = fallbackThumb;
                    if (debugThumbnail) {
                      console.log("[meta-creatives][thumb-debug] fallback applied", {
                        stage: "hash-seed-merge",
                        account_id: accountId,
                        creative_id: mergedCreative.id,
                        thumbnail_url_sample: fallbackThumb.slice(0, 180),
                      });
                    }
                  }
                  return extractImageHashesFromCreative(mergedCreative);
                }
                return [];
              })
            )
          )
        : [];
      const tAdImages = Date.now();
      const adImageUrlMap =
        enableImageHashLookup && accountImageHashes.length > 0
          ? await fetchAdImageUrlMap(accountId, accountImageHashes, accessToken)
          : new Map<string, string>();
      accountPerf.adimages_ms += Date.now() - tAdImages;

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
          creative_ids_for_details: creativeIdsForDetails.length,
          creative_details_loaded: creativeDetailsMap.size,
          creative_video_ids_seen: creativeVideoIds.length,
          creative_video_sources_loaded: videoSourceMap.size,
          creative_missing_thumbnail: missingThumbnailCreativeIds.length,
          creative_thumbnail_fallback_loaded: creativeThumbnailMap.size,
          card_thumbnail_fallback_loaded: cardThumbnailMap.size,
          image_hashes_seen: accountImageHashes.length,
          image_hash_urls_resolved: adImageUrlMap.size,
          matched_ads: matchedAds,
          with_creative_data: withCreative,
          fallback_fetched: creativeMissingAdIds.length > 0 ? creativeMissingAdIds.length : 0,
        });
      }

      const accountSampleAdIds = insightAdIds.slice(0, perAccountSampleLimit);
      let accountSampleCount = 0;

      const tRowsBuild = Date.now();
      for (const insight of insights) {
        const ad = insight.ad_id ? adMap.get(insight.ad_id) : undefined;
        const rawAd = ad;
        const rawAdAny = (rawAd ?? null) as Record<string, unknown> | null;
        const rawCreativeDirect = rawAd?.creative ?? null;
        const rawCreativeFromCreativeData =
          rawAdAny &&
          typeof rawAdAny.creative === "object" &&
          rawAdAny.creative !== null &&
          "data" in (rawAdAny.creative as Record<string, unknown>)
            ? ((rawAdAny.creative as { data?: MetaAdRecord["creative"] }).data ?? null)
            : null;
        const rawCreativesNode = rawAdAny?.creatives as
          | { data?: MetaAdRecord["creative"][] }
          | MetaAdRecord["creative"][]
          | undefined;
        const rawAdCreativesNode = rawAdAny?.adcreatives as
          | { data?: MetaAdRecord["creative"][] }
          | MetaAdRecord["creative"][]
          | undefined;
        const rawCreativeFromCreatives = Array.isArray(rawCreativesNode)
          ? rawCreativesNode[0] ?? null
          : rawCreativesNode?.data?.[0] ?? null;
        const rawCreativeFromAdCreatives = Array.isArray(rawAdCreativesNode)
          ? rawAdCreativesNode[0] ?? null
          : rawAdCreativesNode?.data?.[0] ?? null;
        const rawCreativeAnyShape =
          rawCreativeDirect ??
          rawCreativeFromCreativeData ??
          rawCreativeFromCreatives ??
          rawCreativeFromAdCreatives ??
          null;
        const rawCreativeThumbnailAnyShape = normalizeMediaUrl(
          rawCreativeDirect?.thumbnail_url ??
            rawCreativeDirect?.image_url ??
            rawCreativeFromCreativeData?.thumbnail_url ??
            rawCreativeFromCreativeData?.image_url ??
            rawCreativeFromCreatives?.thumbnail_url ??
            rawCreativeFromCreatives?.image_url ??
            rawCreativeFromAdCreatives?.thumbnail_url ??
            rawCreativeFromAdCreatives?.image_url ??
            null
        );
        // Merge creative details — prefer non-null values from either source
        const baseCreative = ad?.creative ?? null;
        const detailCreative = baseCreative?.id ? creativeDetailsMap.get(baseCreative.id) : undefined;
        const mergedCreative = mergeCreativeData(baseCreative, detailCreative);
        if (mergedCreative?.id && !normalizeMediaUrl(mergedCreative.thumbnail_url)) {
          const fallbackThumb = creativeThumbnailMap.get(mergedCreative.id) ?? null;
          if (fallbackThumb) {
            mergedCreative.thumbnail_url = fallbackThumb;
            if (debugThumbnail) {
              console.log("[meta-creatives][thumb-debug] fallback applied", {
                stage: "row-merge",
                account_id: accountId,
                ad_id: insight.ad_id ?? null,
                creative_id: mergedCreative.id,
                thumbnail_url_sample: fallbackThumb.slice(0, 180),
              });
            }
          }
        }
        const enrichedAd: MetaAdRecord | undefined = ad
          ? { ...ad, creative: mergedCreative }
          : undefined;
        const rawCreativeThumbnailUrl = normalizeMediaUrl(baseCreative?.thumbnail_url ?? null);
        const enrichedCreativeThumbnailUrl = normalizeMediaUrl(mergedCreative?.thumbnail_url ?? null);
        if (debugPreview || debugThumbnail) {
          console.log("[meta-creatives][thumb-trace] enrich-stage", {
            ad_id: insight.ad_id ?? null,
            creative_id: mergedCreative?.id ?? baseCreative?.id ?? null,
            debug_raw_creative_thumbnail_url: rawCreativeThumbnailUrl,
            debug_enriched_creative_thumbnail_url: enrichedCreativeThumbnailUrl,
          });
        }
        const row = toRawRow(
          insight,
          enrichedAd,
          accountMeta,
          adImageUrlMap,
          videoSourceMap,
          {
            enabled: debugPreview || debugThumbnail,
            fetchSource: "insights+adMap+enrichment",
            hasRawAd: Boolean(rawAd),
            rawAdId: rawAd?.id ?? null,
            rawAdCreative: Boolean(rawCreativeAnyShape),
            rawAdCreativeThumbnailUrl: rawCreativeThumbnailAnyShape,
            enrichedAdCreative: Boolean(mergedCreative),
            enrichedAdCreativeThumbnailUrl: normalizeMediaUrl(mergedCreative?.thumbnail_url ?? mergedCreative?.image_url ?? null),
            rawCreativeThumbnailUrl,
            enrichedCreativeThumbnailUrl,
          }
        );
        if (row) {
          rawRows.push(row);
          if (enableDeepAudit && accountSampleCount < perAccountSampleLimit && accountSampleAdIds.includes(row.id)) {
            accountSampleCount += 1;
            const creative = mergedCreative;
            const promotedObject = enrichedAd?.promoted_object ?? null;
            const adsetPromotedObject = enrichedAd?.adset?.promoted_object ?? null;
            const collected = collectPreviewCandidates(creative, adImageUrlMap);
            const candidateAudit: PreviewAuditCandidate[] = [];
            for (const candidate of collected.candidates) {
              previewAuditValidationRequests += 1;
              const validation = await validateMediaUrl(candidate.url, urlValidationCache);
              candidateAudit.push({
                source: candidate.source,
                url: candidate.url,
                validation,
              });
            }

            const sample: PreviewAuditSample = {
              account_id: accountMeta.id,
              ad_id: row.id,
              creative_id: creative?.id ?? null,
              creative_name: creative?.name ?? row.name,
              creative_object_type: creative?.object_type ?? null,
              direct: {
                thumbnail_url: normalizeMediaUrl(creative?.thumbnail_url),
                image_url: normalizeMediaUrl(creative?.image_url),
                image_hash: typeof creative?.image_hash === "string" ? creative.image_hash : null,
              },
              object_story_spec: {
                video_data_video_id: typeof creative?.object_story_spec?.video_data?.video_id === "string"
                  ? creative.object_story_spec.video_data.video_id
                  : null,
                video_data_thumbnail_url: normalizeMediaUrl(creative?.object_story_spec?.video_data?.thumbnail_url),
                video_data_image_url: normalizeMediaUrl(creative?.object_story_spec?.video_data?.image_url),
                photo_data_image_url: normalizeMediaUrl(creative?.object_story_spec?.photo_data?.image_url),
                link_data_picture: normalizeMediaUrl(creative?.object_story_spec?.link_data?.picture),
                link_data_image_hash: typeof creative?.object_story_spec?.link_data?.image_hash === "string"
                  ? creative.object_story_spec.link_data.image_hash
                  : null,
                link_data_child_attachments: (creative?.object_story_spec?.link_data?.child_attachments ?? []).map((attachment) => ({
                  picture: normalizeMediaUrl(attachment?.picture),
                  image_url: normalizeMediaUrl(attachment?.image_url),
                  image_hash: typeof attachment?.image_hash === "string" ? attachment.image_hash : null,

                })),
              },
              asset_feed_spec: {
                catalog_id: typeof creative?.asset_feed_spec?.catalog_id === "string" ? creative.asset_feed_spec.catalog_id : null,
                product_set_id: typeof creative?.asset_feed_spec?.product_set_id === "string" ? creative.asset_feed_spec.product_set_id : null,
                images: (creative?.asset_feed_spec?.images ?? []).map((image) => ({
                  image_url: normalizeMediaUrl(image?.image_url),
                  url: normalizeMediaUrl(image?.url),
                  original_url: normalizeMediaUrl(image?.original_url),
                  hash: typeof image?.hash === "string" ? image.hash : typeof image?.image_hash === "string" ? image.image_hash : null,
                })),
                videos: (creative?.asset_feed_spec?.videos ?? []).map((video) => ({
                  video_id: typeof video?.video_id === "string" ? video.video_id : null,
                  thumbnail_url: normalizeMediaUrl(video?.thumbnail_url),
                  image_url: normalizeMediaUrl(video?.image_url),
                })),
              },
              promoted_object: {
                promoted_product_set_id: promotedObject?.product_set_id ?? null,
                promoted_catalog_id: promotedObject?.catalog_id ?? null,
                adset_promoted_product_set_id: adsetPromotedObject?.product_set_id ?? null,
                adset_promoted_catalog_id: adsetPromotedObject?.catalog_id ?? null,
              },
              image_hash_lookup: collected.imageHashResolutions,
              candidates: candidateAudit,
              chosen_preview_source: row.preview.source,
              chosen_preview_url: row.preview.image_url ?? row.preview.poster_url ?? row.preview.video_url,
              chosen_render_mode: row.preview.render_mode,
              is_catalog: row.preview.is_catalog,
              format: row.format,
            };
            previewAuditSamples.push(sample);
            if (process.env.NODE_ENV !== "production") {
              console.log("[meta-creatives] preview source audit sample", sample);
            }
          }
        }
      }
      accountPerf.rows_build_ms += Date.now() - tRowsBuild;
      accountPerf.rows_built += insights.length;
      perf.accounts.push(accountPerf);
      perf.counters.creative_ids_seen = (perf.counters.creative_ids_seen ?? 0) + creativeIds.length;
      perf.counters.creative_ids_for_details = (perf.counters.creative_ids_for_details ?? 0) + creativeIdsForDetails.length;
      perf.counters.account_image_hashes_seen = (perf.counters.account_image_hashes_seen ?? 0) + accountImageHashes.length;
    } catch (error: unknown) {
      console.warn("[meta-creatives] account fetch failed", {
        businessId,
        accountId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const rowsMissingAllMedia = rawRows
    .filter(
      (row) =>
        !row.thumbnail_url &&
        !row.image_url &&
        !row.preview_url &&
        row.id &&
        !row.id.startsWith("creative_") &&
        !row.id.startsWith("adset_")
    )
    .map((row) => row.id);

  if (enableMediaRecovery && rowsMissingAllMedia.length > 0) {
    mediaFallbackRowsRequested += rowsMissingAllMedia.length;
    const tMediaFallback = Date.now();
    console.log("[meta-creatives] media fallback scan", {
      rows_missing_all_media: rowsMissingAllMedia.length,
    });
    const mediaFallbackMap = await fetchAdCreativeMediaByAdIds(rowsMissingAllMedia, accessToken);
    for (const row of rawRows) {
      if (row.thumbnail_url || row.image_url || row.preview_url) continue;
      const fallbackAd = mediaFallbackMap.get(row.id);
      const fallbackCreative = fallbackAd?.creative ?? null;
      if (!fallbackCreative) continue;

      const collected = collectPreviewCandidates(fallbackCreative, new Map<string, string>());
      const candidate1 = collected.candidates[0]?.url ?? null;
      const candidate2 = collected.candidates[1]?.url ?? candidate1;
      const creativeThumb = normalizeMediaUrl(fallbackCreative.thumbnail_url);
      const creativeImage = normalizeMediaUrl(fallbackCreative.image_url);
      const chosenThumb = creativeThumb ?? candidate1;
      const chosenImage = creativeImage ?? candidate2;
      const chosenPreview = chosenThumb ?? chosenImage;
      if (!chosenPreview) continue;

      row.thumbnail_url = chosenThumb;
      row.image_url = chosenImage;
      row.preview_url = chosenPreview;
      row.preview_state = "preview";
      if (!row.preview.image_url && !row.preview.poster_url) {
        row.preview = {
          ...row.preview,
          render_mode: "image",
          image_url: chosenImage ?? chosenPreview,
          poster_url: chosenThumb ?? chosenPreview,
          source: row.preview.source ?? "image_url",
        };
      }
    }
    if (process.env.NODE_ENV !== "production") {
      const unresolvedAfterFallback = rawRows.filter(
        (row) => !row.thumbnail_url && !row.image_url && !row.preview_url && row.id && !row.id.startsWith("creative_") && !row.id.startsWith("adset_")
      ).length;
      console.log("[meta-creatives] media fallback result", {
        fallback_map_size: mediaFallbackMap.size,
        unresolved_after_fallback: unresolvedAfterFallback,
      });
    }
    addStageMs("media_fallback_ms", Date.now() - tMediaFallback);

    const unresolvedAdIds = rawRows
      .filter(
        (row) =>
          !row.thumbnail_url &&
          !row.image_url &&
          !row.preview_url &&
          row.id &&
          !row.id.startsWith("creative_") &&
          !row.id.startsWith("adset_")
      )
      .map((row) => row.id);

    if (unresolvedAdIds.length > 0) {
      mediaDirectFallbackRowsRequested += unresolvedAdIds.length;
      const tDirectFallback = Date.now();
      console.log("[meta-creatives] media direct fallback scan", {
        unresolved_ad_ids: unresolvedAdIds.length,
      });
      const directFallbackMap = await fetchAdCreativeMediaDirectByAdIds(unresolvedAdIds, accessToken);
      for (const row of rawRows) {
        if (row.thumbnail_url || row.image_url || row.preview_url) continue;
        const directAd = directFallbackMap.get(row.id);
        const directCreative = directAd?.creative ?? null;
        if (!directCreative) continue;

        const collected = collectPreviewCandidates(directCreative, new Map<string, string>());
        const candidate1 = collected.candidates[0]?.url ?? null;
        const candidate2 = collected.candidates[1]?.url ?? candidate1;
        const creativeThumb = normalizeMediaUrl(directCreative.thumbnail_url);
        const creativeImage = normalizeMediaUrl(directCreative.image_url);
        const chosenThumb = creativeThumb ?? candidate1;
        const chosenImage = creativeImage ?? candidate2;
        const chosenPreview = chosenThumb ?? chosenImage;
        if (!chosenPreview) continue;

        row.thumbnail_url = chosenThumb;
        row.image_url = chosenImage;
        row.preview_url = chosenPreview;
        row.preview_state = "preview";
        if (!row.preview.image_url && !row.preview.poster_url) {
          row.preview = {
            ...row.preview,
            render_mode: "image",
            image_url: chosenImage ?? chosenPreview,
            poster_url: chosenThumb ?? chosenPreview,
            source: row.preview.source ?? "image_url",
          };
        }
      }

      if (process.env.NODE_ENV !== "production") {
        const unresolvedAfterDirectFallback = rawRows.filter(
          (row) => !row.thumbnail_url && !row.image_url && !row.preview_url && row.id && !row.id.startsWith("creative_") && !row.id.startsWith("adset_")
        ).length;
        console.log("[meta-creatives] media direct fallback result", {
          direct_fallback_map_size: directFallbackMap.size,
          unresolved_after_direct_fallback: unresolvedAfterDirectFallback,
        });
      }
      addStageMs("media_direct_fallback_ms", Date.now() - tDirectFallback);
    }
  }

  const unresolvedCopyAdIds = rawRows
    .filter(
      (row) =>
        !normalizeCopyText(row.copy_text) &&
        row.copy_variants.length === 0 &&
        row.headline_variants.length === 0 &&
        row.description_variants.length === 0 &&
        row.id &&
        !row.id.startsWith("creative_") &&
        !row.id.startsWith("adset_")
    )
    .map((row) => row.id);

  if (unresolvedCopyAdIds.length > 0) {
    const tCopyRecovery = Date.now();
    const deepCopyMap = await fetchAdCreativeMediaDirectByAdIds(unresolvedCopyAdIds, accessToken);
    for (const row of rawRows) {
      if (normalizeCopyText(row.copy_text) || row.copy_variants.length > 0 || row.headline_variants.length > 0 || row.description_variants.length > 0) {
        continue;
      }
      const deepAd = deepCopyMap.get(row.id);
      const deepCreative = deepAd?.creative ?? null;
      if (!deepCreative) {
        row.copy_debug_sources = mergeDebugSources(row.copy_debug_sources, ["deep_ad_fetch"]);
        row.unresolved_reason = row.unresolved_reason ?? "deep_ad_fetch_no_creative";
        continue;
      }
      if (!row.object_story_id && typeof deepCreative.object_story_id === "string" && deepCreative.object_story_id.trim().length > 0) {
        row.object_story_id = deepCreative.object_story_id.trim();
      }
      if (!row.effective_object_story_id && typeof deepCreative.effective_object_story_id === "string" && deepCreative.effective_object_story_id.trim().length > 0) {
        row.effective_object_story_id = deepCreative.effective_object_story_id.trim();
      }
      const extracted = resolveCreativeCopyExtraction(deepCreative);
      const applied = applyExtractionToRow(
        row,
        extracted,
        "deep_ad_fetch",
        "deep_ad_fetch_no_copy_fields"
      );
      Object.assign(row, applied);
    }
    addStageMs("copy_deep_recovery_ms", Date.now() - tCopyRecovery);
  }

  const scopedRows = format === "all" ? rawRows : rawRows.filter((row) => row.format === format);
  const creativeUsageMap = scopedRows.reduce<Map<string, Set<string>>>((acc, row) => {
    const existing = acc.get(row.creative_id) ?? new Set<string>();
    existing.add(row.id);
    acc.set(row.creative_id, existing);
    return acc;
  }, new Map<string, Set<string>>());

  if (process.env.NODE_ENV !== "production") {
    console.log("[meta-creatives] before grouping", {
      businessId,
      groupBy,
      format,
      sort,
      raw_rows: rawRows.length,
      scoped_rows: scopedRows.length,
      unique_creatives: creativeUsageMap.size,
    });
  }

  let rows = groupRows(scopedRows, groupBy, creativeUsageMap);
  rows = sortRows(rows, sort);

  // Copy enrichment fallback path for /copies use-cases.
  const unresolvedCopyRows = rows.filter((row) => !normalizeCopyText(row.copy_text));
  if (unresolvedCopyRows.length > 0) {
    const storyLookupIds = Array.from(
      new Set(
        unresolvedCopyRows.flatMap((row) => {
          const candidates = [
            row.object_story_id,
            row.effective_object_story_id,
            row.post_id,
            extractPostIdFromStoryIdentifier(row.object_story_id ?? null),
            extractPostIdFromStoryIdentifier(row.effective_object_story_id ?? null),
          ];
          return candidates.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
        })
      )
    );
    const storyCopyMap = await fetchStoryCopyMap(storyLookupIds, accessToken);
    if (storyCopyMap.size > 0) {
      rows = rows.map((row) => {
        if (normalizeCopyText(row.copy_text)) return row;
        const lookupCandidates = [
          row.object_story_id,
          row.effective_object_story_id,
          row.post_id,
          extractPostIdFromStoryIdentifier(row.object_story_id ?? null),
          extractPostIdFromStoryIdentifier(row.effective_object_story_id ?? null),
        ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
        const storyHit = lookupCandidates.map((id) => storyCopyMap.get(id)).find((item) => Boolean(item)) ?? null;
        if (!storyHit) {
          return {
            ...row,
            copy_debug_sources: mergeDebugSources(row.copy_debug_sources, ["story_lookup"]),
            unresolved_reason: row.unresolved_reason ?? "story_lookup_no_text",
          };
        }
        return applyExtractionToRow(
          row,
          {
            copy_text: null,
            copy_variants: storyHit.message,
            headline_variants: storyHit.headline,
            description_variants: storyHit.description,
            copy_source: "story_lookup",
          },
          "story_lookup",
          "story_lookup_no_text"
        );
      });
    }

    const htmlFallbackCandidateRows = rows.filter((row) => !normalizeCopyText(row.copy_text));
    const unresolvedCreativeIds = Array.from(
      new Set(
        htmlFallbackCandidateRows
          .map((row) => row.creative_id)
          .filter((creativeId): creativeId is string => typeof creativeId === "string" && creativeId.trim().length > 0)
      )
    ).slice(0, 50);
    if (unresolvedCreativeIds.length > 0) {
      const previewByCreativeId = new Map<string, ReturnType<typeof extractVariantsFromPreviewHtml>>();
      for (const creativeId of unresolvedCreativeIds) {
        const preview = await fetchCreativeDetailPreviewHtml(creativeId, accessToken);
        if (!preview?.html) continue;
        previewByCreativeId.set(creativeId, extractVariantsFromPreviewHtml(preview.html));
      }
      if (previewByCreativeId.size > 0) {
        rows = rows.map((row) => {
          if (normalizeCopyText(row.copy_text)) return row;
          const previewExtracted = previewByCreativeId.get(row.creative_id);
          if (!previewExtracted) {
            return {
              ...row,
              copy_debug_sources: mergeDebugSources(row.copy_debug_sources, ["preview_html_fallback"]),
              unresolved_reason: row.unresolved_reason ?? "preview_html_unavailable",
            };
          }
          return applyExtractionToRow(
            row,
            {
              copy_text: null,
              copy_variants: previewExtracted.copy_variants,
              headline_variants: previewExtracted.headline_variants,
              description_variants: previewExtracted.description_variants,
              copy_source: "preview_html",
            },
            "preview_html_fallback",
            "preview_html_no_copy"
          );
        });
      }
    }
  }

  rows = rows.map((row) => {
    const hasCopy = Boolean(
      normalizeCopyText(row.copy_text) ||
        row.copy_variants.length > 0 ||
        row.headline_variants.length > 0 ||
        row.description_variants.length > 0
    );
    if (hasCopy) return row;
    return {
      ...row,
      unresolved_reason: row.unresolved_reason ?? "no_recoverable_copy_after_all_stages",
    };
  });

  if (process.env.NODE_ENV !== "production") {
    const duplicateNames = rows.filter((r, i, arr) => arr.findIndex((x) => x.name === r.name) !== i);
    console.log("[meta-creatives] after grouping and sorting", {
      groupBy,
      scoped_input: scopedRows.length,
      final_rows: rows.length,
      rows_reduced_by: scopedRows.length - rows.length,
      duplicate_names_remaining: duplicateNames.length,
      sample_rows: rows.slice(0, 5).map((r) => ({
        id: r.id,
        creative_id: r.creative_id,
        name: r.name.slice(0, 40),
        associated_ads_count: r.associated_ads_count,
        spend: r.spend,
      })),
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ status: "no_data", rows: [] });
  }

  // ── Resolve cached thumbnail URLs ──────────────────────────────────
  const cacheItems = rows.map((row) => ({
    creative_id: row.creative_id,
    thumbnail_url: row.thumbnail_url,
    image_url: row.image_url,
  }));
  const tMediaCache = Date.now();
  const cacheMap = enableMediaCache ? await MediaCacheService.resolveUrls(cacheItems, businessId) : new Map<string, { url: string; source: "cache" | "external" }>();
  addStageMs("media_cache_ms", Date.now() - tMediaCache);

  const includeDebugFields = debugPreview || debugThumbnail || debugPerf;
  const responseRows: MetaCreativeApiRow[] = rows.map((row) => {
    const cached = cacheMap.get(row.creative_id);
    const cachedThumbnailUrl = cached?.source === "cache" ? cached.url : null;
    const tableThumbnailFromRow = normalizeMediaUrl(row.table_thumbnail_url ?? null);
    const cardPreviewFromRow = normalizeMediaUrl(row.card_preview_url ?? null);
    const rowPreviewImage = normalizeMediaUrl(row.preview.image_url ?? null);
    const rowPreviewPoster = normalizeMediaUrl(row.preview.poster_url ?? null);
    const finalThumbnailUrl =
      tableThumbnailFromRow ??
      normalizeMediaUrl(row.thumbnail_url) ??
      normalizeMediaUrl(cachedThumbnailUrl) ??
      normalizeMediaUrl(row.preview_url) ??
      normalizeMediaUrl(row.image_url) ??
      rowPreviewPoster ??
      rowPreviewImage;
    const rowImageUrl = normalizeMediaUrl(row.image_url);
    const rowPreviewUrl = normalizeMediaUrl(row.preview_url);
    const rowThumbnailUrl = normalizeMediaUrl(row.thumbnail_url);
    const cardFallbackThumbnail = normalizeMediaUrl(cardPreviewByCreativeId.get(row.creative_id) ?? null);
    const preferredCardImageUrl =
      (cardPreviewFromRow && !isThumbnailLikeUrl(cardPreviewFromRow) ? cardPreviewFromRow : null) ??
      (rowImageUrl && !isThumbnailLikeUrl(rowImageUrl) ? rowImageUrl : null) ??
      (rowPreviewUrl && !isThumbnailLikeUrl(rowPreviewUrl) ? rowPreviewUrl : null) ??
      (rowPreviewImage && !isThumbnailLikeUrl(rowPreviewImage) ? rowPreviewImage : null) ??
      (rowPreviewPoster && !isThumbnailLikeUrl(rowPreviewPoster) ? rowPreviewPoster : null) ??
      (cardFallbackThumbnail && !isThumbnailLikeUrl(cardFallbackThumbnail) ? cardFallbackThumbnail : null) ??
      rowImageUrl ??
      rowPreviewUrl ??
      rowPreviewImage ??
      rowPreviewPoster ??
      cardPreviewFromRow ??
      cardFallbackThumbnail ??
      rowThumbnailUrl ??
      finalThumbnailUrl;
    const finalImageUrl = rowImageUrl ?? preferredCardImageUrl ?? finalThumbnailUrl;
    const finalPreviewUrl =
      rowPreviewUrl ??
      preferredCardImageUrl ??
      finalThumbnailUrl;
    const previewState: LegacyPreviewState = finalPreviewUrl ? "preview" : "unavailable";
    const finalNullReason = finalThumbnailUrl
      ? null
      : row.debug_stage_null_reason ?? "final_map_no_thumbnail";
    const finalPreviewPayload: NormalizedRenderPreviewPayload =
      finalPreviewUrl && row.preview.render_mode === "unavailable"
        ? {
            ...row.preview,
            render_mode: row.preview.video_url ? "video" : "image",
            image_url:
              normalizeMediaUrl(row.preview.image_url) ??
              preferredCardImageUrl ??
              finalImageUrl ??
              finalThumbnailUrl,
            poster_url:
              normalizeMediaUrl(row.preview.poster_url) ??
              preferredCardImageUrl ??
              finalThumbnailUrl ??
              finalImageUrl,
            source: row.preview.source ?? "thumbnail_url",
          }
        : row.preview.render_mode === "image"
        ? {
            ...row.preview,
            image_url:
              normalizeMediaUrl(row.preview.image_url) && !isLikelyLowResCreativeUrl(row.preview.image_url)
                ? row.preview.image_url
                : finalImageUrl ?? row.preview.image_url,
            poster_url:
              normalizeMediaUrl(row.preview.poster_url) && !isLikelyLowResCreativeUrl(row.preview.poster_url)
                ? row.preview.poster_url
                : preferredCardImageUrl ?? finalThumbnailUrl ?? row.preview.poster_url,
          }
        : row.preview;
    const tableThumbnailCandidates = [
      tableThumbnailFromRow,
      rowThumbnailUrl,
      normalizeMediaUrl(cachedThumbnailUrl),
      rowPreviewPoster,
      rowPreviewUrl,
      rowImageUrl,
      rowPreviewImage,
    ].filter((value): value is string => Boolean(value));
    const tableThumbnailUrl = tableThumbnailCandidates[0] ?? null;

    const cardCandidates = [
      preferredCardImageUrl,
      cardPreviewFromRow,
      rowImageUrl,
      rowPreviewImage,
      rowPreviewUrl,
      rowPreviewPoster,
      cardFallbackThumbnail,
      rowThumbnailUrl,
      tableThumbnailUrl,
    ].filter((value): value is string => Boolean(value));

    const cardPrimary =
      cardCandidates.find((candidate) => !isThumbnailLikeUrl(candidate)) ??
      cardCandidates[0] ??
      null;
    const cardPreviewUrl =
      cardPrimary === tableThumbnailUrl
        ? cardCandidates.find((candidate) => candidate !== tableThumbnailUrl) ?? cardPrimary
        : cardPrimary;
    const baseRow: MetaCreativeApiRow = {
      id: row.id,
      creative_id: row.creative_id,
      object_story_id: row.object_story_id ?? null,
      effective_object_story_id: row.effective_object_story_id ?? null,
      post_id: row.post_id ?? null,
      associated_ads_count: row.associated_ads_count,
      account_id: row.account_id,
      account_name: row.account_name,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      currency: row.currency,
      name: row.name,
      copy_text: row.copy_text ?? null,
      copy_variants: row.copy_variants ?? [],
      headline_variants: row.headline_variants ?? [],
      description_variants: row.description_variants ?? [],
      copy_source: row.copy_source ?? null,
      copy_debug_sources: row.copy_debug_sources ?? [],
      unresolved_reason: row.unresolved_reason ?? null,
      preview_url: finalPreviewUrl,
      preview_source: row.preview_source,
      thumbnail_url: finalThumbnailUrl,
      image_url: finalImageUrl,
      table_thumbnail_url: tableThumbnailUrl,
      card_preview_url: cardPreviewUrl,
      is_catalog: row.is_catalog,
      preview_state: previewState,
      preview: finalPreviewPayload,
      launch_date: row.launch_date,
      tags: row.tags,
      ai_tags: Object.keys(row.ai_tags).length > 0 ? row.ai_tags : normalizeAiTags(row.tags),
      format: row.format,
      creative_type: row.creative_type,
      creative_type_label: row.creative_type_label,
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
      cached_thumbnail_url: cachedThumbnailUrl,
    };
    if (!includeDebugFields) return baseRow;
    return {
      ...baseRow,
      debug_stage_fetch_source: row.debug_stage_fetch_source ?? null,
      debug_stage_has_raw_ad: row.debug_stage_has_raw_ad ?? false,
      debug_stage_raw_ad_id: row.debug_stage_raw_ad_id ?? null,
      debug_stage_raw_ad_creative: row.debug_stage_raw_ad_creative ?? false,
      debug_stage_raw_ad_creative_thumbnail_url: row.debug_stage_raw_ad_creative_thumbnail_url ?? null,
      debug_stage_enriched_ad_creative: row.debug_stage_enriched_ad_creative ?? false,
      debug_stage_enriched_ad_creative_thumbnail_url: row.debug_stage_enriched_ad_creative_thumbnail_url ?? null,
      debug_stage_row_input_thumbnail_url: row.debug_stage_row_input_thumbnail_url ?? null,
      debug_stage_final_thumbnail_url: finalThumbnailUrl,
      debug_stage_null_reason: finalNullReason,
      debug_raw_creative_thumbnail_url: row.debug_raw_creative_thumbnail_url ?? null,
      debug_enriched_creative_thumbnail_url: row.debug_enriched_creative_thumbnail_url ?? null,
      debug_resolved_thumbnail_source: row.debug_resolved_thumbnail_source ?? null,
      debug_resolution_stage: "response-map",
      debug_creative_object_type: row.debug_creative_object_type ?? null,
      debug_creative_video_ids: row.debug_creative_video_ids ?? null,
      debug_creative_effective_object_story_id: row.debug_creative_effective_object_story_id ?? null,
      debug_creative_object_story_id: row.debug_creative_object_story_id ?? null,
      debug_creative_object_story_video_id: row.debug_creative_object_story_video_id ?? null,
      debug_creative_asset_video_ids: row.debug_creative_asset_video_ids ?? null,
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
        unavailable: responseRows.filter((r) => r.preview_state === "unavailable").length,
      },
      samples: responseRows.slice(0, 5).map((r) => ({
        id: r.id,
        name: r.name.slice(0, 40),
        format: r.format,
        preview_state: r.preview_state,
        preview_url: r.preview_url ? r.preview_url.slice(0, 80) : null,
        preview_source: r.preview_source,
        thumbnail_url: r.thumbnail_url ? r.thumbnail_url.slice(0, 80) : null,
        image_url: r.image_url ? r.image_url.slice(0, 80) : null,
        table_thumbnail_url: r.table_thumbnail_url ? r.table_thumbnail_url.slice(0, 80) : null,
        card_preview_url: r.card_preview_url ? r.card_preview_url.slice(0, 80) : null,
        is_catalog: r.is_catalog,
        preview_render_mode: r.preview.render_mode,
      })),
    });

    if (previewAuditSamples.length > 0) {
      console.log("[meta-creatives] preview source ranking", summarizePreviewAudit(previewAuditSamples));
    }
  }
  if (debugPreview) {
    console.log("[meta-creatives] raw preview fields (first 5)", responseRows.slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      thumbnail_url: r.thumbnail_url,
      image_url: r.image_url,
      preview_url: r.preview_url,
      preview_state: r.preview_state,
      is_catalog: r.is_catalog,
      format: r.format,
      debug_stage_fetch_source: r.debug_stage_fetch_source ?? null,
      debug_stage_has_raw_ad: r.debug_stage_has_raw_ad ?? false,
      debug_stage_raw_ad_id: r.debug_stage_raw_ad_id ?? null,
      debug_stage_raw_ad_creative: r.debug_stage_raw_ad_creative ?? false,
      debug_stage_raw_ad_creative_thumbnail_url: r.debug_stage_raw_ad_creative_thumbnail_url ?? null,
      debug_stage_enriched_ad_creative: r.debug_stage_enriched_ad_creative ?? false,
      debug_stage_enriched_ad_creative_thumbnail_url: r.debug_stage_enriched_ad_creative_thumbnail_url ?? null,
      debug_stage_row_input_thumbnail_url: r.debug_stage_row_input_thumbnail_url ?? null,
      debug_stage_final_thumbnail_url: r.debug_stage_final_thumbnail_url ?? null,
      debug_stage_null_reason: r.debug_stage_null_reason ?? null,
      debug_raw_creative_thumbnail_url: r.debug_raw_creative_thumbnail_url ?? null,
      debug_enriched_creative_thumbnail_url: r.debug_enriched_creative_thumbnail_url ?? null,
      debug_resolved_thumbnail_source: r.debug_resolved_thumbnail_source ?? null,
      debug_resolution_stage: r.debug_resolution_stage ?? null,
      debug_creative_object_type: r.debug_creative_object_type ?? null,
      debug_creative_video_ids: r.debug_creative_video_ids ?? null,
      debug_creative_effective_object_story_id: r.debug_creative_effective_object_story_id ?? null,
      debug_creative_object_story_id: r.debug_creative_object_story_id ?? null,
      debug_creative_object_story_video_id: r.debug_creative_object_story_video_id ?? null,
      debug_creative_asset_video_ids: r.debug_creative_asset_video_ids ?? null,
    })));
  }

  // Debug: Log thumbnail URLs for first 5 creatives
  if (process.env.NODE_ENV !== "production" && responseRows.length > 0) {
    responseRows.slice(0, 5).forEach((row) => {
      console.log("meta creative thumbnail", {
        ad_id: row.id,
        thumbnail_url: row.thumbnail_url ?? null,
        image_url: row.image_url ?? null,
      });
    });
  }
  if (debugPreview) {
    return NextResponse.json({
      status: "ok",
      rows: responseRows,
      preview_debug: {
        sampled: previewAuditSamples,
        ranking: summarizePreviewAudit(previewAuditSamples),
      },
      performance_debug: debugPerf
        ? {
            ...perf,
            total_ms: Date.now() - requestStartedAt,
            counters: {
              ...perf.counters,
              assigned_accounts: assignedAccountIds.length,
              raw_rows: rawRows.length,
              response_rows: responseRows.length,
              preview_audit_samples: previewAuditSamples.length,
              preview_audit_validation_requests: previewAuditValidationRequests,
              media_recovery_enabled: enableMediaRecovery ? 1 : 0,
              creative_basics_fallback_enabled: enableCreativeBasicsFallback ? 1 : 0,
              creative_details_enabled: enableCreativeDetails ? 1 : 0,
              thumbnail_backfill_enabled: enableThumbnailBackfill ? 1 : 0,
              card_thumbnail_backfill_enabled: enableCardThumbnailBackfill ? 1 : 0,
              image_hash_lookup_enabled: enableImageHashLookup ? 1 : 0,
              media_cache_enabled: enableMediaCache ? 1 : 0,
              insight_ad_ids: totalInsightAdIds,
              ads_loaded_for_insights: totalAdMapHits,
              media_fallback_rows_requested: mediaFallbackRowsRequested,
              media_direct_fallback_rows_requested: mediaDirectFallbackRowsRequested,
            },
          }
        : undefined,
    });
  }

  if (debugPerf) {
    return NextResponse.json({
      status: "ok",
      rows: responseRows,
      performance_debug: {
        ...perf,
        total_ms: Date.now() - requestStartedAt,
        counters: {
          ...perf.counters,
          assigned_accounts: assignedAccountIds.length,
          raw_rows: rawRows.length,
          response_rows: responseRows.length,
          preview_audit_samples: previewAuditSamples.length,
          preview_audit_validation_requests: previewAuditValidationRequests,
          media_recovery_enabled: enableMediaRecovery ? 1 : 0,
          creative_basics_fallback_enabled: enableCreativeBasicsFallback ? 1 : 0,
          creative_details_enabled: enableCreativeDetails ? 1 : 0,
          thumbnail_backfill_enabled: enableThumbnailBackfill ? 1 : 0,
          card_thumbnail_backfill_enabled: enableCardThumbnailBackfill ? 1 : 0,
          image_hash_lookup_enabled: enableImageHashLookup ? 1 : 0,
          media_cache_enabled: enableMediaCache ? 1 : 0,
          insight_ad_ids: totalInsightAdIds,
          ads_loaded_for_insights: totalAdMapHits,
          media_fallback_rows_requested: mediaFallbackRowsRequested,
          media_direct_fallback_rows_requested: mediaDirectFallbackRowsRequested,
        },
      },
    });
  }

  return NextResponse.json({ status: "ok", rows: responseRows });
}
