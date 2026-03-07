export type CreativePreviewState = "preview" | "catalog" | "unavailable";

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
    } | null;
    video_data?: {
      image_url?: string | null;
      thumbnail_url?: string | null;
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
}

interface NormalizeCreativePreviewOutput {
  preview_url: string | null;
  preview_state: CreativePreviewState;
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

export function normalizeCreativePreview({
  creative,
  promotedObject,
}: NormalizeCreativePreviewInput): NormalizeCreativePreviewOutput {
  const thumbnailUrl = normalizeUrl(creative?.thumbnail_url);
  const imageUrl = normalizeUrl(creative?.image_url);

  const picked = pickFirstUrl([
    { source: "thumbnail_url", value: creative?.thumbnail_url },
    { source: "image_url", value: creative?.image_url },
    { source: "object_story_spec.link_data.picture", value: creative?.object_story_spec?.link_data?.picture },
    {
      source: "object_story_spec.video_data.thumbnail_url",
      value: creative?.object_story_spec?.video_data?.thumbnail_url,
    },
    {
      source: "asset_feed_spec.images[0].url",
      value:
        creative?.asset_feed_spec?.images?.[0]?.url ??
        creative?.asset_feed_spec?.images?.[0]?.image_url ??
        creative?.asset_feed_spec?.images?.[0]?.original_url,
    },
    {
      source: "asset_feed_spec.videos[0].thumbnail_url",
      value: creative?.asset_feed_spec?.videos?.[0]?.thumbnail_url,
    },
    {
      source: "object_story_spec.video_data.image_url",
      value: creative?.object_story_spec?.video_data?.image_url,
    },
    {
      source: "asset_feed_spec.videos[0].image_url",
      value: creative?.asset_feed_spec?.videos?.[0]?.image_url,
    },
  ]);

  const objectType = creative?.object_type?.toUpperCase() ?? "";
  const isCatalogByObjectType = objectType === "DYNAMIC";
  const hasPromotedProductSetId = Boolean(promotedObject?.product_set_id);
  const hasPromotedCatalogId = Boolean(promotedObject?.catalog_id);
  const hasAssetFeedCatalogSignals = Boolean(
    creative?.asset_feed_spec?.catalog_id || creative?.asset_feed_spec?.product_set_id
  );

  const isCatalog =
    isCatalogByObjectType ||
    hasPromotedProductSetId ||
    hasPromotedCatalogId ||
    hasAssetFeedCatalogSignals;

  const previewState: CreativePreviewState = isCatalog
    ? "catalog"
    : picked.url
    ? "preview"
    : "unavailable";

  return {
    preview_url: previewState === "preview" ? picked.url : null,
    preview_state: previewState,
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
