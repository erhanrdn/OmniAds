"use client";

import { METRIC_CONFIG, MetaCreativeRow } from "@/components/creatives/metricConfig";
import { CreativePreview } from "@/components/creatives/CreativePreview";

interface CreativesTopGridProps {
  rows: MetaCreativeRow[];
  selectedIds: string[];
  onToggleSelect: (rowId: string) => void;
  onOpenRow: (rowId: string) => void;
}

export function CreativesTopGrid({
  rows,
  selectedIds,
  onToggleSelect,
  onOpenRow,
}: CreativesTopGridProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Selected creatives</h2>
        <p className="text-xs text-muted-foreground">{rows.length} items</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <div
            key={row.id}
            className="group overflow-hidden rounded-xl border bg-background transition-shadow hover:shadow-md hover:ring-1 hover:ring-border"
          >
            <button type="button" onClick={() => onOpenRow(row.id)} className="w-full text-left">
              <CreativePreview
                id={row.id}
                name={row.name}
                cachedUrl={row.cachedThumbnailUrl}
                thumbnailUrl={row.thumbnailUrl}
                imageUrl={row.imageUrl}
                previewUrl={row.previewUrl}
                format={row.format}
                isCatalog={row.isCatalog}
                size="card"
              />
              <div className="px-3 pb-3 pt-2">
                <p className="line-clamp-2 text-[12px] font-semibold leading-tight">{row.name}</p>
                <div className="mt-2 flex items-center gap-4 text-[11px]">
                  <div>
                    <p className="text-muted-foreground">Spend</p>
                    <p className="font-semibold tabular-nums">{METRIC_CONFIG.spend.format(row.spend)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ROAS</p>
                    <p className="font-semibold tabular-nums">{METRIC_CONFIG.roas.format(row.roas)}</p>
                  </div>
                </div>
              </div>
            </button>
            <label className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              <span>Selected</span>
              <input
                type="checkbox"
                checked={selectedIds.includes(row.id)}
                onChange={() => onToggleSelect(row.id)}
                onClick={(event) => event.stopPropagation()}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
