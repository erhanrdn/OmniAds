"use client";

import { useCallback } from "react";
import { usePreferencesStore } from "@/store/preferences-store";
import {
  DEFAULT_DATE_RANGE,
  type DateRangeValue,
} from "@/components/date-range/DateRangePicker";
import {
  DEFAULT_CREATIVE_DATE_RANGE,
  type CreativeDateRangeValue,
} from "@/components/creatives/CreativesTopSection";

/**
 * Persists the standard DateRangePicker value across page navigations.
 * Used by Overview, Analytics, Geo, Meta, and similar platform pages.
 */
export function usePersistentDateRange(): [
  DateRangeValue,
  (value: DateRangeValue) => void,
] {
  const stored = usePreferencesStore((s) => s.dashboardDateRange);
  const set = usePreferencesStore((s) => s.setDashboardDateRange);
  const value = stored ?? DEFAULT_DATE_RANGE;
  const setValue = useCallback(
    (next: DateRangeValue) => set(next),
    [set]
  );
  return [value, setValue];
}

/**
 * Persists the Motion (Creatives / Copies) date range value across navigations.
 */
export function usePersistentCreativeDateRange(): [
  CreativeDateRangeValue,
  (value: CreativeDateRangeValue) => void,
] {
  const stored = usePreferencesStore((s) => s.creativeDateRange);
  const set = usePreferencesStore((s) => s.setCreativeDateRange);
  const value = stored ?? DEFAULT_CREATIVE_DATE_RANGE;
  const setValue = useCallback(
    (next: CreativeDateRangeValue) => set(next),
    [set]
  );
  return [value, setValue];
}
