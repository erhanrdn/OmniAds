import { addDaysToIsoDate } from "@/lib/meta/history";

export const META_AUTHORITATIVE_HISTORY_DAYS = 761;
export const META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS = 394;
export const META_DECISION_ENGINE_READY_WINDOW_DAYS = 30;
export const META_DECISION_ENGINE_SUPPORT_WINDOW_DAYS = 90;

export type MetaHistoricalRangeMode =
  | "current_day_live"
  | "historical_authoritative"
  | "historical_live_fallback"
  | "historical_breakdown_unsupported";

export function getMetaAuthoritativeHistoricalStart(referenceToday: string) {
  return addDaysToIsoDate(referenceToday, -META_AUTHORITATIVE_HISTORY_DAYS);
}

export function getMetaBreakdownHistoricalStart(referenceToday: string) {
  return addDaysToIsoDate(
    referenceToday,
    -(META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS - 1),
  );
}

export function isMetaRangeWithinAuthoritativeHistory(input: {
  startDate: string;
  referenceToday: string | null | undefined;
}) {
  if (!input.referenceToday) return false;
  return (
    input.startDate >=
    getMetaAuthoritativeHistoricalStart(input.referenceToday)
  );
}

export function isMetaRangeWithinBreakdownHistory(input: {
  startDate: string;
  referenceToday: string | null | undefined;
}) {
  if (!input.referenceToday) return false;
  return (
    input.startDate >= getMetaBreakdownHistoricalStart(input.referenceToday)
  );
}
