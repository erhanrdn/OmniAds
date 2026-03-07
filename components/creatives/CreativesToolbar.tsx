"use client";

import { useMemo, useRef, useState } from "react";
import { Share2, Download } from "lucide-react";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { CreativeFiltersState } from "@/components/creatives/CreativeFiltersBar";
import {
  DateRangePicker,
  DateRangeValue,
} from "@/components/date-range/DateRangePicker";
import { useDropdownBehavior } from "@/hooks/use-dropdown-behavior";

interface CreativesToolbarProps {
  rows: MetaCreativeRow[];
  value: CreativeFiltersState;
  onChange: (next: CreativeFiltersState) => void;
  dateRangeValue: DateRangeValue;
  onDateRangeChange: (next: DateRangeValue) => void;
  onComingSoon: () => void;
  selectedCount: number;
  onShareSelected: () => void;
}

export function CreativesToolbar({
  rows,
  value,
  onChange,
  dateRangeValue,
  onDateRangeChange,
  onComingSoon,
  selectedCount,
  onShareSelected,
}: CreativesToolbarProps) {
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showAddFilter, setShowAddFilter] = useState(false);
  const tagWrapRef = useRef<HTMLDivElement>(null);
  const tagTriggerRef = useRef<HTMLButtonElement>(null);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);

  useDropdownBehavior({
    id: "toolbar-tags",
    open: showTagPicker,
    setOpen: setShowTagPicker,
    containerRef: tagWrapRef,
    triggerRef: tagTriggerRef,
  });

  useDropdownBehavior({
    id: "toolbar-add-filter",
    open: showAddFilter,
    setOpen: setShowAddFilter,
    containerRef: filterWrapRef,
    triggerRef: filterTriggerRef,
  });

  const tagOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(),
    [rows]
  );

  const toggleTag = (tag: string) => {
    const selectedTags = value.selectedTags.includes(tag)
      ? value.selectedTags.filter((item) => item !== tag)
      : [...value.selectedTags, tag];
    onChange({ ...value, selectedTags });
  };

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      {/* Row 1: date range picker + filters, selection actions on right */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={dateRangeValue} onChange={onDateRangeChange} />

        <select
          value={value.platform}
          onChange={(e) =>
            onChange({ ...value, platform: e.target.value as CreativeFiltersState["platform"] })
          }
          className="h-8 rounded-full border bg-background px-3 text-xs"
        >
          <option value="meta">Meta</option>
          <option value="google">Google</option>
          <option value="tiktok">TikTok</option>
          <option value="pinterest">Pinterest</option>
          <option value="snapchat">Snapchat</option>
        </select>

        <select
          value={value.groupBy}
          onChange={(e) =>
            onChange({ ...value, groupBy: e.target.value as CreativeFiltersState["groupBy"] })
          }
          className="h-8 rounded-full border bg-background px-3 text-xs"
        >
          <option value="adName">Group by Ad Name</option>
          <option value="creative">Group by Creative</option>
          <option value="adSet">Group by Ad Set</option>
        </select>

        <select
          value={value.format}
          onChange={(e) =>
            onChange({ ...value, format: e.target.value as CreativeFiltersState["format"] })
          }
          className="h-8 rounded-full border bg-background px-3 text-xs"
        >
          <option value="all">All formats</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>

        <select
          value={value.sort}
          onChange={(e) =>
            onChange({ ...value, sort: e.target.value as CreativeFiltersState["sort"] })
          }
          className="h-8 rounded-full border bg-background px-3 text-xs"
        >
          <option value="roas">Sort by ROAS</option>
          <option value="spend">Sort by Spend</option>
          <option value="ctrAll">Sort by CTR</option>
          <option value="purchaseValue">Sort by Purchase value</option>
        </select>

        {selectedCount > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{selectedCount}</span>
            </span>

            <button
              type="button"
              onClick={onShareSelected}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-xs font-medium text-background transition-opacity hover:opacity-80"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share ({selectedCount})
            </button>

            <button
              type="button"
              onClick={onComingSoon}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        )}
      </div>

      {/* Row 2: tag filters + analyze */}
      <div className="flex flex-wrap items-center gap-2">
        <div ref={tagWrapRef} className="relative">
          <button
            ref={tagTriggerRef}
            type="button"
            onClick={() => setShowTagPicker((prev) => !prev)}
            className="rounded-full border px-3 py-1.5 text-xs"
          >
            Tags {value.selectedTags.length > 0 ? `(${value.selectedTags.length})` : ""}
          </button>
          {showTagPicker && (
            <div className="animate-in fade-in-0 slide-in-from-top-1 absolute left-0 top-10 z-50 w-64 rounded-lg border bg-background p-3 shadow-md duration-150">
              <p className="mb-2 text-xs text-muted-foreground">Select tags</p>
              <div className="max-h-56 space-y-1 overflow-auto">
                {tagOptions.map((tag) => (
                  <label key={tag} className="flex items-center justify-between text-xs">
                    <span>{tag}</span>
                    <input
                      type="checkbox"
                      checked={value.selectedTags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div ref={filterWrapRef} className="relative">
          <button
            ref={filterTriggerRef}
            type="button"
            onClick={() => setShowAddFilter((prev) => !prev)}
            className="rounded-full border px-3 py-1.5 text-xs"
          >
            + Add filter
          </button>
          {showAddFilter && (
            <div className="animate-in fade-in-0 slide-in-from-top-1 absolute left-0 top-10 z-50 w-56 rounded-lg border bg-background p-3 shadow-md duration-150">
              <p className="text-xs text-muted-foreground">
                Advanced filter builder is coming soon.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onComingSoon}
          className="ml-auto rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Analyze this report
        </button>
      </div>
    </div>
  );
}
