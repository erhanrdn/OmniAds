import { META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS } from "@/lib/meta/contract";

export const META_BREAKDOWN_MAX_HISTORY_DAYS =
  META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS;
export const META_STANDARD_INSIGHTS_MAX_HISTORY_MONTHS = 37;
export const META_ATTRIBUTION_UNIFICATION_DATE = "2025-06-10";
export const META_HISTORICAL_REMOVALS_DATE = "2026-01-12";

function addDaysToIso(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getMetaBreakdownSupportedStart(referenceToday: string) {
  return addDaysToIso(referenceToday, -(META_BREAKDOWN_MAX_HISTORY_DAYS - 1));
}

export function getMetaBreakdownGuardrail(input: {
  startDate: string;
  endDate: string;
  referenceToday: string | null | undefined;
}) {
  if (!input.referenceToday) {
    return {
      applies: false,
      supportedStart: null,
      message: null,
    };
  }

  const supportedStart = getMetaBreakdownSupportedStart(input.referenceToday);
  const applies = input.startDate < supportedStart;
  return {
    applies,
    supportedStart,
    message: applies
      ? `Meta breakdown data is only supported for the latest ${META_BREAKDOWN_MAX_HISTORY_DAYS} days. Supported start: ${supportedStart}.`
      : null,
  };
}
