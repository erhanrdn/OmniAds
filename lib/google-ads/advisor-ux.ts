import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";

export type GoogleAdsAdvisorCtaState = "open" | "prepare" | "refreshable" | "blocked";

const GOOGLE_ADVISOR_HARD_BLOCK_REASONS = new Set([
  "dead_letter_partitions",
  "recent_required_dead_letter_partitions",
  "recent_required_failed_partitions",
  "recent_required_unhealthy_leases",
]);

export function canOpenGoogleAdsAdvisor(input: {
  connected: boolean;
  assignedAccountCount: number;
  advisorSnapshotReady?: boolean;
  advisorSnapshotBlockedReason?: string | null;
  fullSyncPriorityRequired?: boolean;
  advisorMissingSurfaces?: string[];
}) {
  if (!input.connected || input.assignedAccountCount <= 0) return false;
  if (input.advisorSnapshotReady) return true;
  if (input.fullSyncPriorityRequired) return false;
  if (GOOGLE_ADVISOR_HARD_BLOCK_REASONS.has(input.advisorSnapshotBlockedReason ?? "")) {
    return false;
  }
  return (input.advisorMissingSurfaces?.length ?? 0) === 0;
}

function getAdvisorBlockedCopy(
  status: GoogleAdsStatusResponse | undefined,
  options?: {
    isStatusLoading?: boolean;
    isStatusError?: boolean;
  }
): string {
  if (options?.isStatusError) {
    return "Analysis status could not be loaded. Retry the sync status check.";
  }

  if (!status) {
    return "Analysis readiness is still being checked.";
  }

  if (status.operations?.statusDegraded) {
    return (
      status.operations.statusDegradedReason ??
      "Analysis status is temporarily degraded. Retry the sync status check."
    );
  }

  if (!status.connected) {
    return "Connect a Google Ads account to unlock growth analysis.";
  }

  if ((status.assignedAccountIds?.length ?? 0) === 0) {
    return "Assign a Google Ads account to prepare growth analysis.";
  }

  if (status.operations?.fullSyncPriorityRequired) {
    return "Core metrics are live. Campaign, search term, and product history are still syncing for the 90-day decision snapshot.";
  }

  switch (status.operations?.advisorSnapshotBlockedReason) {
    case "recent90_incomplete":
    case "missing_recent_required_surfaces":
      return "Campaign, search term, and product history are still being prepared for the 90-day decision snapshot.";
    case "dead_letter_partitions":
    case "recent_required_dead_letter_partitions":
    case "recent_required_failed_partitions":
    case "recent_required_unhealthy_leases":
      return "Some analysis inputs need recovery before insights can open.";
    case "snapshot_missing":
      return "Recent 90-day support is ready. Prepare the decision snapshot when you want to review it.";
    default:
      return (
        status.advisor?.blockingMessage ??
        "Campaign, search term, and product history are still being prepared for the 90-day decision snapshot."
      );
  }
}

export function getGoogleAdsAdvisorCtaState(input: {
  status: GoogleAdsStatusResponse | undefined;
  canOpen: boolean;
  hasCurrentAnalysis: boolean;
  snapshotReady?: boolean;
}): GoogleAdsAdvisorCtaState {
  if (!input.canOpen) return "blocked";
  if (input.hasCurrentAnalysis) return "refreshable";
  return input.snapshotReady ? "open" : "prepare";
}

export function getGoogleAdsAdvisorButtonLabel(input: {
  isLoading: boolean;
  ctaState: GoogleAdsAdvisorCtaState;
}): string {
  if (input.isLoading) return "Refreshing 90-day decision snapshot...";
  switch (input.ctaState) {
    case "prepare":
      return "Prepare Decision Snapshot";
    case "refreshable":
      return "Refresh Decision Snapshot";
    case "blocked":
      return "Decision Snapshot Unavailable";
    case "open":
    default:
      return "Open Decision Snapshot";
  }
}

export function getGoogleAdsAdvisorHelperText(input: {
  status: GoogleAdsStatusResponse | undefined;
  ctaState: GoogleAdsAdvisorCtaState;
  advisorIsStale: boolean;
  lastAnalyzedLabel: string | null;
  isStatusLoading?: boolean;
  isStatusError?: boolean;
}): string {
  if (input.ctaState === "blocked") {
    return getAdvisorBlockedCopy(input.status, {
      isStatusLoading: input.isStatusLoading,
      isStatusError: input.isStatusError,
    });
  }

  if (input.advisorIsStale) {
    return "A newer analysis is available in the background.";
  }

  if (input.lastAnalyzedLabel) {
    return `Decision snapshot updated ${input.lastAnalyzedLabel}`;
  }

  return "Uses a multi-window decision snapshot backed by recent 90-day support. The date picker only changes contextual dashboard views.";
}

export function getGoogleAdsAdvisorIdleState(
  status: GoogleAdsStatusResponse | undefined,
  options?: {
    isStatusLoading?: boolean;
    isStatusError?: boolean;
  }
): {
  title: string;
  description: string;
} {
  if (options?.isStatusError) {
    return {
      title: "Analysis status is unavailable",
      description: "Analysis status could not be loaded. Retry the sync status check.",
    };
  }
  if (!status) {
    return {
      title: "Analysis is preparing",
      description: "Analysis readiness is still being checked.",
    };
  }
  if (status.operations?.statusDegraded) {
    return {
      title: "Analysis status is degraded",
      description:
        status.operations.statusDegradedReason ??
        "Analysis status is temporarily degraded. Retry the sync status check.",
    };
  }
  if (!status.connected) {
    return {
      title: "Growth analysis is unavailable",
      description: "Connect a Google Ads account to unlock growth analysis.",
    };
  }
  if ((status.assignedAccountIds?.length ?? 0) === 0) {
    return {
      title: "Growth analysis is unavailable",
      description: "Assign a Google Ads account to prepare growth analysis.",
    };
  }
  if (status.advisor?.ready) {
    if (status.operations?.advisorSnapshotReady === false) {
      return {
        title: "Decision snapshot can be prepared",
        description:
          "Campaign, search term, and product history are ready for the 90-day decision snapshot. Generate it when you want to review it.",
      };
    }
    return {
      title: "Growth analysis is ready",
      description:
        status.operations?.advisorSnapshotFresh === false
          ? "The current decision snapshot is available, and a backend refresh can update it."
          : "The multi-window decision snapshot is ready.",
    };
  }
  if (status.operations?.fullSyncPriorityRequired) {
    return {
      title: "Deeper analysis is still syncing",
      description:
        "Core campaign reporting is live. Campaign, search term, and product history are still syncing for the 90-day decision snapshot.",
    };
  }
  return {
    title: "Analysis is preparing",
    description: getAdvisorBlockedCopy(status, options),
  };
}
