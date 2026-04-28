import { deriveCreativePhase, type CreativePhase } from "@/lib/creative-phase";

export { CREATIVE_PHASES, deriveCreativePhase, type CreativePhase } from "@/lib/creative-phase";

export const CREATIVE_VERDICT_VERSION = "creative-verdict.v1" as const;

export const CREATIVE_VERDICT_HEADLINES = [
  "Test Winner",
  "Test Loser",
  "Test Inconclusive",
  "Scale Performer",
  "Scale Underperformer",
  "Scale Fatiguing",
  "Needs Diagnosis",
] as const;

export type CreativeVerdictHeadline = (typeof CREATIVE_VERDICT_HEADLINES)[number];

export const CREATIVE_ACTIONS = [
  "scale",
  "keep_testing",
  "protect",
  "refresh",
  "cut",
  "diagnose",
] as const;

export type CreativeAction = (typeof CREATIVE_ACTIONS)[number];

export const CREATIVE_ACTION_READINESS = [
  "ready",
  "needs_review",
  "blocked",
] as const;

export type CreativeActionReadiness = (typeof CREATIVE_ACTION_READINESS)[number];

export type CreativeReasonTag =
  | "fatigue_recent_collapse"
  | "large_spend_scale_phase"
  | "scale_maturity"
  | "test_phase"
  | "above_break_even"
  | "below_break_even"
  | "near_break_even"
  | "low_evidence"
  | "inactive_pending_winner"
  | "business_validation_missing"
  | "business_validation_unfavorable"
  | "trust_degraded_missing_truth"
  | "trust_live_confident"
  | "deployment_limited"
  | "target_pack_configured"
  | "target_pack_missing"
  | "confident_cut"
  | "baseline_strong"
  | "baseline_medium"
  | "baseline_weak"
  | "break_even_proxy_used"
  | "break_even_default_floor";

export type CreativeBlockerReason =
  | "trust_degraded_missing_truth"
  | "business_validation_missing"
  | "business_validation_unfavorable"
  | "commercial_truth_target_pack_missing"
  | "deployment_lane_limited"
  | "inactive_scale_delivery"
  | "diagnose_action"
  | "hard_truth_blocker";

export interface CreativeReason {
  tag: CreativeReasonTag;
  weight: "primary" | "supporting";
}

export interface CreativeVerdict {
  contractVersion: typeof CREATIVE_VERDICT_VERSION;
  phase: CreativePhase;
  headline: CreativeVerdictHeadline;
  action: CreativeAction;
  actionReadiness: CreativeActionReadiness;
  confidence: number;
  evidence: CreativeReason[];
  blockers: CreativeBlockerReason[];
  derivedAt: string;
}

export type CreativeBusinessValidationStatus =
  | "favorable"
  | "missing"
  | "unfavorable";

export type CreativeTrustState =
  | "live_confident"
  | "degraded_missing_truth"
  | "inactive_or_immaterial"
  | (string & {});

export type CreativeDeploymentCompatibility =
  | "compatible"
  | "limited"
  | "blocked"
  | (string & {});

export interface CreativeVerdictInput {
  metrics: {
    spend30d?: number | null;
    purchases30d?: number | null;
    roas30d?: number | null;
    cpa30d?: number | null;
    recent7d?: {
      spend?: number | null;
      roas?: number | null;
      purchases?: number | null;
    } | null;
    mid30d?: {
      spend?: number | null;
      roas?: number | null;
      purchases?: number | null;
    } | null;
    long90d?: {
      spend?: number | null;
      roas?: number | null;
      purchases?: number | null;
    } | null;
    relative?: {
      roasToBenchmark?: number | null;
      cpaToBenchmark?: number | null;
      spendToMedian?: number | null;
      recent7ToLong90Roas?: number | null;
    } | null;
  };
  delivery: {
    activeStatus?: boolean | null;
    campaignStatus?: string | null;
    adSetStatus?: string | null;
  };
  baseline: {
    reliability?: string | null;
    selected?: {
      medianRoas?: number | null;
      medianCpa?: number | null;
      medianSpend?: number | null;
    } | null;
  };
  commercialTruth: {
    targetPackConfigured?: boolean | null;
    targetRoas?: number | null;
    businessValidationStatus?: string | null;
  };
  context: {
    trustState?: string | null;
    deploymentCompatibility?: string | null;
    campaignIsTestLike?: boolean | null;
  };
  now?: string | Date | null;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function n(value: number | null | undefined, fallback = 0) {
  return finite(value) ? value : fallback;
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function resolveCreativeBreakEvenRoas(input: CreativeVerdictInput) {
  return resolveCreativeBreakEven(input).value;
}

function resolveCreativeBreakEven(input: CreativeVerdictInput) {
  const targetRoas = input.commercialTruth.targetRoas;
  const medianRoas = input.baseline.selected?.medianRoas;
  if (input.commercialTruth.targetPackConfigured === true && finite(targetRoas) && targetRoas > 0) {
    return { value: targetRoas, source: "target_pack" as const };
  }
  if (finite(medianRoas) && medianRoas > 0) {
    return { value: medianRoas, source: "median_proxy" as const };
  }
  return { value: 1, source: "default_floor" as const };
}

function resolveBusinessValidationStatus(
  value: string | null | undefined,
): CreativeBusinessValidationStatus {
  const status = normalized(value);
  if (status === "favorable") return "favorable";
  if (status === "unfavorable") return "unfavorable";
  return "missing";
}

function resolveTrustState(value: string | null | undefined): CreativeTrustState {
  const trust = normalized(value);
  if (trust === "live_confident") return "live_confident";
  if (trust === "degraded_missing_truth") return "degraded_missing_truth";
  if (trust === "inactive_or_immaterial") return "inactive_or_immaterial";
  return trust || "degraded_missing_truth";
}

function resolveDeploymentCompatibility(
  value: string | null | undefined,
): CreativeDeploymentCompatibility {
  const compatibility = normalized(value);
  if (compatibility === "compatible") return "compatible";
  if (compatibility === "blocked") return "blocked";
  if (compatibility === "limited") return "limited";
  return compatibility || "limited";
}

function roasRatio(input: CreativeVerdictInput, breakEven: number) {
  const roas = input.metrics.roas30d;
  if (finite(roas) && breakEven > 0) return roas / breakEven;
  const relative = input.metrics.relative?.roasToBenchmark;
  return finite(relative) ? relative : null;
}

function spendToMedian(input: CreativeVerdictInput) {
  const relative = input.metrics.relative?.spendToMedian;
  if (finite(relative)) return relative;
  const spend = input.metrics.spend30d;
  const median = input.baseline.selected?.medianSpend;
  if (!finite(spend) || !finite(median) || median <= 0) return null;
  return spend / median;
}

function recentToLongRatio(input: CreativeVerdictInput) {
  const explicit = input.metrics.relative?.recent7ToLong90Roas;
  if (finite(explicit)) return explicit;
  const recent = input.metrics.recent7d?.roas;
  const long = input.metrics.long90d?.roas;
  if (!finite(recent) || !finite(long) || long <= 0) return null;
  return recent / long;
}

function hasFatigue(input: CreativeVerdictInput, breakEven: number) {
  const recentRoas = input.metrics.recent7d?.roas;
  const long90Roas = input.metrics.long90d?.roas;
  if (!finite(recentRoas) || !finite(long90Roas) || long90Roas <= 0) {
    return false;
  }
  const ratio = recentRoas / long90Roas;
  if (ratio < 0.55 && recentRoas < breakEven * 0.6 && long90Roas >= breakEven) {
    return true;
  }
  return ratio < 0.4 && n(input.metrics.recent7d?.spend) > 30;
}

function pushEvidence(
  evidence: CreativeReason[],
  seen: Set<CreativeReasonTag>,
  tag: CreativeReasonTag,
  weight: "primary" | "supporting" = "supporting",
) {
  if (seen.has(tag)) {
    if (weight === "primary") {
      const existing = evidence.find((item) => item.tag === tag);
      if (existing) existing.weight = "primary";
    }
    return;
  }
  seen.add(tag);
  evidence.push({ tag, weight });
}

function confidence(input: {
  action: CreativeAction;
  spend: number;
  purchases: number;
  roasRatio: number | null;
  trustState: CreativeTrustState;
  baselineReliability: string;
}) {
  let value = 0.3;
  if (input.purchases >= 8 && input.spend >= 200) value += 0.3;
  else if (input.purchases >= 3) value += 0.15;

  if (input.roasRatio != null) {
    const distance = Math.abs(input.roasRatio - 1);
    if (distance >= 0.5) value += 0.2;
    else if (distance >= 0.2) value += 0.1;
  }

  if (input.trustState === "live_confident") value += 0.3;
  else if (input.trustState === "degraded_missing_truth") value += 0.1;

  if (input.baselineReliability === "strong") value += 0.1;
  else if (input.baselineReliability === "medium") value += 0.05;

  if (input.action === "diagnose") value = Math.min(value, 0.7);
  return round(clamp(value, 0.3, 0.95), 4);
}

function deriveReadiness(input: {
  action: CreativeAction;
  active: boolean;
  targetPackConfigured: boolean;
  validationStatus: CreativeBusinessValidationStatus;
  trustState: CreativeTrustState;
  hardBlocker: boolean;
}): CreativeActionReadiness {
  if (input.action === "diagnose") return "blocked" satisfies CreativeActionReadiness;
  if (
    input.active &&
    input.targetPackConfigured &&
    input.validationStatus === "favorable" &&
    input.trustState === "live_confident"
  ) {
    return "ready" satisfies CreativeActionReadiness;
  }
  if (
    input.action === "cut" &&
    input.validationStatus === "unfavorable" &&
    input.trustState === "live_confident"
  ) {
    return "ready" satisfies CreativeActionReadiness;
  }
  if (input.hardBlocker) return "blocked" satisfies CreativeActionReadiness;
  return "needs_review" satisfies CreativeActionReadiness;
}

export function resolveCreativeVerdict(input: CreativeVerdictInput): CreativeVerdict {
  const evidence: CreativeReason[] = [];
  const seenEvidence = new Set<CreativeReasonTag>();
  const blockers: CreativeBlockerReason[] = [];
  const breakEvenResolution = resolveCreativeBreakEven(input);
  const breakEven = breakEvenResolution.value;
  const spend = n(input.metrics.spend30d);
  const purchases = n(input.metrics.purchases30d);
  const ratio = roasRatio(input, breakEven);
  const spendRatio = spendToMedian(input);
  const validationStatus = resolveBusinessValidationStatus(
    input.commercialTruth.businessValidationStatus,
  );
  const trustState = resolveTrustState(input.context.trustState);
  const deploymentCompatibility = resolveDeploymentCompatibility(
    input.context.deploymentCompatibility,
  );
  const targetPackConfigured = input.commercialTruth.targetPackConfigured === true;
  const active = input.delivery.activeStatus === true;
  const fatigue = hasFatigue(input, breakEven);

  const phase = fatigue
    ? "post-scale"
    : deriveCreativePhase({
        spend30d: input.metrics.spend30d,
        purchases30d: input.metrics.purchases30d,
        activeStatus: input.delivery.activeStatus,
        baseline: { medianSpend: input.baseline.selected?.medianSpend },
        relative: { spendToMedian: spendRatio },
        recent7d: input.metrics.recent7d,
        long90d: input.metrics.long90d,
        breakEvenRoas: breakEven,
      });

  const hardTruthBlocker =
    trustState === "degraded_missing_truth" && validationStatus === "missing";

  if (trustState === "degraded_missing_truth") {
    blockers.push("trust_degraded_missing_truth");
    pushEvidence(evidence, seenEvidence, "trust_degraded_missing_truth", "supporting");
  } else if (trustState === "live_confident") {
    pushEvidence(evidence, seenEvidence, "trust_live_confident", "supporting");
  }

  if (validationStatus === "missing") {
    blockers.push("business_validation_missing");
    pushEvidence(evidence, seenEvidence, "business_validation_missing", "supporting");
  } else if (validationStatus === "unfavorable") {
    blockers.push("business_validation_unfavorable");
    pushEvidence(evidence, seenEvidence, "business_validation_unfavorable", "supporting");
  }

  if (!targetPackConfigured) {
    blockers.push("commercial_truth_target_pack_missing");
    pushEvidence(evidence, seenEvidence, "target_pack_missing", "supporting");
  }
  if (breakEvenResolution.source === "target_pack") {
    pushEvidence(evidence, seenEvidence, "target_pack_configured", "supporting");
  } else {
    pushEvidence(evidence, seenEvidence, "break_even_proxy_used", "primary");
    if (breakEvenResolution.source === "default_floor") {
      pushEvidence(evidence, seenEvidence, "break_even_default_floor", "primary");
    }
  }

  if (deploymentCompatibility === "limited" || deploymentCompatibility === "blocked") {
    blockers.push("deployment_lane_limited");
    pushEvidence(evidence, seenEvidence, "deployment_limited", "supporting");
  }

  if (finite(spendRatio) && spendRatio >= 5) {
    pushEvidence(evidence, seenEvidence, "large_spend_scale_phase", "supporting");
  }
  if (phase === "scale" && purchases >= 8) {
    pushEvidence(evidence, seenEvidence, "scale_maturity", "supporting");
  }

  let headline: CreativeVerdictHeadline;
  let action: CreativeAction;

  if (hardTruthBlocker) {
    blockers.push("hard_truth_blocker");
    headline = "Needs Diagnosis";
    action = "diagnose";
    pushEvidence(evidence, seenEvidence, "trust_degraded_missing_truth", "primary");
  } else if (fatigue) {
    headline = "Scale Fatiguing";
    action = "refresh";
    pushEvidence(evidence, seenEvidence, "fatigue_recent_collapse", "primary");
  } else if (!active && phase === "test" && ratio != null && ratio >= 1.2) {
    headline = "Test Winner";
    action = "scale";
    blockers.push("inactive_scale_delivery");
    pushEvidence(evidence, seenEvidence, "inactive_pending_winner", "primary");
  } else if (validationStatus === "unfavorable" && phase === "scale") {
    headline = "Scale Underperformer";
    action = "cut";
    pushEvidence(evidence, seenEvidence, "business_validation_unfavorable", "primary");
  } else if (phase === "test") {
    pushEvidence(evidence, seenEvidence, "test_phase", "supporting");
    if (ratio != null && ratio >= 1.2 && purchases >= 3 && spend >= 75) {
      headline = "Test Winner";
      action = "scale";
      pushEvidence(evidence, seenEvidence, "above_break_even", "primary");
    } else if (
      ratio != null &&
      ratio <= 0.75 &&
      spend >= Math.max(250, n(input.baseline.selected?.medianSpend))
    ) {
      headline = "Test Loser";
      action = "cut";
      pushEvidence(evidence, seenEvidence, "below_break_even", "primary");
    } else {
      headline = "Test Inconclusive";
      action = "keep_testing";
      pushEvidence(
        evidence,
        seenEvidence,
        purchases < 3 || spend < 75 ? "low_evidence" : "near_break_even",
        "primary",
      );
    }
  } else {
    if (ratio != null && ratio >= 1.1) {
      headline = "Scale Performer";
      action = "protect";
      pushEvidence(evidence, seenEvidence, "above_break_even", "primary");
    } else if (ratio != null && ratio <= 0.75) {
      headline = phase === "scale" ? "Scale Underperformer" : "Test Loser";
      action = "cut";
      pushEvidence(evidence, seenEvidence, "below_break_even", "primary");
    } else if (ratio != null && ratio < 0.95) {
      headline = "Scale Underperformer";
      action = "refresh";
      pushEvidence(evidence, seenEvidence, "near_break_even", "primary");
    } else {
      headline = "Scale Performer";
      action = "protect";
      pushEvidence(evidence, seenEvidence, "near_break_even", "primary");
    }
  }

  if (!active && phase === "scale" && action !== "diagnose") {
    blockers.push("inactive_scale_delivery");
  }

  let actionReadiness = deriveReadiness({
    action,
    active,
    targetPackConfigured,
    validationStatus,
    trustState,
    hardBlocker: hardTruthBlocker,
  });

  if (
    actionReadiness === "ready" &&
    (deploymentCompatibility === "limited" ||
      deploymentCompatibility === "blocked" ||
      (!active && phase === "scale"))
  ) {
    actionReadiness = "needs_review";
  }

  if (action === "cut" && actionReadiness === "ready") {
    pushEvidence(evidence, seenEvidence, "confident_cut", "supporting");
  }
  const reliability = normalized(input.baseline.reliability);
  if (reliability === "strong") pushEvidence(evidence, seenEvidence, "baseline_strong", "supporting");
  else if (reliability === "medium") pushEvidence(evidence, seenEvidence, "baseline_medium", "supporting");
  else pushEvidence(evidence, seenEvidence, "baseline_weak", "supporting");

  const derivedAt =
    input.now instanceof Date
      ? input.now.toISOString()
      : typeof input.now === "string" && input.now.trim()
        ? input.now
        : new Date().toISOString();

  return {
    contractVersion: CREATIVE_VERDICT_VERSION,
    phase,
    headline,
    action,
    actionReadiness,
    confidence: confidence({
      action,
      spend,
      purchases,
      roasRatio: ratio,
      trustState,
      baselineReliability: reliability,
    }),
    evidence,
    blockers: Array.from(new Set(blockers)),
    derivedAt,
  };
}

export function creativeActionToPrimaryDecision(action: CreativeAction) {
  switch (action) {
    case "scale":
      return "Scale";
    case "keep_testing":
      return "Test More";
    case "protect":
      return "Protect";
    case "refresh":
      return "Refresh";
    case "cut":
      return "Cut";
    case "diagnose":
      return "Diagnose";
  }
}

export function creativeActionToLegacyAction(action: CreativeAction) {
  switch (action) {
    case "scale":
      return "scale";
    case "keep_testing":
      return "test_more";
    case "protect":
      return "watch";
    case "refresh":
      return "pause";
    case "cut":
      return "kill";
    case "diagnose":
      return "watch";
  }
}
