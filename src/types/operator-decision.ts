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

export interface OperatorDecisionReportingRange {
  startDate: string;
  endDate: string;
  role: "reporting_context";
}

export interface OperatorDecisionSourceWindow {
  key: OperatorDecisionWindowKey;
  startDate: string;
  endDate: string;
  role: OperatorDecisionWindow["role"];
}

export interface OperatorDecisionSourceRowScope {
  system: "meta" | "creative" | "command_center";
  entityType:
    | "campaign"
    | "adset"
    | "geo"
    | "placement"
    | "creative"
    | "family"
    | "opportunity"
    | "budget_shift"
    | "unknown";
  entityId: string;
}

export interface OperatorDecisionProvenance {
  contractVersion: "operator-decision-provenance.v1";
  businessId: string;
  decisionAsOf: string;
  analyticsWindow: OperatorAnalyticsWindow;
  reportingRange: OperatorDecisionReportingRange;
  sourceWindow: OperatorDecisionSourceWindow;
  sourceRowScope: OperatorDecisionSourceRowScope;
  sourceDecisionId: string;
  evidenceHash: string;
  actionFingerprint: string;
}

export interface OperatorDecisionPushEligibility {
  queueEligible: boolean;
  canApply: boolean;
  canRollback: boolean;
  level:
    | "read_only_insight"
    | "operator_review_required"
    | "safe_to_queue"
    | "eligible_for_push_when_enabled"
      | "blocked_from_push";
  blockedReason: string | null;
}

export const OPERATOR_POLICY_STATES = [
  "do_now",
  "do_not_touch",
  "watch",
  "investigate",
  "blocked",
  "contextual_only",
] as const;

export type OperatorPolicyState = (typeof OPERATOR_POLICY_STATES)[number];

export interface OperatorPolicyAssessment {
  contractVersion: "operator-policy.v1";
  state: OperatorPolicyState;
  actionClass: string;
  pushReadiness: OperatorDecisionPushEligibility["level"];
  queueEligible: boolean;
  canApply: boolean;
  reasons: string[];
  blockers: string[];
  missingEvidence: string[];
  requiredEvidence: string[];
  explanation: string;
}

export type OperatorInstructionKind =
  | "do_now"
  | "do_not_touch"
  | "watch"
  | "investigate"
  | "blocked"
  | "contextual_only";

export type OperatorInstructionEvidenceStrength =
  | "strong"
  | "medium"
  | "limited"
  | "blocked";

export type OperatorInstructionUrgency =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "watch";

export interface OperatorInstructionAmountGuidance {
  status: "not_applicable" | "unavailable" | "bounded_estimate";
  label: string;
  reason: string;
  assumptions?: string[];
}

export interface OperatorInstructionTargetContext {
  status: "available" | "review_required" | "unavailable";
  label: string;
  reason: string;
  targetScope?: string | null;
  targetEntity?: string | null;
  parentEntity?: string | null;
}

export interface OperatorDecisionTelemetry {
  contractVersion: "operator-decision-telemetry.v1";
  policyVersion: string | null;
  sourceSystem: "meta" | "creative" | "command_center";
  sourceSurface: string;
  instructionKind: OperatorInstructionKind;
  pushReadiness: OperatorDecisionPushEligibility["level"];
  queueEligible: boolean;
  canApply: boolean;
  evidenceStrength: OperatorInstructionEvidenceStrength;
  urgency: OperatorInstructionUrgency;
  amountGuidanceStatus: OperatorInstructionAmountGuidance["status"];
  targetContextStatus: OperatorInstructionTargetContext["status"];
  missingEvidence: string[];
  missingEvidenceCount: number;
  invalidActionCount: number;
  nextObservationCount: number;
  blockedReason: string | null;
  actionFingerprint: string | null;
  evidenceHash: string | null;
}

export interface OperatorInstruction {
  contractVersion: "operator-instruction.v1";
  instructionKind: OperatorInstructionKind;
  operatorVerb: string;
  headline: string;
  primaryMove: string;
  targetScope: string;
  targetEntity: string;
  parentEntity?: string | null;
  targetContext: OperatorInstructionTargetContext;
  reasonSummary: string;
  evidenceStrength: OperatorInstructionEvidenceStrength;
  missingEvidence: string[];
  nextObservation: string[];
  invalidActions: string[];
  amountGuidance: OperatorInstructionAmountGuidance;
  pushReadiness: OperatorDecisionPushEligibility["level"];
  queueEligible: boolean;
  canApply: boolean;
  urgency: OperatorInstructionUrgency;
  confidenceScore: number | null;
  confidenceLabel: "High" | "Medium" | "Limited";
  reliability: {
    evidenceSource?: string | null;
    trustState?: string | null;
    operatorDisposition?: string | null;
  };
  policySource: {
    sourceSystem: "meta" | "creative" | "command_center";
    sourceLabel: string;
    policyContract: "operator-policy.v1";
    policyVersion?: string | null;
  };
  urgencyReason: string;
  telemetry: OperatorDecisionTelemetry;
  provenance?: OperatorDecisionProvenance | null;
  evidenceHash?: string | null;
  actionFingerprint?: string | null;
}
