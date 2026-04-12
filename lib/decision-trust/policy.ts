import type {
  DecisionEvidenceFloor,
  DecisionEvidenceFloorStatus,
  DecisionPolicyCompare,
  DecisionPolicyExplanation,
} from "@/src/types/decision-trust";

function normalizeRequired(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function buildPolicyFloor(input: {
  key: string;
  label: string;
  current: string | null | undefined;
  required: string | null | undefined;
  status: DecisionEvidenceFloorStatus;
  reason?: string | null;
}): DecisionEvidenceFloor {
  return {
    key: input.key,
    label: input.label,
    status: input.status,
    current: input.current?.trim() || "unknown",
    required: normalizeRequired(input.required, "documented alignment"),
    reason: input.reason ?? null,
  };
}

export function buildObjectiveFamilyPolicyFloor(input: {
  current: string | null | undefined;
  status: DecisionEvidenceFloorStatus;
  reason?: string | null;
  required?: string | null;
}) {
  return buildPolicyFloor({
    key: "objective_family",
    label: "Objective family",
    current: input.current,
    required: input.required ?? "policy-compatible objective",
    status: input.status,
    reason: input.reason,
  });
}

export function buildBidRegimePolicyFloor(input: {
  current: string | null | undefined;
  status: DecisionEvidenceFloorStatus;
  reason?: string | null;
  required?: string | null;
}) {
  return buildPolicyFloor({
    key: "bid_regime",
    label: "Bid regime",
    current: input.current,
    required: input.required ?? "bid regime aligned with the next move",
    status: input.status,
    reason: input.reason,
  });
}

export function buildCampaignFamilyPolicyFloor(input: {
  current: string | null | undefined;
  status: DecisionEvidenceFloorStatus;
  reason?: string | null;
  required?: string | null;
}) {
  return buildPolicyFloor({
    key: "campaign_family",
    label: "Campaign family",
    current: input.current,
    required: input.required ?? "family aligned with the target lane",
    status: input.status,
    reason: input.reason,
  });
}

export function buildDeploymentCompatibilityPolicyFloor(input: {
  current: string | null | undefined;
  status: DecisionEvidenceFloorStatus;
  reason?: string | null;
  required?: string | null;
}) {
  return buildPolicyFloor({
    key: "deployment_compatibility",
    label: "Deployment compatibility",
    current: input.current,
    required: input.required ?? "compatible live lane",
    status: input.status,
    reason: input.reason,
  });
}

export function buildDecisionPolicyCompare(input: {
  baselineAction: string;
  candidateAction: string;
  allowCandidate: boolean;
  compareMode?: boolean;
  candidateReason?: string | null;
  baselineReason?: string | null;
}): DecisionPolicyCompare {
  const compareMode = input.compareMode ?? true;
  if (input.baselineAction === input.candidateAction) {
    return {
      compareMode,
      baselineAction: input.baselineAction,
      candidateAction: input.candidateAction,
      selectedAction: input.baselineAction,
      cutoverState: "matched",
      reason:
        input.candidateReason ??
        "Candidate ladder matched the baseline action, so no cutover guard was needed.",
    };
  }

  if (input.allowCandidate) {
    return {
      compareMode,
      baselineAction: input.baselineAction,
      candidateAction: input.candidateAction,
      selectedAction: input.candidateAction,
      cutoverState: "candidate_active",
      reason:
        input.candidateReason ??
        "Candidate ladder stayed inside the safe cutover guard, so it became the active action.",
    };
  }

  return {
    compareMode,
    baselineAction: input.baselineAction,
    candidateAction: input.candidateAction,
    selectedAction: input.baselineAction,
    cutoverState: "baseline_locked",
    reason:
      input.baselineReason ??
      "Candidate ladder was held in compare mode because the safe cutover guard kept the baseline action active.",
  };
}

export function compileDecisionPolicyExplanation(input: {
  summary: string;
  axes: DecisionEvidenceFloor[];
  degradedReasons?: string[];
  actionCeiling?: string | null;
  protectedWinnerHandling?: string | null;
  fatigueOrComeback?: string | null;
  supplyPlanning?: string | null;
  compare: DecisionPolicyCompare;
}): DecisionPolicyExplanation {
  return {
    summary: input.summary,
    evidenceHits: input.axes.filter((axis) => axis.status === "met"),
    missingEvidence: input.axes.filter((axis) => axis.status === "watch"),
    blockers: input.axes.filter((axis) => axis.status === "blocked"),
    degradedReasons: input.degradedReasons ?? [],
    actionCeiling: input.actionCeiling ?? null,
    protectedWinnerHandling: input.protectedWinnerHandling ?? null,
    fatigueOrComeback: input.fatigueOrComeback ?? null,
    supplyPlanning: input.supplyPlanning ?? null,
    compare: input.compare,
  };
}
