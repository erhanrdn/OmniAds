import { NextRequest } from "next/server";
import { getIntegration } from "@/lib/integrations";
import { MediaCacheService } from "@/lib/media-cache/media-service";
import {
  fetchAdCreativeMediaByAdIds,
  fetchAssignedAccountIds,
  fetchCreativeDetailPreviewHtml,
  fetchCreativeDetailsMap,
  fetchCreativeThumbnailMap,
} from "@/lib/meta/creatives-fetchers";
import { buildNormalizedPreview } from "@/lib/meta/creatives-preview";
import { mergeCreativeData } from "@/lib/meta/creatives-row-mappers";
import { buildCreativesResponse } from "@/lib/meta/creatives-service";
import { normalizeMediaUrl } from "@/lib/meta/creatives-utils";
import type { FormatFilter, GroupBy, SortKey } from "@/lib/meta/creatives-types";
import type { MetaAdRecord, NormalizedRenderPreviewPayload } from "@/lib/meta/creatives-types";
import {
  getMetaCreativesWarehousePayload,
} from "@/lib/meta/creatives-warehouse";

export interface MetaCreativesLivePayloadInput {
  request: NextRequest;
  requestStartedAt: number;
  businessId: string;
  mediaMode: "metadata" | "full";
  groupBy: GroupBy;
  format: FormatFilter;
  sort: SortKey;
  start: string;
  end: string;
  debugPreview: boolean;
  debugThumbnail: boolean;
  debugPerf: boolean;
  snapshotBypass: boolean;
  snapshotWarm: boolean;
  enableCopyRecovery: boolean;
  enableCreativeBasicsFallback: boolean;
  enableCreativeDetails: boolean;
  enableThumbnailBackfill: boolean;
  enableCardThumbnailBackfill: boolean;
  enableImageHashLookup: boolean;
  enableMediaRecovery: boolean;
  enableMediaCache: boolean;
  enableDeepAudit: boolean;
  perAccountSampleLimit: number;
}

export interface MetaCreativeDetailPayloadInput {
  businessId: string;
  creativeId: string;
}

export interface MetaCreativeHydrationItemInput {
  rowId: string;
  creativeId?: string | null;
}

export interface MetaCreativeHydrationPayloadInput {
  businessId: string;
  items: MetaCreativeHydrationItemInput[];
}

export interface MetaCreativeHydrationPayloadRow {
  rowId: string;
  creative_id: string | null;
  thumbnail_url: string | null;
  table_thumbnail_url: string | null;
  card_preview_url: string | null;
  preview_url: string | null;
  image_url: string | null;
  cached_thumbnail_url: string | null;
  preview: NormalizedRenderPreviewPayload;
}

export interface MetaCreativesWarehousePayloadInput {
  businessId: string;
  mediaMode: "metadata" | "full";
  groupBy: GroupBy;
  format: FormatFilter;
  sort: SortKey;
  start: string;
  end: string;
}

export async function getMetaCreativesApiPayload(input: MetaCreativesLivePayloadInput) {
  const {
    request,
    requestStartedAt,
    businessId,
    mediaMode,
    groupBy,
    format,
    sort,
    start,
    end,
    debugPreview,
    debugThumbnail,
    debugPerf,
    snapshotBypass,
    snapshotWarm,
    enableCopyRecovery,
    enableCreativeBasicsFallback,
    enableCreativeDetails,
    enableThumbnailBackfill,
    enableCardThumbnailBackfill,
    enableImageHashLookup,
    enableMediaRecovery,
    enableMediaCache,
    enableDeepAudit,
    perAccountSampleLimit,
  } = input;
  const enableFullMediaHydration = mediaMode === "full";

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return { status: "no_connection", rows: [] };
  }
  if (!integration.access_token) {
    return { status: "no_access_token", rows: [] };
  }
  const accessToken = integration.access_token;

  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  if (assignedAccountIds.length === 0) {
    return { status: "no_accounts_assigned", rows: [] };
  }

  return buildCreativesResponse(
    {
      businessId,
      assignedAccountIds,
      accessToken,
      mediaMode,
      enableFullMediaHydration,
      groupBy,
      format,
      sort,
      start,
      end,
      debugPreview,
      debugThumbnail,
      debugPerf,
      snapshotBypass,
      snapshotWarm,
      enableCopyRecovery,
      enableCreativeBasicsFallback,
      enableCreativeDetails,
      enableThumbnailBackfill,
      enableCardThumbnailBackfill,
      enableImageHashLookup,
      enableMediaRecovery,
      enableMediaCache,
      enableDeepAudit,
      perAccountSampleLimit,
      requestStartedAt,
    },
    request
  );
}

export async function getMetaCreativeDetailPayload(input: MetaCreativeDetailPayloadInput) {
  const integration = await getIntegration(input.businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return {
      status: "no_connection",
      detail_preview: {
        creative_id: input.creativeId,
        mode: "unavailable",
        source: null,
        ad_format: null,
        html: null,
      },
    };
  }
  if (!integration.access_token) {
    return {
      status: "no_access_token",
      detail_preview: {
        creative_id: input.creativeId,
        mode: "unavailable",
        source: null,
        ad_format: null,
        html: null,
      },
    };
  }

  const preview = await fetchCreativeDetailPreviewHtml(input.creativeId, integration.access_token);
  return {
    status: "ok",
    detail_preview: {
      creative_id: input.creativeId,
      mode: preview ? "html" : "unavailable",
      source: preview?.source ?? null,
      ad_format: preview?.adFormat ?? null,
      html: preview?.html ?? null,
    },
  };
}

function isDirectAdRowId(rowId: string): boolean {
  const normalized = rowId.trim();
  if (!normalized) return false;
  return !normalized.startsWith("creative_") && !normalized.startsWith("adset_");
}

function toHydratedPreviewRow(input: {
  rowId: string;
  creative: MetaAdRecord["creative"];
  cachedThumbnailUrl: string | null;
  fallbackSmallThumbnailUrl: string | null;
  fallbackCardPreviewUrl: string | null;
}): MetaCreativeHydrationPayloadRow {
  const normalizedPreview = buildNormalizedPreview({
    creative: input.creative,
    promotedObject: null,
    imageHashLookup: new Map<string, string>(),
    videoSourceLookup: new Map<string, { source: string | null; picture: string | null }>(),
  });

  const fallbackSmallThumbnailUrl = normalizeMediaUrl(input.fallbackSmallThumbnailUrl);
  const fallbackCardPreviewUrl = normalizeMediaUrl(input.fallbackCardPreviewUrl);
  const normalizedCachedThumbnailUrl = normalizeMediaUrl(input.cachedThumbnailUrl);
  const legacy = normalizedPreview.legacy;
  const tiers = normalizedPreview.tiers;

  const thumbnailUrl =
    fallbackSmallThumbnailUrl ??
    normalizeMediaUrl(tiers.table_thumbnail_url) ??
    normalizeMediaUrl(legacy.thumbnail_url) ??
    normalizedCachedThumbnailUrl;

  const imageUrl =
    normalizeMediaUrl(tiers.image_url) ??
    normalizeMediaUrl(legacy.image_url) ??
    normalizeMediaUrl(input.creative?.image_url ?? null) ??
    fallbackCardPreviewUrl ??
    thumbnailUrl;

  const cardPreviewUrl =
    fallbackCardPreviewUrl ??
    normalizeMediaUrl(tiers.card_preview_url) ??
    normalizeMediaUrl(tiers.preview_image_url) ??
    imageUrl ??
    thumbnailUrl;

  const previewUrl =
    normalizeMediaUrl(tiers.preview_url) ??
    normalizeMediaUrl(legacy.preview_url) ??
    cardPreviewUrl ??
    imageUrl ??
    thumbnailUrl;

  const previewImageUrl =
    normalizeMediaUrl(normalizedPreview.preview.image_url) ??
    normalizeMediaUrl(tiers.preview_image_url) ??
    imageUrl ??
    cardPreviewUrl ??
    thumbnailUrl;

  const previewPosterUrl =
    normalizeMediaUrl(normalizedPreview.preview.poster_url) ??
    normalizeMediaUrl(tiers.preview_poster_url) ??
    thumbnailUrl ??
    cardPreviewUrl ??
    imageUrl;

  const renderMode =
    normalizedPreview.preview.render_mode === "video"
      ? "video"
      : previewImageUrl || previewPosterUrl
        ? "image"
        : "unavailable";

  return {
    rowId: input.rowId,
    creative_id: input.creative?.id ?? null,
    thumbnail_url: thumbnailUrl,
    table_thumbnail_url: thumbnailUrl,
    card_preview_url: cardPreviewUrl,
    preview_url: previewUrl,
    image_url: imageUrl,
    cached_thumbnail_url: normalizedCachedThumbnailUrl,
    preview: {
      ...normalizedPreview.preview,
      render_mode: renderMode,
      image_url: previewImageUrl,
      poster_url: previewPosterUrl,
      source:
        normalizedPreview.preview.source ??
        (previewImageUrl ? "image_url" : thumbnailUrl ? "thumbnail_url" : null),
    },
  };
}

export async function getMetaCreativeHydrationPayload(
  input: MetaCreativeHydrationPayloadInput
) {
  const integration = await getIntegration(input.businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return { status: "no_connection", rows: [] as MetaCreativeHydrationPayloadRow[] };
  }
  if (!integration.access_token) {
    return { status: "no_access_token", rows: [] as MetaCreativeHydrationPayloadRow[] };
  }

  const sanitizedItems = input.items
    .map((item) => ({
      rowId: item.rowId.trim(),
      creativeId: item.creativeId?.trim() || null,
    }))
    .filter((item) => item.rowId.length > 0)
    .slice(0, 10);

  if (sanitizedItems.length === 0) {
    return { status: "ok", rows: [] as MetaCreativeHydrationPayloadRow[] };
  }

  const accessToken = integration.access_token;
  const uniqueCreativeIds = Array.from(
    new Set(
      sanitizedItems
        .map((item) => item.creativeId)
        .filter((creativeId): creativeId is string => Boolean(creativeId))
    )
  );
  const detailMap =
    uniqueCreativeIds.length > 0
      ? await fetchCreativeDetailsMap(uniqueCreativeIds, accessToken)
      : new Map<string, NonNullable<MetaAdRecord["creative"]>>();

  const directAdIds = Array.from(
    new Set(
      sanitizedItems
        .map((item) => item.rowId)
        .filter((rowId) => isDirectAdRowId(rowId))
    )
  );
  const adMediaMap =
    directAdIds.length > 0
      ? await fetchAdCreativeMediaByAdIds(directAdIds, accessToken)
      : new Map<string, Pick<MetaAdRecord, "id" | "creative">>();

  const creativeByRowId = new Map<string, MetaAdRecord["creative"]>();
  for (const item of sanitizedItems) {
    const adCreative = adMediaMap.get(item.rowId)?.creative ?? null;
    const detailCreative = item.creativeId ? detailMap.get(item.creativeId) : undefined;
    creativeByRowId.set(item.rowId, mergeCreativeData(adCreative, detailCreative));
  }

  const effectiveCreativeIds = Array.from(
    new Set(
      Array.from(creativeByRowId.values())
        .map((creative) => creative?.id ?? null)
        .filter((creativeId): creativeId is string => Boolean(creativeId))
    )
  );

  const smallThumbnailIds = effectiveCreativeIds.filter((creativeId) => {
    const creative = Array.from(creativeByRowId.values()).find((value) => value?.id === creativeId) ?? null;
    return !normalizeMediaUrl(creative?.thumbnail_url ?? null) && !normalizeMediaUrl(creative?.image_url ?? null);
  });
  const cardThumbnailIds = effectiveCreativeIds.filter((creativeId) => {
    const creative = Array.from(creativeByRowId.values()).find((value) => value?.id === creativeId) ?? null;
    return !normalizeMediaUrl(creative?.image_url ?? null);
  });

  const [smallThumbnailMap, cardThumbnailMap] = await Promise.all([
    smallThumbnailIds.length > 0
      ? fetchCreativeThumbnailMap(smallThumbnailIds, accessToken, 150, 120)
      : Promise.resolve(new Map<string, string>()),
    cardThumbnailIds.length > 0
      ? fetchCreativeThumbnailMap(cardThumbnailIds, accessToken, 640, 640)
      : Promise.resolve(new Map<string, string>()),
  ]);

  const cacheItems = sanitizedItems.flatMap((item) => {
    const creative = creativeByRowId.get(item.rowId);
    const creativeId = creative?.id ?? item.creativeId ?? null;
    if (!creativeId) return [];

    return [{
      creative_id: creativeId,
      thumbnail_url:
        smallThumbnailMap.get(creativeId) ??
        normalizeMediaUrl(creative?.thumbnail_url ?? null) ??
        null,
      image_url:
        cardThumbnailMap.get(creativeId) ??
        normalizeMediaUrl(creative?.image_url ?? null) ??
        null,
    }];
  });
  const cacheMap = await MediaCacheService.resolveUrls(cacheItems, input.businessId);

  const rows = sanitizedItems.map((item) => {
    const creative = creativeByRowId.get(item.rowId) ?? null;
    const effectiveCreativeId = creative?.id ?? item.creativeId ?? null;
    if (!creative) {
      return {
        rowId: item.rowId,
        creative_id: effectiveCreativeId,
        thumbnail_url: null,
        table_thumbnail_url: null,
        card_preview_url: null,
        preview_url: null,
        image_url: null,
        cached_thumbnail_url: null,
        preview: {
          render_mode: "unavailable",
          image_url: null,
          video_url: null,
          poster_url: null,
          source: null,
          is_catalog: false,
        },
      } satisfies MetaCreativeHydrationPayloadRow;
    }

    return toHydratedPreviewRow({
      rowId: item.rowId,
      creative,
      cachedThumbnailUrl:
        effectiveCreativeId ? cacheMap.get(effectiveCreativeId)?.url ?? null : null,
      fallbackSmallThumbnailUrl:
        effectiveCreativeId ? smallThumbnailMap.get(effectiveCreativeId) ?? null : null,
      fallbackCardPreviewUrl:
        effectiveCreativeId ? cardThumbnailMap.get(effectiveCreativeId) ?? null : null,
    });
  });

  return {
    status: "ok",
    rows,
  };
}

export async function getMetaCreativesDbPayload(input: MetaCreativesWarehousePayloadInput) {
  const {
    businessId,
    mediaMode,
    groupBy,
    format,
    sort,
    start,
    end,
  } = input;

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return { status: "no_connection", rows: [] };
  }
  if (!integration.access_token) {
    return { status: "no_access_token", rows: [] };
  }

  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  if (assignedAccountIds.length === 0) {
    return { status: "no_accounts_assigned", rows: [] };
  }

  return getMetaCreativesWarehousePayload({
    businessId,
    start,
    end,
    groupBy,
    format,
    sort,
    mediaMode,
  });
}
