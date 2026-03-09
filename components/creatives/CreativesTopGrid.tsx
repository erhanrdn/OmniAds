"use client";

import { METRIC_CONFIG, MetaCreativeRow } from "@/components/creatives/metricConfig";
import { CreativeRenderSurface } from "@/components/creatives/CreativeRenderSurface";

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
          <div key={row.id} className="overflow-hidden rounded-xl border bg-card">
            <button type="button" onClick={() => onOpenRow(row.id)} className="w-full text-left">
              <CreativeRenderSurface
                id={row.id}
                name={row.name}
                preview={row.preview}
                thumbnailUrl={row.thumbnailUrl}
                imageUrl={row.imageUrl}
                previewUrl={row.previewUrl}
                compactImageFirst
                size="card"
              />
              <div className="p-3">
                <p className="line-clamp-1 text-sm font-medium">{row.name}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Spend</p>
                    <p>{METRIC_CONFIG.spend.format(row.spend)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ROAS</p>
                    <p>{METRIC_CONFIG.roas.format(row.roas)}</p>
                  </div>
                </div>
              </div>
            </button>
            <label className="flex items-center justify-between border-t px-3 py-2 text-xs">
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
