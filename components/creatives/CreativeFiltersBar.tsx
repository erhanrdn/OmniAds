"use client";

import { useMemo, useState } from "react";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";

type PlatformOption = "meta" | "google" | "tiktok" | "pinterest" | "snapchat";

/**
 * dateRange removed — date range is now managed via DateRangePicker externally.
 */
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

export function CreativeFiltersBar({
  rows,
  value,
  onChange,
  onComingSoon,
}: CreativeFiltersBarProps) {
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showAddFilter, setShowAddFilter] = useState(false);
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
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={value.platform}
          onChange={(event) =>
            onChange({ ...value, platform: event.target.value as CreativeFiltersState["platform"] })
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
          onChange={(event) =>
            onChange({ ...value, groupBy: event.target.value as CreativeFiltersState["groupBy"] })
          }
          className="h-8 rounded-full border bg-background px-3 text-xs"
        >
          <option value="adName">Group by Ad Name</option>
          <option value="creative">Group by Creative</option>
          <option value="adSet">Group by Ad Set</option>
        </select>

        <select
          value={value.format}
          onChange={(event) =>
            onChange({ ...value, format: event.target.value as CreativeFiltersState["format"] })
          }
          className="h-8 rounded-full border bg-background px-3 text-xs"
        >
          <option value="all">All formats</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>

        <select
          value={value.sort}
          onChange={(event) =>
            onChange({ ...value, sort: event.target.value as CreativeFiltersState["sort"] })
          }
          className="h-8 rounded-full border bg-background px-3 text-xs"
        >
          <option value="roas">Sort by ROAS</option>
          <option value="spend">Sort by Spend</option>
          <option value="ctrAll">Sort by CTR</option>
          <option value="purchaseValue">Sort by Purchase value</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTagPicker((prev) => !prev)}
            className="rounded-full border px-3 py-1.5 text-xs"
          >
            Tags {value.selectedTags.length > 0 ? `(${value.selectedTags.length})` : ""}
          </button>
          {showTagPicker && (
            <div className="absolute left-0 top-10 z-20 w-64 rounded-lg border bg-background p-3 shadow-md">
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

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAddFilter((prev) => !prev)}
            className="rounded-full border px-3 py-1.5 text-xs"
          >
            + Add filter
          </button>
          {showAddFilter && (
            <div className="absolute left-0 top-10 z-20 w-56 rounded-lg border bg-background p-3 shadow-md">
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

export type { CreativeFiltersState, PlatformOption };
