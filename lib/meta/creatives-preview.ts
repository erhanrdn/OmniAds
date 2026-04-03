import type {
  LegacyPreviewState,
  MetaAdRecord,
  MetaPromotedObjectLike,
  NormalizedPreviewSource,
  NormalizedRenderPreviewPayload,
  PreviewAuditCandidate,
  PreviewDebugPatch,
  PreviewRenderMode,
  UrlValidationResult,
} from "@/lib/meta/creatives-types";
import { classifyMetaCreative } from "@/lib/meta/creative-taxonomy";
import { normalizeMediaUrl, extractVideoIdsFromCreative } from "@/lib/meta/creatives-utils";

type CreativeStaticPreviewRowLike = {
  cardPreviewUrl?: string | null;
  card_preview_url?: string | null;
  tableThumbnailUrl?: string | null;
  table_thumbnail_url?: string | null;
  cachedThumbnailUrl?: string | null;
  cached_thumbnail_url?: string | null;
  thumbnailUrl?: string | null;
  thumbnail_url?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  previewUrl?: string | null;
  preview_url?: string | null;
  preview?: {
    image_url?: string | null;
    poster_url?: string | null;
  } | null;
};

export type CreativeStaticPreviewTier = "card" | "table";

// ── URL helpers ────────────────────────────────────────────────────────────────

function parsePreviewSizeFromUrl(url: string): { width: number; height: number } | null {
  const match = url.match(/p(\d+)x(\d+)/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

export function isLikelyLowResCreativeUrl(value: unknown): boolean {
  const url = normalizeMediaUrl(value);
  if (!url) return false;
  const parsedSize = parsePreviewSizeFromUrl(url);
  if (!parsedSize) return false;
  return Math.max(parsedSize.width, parsedSize.height) <= 220;
}

export function isThumbnailLikeUrl(value: unknown): boolean {
  const url = normalizeMediaUrl(value);
  if (!url) return false;
  if (isLikelyLowResCreativeUrl(url)) return true;
  return /thumbnail|thumb|_p\d+x\d+|emg1|\/t39\.2147-6\//i.test(url);
}

function isPreviewContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().startsWith("image/");
}

export function getCreativeStaticPreviewSources(
  row: CreativeStaticPreviewRowLike,
  tier: CreativeStaticPreviewTier
): string[] {
  const preferred =
    tier === "card"
      ? row.cardPreviewUrl ?? row.card_preview_url ?? null
      : row.tableThumbnailUrl ?? row.table_thumbnail_url ?? null;

  const candidates = [
    preferred,
    row.cardPreviewUrl ?? row.card_preview_url ?? null,
    row.imageUrl ?? row.image_url ?? null,
    row.preview?.image_url ?? null,
    row.preview?.poster_url ?? null,
    row.previewUrl ?? row.preview_url ?? null,
    row.cachedThumbnailUrl ?? row.cached_thumbnail_url ?? null,
    row.tableThumbnailUrl ?? row.table_thumbnail_url ?? null,
    row.thumbnailUrl ?? row.thumbnail_url ?? null,
  ];

  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeMediaUrl(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    resolved.push(normalized);
  }

  return resolved;
}

export async function validateMediaUrl(
  url: string,
  cache: Map<string, UrlValidationResult>
): Promise<UrlValidationResult> {
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
    const head = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store" });
    const headContentType = head.headers.get("content-type");
    const headContentLength = head.headers.get("content-length");
    if (head.ok && isPreviewContentType(headContentType)) {
      const result = buildResult("HEAD", head.status, head.url || url, headContentType, headContentLength, null);
      cache.set(url, result);
      return result;
    }
  } catch (error) {
    const result = buildResult("none", null, null, null, null, error instanceof Error ? error.message : String(error));
    cache.set(url, result);
  }

  try {
    const get = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store" });
    const contentType = get.headers.get("content-type");
    const contentLength = get.headers.get("content-length");
    const result = buildResult("GET", get.status, get.url || url, contentType, contentLength, null);
    cache.set(url, result);
    return result;
  } catch (error) {
    const result = buildResult("none", null, null, null, null, error instanceof Error ? error.message : String(error));
    cache.set(url, result);
    return result;
  }
}

// ── Thumbnail resolution ───────────────────────────────────────────────────────

export function resolveThumbnailUrl(input: {
  cachedThumbnailUrl?: string | null;
  creative?: MetaAdRecord["creative"] | null;
}): {
  url: string | null;
  source: "cached_thumbnail_url" | "creative.thumbnail_url" | "creative.image_url" | "none";
} {
  const cached = normalizeMediaUrl(input.cachedThumbnailUrl ?? null);
  if (cached) return { url: cached, source: "cached_thumbnail_url" };
  const creativeThumb = normalizeMediaUrl(input.creative?.thumbnail_url ?? null);
  if (creativeThumb) return { url: creativeThumb, source: "creative.thumbnail_url" };
  const creativeImage = normalizeMediaUrl(input.creative?.image_url ?? null);
  if (creativeImage) return { url: creativeImage, source: "creative.image_url" };
  return { url: null, source: "none" };
}

// ── Catalog detection ──────────────────────────────────────────────────────────

export function detectIsCatalog(
  creative: MetaAdRecord["creative"],
  promotedObject: MetaPromotedObjectLike
): boolean {
  return classifyMetaCreative({ creative, promotedObject }).creative_delivery_type === "catalog";
}

// ── Image hash extraction ──────────────────────────────────────────────────────

export function extractImageHashesFromCreative(creative: MetaAdRecord["creative"]): string[] {
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

// ── Preview scoring model ──────────────────────────────────────────────────────

export type PreviewCandidate = {
  source: string;
  url: string;
};

function pushCandidate(list: PreviewCandidate[], source: string, value: unknown): void {
  const url = normalizeMediaUrl(value);
  if (!url) return;
  list.push({ source, url });
}

export function scorePreviewCandidate(candidate: PreviewCandidate): number {
  const source = candidate.source;
  const url = candidate.url;

  let score = 0;

  if (!isLikelyLowResCreativeUrl(url)) score += 40;
  if (!isThumbnailLikeUrl(url)) score += 20;

  if (source === "image_hash_lookup") score += 35;
  if (source === "image_url") score += 30;
  if (source === "thumbnail_url") score += 10;

  if (source.includes("object_story_spec.video_data.image_url")) score += 32;
  if (source.includes("object_story_spec.video_data.thumbnail_url")) score += 18;
  if (source.includes("object_story_spec.photo_data.image_url")) score += 30;
  if (source.includes("object_story_spec.link_data.picture")) score += 26;
  if (source.includes("child_attachments[].image_url")) score += 24;
  if (source.includes("child_attachments[].picture")) score += 18;
  if (source.includes("asset_feed_spec.images[].image_url")) score += 34;
  if (source.includes("asset_feed_spec.images[].original_url")) score += 36;
  if (source.includes("asset_feed_spec.images[].url")) score += 22;
  if (source.includes("asset_feed_spec.videos[].image_url")) score += 24;
  if (source.includes("asset_feed_spec.videos[].thumbnail_url")) score += 16;

  return score;
}

export function pickBestCandidate(
  candidates: PreviewCandidate[],
  predicate?: (candidate: PreviewCandidate) => boolean
): PreviewCandidate | null {
  const filtered = predicate ? candidates.filter(predicate) : candidates.slice();
  if (filtered.length === 0) return null;

  let best = filtered[0];
  let bestScore = scorePreviewCandidate(best);

  for (let i = 1; i < filtered.length; i++) {
    const candidate = filtered[i];
    const score = scorePreviewCandidate(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

export function pickNextBestDistinctCandidate(
  candidates: PreviewCandidate[],
  usedUrl: string | null,
  predicate?: (candidate: PreviewCandidate) => boolean
): PreviewCandidate | null {
  return pickBestCandidate(
    candidates,
    (candidate) => candidate.url !== usedUrl && (!predicate || predicate(candidate))
  );
}

export function collectPreviewCandidates(
  creative: MetaAdRecord["creative"],
  imageHashLookup: Map<string, string>
): {
  candidates: PreviewCandidate[];
  imageHashResolutions: Array<{ hash: string; resolved: boolean; resolved_url: string | null }>;
} {
  const candidates: PreviewCandidate[] = [];

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
    return { hash, resolved: Boolean(normalized), resolved_url: normalized };
  });

  const deduped: PreviewCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    deduped.push(candidate);
  }

  return { candidates: deduped, imageHashResolutions };
}

// ── buildNormalizedPreview ─────────────────────────────────────────────────────

export function buildNormalizedPreview(input: {
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
  debug: PreviewDebugPatch;
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

  const resolvedThumbnail = resolveThumbnailUrl({ creative });

  const bestOverall = pickBestCandidate(candidates);
  const bestImageCandidate = pickBestCandidate(candidates, (c) => !isThumbnailLikeUrl(c.url));
  const bestThumbnailCandidate = pickBestCandidate(
    candidates,
    (c) => isThumbnailLikeUrl(c.url) || c.source.includes("thumbnail_url")
  );
  const bestNonThumbnailSourceCandidate = pickBestCandidate(
    candidates,
    (c) => !c.source.includes("thumbnail_url")
  );

  const tableTier =
    bestThumbnailCandidate?.url ?? resolvedThumbnail.url ?? bestOverall?.url ?? null;

  const cardTier =
    bestNonThumbnailSourceCandidate?.url ??
    bestImageCandidate?.url ??
    bestOverall?.url ??
    resolvedThumbnail.url ??
    null;

  const imageTier =
    bestImageCandidate?.url ??
    normalizeMediaUrl(creative?.image_url ?? null) ??
    cardTier ??
    tableTier;

  const previewImageTier = imageTier ?? cardTier ?? tableTier;

  const secondBestVisualCandidate = pickNextBestDistinctCandidate(
    candidates,
    bestImageCandidate?.url ?? bestOverall?.url ?? null,
    (c) => !isLikelyLowResCreativeUrl(c.url)
  );

  const previewPosterTier =
    secondBestVisualCandidate?.url ?? previewImageTier ?? cardTier ?? tableTier;

  const previewTier = previewImageTier ?? previewPosterTier ?? cardTier ?? tableTier;
  const previewSource = bestImageCandidate?.source ?? bestOverall?.source ?? null;
  const videoIds = extractVideoIdsFromCreative(creative);
  const resolvedVideoSource =
    videoIds
      .map((videoId) => videoSourceLookup.get(videoId)?.source ?? null)
      .find((source): source is string => Boolean(source)) ?? null;
  const resolvedVideoPoster =
    videoIds
      .map((videoId) => videoSourceLookup.get(videoId)?.picture ?? null)
      .find((poster): poster is string => Boolean(poster)) ?? null;

  const hasRenderableImage = Boolean(previewImageTier || previewPosterTier || cardTier || tableTier);

  const renderMode: PreviewRenderMode = resolvedVideoSource
    ? "video"
    : hasRenderableImage
    ? "image"
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

  // ── Preview debug patch ──────────────────────────────────────────────────────

  const previewDebugSelectedSource =
    previewSource ?? (resolvedThumbnail.source !== "none" ? resolvedThumbnail.source : null);

  const previewDebugSelectedUrl =
    renderMode === "video"
      ? (resolvedVideoPoster ?? previewPosterTier ?? previewImageTier ?? null)
      : renderMode === "image"
      ? (previewImageTier ?? previewPosterTier ?? previewTier ?? null)
      : null;

  const previewDebugResolutionStage =
    resolvedVideoSource ? "video_source" :
    previewSource === "image_hash_lookup" ? "image_hash_lookup" :
    previewSource?.includes("object_story_spec") ? "object_story_spec" :
    previewSource?.includes("asset_feed_spec") ? "asset_feed" :
    previewSource === "image_url" ? "creative_image" :
    previewSource === "thumbnail_url" ? "creative_thumbnail" :
    resolvedThumbnail.source === "creative.image_url" ? "creative_image_fallback" :
    resolvedThumbnail.source === "creative.thumbnail_url" ? "creative_thumbnail_fallback" :
    previewTier ? "fallback" :
    "unavailable";

  const previewDebugResolutionReason =
    renderMode === "video" ? "video_selected" :
    bestImageCandidate?.url ? "best_image_candidate" :
    bestThumbnailCandidate?.url ? "thumbnail_candidate" :
    resolvedThumbnail.url ? "resolved_thumbnail_fallback" :
    previewTier ? "generic_fallback" :
    "no_resolved_preview";

  const previewDebugNullReason: string | null =
    renderMode !== "unavailable" ? null :
    candidates.length === 0 && isCatalog ? "catalog_without_assets" :
    candidates.length === 0 && videoIds.length > 0 ? "video_without_poster" :
    candidates.length === 0 ? "no_candidates" :
    !hasRenderableImage && videoIds.length > 0 ? "video_without_poster" :
    !hasRenderableImage ? "no_renderable_image" :
    "unavailable";

  const previewDebug: PreviewDebugPatch = {
    stage_final_thumbnail_url: tableTier ?? null,
    stage_null_reason: previewDebugNullReason,
    resolved_thumbnail_source: previewDebugSelectedSource,
    resolution_stage: previewDebugResolutionStage,
    preview_selected_source: previewDebugSelectedSource,
    preview_selected_url: previewDebugSelectedUrl,
    preview_render_mode: renderMode,
    preview_candidates_count: candidates.length,
    preview_resolution_reason: previewDebugResolutionReason,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("[preview-resolve]", {
      creative_id: creative?.id ?? null,
      render_mode: renderMode,
      resolution_stage: previewDebugResolutionStage,
      preview_resolution_reason: previewDebugResolutionReason,
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
    candidateAudit: candidates.map((candidate) => ({
      source: candidate.source,
      url: candidate.url,
      validation: {
        isValid: true,
        method: "none",
        status: null,
        finalUrl: candidate.url,
        contentType: null,
        contentLength: null,
        error: null,
      },
    })),
    imageHashResolutions,
    debug: previewDebug,
  };
}
