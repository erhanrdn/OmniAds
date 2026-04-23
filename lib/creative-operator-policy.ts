import type {
  CreativeDecisionBenchmark,
  CreativeDecisionDeploymentRecommendation,
  CreativeDecisionEconomics,
  CreativeDecisionFatigue,
  CreativeDecisionLifecycleState,
  CreativeDecisionPreviewStatus,
  CreativeDecisionPrimaryAction,
} from "@/lib/creative-decision-os";
import type { DecisionTrustMetadata } from "@/src/types/decision-trust";
import type {
  OperatorDecisionProvenance,
  OperatorPolicyAssessment,
  OperatorPolicyState,
} from "@/src/types/operator-decision";

export const CREATIVE_OPERATOR_POLICY_VERSION = "creative-operator-policy.v1";

export const CREATIVE_OPERATOR_SEGMENTS = [
  "scale_ready",
  "scale_review",
  "promising_under_sampled",
  "false_winner_low_evidence",
  "fatigued_winner",
  "kill_candidate",
  "protected_winner",
  "hold_monitor",
  "needs_new_variant",
  "creative_learning_incomplete",
  "spend_waste",
  "no_touch",
  "investigate",
  "contextual_only",
  "blocked",
] as const;

export type CreativeOperatorSegment =
  (typeof CREATIVE_OPERATOR_SEGMENTS)[number];

export type CreativeEvidenceSource =
  | "live"
  | "demo"
  | "snapshot"
  | "fallback"
  | "unknown";

export type CreativeRelativeBaselineReliability =
  | "strong"
  | "medium"
  | "weak"
  | "unavailable";

export interface CreativeOperatorRelativeBaseline {
  scope: "account" | "campaign";
  benchmarkKey?: string | null;
  scopeId?: string | null;
  scopeLabel?: string | null;
  source?: string | null;
  reliability?: CreativeRelativeBaselineReliability;
  sampleSize: number;
  creativeCount?: number;
  eligibleCreativeCount?: number;
  spendBasis?: number | null;
  purchaseBasis?: number | null;
  weightedRoas?: number | null;
  weightedCpa?: number | null;
  medianRoas?: number | null;
  medianCpa?: number | null;
  medianSpend?: number | null;
  missingContext?: string[];
}

export type CreativeOperatorActionClass =
  | "scale"
  | "kill"
  | "refresh"
  | "protect"
  | "test"
  | "variant"
  | "monitor"
  | "contextual"
  | "unknown";

export interface CreativeOperatorPolicyAssessment
  extends OperatorPolicyAssessment {
  policyVersion: typeof CREATIVE_OPERATOR_POLICY_VERSION;
  segment: CreativeOperatorSegment;
  actionClass: CreativeOperatorActionClass;
  evidenceSource: CreativeEvidenceSource;
}

export interface CreativeOperatorPolicyInput {
  lifecycleState: CreativeDecisionLifecycleState;
  primaryAction: CreativeDecisionPrimaryAction;
  trust?: DecisionTrustMetadata | null;
  provenance?: OperatorDecisionProvenance | null;
  evidenceSource?: CreativeEvidenceSource;
  commercialTruthConfigured?: boolean;
  commercialMissingInputs?: string[];
  relativeBaseline?: CreativeOperatorRelativeBaseline | null;
  benchmark?: Pick<CreativeDecisionBenchmark, "sampleSize" | "missingContext"> | null;
  fatigue?: Pick<CreativeDecisionFatigue, "status" | "confidence" | "evidence"> | null;
  economics?: Pick<CreativeDecisionEconomics, "status" | "reasons"> | null;
  deployment?: {
    compatibility: Pick<
      CreativeDecisionDeploymentRecommendation["compatibility"],
      "status" | "reasons"
    >;
    constraints: CreativeDecisionDeploymentRecommendation["constraints"];
    targetLane: string | null;
    queueVerdict?: CreativeDecisionDeploymentRecommendation["queueVerdict"];
  } | null;
  previewStatus?: CreativeDecisionPreviewStatus | null;
  supportingMetrics?: {
    spend?: number | null;
    purchases?: number | null;
    impressions?: number | null;
    roas?: number | null;
    cpa?: number | null;
    frequency?: number | null;
    creativeAgeDays?: number | null;
  } | null;
}

const SCALE_ACTIONS = new Set<CreativeDecisionPrimaryAction>([
  "promote_to_scaling",
]);
const KILL_OR_REFRESH_ACTIONS = new Set<CreativeDecisionPrimaryAction>([
  "block_deploy",
  "refresh_replace",
]);
const AGGRESSIVE_ACTIONS = new Set<CreativeDecisionPrimaryAction>([
  "promote_to_scaling",
  "block_deploy",
  "refresh_replace",
]);

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value?.trim()))),
  );
}

function hasNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function classifyActionClass(
  action: CreativeDecisionPrimaryAction,
): CreativeOperatorActionClass {
  if (action === "promote_to_scaling") return "scale";
  if (action === "block_deploy") return "kill";
  if (action === "refresh_replace") return "refresh";
  if (action === "hold_no_touch") return "protect";
  if (action === "keep_in_test") return "test";
  if (action === "retest_comeback") return "variant";
  return "unknown";
}

function hasScaleEvidence(input: CreativeOperatorPolicyInput) {
  const metrics = input.supportingMetrics ?? {};
  return (
    hasNumber(metrics.spend) &&
    metrics.spend >= 250 &&
    hasNumber(metrics.purchases) &&
    metrics.purchases >= 5 &&
    input.economics?.status === "eligible"
  );
}

function hasRelativeScaleReviewEvidence(input: CreativeOperatorPolicyInput) {
  const metrics = input.supportingMetrics ?? {};
  const baseline = input.relativeBaseline ?? null;
  if (!hasRelativeBaselineContext(input)) return false;
  if (!baseline) return false;
  const medianSpend = baseline.medianSpend ?? 0;
  const medianRoas = baseline.medianRoas ?? 0;
  const medianCpa = baseline.medianCpa ?? null;
  if (!hasNumber(metrics.spend) || !hasNumber(metrics.purchases) || !hasNumber(metrics.roas)) {
    return false;
  }
  if (metrics.spend < Math.max(80, medianSpend * 0.2)) return false;
  if (metrics.purchases < 2) return false;
  if (metrics.roas < medianRoas * 1.4) return false;
  if (
    hasNumber(metrics.cpa) &&
    metrics.cpa > 0 &&
    hasNumber(medianCpa) &&
    medianCpa > 0 &&
    metrics.cpa > medianCpa * 1.2
  ) {
    return false;
  }
  return true;
}

function hasRelativeBaselineContext(input: CreativeOperatorPolicyInput) {
  const baseline = input.relativeBaseline ?? null;
  const reliability = baseline?.reliability ?? "unavailable";
  const reliable =
    reliability === "strong" ||
    reliability === "medium";
  return (
    Boolean(baseline) &&
    reliable &&
    (baseline?.sampleSize ?? 0) >= 3 &&
    (baseline?.eligibleCreativeCount ?? 0) >= 3 &&
    hasNumber(baseline?.spendBasis) &&
    (baseline?.spendBasis ?? 0) >= 150 &&
    hasNumber(baseline?.purchaseBasis) &&
    (baseline?.purchaseBasis ?? 0) >= 3 &&
    hasNumber(baseline?.medianRoas) &&
    (baseline?.medianRoas ?? 0) > 0 &&
    hasNumber(baseline?.medianSpend) &&
    (baseline?.medianSpend ?? 0) > 0
  );
}

function isRelativeScaleReviewIntent(input: CreativeOperatorPolicyInput) {
  return (
    !input.commercialTruthConfigured &&
    (input.primaryAction === "promote_to_scaling" ||
      input.lifecycleState === "scale_ready")
  );
}

function hasKillEvidence(input: CreativeOperatorPolicyInput) {
  const metrics = input.supportingMetrics ?? {};
  const spend = metrics.spend ?? null;
  const purchases = metrics.purchases ?? null;
  const impressions = metrics.impressions ?? null;
  return (
    hasNumber(spend) &&
    spend >= 250 &&
    ((hasNumber(purchases) && purchases >= 4) ||
      (hasNumber(impressions) && impressions >= 8_000))
  );
}

function isUnderSampled(input: CreativeOperatorPolicyInput) {
  const metrics = input.supportingMetrics ?? {};
  return (
    (hasNumber(metrics.spend) && metrics.spend < 120) ||
    (hasNumber(metrics.purchases) && metrics.purchases < 2) ||
    (hasNumber(metrics.impressions) && metrics.impressions < 5_000) ||
    (hasNumber(metrics.creativeAgeDays) && metrics.creativeAgeDays <= 10)
  );
}

function hasRoasOnlyPositiveSignal(input: CreativeOperatorPolicyInput) {
  const metrics = input.supportingMetrics ?? {};
  const purchaseCount = hasNumber(metrics.purchases) ? metrics.purchases : 0;
  const meaningfulPurchaseEvidence = purchaseCount >= 2;
  return (
    hasNumber(metrics.roas) &&
    metrics.roas >= 2 &&
    !meaningfulPurchaseEvidence &&
    ((hasNumber(metrics.spend) && metrics.spend < 120) ||
      (hasNumber(metrics.purchases) && metrics.purchases < 2))
  );
}

function hasMeaningfulPositiveSupport(input: CreativeOperatorPolicyInput) {
  const metrics = input.supportingMetrics ?? {};
  return (
    hasNumber(metrics.purchases) &&
    metrics.purchases >= 2 &&
    hasNumber(metrics.roas) &&
    metrics.roas > 0
  );
}

function hasWeakCampaignContext(input: CreativeOperatorPolicyInput) {
  return (
    input.deployment?.compatibility.status === "limited" ||
    input.deployment?.compatibility.status === "blocked"
  );
}

function resolveSegment(params: {
  policyInput: CreativeOperatorPolicyInput;
  evidenceSource: CreativeEvidenceSource;
  blockers: string[];
  missingEvidence: string[];
  aggressive: boolean;
}): CreativeOperatorSegment {
  const { policyInput: input } = params;
  const trust = input.trust ?? null;
  const relativeScaleReviewIntent = isRelativeScaleReviewIntent(input);

  if (!input.provenance) return "blocked";
  if (!trust) return "blocked";
  if (input.evidenceSource !== "live") return "contextual_only";
  if (input.previewStatus?.liveDecisionWindow === "missing") return "blocked";
  if (
    input.previewStatus?.liveDecisionWindow === "metrics_only_degraded" &&
    (params.aggressive || relativeScaleReviewIntent)
  ) {
    return "investigate";
  }
  if (trust?.truthState === "inactive_or_immaterial") return "contextual_only";
  if (trust?.operatorDisposition === "archive_only") return "contextual_only";
  if (input.primaryAction === "hold_no_touch") return "protected_winner";
  if (trust?.operatorDisposition === "protected_watchlist") return "protected_winner";
  if (relativeScaleReviewIntent && hasWeakCampaignContext(input)) {
    return "investigate";
  }
  if (relativeScaleReviewIntent && hasRelativeScaleReviewEvidence(input)) {
    return "scale_review";
  }
  if (hasRoasOnlyPositiveSignal(input)) return "false_winner_low_evidence";
  if (isUnderSampled(input)) {
    if (
      !hasMeaningfulPositiveSupport(input) ||
      input.lifecycleState === "incubating"
    ) {
      return "creative_learning_incomplete";
    }
    return "promising_under_sampled";
  }
  if (
    relativeScaleReviewIntent &&
    hasRelativeBaselineContext(input) &&
    !hasRelativeScaleReviewEvidence(input)
  ) {
    return "hold_monitor";
  }
  if (
    input.primaryAction === "promote_to_scaling" &&
    (!input.commercialTruthConfigured || !hasScaleEvidence(input))
  ) {
    return input.commercialTruthConfigured ? "promising_under_sampled" : "blocked";
  }
  if (input.primaryAction === "promote_to_scaling") {
    return hasWeakCampaignContext(input) ? "investigate" : "scale_ready";
  }
  if (input.lifecycleState === "fatigued_winner" || input.fatigue?.status === "fatigued") {
    return input.primaryAction === "refresh_replace"
      ? "fatigued_winner"
      : "needs_new_variant";
  }
  if (input.primaryAction === "block_deploy") {
    return hasKillEvidence(input)
      ? "kill_candidate"
      : hasNumber(input.supportingMetrics?.spend) && input.supportingMetrics!.spend! >= 250
        ? "spend_waste"
        : "creative_learning_incomplete";
  }
  if (input.primaryAction === "retest_comeback") return "needs_new_variant";
  if (params.blockers.length > 0) return params.aggressive ? "blocked" : "investigate";
  if (input.primaryAction === "keep_in_test") return "hold_monitor";
  return "investigate";
}

function resolveState(input: {
  segment: CreativeOperatorSegment;
  primaryAction: CreativeDecisionPrimaryAction;
  blockers: string[];
  evidenceSource: CreativeEvidenceSource;
  aggressive: boolean;
}): OperatorPolicyState {
  if (input.evidenceSource !== "live") return "contextual_only";
  if (input.segment === "blocked") return "blocked";
  if (input.segment === "contextual_only") return "contextual_only";
  if (input.segment === "protected_winner" || input.segment === "no_touch") {
    return "do_not_touch";
  }
  if (input.segment === "scale_review") {
    return "investigate";
  }
  if (
    input.segment === "false_winner_low_evidence" ||
    input.segment === "promising_under_sampled" ||
    input.segment === "creative_learning_incomplete" ||
    input.segment === "hold_monitor"
  ) {
    return "watch";
  }
  if (input.blockers.length > 0) {
    return input.aggressive ? "blocked" : "investigate";
  }
  if (input.segment === "scale_ready" || input.segment === "kill_candidate") {
    return "do_now";
  }
  if (
    input.segment === "fatigued_winner" ||
    input.segment === "needs_new_variant" ||
    input.segment === "spend_waste" ||
    input.segment === "investigate"
  ) {
    return "investigate";
  }
  return "investigate";
}

function resolvePushReadiness(input: {
  state: OperatorPolicyState;
  segment: CreativeOperatorSegment;
  actionClass: CreativeOperatorActionClass;
  provenance: OperatorDecisionProvenance | null;
  blockers: string[];
  hardBlockers: string[];
}) {
  if (!input.provenance || input.state === "blocked") {
    return "blocked_from_push" as const;
  }
  if (input.hardBlockers.length > 0) {
    return "blocked_from_push" as const;
  }
  if (input.segment === "scale_review") {
    return "operator_review_required" as const;
  }
  if (input.blockers.length > 0) {
    return "blocked_from_push" as const;
  }
  if (input.state === "contextual_only" || input.state === "do_not_touch") {
    return "blocked_from_push" as const;
  }
  if (input.state === "watch") return "read_only_insight" as const;
  if (input.actionClass === "kill" || input.actionClass === "refresh") {
    return "operator_review_required" as const;
  }
  if (input.state === "do_now" && input.segment === "scale_ready") {
    return "safe_to_queue" as const;
  }
  return "operator_review_required" as const;
}

export function assessCreativeOperatorPolicy(
  input: CreativeOperatorPolicyInput,
): CreativeOperatorPolicyAssessment {
  const trust = input.trust ?? null;
  const provenance = input.provenance ?? null;
  const evidenceSource = input.evidenceSource ?? "unknown";
  const actionClass = classifyActionClass(input.primaryAction);
  const aggressive = AGGRESSIVE_ACTIONS.has(input.primaryAction);
  const commercialTruthConfigured = Boolean(input.commercialTruthConfigured);
  const previewState = input.previewStatus?.liveDecisionWindow ?? "missing";
  const weakCampaignContext = hasWeakCampaignContext(input);
  const lowEvidence = isUnderSampled(input);
  const roasOnly = hasRoasOnlyPositiveSignal(input);
  const scaleAction = SCALE_ACTIONS.has(input.primaryAction);
  const relativeScaleReviewIntent = isRelativeScaleReviewIntent(input);
  const killOrRefreshAction = KILL_OR_REFRESH_ACTIONS.has(input.primaryAction);
  const requiresCommercialTruth = scaleAction;
  const needsRelativeBaseline =
    relativeScaleReviewIntent &&
    !commercialTruthConfigured &&
    !hasRelativeBaselineContext(input);
  const requiresCampaignContext = scaleAction || relativeScaleReviewIntent;

  const requiredEvidence = unique([
    "stable_operator_decision_context",
    "evidence_source",
    "row_provenance",
    "row_trust",
    "preview_truth",
    requiresCommercialTruth ? "commercial_truth" : null,
    relativeScaleReviewIntent && !commercialTruthConfigured ? "relative_baseline" : null,
    relativeScaleReviewIntent || killOrRefreshAction ? "evidence_floor" : null,
    requiresCampaignContext ? "campaign_or_adset_context" : null,
    killOrRefreshAction ? "sufficient_negative_evidence" : null,
  ]);

  const missingEvidence = unique([
    !provenance ? "row_provenance" : null,
    evidenceSource === "unknown" ? "evidence_source" : null,
    !trust ? "row_trust" : null,
    previewState === "missing" ? "preview_truth" : null,
    requiresCommercialTruth && !commercialTruthConfigured ? "commercial_truth" : null,
    needsRelativeBaseline ? "relative_baseline" : null,
    (scaleAction || relativeScaleReviewIntent || killOrRefreshAction) && lowEvidence ? "evidence_floor" : null,
    roasOnly ? "non_roas_evidence" : null,
    requiresCampaignContext && weakCampaignContext ? "campaign_or_adset_context" : null,
    input.benchmark?.sampleSize === 0 ? "benchmark_context" : null,
  ]);

  const blockers = unique([
    !provenance ? "Missing decision provenance." : null,
    evidenceSource === "unknown"
      ? "Evidence source is missing, so Creative action remains contextual."
      : null,
    evidenceSource !== "live" && evidenceSource !== "unknown"
      ? `${evidenceSource} evidence is contextual and cannot authorize primary Creative action.`
      : null,
    !trust ? "Decision trust metadata is missing." : null,
    trust?.truthState === "degraded_missing_truth" && requiresCommercialTruth
      ? "Commercial truth is degraded or missing, so aggressive Creative action is blocked."
      : null,
    trust?.truthState === "inactive_or_immaterial"
      ? "Creative is inactive or immaterial for primary action."
      : null,
    trust?.evidence?.aggressiveActionBlocked && requiresCommercialTruth
      ? trust.evidence.aggressiveActionBlockReasons[0] ??
        "Aggressive Creative action is blocked by trust metadata."
      : null,
    trust?.evidence?.suppressed
      ? trust.evidence.suppressionReasons[0] ??
        "Creative decision is suppressed from primary action."
      : null,
    previewState === "missing"
      ? "Preview truth is missing, so queue and push eligibility are blocked."
      : null,
    previewState === "metrics_only_degraded" && aggressive
      ? "Preview truth is degraded, so aggressive Creative action requires review."
      : null,
    requiresCommercialTruth && !commercialTruthConfigured
      ? "Configured commercial truth is required before Creative scale decisions can be validated."
      : null,
    needsRelativeBaseline
      ? "Account or campaign relative baseline is missing, so Scale Review cannot be inferred."
      : null,
    scaleAction && !hasScaleEvidence(input)
      ? "Scale evidence floor is not met; ROAS alone is not enough."
      : null,
    killOrRefreshAction && !hasKillEvidence(input)
      ? "Kill or refresh evidence floor is not met."
      : null,
    requiresCampaignContext && weakCampaignContext
      ? "Campaign or ad set context limits this creative interpretation."
      : null,
  ]);
  const hardBlockers = unique([
    !provenance ? "Missing decision provenance." : null,
    evidenceSource !== "live"
      ? evidenceSource === "unknown"
        ? "Evidence source is missing, so Creative action remains contextual."
        : `${evidenceSource} evidence is contextual and cannot authorize primary Creative action.`
      : null,
    !trust ? "Decision trust metadata is missing." : null,
    previewState === "missing"
      ? "Preview truth is missing, so queue and push eligibility are blocked."
      : null,
    previewState === "metrics_only_degraded" && relativeScaleReviewIntent
      ? "Preview truth is degraded, so relative Scale Review cannot become push-review ready."
      : null,
    trust?.truthState === "inactive_or_immaterial"
      ? "Creative is inactive or immaterial for primary action."
      : null,
    trust?.operatorDisposition === "archive_only"
      ? "Creative is archive-only and not eligible for live evaluation."
      : null,
    trust?.evidence?.suppressed
      ? trust.evidence.suppressionReasons[0] ??
        "Creative decision is suppressed from primary action."
      : null,
    requiresCampaignContext && weakCampaignContext
      ? "Campaign or ad set context limits this creative interpretation."
      : null,
  ]);

  const segment = resolveSegment({
    policyInput: input,
    evidenceSource,
    blockers,
    missingEvidence,
    aggressive,
  });
  const state = resolveState({
    segment,
    primaryAction: input.primaryAction,
    blockers,
    evidenceSource,
    aggressive,
  });
  const pushReadiness = resolvePushReadiness({
    state,
    segment,
    actionClass,
    provenance,
    blockers,
    hardBlockers,
  });
  const queueEligible = pushReadiness === "safe_to_queue";
  const reasons = unique([
    trust?.reasons[0],
    input.fatigue?.evidence?.[0],
    input.economics?.reasons?.[0],
    input.deployment?.constraints?.[0],
    ...(input.commercialMissingInputs ?? []).map((field) => `Missing commercial input: ${field}`),
    blockers[0],
    missingEvidence.length > 0
      ? `Missing evidence: ${missingEvidence.join(", ")}.`
      : null,
  ]);

  return {
    contractVersion: "operator-policy.v1",
    policyVersion: CREATIVE_OPERATOR_POLICY_VERSION,
    state,
    segment,
    actionClass,
    evidenceSource,
    pushReadiness,
    queueEligible,
    canApply: false,
    reasons: reasons.length > 0 ? reasons : ["Creative operator policy check completed."],
    blockers,
    missingEvidence,
    requiredEvidence,
    explanation:
      blockers.length > 0
        ? blockers[0]
        : state === "do_now"
          ? "Deterministic Creative policy allows this as operator work, but provider push remains disabled."
          : state === "do_not_touch"
            ? "Deterministic Creative policy marks this creative as protected."
            : "Deterministic Creative policy keeps this as review, watch, or context.",
  };
}
