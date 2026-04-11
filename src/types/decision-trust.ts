export const DECISION_SURFACE_LANES = [
  "action_core",
  "watchlist",
  "archive_context",
] as const;

export type DecisionSurfaceLane = (typeof DECISION_SURFACE_LANES)[number];

export const DECISION_TRUTH_STATES = [
  "live_confident",
  "degraded_missing_truth",
  "inactive_or_immaterial",
] as const;

export type DecisionTruthState = (typeof DECISION_TRUTH_STATES)[number];

export const DECISION_OPERATOR_DISPOSITIONS = [
  "standard",
  "review_hold",
  "review_reduce",
  "monitor_low_truth",
  "degraded_no_scale",
  "protected_watchlist",
  "archive_only",
] as const;

export type DecisionOperatorDisposition =
  (typeof DECISION_OPERATOR_DISPOSITIONS)[number];

export const DECISION_SAFE_ACTION_LABELS = [
  "review_hold",
  "review_reduce",
  "monitor_low_truth",
  "degraded_no_scale",
] as const;

export type DecisionSafeActionLabel =
  (typeof DECISION_SAFE_ACTION_LABELS)[number];

export interface DecisionTrustMetadata {
  surfaceLane: DecisionSurfaceLane;
  truthState: DecisionTruthState;
  operatorDisposition: DecisionOperatorDisposition;
  reasons: string[];
}
