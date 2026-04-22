import type {
  OperatorDecisionProvenance,
  OperatorInstruction,
  OperatorInstructionAmountGuidance,
  OperatorInstructionEvidenceStrength,
  OperatorInstructionKind,
  OperatorInstructionUrgency,
  OperatorPolicyAssessment,
} from "@/src/types/operator-decision";

type PrescriptionSourceSystem = OperatorInstruction["policySource"]["sourceSystem"];

function uniqueText(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function sentenceCase(value: string) {
  const normalized = value.trim();
  if (!normalized) return normalized;
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function normalizeLabel(value: string | null | undefined) {
  return sentenceCase((value ?? "").replaceAll("_", " "));
}

function confidenceLabel(value: number | null | undefined): OperatorInstruction["confidenceLabel"] {
  if ((value ?? 0) >= 0.82) return "High";
  if ((value ?? 0) >= 0.66) return "Medium";
  return "Limited";
}

function instructionKind(policy: OperatorPolicyAssessment | null | undefined): OperatorInstructionKind {
  return policy?.state ?? "contextual_only";
}

function operatorVerb(kind: OperatorInstructionKind) {
  switch (kind) {
    case "do_now":
      return "Do";
    case "do_not_touch":
      return "Protect";
    case "watch":
      return "Watch";
    case "investigate":
      return "Investigate";
    case "blocked":
      return "Do not act";
    case "contextual_only":
      return "Use as context";
    default:
      return "Review";
  }
}

function defaultUrgency(kind: OperatorInstructionKind): OperatorInstructionUrgency {
  if (kind === "do_now") return "high";
  if (kind === "blocked") return "medium";
  if (kind === "investigate") return "medium";
  if (kind === "watch") return "watch";
  return "low";
}

function defaultEvidenceStrength(input: {
  kind: OperatorInstructionKind;
  confidence: number | null | undefined;
  evidenceSource?: string | null;
  policy?: OperatorPolicyAssessment | null;
}): OperatorInstructionEvidenceStrength {
  if (input.kind === "blocked") return "blocked";
  if (input.policy?.blockers.length) return "blocked";
  if (input.kind === "contextual_only") return "limited";
  if (input.evidenceSource && input.evidenceSource !== "live") return "limited";
  if (input.kind === "watch" || input.kind === "investigate") return "limited";
  if ((input.confidence ?? 0) >= 0.82) return "strong";
  if ((input.confidence ?? 0) >= 0.66) return "medium";
  return "limited";
}

function defaultAmountGuidance(
  kind: OperatorInstructionKind,
  actionLabel: string,
  override?: OperatorInstructionAmountGuidance | null,
): OperatorInstructionAmountGuidance {
  if (override) return override;
  const lowerAction = actionLabel.toLowerCase();
  if (
    kind === "do_now" &&
    (lowerAction.includes("scale") ||
      lowerAction.includes("budget") ||
      lowerAction.includes("increase") ||
      lowerAction.includes("reduce"))
  ) {
    return {
      status: "unavailable",
      label: "No safe amount calculated",
      reason:
        "The deterministic policy authorizes the class of work, but this layer does not calculate a safe budget or bid amount.",
    };
  }
  if (kind === "do_not_touch" || kind === "contextual_only" || kind === "blocked") {
    return {
      status: "not_applicable",
      label: "No amount",
      reason: "No executable amount applies while the instruction is protected, contextual, or blocked.",
    };
  }
  return {
    status: "unavailable",
    label: "Amount unavailable",
    reason: "No deterministic amount is available from the current evidence.",
  };
}

function defaultInvalidActions(input: {
  kind: OperatorInstructionKind;
  actionLabel: string;
  policy?: OperatorPolicyAssessment | null;
  amountGuidance: OperatorInstructionAmountGuidance;
  extra?: string[];
}) {
  const values = [...(input.extra ?? [])];
  if (!input.policy) {
    values.push("Do not queue or push without deterministic operator policy.");
  }
  if (input.policy?.pushReadiness === "blocked_from_push") {
    values.push("Do not queue, apply, or push until policy readiness changes.");
  }
  if (input.kind === "do_not_touch") {
    values.push("Do not pause, refresh, resize, or reset this protected row from short-term volatility.");
  }
  if (input.kind === "watch") {
    values.push("Do not convert this watch read into a scale, kill, budget, or bid command yet.");
  }
  if (input.kind === "investigate") {
    values.push("Do not make the primary move until the investigation evidence is resolved.");
  }
  if (input.kind === "blocked") {
    values.push("Do not act until the blocker is removed.");
  }
  if (input.kind === "contextual_only") {
    values.push("Do not treat contextual or selected-range evidence as primary action authority.");
  }
  if (input.amountGuidance.status === "unavailable") {
    values.push("Do not invent a budget, bid, or spend amount.");
  }
  return uniqueText(values);
}

function defaultPrimaryMove(input: {
  kind: OperatorInstructionKind;
  actionLabel: string;
  targetEntity: string;
  reason: string;
  nextObservation: string[];
  missingEvidence: string[];
  amountGuidance: OperatorInstructionAmountGuidance;
}) {
  const action = input.actionLabel.toLowerCase();
  if (input.kind === "do_now") {
    return input.amountGuidance.status === "unavailable"
      ? `${input.actionLabel} ${input.targetEntity}, but do not invent a budget or bid amount.`
      : `${input.actionLabel} ${input.targetEntity}.`;
  }
  if (input.kind === "do_not_touch") {
    return `Keep ${input.targetEntity} live and protected; do not force a new action from short-term movement.`;
  }
  if (input.kind === "watch") {
    return `Keep watching ${input.targetEntity}; wait for ${input.nextObservation[0] ?? input.missingEvidence[0] ?? "more stable evidence"} before ${action}.`;
  }
  if (input.kind === "investigate") {
    return `Investigate ${input.targetEntity} before ${action}; the current read is not command-ready.`;
  }
  if (input.kind === "blocked") {
    return `Do not act on ${input.targetEntity}; resolve ${input.missingEvidence[0] ?? input.reason} first.`;
  }
  return `Use ${input.targetEntity} as context only; it is not a primary operator command.`;
}

export function buildOperatorInstruction(input: {
  sourceSystem: PrescriptionSourceSystem;
  sourceLabel: string;
  policy?: OperatorPolicyAssessment | null;
  policyVersion?: string | null;
  targetScope: string;
  targetEntity: string;
  parentEntity?: string | null;
  actionLabel: string;
  reason: string;
  blocker?: string | null;
  confidenceScore?: number | null;
  evidenceSource?: string | null;
  trustState?: string | null;
  operatorDisposition?: string | null;
  provenance?: OperatorDecisionProvenance | null;
  evidenceHash?: string | null;
  actionFingerprint?: string | null;
  nextObservation?: string[];
  invalidActions?: string[];
  amountGuidance?: OperatorInstructionAmountGuidance | null;
  urgency?: OperatorInstructionUrgency;
}): OperatorInstruction {
  const policy = input.policy ?? null;
  const kind = instructionKind(policy);
  const amountGuidance = defaultAmountGuidance(kind, input.actionLabel, input.amountGuidance);
  const missingEvidence = uniqueText(policy?.missingEvidence ?? []);
  const nextObservation = uniqueText([
    ...(input.nextObservation ?? []),
    ...(policy?.requiredEvidence ?? []).map((item) => `Confirm ${normalizeLabel(item).toLowerCase()}.`),
  ]).slice(0, 4);
  const reasonSummary =
    input.reason ||
    input.blocker ||
    policy?.reasons[0] ||
    policy?.explanation ||
    "Deterministic operator policy completed.";
  const invalidActions = defaultInvalidActions({
    kind,
    actionLabel: input.actionLabel,
    policy,
    amountGuidance,
    extra: input.invalidActions,
  });
  const evidenceStrength = defaultEvidenceStrength({
    kind,
    confidence: input.confidenceScore,
    evidenceSource: input.evidenceSource,
    policy,
  });

  return {
    contractVersion: "operator-instruction.v1",
    instructionKind: kind,
    operatorVerb: operatorVerb(kind),
    headline:
      kind === "do_now"
        ? `${input.actionLabel}: ${input.targetEntity}`
        : `${operatorVerb(kind)}: ${input.targetEntity}`,
    primaryMove: defaultPrimaryMove({
      kind,
      actionLabel: input.actionLabel,
      targetEntity: input.targetEntity,
      reason: reasonSummary,
      nextObservation,
      missingEvidence,
      amountGuidance,
    }),
    targetScope: input.targetScope,
    targetEntity: input.targetEntity,
    parentEntity: input.parentEntity ?? null,
    reasonSummary,
    evidenceStrength,
    missingEvidence,
    nextObservation,
    invalidActions,
    amountGuidance,
    pushReadiness: policy?.pushReadiness ?? "blocked_from_push",
    queueEligible: policy?.queueEligible === true,
    canApply: policy?.canApply === true,
    urgency: input.urgency ?? defaultUrgency(kind),
    confidenceScore: input.confidenceScore ?? null,
    confidenceLabel: confidenceLabel(input.confidenceScore),
    reliability: {
      evidenceSource: input.evidenceSource ?? null,
      trustState: input.trustState ?? null,
      operatorDisposition: input.operatorDisposition ?? null,
    },
    policySource: {
      sourceSystem: input.sourceSystem,
      sourceLabel: input.sourceLabel,
      policyContract: "operator-policy.v1",
      policyVersion: input.policyVersion ?? null,
    },
    provenance: input.provenance ?? null,
    evidenceHash: input.evidenceHash ?? input.provenance?.evidenceHash ?? null,
    actionFingerprint:
      input.actionFingerprint ?? input.provenance?.actionFingerprint ?? null,
  };
}
