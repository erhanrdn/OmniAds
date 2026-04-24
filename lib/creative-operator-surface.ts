import type {
  CreativeDecisionOsCreative,
  CreativeDecisionOsV1Response,
} from "@/lib/creative-decision-os";
import { buildOperatorInstruction } from "@/lib/operator-prescription";
import {
  buildOperatorBuckets,
  operatorConfidenceBand,
  titleFromEnum,
  type OperatorAuthorityState,
  type OperatorSurfaceItem,
  type OperatorSurfaceMetric,
  type OperatorSurfaceModel,
} from "@/lib/operator-surface";
import type {
  OperatorInstructionTargetContext,
  OperatorInstructionUrgency,
} from "@/src/types/operator-decision";

export const CREATIVE_QUICK_FILTER_ORDER = [
  "scale",
  "scale_review",
  "test_more",
  "protect",
  "watch",
  "refresh",
  "retest",
  "cut",
  "campaign_check",
  "not_enough_data",
] as const;

export type CreativeQuickFilterKey = (typeof CREATIVE_QUICK_FILTER_ORDER)[number];

export interface CreativeQuickFilter {
  key: CreativeQuickFilterKey;
  label: string;
  summary: string;
  count: number;
  creativeIds: string[];
  tone: OperatorAuthorityState;
}

const CREATIVE_QUICK_FILTER_DEFS: Record<
  CreativeQuickFilterKey,
  Omit<CreativeQuickFilter, "count" | "creativeIds">
> = {
  scale: {
    key: "scale",
    label: "Scale",
    summary: "Strong relative winners with business validation for controlled scale.",
    tone: "act_now",
  },
  scale_review: {
    key: "scale_review",
    label: "Scale Review",
    summary: "Strong relative winners that remain review-only until business validation clears.",
    tone: "watch",
  },
  test_more: {
    key: "test_more",
    label: "Test More",
    summary: "Promising rows that need more evidence before scale or protect decisions.",
    tone: "watch",
  },
  protect: {
    key: "protect",
    label: "Protect",
    summary: "Stable winners that should stay live without unnecessary changes.",
    tone: "no_action",
  },
  watch: {
    key: "watch",
    label: "Watch",
    summary: "Rows with enough signal to monitor, but not enough for a stronger move.",
    tone: "watch",
  },
  refresh: {
    key: "refresh",
    label: "Refresh",
    summary: "Fatigued winners or variants that need a new angle.",
    tone: "blocked",
  },
  retest: {
    key: "retest",
    label: "Retest",
    summary: "Comeback candidates that need a controlled retest.",
    tone: "blocked",
  },
  cut: {
    key: "cut",
    label: "Cut",
    summary: "Waste or failure cases that should stop taking spend.",
    tone: "blocked",
  },
  campaign_check: {
    key: "campaign_check",
    label: "Campaign Check",
    summary: "Rows where campaign or ad set context blocks a clean creative read.",
    tone: "blocked",
  },
  not_enough_data: {
    key: "not_enough_data",
    label: "Not Enough Data",
    summary: "Rows where evidence is still too thin for a quality judgment.",
    tone: "watch",
  },
};

export interface CreativePreviewTruthSummary {
  totalCount: number;
  readyCount: number;
  degradedCount: number;
  missingCount: number;
  state: "ready" | "degraded" | "missing";
  headline: string;
  summary: string;
}

export function creativeQuickFilterShortLabel(key: CreativeQuickFilterKey) {
  return CREATIVE_QUICK_FILTER_DEFS[key]?.label ?? key;
}

export function creativeAuthorityStateLabel(state: OperatorAuthorityState) {
  if (state === "watch") return "Scale Review / Test More / Watch / Not Enough Data";
  if (state === "no_action") return "Protect";
  if (state === "act_now") return "Scale";
  if (state === "needs_truth") return "Not eligible";
  return "Refresh / Retest / Cut / Campaign Check";
}

export function creativeBenchmarkReliabilityLabel(value: string | null | undefined) {
  switch (value) {
    case "strong":
      return "Strong";
    case "medium":
      return "Medium";
    case "weak":
      return "Thin";
    default:
      return "Unavailable";
  }
}

function resolvedCreativeBenchmarkScopeLabel(creative: CreativeDecisionOsCreative) {
  if (creative.benchmarkScopeLabel?.trim()) return creative.benchmarkScopeLabel.trim();
  if (creative.relativeBaseline?.scopeLabel?.trim()) return creative.relativeBaseline.scopeLabel.trim();
  if (creative.benchmarkScope === "campaign" || creative.relativeBaseline?.scope === "campaign") {
    return "Selected campaign";
  }
  return "Account-wide";
}

function creativeNeedsBusinessValidation(creative: CreativeDecisionOsCreative) {
  const missingEvidence = creative.operatorPolicy?.missingEvidence ?? [];
  if (missingEvidence.some((item) => item.toLowerCase().includes("commercial_truth"))) {
    return true;
  }
  return (
    creative.trust.operatorDisposition === "profitable_truth_capped" ||
    creative.trust.truthState === "degraded_missing_truth"
  );
}

export function creativeBusinessValidationNote(creative: CreativeDecisionOsCreative) {
  const missingEvidence = creative.operatorPolicy?.missingEvidence ?? [];
  if (creativeNeedsBusinessValidation(creative)) {
    return "Business validation is still missing, so this stays review-only.";
  }
  if (missingEvidence.includes("business_validation")) {
    return "Business validation does not support a direct scale move yet.";
  }
  return null;
}

function isMatureZeroPurchaseWeakWatch(creative: CreativeDecisionOsCreative) {
  return (
    creative.operatorPolicy?.segment === "hold_monitor" &&
    creative.primaryAction === "keep_in_test" &&
    creative.purchases === 0 &&
    creative.spend >= 250 &&
    creative.impressions >= 5_000 &&
    creative.creativeAgeDays > 10
  );
}

function isMatureZeroPurchaseCutReview(creative: CreativeDecisionOsCreative) {
  return (
    creative.operatorPolicy?.segment === "spend_waste" &&
    creative.primaryAction === "keep_in_test" &&
    creative.purchases === 0 &&
    creative.spend >= 250 &&
    creative.impressions >= 8_000 &&
    creative.creativeAgeDays > 10
  );
}

function hasTestMoreFatigueCaveat(creative: CreativeDecisionOsCreative) {
  return (
    creative.operatorPolicy?.segment === "promising_under_sampled" &&
    creative.fatigue?.status === "watch"
  );
}

export function creativeOperatorSegmentLabel(creative: CreativeDecisionOsCreative) {
  const segment = creative.operatorPolicy?.segment ?? null;
  switch (segment) {
    case "scale_ready":
      return "Scale";
    case "scale_review":
      return "Scale Review";
    case "promising_under_sampled":
      return "Test More";
    case "protected_winner":
    case "no_touch":
      return "Protect";
    case "hold_monitor":
      return "Watch";
    case "fatigued_winner":
      return "Refresh";
    case "needs_new_variant":
      return creative.primaryAction === "retest_comeback" ? "Retest" : "Refresh";
    case "kill_candidate":
    case "spend_waste":
      return "Cut";
    case "investigate":
      return "Campaign Check";
    case "contextual_only":
    case "blocked":
      return "Not eligible for evaluation";
    case "false_winner_low_evidence":
    case "creative_learning_incomplete":
      return "Not Enough Data";
    default:
      break;
  }

  if (creative.primaryAction === "promote_to_scaling") return "Scale";
  if (creative.primaryAction === "keep_in_test") return "Test More";
  if (creative.primaryAction === "hold_no_touch") return "Protect";
  if (creative.primaryAction === "refresh_replace") return "Refresh";
  if (creative.primaryAction === "retest_comeback") return "Retest";
  if (creative.primaryAction === "block_deploy") return "Cut";
  return titleFromEnum(creative.primaryAction);
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}

function formatRatio(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)}x`;
}

function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString();
}

function lifecycleLabel(value: CreativeDecisionOsCreative["lifecycleState"]) {
  switch (value) {
    case "incubating":
    case "validating":
      return "Test More";
    case "scale_ready":
      return "Scale";
    case "stable_winner":
      return "Protect";
    case "fatigued_winner":
      return "Refresh";
    case "blocked":
      return "Campaign Check";
    case "retired":
      return "Cut";
    case "comeback_candidate":
      return "Retest";
    default:
      return titleFromEnum(value);
  }
}

function previewLabel(creative: CreativeDecisionOsCreative) {
  if (creative.previewStatus?.liveDecisionWindow === "missing") return "Preview missing";
  if (creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded") return "Preview degraded";
  return "Preview ready";
}

function isCreativeMuted(creative: CreativeDecisionOsCreative) {
  const materiality = creative.trust.evidence?.materiality;
  return materiality === "thin_signal" || materiality === "immaterial" || creative.trust.surfaceLane === "archive_context";
}

export function resolveCreativeAuthorityState(creative: CreativeDecisionOsCreative) {
  if (creative.operatorPolicy) {
    if (
      creative.operatorPolicy.segment === "protected_winner" ||
      creative.operatorPolicy.segment === "no_touch" ||
      creative.operatorPolicy.state === "do_not_touch"
    ) {
      return "no_action" satisfies OperatorAuthorityState;
    }
    if (
      creative.operatorPolicy.segment === "fatigued_winner" ||
      creative.operatorPolicy.segment === "kill_candidate" ||
      creative.operatorPolicy.segment === "needs_new_variant" ||
      creative.operatorPolicy.segment === "spend_waste"
    ) {
      return "blocked" satisfies OperatorAuthorityState;
    }
    if (creative.operatorPolicy.segment === "investigate") {
      return "blocked" satisfies OperatorAuthorityState;
    }
    if (
      creative.operatorPolicy.state === "blocked" ||
      creative.operatorPolicy.state === "contextual_only"
    ) {
      return "needs_truth" satisfies OperatorAuthorityState;
    }
    if (creative.operatorPolicy.state === "watch" || creative.operatorPolicy.state === "investigate") {
      return "watch" satisfies OperatorAuthorityState;
    }
    if (creative.operatorPolicy.state === "do_now") {
      return "act_now" satisfies OperatorAuthorityState;
    }
  }
  if (creative.primaryAction === "hold_no_touch") {
    return "no_action" satisfies OperatorAuthorityState;
  }
  if (
    creative.trust.operatorDisposition === "profitable_truth_capped" ||
    creative.previewStatus?.liveDecisionWindow === "missing" ||
    creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded" ||
    creative.primaryAction === "block_deploy"
  ) {
    return "needs_truth" satisfies OperatorAuthorityState;
  }
  if (creative.primaryAction === "refresh_replace") {
    return "blocked" satisfies OperatorAuthorityState;
  }
  if (creative.primaryAction === "keep_in_test" || creative.primaryAction === "retest_comeback") {
    return "watch" satisfies OperatorAuthorityState;
  }
  return "act_now" satisfies OperatorAuthorityState;
}

function creativeBlocker(creative: CreativeDecisionOsCreative, state: OperatorAuthorityState) {
  if (creative.operatorPolicy?.blockers?.[0]) {
    return creative.operatorPolicy.blockers[0];
  }
  if (creative.previewStatus?.liveDecisionWindow === "missing") {
    return creative.previewStatus.reason ?? "Preview truth is missing for this creative.";
  }
  if (creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded") {
    return creative.previewStatus.reason ?? "Preview review is degraded, so decisive action stays softened.";
  }
  if (state === "needs_truth") {
    return (
      creative.trust.evidence?.aggressiveActionBlockReasons?.[0] ??
      creative.trust.reasons.find((reason) => reason.toLowerCase().includes("truth")) ??
      creative.economics.reasons[0] ??
      "Missing commercial truth is capping a stronger creative move."
    );
  }
  if (creative.trust.evidence?.materiality === "thin_signal") {
    return "Signal is still too thin to promote, replace, or protect this row authoritatively.";
  }
  return (
    creative.deployment.constraints[0] ??
    creative.deployment.compatibility.reasons[0] ??
    creative.economics.reasons[0] ??
    null
  );
}

function creativeActionLabel(creative: CreativeDecisionOsCreative, state: OperatorAuthorityState) {
  if (creative.operatorPolicy) {
    switch (creative.operatorPolicy.segment) {
      case "scale_ready":
        return "Scale";
      case "scale_review":
        return "Scale Review";
      case "kill_candidate":
      case "spend_waste":
        return "Cut";
      case "fatigued_winner":
        return "Refresh";
      case "needs_new_variant":
        return creative.primaryAction === "retest_comeback" ? "Retest" : "Refresh";
      case "protected_winner":
      case "no_touch":
        return "Protect";
      case "false_winner_low_evidence":
      case "creative_learning_incomplete":
        return "Not Enough Data";
      case "hold_monitor":
        return "Watch";
      case "promising_under_sampled":
        return "Test More";
      case "investigate":
        return "Campaign Check";
      case "contextual_only":
      case "blocked":
        return "Not eligible for evaluation";
      default:
        break;
    }
  }
  if (creative.previewStatus?.liveDecisionWindow === "missing") return "Not eligible for evaluation";
  if (creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded") return "Not eligible for evaluation";
  if (state === "needs_truth" && creative.trust.operatorDisposition === "profitable_truth_capped") {
    return "Scale Review";
  }
  switch (creative.primaryAction) {
    case "promote_to_scaling":
      return "Scale";
    case "keep_in_test":
      return "Test More";
    case "hold_no_touch":
      return "Protect";
    case "refresh_replace":
      return "Refresh";
    case "retest_comeback":
      return "Retest";
    case "block_deploy":
      return creative.legacyAction === "kill" || creative.lifecycleState === "retired" ? "Cut" : "Campaign Check";
    default:
      return titleFromEnum(creative.primaryAction);
  }
}

function creativeReason(creative: CreativeDecisionOsCreative, state: OperatorAuthorityState, muted: boolean, blocker: string | null) {
  if (creative.operatorPolicy?.segment === "scale_ready") {
    const scopeLabel = resolvedCreativeBenchmarkScopeLabel(creative);
    return `Strong relative performer against the ${scopeLabel} benchmark. Business validation supports a controlled scale move.`;
  }
  if (creative.operatorPolicy?.segment === "scale_review") {
    const scopeLabel = resolvedCreativeBenchmarkScopeLabel(creative);
    const businessValidationNote = creativeBusinessValidationNote(creative);
    if (businessValidationNote) {
      return `Strong relative performer against the ${scopeLabel} benchmark. ${businessValidationNote}`;
    }
    if (creative.benchmarkReliability && creative.benchmarkReliability !== "strong") {
      return `Strong relative performer against the ${scopeLabel} benchmark, but ${creativeBenchmarkReliabilityLabel(creative.benchmarkReliability).toLowerCase()} benchmark reliability keeps this review-only.`;
    }
    if (
      creative.operatorPolicy?.missingEvidence.some((item) =>
        item.toLowerCase().includes("campaign") || item.toLowerCase().includes("adset"),
      ) ||
      creative.deployment.compatibility.status === "limited" ||
      creative.deployment.compatibility.status === "blocked"
    ) {
      return `Strong relative performer against the ${scopeLabel} benchmark, but campaign placement still needs review.`;
    }
    return `Strong relative performer against the ${scopeLabel} benchmark. Keep it in review until the scale target is confirmed.`;
  }
  if (
    creative.operatorPolicy?.segment === "hold_monitor" &&
    creative.primaryAction === "promote_to_scaling" &&
    creative.relativeBaseline
  ) {
    const scopeLabel = resolvedCreativeBenchmarkScopeLabel(creative);
    const businessValidationNote = creativeBusinessValidationNote(creative);
    if (businessValidationNote) {
      return `Promising relative performer against the ${scopeLabel} benchmark. ${businessValidationNote}`;
    }
    if (
      creative.operatorPolicy.missingEvidence.includes("relative_baseline") ||
      creative.benchmarkReliability === "weak" ||
      creative.benchmarkReliability === "unavailable"
    ) {
      return `Promising creative, but the ${scopeLabel.toLowerCase()} benchmark is still too thin for a scale call.`;
    }
  }
  if (creative.operatorPolicy?.segment === "promising_under_sampled") {
    if (hasTestMoreFatigueCaveat(creative)) {
      return "Promising relative signal, but the sample is still light. Keep testing while watching fatigue pressure.";
    }
    return "Promising relative signal, but the sample is still light. Keep testing until the evidence matures.";
  }
  if (isMatureZeroPurchaseWeakWatch(creative)) {
    return "Spend is already meaningful enough to move past early learning, but there is still no purchase proof. Keep this in Watch until conversion evidence appears.";
  }
  if (isMatureZeroPurchaseCutReview(creative)) {
    return "Spend is already meaningful enough to move past early learning, and there is still no purchase proof. Treat this as a Cut candidate for operator review.";
  }
  if (state === "needs_truth" && creative.previewStatus?.liveDecisionWindow === "missing") {
    return "Preview truth is missing, so this creative cannot headline an authoritative action yet.";
  }
  if (state === "needs_truth" && creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded") {
    return "Preview truth is degraded, so this row stays metrics-only instead of reading like clean execute-now work.";
  }
  if (state === "needs_truth" && blocker) {
    return `Promising, but ${blocker.charAt(0).toLowerCase()}${blocker.slice(1)}`;
  }
  if (muted) {
    return "Signal is still too thin for a headline creative action.";
  }
  return creative.summary;
}

function creativeTargetContext(
  creative: CreativeDecisionOsCreative,
): OperatorInstructionTargetContext {
  const preferredAdSet = creative.deployment.preferredAdSetNames?.[0] ?? null;
  const preferredCampaign = creative.deployment.preferredCampaignNames?.[0] ?? null;
  if (
    creative.operatorPolicy?.segment === "scale_ready" ||
    creative.operatorPolicy?.segment === "scale_review"
  ) {
    if (preferredAdSet) {
      return {
        status: "available",
        label: `Target ad set: ${preferredAdSet}${preferredCampaign ? ` · ${preferredCampaign}` : ""}`,
        reason: "Creative deployment data names a preferred ad set for the scale review.",
        targetScope: "adset",
        targetEntity: preferredAdSet,
        parentEntity: preferredCampaign,
      };
    }
    if (preferredCampaign) {
      return {
        status: "review_required",
        label: `Campaign context: ${preferredCampaign}`,
        reason:
          "A campaign context is available, but no preferred ad set is exposed for this creative.",
        targetScope: "campaign",
        targetEntity: preferredCampaign,
        parentEntity: creative.familyLabel,
      };
    }
    return {
      status: "unavailable",
      label: "Target ad set unavailable",
      reason:
        "The source row does not expose a preferred ad set; review deployment context before scaling.",
      targetScope: "adset",
      targetEntity: null,
      parentEntity: creative.familyLabel,
    };
  }

  const lane = creative.deployment.targetLane ?? creative.deployment.metaFamilyLabel ?? null;
  return {
    status: lane ? "available" : "review_required",
    label: lane ? `Context: ${lane}` : "Deployment context requires review",
    reason: lane
      ? "Target context comes from the deterministic deployment recommendation."
      : "No stable deployment lane is exposed for this creative.",
    targetScope: "creative",
    targetEntity: creative.name,
    parentEntity: creative.familyLabel,
  };
}

function creativeUrgencyOverride(
  creative: CreativeDecisionOsCreative,
): { urgency?: OperatorInstructionUrgency; reason?: string } {
  if (
    creative.operatorPolicy?.segment === "fatigued_winner" &&
    creative.fatigue?.frequencyPressure != null &&
    creative.fatigue.frequencyPressure >= 3
  ) {
    return {
      urgency: "high",
      reason: "Frequency pressure supports prioritizing a refresh review.",
    };
  }
  if (creative.operatorPolicy?.segment === "promising_under_sampled") {
    return {
      urgency: "watch",
      reason: "The creative is promising but under-sampled, so urgency stays observational.",
    };
  }
  if (creative.operatorPolicy?.segment === "protected_winner") {
    return {
      urgency: "low",
      reason: "Protected winners should stay stable unless sustained fatigue appears.",
    };
  }
  return {};
}

function compactMetrics(metrics: OperatorSurfaceMetric[]) {
  return metrics.filter((metric) => Boolean(metric.value) && metric.value !== "n/a").slice(0, 5);
}

export function buildCreativeOperatorItem(creative: CreativeDecisionOsCreative): OperatorSurfaceItem {
  const authorityState = resolveCreativeAuthorityState(creative);
  const muted = isCreativeMuted(creative);
  const blocker = creativeBlocker(creative, authorityState);
  const primaryAction = creativeActionLabel(creative, authorityState);
  const reason = creativeReason(creative, authorityState, muted, blocker);
  const campaignContextLimited =
    creative.deployment.compatibility.status === "limited" ||
    creative.deployment.compatibility.status === "blocked";
  const urgencyOverride = creativeUrgencyOverride(creative);
  const nextObservation = [
    hasTestMoreFatigueCaveat(creative)
      ? "Watch fatigue pressure while the sample is still maturing."
      : null,
    isMatureZeroPurchaseCutReview(creative)
      ? "Confirm there is no purchase evidence before stopping this test creative."
      : null,
    isMatureZeroPurchaseWeakWatch(creative)
      ? "Confirm purchase evidence before extending this test."
      : null,
    ...(creative.deployment.whatWouldChangeThisDecision ?? []),
    ...creative.deployment.constraints,
    ...creative.deployment.compatibility.reasons,
    ...(creative.fatigue?.missingContext ?? []),
    ...(creative.benchmark?.missingContext ?? []),
  ].filter(Boolean) as string[];

  return {
    id: creative.creativeId,
    title: creative.name,
    subtitle: creative.familyLabel,
    primaryAction,
    authorityState,
    authorityLabel: primaryAction,
    reason,
    blocker,
    confidence: operatorConfidenceBand(creative.confidence),
    secondaryLabels: [
      creative.operatorPolicy ? creativeOperatorSegmentLabel(creative) : null,
      creative.operatorPolicy?.pushReadiness.replaceAll("_", " ") ?? null,
      previewLabel(creative),
      lifecycleLabel(creative.lifecycleState),
      creative.deployment.targetLane ?? null,
    ].filter(Boolean) as string[],
    metrics: compactMetrics([
      { label: "Spend", value: formatMoney(creative.spend) },
      { label: "ROAS", value: formatRatio(creative.roas) },
      { label: "Purchases", value: formatInteger(creative.purchases) },
      { label: "CTR", value: `${creative.ctr.toFixed(2)}%` },
    ]),
    muted,
    mutedReason: muted ? "Thin-signal or inactive creatives stay out of the headline action surface." : null,
    instruction: buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: creative.operatorPolicy ?? null,
      policyVersion: creative.operatorPolicy?.policyVersion ?? null,
      targetScope: "creative",
      targetEntity: creative.name,
      parentEntity: creative.familyLabel,
      actionLabel: primaryAction,
      reason,
      blocker,
      confidenceScore: creative.confidence,
      evidenceSource: creative.evidenceSource,
      trustState: creative.trust.truthState,
      operatorDisposition: creative.trust.operatorDisposition,
      provenance:
        (creative as { provenance?: CreativeDecisionOsCreative["provenance"] | null })
          .provenance ?? null,
      evidenceHash: (creative as { evidenceHash?: string | null }).evidenceHash ?? null,
      actionFingerprint:
        (creative as { actionFingerprint?: string | null }).actionFingerprint ?? null,
      targetContext: creativeTargetContext(creative),
      ...(urgencyOverride.urgency
        ? { urgency: urgencyOverride.urgency }
        : {}),
      ...(urgencyOverride.reason
        ? { urgencyReason: urgencyOverride.reason }
        : {}),
      nextObservation,
      invalidActions: [
        campaignContextLimited
          ? "Do not blame the creative before the limiting campaign or ad set context is reviewed."
          : null,
        creative.operatorPolicy?.segment === "false_winner_low_evidence"
          ? "Do not scale from ROAS alone."
          : null,
        creative.operatorPolicy?.segment === "scale_review"
          ? "Do not scale until business targets are validated."
          : null,
        creative.operatorPolicy?.segment === "protected_winner"
          ? "Do not cut a protected winner because of short-term volatility."
          : null,
      ].filter(Boolean) as string[],
    }),
  };
}

export function resolveCreativeQuickFilterKey(
  creative: CreativeDecisionOsCreative,
): CreativeQuickFilterKey | null {
  const segment = creative.operatorPolicy?.segment ?? null;
  switch (segment) {
    case "scale_ready":
      return "scale";
    case "scale_review":
      return "scale_review";
    case "promising_under_sampled":
      return "test_more";
    case "protected_winner":
    case "no_touch":
      return "protect";
    case "hold_monitor":
      return "watch";
    case "fatigued_winner":
      return "refresh";
    case "needs_new_variant":
      return creative.primaryAction === "retest_comeback" ? "retest" : "refresh";
    case "kill_candidate":
    case "spend_waste":
      return "cut";
    case "investigate":
      return "campaign_check";
    case "false_winner_low_evidence":
    case "creative_learning_incomplete":
      return "not_enough_data";
    case "contextual_only":
    case "blocked":
      return null;
    default:
      break;
  }

  if (creative.primaryAction === "promote_to_scaling") return "scale";
  if (creative.primaryAction === "keep_in_test") return "test_more";
  if (creative.primaryAction === "hold_no_touch") return "protect";
  if (creative.primaryAction === "refresh_replace") return "refresh";
  if (creative.primaryAction === "retest_comeback") return "retest";
  if (creative.primaryAction === "block_deploy") return "cut";
  return null;
}

export function buildCreativeQuickFilters(
  decisionOs: CreativeDecisionOsV1Response | null | undefined,
  options?: {
    visibleIds?: Set<string> | null;
    includeZeroCounts?: boolean;
  },
): CreativeQuickFilter[] {
  if (!decisionOs) return [];

  const visibleIds = options?.visibleIds ?? null;
  const includeZeroCounts = options?.includeZeroCounts ?? false;
  const creativeIdsByFilter = new Map<CreativeQuickFilterKey, string[]>();
  for (const key of CREATIVE_QUICK_FILTER_ORDER) {
    creativeIdsByFilter.set(key, []);
  }

  for (const creative of decisionOs.creatives) {
    if (visibleIds && !visibleIds.has(creative.creativeId)) continue;
    const filterKey = resolveCreativeQuickFilterKey(creative);
    if (filterKey) {
      creativeIdsByFilter.get(filterKey)?.push(creative.creativeId);
    }
  }

  return CREATIVE_QUICK_FILTER_ORDER
    .map((key) => {
      const creativeIds = creativeIdsByFilter.get(key) ?? [];

      return {
        ...CREATIVE_QUICK_FILTER_DEFS[key],
        count: creativeIds.length,
        creativeIds,
      } satisfies CreativeQuickFilter;
    })
    .filter((filter) => includeZeroCounts || filter.count > 0);
}

export function buildCreativeTaxonomyCounts(
  decisionOs: CreativeDecisionOsV1Response | null | undefined,
  options?: {
    visibleIds?: Set<string> | null;
    quickFilters?: CreativeQuickFilter[] | null;
  },
): CreativeQuickFilter[] {
  const baseFilters = buildCreativeQuickFilters(decisionOs, {
    visibleIds: options?.visibleIds,
    includeZeroCounts: true,
  });
  const overrideCountsByKey = new Map(
    (options?.quickFilters ?? []).map((filter) => [
      filter.key,
      {
        count: filter.count,
        creativeIds: filter.creativeIds,
      },
    ]),
  );

  return baseFilters.map((filter) => {
    const override = overrideCountsByKey.get(filter.key);
    if (!override) return filter;
    return {
      ...filter,
      count: override.count,
      creativeIds: override.creativeIds,
    };
  });
}

export function buildCreativeOperatorSurfaceModel(
  decisionOs: CreativeDecisionOsV1Response | null | undefined,
  options?: {
    visibleIds?: Set<string> | null;
  },
): OperatorSurfaceModel | null {
  if (!decisionOs) return null;

  const visibleIds = options?.visibleIds ?? null;
  const creatives = visibleIds
    ? decisionOs.creatives.filter((creative) => visibleIds.has(creative.creativeId))
    : decisionOs.creatives;
  if (creatives.length === 0) return null;

  const items = creatives.map(buildCreativeOperatorItem);
  const previewTruth = buildCreativePreviewTruthSummary({ creatives });
  const buckets = buildOperatorBuckets(items, {
    labels: {
      watch: "Scale Review / Test More / Watch / Not Enough Data",
      blocked: "Refresh / Retest / Cut / Campaign Check",
      needs_truth: "Not eligible for evaluation",
      no_action: "Protect",
    },
    summaries: {
      act_now: "Winner signals are strong enough for the next decisive move.",
      watch: "Rows need review-only scale confirmation, more testing, guarded observation, or more evidence.",
      blocked: "Rows need a refresh, retest, cut decision, or campaign-context diagnosis before more spend.",
      needs_truth: "Rows are not eligible for a creative-quality judgment in the current context.",
      no_action: "Stable winners to protect without forcing them back into churn.",
    },
    order: ["act_now", "watch", "blocked", "needs_truth", "no_action"],
  });

  const counts = {
    scale: buckets.find((bucket) => bucket.key === "act_now")?.rows.length ?? 0,
    watch: buckets.find((bucket) => bucket.key === "watch")?.rows.length ?? 0,
    check: buckets.find((bucket) => bucket.key === "blocked")?.rows.length ?? 0,
    hold: buckets.find((bucket) => bucket.key === "needs_truth")?.rows.length ?? 0,
    evergreen: buckets.find((bucket) => bucket.key === "no_action")?.rows.length ?? 0,
  };
  const mutedCount = buckets.reduce((sum, bucket) => sum + bucket.mutedCount, 0);
  const previewMissing = creatives.filter(
    (creative) => creative.previewStatus?.liveDecisionWindow === "missing",
  ).length;

  let emphasis: OperatorAuthorityState = "no_action";
  let headline = "No material creative move is ready yet.";
  if (counts.scale > 0) {
    emphasis = "act_now";
    headline = `${counts.scale} creative ${counts.scale === 1 ? "is" : "are"} ready to scale.`;
  } else if (counts.check > 0) {
    emphasis = "blocked";
    headline = `${counts.check} creative ${counts.check === 1 ? "needs" : "need"} refresh, cut, retest, or campaign-context work.`;
  } else if (counts.watch > 0) {
    emphasis = "watch";
    headline = `${counts.watch} creative ${counts.watch === 1 ? "needs" : "need"} Scale Review, Test More, Watch, or Not Enough Data handling.`;
  } else if (counts.hold > 0) {
    emphasis = "needs_truth";
    headline = `${counts.hold} creative ${counts.hold === 1 ? "is" : "are"} not eligible for evaluation in this context.`;
  } else if (counts.evergreen > 0) {
    headline = `${counts.evergreen} creative ${counts.evergreen === 1 ? "is" : "are"} protected.`;
  }

  return {
    surfaceLabel: "Creative",
    heading: "Performance Segments",
    headline,
    note: previewTruth
      ? `${previewTruth.summary} ${decisionOs.summary.message ?? "Selected range remains analysis context only."}`
      : decisionOs.summary.message ??
        "Preview readiness gates authoritative creative action; selected range remains analysis context.",
    emphasis,
    authorityLabels: {
      act_now: "Scale",
      watch: "Scale Review / Test More / Watch / Not Enough Data",
      blocked: "Refresh / Retest / Cut / Campaign Check",
      needs_truth: "Not eligible",
      no_action: "Protect",
    },
    blocker:
      emphasis === "needs_truth" && previewMissing > 0
        ? `${previewMissing} ${previewMissing === 1 ? "row needs" : "rows need"} trustworthy preview media.`
        : null,
    buckets,
    hiddenSummary:
      mutedCount > 0
        ? `${mutedCount} thin-signal or inactive ${mutedCount === 1 ? "creative stays" : "creatives stay"} off the headline action surface.`
        : null,
  };
}

export function buildCreativePreviewTruthSummary(
  decisionOs: Pick<CreativeDecisionOsV1Response, "creatives"> | null | undefined,
  options?: { creativeIds?: Iterable<string> | null },
): CreativePreviewTruthSummary | null {
  if (!decisionOs?.creatives?.length) return null;

  const scopedIds = options?.creativeIds ? new Set(options.creativeIds) : null;
  const creatives = scopedIds
    ? decisionOs.creatives.filter((creative) => scopedIds.has(creative.creativeId))
    : decisionOs.creatives;

  if (creatives.length === 0) return null;

  const readyCount = creatives.filter(
    (creative) => creative.previewStatus?.liveDecisionWindow === "ready",
  ).length;
  const degradedCount = creatives.filter(
    (creative) => creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded",
  ).length;
  const missingCount = creatives.filter(
    (creative) => creative.previewStatus?.liveDecisionWindow === "missing",
  ).length;
  const totalCount = creatives.length;

  const state: CreativePreviewTruthSummary["state"] =
    readyCount === totalCount
      ? "ready"
      : missingCount === totalCount
        ? "missing"
        : "degraded";

  if (state === "ready") {
    return {
      totalCount,
      readyCount,
      degradedCount,
      missingCount,
      state,
      headline: "Preview truth is ready across this review scope.",
      summary:
        `${readyCount} ready · ${degradedCount} degraded · ${missingCount} missing. ` +
        "Decisive operator wording can stay active where preview truth is ready.",
    };
  }

  if (state === "missing") {
    return {
      totalCount,
      readyCount,
      degradedCount,
      missingCount,
      state,
      headline: "Preview truth is missing across this review scope.",
      summary:
        `${readyCount} ready · ${degradedCount} degraded · ${missingCount} missing. ` +
        "Missing preview truth blocks authoritative action until media resolves.",
    };
  }

  return {
    totalCount,
    readyCount,
    degradedCount,
    missingCount,
    state,
    headline: "Preview truth is mixed across this review scope.",
    summary:
      `${readyCount} ready · ${degradedCount} degraded · ${missingCount} missing. ` +
      "Ready rows can read decisively, degraded rows stay metrics-only, and missing rows stay blocked.",
  };
}
