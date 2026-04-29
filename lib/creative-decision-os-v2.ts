import {
  CREATIVE_VERDICT_VERSION,
  type CreativeAction,
  type CreativeActionReadiness,
  type CreativePhase,
  type CreativeVerdict,
  type CreativeVerdictHeadline,
} from "@/lib/creative-verdict";

export const CREATIVE_DECISION_OS_V2_CONTRACT_VERSION = "creative-decision-os.v2";
export const CREATIVE_DECISION_OS_V2_ENGINE_VERSION = "2026-04-26-baseline-first";

export const CREATIVE_DECISION_OS_V2_PRIMARY_DECISIONS = [
  "Scale",
  "Cut",
  "Refresh",
  "Protect",
  "Test More",
  "Diagnose",
] as const;

export type CreativeDecisionOsV2PrimaryDecision =
  (typeof CREATIVE_DECISION_OS_V2_PRIMARY_DECISIONS)[number];

export type CreativeDecisionOsV2Actionability =
  | "direct"
  | "review_only"
  | "blocked"
  | "diagnose";

export type CreativeDecisionOsV2RiskLevel = "low" | "medium" | "high" | "critical";

export type CreativeDecisionOsV2ProblemClass =
  | "creative"
  | "campaign-context"
  | "data-quality"
  | "insufficient-signal";

export interface CreativeDecisionOsV2Input {
  rowId?: string | null;
  activeStatus?: boolean | null;
  campaignStatus?: string | null;
  adsetStatus?: string | null;
  spend?: number | null;
  purchases?: number | null;
  impressions?: number | null;
  roas?: number | null;
  cpa?: number | null;
  recentRoas?: number | null;
  recentPurchases?: number | null;
  recentImpressions?: number | null;
  long90Roas?: number | null;
  activeBenchmarkRoas?: number | null;
  activeBenchmarkCpa?: number | null;
  peerMedianSpend?: number | null;
  trustState?: string | null;
  baselineReliability?: string | null;
  sourceTrustFlags?: string[] | null;
  campaignContextBlockerFlags?: string[] | null;
  existingQueueEligible?: boolean | null;
  existingApplyEligible?: boolean | null;
}

export interface CreativeDecisionOsV2Output {
  contractVersion: typeof CREATIVE_DECISION_OS_V2_CONTRACT_VERSION;
  engineVersion: typeof CREATIVE_DECISION_OS_V2_ENGINE_VERSION;
  verdict: CreativeVerdict;
  primaryDecision: CreativeDecisionOsV2PrimaryDecision;
  actionability: CreativeDecisionOsV2Actionability;
  confidence: number;
  reasonTags: string[];
  evidenceSummary: string;
  riskLevel: CreativeDecisionOsV2RiskLevel;
  queueEligible: boolean;
  applyEligible: boolean;
  blockerReasons: string[];
  secondarySuggestion?: CreativeDecisionOsV2PrimaryDecision | null;
  problemClass: CreativeDecisionOsV2ProblemClass;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function n(value: number | null | undefined, fallback = 0) {
  return finite(value) ? value : fallback;
}

function ratio(value: number | null | undefined, benchmark: number | null | undefined) {
  if (!finite(value) || !finite(benchmark) || benchmark <= 0) return null;
  return value / benchmark;
}

function normalized(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function isPausedStatus(value: string | null | undefined) {
  const status = normalized(value);
  return status.includes("PAUSED") || status.includes("ARCHIVED") || status.includes("DELETED");
}

function isCampaignContextBlocked(input: CreativeDecisionOsV2Input) {
  if (input.campaignContextBlockerFlags && input.campaignContextBlockerFlags.length > 0) {
    return true;
  }
  return isPausedStatus(input.campaignStatus) || isPausedStatus(input.adsetStatus);
}

function hasReliableBenchmark(input: CreativeDecisionOsV2Input) {
  const reliability = input.baselineReliability?.trim().toLowerCase();
  return (
    finite(input.activeBenchmarkRoas) &&
    input.activeBenchmarkRoas > 0 &&
    (reliability === "strong" || reliability === "medium")
  );
}

function isDegradedTruth(input: CreativeDecisionOsV2Input) {
  const trust = input.trustState?.trim().toLowerCase();
  return trust === "degraded_missing_truth" || trust === "inactive_or_immaterial";
}

function hasSourceOrProvenanceBlocker(input: CreativeDecisionOsV2Input) {
  const flags = input.sourceTrustFlags?.map((flag) => flag.trim().toLowerCase()) ?? [];
  return flags.some(
    (flag) =>
      flag.includes("degraded") ||
      flag.includes("inactive_or_immaterial") ||
      flag.includes("missing") ||
      flag.includes("blocked") ||
      flag.includes("read_only"),
  );
}

function confidence(base: number, input: CreativeDecisionOsV2Input, adjustment = 0) {
  const benchmarkAdjustment = hasReliableBenchmark(input) ? 5 : -8;
  const trustAdjustment = isDegradedTruth(input) ? -6 : 3;
  return Math.max(45, Math.min(94, Math.round(base + benchmarkAdjustment + trustAdjustment + adjustment)));
}

function actionFromV2Decision(primaryDecision: CreativeDecisionOsV2PrimaryDecision): CreativeAction {
  switch (primaryDecision) {
    case "Scale":
      return "scale";
    case "Test More":
      return "keep_testing";
    case "Protect":
      return "protect";
    case "Refresh":
      return "refresh";
    case "Cut":
      return "cut";
    case "Diagnose":
      return "diagnose";
  }
}

function headlineFromV2Decision(primaryDecision: CreativeDecisionOsV2PrimaryDecision): CreativeVerdictHeadline {
  switch (primaryDecision) {
    case "Scale":
      return "Test Winner";
    case "Test More":
      return "Test Inconclusive";
    case "Protect":
      return "Scale Performer";
    case "Refresh":
      return "Scale Fatiguing";
    case "Cut":
      return "Scale Underperformer";
    case "Diagnose":
      return "Needs Diagnosis";
  }
}

function phaseFromV2Decision(primaryDecision: CreativeDecisionOsV2PrimaryDecision): CreativePhase {
  if (primaryDecision === "Scale" || primaryDecision === "Test More") return "test";
  if (primaryDecision === "Refresh" || primaryDecision === "Diagnose") return "post-scale";
  return "scale";
}

function readinessFromV2Actionability(
  actionability: CreativeDecisionOsV2Actionability,
): CreativeActionReadiness {
  if (actionability === "direct") return "ready";
  if (actionability === "diagnose" || actionability === "blocked") return "blocked";
  return "needs_review";
}

function output(
  input: CreativeDecisionOsV2Input,
  primaryDecision: CreativeDecisionOsV2PrimaryDecision,
  actionability: CreativeDecisionOsV2Actionability,
  confidenceValue: number,
  reasonTags: string[],
  evidenceSummary: string,
  riskLevel: CreativeDecisionOsV2RiskLevel,
  problemClass: CreativeDecisionOsV2ProblemClass,
  secondarySuggestion: CreativeDecisionOsV2PrimaryDecision | null = null,
): CreativeDecisionOsV2Output {
  const blockerReasons: string[] = [];

  if (primaryDecision === "Scale" && input.activeStatus === false) {
    blockerReasons.push("inactive_creative_cannot_scale");
  }
  if (primaryDecision === "Scale" && actionability !== "review_only") {
    blockerReasons.push("scale_requires_operator_review");
  }
  if (primaryDecision === "Cut" && input.activeStatus === false) {
    blockerReasons.push("inactive_cut_requires_review");
  }
  if (isCampaignContextBlocked(input) && primaryDecision !== "Diagnose") {
    blockerReasons.push("campaign_or_adset_context_requires_review");
  }
  if (!hasReliableBenchmark(input)) {
    blockerReasons.push("benchmark_context_not_strong");
  }
  if (primaryDecision !== "Diagnose" && hasSourceOrProvenanceBlocker(input)) {
    blockerReasons.push("source_or_provenance_requires_review");
  }
  if (primaryDecision !== "Diagnose" && isDegradedTruth(input)) {
    blockerReasons.push("degraded_truth_requires_review");
  }
  if (
    primaryDecision === "Cut" &&
    actionability === "direct" &&
    (
      input.activeStatus !== true ||
      n(input.recentPurchases) > 0 ||
      !reasonTags.some((tag) => tag === "huge_spend_severe_loser" || tag === "severe_sustained_loser")
    )
  ) {
    blockerReasons.push("cut_requires_buyer_review");
  }

  let resolvedActionability = actionability;
  if (primaryDecision === "Scale") resolvedActionability = "review_only";
  if (primaryDecision === "Diagnose") resolvedActionability = "diagnose";
  if (primaryDecision !== "Diagnose" && actionability === "direct" && blockerReasons.length > 0) {
    resolvedActionability = "review_only";
  }
  if (
    primaryDecision === "Test More" &&
    actionability === "direct" &&
    (isDegradedTruth(input) || problemClass === "data-quality")
  ) {
    resolvedActionability = "review_only";
  }

  const uniqueBlockerReasons = Array.from(new Set(blockerReasons));
  const verdict: CreativeVerdict = {
    contractVersion: CREATIVE_VERDICT_VERSION,
    phase: phaseFromV2Decision(primaryDecision),
    headline: headlineFromV2Decision(primaryDecision),
    action: actionFromV2Decision(primaryDecision),
    actionReadiness: readinessFromV2Actionability(resolvedActionability),
    confidence: Math.max(0.3, Math.min(0.95, confidenceValue / 100)),
    evidence: Array.from(new Set(reasonTags)).slice(0, 4).map((tag, index) => ({
      tag: tag as CreativeVerdict["evidence"][number]["tag"],
      weight: index === 0 ? "primary" : "supporting",
    })),
    blockers: uniqueBlockerReasons.map((reason) => reason as CreativeVerdict["blockers"][number]),
    derivedAt: new Date().toISOString(),
  };

  return {
    contractVersion: CREATIVE_DECISION_OS_V2_CONTRACT_VERSION,
    engineVersion: CREATIVE_DECISION_OS_V2_ENGINE_VERSION,
    verdict,
    primaryDecision,
    actionability: resolvedActionability,
    confidence: confidenceValue,
    reasonTags: Array.from(new Set(reasonTags)),
    evidenceSummary,
    riskLevel,
    queueEligible: false,
    applyEligible: false,
    blockerReasons: uniqueBlockerReasons,
    secondarySuggestion,
    problemClass,
  };
}

export function resolveCreativeDecisionOsV2(
  input: CreativeDecisionOsV2Input,
): CreativeDecisionOsV2Output {
  const spend = n(input.spend);
  const roas = n(input.roas);
  const recentRoas = n(input.recentRoas);
  const recentPurchases = n(input.recentPurchases);
  const long90Roas = n(input.long90Roas);
  const peerMedianSpend = Math.max(n(input.peerMedianSpend), 1);
  const benchmarkRoas = n(input.activeBenchmarkRoas);
  const active = input.activeStatus === true;
  const inactive = input.activeStatus === false;
  const campaignBlocked = isCampaignContextBlocked(input);
  const roasRatio = ratio(input.roas, input.activeBenchmarkRoas) ?? 0;
  const recentRatio = ratio(input.recentRoas, input.activeBenchmarkRoas) ?? 0;
  const long90Ratio = ratio(input.long90Roas, input.activeBenchmarkRoas) ?? 0;
  const spendVsPeer = spend / peerMedianSpend;
  const degraded = isDegradedTruth(input);

  if (input.trustState?.trim().toLowerCase() === "inactive_or_immaterial") {
    return output(
      input,
      "Diagnose",
      "diagnose",
      confidence(82, input),
      ["source_inactive_or_immaterial", "data_quality_blocker"],
      "Source marks the creative inactive or immaterial, so the resolver diagnoses the data/source state instead of emitting a buyer action.",
      "medium",
      "data-quality",
    );
  }

  if (inactive) {
    if (spend < 120 || (!hasReliableBenchmark(input) && recentPurchases === 0)) {
      return output(
        input,
        "Diagnose",
        "diagnose",
        confidence(78, input),
        ["inactive_creative", "insufficient_signal"],
        "Inactive creative has too little reliable spend or benchmark context for a buyer action.",
        "medium",
        "insufficient-signal",
      );
    }

    if (
      (campaignBlocked || input.trustState?.trim().toLowerCase() === "live_confident") &&
      roasRatio >= 2.4 &&
      long90Ratio >= 1.7
    ) {
      return output(
        input,
        "Diagnose",
        "diagnose",
        confidence(86, input),
        ["inactive_historical_winner", "campaign_context_blocked"],
        "Paused historical winner needs campaign/status diagnosis before relaunch or scale.",
        "high",
        "campaign-context",
        "Refresh",
      );
    }

    if (
      input.trustState?.trim().toLowerCase() === "live_confident" &&
      roasRatio >= 1.6 &&
      recentPurchases <= 4
    ) {
      return output(
        input,
        "Diagnose",
        "diagnose",
        confidence(82, input),
        ["inactive_winner_status_question", "campaign_context_diagnosis"],
        "Inactive winner has a live-confident historical signal but not enough current delivery to choose refresh versus status diagnosis.",
        "high",
        "campaign-context",
        "Refresh",
      );
    }

    if (roasRatio <= 0.65 && recentRatio <= 0.25 && spend >= 250) {
      return output(
        input,
        "Cut",
        "direct",
        confidence(82, input),
        ["inactive_confirmed_loser", "below_benchmark", "no_recovery"],
        "Inactive creative spent enough to confirm a below-benchmark loser with no recent recovery.",
        "high",
        "creative",
      );
    }

    if (roasRatio >= 0.8 || long90Ratio >= 0.8 || recentPurchases >= 1) {
      return output(
        input,
        "Refresh",
        "review_only",
        confidence(76, input),
        ["inactive_historical_signal", "refresh_before_relaunch"],
        "Inactive creative has enough historical or recent signal to treat as a refresh/relaunch candidate, not direct Scale.",
        "medium",
        "creative",
      );
    }

    return output(
      input,
      "Diagnose",
      "diagnose",
      confidence(74, input),
      ["inactive_creative", "unclear_buyer_action"],
      "Inactive creative lacks a reliable buyer-action route.",
      "medium",
      "campaign-context",
    );
  }

  if (!hasReliableBenchmark(input)) {
    return output(
      input,
      "Diagnose",
      "diagnose",
      confidence(72, input),
      ["benchmark_unreliable", "diagnose_baseline"],
      "Reliable benchmark context is missing, so the resolver diagnoses before ranking creative action.",
      "medium",
      "data-quality",
    );
  }

  if (spend < 75 || spend < Math.max(35, peerMedianSpend * 0.35)) {
    if (recentPurchases >= 1 || (spend >= 34 && roas > 0 && long90Ratio >= 1.4)) {
      return output(
        input,
        "Test More",
        "direct",
        confidence(74, input),
        ["thin_data", "positive_probe_signal"],
        "Thin active read has some positive conversion or historical signal; continue testing rather than passively holding.",
        "low",
        "insufficient-signal",
      );
    }
    return output(
      input,
      "Diagnose",
      "diagnose",
      confidence(76, input),
      ["thin_data", "no_recent_conversion"],
      "Thin active read has no recent conversion evidence, so the resolver diagnoses the signal before action.",
      "medium",
      "insufficient-signal",
    );
  }

  if (degraded && spend < 5_000 && spend < peerMedianSpend && roasRatio <= 0.35) {
    if (recentPurchases === 0 && recentRatio === 0 && spendVsPeer >= 0.75 && long90Ratio >= 0.5) {
      return output(
        input,
        "Diagnose",
        "diagnose",
        confidence(74, input),
        ["degraded_truth", "no_recent_conversion", "diagnose_before_action"],
        "Degraded-truth read has no recent conversions and only partial historical support, so diagnose before choosing a buyer action.",
        "medium",
        "data-quality",
        "Test More",
      );
    }
    return output(
      input,
      "Test More",
      "direct",
      confidence(70, input),
      ["degraded_truth", "below_peer_spend", "confirm_before_cut"],
      "Degraded-truth loser is still below peer-median spend, so confirm with more delivery before cutting.",
      "medium",
      "insufficient-signal",
      "Cut",
    );
  }

  if (
    !degraded &&
    recentPurchases === 0 &&
    roasRatio >= 1 &&
    roasRatio < 1.25 &&
    long90Ratio >= 2
  ) {
    return output(
      input,
      "Diagnose",
      "diagnose",
      confidence(78, input),
      ["historical_strength_dead_recent", "diagnose_before_refresh"],
      "Historical strength with no recent conversion needs diagnosis before the buyer chooses refresh or protection.",
      "medium",
      "campaign-context",
      "Refresh",
    );
  }

  if (
    active &&
    recentPurchases === 0 &&
    recentRatio <= 0.15 &&
    (roasRatio >= 1.25 || (roasRatio >= 1 && long90Ratio >= 1.25)) &&
    (spend >= 150 || spendVsPeer >= 0.7)
  ) {
    if (degraded || campaignBlocked || hasSourceOrProvenanceBlocker(input)) {
      return output(
        input,
        "Diagnose",
        "diagnose",
        confidence(78, input),
        ["strong_history_recent_stop", "diagnose_before_refresh"],
        "Strong historical signal stopped converting recently, but source or context risk makes the buyer action ambiguous.",
        "high",
        "data-quality",
        "Refresh",
      );
    }
    return output(
      input,
      "Refresh",
      "review_only",
      confidence(82, input),
      ["strong_history_recent_stop", "refresh_candidate"],
      "Strong historical signal stopped converting in the recent window, so refresh before protecting.",
      "high",
      "creative",
      "Protect",
    );
  }

  if (
    !degraded &&
    recentPurchases === 0 &&
    roasRatio >= 0.95 &&
    roasRatio < 1.25 &&
    long90Ratio >= 0.6 &&
    long90Ratio < 1.5 &&
    spendVsPeer >= 1
  ) {
    return output(
      input,
      "Protect",
      "direct",
      confidence(76, input),
      ["around_benchmark_stable", "protect"],
      "On-benchmark creative at peer-level spend should be protected unless recent decay is severe enough to require a refresh.",
      "low",
      "creative",
    );
  }

  if (
    active &&
    !degraded &&
    roasRatio >= 3 &&
    recentRatio >= 3 &&
    long90Ratio >= 1.5 &&
    recentPurchases >= 5 &&
    spendVsPeer >= 1
  ) {
    return output(
      input,
      "Scale",
      "review_only",
      confidence(90, input),
      ["textbook_scale_shape", "above_benchmark", "recent_strength", "operator_review_required"],
      "Active creative is far above benchmark with recent and long-window confirmation; Scale requires operator review.",
      "high",
      "creative",
      "Protect",
    );
  }

  if (spend >= 5_000 && roasRatio <= 0.35 && long90Ratio <= 0.35) {
    if (recentPurchases <= 1) {
      return output(
        input,
        "Cut",
        "direct",
        confidence(86, input),
        ["huge_spend_severe_loser", "below_benchmark", "no_recovery"],
        "Huge-spend severe loser with no recovery should be cut.",
        "critical",
        "creative",
      );
    }
    return output(
      input,
      "Test More",
      "direct",
      confidence(68, input),
      ["degraded_truth", "severe_loss_needs_confirmation"],
      "Severe loser shape is present, but degraded truth requires more-test confirmation.",
      "high",
      "insufficient-signal",
      "Cut",
    );
  }

  if (
    spend >= Math.max(250, peerMedianSpend * 1.5) &&
    roasRatio <= 0.55 &&
    recentRatio <= 0.35 &&
    recentPurchases === 0
  ) {
    return output(
      input,
      "Cut",
      "direct",
      confidence(84, input),
      ["severe_sustained_loser", "below_benchmark", "no_recent_recovery"],
      "Active creative has enough spend and sustained below-benchmark performance to cut.",
      "high",
      "creative",
    );
  }

  if (
    degraded &&
    recentPurchases === 0 &&
    spend < 100 &&
    roasRatio >= 0.85
  ) {
    return output(
      input,
      "Diagnose",
      "diagnose",
      confidence(76, input),
      ["degraded_truth", "dead_recent_low_spend"],
      "Low-spend degraded-truth row has no recent conversions; diagnose before action.",
      "medium",
      "data-quality",
    );
  }

  if (
    roasRatio >= 0.95 &&
    recentRatio < 0.55 &&
    (recentPurchases >= 1 || spend >= Math.max(200, peerMedianSpend * 1.2))
  ) {
    return output(
      input,
      "Refresh",
      "review_only",
      confidence(82, input),
      ["lifetime_strong_recent_decay", "refresh_before_cut"],
      "Lifetime or long-window signal remains credible, but recent ROAS decayed below benchmark; refresh before cutting.",
      "high",
      "creative",
      "Protect",
    );
  }

  if (roasRatio < 0.85 && spend >= peerMedianSpend) {
    if (
      !degraded &&
      roasRatio >= 0.8 &&
      recentPurchases <= 1 &&
      long90Ratio < 1.1
    ) {
      return output(
        input,
        "Refresh",
        "review_only",
        confidence(76, input),
        ["below_benchmark", "peer_level_spend", "creative_refresh_candidate"],
        "Peer-level spend with below-benchmark lifetime performance needs a creative refresh, even if the latest conversion window rebounded.",
        "medium",
        "creative",
        "Test More",
      );
    }
    if (recentPurchases >= 1 && recentRatio >= 1) {
      return output(
        input,
        "Test More",
        "direct",
        confidence(74, input),
        ["below_benchmark", "recent_conversion_rebound"],
        "Below-benchmark creative has recent conversion rebound, so test more before refresh or cut.",
        "medium",
        "insufficient-signal",
        "Refresh",
      );
    }
    if (
      degraded &&
      recentPurchases <= 1 &&
      spend < 250 &&
      spendVsPeer < 1.5 &&
      recentRatio < 0.75
    ) {
      return output(
        input,
        "Test More",
        "direct",
        confidence(70, input),
        ["degraded_truth", "sparse_purchases", "confirm_before_refresh"],
        "Sparse degraded-truth signal needs more delivery before deciding whether refresh is warranted.",
        "medium",
        "insufficient-signal",
        "Refresh",
      );
    }
    if (recentPurchases >= 1 && recentRatio >= 0.45) {
      return output(
        input,
        "Refresh",
        "review_only",
        confidence(78, input),
        ["active_conversions_below_benchmark", "refresh_before_cut"],
        "Active underperformer still has conversion volume, so refresh before cutting.",
        "high",
        "creative",
        "Cut",
      );
    }
    if (degraded && recentPurchases >= 2 && spendVsPeer >= 1 && roasRatio >= 0.5) {
      return output(
        input,
        "Refresh",
        "review_only",
        confidence(76, input),
        ["below_benchmark", "degraded_truth", "creative_refresh_candidate"],
        "Below-benchmark degraded-truth read has enough conversion volume and peer-level spend to refresh before further testing.",
        "medium",
        "creative",
        "Test More",
      );
    }
    if (degraded && spend < peerMedianSpend * 1.5) {
      return output(
        input,
        "Test More",
        "direct",
        confidence(70, input),
        ["below_benchmark", "degraded_truth", "needs_more_delivery"],
        "Below-benchmark active read is not severe enough for a direct cut under degraded truth.",
        "medium",
        "insufficient-signal",
      );
    }
    return output(
      input,
      "Refresh",
      "review_only",
      confidence(76, input),
      ["below_benchmark", "creative_refresh_candidate"],
      "Moderate below-benchmark active read needs creative refresh before a harder cut.",
      "medium",
      "creative",
    );
  }

  if (roasRatio >= 1.25) {
    if (
      !degraded &&
      spend < 1_500 &&
      spendVsPeer < 1.5 &&
      recentPurchases >= 2 &&
      recentRatio >= 1.4 &&
      roasRatio >= 2
    ) {
      return output(
        input,
        "Test More",
        "direct",
        confidence(76, input),
        ["promising_under_sampled_winner", "protect_scale_precision"],
        "Strong but still under-scaled active winner should get more test delivery before Scale.",
        "medium",
        "insufficient-signal",
        "Protect",
      );
    }
    return output(
      input,
      "Protect",
      "direct",
      confidence(82, input),
      ["stable_above_benchmark_winner", "protect_before_scale"],
      "Above-benchmark active winner should be protected unless scalable evidence is overwhelming.",
      "low",
      "creative",
    );
  }

  if (roasRatio >= 0.85) {
    if (recentRatio < 0.65 && (recentPurchases >= 1 || spend >= peerMedianSpend)) {
      return output(
        input,
        "Refresh",
        "review_only",
        confidence(76, input),
        ["around_benchmark_recent_decay", "refresh_candidate"],
        "Around-benchmark creative has recent decay, making Refresh more actionable than passive monitoring.",
        "medium",
        "creative",
        "Protect",
      );
    }
    if (spend < peerMedianSpend * 0.8 || (recentPurchases <= 2 && spend < peerMedianSpend * 1.2)) {
      return output(
        input,
        "Test More",
        "direct",
        confidence(72, input),
        ["around_benchmark", "needs_more_delivery"],
        "Around-benchmark read is not yet mature enough to protect or cut.",
        "low",
        "insufficient-signal",
      );
    }
    return output(
      input,
      "Protect",
      "direct",
      confidence(78, input),
      ["around_benchmark_stable", "protect"],
      "Stable around-benchmark creative should be protected while more evidence accrues.",
      "low",
      "creative",
    );
  }

  if (
    active &&
    !degraded &&
    recentPurchases === 1 &&
    roasRatio >= 0.55 &&
    roasRatio < 0.85 &&
    recentRatio >= 0.45 &&
    recentRatio < 0.75 &&
    long90Ratio >= 0.85 &&
    long90Ratio < 1.1 &&
    spendVsPeer >= 0.8 &&
    spendVsPeer < 1.2
  ) {
    return output(
      input,
      "Diagnose",
      "diagnose",
      confidence(72, input),
      ["mixed_signal", "diagnose_before_action"],
      "Near-peer spend with mixed lifetime and recent signals needs diagnosis before refresh or more delivery.",
      "medium",
      "data-quality",
      "Test More",
    );
  }

  if (recentPurchases >= 1) {
    return output(
      input,
      "Test More",
      "direct",
      confidence(70, input),
      ["weak_read_with_conversion", "test_more_before_cut"],
      "Weak active read still has recent conversion evidence, so test more before cutting.",
      "medium",
      "insufficient-signal",
    );
  }

  return output(
    input,
    "Diagnose",
    "diagnose",
    confidence(72, input),
    ["weak_read_no_recent_conversion", "diagnose_before_action"],
    "Weak active read has no recent conversion evidence and no decisive cut signal.",
    "medium",
    "insufficient-signal",
  );
}
