"use client";

import { useMemo } from "react";
import { CreativePreview } from "@/components/creatives/CreativePreview";
import { METRIC_CONFIG, MetaCreativeRow } from "@/components/creatives/metricConfig";
import { getCreativeFormatSummaryLabel } from "@/lib/meta/creative-taxonomy";
import { getCreativeStaticPreviewSources, getCreativeStaticPreviewState } from "@/lib/meta/creatives-preview";

interface CreativesTopGridProps {
  rows: MetaCreativeRow[];
  selectedIds: string[];
  onToggleSelect: (rowId: string) => void;
  onOpenRow: (rowId: string) => void;
}

type CreativeRowLike = MetaCreativeRow & {
  cachedThumbnailUrl?: string | null;
  cached_thumbnail_url?: string | null;
  cardPreviewUrl?: string | null;
  card_preview_url?: string | null;
  thumbnailUrl?: string | null;
  thumbnail_url?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  previewUrl?: string | null;
  preview_url?: string | null;
  isCatalog?: boolean;
  is_catalog?: boolean;
  preview?: {
    image_url?: string | null;
    poster_url?: string | null;
    is_catalog?: boolean;
  } | null;
};

export function CreativesTopGrid({
  rows,
  selectedIds,
  onToggleSelect,
  onOpenRow,
}: CreativesTopGridProps) {
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Selected creatives</h2>
        <p className="text-xs text-muted-foreground">{rows.length} items</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <CreativeCard
            key={row.id}
            row={row as CreativeRowLike}
            selected={selectedIdSet.has(row.id)}
            onToggleSelect={onToggleSelect}
            onOpenRow={onOpenRow}
          />
        ))}
      </div>
    </div>
  );
}

function CreativeCard({
  row,
  selected,
  onToggleSelect,
  onOpenRow,
}: {
  row: CreativeRowLike;
  selected: boolean;
  onToggleSelect: (rowId: string) => void;
  onOpenRow: (rowId: string) => void;
}) {
  const isCatalog = Boolean(row.isCatalog || row.is_catalog || row.preview?.is_catalog);

  const sourcePriority = useMemo(
    () => getCreativeStaticPreviewSources(row, "card"),
    [row]
  );
  const assetState = getCreativeStaticPreviewState(row, "card");
  const badgeLabel = getCreativeFormatSummaryLabel({
    creative_delivery_type: row.creativeDeliveryType,
    creative_visual_format: row.creativeVisualFormat,
    creative_primary_type: row.creativePrimaryType,
    creative_primary_label: row.creativePrimaryLabel,
    creative_secondary_type: row.creativeSecondaryType,
    creative_secondary_label: row.creativeSecondaryLabel,
    taxonomy_source: row.taxonomySource ?? null,
  });

  return (
    <div className="group overflow-hidden rounded-xl border bg-background transition-shadow hover:shadow-md hover:ring-1 hover:ring-border">
      <button type="button" onClick={() => onOpenRow(row.id)} className="w-full text-left">
        <CreativePreview
          id={row.id}
          name={row.name}
          cachedUrl={row.cachedThumbnailUrl ?? row.cached_thumbnail_url ?? null}
          imageUrl={
            row.cardPreviewUrl ??
            row.card_preview_url ??
            row.imageUrl ??
            row.image_url ??
            row.preview?.image_url ??
            null
          }
          previewUrl={row.preview?.poster_url ?? row.previewUrl ?? row.preview_url ?? null}
          thumbnailUrl={row.thumbnailUrl ?? row.thumbnail_url ?? null}
          sourcePriority={sourcePriority}
          assetState={assetState}
          format={row.creativeVisualFormat === "video" ? "video" : isCatalog ? "catalog" : "image"}
          isCatalog={isCatalog}
          badgeLabel={badgeLabel}
          size="card"
        />

        <div className="px-3 pb-3 pt-2">
          <p className="line-clamp-2 text-[12px] font-semibold leading-tight">{row.name}</p>
          <div className="mt-2 flex items-center gap-4 text-[11px]">
            <MetricMini label="Spend" value={METRIC_CONFIG.spend.format(row.spend)} />
            <MetricMini label="ROAS" value={METRIC_CONFIG.roas.format(row.roas)} />
          </div>
        </div>
      </button>

      <label className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>Selected</span>
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${row.name}`}
          onChange={() => onToggleSelect(row.id)}
          onClick={(event) => event.stopPropagation()}
        />
      </label>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
