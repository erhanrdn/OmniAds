"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { METRIC_CONFIG, METRIC_OPTIONS, MetaMetricKey } from "@/components/creatives/metricConfig";
import { Settings2 } from "lucide-react";
import { useDropdownBehavior } from "@/hooks/use-dropdown-behavior";

interface TableViewState {
  selectedMetrics: MetaMetricKey[];
  density: "compact" | "comfortable";
  heatmapIntensity: "low" | "medium" | "high";
}

interface TableControlsBarProps {
  value: TableViewState;
  onChange: (next: TableViewState) => void;
}

export function TableControlsBar({ value, onChange }: TableControlsBarProps) {
  const [showMetrics, setShowMetrics] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const metricsWrapRef = useRef<HTMLDivElement>(null);
  const metricsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsWrapRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);

  useDropdownBehavior({
    id: "legacy-table-metrics",
    open: showMetrics,
    setOpen: setShowMetrics,
    containerRef: metricsWrapRef,
    triggerRef: metricsTriggerRef,
  });

  useDropdownBehavior({
    id: "legacy-table-settings",
    open: showSettings,
    setOpen: setShowSettings,
    containerRef: settingsWrapRef,
    triggerRef: settingsTriggerRef,
  });

  const toggleMetric = (metric: MetaMetricKey) => {
    const exists = value.selectedMetrics.includes(metric);
    if (exists && value.selectedMetrics.length === 1) return;
    const selectedMetrics = exists
      ? value.selectedMetrics.filter((item) => item !== metric)
      : [...value.selectedMetrics, metric];
    onChange({ ...value, selectedMetrics });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
      <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1">
        <span className="text-xs">All tags</span>
        <Badge className="h-5 rounded-full px-2 text-[10px]">New</Badge>
      </div>

      {value.selectedMetrics.map((metric) => (
        <div key={metric} className="rounded-full border bg-muted/25 px-3 py-1 text-xs">
          {METRIC_CONFIG[metric].label}
        </div>
      ))}

      <div ref={metricsWrapRef} className="relative">
        <button
          ref={metricsTriggerRef}
          type="button"
          onClick={() => setShowMetrics((prev) => !prev)}
          className="rounded-full border px-3 py-1.5 text-xs"
        >
          + Add metric
        </button>
        {showMetrics && (
          <div className="animate-in fade-in-0 slide-in-from-top-1 absolute left-0 top-10 z-50 w-64 rounded-lg border bg-background p-3 shadow-md duration-150">
            <p className="mb-2 text-xs text-muted-foreground">Metrics</p>
            <div className="max-h-64 space-y-1 overflow-auto">
              {METRIC_OPTIONS.map((metric) => (
                <label key={metric} className="flex items-center justify-between text-xs">
                  <span>{METRIC_CONFIG[metric].label}</span>
                  <input
                    type="checkbox"
                    checked={value.selectedMetrics.includes(metric)}
                    onChange={() => toggleMetric(metric)}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div ref={settingsWrapRef} className="ml-auto relative">
        <button
          ref={settingsTriggerRef}
          type="button"
          onClick={() => setShowSettings((prev) => !prev)}
          className="rounded-md border p-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Table settings"
        >
          <Settings2 className="h-4 w-4" />
        </button>
        {showSettings && (
          <div className="animate-in fade-in-0 slide-in-from-top-1 absolute right-0 top-9 z-50 w-56 rounded-lg border bg-background p-3 shadow-md duration-150">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Table settings</p>
            <label className="mb-2 block text-xs">
              Density
              <select
                value={value.density}
                onChange={(event) =>
                  onChange({ ...value, density: event.target.value as TableViewState["density"] })
                }
                className="mt-1 h-8 w-full rounded border bg-background px-2 text-xs"
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </label>
            <label className="block text-xs">
              Heatmap intensity
              <select
                value={value.heatmapIntensity}
                onChange={(event) =>
                  onChange({
                    ...value,
                    heatmapIntensity: event.target.value as TableViewState["heatmapIntensity"],
                  })
                }
                className="mt-1 h-8 w-full rounded border bg-background px-2 text-xs"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

export type { TableViewState };
