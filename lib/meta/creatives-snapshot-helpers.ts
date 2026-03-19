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
import type { MetaCreativeApiRow } from "@/lib/meta/creatives-types";

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
    return {
      ...row,
      cached_thumbnail_url: cachedUrl,
      thumbnail_url: row.thumbnail_url ?? cachedUrl,
      table_thumbnail_url: row.table_thumbnail_url ?? cachedUrl,
      card_preview_url:
        row.card_preview_url ??
        (row.preview.render_mode === "video" ? row.card_preview_url ?? cachedUrl : cachedUrl),
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
  const payload = snapshot.payload as {
    status?: string;
    rows?: MetaCreativeApiRow[];
    media_hydrated?: boolean;
  };
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
