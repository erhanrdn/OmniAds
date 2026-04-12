import type {
  CreativeDecisionOsCreative,
  CreativeDecisionOsV1Response,
} from "@/lib/creative-decision-os";
import {
  buildOperatorBuckets,
  operatorConfidenceBand,
  titleFromEnum,
  type OperatorAuthorityState,
  type OperatorSurfaceItem,
  type OperatorSurfaceMetric,
  type OperatorSurfaceModel,
} from "@/lib/operator-surface";

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
      return "Testing";
    case "scale_ready":
      return "Ready to promote";
    case "stable_winner":
      return "Protected winner";
    case "fatigued_winner":
      return "Fatigued";
    case "blocked":
    case "retired":
      return "Blocked";
    case "comeback_candidate":
      return "Comeback test";
    default:
      return titleFromEnum(value);
  }
}

function previewLabel(creative: CreativeDecisionOsCreative) {
  if (creative.previewStatus?.liveDecisionWindow === "missing") return "Needs preview";
  if (creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded") return "Preview degraded";
  return "Preview ready";
}

function isCreativeMuted(creative: CreativeDecisionOsCreative) {
  const materiality = creative.trust.evidence?.materiality;
  return materiality === "thin_signal" || materiality === "immaterial" || creative.trust.surfaceLane === "archive_context";
}

function creativeAuthorityState(creative: CreativeDecisionOsCreative) {
  if (creative.previewStatus?.liveDecisionWindow === "missing") {
    return "blocked" satisfies OperatorAuthorityState;
  }
  if (creative.trust.operatorDisposition === "profitable_truth_capped") {
    return "needs_truth" satisfies OperatorAuthorityState;
  }
  if (creative.primaryAction === "hold_no_touch") {
    return "no_action" satisfies OperatorAuthorityState;
  }
  if (creative.primaryAction === "keep_in_test" || creative.primaryAction === "retest_comeback") {
    return "watch" satisfies OperatorAuthorityState;
  }
  if (
    creative.primaryAction === "block_deploy" ||
    creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded"
  ) {
    return "blocked" satisfies OperatorAuthorityState;
  }
  return "act_now" satisfies OperatorAuthorityState;
}

function creativeBlocker(creative: CreativeDecisionOsCreative, state: OperatorAuthorityState) {
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
  if (creative.previewStatus?.liveDecisionWindow === "missing") return "Needs preview";
  if (state === "needs_truth") return "Needs truth";
  switch (creative.primaryAction) {
    case "promote_to_scaling":
      return "Promote";
    case "keep_in_test":
      return "Keep testing";
    case "hold_no_touch":
      return "Do not touch";
    case "refresh_replace":
      return "Replace";
    case "retest_comeback":
      return "Retry";
    case "block_deploy":
      return creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded"
        ? "Needs preview"
        : creative.lifecycleState === "fatigued_winner"
          ? "Replace"
          : "Keep testing";
    default:
      return titleFromEnum(creative.primaryAction);
  }
}

function creativeReason(creative: CreativeDecisionOsCreative, state: OperatorAuthorityState, muted: boolean, blocker: string | null) {
  if (state === "blocked" && creative.previewStatus?.liveDecisionWindow === "missing") {
    return "Preview truth is missing, so this creative cannot headline an authoritative action yet.";
  }
  if (state === "needs_truth" && blocker) {
    return `Promising, but ${blocker.charAt(0).toLowerCase()}${blocker.slice(1)}`;
  }
  if (muted) {
    return "Signal is still too thin for a headline creative action.";
  }
  return creative.summary;
}

function compactMetrics(metrics: OperatorSurfaceMetric[]) {
  return metrics.filter((metric) => Boolean(metric.value) && metric.value !== "n/a").slice(0, 5);
}

export function buildCreativeOperatorItem(creative: CreativeDecisionOsCreative): OperatorSurfaceItem {
  const authorityState = creativeAuthorityState(creative);
  const muted = isCreativeMuted(creative);
  const blocker = creativeBlocker(creative, authorityState);

  return {
    id: creative.creativeId,
    title: creative.name,
    subtitle: creative.familyLabel,
    primaryAction: creativeActionLabel(creative, authorityState),
    authorityState,
    reason: creativeReason(creative, authorityState, muted, blocker),
    blocker,
    confidence: operatorConfidenceBand(creative.confidence),
    secondaryLabels: [
      lifecycleLabel(creative.lifecycleState),
      previewLabel(creative),
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
  };
}

export function buildCreativeOperatorSurfaceModel(
  decisionOs: CreativeDecisionOsV1Response | null | undefined,
): OperatorSurfaceModel | null {
  if (!decisionOs) return null;

  const items = decisionOs.creatives.map(buildCreativeOperatorItem);
  const buckets = buildOperatorBuckets(items, {
    labels: {
      blocked: "Needs preview / blocked",
      watch: "Keep testing",
      no_action: "Protected",
    },
    summaries: {
      blocked: "Rows held back by preview truth, deployment compatibility, or hard creative constraints.",
      watch: "Rows that should stay visible for testing without decisive action language.",
      no_action: "Rows that should stay protected instead of being pushed back into churn.",
    },
    order: ["act_now", "needs_truth", "blocked", "watch", "no_action"],
  });

  const counts = {
    actNow: buckets.find((bucket) => bucket.key === "act_now")?.rows.length ?? 0,
    needsTruth: buckets.find((bucket) => bucket.key === "needs_truth")?.rows.length ?? 0,
    blocked: buckets.find((bucket) => bucket.key === "blocked")?.rows.length ?? 0,
    watch: buckets.find((bucket) => bucket.key === "watch")?.rows.length ?? 0,
    protected: buckets.find((bucket) => bucket.key === "no_action")?.rows.length ?? 0,
  };
  const mutedCount = buckets.reduce((sum, bucket) => sum + bucket.mutedCount, 0);
  const previewMissing = decisionOs.creatives.filter(
    (creative) => creative.previewStatus?.liveDecisionWindow === "missing",
  ).length;

  let emphasis: OperatorAuthorityState = "no_action";
  let headline = "No material creative move is ready yet.";
  if (counts.actNow > 0) {
    emphasis = "act_now";
    headline = `${counts.actNow} creative ${counts.actNow === 1 ? "action is" : "actions are"} ready now.`;
  } else if (counts.blocked > 0) {
    emphasis = "blocked";
    headline = `${counts.blocked} creative ${counts.blocked === 1 ? "row is" : "rows are"} blocked by preview or deployment truth gaps.`;
  } else if (counts.needsTruth > 0) {
    emphasis = "needs_truth";
    headline = `${counts.needsTruth} promising ${counts.needsTruth === 1 ? "creative still needs" : "creatives still need"} truth before a stronger move.`;
  } else if (counts.watch > 0) {
    emphasis = "watch";
    headline = `${counts.watch} creative ${counts.watch === 1 ? "row stays" : "rows stay"} visible for testing, not decisive action.`;
  } else if (counts.protected > 0) {
    headline = `${counts.protected} creative ${counts.protected === 1 ? "winner stays" : "winners stay"} protected.`;
  }

  return {
    surfaceLabel: "Creative",
    heading: "Single Action Authority",
    headline,
    note:
      decisionOs.summary.message ??
      "Preview readiness gates authoritative creative action; selected range remains analysis context.",
    emphasis,
    blocker:
      emphasis === "blocked" && previewMissing > 0
        ? `${previewMissing} ${previewMissing === 1 ? "row needs" : "rows need"} trustworthy preview media.`
        : null,
    buckets,
    hiddenSummary:
      mutedCount > 0
        ? `${mutedCount} thin-signal or inactive ${mutedCount === 1 ? "creative stays" : "creatives stay"} off the headline action surface.`
        : null,
  };
}
