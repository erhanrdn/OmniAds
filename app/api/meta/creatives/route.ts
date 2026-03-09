import { NextRequest, NextResponse } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";
import { requireBusinessAccess } from "@/lib/access";
import { MediaCacheService } from "@/lib/media-cache/media-service";

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
type PreviewRenderMode = "html_preview" | "video" | "image" | "unavailable";
type NormalizedPreviewSource =
  | "preview_url"
  | "thumbnail_url"
  | "image_url"
  | "image_hash"
  | "ad_preview_html"
  | "preview_html_video"
  | "preview_html_image"
  | null;
type NormalizedPreviewKind = "image" | "video" | "catalog";

interface NormalizedRenderPreviewPayload {
  render_mode: PreviewRenderMode;
  html: string | null;
  image_url: string | null;
  video_url: string | null;
  poster_url: string | null;
  source: NormalizedPreviewSource;
  is_catalog: boolean;
}

interface AdPreviewDebugResult {
  hasHtml: boolean;
  html: string | null;
  extractedUrl: string | null;
  extractedImageUrl: string | null;
  extractedVideoUrl: string | null;
  extractedPosterUrl: string | null;
  format: string | null;
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
    videos: Array<{ thumbnail_url: string | null; image_url: string | null }>;
  };
  promoted_object: {
    promoted_product_set_id: string | null;
    promoted_catalog_id: string | null;
    adset_promoted_product_set_id: string | null;
    adset_promoted_catalog_id: string | null;
  };
  image_hash_lookup: Array<{ hash: string; resolved: boolean; resolved_url: string | null }>;
  ad_preview_html: {
    has_html: boolean;
    extracted_url: string | null;
    format: string | null;
  };
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

interface MetaAdPreviewRecord {
  body?: string;
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
    thumbnail_id?: string | null;
    thumbnail_url?: string | null;
    image_url?: string | null;
    image_hash?: string | null;
    object_story_spec?: {
      link_data?: {
        picture?: string | null;
        image_hash?: string | null;
        child_attachments?: Array<{ picture?: string | null; image_url?: string | null; image_hash?: string | null }> | null;
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

interface MetaAdCreativeMediaOnlyRecord {
  id?: string;
  creative?: MetaAdRecord["creative"];
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

function detectPreviewKind(creative: MetaAdRecord["creative"], isCatalog: boolean): NormalizedPreviewKind {
  if (isCatalog) return "catalog";
  const objectType = creative?.object_type?.toUpperCase() ?? "";
  const hasVideoData = Boolean(
    creative?.object_story_spec?.video_data?.thumbnail_url ||
      creative?.object_story_spec?.video_data?.image_url ||
      (creative?.asset_feed_spec?.videos?.length ?? 0) > 0
  );
  if (objectType === "VIDEO" || hasVideoData) return "video";
  return "image";
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
  imageHashLookup: Map<string, string>,
  adPreviewHtmlUrl: string | null = null
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

  pushCandidate(candidates, "ad_preview_html", adPreviewHtmlUrl);

  const deduped: Array<{ source: string; url: string }> = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    deduped.push(candidate);
  }

  return { candidates: deduped, imageHashResolutions };
}

async function buildNormalizedPreview(input: {
  creative: MetaAdRecord["creative"];
  promotedObject: MetaPromotedObjectLike;
  imageHashLookup: Map<string, string>;
  adPreview?: AdPreviewDebugResult | null;
  validationCache: Map<string, UrlValidationResult>;
}): Promise<{
  preview: NormalizedRenderPreviewPayload;
  legacy: {
    preview_url: string | null;
    preview_source: string | null;
    preview_state: LegacyPreviewState;
    thumbnail_url: string | null;
    image_url: string | null;
    is_catalog: boolean;
  };
  candidateAudit: PreviewAuditCandidate[];
  imageHashResolutions: Array<{ hash: string; resolved: boolean; resolved_url: string | null }>;
}> {
  const { creative, promotedObject, imageHashLookup, adPreview = null, validationCache } = input;
  const isCatalog = detectIsCatalog(creative, promotedObject);
  const kind = detectPreviewKind(creative, isCatalog);
  const seededCandidates = collectPreviewCandidates(creative, imageHashLookup, null);
  const firstSeededCandidate = seededCandidates.candidates[0]?.url ?? null;
  const secondSeededCandidate = seededCandidates.candidates[1]?.url ?? firstSeededCandidate;
  const html = adPreview?.html ?? null;
  const previewHtmlVideo = normalizeMediaUrl(adPreview?.extractedVideoUrl ?? null);
  const previewHtmlPoster = normalizeMediaUrl(adPreview?.extractedPosterUrl ?? null);
  const previewHtmlImage = normalizeMediaUrl(adPreview?.extractedImageUrl ?? null);

  // Always try to provide URLs, regardless of catalog status
  if (html) {
    // Fall back to creative's direct URLs when HTML extraction yields nothing
    const creativeThumbnail = normalizeMediaUrl(creative?.thumbnail_url);
    const creativeImage = normalizeMediaUrl(creative?.image_url);
    const effectiveImage = previewHtmlImage ?? creativeThumbnail ?? creativeImage ?? firstSeededCandidate;
    const effectivePoster = previewHtmlPoster ?? effectiveImage;

    const preview: NormalizedRenderPreviewPayload = {
      render_mode: "html_preview",
      html,
      image_url: effectiveImage,
      video_url: previewHtmlVideo ?? null,
      poster_url: effectivePoster,
      source: "ad_preview_html",
      is_catalog: isCatalog,
    };
    const legacyUrl = effectivePoster ?? effectiveImage ?? null;
    return {
      preview,
      legacy: {
        preview_url: legacyUrl,
        preview_source: "ad_preview_html",
        preview_state: legacyUrl ? "preview" : "unavailable",
        thumbnail_url: creativeThumbnail ?? firstSeededCandidate ?? legacyUrl,
        image_url: creativeImage ?? secondSeededCandidate ?? legacyUrl,
        is_catalog: isCatalog,
      },
      candidateAudit: [],
      imageHashResolutions: [],
    };
  }

  if (previewHtmlVideo) {
    const creativeThumbnail = normalizeMediaUrl(creative?.thumbnail_url);
    const creativeImage = normalizeMediaUrl(creative?.image_url);
    const effectiveImage = previewHtmlImage ?? creativeThumbnail ?? creativeImage ?? firstSeededCandidate;
    const effectivePoster = previewHtmlPoster ?? effectiveImage;

    const preview: NormalizedRenderPreviewPayload = {
      render_mode: "video",
      html: null,
      image_url: effectiveImage,
      video_url: previewHtmlVideo,
      poster_url: effectivePoster,
      source: "preview_html_video",
      is_catalog: isCatalog,
    };
    const legacyUrl = effectivePoster ?? effectiveImage ?? previewHtmlVideo;
    return {
      preview,
      legacy: {
        preview_url: legacyUrl,
        preview_source: "preview_html_video",
        preview_state: "preview",
        thumbnail_url: creativeThumbnail ?? firstSeededCandidate ?? legacyUrl,
        image_url: creativeImage ?? secondSeededCandidate ?? legacyUrl,
        is_catalog: isCatalog,
      },
      candidateAudit: [],
      imageHashResolutions: [],
    };
  }

  // If we reach here: no HTML preview, no video. Use candidate URLs directly.
  // This is key: don't skip URL generation just because it's a catalog.
  const { candidates, imageHashResolutions } = seededCandidates;

  const candidateAudit: PreviewAuditCandidate[] = [];
  let chosenCandidate: { source: string; url: string } | null = null;
  
  // Skip expensive validation for performance, just pick first valid-looking candidate
  for (const candidate of candidates) {
    if (chosenCandidate) break;
    // Basic check: does it look like a URL?
    if (candidate.url && candidate.url.startsWith("http")) {
      chosenCandidate = candidate;
      break;
    }
  }

  // If still nothing, keep the first candidate even if validation would fail
  if (!chosenCandidate && candidates.length > 0) {
    chosenCandidate = candidates[0];
  }

  const top = chosenCandidate;
  const mapSource = (source: string | null): NormalizedPreviewSource => {
    if (!source) return null;
    if (source === "thumbnail_url") return "thumbnail_url";
    if (source === "image_hash_lookup") return "image_hash";
    return "image_url";
  
    // Her zaman bir render_mode ver - URL olmasa bile "image" mode'da placeholder gösterilecek
  };
  const preview: NormalizedRenderPreviewPayload = {
    render_mode: "image", // Her zaman image mode - frontend placeholder gösterecek
    html: null,
    image_url: top?.url ?? null,
    video_url: null,
    poster_url: top?.url ?? null,
    source: mapSource(top?.source ?? null),
    is_catalog: isCatalog,
  };

  const thumbnailCandidate = candidates[0]?.url ?? null;
  const imageCandidate = candidates[1]?.url ?? candidates[0]?.url ?? null;
  // URL olmasa bile preview state her zaman "preview" - frontend placeholder gösterecek
  const legacyState: LegacyPreviewState = "preview";

  return {
    preview,
    legacy: {
      preview_url: preview.image_url ?? preview.poster_url,
      preview_source: preview.source,
      preview_state: legacyState,
      thumbnail_url: thumbnailCandidate,
      image_url: imageCandidate,
      is_catalog: isCatalog,
    },
    candidateAudit,
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, "\"")
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&");
}

function extractPreviewMediaFromHtml(html: string): {
  imageUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
} {
  const decoded = decodeHtmlEntities(html);
  
  // Try to find CDN URLs in raw HTML first (often in data attributes or style)
  const cdnPatterns = [
    /https?:\/\/[^\s"'<>]*\.fbcdn\.net\/[^\s"'<>]*/gi,
    /https?:\/\/[^\s"'<>]*\.cdninstagram\.com\/[^\s"'<>]*/gi,
    /https?:\/\/scontent[^\s"'<>]*\.fbcdn\.net\/[^\s"'<>]*/gi,
  ];
  
  for (const pattern of cdnPatterns) {
    const matches = decoded.match(pattern);
    if (matches && matches.length > 0) {
      // Find largest/best quality image (usually has higher resolution in path)
      const bestMatch = matches
        .filter(url => !url.includes('emoji') && !url.includes('icon') && !url.includes('1x1'))
        .sort((a, b) => b.length - a.length)[0];
      if (bestMatch) {
        const normalized = normalizeMediaUrl(bestMatch);
        if (normalized) {
          return { imageUrl: normalized, videoUrl: null, posterUrl: normalized };
        }
      }
    }
  }
  
  const imagePatterns = [
    /<video[^>]*poster="([^"]+)"/i,
    /<video[^>]*poster='([^']+)'/i,
    /<img[^>]+src="([^"]+)"/i,
    /<img[^>]+src='([^']+)'/i,
  ];
  const videoPatterns = [
    /<video[^>]+src="([^"]+)"/i,
    /<video[^>]+src='([^']+)'/i,
    /<source[^>]+src="([^"]+)"/i,
    /<source[^>]+src='([^']+)'/i,
  ];

  for (const pattern of videoPatterns) {
    const match = decoded.match(pattern);
    const candidate = match?.[1];
    const normalized = normalizeMediaUrl(candidate);
    if (normalized) {
      const posterCandidate = decoded.match(/<video[^>]*poster=['"]([^'"]+)['"]/i)?.[1] ?? null;
      const posterUrl = normalizeMediaUrl(posterCandidate);
      const imageFallback =
        imagePatterns
          .map((imagePattern) => {
            const imageMatch = decoded.match(imagePattern);
            return imageMatch?.[2] ?? imageMatch?.[1] ?? null;
          })
          .map((value) => normalizeMediaUrl(value))
          .find(Boolean) ?? null;
      return { imageUrl: imageFallback, videoUrl: normalized, posterUrl };
    }
  }

  const imageUrl =
    imagePatterns
      .map((pattern) => {
        const match = decoded.match(pattern);
        return match?.[2] ?? match?.[1] ?? null;
      })
      .map((value) => normalizeMediaUrl(value))
      .find(Boolean) ?? null;

  return { imageUrl, videoUrl: null, posterUrl: null };
}

async function fetchAdPreviewDebugMap(
  adIds: string[],
  accessToken: string
): Promise<Map<string, AdPreviewDebugResult>> {
  const map = new Map<string, AdPreviewDebugResult>();
  const uniqueIds = Array.from(new Set(adIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return map;

  // Keep preview fetch lightweight for page load; trying every placement format is expensive.
  const formats = ["DESKTOP_FEED_STANDARD", "MOBILE_FEED_STANDARD"];
  const chunkSize = 20;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (adId) => {
        if (map.has(adId)) return;

        let bestHtmlOnly: AdPreviewDebugResult | null = null;

        for (const adFormat of formats) {
          const url = new URL(`https://graph.facebook.com/v25.0/${adId}/previews`);
          url.searchParams.set("ad_format", adFormat);
          url.searchParams.set("access_token", accessToken);

          try {
            const res = await fetch(url.toString(), {
              method: "GET",
              headers: { Accept: "application/json" },
              cache: "no-store",
            });
            if (!res.ok) continue;

            const payload = (await res.json().catch(() => null)) as { data?: MetaAdPreviewRecord[] } | null;
            const html = payload?.data?.[0]?.body ?? "";
            const hasHtml = html.length > 0;
            const extracted = hasHtml
              ? extractPreviewMediaFromHtml(html)
              : { imageUrl: null, videoUrl: null, posterUrl: null };
            const previewUrl = extracted.imageUrl ?? extracted.posterUrl ?? null;

            if (hasHtml || previewUrl || extracted.videoUrl) {
              const current: AdPreviewDebugResult = {
                hasHtml,
                html: hasHtml ? html : null,
                extractedUrl: previewUrl,
                extractedImageUrl: extracted.imageUrl,
                extractedVideoUrl: extracted.videoUrl,
                extractedPosterUrl: extracted.posterUrl,
                format: adFormat,
              };

              // Best-case: we have HTML plus at least one extracted media URL.
              if (hasHtml && (previewUrl || extracted.videoUrl)) {
                map.set(adId, current);
                return;
              }

              // Secondary: media URL without HTML is still useful.
              if (previewUrl || extracted.videoUrl) {
                map.set(adId, current);
                return;
              }

              // Keep html-only candidate and keep trying other ad formats for URLs.
              if (hasHtml && !bestHtmlOnly) {
                bestHtmlOnly = current;
              }
            }
          } catch {
            // swallow and try next format
          }
        }

        if (!map.has(adId) && bestHtmlOnly) {
          map.set(adId, bestHtmlOnly);
        }

        if (!map.has(adId)) {
          map.set(adId, {
            hasHtml: false,
            html: null,
            extractedUrl: null,
            extractedImageUrl: null,
            extractedVideoUrl: null,
            extractedPosterUrl: null,
            format: null,
          });
        }
      })
    );
  }

  return map;
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
          [
            "creative{",
            "id,name,object_type,effective_object_story_id,thumbnail_id,thumbnail_url,image_url,image_hash,",
            "object_story_spec{link_data{picture,image_hash,child_attachments{picture,image_url,image_hash}},video_data{image_url,thumbnail_url},photo_data{image_url},template_data},",
            "asset_feed_spec{catalog_id,product_set_id,images{url,image_url,original_url,hash,image_hash},videos{thumbnail_url,image_url}}",
            "}",
          ].join(""),
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
      "id,name,object_type,effective_object_story_id,thumbnail_id,thumbnail_url,image_url,image_hash,",
      "object_story_spec{link_data{picture,image_hash,child_attachments{picture,image_url,image_hash}},video_data{image_url,thumbnail_url},photo_data{image_url},template_data},",
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
    "thumbnail_id",
    "thumbnail_url",
    "image_url",
    "image_hash",
    "object_story_spec{link_data{picture,image_hash,child_attachments{picture,image_url,image_hash}},video_data{image_url,thumbnail_url},photo_data{image_url},template_data}",
    "asset_feed_spec{catalog_id,product_set_id,images{url,image_url,original_url,hash,image_hash},videos{thumbnail_url,image_url}}",
  ].join(",");

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
    [
      "creative{",
      "id,name,object_type,effective_object_story_id,thumbnail_id,thumbnail_url,image_url,image_hash,",
      "object_story_spec{link_data{picture,image_hash,child_attachments{picture,image_url,image_hash}},video_data{image_url,thumbnail_url},photo_data{image_url},template_data},",
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
        console.warn("[meta-creatives] ad creative media fallback non-ok", {
          status: res.status,
          chunk: i,
          count: idsChunk.length,
          raw: raw.slice(0, 300),
        });
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

async function toRawRow(
  insight: MetaInsightRecord,
  ad: MetaAdRecord | undefined,
  accountMeta: MetaAccountMeta,
  imageHashLookup: Map<string, string>,
  validationCache: Map<string, UrlValidationResult>,
  adPreview: AdPreviewDebugResult | null
): Promise<RawCreativeRow | null> {
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
  const normalizedPreview = await buildNormalizedPreview({
    creative,
    promotedObject,
    imageHashLookup,
    adPreview,
    validationCache,
  });
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
  const creativeId = creative?.id ?? adId;

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
    preview_url: normalizedPreview.legacy.preview_url,
    preview_source: normalizedPreview.legacy.preview_source,
    thumbnail_url: normalizedPreview.legacy.thumbnail_url,
    image_url: normalizedPreview.legacy.image_url,
    is_catalog: normalizedPreview.legacy.is_catalog,
    preview_state: normalizedPreview.legacy.preview_state,
    preview: normalizedPreview.preview,
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
    if (uniqueCurrencies.length > 1 && process.env.NODE_ENV !== "production") {
      console.log("[meta-creatives] mixed currencies in grouped row", {
        groupBy,
        groupKey: key,
        currencies: uniqueCurrencies,
      });
    }
    const previewRow = list.find((item) =>
      Boolean(item.preview.html || item.preview.video_url || item.preview.image_url || item.preview.poster_url)
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
      preview_url: groupedPreview.image_url ?? groupedPreview.poster_url ?? null,
      preview_source: groupedPreview.source,
      thumbnail_url: previewRow?.thumbnail_url ?? groupedPreview.poster_url ?? groupedPreview.image_url ?? null,
      image_url: previewRow?.image_url ?? groupedPreview.image_url ?? groupedPreview.poster_url ?? null,
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
  const params = request.nextUrl.searchParams;
  const businessId = params.get("businessId");
  const groupBy = (params.get("groupBy") as GroupBy | null) ?? "adName";
  const format = (params.get("format") as FormatFilter | null) ?? "all";
  const sort = (params.get("sort") as SortKey | null) ?? "roas";
  const start = params.get("start") ?? toISODate(nDaysAgo(29));
  const end = params.get("end") ?? toISODate(new Date());
  const debugPreview = params.get("debugPreview") === "1";
  const debugThumbnail = params.get("debugThumbnail") === "1";
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
  const urlValidationCache = new Map<string, UrlValidationResult>();
  const previewAuditSamples: PreviewAuditSample[] = [];
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
      const missingThumbnailCreativeIds = creativeIds.filter((creativeId) => {
        const detail = creativeDetailsMap.get(creativeId);
        return !normalizeMediaUrl(detail?.thumbnail_url ?? null);
      });
      const creativeThumbnailMap = await fetchCreativeThumbnailMap(
        missingThumbnailCreativeIds,
        integration.access_token,
        150,
        120,
        debugThumbnail
      );
      const accountImageHashes = Array.from(
        new Set(
          [...adMap.values()].flatMap((ad) => {
            const detailCreative = ad.creative?.id ? creativeDetailsMap.get(ad.creative.id) : undefined;
            const mergedCreative = mergeCreativeData(ad.creative ?? null, detailCreative);
            if (mergedCreative?.id && !normalizeMediaUrl(mergedCreative.thumbnail_url)) {
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
            }
            return extractImageHashesFromCreative(mergedCreative);
          })
        )
      );
      const adImageUrlMap = await fetchAdImageUrlMap(accountId, accountImageHashes, integration.access_token);

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
          creative_missing_thumbnail: missingThumbnailCreativeIds.length,
          creative_thumbnail_fallback_loaded: creativeThumbnailMap.size,
          image_hashes_seen: accountImageHashes.length,
          image_hash_urls_resolved: adImageUrlMap.size,
          matched_ads: matchedAds,
          with_creative_data: withCreative,
          fallback_fetched: missingAdIds.length > 0 ? missingAdIds.length : 0,
        });
      }

      const accountSampleAdIds = insightAdIds.slice(0, perAccountSampleLimit);
      const adPreviewDebugMap = await fetchAdPreviewDebugMap(insightAdIds, integration.access_token);
      let accountSampleCount = 0;

      for (const insight of insights) {
        const ad = insight.ad_id ? adMap.get(insight.ad_id) : undefined;
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
        const row = await toRawRow(
          insight,
          enrichedAd,
          accountMeta,
          adImageUrlMap,
          urlValidationCache,
          insight.ad_id ? adPreviewDebugMap.get(insight.ad_id) ?? null : null
        );
        if (row) {
          rawRows.push(row);
          if (accountSampleCount < perAccountSampleLimit && accountSampleAdIds.includes(row.id)) {
            accountSampleCount += 1;
            const creative = mergedCreative;
            const promotedObject = enrichedAd?.promoted_object ?? null;
            const adsetPromotedObject = enrichedAd?.adset?.promoted_object ?? null;
            const adPreviewDebug = adPreviewDebugMap.get(row.id) ?? {
              hasHtml: false,
              html: null,
              extractedUrl: null,
              extractedImageUrl: null,
              extractedVideoUrl: null,
              extractedPosterUrl: null,
              format: null,
            };

            const collected = collectPreviewCandidates(creative, adImageUrlMap, adPreviewDebug.extractedUrl);
            const candidateAudit: PreviewAuditCandidate[] = [];
            for (const candidate of collected.candidates) {
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
              ad_preview_html: {
                has_html: adPreviewDebug.hasHtml,
                extracted_url: adPreviewDebug.extractedUrl,
                format: adPreviewDebug.format,
              },
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
    } catch (error: unknown) {
      console.warn("[meta-creatives] account fetch failed", {
        businessId,
        accountId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const missingPreviewAdIds = rawRows
    .filter((row) => !row.preview_url && row.id && !row.id.startsWith("creative_") && !row.id.startsWith("adset_"))
    .map((row) => row.id)
    .slice(0, 25); // Limit to first 25 for performance

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
    .map((row) => row.id)
    .slice(0, 25); // Limit to first 25 for performance

  if (rowsMissingAllMedia.length > 0) {
    const mediaFallbackMap = await fetchAdCreativeMediaByAdIds(rowsMissingAllMedia, integration.access_token);
    for (const row of rawRows) {
      if (row.thumbnail_url || row.image_url || row.preview_url) continue;
      const fallbackAd = mediaFallbackMap.get(row.id);
      const fallbackCreative = fallbackAd?.creative ?? null;
      if (!fallbackCreative) continue;

      const collected = collectPreviewCandidates(fallbackCreative, new Map<string, string>(), null);
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
  }

  const adPreviewDebugMap = await fetchAdPreviewDebugMap(missingPreviewAdIds, integration.access_token);
  if (adPreviewDebugMap.size > 0) {
    for (const row of rawRows) {
      if (row.preview_url) continue;
      const fallbackPreview = adPreviewDebugMap.get(row.id);
      const fallbackUrl = fallbackPreview?.extractedUrl ?? null;
      if (!fallbackUrl) continue;

      const validation = await validateMediaUrl(fallbackUrl, urlValidationCache);
      if (!validation.isValid) continue;

      row.preview = {
        render_mode: "image",
        html: null,
        image_url: fallbackUrl,
        video_url: null,
        poster_url: fallbackUrl,
        source: "ad_preview_html",
        is_catalog: row.preview.is_catalog,
      };
      row.preview_url = row.preview.image_url;
      row.preview_source = row.preview.source;
      row.preview_state = "preview";
      row.thumbnail_url = row.thumbnail_url ?? fallbackUrl;
      row.image_url = row.image_url ?? fallbackUrl;
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

  // ── Resolve cached thumbnail URLs ──────────────────────────────────
  const cacheItems = rows.map((row) => ({
    creative_id: row.creative_id,
    thumbnail_url: row.thumbnail_url,
    image_url: row.image_url,
  }));
  const cacheMap = await MediaCacheService.resolveUrls(cacheItems, businessId);

  const responseRows: MetaCreativeApiRow[] = rows.map((row) => {
    const previewState: LegacyPreviewState = row.preview.render_mode === "unavailable" ? "unavailable" : "preview";
    const cached = cacheMap.get(row.creative_id);
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
      preview: row.preview,
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
      cached_thumbnail_url: cached?.source === "cache" ? cached.url : null,
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
    });
  }

  return NextResponse.json({ status: "ok", rows: responseRows });
}
