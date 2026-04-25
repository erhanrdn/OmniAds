import type {
  OperatorDecisionPushEligibility,
  OperatorDecisionProvenance,
  OperatorDecisionTelemetry,
  OperatorInstruction,
  OperatorInstructionAmountGuidance,
  OperatorInstructionEvidenceStrength,
  OperatorInstructionKind,
  OperatorInstructionTargetContext,
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
      return "Review";
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

const PUSH_READINESS_RESTRICTIVENESS: Record<
  OperatorDecisionPushEligibility["level"],
  number
> = {
  blocked_from_push: 0,
  read_only_insight: 1,
  operator_review_required: 2,
  safe_to_queue: 3,
  eligible_for_push_when_enabled: 4,
};

function mostRestrictivePushReadiness(
  left: OperatorDecisionPushEligibility["level"],
  right: OperatorDecisionPushEligibility["level"],
) {
  return PUSH_READINESS_RESTRICTIVENESS[left] <= PUSH_READINESS_RESTRICTIVENESS[right]
    ? left
    : right;
}

function resolvePolicyReadiness(input: {
  policy: OperatorPolicyAssessment | null;
  requiresPolicyForQueue: boolean;
  pushReadinessOverride?: OperatorInstruction["pushReadiness"] | null;
  queueEligibleOverride?: boolean | null;
  canApplyOverride?: boolean | null;
}) {
  if (!input.policy && input.requiresPolicyForQueue) {
    return {
      pushReadiness: "blocked_from_push" as const,
      queueEligible: false,
      canApply: false,
    };
  }

  if (!input.policy) {
    return {
      pushReadiness: input.pushReadinessOverride ?? "blocked_from_push",
      queueEligible: input.queueEligibleOverride === true,
      canApply: false,
    };
  }

  const pushReadiness = mostRestrictivePushReadiness(
    input.policy.pushReadiness,
    input.pushReadinessOverride ?? input.policy.pushReadiness,
  );

  return {
    pushReadiness,
    queueEligible:
      input.policy.queueEligible === true &&
      (input.queueEligibleOverride ?? input.policy.queueEligible) === true,
    canApply:
      input.policy.canApply === true &&
      (input.canApplyOverride ?? input.policy.canApply) === true,
  };
}

function defaultUrgency(input: {
  kind: OperatorInstructionKind;
  evidenceStrength: OperatorInstructionEvidenceStrength;
  pushReadiness: OperatorInstruction["pushReadiness"];
  confidence: number | null | undefined;
  missingEvidence: string[];
  invalidActions: string[];
}): { urgency: OperatorInstructionUrgency; reason: string } {
  if (input.kind === "do_now") {
    if (
      input.evidenceStrength === "strong" &&
      (input.pushReadiness === "safe_to_queue" ||
        input.pushReadiness === "eligible_for_push_when_enabled")
    ) {
      return {
        urgency: "high",
        reason: "Strong evidence and queue-ready policy make this a near-term operator move.",
      };
    }
    return {
      urgency: "medium",
      reason: "The move is active, but evidence, review readiness, or missing context keeps urgency bounded.",
    };
  }
  if (input.kind === "blocked") {
    return {
      urgency: "medium",
      reason: input.missingEvidence.length
        ? "A blocker is active; resolve the missing evidence before acting."
        : "A blocker is active, so the next work is removal or review rather than execution.",
    };
  }
  if (input.kind === "investigate") {
    return {
      urgency: "medium",
      reason: "The policy needs diagnosis before this can become command-ready.",
    };
  }
  if (input.kind === "watch") {
    return {
      urgency: "watch",
      reason: "The row needs more observation before a stronger action is safe.",
    };
  }
  if (input.kind === "do_not_touch") {
    return {
      urgency: "low",
      reason: "Protection is the instruction; do not create urgency from short-term movement.",
    };
  }
  return {
    urgency: "low",
    reason: "This is context, not primary operator work.",
  };
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
  policy: OperatorPolicyAssessment | null,
  override?: OperatorInstructionAmountGuidance | null,
): OperatorInstructionAmountGuidance {
  if (override) return override;
  if (kind === "do_now" && isAmountSensitiveAction(actionLabel, policy)) {
    return {
      status: "unavailable",
      label: "No safe amount calculated",
      reason:
        "The deterministic policy authorizes the class of work, but this layer does not calculate a safe budget or bid amount.",
    };
  }
  if (
    kind === "do_now" ||
    kind === "do_not_touch" ||
    kind === "watch" ||
    kind === "investigate" ||
    kind === "contextual_only" ||
    kind === "blocked"
  ) {
    return {
      status: "not_applicable",
      label: "No amount needed",
      reason: "This instruction does not require a deterministic budget, bid, or spend amount.",
    };
  }
  return {
    status: "unavailable",
    label: "Amount unavailable",
    reason: "No deterministic amount is available from the current evidence.",
  };
}

function isAmountSensitiveAction(
  actionLabel: string,
  policy: OperatorPolicyAssessment | null,
) {
  const actionClass = policy?.actionClass.toLowerCase() ?? "";
  const lowerAction = actionLabel.toLowerCase();
  return (
    actionClass === "scale" ||
    actionClass === "budget" ||
    actionClass === "bid" ||
    actionClass === "cost_control" ||
    actionClass === "budget_shift" ||
    lowerAction.includes("scale") ||
    lowerAction.includes("budget") ||
    lowerAction.includes("bid") ||
    lowerAction.includes("cost control") ||
    lowerAction.includes("cost cap") ||
    lowerAction.includes("spend amount") ||
    lowerAction.includes("increase budget") ||
    lowerAction.includes("reduce budget")
  );
}

function defaultInvalidActions(input: {
  kind: OperatorInstructionKind;
  actionLabel: string;
  policy?: OperatorPolicyAssessment | null;
  amountGuidance: OperatorInstructionAmountGuidance;
  requiresPolicyForQueue: boolean;
  extra?: string[];
}) {
  const values = [...(input.extra ?? [])];
  if (!input.policy && input.requiresPolicyForQueue) {
    values.push("Do not queue or push without deterministic operator policy.");
  }
  if (input.policy?.pushReadiness === "blocked_from_push") {
    values.push("Do not queue, apply, or push until policy readiness changes.");
  }
  if (input.kind === "do_not_touch") {
    values.push("Do not cut, refresh, resize, or reset this protected row from short-term volatility.");
  }
  if (input.kind === "watch") {
    values.push("Do not convert this review-only read into a scale, cut, budget, or bid command yet.");
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

function targetScopeLabel(value: string) {
  return normalizeLabel(value || "target");
}

function defaultTargetContext(input: {
  targetScope: string;
  targetEntity: string;
  parentEntity?: string | null;
  override?: OperatorInstructionTargetContext | null;
}): OperatorInstructionTargetContext {
  if (input.override) return input.override;
  const scope = targetScopeLabel(input.targetScope);
  const parent = input.parentEntity ? ` · ${input.parentEntity}` : "";
  return {
    status: input.targetEntity ? "available" : "unavailable",
    label: input.targetEntity
      ? `${scope}: ${input.targetEntity}${parent}`
      : `${scope}: target unavailable`,
    reason: input.targetEntity
      ? "Target comes from the deterministic source row."
      : "The source row did not expose a stable target.",
    targetScope: input.targetScope,
    targetEntity: input.targetEntity || null,
    parentEntity: input.parentEntity ?? null,
  };
}

function telemetrySafeToken(value: string | null | undefined) {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || null;
}

function buildOperatorDecisionTelemetry(input: {
  instructionKind: OperatorInstructionKind;
  pushReadiness: OperatorInstruction["pushReadiness"];
  queueEligible: boolean;
  canApply: boolean;
  evidenceStrength: OperatorInstructionEvidenceStrength;
  urgency: OperatorInstructionUrgency;
  amountGuidance: OperatorInstructionAmountGuidance;
  targetContext: OperatorInstructionTargetContext;
  missingEvidence: string[];
  invalidActions: string[];
  nextObservation: string[];
  policy: OperatorPolicyAssessment | null;
  sourceSystem: PrescriptionSourceSystem;
  sourceLabel: string;
  policyVersion?: string | null;
  evidenceHash?: string | null;
  actionFingerprint?: string | null;
}): OperatorDecisionTelemetry {
  const blockedReason =
    input.policy?.blockers[0]
      ? "policy_blocker"
      : input.missingEvidence[0]
        ? `missing_${telemetrySafeToken(input.missingEvidence[0])}`
        : input.pushReadiness === "blocked_from_push"
          ? "push_blocked"
          : null;

  return {
    contractVersion: "operator-decision-telemetry.v1",
    policyVersion: input.policyVersion ?? null,
    sourceSystem: input.sourceSystem,
    sourceSurface: input.sourceLabel,
    instructionKind: input.instructionKind,
    pushReadiness: input.pushReadiness,
    queueEligible: input.queueEligible,
    canApply: input.canApply,
    evidenceStrength: input.evidenceStrength,
    urgency: input.urgency,
    amountGuidanceStatus: input.amountGuidance.status,
    targetContextStatus: input.targetContext.status,
    missingEvidence: input.missingEvidence
      .map(telemetrySafeToken)
      .filter((value): value is string => Boolean(value)),
    missingEvidenceCount: input.missingEvidence.length,
    invalidActionCount: input.invalidActions.length,
    nextObservationCount: input.nextObservation.length,
    blockedReason,
    actionFingerprint: input.actionFingerprint ?? null,
    evidenceHash: input.evidenceHash ?? null,
  };
}

function defaultPrimaryMove(input: {
  kind: OperatorInstructionKind;
  actionLabel: string;
  targetEntity: string;
  targetContext: OperatorInstructionTargetContext;
  reason: string;
  nextObservation: string[];
  missingEvidence: string[];
  amountGuidance: OperatorInstructionAmountGuidance;
}) {
  const action = input.actionLabel.toLowerCase();
  const firstObservation =
    input.nextObservation[0] ?? input.missingEvidence[0] ?? "more stable evidence";
  if (input.kind === "do_now") {
    const baseMove = buildDoNowPrimaryMove({
      actionLabel: input.actionLabel,
      targetEntity: input.targetEntity,
      targetContext: input.targetContext,
    });
    return input.amountGuidance.status === "unavailable"
      ? `${baseMove.replace(/\.$/, "")}, but do not invent a budget or bid amount.`
      : baseMove;
  }
  if (input.kind === "do_not_touch") {
    return `Keep ${input.targetEntity} live and protected; do not force a new action from short-term movement.`;
  }
  if (input.kind === "watch") {
    if (isScaleReviewActionLabel(input.actionLabel)) {
      return `Scale Review ${input.targetEntity} as a relative winner; wait for ${firstObservation} before any scale move.`;
    }
    if (input.actionLabel.trim().toLowerCase() === "diagnose") {
      return `Diagnose ${input.targetEntity}; wait for ${firstObservation} before changing the recommendation.`;
    }
    if (input.actionLabel.trim().toLowerCase() === "test more") {
      if (findFatigueObservation(input.nextObservation)) {
        return `Keep testing ${input.targetEntity}, but monitor fatigue pressure while the evidence matures.`;
      }
      return `Keep testing ${input.targetEntity}; wait for ${firstObservation} before changing the recommendation.`;
    }
    return `Keep reviewing ${input.targetEntity}; wait for ${firstObservation} before changing the recommendation.`;
  }
  if (input.kind === "investigate") {
    if (isScaleReviewActionLabel(input.actionLabel)) {
      const investigationReason = input.missingEvidence.some((item) =>
        item.toLowerCase().includes("commercial_truth"),
      )
        ? "business validation is still missing."
        : input.missingEvidence.some((item) =>
              item.toLowerCase().includes("campaign") || item.toLowerCase().includes("adset"),
            )
          ? "campaign placement still needs review."
          : "the supporting context is not command-ready yet.";
      return `Scale Review ${input.targetEntity} as a relative winner before any scale move; ${investigationReason}`;
    }
    return `Investigate ${input.targetEntity} before ${action}; the current read is not command-ready.`;
  }
  if (input.kind === "blocked") {
    if (
      ["refresh", "retest", "cut", "campaign check"].includes(
        input.actionLabel.trim().toLowerCase(),
      )
    ) {
      return `${input.actionLabel} ${input.targetEntity}; resolve ${input.missingEvidence[0] ?? input.reason} before execution.`;
    }
    return `Do not act on ${input.targetEntity}; resolve ${input.missingEvidence[0] ?? input.reason} first.`;
  }
  return `Use ${input.targetEntity} as context only; it is not a primary operator command.`;
}

function buildDoNowPrimaryMove(input: {
  actionLabel: string;
  targetEntity: string;
  targetContext: OperatorInstructionTargetContext;
}) {
  if (isScaleActionLabel(input.actionLabel)) {
    if (
      input.targetContext.status === "available" &&
      input.targetContext.targetScope === "adset" &&
      input.targetContext.targetEntity &&
      !sameOperatorTarget(input.targetEntity, input.targetContext.targetEntity)
    ) {
      return `${input.actionLabel} ${input.targetEntity} into ${input.targetContext.targetEntity}.`;
    }
    if (
      input.targetContext.status === "review_required" ||
      input.targetContext.status === "unavailable"
    ) {
      return `${input.actionLabel} ${input.targetEntity}, but review target placement first; ${input.targetContext.label.toLowerCase()}.`;
    }
  }
  return `${input.actionLabel} ${input.targetEntity}.`;
}

function sameOperatorTarget(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function findFatigueObservation(observations: string[]) {
  return observations.find((observation) => isFatigueSignalObservation(observation));
}

function isFatigueSignalObservation(observation: string) {
  const normalized = observation.trim().toLowerCase();
  if (!normalized) return false;
  if (isMissingOrUnavailableObservation(normalized)) return false;
  return (
    /\bfatigue\b/.test(normalized) ||
    /\bfatigued\b/.test(normalized) ||
    /\bfrequency\b.*\bpressure\b/.test(normalized) ||
    /\bpressure\b.*\bfrequency\b/.test(normalized) ||
    /\belevated frequency\b/.test(normalized) ||
    /\brising frequency\b/.test(normalized) ||
    /\bfrequency is rising\b/.test(normalized)
  );
}

function isMissingOrUnavailableObservation(observation: string) {
  return /\b(unavailable|missing|unknown|not available|unreadable)\b/.test(observation);
}

function isScaleReviewActionLabel(actionLabel: string) {
  return actionLabel.trim().toLowerCase() === "scale review";
}

function isCreativeOperatorActionLabel(actionLabel: string) {
  return [
    "scale",
    "scale review",
    "test more",
    "protect",
    "watch",
    "refresh",
    "retest",
    "cut",
    "campaign check",
    "not enough data",
  ].includes(actionLabel.trim().toLowerCase());
}

function isScaleActionLabel(actionLabel: string) {
  const normalized = actionLabel.trim().toLowerCase();
  return (
    normalized === "scale" ||
    normalized.includes("scale ") ||
    normalized.includes("promote") ||
    normalized.includes("increase budget")
  );
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
  targetContext?: OperatorInstructionTargetContext | null;
  urgency?: OperatorInstructionUrgency;
  urgencyReason?: string;
  requiresPolicyForQueue?: boolean;
  pushReadinessOverride?: OperatorInstruction["pushReadiness"] | null;
  queueEligibleOverride?: boolean | null;
  canApplyOverride?: boolean | null;
}): OperatorInstruction {
  const policy = input.policy ?? null;
  const kind = instructionKind(policy);
  const amountGuidance = defaultAmountGuidance(
    kind,
    input.actionLabel,
    policy,
    input.amountGuidance,
  );
  const missingEvidence = uniqueText(policy?.missingEvidence ?? []);
  const readiness = resolvePolicyReadiness({
    policy,
    requiresPolicyForQueue: input.requiresPolicyForQueue ?? true,
    pushReadinessOverride: input.pushReadinessOverride,
    queueEligibleOverride: input.queueEligibleOverride,
    canApplyOverride: input.canApplyOverride,
  });
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
    requiresPolicyForQueue: input.requiresPolicyForQueue ?? true,
    extra: input.invalidActions,
  });
  const evidenceStrength = defaultEvidenceStrength({
    kind,
    confidence: input.confidenceScore,
    evidenceSource: input.evidenceSource,
    policy,
  });
  const targetContext = defaultTargetContext({
    targetScope: input.targetScope,
    targetEntity: input.targetEntity,
    parentEntity: input.parentEntity,
    override: input.targetContext,
  });
  const urgency = input.urgency
    ? { urgency: input.urgency, reason: input.urgencyReason ?? "Urgency was provided by the source surface." }
    : defaultUrgency({
        kind,
        evidenceStrength,
        pushReadiness: readiness.pushReadiness,
        confidence: input.confidenceScore,
        missingEvidence,
        invalidActions,
      });
  const evidenceHash = input.evidenceHash ?? input.provenance?.evidenceHash ?? null;
  const actionFingerprint =
    input.actionFingerprint ?? input.provenance?.actionFingerprint ?? null;
  const policyVersion = input.policyVersion ?? null;
  const telemetry = buildOperatorDecisionTelemetry({
    instructionKind: kind,
    pushReadiness: readiness.pushReadiness,
    queueEligible: readiness.queueEligible,
    canApply: readiness.canApply,
    evidenceStrength,
    urgency: urgency.urgency,
    amountGuidance,
    targetContext,
    missingEvidence,
    invalidActions,
    nextObservation,
    policy,
    sourceSystem: input.sourceSystem,
    sourceLabel: input.sourceLabel,
    policyVersion,
    evidenceHash,
    actionFingerprint,
  });

  return {
    contractVersion: "operator-instruction.v1",
    instructionKind: kind,
    operatorVerb: operatorVerb(kind),
    headline:
      kind === "do_now" ||
      isScaleReviewActionLabel(input.actionLabel) ||
      (input.sourceSystem === "creative" && isCreativeOperatorActionLabel(input.actionLabel))
        ? `${input.actionLabel}: ${input.targetEntity}`
        : `${operatorVerb(kind)}: ${input.targetEntity}`,
    primaryMove: defaultPrimaryMove({
      kind,
      actionLabel: input.actionLabel,
      targetEntity: input.targetEntity,
      targetContext,
      reason: reasonSummary,
      nextObservation,
      missingEvidence,
      amountGuidance,
    }),
    targetScope: input.targetScope,
    targetEntity: input.targetEntity,
    parentEntity: input.parentEntity ?? null,
    targetContext,
    reasonSummary,
    evidenceStrength,
    missingEvidence,
    nextObservation,
    invalidActions,
    amountGuidance,
    pushReadiness: readiness.pushReadiness,
    queueEligible: readiness.queueEligible,
    canApply: readiness.canApply,
    urgency: urgency.urgency,
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
      policyVersion,
    },
    urgencyReason: urgency.reason,
    telemetry,
    provenance: input.provenance ?? null,
    evidenceHash,
    actionFingerprint,
  };
}
