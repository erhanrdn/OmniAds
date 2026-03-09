"use client";

import { useMemo, useRef, useState } from "react";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { useDropdownBehavior } from "@/hooks/use-dropdown-behavior";
import { cn } from "@/lib/utils";

type PlatformOption = "meta" | "google" | "tiktok" | "pinterest" | "snapchat";

interface CreativeFiltersState {
  groupBy: "adName" | "creative" | "adSet";
  selectedTags: string[];
  format: "all" | "image" | "video";
  sort: "roas" | "spend" | "ctrAll" | "purchaseValue";
  platform: PlatformOption;
}

interface CreativeFiltersBarProps {
  rows: MetaCreativeRow[];
  value: CreativeFiltersState;
  onChange: (next: CreativeFiltersState) => void;
  onComingSoon: () => void;
}

type FilterSelectProps<T extends string> = {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
};

const FILTER_SELECT_CLASSNAME =
  "h-8 rounded-full border bg-background px-3 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export function CreativeFiltersBar({
  rows,
  value,
  onChange,
  onComingSoon,
}: CreativeFiltersBarProps) {
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showAddFilter, setShowAddFilter] = useState(false);

  const tagWrapRef = useRef<HTMLDivElement>(null);
  const tagTriggerRef = useRef<HTMLButtonElement>(null);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);

  useDropdownBehavior({
    id: "legacy-creative-tags",
    open: showTagPicker,
    setOpen: setShowTagPicker,
    containerRef: tagWrapRef,
    triggerRef: tagTriggerRef,
  });

  useDropdownBehavior({
    id: "legacy-creative-add-filter",
    open: showAddFilter,
    setOpen: setShowAddFilter,
    containerRef: filterWrapRef,
    triggerRef: filterTriggerRef,
  });

  const tagOptions = useMemo(() => {
    return Array.from(new Set(rows.flatMap((row) => row.tags || []))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const selectedTagSet = useMemo(() => new Set(value.selectedTags), [value.selectedTags]);

  const toggleTag = (tag: string) => {
    const nextSelectedTags = selectedTagSet.has(tag)
      ? value.selectedTags.filter((item) => item !== tag)
      : [...value.selectedTags, tag];

    onChange({ ...value, selectedTags: nextSelectedTags });
  };

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={value.platform}
          onChange={(next) => onChange({ ...value, platform: next })}
          options={[
            { value: "meta", label: "Meta" },
            { value: "google", label: "Google" },
            { value: "tiktok", label: "TikTok" },
            { value: "pinterest", label: "Pinterest" },
            { value: "snapchat", label: "Snapchat" },
          ]}
        />

        <FilterSelect
          value={value.groupBy}
          onChange={(next) => onChange({ ...value, groupBy: next })}
          options={[
            { value: "adName", label: "Group by Ad Name" },
            { value: "creative", label: "Group by Creative" },
            { value: "adSet", label: "Group by Ad Set" },
          ]}
        />

        <FilterSelect
          value={value.format}
          onChange={(next) => onChange({ ...value, format: next })}
          options={[
            { value: "all", label: "All formats" },
            { value: "image", label: "Image" },
            { value: "video", label: "Video" },
          ]}
        />

        <FilterSelect
          value={value.sort}
          onChange={(next) => onChange({ ...value, sort: next })}
          options={[
            { value: "roas", label: "Sort by ROAS" },
            { value: "spend", label: "Sort by Spend" },
            { value: "ctrAll", label: "Sort by CTR" },
            { value: "purchaseValue", label: "Sort by Purchase value" },
          ]}
        />
      </div>

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
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Select tags</p>
                {value.selectedTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, selectedTags: [] })}
                    className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>

              {tagOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tags available.</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-auto">
                  {tagOptions.map((tag) => {
                    const checked = selectedTagSet.has(tag);
                    return (
                      <label
                        key={tag}
                        className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/50"
                      >
                        <span className="truncate pr-3">{tag}</span>
                        <input type="checkbox" checked={checked} onChange={() => toggleTag(tag)} />
                      </label>
                    );
                  })}
                </div>
              )}
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
          className="ml-auto rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Analyze this report
        </button>
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({ value, onChange, options, className }: FilterSelectProps<T>) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className={cn(FILTER_SELECT_CLASSNAME, className)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export type { CreativeFiltersState, PlatformOption };
