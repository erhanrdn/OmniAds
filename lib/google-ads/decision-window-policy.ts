import type {
  GoogleAdvisorAnalysisWindow,
  GoogleAdvisorAnalysisWindowKey,
} from "@/lib/google-ads/growth-advisor-types";

export const GOOGLE_ADS_DECISION_WINDOW_POLICY = {
  healthAlarmDays: [1, 3, 7] as const,
  primaryOperationalDays: 28,
  queryGovernanceDays: 56,
  baselineDays: 84,
  maturityCutoffDays: 84,
} as const;

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function buildWindow(endDate: string, days: number, key: GoogleAdvisorAnalysisWindowKey, label: string, role: GoogleAdvisorAnalysisWindow["role"]): GoogleAdvisorAnalysisWindow {
  const end = parseIsoDate(endDate);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    key,
    label,
    startDate: toIsoDate(start),
    endDate,
    days,
    role,
  };
}

export function buildGoogleAdsDecisionWindowPolicy(endDate: string) {
  const healthAlarmWindows: GoogleAdvisorAnalysisWindow[] = [
    buildWindow(endDate, 1, "alarm_1d", "alarm 1d", "health_alarm"),
    buildWindow(endDate, 3, "alarm_3d", "alarm 3d", "health_alarm"),
    buildWindow(endDate, 7, "alarm_7d", "alarm 7d", "health_alarm"),
  ];
  const operationalWindow = buildWindow(
    endDate,
    GOOGLE_ADS_DECISION_WINDOW_POLICY.primaryOperationalDays,
    "operational_28d",
    "operational 28d",
    "operational_decision"
  );
  const queryGovernanceWindow = buildWindow(
    endDate,
    GOOGLE_ADS_DECISION_WINDOW_POLICY.queryGovernanceDays,
    "query_governance_56d",
    "query governance 56d",
    "query_governance"
  );
  const baselineWindow = buildWindow(
    endDate,
    GOOGLE_ADS_DECISION_WINDOW_POLICY.baselineDays,
    "baseline_84d",
    "baseline 84d",
    "baseline"
  );

  return {
    healthAlarmWindows,
    operationalWindow,
    queryGovernanceWindow,
    baselineWindow,
    maturityCutoffDays: GOOGLE_ADS_DECISION_WINDOW_POLICY.maturityCutoffDays,
  };
}

