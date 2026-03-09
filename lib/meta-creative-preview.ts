export type CreativePreviewState = "preview" | "catalog" | "unavailable";
export type CreativeFormat = "image" | "video" | "catalog";
export type CreativeType = "feed" | "video" | "flexible" | "feed_catalog";

export interface MetaCreativeLike {
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
      child_attachments?: Array<{
        picture?: string | null;
        image_url?: string | null;
        image_hash?: string | null;
      }> | null;
    } | null;
    video_data?: {
      image_url?: string | null;
      thumbnail_url?: string | null;
    } | null;
    photo_data?: {
      image_url?: string | null;
    } | null;
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
    videos?: Array<{
      thumbnail_url?: string | null;
      image_url?: string | null;
    }> | null;
  } | null;
}

export interface MetaPromotedObjectLike {
  product_set_id?: string | null;
  catalog_id?: string | null;
}

interface NormalizeCreativePreviewInput {
  creative: MetaCreativeLike | null | undefined;
  promotedObject?: MetaPromotedObjectLike | null;
  imageHashLookup?: Map<string, string> | Record<string, string> | null;
}

interface NormalizeCreativePreviewOutput {
  /** Best available preview URL. Set even for catalog ads when a thumbnail is available. */
  preview_url: string | null;
  preview_state: CreativePreviewState;
  /**
   * "catalog"  — DYNAMIC/DPA ad (product_set_id / catalog_id detected)
   * "video"    — video_data, asset_feed videos, or VIDEO object_type
   * "image"    — static image creative
   */
  format: CreativeFormat;
  creative_type: CreativeType;
  creative_type_label: string;
  preview_source: string | null;
  is_catalog: boolean;
  thumbnail_url: string | null;
  image_url: string | null;
  debug: {
    has_thumbnail_url: boolean;
    has_image_url: boolean;
    has_object_story_spec: boolean;
    has_asset_feed_spec: boolean;
    has_link_data_picture: boolean;
    has_link_data_image_hash: boolean;
    has_video_data_thumbnail_url: boolean;
    has_asset_feed_images: boolean;
    has_asset_feed_videos: boolean;
    has_promoted_product_set_id: boolean;
    has_promoted_catalog_id: boolean;
    source: string | null;
  };
}

function normalizeUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

function normalizeHash(hash: unknown): string | null {
  if (typeof hash !== "string") return null;
  const value = hash.trim();
  return value ? value : null;
}

function resolveImageHashUrl(
  imageHashLookup: Map<string, string> | Record<string, string> | null | undefined,
  hash: string
): string | null {
  if (!imageHashLookup) return null;

  const rawValue =
    imageHashLookup instanceof Map
      ? imageHashLookup.get(hash) ?? imageHashLookup.get(hash.toLowerCase())
      : imageHashLookup[hash] ?? imageHashLookup[hash.toLowerCase()];

  return normalizeUrl(rawValue);
}

export function extractCreativeImageHashes(
  creative: MetaCreativeLike | null | undefined
): string[] {
  const hashes = new Set<string>();

  const pushHash = (value: unknown) => {
    const normalized = normalizeHash(value);
    if (normalized) hashes.add(normalized);
  };

  pushHash(creative?.object_story_spec?.link_data?.image_hash);
  for (const attachment of creative?.object_story_spec?.link_data?.child_attachments ?? []) {
    pushHash(attachment?.image_hash);
  }
  for (const image of creative?.asset_feed_spec?.images ?? []) {
    pushHash(image?.hash);
    pushHash(image?.image_hash);
  }

  return Array.from(hashes);
}

function toCreativeTypeLabel(type: CreativeType): string {
  if (type === "feed_catalog") return "Feed (Catalog ads)";
  if (type === "video") return "Video";
  if (type === "flexible") return "Flexible ad";
  return "Feed";
}

function pickFirstUrl(candidates: Array<{ source: string; value: unknown }>): {
  url: string | null;
  source: string | null;
} {
  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate.value);
    if (normalized) {
      return { url: normalized, source: candidate.source };
    }
  }
  return { url: null, source: null };
}

function collectUrlCandidates(
  items: Array<Record<string, unknown>> | null | undefined,
  sourcePrefix: string,
  keys: string[]
): Array<{ source: string; value: unknown }> {
  const candidates: Array<{ source: string; value: unknown }> = [];
  for (let i = 0; i < (items?.length ?? 0); i += 1) {
    const item = items?.[i];
    if (!item) continue;
    for (const key of keys) {
      candidates.push({
        source: `${sourcePrefix}[${i}].${key}`,
        value: item[key],
      });
    }
  }
  return candidates;
}

export function normalizeCreativePreview({
  creative,
  promotedObject,
  imageHashLookup,
}: NormalizeCreativePreviewInput): NormalizeCreativePreviewOutput {
  const thumbnailUrl = normalizeUrl(creative?.thumbnail_url);
  const imageUrl = normalizeUrl(creative?.image_url);
  const imageHashCandidates = extractCreativeImageHashes(creative);
  const hashUrlCandidates = imageHashCandidates.map((hash) => ({
    source: `image_hash:${hash}`,
    value: resolveImageHashUrl(imageHashLookup, hash),
  }));

  const childAttachmentCandidates = collectUrlCandidates(
    (creative?.object_story_spec?.link_data?.child_attachments ??
      null) as Array<Record<string, unknown>> | null,
    "object_story_spec.link_data.child_attachments",
    ["picture", "image_url"]
  );
  const assetVideoCandidates = collectUrlCandidates(
    (creative?.asset_feed_spec?.videos ?? null) as Array<Record<string, unknown>> | null,
    "asset_feed_spec.videos",
    ["thumbnail_url", "image_url"]
  );
  const assetImageCandidates = collectUrlCandidates(
    (creative?.asset_feed_spec?.images ?? null) as Array<Record<string, unknown>> | null,
    "asset_feed_spec.images",
    ["image_url", "url", "original_url"]
  );

  // Resolution priority chain — strict order from highest-confidence preview
  // sources to lowest-confidence catalog asset fallbacks.
  const picked = pickFirstUrl([
    // 1-2) Direct creative fields
    { source: "thumbnail_url", value: creative?.thumbnail_url },
    { source: "image_url", value: creative?.image_url },
    // 3-5) object_story_spec video/photo
    { source: "object_story_spec.video_data.thumbnail_url", value: creative?.object_story_spec?.video_data?.thumbnail_url },
    { source: "object_story_spec.video_data.image_url", value: creative?.object_story_spec?.video_data?.image_url },
    { source: "object_story_spec.photo_data.image_url", value: creative?.object_story_spec?.photo_data?.image_url },
    // 6) object_story_spec link picture
    { source: "object_story_spec.link_data.picture", value: creative?.object_story_spec?.link_data?.picture },
    // 7) child attachment picture/image_url (first valid in list order)
    ...childAttachmentCandidates,
    // hash lookup fallback
    ...hashUrlCandidates,
    // 8-9) asset videos
    ...assetVideoCandidates,
    // 10-12) asset images
    ...assetImageCandidates,
  ]);

  // ── Catalog detection ───────────────────────────────────────────────────────
  const objectType = creative?.object_type?.toUpperCase() ?? "";
  const isCatalogByObjectType = objectType === "DYNAMIC";
  const hasTemplateUrlSpec = Boolean(
    (creative?.object_story_spec?.template_data as Record<string, unknown> | null)?.["template_url"]
  );
  const hasPromotedProductSetId = Boolean(promotedObject?.product_set_id);
  const hasPromotedCatalogId = Boolean(promotedObject?.catalog_id);
  const hasAssetFeedCatalogSignals = Boolean(
    creative?.asset_feed_spec?.catalog_id || creative?.asset_feed_spec?.product_set_id
  );

  const isCatalog =
    isCatalogByObjectType ||
    hasTemplateUrlSpec ||
    hasPromotedProductSetId ||
    hasPromotedCatalogId ||
    hasAssetFeedCatalogSignals;

  // ── Format detection ────────────────────────────────────────────────────────
  // Catalog takes top priority — even if video fields exist, DPA/catalog is the
  // dominant characteristic for badge/UI purposes.
  const isVideoCreative =
    objectType === "VIDEO" ||
    Boolean(creative?.object_story_spec?.video_data?.thumbnail_url) ||
    Boolean(creative?.object_story_spec?.video_data?.image_url) ||
    (creative?.asset_feed_spec?.videos?.length ?? 0) > 0;

  const format: CreativeFormat = isCatalog ? "catalog" : isVideoCreative ? "video" : "image";
  const hasFlexibleSignals = !isCatalog && Boolean(creative?.asset_feed_spec);
  const creativeType: CreativeType = isCatalog
    ? "feed_catalog"
    : hasFlexibleSignals
    ? "flexible"
    : isVideoCreative
    ? "video"
    : "feed";

  // ── Preview state ───────────────────────────────────────────────────────────
  // If we have any valid preview URL, always expose it as a renderable preview.
  // Catalog-ness is already carried separately by `is_catalog` and `format`, so
  // the UI can still show a catalog badge without suppressing the image.
  const previewState: CreativePreviewState = picked.url
    ? "preview"
    : isCatalog
    ? "catalog"
    : "unavailable";

  return {
    preview_url: picked.url,          // expose URL even for catalog ads
    preview_state: previewState,
    format,
    creative_type: creativeType,
    creative_type_label: toCreativeTypeLabel(creativeType),
    preview_source: picked.source,
    is_catalog: isCatalog,
    thumbnail_url: thumbnailUrl,
    image_url: imageUrl,
    debug: {
      has_thumbnail_url: Boolean(thumbnailUrl),
      has_image_url: Boolean(imageUrl),
      has_object_story_spec: Boolean(creative?.object_story_spec),
      has_asset_feed_spec: Boolean(creative?.asset_feed_spec),
      has_link_data_picture: Boolean(normalizeUrl(creative?.object_story_spec?.link_data?.picture)),
      has_link_data_image_hash: Boolean(creative?.object_story_spec?.link_data?.image_hash),
      has_video_data_thumbnail_url: Boolean(
        normalizeUrl(creative?.object_story_spec?.video_data?.thumbnail_url)
      ),
      has_asset_feed_images: Boolean(creative?.asset_feed_spec?.images?.length),
      has_asset_feed_videos: Boolean(creative?.asset_feed_spec?.videos?.length),
      has_promoted_product_set_id: hasPromotedProductSetId,
      has_promoted_catalog_id: hasPromotedCatalogId,
      source: picked.source,
    },
  };
}

export function shouldLogMetaPreviewDebug(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.META_PREVIEW_DEBUG === "1";
}
