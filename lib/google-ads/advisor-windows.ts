import type { GoogleAdsDateRange } from "@/lib/google-ads-request-params";

export interface GoogleAdsAdvisorSelectedWindow {
  key: "selected";
  label: string;
  customStart: string;
  customEnd: string;
  days: number;
}

export interface GoogleAdsAdvisorSupportWindow {
  key:
    | "alarm_1d"
    | "alarm_3d"
    | "alarm_7d"
    | "operational_28d"
    | "query_governance_56d"
    | "baseline_84d";
  label: string;
  customStart: string;
  customEnd: string;
  days: number;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function countInclusiveDays(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate).getTime();
  const end = parseIsoDate(endDate).getTime();
  const diff = Math.round((end - start) / 86_400_000);
  return Math.max(1, diff + 1);
}

export function buildAdvisorWindowFromDays(endDate: Date, days: number) {
  const end = new Date(endDate);
  const start = new Date(endDate);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    customStart: toIsoDate(start),
    customEnd: toIsoDate(end),
    days,
  };
}

export function getGoogleAdsAdvisorRequestedDays(input: {
  dateRange: GoogleAdsDateRange;
  customStart?: string | null;
  customEnd?: string | null;
}) {
  if (input.dateRange === "custom" && input.customStart && input.customEnd) {
    return countInclusiveDays(input.customStart, input.customEnd);
  }
  const parsed = Number(input.dateRange);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

export function buildGoogleAdsAdvisorWindows(input: {
  dateRange: GoogleAdsDateRange;
  customStart?: string | null;
  customEnd?: string | null;
}) {
  const endDate = input.customEnd
    ? parseIsoDate(input.customEnd)
    : new Date(`${toIsoDate(new Date())}T00:00:00Z`);
  const requestedDays = getGoogleAdsAdvisorRequestedDays(input);
  const selectedBase =
    input.dateRange === "custom" && input.customStart && input.customEnd
      ? {
          customStart: input.customStart,
          customEnd: input.customEnd,
          days: requestedDays,
        }
      : buildAdvisorWindowFromDays(endDate, requestedDays);

  const selectedWindow: GoogleAdsAdvisorSelectedWindow = {
    key: "selected",
    label: `selected ${requestedDays}d`,
    ...selectedBase,
  };

  const supportWindows: GoogleAdsAdvisorSupportWindow[] = [
    { key: "alarm_1d", label: "alarm 1d", ...buildAdvisorWindowFromDays(endDate, 1) },
    { key: "alarm_3d", label: "alarm 3d", ...buildAdvisorWindowFromDays(endDate, 3) },
    { key: "alarm_7d", label: "alarm 7d", ...buildAdvisorWindowFromDays(endDate, 7) },
    { key: "operational_28d", label: "operational 28d", ...buildAdvisorWindowFromDays(endDate, 28) },
    {
      key: "query_governance_56d",
      label: "query governance 56d",
      ...buildAdvisorWindowFromDays(endDate, 56),
    },
    { key: "baseline_84d", label: "baseline 84d", ...buildAdvisorWindowFromDays(endDate, 84) },
  ];

  return {
    requestedDays,
    selectedWindow,
    supportWindows,
  };
}
