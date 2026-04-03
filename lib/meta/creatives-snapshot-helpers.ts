import { NextRequest } from "next/server";
import { MediaCacheService } from "@/lib/media-cache/media-service";
import {
  getMetaCreativesSnapshot,
  getMetaCreativesSnapshotFreshness,
  getSnapshotCoverage,
  markMetaCreativesSnapshotRefreshing,
  startMetaCreativesSnapshotRefresh,
  type MetaCreativesSnapshotLevel,
  type MetaCreativesSnapshotQuery,
} from "@/lib/meta-creatives-snapshot";
import { normalizeMediaUrl } from "@/lib/meta/creatives-utils";
import { buildPreviewObservabilityStats, getPreviewReadyCount } from "@/lib/meta/creatives-observability";
import type {
  CreativeTaxonomyVersion,
  MetaCreativeApiRow,
  PreviewContractVersion,
} from "@/lib/meta/creatives-types";
import {
  buildCreativePreviewManifest,
  META_CREATIVES_PREVIEW_CONTRACT_VERSION,
} from "@/lib/meta/creatives-preview";

export const META_CREATIVES_SNAPSHOT_SCHEMA_VERSION = "creatives_snapshot_v2";

export interface MetaCreativesSnapshotTaxonomySummary {
  total_rows: number;
  deterministic_rows: number;
  legacy_fallback_rows: number;
  missing_taxonomy_version_rows: number;
  missing_taxonomy_source_rows: number;
}

export interface MetaCreativesSnapshotPreviewSummary {
  total_rows: number;
  rows_with_preview_manifest: number;
  rows_with_table_src: number;
  rows_with_card_src: number;
  rows_needing_card_enrichment: number;
  rows_missing_preview: number;
  top_rows_needing_card_enrichment: number;
}

export interface MetaCreativesSnapshotPayload extends Record<string, unknown> {
  status?: string;
  rows?: MetaCreativeApiRow[];
  media_hydrated?: boolean;
  snapshot_schema_version?: string;
  taxonomy_version?: CreativeTaxonomyVersion;
  preview_contract_version?: PreviewContractVersion;
  taxonomy_summary?: MetaCreativesSnapshotTaxonomySummary;
  preview_summary?: MetaCreativesSnapshotPreviewSummary;
}

export type MetaCreativesSnapshotTaxonomyHealthReason =
  | "snapshot_schema_version_mismatch"
  | "taxonomy_version_mismatch"
  | "preview_contract_version_mismatch"
  | "rows_missing_taxonomy_version"
  | "rows_missing_taxonomy_source"
  | "rows_legacy_fallback"
  | "rows_missing_preview_manifest"
  | "top_rows_need_card_enrichment";

export interface MetaCreativesSnapshotTaxonomyHealth {
  snapshotSchemaVersion: string | null;
  taxonomyVersion: CreativeTaxonomyVersion | null;
  previewContractVersion: PreviewContractVersion | null;
  taxonomySummary: MetaCreativesSnapshotTaxonomySummary;
  previewSummary: MetaCreativesSnapshotPreviewSummary;
  isTaxonomyStale: boolean;
  reasonCodes: MetaCreativesSnapshotTaxonomyHealthReason[];
}

export function buildMetaCreativesSnapshotTaxonomySummary(
  rows: MetaCreativeApiRow[]
): MetaCreativesSnapshotTaxonomySummary {
  return rows.reduce<MetaCreativesSnapshotTaxonomySummary>(
    (summary, row) => {
      summary.total_rows += 1;

      if (row.taxonomy_version !== "v2") {
        summary.missing_taxonomy_version_rows += 1;
      }

      if (row.taxonomy_source !== "deterministic" && row.taxonomy_source !== "legacy_fallback") {
        summary.missing_taxonomy_source_rows += 1;
      }

      if (row.taxonomy_source === "legacy_fallback") {
        summary.legacy_fallback_rows += 1;
      }

      if (row.taxonomy_version === "v2" && row.taxonomy_source === "deterministic") {
        summary.deterministic_rows += 1;
      }

      return summary;
    },
    {
      total_rows: 0,
      deterministic_rows: 0,
      legacy_fallback_rows: 0,
      missing_taxonomy_version_rows: 0,
      missing_taxonomy_source_rows: 0,
    }
  );
}

export function buildMetaCreativesSnapshotPreviewSummary(
  rows: MetaCreativeApiRow[]
): MetaCreativesSnapshotPreviewSummary {
  return rows.reduce<MetaCreativesSnapshotPreviewSummary>(
    (summary, row, index) => {
      summary.total_rows += 1;

      const manifest = row.preview_manifest ?? null;
      if (manifest) {
        summary.rows_with_preview_manifest += 1;
      }
      if (manifest?.table_src) {
        summary.rows_with_table_src += 1;
      }
      if (manifest?.card_src) {
        summary.rows_with_card_src += 1;
      }
      if (manifest?.needs_card_enrichment) {
        summary.rows_needing_card_enrichment += 1;
        if (index < 8) {
          summary.top_rows_needing_card_enrichment += 1;
        }
      }
      if (!manifest?.table_src && !manifest?.card_src && !manifest?.detail_image_src && !manifest?.detail_video_src) {
        summary.rows_missing_preview += 1;
      }

      return summary;
    },
    {
      total_rows: 0,
      rows_with_preview_manifest: 0,
      rows_with_table_src: 0,
      rows_with_card_src: 0,
      rows_needing_card_enrichment: 0,
      rows_missing_preview: 0,
      top_rows_needing_card_enrichment: 0,
    }
  );
}

export function evaluateMetaCreativesSnapshotTaxonomyHealth(
  payload: MetaCreativesSnapshotPayload | null | undefined,
  rowsOverride?: MetaCreativeApiRow[]
): MetaCreativesSnapshotTaxonomyHealth {
  const rows = Array.isArray(rowsOverride)
    ? rowsOverride
    : Array.isArray(payload?.rows)
    ? payload.rows
    : [];
  const taxonomySummary = buildMetaCreativesSnapshotTaxonomySummary(rows);
  const previewSummary = buildMetaCreativesSnapshotPreviewSummary(rows);
  const snapshotSchemaVersion =
    typeof payload?.snapshot_schema_version === "string" ? payload.snapshot_schema_version : null;
  const taxonomyVersion = payload?.taxonomy_version === "v2" ? payload.taxonomy_version : null;
  const previewContractVersion =
    payload?.preview_contract_version === META_CREATIVES_PREVIEW_CONTRACT_VERSION
      ? payload.preview_contract_version
      : null;
  const reasonCodes: MetaCreativesSnapshotTaxonomyHealthReason[] = [];

  if (snapshotSchemaVersion !== META_CREATIVES_SNAPSHOT_SCHEMA_VERSION) {
    reasonCodes.push("snapshot_schema_version_mismatch");
  }

  if (taxonomyVersion !== "v2") {
    reasonCodes.push("taxonomy_version_mismatch");
  }

  if (previewContractVersion !== META_CREATIVES_PREVIEW_CONTRACT_VERSION) {
    reasonCodes.push("preview_contract_version_mismatch");
  }

  if (taxonomySummary.missing_taxonomy_version_rows > 0) {
    reasonCodes.push("rows_missing_taxonomy_version");
  }

  if (taxonomySummary.missing_taxonomy_source_rows > 0) {
    reasonCodes.push("rows_missing_taxonomy_source");
  }

  if (taxonomySummary.legacy_fallback_rows > 0) {
    reasonCodes.push("rows_legacy_fallback");
  }

  if (previewSummary.rows_with_preview_manifest !== rows.length) {
    reasonCodes.push("rows_missing_preview_manifest");
  }

  if ((payload?.media_hydrated ?? false) === false && previewSummary.top_rows_needing_card_enrichment > 0) {
    reasonCodes.push("top_rows_need_card_enrichment");
  }

  return {
    snapshotSchemaVersion,
    taxonomyVersion,
    previewContractVersion,
    taxonomySummary,
    previewSummary,
    isTaxonomyStale: reasonCodes.length > 0,
    reasonCodes,
  };
}

export function buildMetaCreativesSnapshotPayload(input: {
  status: string;
  rows: MetaCreativeApiRow[];
  mediaHydrated: boolean;
}): MetaCreativesSnapshotPayload {
  return {
    status: input.status,
    rows: input.rows,
    media_hydrated: input.mediaHydrated,
    snapshot_schema_version: META_CREATIVES_SNAPSHOT_SCHEMA_VERSION,
    taxonomy_version: "v2",
    preview_contract_version: META_CREATIVES_PREVIEW_CONTRACT_VERSION,
    taxonomy_summary: buildMetaCreativesSnapshotTaxonomySummary(input.rows),
    preview_summary: buildMetaCreativesSnapshotPreviewSummary(input.rows),
  };
}

export async function hydrateRowsWithSnapshotCache(
  rows: MetaCreativeApiRow[],
  businessId: string,
  enableMediaCache: boolean
): Promise<MetaCreativeApiRow[]> {
  if (!enableMediaCache || rows.length === 0) return rows;
  const cacheMap = await MediaCacheService.resolveUrls(
    rows.map((row) => ({
      creative_id: row.creative_id,
      thumbnail_url: row.thumbnail_url ?? row.table_thumbnail_url ?? row.preview?.poster_url ?? null,
      image_url: row.image_url ?? row.card_preview_url ?? row.preview?.image_url ?? null,
    })),
    businessId
  );

  return rows.map((row) => {
    const cached = cacheMap.get(row.creative_id);
    if (!cached || cached.source !== "cache") return row;
    const cachedUrl = normalizeMediaUrl(cached.url);
    if (!cachedUrl) return row;
    const nextTableSrc = row.table_thumbnail_url ?? cachedUrl;
    const nextCardSrc =
      row.card_preview_url ??
      (row.preview.render_mode === "video" ? row.card_preview_url ?? cachedUrl : cachedUrl);
    const nextDetailImageSrc =
      row.image_url ??
      row.preview.image_url ??
      row.preview.poster_url ??
      nextCardSrc ??
      nextTableSrc;
    return {
      ...row,
      cached_thumbnail_url: cachedUrl,
      thumbnail_url: row.thumbnail_url ?? cachedUrl,
      table_thumbnail_url: nextTableSrc,
      card_preview_url: nextCardSrc,
      preview_manifest: buildCreativePreviewManifest({
        tableSrc: nextTableSrc,
        cardSrc: nextCardSrc,
        detailImageSrc: nextDetailImageSrc,
        detailVideoSrc: row.preview.video_url ?? null,
        liveHtmlAvailable: row.preview_manifest?.live_html_available ?? Boolean(row.creative_id),
      }),
      preview_url: row.preview_url ?? cachedUrl,
      preview:
        row.preview.render_mode === "video"
          ? {
              ...row.preview,
              poster_url: row.preview.poster_url ?? cachedUrl,
            }
          : {
              ...row.preview,
              image_url: row.preview.image_url ?? cachedUrl,
              poster_url: row.preview.poster_url ?? cachedUrl,
            },
    };
  });
}

export async function buildSnapshotApiResponse(input: {
  snapshot: Awaited<ReturnType<typeof getMetaCreativesSnapshot>>;
  businessId: string;
  mediaMode: "metadata" | "full";
  enableMediaCache: boolean;
}) {
  const snapshot = input.snapshot;
  if (!snapshot) return null;
  const payload = snapshot.payload as MetaCreativesSnapshotPayload;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const hydratedRows = await hydrateRowsWithSnapshotCache(rows, input.businessId, input.enableMediaCache);
  const previewReadyCount = getPreviewReadyCount(hydratedRows);
  const freshness = getMetaCreativesSnapshotFreshness(snapshot.lastSyncedAt);
  const preview_observability = buildPreviewObservabilityStats(hydratedRows);
  return {
    status: payload.status ?? "ok",
    rows: hydratedRows,
    media_mode: input.mediaMode,
    media_hydrated: payload.media_hydrated ?? snapshot.snapshotLevel === "full",
    preview_contract_version:
      payload.preview_contract_version ?? META_CREATIVES_PREVIEW_CONTRACT_VERSION,
    preview_summary:
      payload.preview_summary ?? buildMetaCreativesSnapshotPreviewSummary(hydratedRows),
    snapshot_source: "persisted",
    snapshot_level: snapshot.snapshotLevel,
    last_synced_at: snapshot.lastSyncedAt,
    snapshot_age_ms: freshness.snapshotAgeMs,
    freshness_state: freshness.freshnessState,
    is_refreshing: Boolean(snapshot.refreshStartedAt),
    preview_coverage: getSnapshotCoverage(hydratedRows.length, previewReadyCount),
    preview_observability,
  };
}

export function buildLiveApiResponse(input: {
  rows: MetaCreativeApiRow[];
  mediaMode: "metadata" | "full";
  mediaHydrated: boolean;
  snapshotLevel: MetaCreativesSnapshotLevel;
  snapshotSource?: "live" | "refresh";
}) {
  const previewReadyCount = getPreviewReadyCount(input.rows);
  const preview_observability = buildPreviewObservabilityStats(input.rows);
  return {
    status: "ok",
    rows: input.rows,
    media_mode: input.mediaMode,
    media_hydrated: input.mediaHydrated,
    preview_contract_version: META_CREATIVES_PREVIEW_CONTRACT_VERSION,
    preview_summary: buildMetaCreativesSnapshotPreviewSummary(input.rows),
    snapshot_source: input.snapshotSource ?? "live",
    snapshot_level: input.snapshotLevel,
    last_synced_at: new Date().toISOString(),
    snapshot_age_ms: 0,
    freshness_state: "fresh" as const,
    is_refreshing: false,
    preview_coverage: getSnapshotCoverage(input.rows.length, previewReadyCount),
    preview_observability,
  };
}

export function triggerSnapshotRefresh(
  request: NextRequest,
  snapshotQuery: MetaCreativesSnapshotQuery
) {
  startMetaCreativesSnapshotRefresh(snapshotQuery, async () => {
    await markMetaCreativesSnapshotRefreshing(snapshotQuery, true).catch(() => null);
    try {
      const refreshUrl = new URL(request.url);
      refreshUrl.searchParams.set("mediaMode", "full");
      refreshUrl.searchParams.set("snapshotBypass", "1");
      refreshUrl.searchParams.set("snapshotWarm", "1");
      await fetch(refreshUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          cookie: request.headers.get("cookie") ?? "",
        },
        cache: "no-store",
      });
    } finally {
      await markMetaCreativesSnapshotRefreshing(snapshotQuery, false).catch(() => null);
    }
  });
}
