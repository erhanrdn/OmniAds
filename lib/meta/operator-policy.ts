import type {
  DecisionSurfaceAuthority,
  DecisionTrustMetadata,
} from "@/src/types/decision-trust";
import type {
  OperatorDecisionProvenance,
  OperatorPolicyAssessment,
  OperatorPolicyState,
} from "@/src/types/operator-decision";

export type MetaOperatorEntityType =
  | "campaign"
  | "adset"
  | "geo"
  | "placement"
  | "budget_shift"
  | "no_touch";

export type MetaOperatorActionClass =
  | "scale"
  | "reduce"
  | "pause"
  | "recover"
  | "bid_control"
  | "structure"
  | "budget_shift"
  | "geo"
  | "placement"
  | "protect"
  | "monitor"
  | "unknown";

export type MetaBudgetOwner = "campaign" | "adset" | "unknown";
export type MetaBudgetConstraint = "binding" | "not_binding" | "unknown";
export type MetaEvidenceSource = "live" | "demo" | "snapshot" | "fallback" | "unknown";

export interface MetaOperatorPolicyInput {
  entityType: MetaOperatorEntityType;
  action: string;
  trust?: DecisionTrustMetadata | null;
  authority?: DecisionSurfaceAuthority | null;
  provenance?: OperatorDecisionProvenance | null;
  noTouch?: boolean;
  commercialTruthMode?: "configured_targets" | "conservative_fallback" | null;
  commercialMissingInputs?: string[];
  evidenceSource?: MetaEvidenceSource;
  budgetOwner?: MetaBudgetOwner | null;
  budgetConstraint?: MetaBudgetConstraint | null;
  supportingMetrics?: {
    spend?: number | null;
    purchases?: number | null;
    impressions?: number | null;
    dailyBudget?: number | null;
    lifetimeBudget?: number | null;
    bidStrategyLabel?: string | null;
    optimizationGoal?: string | null;
  } | null;
}

const PUSH_SUPPORTED_ADSET_ACTIONS = new Set([
  "pause",
  "recover",
  "scale_budget",
  "reduce_budget",
]);

const AGGRESSIVE_ACTIONS = new Set([
  "pause",
  "recover",
  "rebuild",
  "scale_budget",
  "reduce_budget",
  "duplicate_to_new_geo_cluster",
  "merge_into_pooled_geo",
  "switch_optimization",
  "tighten_bid",
  "broaden",
  "scale",
  "cut",
  "isolate",
  "budget_shift",
  "exception_review",
]);

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function classifyActionClass(action: string): MetaOperatorActionClass {
  if (action === "scale_budget" || action === "scale") return "scale";
  if (action === "reduce_budget" || action === "cut") return "reduce";
  if (action === "pause") return "pause";
  if (action === "recover") return "recover";
  if (action === "tighten_bid") return "bid_control";
  if (
    action === "rebuild" ||
    action === "duplicate_to_new_geo_cluster" ||
    action === "merge_into_pooled_geo" ||
    action === "switch_optimization" ||
    action === "broaden"
  ) {
    return "structure";
  }
  if (action === "budget_shift") return "budget_shift";
  if (action === "validate" || action === "pool" || action === "isolate") return "geo";
  if (action === "keep_advantage_plus" || action === "exception_review") return "placement";
  if (action === "hold_no_touch") return "protect";
  if (action === "hold" || action === "monitor" || action === "monitor_only") return "monitor";
  return "unknown";
}

function hasMetric(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inferState(input: {
  blockers: string[];
  action: string;
  aggressive: boolean;
  noTouch: boolean;
  trust: DecisionTrustMetadata | null;
  evidenceSource: MetaEvidenceSource;
}): OperatorPolicyState {
  if (input.noTouch) return "do_not_touch";
  if (input.evidenceSource !== "live") return "contextual_only";
  if (!input.trust) return "blocked";
  if (input.trust.truthState === "inactive_or_immaterial") return "contextual_only";
  if (input.trust.operatorDisposition === "archive_only") return "contextual_only";
  if (input.blockers.length > 0) {
    return input.aggressive ? "blocked" : "investigate";
  }
  if (input.trust.operatorDisposition === "protected_watchlist") return "do_not_touch";
  if (input.trust.surfaceLane === "watchlist") return "watch";
  if (input.action === "hold" || input.action === "monitor_only" || input.action === "monitor") {
    return "watch";
  }
  if (input.trust.surfaceLane === "action_core" && input.trust.operatorDisposition === "standard") {
    return input.aggressive ? "do_now" : "investigate";
  }
  return "investigate";
}

function pushReadiness(input: {
  state: OperatorPolicyState;
  entityType: MetaOperatorEntityType;
  action: string;
  provenance: OperatorDecisionProvenance | null;
  blockers: string[];
}) {
  if (!input.provenance || input.blockers.length > 0 || input.state === "blocked") {
    return "blocked_from_push" as const;
  }
  if (input.state === "do_not_touch" || input.state === "contextual_only") {
    return "blocked_from_push" as const;
  }
  if (input.state === "watch" || input.state === "investigate") {
    return "operator_review_required" as const;
  }
  if (
    input.entityType === "adset" &&
    PUSH_SUPPORTED_ADSET_ACTIONS.has(input.action)
  ) {
    return "eligible_for_push_when_enabled" as const;
  }
  return "safe_to_queue" as const;
}

export function assessMetaOperatorPolicy(
  input: MetaOperatorPolicyInput,
): OperatorPolicyAssessment {
  const trust = input.trust ?? null;
  const provenance = input.provenance ?? null;
  const actionClass = classifyActionClass(input.action);
  const aggressive = AGGRESSIVE_ACTIONS.has(input.action);
  const evidenceSource = input.evidenceSource ?? "unknown";
  const budgetOwner = input.budgetOwner ?? "unknown";
  const budgetConstraint = input.budgetConstraint ?? "unknown";
  const supportingMetrics = input.supportingMetrics ?? {};
  const spend = supportingMetrics.spend ?? null;
  const purchases = supportingMetrics.purchases ?? null;
  const lowEvidenceForAggressiveAction =
    aggressive &&
    ((hasMetric(spend) && spend < 250) ||
      (hasMetric(purchases) && purchases < 8));
  const requiredEvidence = unique([
    "stable_operator_decision_context",
    "evidence_source",
    "row_trust",
    "row_provenance",
    aggressive ? "commercial_truth" : null,
    input.action === "scale_budget" ? "budget_binding_evidence" : null,
    input.action === "scale_budget" ? "budget_owner" : null,
    input.action === "scale_budget" || input.action === "pause" || input.action === "reduce_budget"
      ? "conversion_volume"
      : null,
  ]);

  const missingEvidence = unique([
    !provenance ? "row_provenance" : null,
    evidenceSource === "unknown" ? "evidence_source" : null,
    !trust ? "row_trust" : null,
    input.commercialTruthMode !== "configured_targets" && aggressive
      ? "commercial_truth"
      : null,
    input.action === "scale_budget" && budgetOwner === "unknown" ? "budget_owner" : null,
    input.action === "scale_budget" && budgetConstraint === "unknown"
      ? "budget_binding_evidence"
      : null,
    input.action === "scale_budget" && !hasMetric(supportingMetrics.dailyBudget)
      ? "daily_budget"
      : null,
    (input.action === "scale_budget" ||
      input.action === "pause" ||
      input.action === "reduce_budget") &&
    !hasMetric(supportingMetrics.spend)
      ? "spend_volume"
      : null,
    (input.action === "scale_budget" ||
      input.action === "pause" ||
      input.action === "reduce_budget") &&
    !hasMetric(supportingMetrics.purchases)
      ? "conversion_volume"
      : null,
    lowEvidenceForAggressiveAction ? "evidence_floor" : null,
  ]);

  const blockers = unique([
    !provenance ? "Missing decision provenance." : null,
    evidenceSource === "unknown"
      ? "Evidence source is missing, so primary action is blocked."
      : null,
    evidenceSource !== "live" && evidenceSource !== "unknown"
      ? `${evidenceSource} evidence is contextual and cannot authorize primary action.`
      : null,
    !trust ? "Decision trust metadata is missing." : null,
    trust?.truthState === "degraded_missing_truth" && aggressive
      ? "Commercial truth is degraded or missing, so aggressive action is blocked."
      : null,
    trust?.truthState === "inactive_or_immaterial"
      ? "Entity is inactive or immaterial for primary action."
      : null,
    trust?.evidence?.aggressiveActionBlocked && aggressive
      ? trust.evidence.aggressiveActionBlockReasons[0] ?? "Aggressive action is blocked by trust metadata."
      : null,
    trust?.evidence?.suppressed
      ? trust.evidence.suppressionReasons[0] ?? "Decision is suppressed from primary action."
      : null,
    input.noTouch ? "Entity is protected by a no-touch decision." : null,
    input.action === "scale_budget" && budgetOwner === "campaign"
      ? "Budget is campaign-owned, so an ad set budget increase is not a primary safe action."
      : null,
    input.action === "scale_budget" && budgetConstraint === "not_binding"
      ? "Budget is not the binding constraint; increasing budget would be the wrong first lever."
      : null,
    input.action === "scale_budget" && budgetConstraint === "unknown"
      ? "Budget binding is not proven, so budget increase stays blocked."
      : null,
    input.action === "scale_budget" && input.commercialTruthMode !== "configured_targets"
      ? "Configured commercial truth is required before scale promotion."
      : null,
    lowEvidenceForAggressiveAction
      ? "Evidence floor is not met for aggressive action."
      : null,
  ]);

  const reasons = unique([
    trust?.reasons[0],
    ...(input.commercialMissingInputs ?? []).map((field) => `Missing commercial input: ${field}`),
    blockers[0],
    missingEvidence.length > 0
      ? `Missing evidence: ${missingEvidence.join(", ")}.`
      : null,
  ]);
  const state = inferState({
    blockers,
    action: input.action,
    aggressive,
    noTouch: Boolean(input.noTouch),
    trust,
    evidenceSource,
  });
  const push = pushReadiness({
    state,
    entityType: input.entityType,
    action: input.action,
    provenance,
    blockers,
  });
  const queueEligible =
    push === "safe_to_queue" || push === "eligible_for_push_when_enabled";

  return {
    contractVersion: "operator-policy.v1",
    state,
    actionClass,
    pushReadiness: push,
    queueEligible,
    canApply: push === "eligible_for_push_when_enabled",
    reasons: reasons.length > 0 ? reasons : ["Policy check completed."],
    blockers,
    missingEvidence,
    requiredEvidence,
    explanation:
      blockers.length > 0
        ? blockers[0]
        : state === "do_now"
          ? "Deterministic Meta policy allows this as a primary operator action."
          : state === "do_not_touch"
            ? "Deterministic Meta policy marks this entity as protected."
            : "Deterministic Meta policy keeps this as review or context.",
  };
}

export function inferMetaBudgetConstraint(input: {
  spend: number;
  dailyBudget?: number | null;
  lifetimeBudget?: number | null;
  windowDays: number;
}): MetaBudgetConstraint {
  const dailyBudget = input.dailyBudget;
  const lifetimeBudget = input.lifetimeBudget;
  const budget = hasMetric(dailyBudget)
    ? dailyBudget
    : hasMetric(lifetimeBudget)
      ? lifetimeBudget / Math.max(1, input.windowDays)
      : null;
  if (!budget || budget <= 0) return "unknown";
  const averageDailySpend = input.spend / Math.max(1, input.windowDays);
  const utilization = averageDailySpend / budget;
  if (utilization >= 0.85) return "binding";
  if (utilization <= 0.55) return "not_binding";
  return "unknown";
}
