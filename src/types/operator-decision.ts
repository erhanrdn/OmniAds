export const OPERATOR_DECISION_WINDOW_KEYS = [
  "recent7d",
  "primary30d",
  "baseline90d",
] as const;

export type OperatorDecisionWindowKey =
  (typeof OPERATOR_DECISION_WINDOW_KEYS)[number];

export interface OperatorAnalyticsWindow {
  startDate: string;
  endDate: string;
  role: "analysis_only";
}

export interface OperatorDecisionWindow {
  key: OperatorDecisionWindowKey;
  label: string;
  startDate: string;
  endDate: string;
  days: number;
  role: "recent_watch" | "decision_authority" | "historical_memory";
}

export interface OperatorDecisionWindows {
  recent7d: OperatorDecisionWindow;
  primary30d: OperatorDecisionWindow;
  baseline90d: OperatorDecisionWindow;
}

export interface OperatorHistoricalMemory {
  available: boolean;
  source: "rolling_baseline";
  baselineWindowKey: "baseline90d";
  startDate: string;
  endDate: string;
  lookbackDays: number;
  note: string;
}
