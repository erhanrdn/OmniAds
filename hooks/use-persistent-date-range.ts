"use client";

import { usePreferencesStore } from "@/store/preferences-store";
import {
  DEFAULT_DATE_RANGE,
  type DateRangeValue,
} from "@/components/date-range/DateRangePicker";
import {
  DEFAULT_CREATIVE_DATE_RANGE,
  type CreativeDateRangeValue,
} from "@/components/creatives/CreativesTopSection";
import { usePersistentPreferenceValue } from "@/hooks/persistent-date-range-support";

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
  return usePersistentPreferenceValue(stored, set, DEFAULT_DATE_RANGE);
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
  return usePersistentPreferenceValue(stored, set, DEFAULT_CREATIVE_DATE_RANGE);
}
