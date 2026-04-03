import type {
  CreativeClassificationSignals,
  CreativeDeliveryType,
  CreativeFormat,
  CreativePrimaryType,
  CreativeSecondaryType,
  CreativeTaxonomySource,
  CreativeType,
  CreativeVisualFormat,
  MetaAdRecord,
  MetaPromotedObjectLike,
} from "@/lib/meta/creatives-types";

type CreativeTaxonomyFields = {
  creative_delivery_type: CreativeDeliveryType;
  creative_visual_format: CreativeVisualFormat;
  creative_primary_type: CreativePrimaryType;
  creative_primary_label: string | null;
  creative_secondary_type: CreativeSecondaryType | null;
  creative_secondary_label: string | null;
  classification_signals: CreativeClassificationSignals | null;
};

type CreativeTaxonomyLike = Pick<
  CreativeTaxonomyFields,
  | "creative_delivery_type"
  | "creative_visual_format"
  | "creative_primary_type"
  | "creative_primary_label"
  | "creative_secondary_type"
  | "creative_secondary_label"
> & {
  taxonomy_source?: CreativeTaxonomySource | null;
};

const PRIMARY_TYPE_LABELS: Record<CreativePrimaryType, string> = {
  standard: "Standard",
  catalog: "Catalog",
  flexible: "Flexible",
  carousel: "Carousel",
  video: "Video",
  mixed: "Mixed",
};

const LEGACY_CREATIVE_TYPE_LABELS: Record<CreativeType, string> = {
  feed: "Feed",
  video: "Video",
  flexible: "Flexible ad",
  feed_catalog: "Feed (Catalog ads)",
};

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyObject(value: Record<string, unknown> | null | undefined): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).length > 0;
}

function countPresentItems(items: Array<unknown> | null | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.filter(Boolean).length;
}

function toSecondaryType(
  primaryType: CreativePrimaryType,
  visualFormat: CreativeVisualFormat
): CreativeSecondaryType | null {
  if (primaryType !== "catalog" && primaryType !== "flexible") return null;
  if (visualFormat === "video" || visualFormat === "carousel") return visualFormat;
  return null;
}

function toPrimaryType(
  deliveryType: CreativeDeliveryType,
  visualFormat: CreativeVisualFormat
): CreativePrimaryType {
  if (deliveryType === "catalog") return "catalog";
  if (deliveryType === "flexible") return "flexible";
  if (visualFormat === "carousel") return "carousel";
  if (visualFormat === "video") return "video";
  return "standard";
}

export function getCreativePrimaryTypeLabel(type: CreativePrimaryType): string {
  return PRIMARY_TYPE_LABELS[type] ?? "Standard";
}

export function getLegacyCreativeTypeLabel(type: CreativeType): string {
  return LEGACY_CREATIVE_TYPE_LABELS[type] ?? "Feed";
}

export function shouldShowCreativePrimaryPill(type: CreativePrimaryType): boolean {
  return type !== "standard";
}

function shouldShowCreativeTaxonomy(input: CreativeTaxonomyLike): boolean {
  return input.taxonomy_source !== "legacy_fallback";
}

export function getCreativeDisplayPills(input: CreativeTaxonomyLike): {
  primaryLabel: string | null;
  secondaryLabel: string | null;
} {
  if (!shouldShowCreativeTaxonomy(input)) {
    return {
      primaryLabel: null,
      secondaryLabel: null,
    };
  }

  const primaryLabel =
    shouldShowCreativePrimaryPill(input.creative_primary_type)
      ? input.creative_primary_label ?? getCreativePrimaryTypeLabel(input.creative_primary_type)
      : null;

  const secondaryLabel =
    primaryLabel && input.creative_secondary_type
      ? input.creative_secondary_label ?? getCreativePrimaryTypeLabel(input.creative_secondary_type)
      : null;

  return {
    primaryLabel,
    secondaryLabel,
  };
}

export function getCreativePreviewBadgeLabel(input: CreativeTaxonomyLike): string | null {
  return getCreativeDisplayPills(input).primaryLabel;
}

export function deriveLegacyCreativeType(primaryType: CreativePrimaryType): CreativeType {
  if (primaryType === "catalog") return "feed_catalog";
  if (primaryType === "flexible") return "flexible";
  if (primaryType === "video") return "video";
  return "feed";
}

export function deriveLegacyCreativeClassification(input: {
  creative_delivery_type: CreativeDeliveryType;
  creative_visual_format: CreativeVisualFormat;
  creative_primary_type: CreativePrimaryType;
}): {
  format: CreativeFormat;
  creative_type: CreativeType;
  creative_type_label: string;
} {
  const format = deriveCreativeFormat({
    creative_delivery_type: input.creative_delivery_type,
    creative_visual_format: input.creative_visual_format,
  });
  const creativeType = deriveLegacyCreativeType(input.creative_primary_type);

  return {
    format,
    creative_type: creativeType,
    creative_type_label: getLegacyCreativeTypeLabel(creativeType),
  };
}

export function deriveCreativeFormat(input: {
  creative_delivery_type: CreativeDeliveryType;
  creative_visual_format: CreativeVisualFormat;
}): CreativeFormat {
  if (input.creative_delivery_type === "catalog") return "catalog";
  if (input.creative_visual_format === "video") return "video";
  return "image";
}

export function getCreativeVisualFormatLabel(format: CreativeVisualFormat): string {
  if (format === "video") return "Video";
  if (format === "carousel") return "Carousel";
  if (format === "mixed") return "Mixed";
  return "Image";
}

export function getCreativeFormatSummaryLabel(input: CreativeTaxonomyLike): string | null {
  if (!shouldShowCreativeTaxonomy(input)) {
    return null;
  }

  const primaryLabel = input.creative_primary_label ?? getCreativePrimaryTypeLabel(input.creative_primary_type);
  const secondaryLabel =
    input.creative_secondary_type
      ? input.creative_secondary_label ?? getCreativePrimaryTypeLabel(input.creative_secondary_type)
      : null;

  if (
    (input.creative_primary_type === "catalog" || input.creative_primary_type === "flexible") &&
    secondaryLabel
  ) {
    return `${primaryLabel} + ${secondaryLabel}`;
  }

  if (input.creative_primary_type === "catalog" || input.creative_primary_type === "flexible") {
    return primaryLabel;
  }

  return getCreativeVisualFormatLabel(input.creative_visual_format);
}

export function reconcileCreativeTaxonomyWithVideoEvidence(
  taxonomy: CreativeTaxonomyFields,
  evidence: {
    preview?: {
      render_mode?: "video" | "image" | "unavailable" | null;
      video_url?: string | null;
    } | null;
    thumbstop?: number | null;
    video25?: number | null;
    video50?: number | null;
    video75?: number | null;
    video100?: number | null;
  }
): CreativeTaxonomyFields {
  const hasPreviewVideo =
    evidence.preview?.render_mode === "video" ||
    hasNonEmptyString(evidence.preview?.video_url);
  const hasStructuralVideoSignals =
    Boolean(taxonomy.classification_signals?.has_top_level_video_id) ||
    Boolean(taxonomy.classification_signals?.has_object_story_video_data) ||
    Boolean(taxonomy.classification_signals?.has_video_object_type) ||
    (taxonomy.classification_signals?.asset_feed_video_count ?? 0) > 0;

  // Video metrics alone are not enough to flip taxonomy. Meta can generate
  // delivery-side motion/video behavior from a single image creative.
  if (!hasPreviewVideo && !hasStructuralVideoSignals) {
    return taxonomy;
  }

  let visualFormat = taxonomy.creative_visual_format;
  let primaryType = taxonomy.creative_primary_type;
  let secondaryType = taxonomy.creative_secondary_type;

  if (primaryType === "standard") {
    visualFormat = "video";
    primaryType = "video";
    secondaryType = null;
  } else if (primaryType === "catalog" || primaryType === "flexible") {
    visualFormat = "video";
    secondaryType = "video";
  } else if (primaryType === "video") {
    visualFormat = "video";
    secondaryType = null;
  } else {
    return taxonomy;
  }

  return {
    ...taxonomy,
    creative_visual_format: visualFormat,
    creative_primary_type: primaryType,
    creative_primary_label: getCreativePrimaryTypeLabel(primaryType),
    creative_secondary_type: secondaryType,
    creative_secondary_label: secondaryType ? getCreativePrimaryTypeLabel(secondaryType) : null,
  };
}

export function coerceCreativeTaxonomyFromLegacy(input: {
  format?: CreativeFormat | null;
  creative_type?: CreativeType | null;
  is_catalog?: boolean | null;
}): CreativeTaxonomyFields {
  const isCatalog =
    input.is_catalog === true ||
    input.creative_type === "feed_catalog" ||
    input.format === "catalog";
  const isFlexible = input.creative_type === "flexible";
  const isVideo = input.creative_type === "video" || input.format === "video";

  const deliveryType: CreativeDeliveryType = isCatalog
    ? "catalog"
    : isFlexible
    ? "flexible"
    : "standard";
  const visualFormat: CreativeVisualFormat = isVideo ? "video" : "image";
  const primaryType = toPrimaryType(deliveryType, visualFormat);
  const secondaryType = toSecondaryType(primaryType, visualFormat);

  return {
    creative_delivery_type: deliveryType,
    creative_visual_format: visualFormat,
    creative_primary_type: primaryType,
    creative_primary_label: getCreativePrimaryTypeLabel(primaryType),
    creative_secondary_type: secondaryType,
    creative_secondary_label: secondaryType ? getCreativePrimaryTypeLabel(secondaryType) : null,
    classification_signals: null,
  };
}

export function classifyMetaCreative(input: {
  creative: MetaAdRecord["creative"];
  promotedObject: MetaPromotedObjectLike;
}): CreativeTaxonomyFields {
  const { creative, promotedObject } = input;

  const objectType = creative?.object_type?.toUpperCase() ?? "";
  const hasTemplateData = hasNonEmptyObject(creative?.object_story_spec?.template_data ?? null);
  const hasPromotedProductSetId = hasNonEmptyString(promotedObject?.product_set_id);
  const hasPromotedCatalogId = hasNonEmptyString(promotedObject?.catalog_id);
  const hasAssetFeedCatalogId = hasNonEmptyString(creative?.asset_feed_spec?.catalog_id);
  const hasAssetFeedProductSetId = hasNonEmptyString(creative?.asset_feed_spec?.product_set_id);
  const childAttachmentCount = countPresentItems(creative?.object_story_spec?.link_data?.child_attachments ?? null);
  const assetFeedImageCount = countPresentItems(creative?.asset_feed_spec?.images ?? null);
  const assetFeedVideoCount = countPresentItems(creative?.asset_feed_spec?.videos ?? null);
  const hasAssetFeedSpec = Boolean(creative?.asset_feed_spec);
  const hasObjectStoryVideoData = Boolean(creative?.object_story_spec?.video_data);
  const hasTopLevelVideoId = hasNonEmptyString(creative?.video_id);
  const hasVideoObjectType = objectType === "VIDEO";
  const hasAssetFeedVideos = assetFeedVideoCount > 0;
  const hasMixedAssetFamilies = assetFeedImageCount > 0 && assetFeedVideoCount > 0;
  const hasMultiImageAssets = assetFeedImageCount > 1;
  const hasMultiVideoAssets = assetFeedVideoCount > 1;

  const isCatalog =
    objectType === "DYNAMIC" ||
    hasTemplateData ||
    hasPromotedProductSetId ||
    hasPromotedCatalogId ||
    hasAssetFeedCatalogId ||
    hasAssetFeedProductSetId;

  const visualFormat: CreativeVisualFormat =
    childAttachmentCount >= 2
      ? "carousel"
      : hasTopLevelVideoId || hasVideoObjectType || hasObjectStoryVideoData || hasAssetFeedVideos
      ? "video"
      : "image";

  const isFlexible =
    !isCatalog &&
    hasAssetFeedSpec &&
    (hasMultiImageAssets || hasMultiVideoAssets || hasMixedAssetFamilies);

  const deliveryType: CreativeDeliveryType = isCatalog
    ? "catalog"
    : isFlexible
    ? "flexible"
    : "standard";
  const primaryType = toPrimaryType(deliveryType, visualFormat);
  const secondaryType = toSecondaryType(primaryType, visualFormat);

  return {
    creative_delivery_type: deliveryType,
    creative_visual_format: visualFormat,
    creative_primary_type: primaryType,
    creative_primary_label: getCreativePrimaryTypeLabel(primaryType),
    creative_secondary_type: secondaryType,
    creative_secondary_label: secondaryType ? getCreativePrimaryTypeLabel(secondaryType) : null,
    classification_signals: {
      is_catalog_by_object_type: objectType === "DYNAMIC",
      has_template_data: hasTemplateData,
      has_promoted_product_set_id: hasPromotedProductSetId,
      has_promoted_catalog_id: hasPromotedCatalogId,
      has_asset_feed_catalog_id: hasAssetFeedCatalogId,
      has_asset_feed_product_set_id: hasAssetFeedProductSetId,
      child_attachment_count: childAttachmentCount,
      has_top_level_video_id: hasTopLevelVideoId,
      has_object_story_video_data: hasObjectStoryVideoData,
      has_video_object_type: hasVideoObjectType,
      asset_feed_image_count: assetFeedImageCount,
      asset_feed_video_count: assetFeedVideoCount,
      has_asset_feed_spec: hasAssetFeedSpec,
      has_mixed_asset_families: hasMixedAssetFamilies,
      has_multi_image_assets: hasMultiImageAssets,
      has_multi_video_assets: hasMultiVideoAssets,
    },
  };
}

export function aggregateCreativeTaxonomy(
  rows: CreativeTaxonomyLike[]
): Omit<CreativeTaxonomyFields, "classification_signals"> {
  const deliveryTypes = Array.from(new Set(rows.map((row) => row.creative_delivery_type)));
  const visualFormats = Array.from(new Set(rows.map((row) => row.creative_visual_format)));
  const primaryTypes = Array.from(new Set(rows.map((row) => row.creative_primary_type)));
  const secondaryTypes = Array.from(
    new Set(rows.map((row) => row.creative_secondary_type).filter((value): value is CreativeSecondaryType => Boolean(value)))
  );

  const primaryType: CreativePrimaryType = primaryTypes.length === 1 ? primaryTypes[0] : "mixed";
  const deliveryType: CreativeDeliveryType = deliveryTypes.length === 1 ? deliveryTypes[0] : "mixed";
  const visualFormat: CreativeVisualFormat = visualFormats.length === 1 ? visualFormats[0] : "mixed";
  const secondaryType: CreativeSecondaryType | null =
    primaryTypes.length === 1 && secondaryTypes.length === 1 ? secondaryTypes[0] : null;

  return {
    creative_delivery_type: deliveryType,
    creative_visual_format: visualFormat,
    creative_primary_type: primaryType,
    creative_primary_label: getCreativePrimaryTypeLabel(primaryType),
    creative_secondary_type: secondaryType,
    creative_secondary_label: secondaryType ? getCreativePrimaryTypeLabel(secondaryType) : null,
  };
}
