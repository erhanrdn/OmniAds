export const DECISION_SURFACE_LANES = [
  "action_core",
  "watchlist",
  "archive_context",
  "opportunity_board",
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

export const DECISION_ENTITY_STATES = [
  "active",
  "paused",
  "retired",
  "stale",
  "inactive",
] as const;

export type DecisionEntityState = (typeof DECISION_ENTITY_STATES)[number];

export const DECISION_MATERIALITY_STATES = [
  "material",
  "thin_signal",
  "immaterial",
] as const;

export type DecisionMaterialityState =
  (typeof DECISION_MATERIALITY_STATES)[number];

export const DECISION_EVIDENCE_COMPLETENESS = [
  "complete",
  "partial",
  "missing",
] as const;

export type DecisionEvidenceCompleteness =
  (typeof DECISION_EVIDENCE_COMPLETENESS)[number];

export const DECISION_FRESHNESS_STATES = [
  "fresh",
  "partial",
  "stale",
  "timeout",
] as const;

export type DecisionFreshnessState = (typeof DECISION_FRESHNESS_STATES)[number];

export interface DecisionFreshnessMetadata {
  status: DecisionFreshnessState;
  updatedAt: string | null;
  reason: string | null;
}

export const DECISION_SOURCE_HEALTH_STATUSES = [
  "healthy",
  "stale",
  "timeout",
  "degraded",
] as const;

export type DecisionSourceHealthStatus =
  (typeof DECISION_SOURCE_HEALTH_STATUSES)[number];

export const DECISION_READ_RELIABILITY_STATUSES = [
  "stable",
  "fallback",
  "degraded",
] as const;

export type DecisionReadReliabilityStatus =
  (typeof DECISION_READ_RELIABILITY_STATUSES)[number];

export interface DecisionSourceHealthEntry {
  source: string;
  status: DecisionSourceHealthStatus;
  detail: string;
  fallbackLabel: string | null;
}

export interface DecisionReadReliability {
  status: DecisionReadReliabilityStatus;
  detail: string;
  determinism: "stable" | "watch" | "unstable";
}

export interface DecisionEvidenceEnvelope {
  entityState: DecisionEntityState;
  materiality: DecisionMaterialityState;
  completeness: DecisionEvidenceCompleteness;
  freshness: DecisionFreshnessMetadata;
  suppressed: boolean;
  suppressionReasons: string[];
  aggressiveActionBlocked: boolean;
  aggressiveActionBlockReasons: string[];
}

export interface DecisionSurfaceAuthority {
  scope: string;
  truthState: DecisionTruthState;
  completeness: DecisionEvidenceCompleteness;
  freshness: DecisionFreshnessMetadata;
  missingInputs: string[];
  reasons: string[];
  actionCoreCount: number;
  watchlistCount: number;
  archiveCount: number;
  suppressedCount: number;
  note: string;
  sourceHealth?: DecisionSourceHealthEntry[];
  readReliability?: DecisionReadReliability | null;
}

export const DECISION_EVIDENCE_FLOOR_STATUSES = [
  "met",
  "watch",
  "blocked",
] as const;

export type DecisionEvidenceFloorStatus =
  (typeof DECISION_EVIDENCE_FLOOR_STATUSES)[number];

export interface DecisionEvidenceFloor {
  key: string;
  label: string;
  status: DecisionEvidenceFloorStatus;
  current: string;
  required: string;
  reason: string | null;
}

export interface DecisionOpportunityQueueEligibility {
  eligible: boolean;
  blockedReasons: string[];
  watchReasons: string[];
  eligibilityTrace: {
    verdict: "queue_ready" | "board_only" | "protected" | "blocked";
    evidenceFloors: {
      met: string[];
      watch: string[];
      blocked: string[];
    };
    sharedTruthBlockers: string[];
    queueCompilerDecision: string;
    protectedReasons: string[];
    blockedReasons: string[];
    watchReasons: string[];
  };
}

export const DECISION_POLICY_CUTOVER_STATES = [
  "matched",
  "candidate_active",
  "baseline_locked",
] as const;

export type DecisionPolicyCutoverState =
  (typeof DECISION_POLICY_CUTOVER_STATES)[number];

export interface DecisionPolicyCompare {
  compareMode: boolean;
  baselineAction: string;
  candidateAction: string;
  selectedAction: string;
  cutoverState: DecisionPolicyCutoverState;
  reason: string;
}

export interface DecisionPolicyExplanation {
  summary: string;
  evidenceHits: DecisionEvidenceFloor[];
  missingEvidence: DecisionEvidenceFloor[];
  blockers: DecisionEvidenceFloor[];
  degradedReasons: string[];
  actionCeiling: string | null;
  protectedWinnerHandling: string | null;
  fatigueOrComeback: string | null;
  supplyPlanning: string | null;
  compare: DecisionPolicyCompare;
}

export interface DecisionTrustMetadata {
  surfaceLane: DecisionSurfaceLane;
  truthState: DecisionTruthState;
  operatorDisposition: DecisionOperatorDisposition;
  reasons: string[];
  evidence?: DecisionEvidenceEnvelope;
}
