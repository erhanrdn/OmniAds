import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";

export interface GoogleAdsStatusDecisionInput {
  connected: boolean;
  assignedAccountCount: number;
  historicalQueuePaused: boolean;
  deadLetterPartitions: number;
  latestSyncStatus?: string | null;
  runningJobs: number;
  staleRunningJobs: number;
  selectedRangeIncomplete: boolean;
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

export function decideGoogleAdsAdvisorReadiness(
  input: Pick<
    GoogleAdsStatusDecisionInput,
    | "connected"
    | "assignedAccountCount"
    | "selectedRangeTotalDays"
    | "advisorMissingSurfaces"
    | "deadLetterPartitions"
    | "supportWindowMissingCount"
  > & {
    historicalProgressPercent: number;
    selectedRangeIncomplete: boolean;
  }
): GoogleAdsAdvisorDecision {
  const ready =
    input.connected &&
    input.assignedAccountCount > 0 &&
    input.selectedRangeTotalDays != null &&
    input.advisorMissingSurfaces.length === 0 &&
    (input.supportWindowMissingCount ?? 0) === 0 &&
    input.deadLetterPartitions === 0;

  const notReady =
    input.connected &&
    input.assignedAccountCount > 0 &&
    input.selectedRangeTotalDays != null &&
    !input.selectedRangeIncomplete &&
    input.historicalProgressPercent >= 100 &&
    !ready;

  return {
    ready,
    notReady,
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
  if (input.deadLetterPartitions > 0) return "action_required";
  if (input.latestSyncStatus === "failed" && input.runningJobs === 0) return "action_required";
  if (input.staleRunningJobs > 0) return "stale";
  if (input.advisorNotReady) return "advisor_not_ready";
  if (!input.selectedRangeIncomplete && input.historicalProgressPercent >= 100) return "ready";
  if (
    input.latestSyncStatus === "running" ||
    input.runningJobs > 0 ||
    input.needsBootstrap ||
    input.selectedRangeIncomplete
  ) {
    return "syncing";
  }
  if (input.productPendingSurfaces.length > 0) return "partial";
  return "ready";
}
