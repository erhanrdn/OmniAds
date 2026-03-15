"use client";

import { useCallback } from "react";
import { usePreferencesStore } from "@/store/preferences-store";
import {
  DEFAULT_DATE_RANGE,
  type DateRangeValue,
} from "@/components/date-range/DateRangePicker";
import {
  DEFAULT_MOTION_DATE_RANGE,
  type MotionDateRangeValue,
} from "@/components/creatives/MotionTopSection";

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
export function usePersistentMotionDateRange(): [
  MotionDateRangeValue,
  (value: MotionDateRangeValue) => void,
] {
  const stored = usePreferencesStore((s) => s.motionDateRange);
  const set = usePreferencesStore((s) => s.setMotionDateRange);
  const value = stored ?? DEFAULT_MOTION_DATE_RANGE;
  const setValue = useCallback(
    (next: MotionDateRangeValue) => set(next),
    [set]
  );
  return [value, setValue];
}
