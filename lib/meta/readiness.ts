import { resolveMetaCredentials } from "@/lib/api/meta";
import {
  isMetaRangeWithinAuthoritativeHistory,
  isMetaRangeWithinBreakdownHistory,
  type MetaHistoricalRangeMode,
} from "@/lib/meta/contract";

function getTodayIsoForTimeZoneServer(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export async function getMetaRangePreparationContext(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const credentials = await resolveMetaCredentials(input.businessId).catch(() => null);
  const primaryAccountId = credentials?.accountIds?.[0] ?? null;
  const primaryAccountTimezone =
    primaryAccountId && credentials?.accountProfiles?.[primaryAccountId]?.timezone
      ? credentials.accountProfiles[primaryAccountId].timezone
      : null;
  const currentDateInTimezone = primaryAccountTimezone
    ? getTodayIsoForTimeZoneServer(primaryAccountTimezone)
    : null;
  const isSelectedCurrentDay =
    Boolean(currentDateInTimezone) &&
    input.startDate === input.endDate &&
    input.startDate === currentDateInTimezone;
  const withinAuthoritativeHistory = isMetaRangeWithinAuthoritativeHistory({
    startDate: input.startDate,
    referenceToday: currentDateInTimezone,
  });
  const withinBreakdownHistory = isMetaRangeWithinBreakdownHistory({
    startDate: input.startDate,
    referenceToday: currentDateInTimezone,
  });
  const historicalReadMode: MetaHistoricalRangeMode = isSelectedCurrentDay
    ? "current_day_live"
    : currentDateInTimezone && !withinAuthoritativeHistory
      ? "historical_live_fallback"
      : "historical_authoritative";
  const breakdownReadMode: MetaHistoricalRangeMode = isSelectedCurrentDay
    ? "current_day_live"
    : currentDateInTimezone && !withinBreakdownHistory
      ? "historical_breakdown_unsupported"
      : "historical_authoritative";

  return {
    primaryAccountTimezone,
    currentDateInTimezone,
    isSelectedCurrentDay,
    withinAuthoritativeHistory,
    withinBreakdownHistory,
    historicalReadMode,
    breakdownReadMode,
  };
}

export function getMetaPartialReason(input: {
  isSelectedCurrentDay: boolean;
  currentDateInTimezone: string | null;
  primaryAccountTimezone: string | null;
  defaultReason: string;
}) {
  if (!input.isSelectedCurrentDay) return input.defaultReason;
  const dayLabel = input.currentDateInTimezone ?? "the current account day";
  const timezoneSuffix = input.primaryAccountTimezone
    ? ` (${input.primaryAccountTimezone})`
    : "";
  return `Meta is still preparing current-day warehouse data for ${dayLabel}${timezoneSuffix}.`;
}
