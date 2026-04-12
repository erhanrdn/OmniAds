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

export const CREATIVE_QUICK_FILTER_ORDER = [
  "act_now",
  "needs_truth",
  "watch",
  "blocked",
  "no_action",
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
  act_now: {
    key: "act_now",
    label: "ACT NOW",
    summary: "Rows with ready preview truth and enough signal for a real operator move.",
    tone: "act_now",
  },
  needs_truth: {
    key: "needs_truth",
    label: "NEEDS TRUTH",
    summary: "Promising rows that cannot escalate until shared truth gaps clear.",
    tone: "needs_truth",
  },
  watch: {
    key: "watch",
    label: "KEEP TESTING",
    summary: "Visible rows that stay in test instead of reading like immediate action work.",
    tone: "watch",
  },
  blocked: {
    key: "blocked",
    label: "BLOCKED",
    summary: "Preview or deployment truth blocks clean operator action right now.",
    tone: "blocked",
  },
  no_action: {
    key: "no_action",
    label: "PROTECTED",
    summary: "Protected winners that should stay out of churn and out of the default worklist.",
    tone: "no_action",
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

export function creativeAuthorityStateLabel(state: OperatorAuthorityState) {
  if (state === "watch") return "Keep testing";
  if (state === "no_action") return "Protected";
  if (state === "act_now") return "Act now";
  if (state === "needs_truth") return "Needs truth";
  return "Blocked";
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
  if (creative.previewStatus?.liveDecisionWindow === "missing") return "Preview missing";
  if (creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded") return "Preview degraded";
  return "Preview ready";
}

function isCreativeMuted(creative: CreativeDecisionOsCreative) {
  const materiality = creative.trust.evidence?.materiality;
  return materiality === "thin_signal" || materiality === "immaterial" || creative.trust.surfaceLane === "archive_context";
}

export function resolveCreativeAuthorityState(creative: CreativeDecisionOsCreative) {
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
  if (creative.previewStatus?.liveDecisionWindow === "missing") return "Preview missing";
  if (creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded") return "Preview degraded";
  if (state === "needs_truth") return "Needs truth";
  switch (creative.primaryAction) {
    case "promote_to_scaling":
      return "Promote now";
    case "keep_in_test":
      return "Keep testing";
    case "hold_no_touch":
      return "Protect";
    case "refresh_replace":
      return "Replace now";
    case "retest_comeback":
      return "Retest";
    case "block_deploy":
      return "Blocked";
    default:
      return titleFromEnum(creative.primaryAction);
  }
}

function creativeReason(creative: CreativeDecisionOsCreative, state: OperatorAuthorityState, muted: boolean, blocker: string | null) {
  if (state === "blocked" && creative.previewStatus?.liveDecisionWindow === "missing") {
    return "Preview truth is missing, so this creative cannot headline an authoritative action yet.";
  }
  if (state === "blocked" && creative.previewStatus?.liveDecisionWindow === "metrics_only_degraded") {
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

function compactMetrics(metrics: OperatorSurfaceMetric[]) {
  return metrics.filter((metric) => Boolean(metric.value) && metric.value !== "n/a").slice(0, 5);
}

export function buildCreativeOperatorItem(creative: CreativeDecisionOsCreative): OperatorSurfaceItem {
  const authorityState = resolveCreativeAuthorityState(creative);
  const muted = isCreativeMuted(creative);
  const blocker = creativeBlocker(creative, authorityState);

  return {
    id: creative.creativeId,
    title: creative.name,
    subtitle: creative.familyLabel,
    primaryAction: creativeActionLabel(creative, authorityState),
    authorityState,
    authorityLabel: creativeAuthorityStateLabel(authorityState),
    reason: creativeReason(creative, authorityState, muted, blocker),
    blocker,
    confidence: operatorConfidenceBand(creative.confidence),
    secondaryLabels: [
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
  };
}

export function resolveCreativeQuickFilterKey(
  creative: CreativeDecisionOsCreative,
): CreativeQuickFilterKey {
  return resolveCreativeAuthorityState(creative);
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

  return CREATIVE_QUICK_FILTER_ORDER
    .map((key) => {
      const matchingCreatives = decisionOs.creatives.filter((creative) => {
        if (visibleIds && !visibleIds.has(creative.creativeId)) return false;
        return resolveCreativeQuickFilterKey(creative) === key;
      });

      return {
        ...CREATIVE_QUICK_FILTER_DEFS[key],
        count: matchingCreatives.length,
        creativeIds: matchingCreatives.map((creative) => creative.creativeId),
      } satisfies CreativeQuickFilter;
    })
    .filter((filter) => includeZeroCounts || filter.count > 0);
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
      watch: "Keep testing",
      blocked: "Blocked",
      no_action: "Protected",
    },
    summaries: {
      act_now: "Rows with enough signal and ready preview truth for a clear operator move.",
      needs_truth: "Rows that look promising but are still capped by missing shared truth.",
      watch: "Rows that stay in test and should not read like execute-now work.",
      blocked: "Rows held back by preview truth, deployment compatibility, or hard creative constraints.",
      no_action: "Rows that should stay protected instead of being pushed back into churn.",
    },
    order: ["act_now", "needs_truth", "watch", "blocked", "no_action"],
  });

  const counts = {
    actNow: buckets.find((bucket) => bucket.key === "act_now")?.rows.length ?? 0,
    needsTruth: buckets.find((bucket) => bucket.key === "needs_truth")?.rows.length ?? 0,
    blocked: buckets.find((bucket) => bucket.key === "blocked")?.rows.length ?? 0,
    watch: buckets.find((bucket) => bucket.key === "watch")?.rows.length ?? 0,
    protected: buckets.find((bucket) => bucket.key === "no_action")?.rows.length ?? 0,
  };
  const mutedCount = buckets.reduce((sum, bucket) => sum + bucket.mutedCount, 0);
  const previewMissing = creatives.filter(
    (creative) => creative.previewStatus?.liveDecisionWindow === "missing",
  ).length;

  let emphasis: OperatorAuthorityState = "no_action";
  let headline = "No material creative move is ready yet.";
  if (counts.actNow > 0) {
    emphasis = "act_now";
    headline = `${counts.actNow} creative ${counts.actNow === 1 ? "action is" : "actions are"} clear now.`;
  } else if (counts.needsTruth > 0) {
    emphasis = "needs_truth";
    headline = `${counts.needsTruth} promising ${counts.needsTruth === 1 ? "creative still needs" : "creatives still need"} truth before a stronger move.`;
  } else if (counts.watch > 0) {
    emphasis = "watch";
    headline = `${counts.watch} creative ${counts.watch === 1 ? "row stays" : "rows stay"} in test for now.`;
  } else if (counts.blocked > 0) {
    emphasis = "blocked";
    headline = `${counts.blocked} creative ${counts.blocked === 1 ? "row is" : "rows are"} blocked by preview or deployment truth gaps.`;
  } else if (counts.protected > 0) {
    headline = `${counts.protected} creative ${counts.protected === 1 ? "winner stays" : "winners stay"} protected.`;
  }

  return {
    surfaceLabel: "Creative",
    heading: "Single Action Authority",
    headline,
    note: previewTruth
      ? `${previewTruth.summary} ${decisionOs.summary.message ?? "Selected range remains analysis context only."}`
      : decisionOs.summary.message ??
        "Preview readiness gates authoritative creative action; selected range remains analysis context.",
    emphasis,
    authorityLabels: {
      act_now: "Act now",
      needs_truth: "Needs truth",
      watch: "Keep testing",
      blocked: "Blocked",
      no_action: "Protected",
    },
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
