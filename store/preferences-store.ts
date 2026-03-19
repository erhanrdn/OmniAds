import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DateRangeValue } from "@/components/date-range/DateRangePicker";
import type { CreativeDateRangeValue } from "@/components/creatives/CreativesTopSection";
import {
  appendUniqueMetric,
  dedupeMetricKeys,
  moveMetric,
  removeMetric,
  replaceMetric,
} from "@/store/preferences-support";

export type ReportDateRangePreference = "7d" | "14d" | "30d" | "90d";
export type MetricDisplayPreference = "compact" | "detailed";
export type TableDensityPreference = "comfortable" | "compact";

interface PreferencesState {
  defaultDateRange: ReportDateRangePreference;
  metricDisplay: MetricDisplayPreference;
  tableDensity: TableDensityPreference;
  heatmapEnabled: boolean;
  overviewPinsByContext: Record<string, string[]>;
  // Persistent date range selections per surface
  dashboardDateRange: DateRangeValue | null;
  creativeDateRange: CreativeDateRangeValue | null;
  setDashboardDateRange: (value: DateRangeValue) => void;
  setCreativeDateRange: (value: CreativeDateRangeValue) => void;
  setDefaultDateRange: (value: ReportDateRangePreference) => void;
  setMetricDisplay: (value: MetricDisplayPreference) => void;
  setTableDensity: (value: TableDensityPreference) => void;
  setHeatmapEnabled: (value: boolean) => void;
  setOverviewPins: (contextKey: string, metrics: string[]) => void;
  pinOverviewMetric: (contextKey: string, metricKey: string) => void;
  unpinOverviewMetric: (contextKey: string, metricKey: string) => void;
  replaceOverviewMetric: (contextKey: string, currentMetricKey: string, nextMetricKey: string) => void;
  moveOverviewMetric: (contextKey: string, metricKey: string, direction: "left" | "right") => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      defaultDateRange: "30d",
      metricDisplay: "detailed",
      tableDensity: "comfortable",
      heatmapEnabled: true,
      overviewPinsByContext: {},
      dashboardDateRange: null,
      creativeDateRange: null,
      setDashboardDateRange: (value) => set({ dashboardDateRange: value }),
      setCreativeDateRange: (value) => set({ creativeDateRange: value }),
      setDefaultDateRange: (value) => set({ defaultDateRange: value }),
      setMetricDisplay: (value) => set({ metricDisplay: value }),
      setTableDensity: (value) => set({ tableDensity: value }),
      setHeatmapEnabled: (value) => set({ heatmapEnabled: value }),
      setOverviewPins: (contextKey, metrics) =>
        set((state) => ({
          overviewPinsByContext: {
            ...state.overviewPinsByContext,
            [contextKey]: dedupeMetricKeys(metrics),
          },
        })),
      pinOverviewMetric: (contextKey, metricKey) =>
        set((state) => {
          const current = state.overviewPinsByContext[contextKey] ?? [];
          if (current.includes(metricKey)) return state;
          return {
            overviewPinsByContext: {
              ...state.overviewPinsByContext,
              [contextKey]: appendUniqueMetric(current, metricKey),
            },
          };
        }),
      unpinOverviewMetric: (contextKey, metricKey) =>
        set((state) => ({
          overviewPinsByContext: {
            ...state.overviewPinsByContext,
            [contextKey]: removeMetric(
              state.overviewPinsByContext[contextKey] ?? [],
              metricKey
            ),
          },
        })),
      replaceOverviewMetric: (contextKey, currentMetricKey, nextMetricKey) =>
        set((state) => {
          const current = state.overviewPinsByContext[contextKey] ?? [];
          return {
            overviewPinsByContext: {
              ...state.overviewPinsByContext,
              [contextKey]: replaceMetric(current, currentMetricKey, nextMetricKey),
            },
          };
        }),
      moveOverviewMetric: (contextKey, metricKey, direction) =>
        set((state) => {
          const current = state.overviewPinsByContext[contextKey] ?? [];
          const next = moveMetric(current, metricKey, direction);
          if (next === current) return state;
          return {
            overviewPinsByContext: {
              ...state.overviewPinsByContext,
              [contextKey]: next,
            },
          };
        }),
    }),
    {
      name: "omniads-preferences-store-v1",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
