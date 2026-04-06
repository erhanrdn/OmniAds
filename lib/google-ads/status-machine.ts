import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";

export interface GoogleAdsStatusDecisionInput {
  connected: boolean;
  assignedAccountCount: number;
  coreUsable: boolean;
  historicalQueuePaused: boolean;
  deadLetterPartitions: number;
  advisorRelevantDeadLetterPartitions?: number;
  advisorRelevantUnhealthyLeases?: number;
  advisorRelevantFailedPartitions?: number;
  latestSyncStatus?: string | null;
  runningJobs: number;
  staleRunningJobs: number;
  selectedRangeCoreIncomplete: boolean;
  visibleSelectedRangePendingSurfaces: string[];
  historicalProgressPercent: number;
  needsBootstrap: boolean;
  productPendingSurfaces: string[];
  selectedRangeTotalDays: number | null;
  advisorMissingSurfaces: string[];
  supportWindowMissingCount?: number;
}

export interface GoogleAdsAdvisorDecision {
  ready: boolean;
  notReady: boolean;
}

export interface GoogleAdsFullSyncPriorityDecision {
  required: boolean;
  reason: string | null;
  targetScopes: string[];
}

export function decideGoogleAdsAdvisorReadiness(
  input: Pick<
    GoogleAdsStatusDecisionInput,
    | "connected"
    | "assignedAccountCount"
    | "deadLetterPartitions"
  > & {
    recent90Ready: boolean;
    snapshotAvailable: boolean;
  }
): GoogleAdsAdvisorDecision {
  const ready =
    input.connected &&
    input.assignedAccountCount > 0 &&
    input.recent90Ready;

  const notReady =
    input.connected &&
    input.assignedAccountCount > 0 &&
    !input.recent90Ready &&
    !ready;

  return {
    ready,
    notReady,
  };
}

export function decideGoogleAdsFullSyncPriority(input: {
  advisorReady: boolean;
  advisorMissingSurfaces: string[];
}) : GoogleAdsFullSyncPriorityDecision {
  const targetScopes = input.advisorMissingSurfaces.filter((scope) =>
    ["search_term_daily", "product_daily", "asset_daily"].includes(scope)
  );
  const primaryBlocker = targetScopes.some(
    (scope) => scope === "search_term_daily" || scope === "product_daily"
  );
  const required = !input.advisorReady && primaryBlocker;

  return {
    required,
    reason: required
      ? "Advisor blocked by missing extended historical support; prioritizing full sync."
      : null,
    targetScopes,
  };
}

export function decideGoogleAdsStatusState(
  input: GoogleAdsStatusDecisionInput & {
    advisorNotReady: boolean;
  }
): GoogleAdsStatusResponse["state"] {
  if (!input.connected) return "not_connected";
  if (input.assignedAccountCount === 0) return "connected_no_assignment";
  if (input.historicalQueuePaused) return "paused";
  if ((input.advisorRelevantDeadLetterPartitions ?? 0) > 0) return "action_required";
  if ((input.advisorRelevantFailedPartitions ?? 0) > 0) return "action_required";
  if ((input.advisorRelevantUnhealthyLeases ?? 0) > 0) return "action_required";
  if (input.latestSyncStatus === "failed" && input.runningJobs === 0) return "action_required";
  if (input.staleRunningJobs > 0) return "stale";
  if (
    input.latestSyncStatus === "running" ||
    input.runningJobs > 0 ||
    input.needsBootstrap ||
    !input.coreUsable ||
    input.selectedRangeCoreIncomplete
  ) {
    return "syncing";
  }
  if (input.visibleSelectedRangePendingSurfaces.length > 0) return "partial";
  if (input.advisorNotReady) return "advisor_not_ready";
  if (
    input.productPendingSurfaces.length > 0 &&
    input.historicalProgressPercent < 100
  ) {
    return "partial";
  }
  return "ready";
}
