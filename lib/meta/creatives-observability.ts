import type {
  MetaCreativeApiRow,
  PreviewNullReason,
  PreviewObservabilityStats,
  PreviewResolutionReason,
  PreviewResolutionStage,
} from "@/lib/meta/creatives-types";

export function incrementCount<K extends string>(
  map: Partial<Record<K, number>>,
  key: K | null | undefined
): void {
  if (!key) return;
  map[key] = ((map[key] as number | undefined) ?? 0) + 1;
}

export function incrementStringCount(
  map: Record<string, number>,
  key: string | null | undefined
): void {
  if (!key) return;
  map[key] = (map[key] ?? 0) + 1;
}

export function buildPreviewObservabilityStats(
  rows: MetaCreativeApiRow[]
): PreviewObservabilityStats {
  const stats: PreviewObservabilityStats = {
    total_rows: rows.length,
    preview_ready_count: 0,
    preview_missing_count: 0,
    render_mode_counts: { video: 0, image: 0, unavailable: 0 },
    resolution_stage_counts: {},
    null_reason_counts: {},
    resolution_reason_counts: {},
    selected_source_counts: {},
  };

  for (const row of rows) {
    const hasPreview = Boolean(
      row.cached_thumbnail_url ??
        row.table_thumbnail_url ??
        row.card_preview_url ??
        row.thumbnail_url ??
        row.image_url ??
        row.preview_url ??
        row.preview?.image_url ??
        row.preview?.poster_url ??
        row.preview?.video_url
    );
    if (hasPreview) {
      stats.preview_ready_count++;
    } else {
      stats.preview_missing_count++;
    }

    const renderMode = row.preview?.render_mode ?? row.debug?.preview_render_mode ?? "unavailable";
    if (renderMode === "video") stats.render_mode_counts.video++;
    else if (renderMode === "image") stats.render_mode_counts.image++;
    else stats.render_mode_counts.unavailable++;

    incrementCount(stats.resolution_stage_counts, (row.debug?.resolution_stage ?? null) as PreviewResolutionStage | null);
    incrementCount(stats.null_reason_counts, (row.debug?.stage_null_reason ?? null) as PreviewNullReason | null);
    incrementCount(stats.resolution_reason_counts, (row.debug?.preview_resolution_reason ?? null) as PreviewResolutionReason | null);
    incrementStringCount(stats.selected_source_counts, row.debug?.preview_selected_source ?? null);
  }

  return stats;
}

export function getPreviewReadyCount(rows: MetaCreativeApiRow[]): number {
  return rows.filter((row) =>
    Boolean(
      row.cached_thumbnail_url ??
        row.table_thumbnail_url ??
        row.card_preview_url ??
        row.thumbnail_url ??
        row.image_url ??
        row.preview_url ??
        row.preview?.image_url ??
        row.preview?.poster_url ??
        row.preview?.video_url
    )
  ).length;
}
