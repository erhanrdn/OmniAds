import { addDaysToIsoDateUtc, getProviderPlatformPreviousDate } from "@/lib/provider-platform-date";
import {
  META_DECISION_ENGINE_READY_WINDOW_DAYS,
  META_DECISION_ENGINE_SUPPORT_WINDOW_DAYS,
} from "@/lib/meta/contract";
import type {
  OperatorAnalyticsWindow,
  OperatorDecisionWindow,
  OperatorDecisionWindows,
  OperatorHistoricalMemory,
} from "@/src/types/operator-decision";

function buildDecisionWindow(
  endDate: string,
  days: number,
  key: OperatorDecisionWindow["key"],
  label: string,
  role: OperatorDecisionWindow["role"],
): OperatorDecisionWindow {
  return {
    key,
    label,
    startDate: addDaysToIsoDateUtc(endDate, -(days - 1)),
    endDate,
    days,
    role,
  };
}

export function buildOperatorAnalyticsWindow(
  startDate: string,
  endDate: string,
): OperatorAnalyticsWindow {
  return {
    startDate,
    endDate,
    role: "analysis_only",
  };
}

export function buildOperatorDecisionWindows(
  decisionAsOf: string,
): OperatorDecisionWindows {
  return {
    recent7d: buildDecisionWindow(
      decisionAsOf,
      7,
      "recent7d",
      "recent 7d",
      "recent_watch",
    ),
    primary30d: buildDecisionWindow(
      decisionAsOf,
      META_DECISION_ENGINE_READY_WINDOW_DAYS,
      "primary30d",
      "primary 30d",
      "decision_authority",
    ),
    baseline90d: buildDecisionWindow(
      decisionAsOf,
      META_DECISION_ENGINE_SUPPORT_WINDOW_DAYS,
      "baseline90d",
      "baseline 90d",
      "historical_memory",
    ),
  };
}

export function buildOperatorHistoricalMemory(
  decisionWindows: OperatorDecisionWindows,
): OperatorHistoricalMemory {
  return {
    available: true,
    source: "rolling_baseline",
    baselineWindowKey: "baseline90d",
    startDate: decisionWindows.baseline90d.startDate,
    endDate: decisionWindows.baseline90d.endDate,
    lookbackDays: decisionWindows.baseline90d.days,
    note: "Decisions use live rolling windows with baseline memory instead of the selected period.",
  };
}

export function buildOperatorDecisionMetadata(input: {
  analyticsStartDate: string;
  analyticsEndDate: string;
  decisionAsOf: string;
}) {
  const analyticsWindow = buildOperatorAnalyticsWindow(
    input.analyticsStartDate,
    input.analyticsEndDate,
  );
  const decisionWindows = buildOperatorDecisionWindows(input.decisionAsOf);
  return {
    analyticsWindow,
    decisionWindows,
    historicalMemory: buildOperatorHistoricalMemory(decisionWindows),
    decisionAsOf: input.decisionAsOf,
  };
}

export async function getMetaOperatorDecisionMetadata(input: {
  businessId: string;
  analyticsStartDate: string;
  analyticsEndDate: string;
  decisionAsOf?: string | null;
}) {
  const requestedDecisionAsOf = input.decisionAsOf?.trim() || null;
  const decisionAsOf =
    requestedDecisionAsOf ??
    (await getProviderPlatformPreviousDate({
      provider: "meta",
      businessId: input.businessId,
    }));

  return buildOperatorDecisionMetadata({
    analyticsStartDate: input.analyticsStartDate,
    analyticsEndDate: input.analyticsEndDate,
    decisionAsOf,
  });
}
