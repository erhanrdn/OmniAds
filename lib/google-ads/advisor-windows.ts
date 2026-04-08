import type { GoogleAdsDateRange } from "@/lib/google-ads-request-params";
import { buildGoogleAdsDecisionWindowPolicy } from "@/lib/google-ads/decision-window-policy";

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

  const policy = buildGoogleAdsDecisionWindowPolicy(toIsoDate(endDate));
  const supportWindows: GoogleAdsAdvisorSupportWindow[] = [
    ...policy.healthAlarmWindows.map((window) => ({
      key: window.key,
      label: window.label,
      customStart: window.startDate,
      customEnd: window.endDate,
      days: window.days,
    })),
    {
      key: policy.operationalWindow.key,
      label: policy.operationalWindow.label,
      customStart: policy.operationalWindow.startDate,
      customEnd: policy.operationalWindow.endDate,
      days: policy.operationalWindow.days,
    },
    {
      key: policy.queryGovernanceWindow.key,
      label: policy.queryGovernanceWindow.label,
      customStart: policy.queryGovernanceWindow.startDate,
      customEnd: policy.queryGovernanceWindow.endDate,
      days: policy.queryGovernanceWindow.days,
    },
    {
      key: policy.baselineWindow.key,
      label: policy.baselineWindow.label,
      customStart: policy.baselineWindow.startDate,
      customEnd: policy.baselineWindow.endDate,
      days: policy.baselineWindow.days,
    },
  ];

  return {
    requestedDays,
    selectedWindow,
    supportWindows,
  };
}
