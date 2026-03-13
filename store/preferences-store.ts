import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ReportDateRangePreference = "7d" | "14d" | "30d" | "90d";
export type MetricDisplayPreference = "compact" | "detailed";
export type TableDensityPreference = "comfortable" | "compact";

interface PreferencesState {
  defaultDateRange: ReportDateRangePreference;
  metricDisplay: MetricDisplayPreference;
  tableDensity: TableDensityPreference;
  heatmapEnabled: boolean;
  setDefaultDateRange: (value: ReportDateRangePreference) => void;
  setMetricDisplay: (value: MetricDisplayPreference) => void;
  setTableDensity: (value: TableDensityPreference) => void;
  setHeatmapEnabled: (value: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      defaultDateRange: "30d",
      metricDisplay: "detailed",
      tableDensity: "comfortable",
      heatmapEnabled: true,
      setDefaultDateRange: (value) => set({ defaultDateRange: value }),
      setMetricDisplay: (value) => set({ metricDisplay: value }),
      setTableDensity: (value) => set({ tableDensity: value }),
      setHeatmapEnabled: (value) => set({ heatmapEnabled: value }),
    }),
    {
      name: "omniads-preferences-store-v1",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
