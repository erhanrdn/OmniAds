import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";

export type GoogleAdsAdvisorCtaState = "ready" | "refreshable" | "blocked";

function getAdvisorBlockedCopy(
  status: GoogleAdsStatusResponse | undefined
): string {
  if (!status) {
    return "Analysis readiness is still being checked.";
  }

  if (!status.connected) {
    return "Connect a Google Ads account to unlock growth analysis.";
  }

  if ((status.assignedAccountIds?.length ?? 0) === 0) {
    return "Assign a Google Ads account to prepare growth analysis.";
  }

  if (status.operations?.fullSyncPriorityRequired) {
    return "Core metrics are live. Deeper analysis will unlock after recent support finishes syncing.";
  }

  switch (status.operations?.advisorSnapshotBlockedReason) {
    case "recent90_incomplete":
      return "Search term and product history are still being prepared. Analysis will unlock automatically.";
    case "dead_letter_partitions":
      return "Some analysis inputs need recovery before insights can open.";
    case "snapshot_missing":
      return "Analysis is being prepared for this account.";
    default:
      return (
        status.advisor?.blockingMessage ??
        "Analysis is being prepared for this account."
      );
  }
}

export function getGoogleAdsAdvisorCtaState(input: {
  status: GoogleAdsStatusResponse | undefined;
  canOpen: boolean;
  hasCurrentAnalysis: boolean;
}): GoogleAdsAdvisorCtaState {
  if (!input.canOpen) return "blocked";
  return input.hasCurrentAnalysis ? "refreshable" : "ready";
}

export function getGoogleAdsAdvisorButtonLabel(input: {
  isLoading: boolean;
  ctaState: GoogleAdsAdvisorCtaState;
}): string {
  if (input.isLoading) return "Refreshing analysis...";
  switch (input.ctaState) {
    case "refreshable":
      return "Refresh Analysis";
    case "blocked":
      return "Analysis Preparing";
    case "ready":
    default:
      return "View Growth Analysis";
  }
}

export function getGoogleAdsAdvisorHelperText(input: {
  status: GoogleAdsStatusResponse | undefined;
  ctaState: GoogleAdsAdvisorCtaState;
  advisorIsStale: boolean;
  lastAnalyzedLabel: string | null;
}): string {
  if (input.ctaState === "blocked") {
    return getAdvisorBlockedCopy(input.status);
  }

  if (input.advisorIsStale) {
    return "A newer analysis is available in the background.";
  }

  if (input.lastAnalyzedLabel) {
    return `Analysis updated ${input.lastAnalyzedLabel}`;
  }

  return "Uses the canonical 90-day growth analysis. The date picker only changes dashboard context.";
}

export function getGoogleAdsAdvisorIdleState(
  status: GoogleAdsStatusResponse | undefined
): {
  title: string;
  description: string;
} {
  if (!status) {
    return {
      title: "Analysis is preparing",
      description: "Analysis readiness is still being checked.",
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
    return {
      title: "Growth analysis is ready",
      description:
        status.operations?.advisorSnapshotFresh === false
          ? "The current analysis is available, and a backend refresh can update it."
          : "The canonical 90-day growth analysis is ready.",
    };
  }
  if (status.operations?.fullSyncPriorityRequired) {
    return {
      title: "Deeper analysis is still syncing",
      description:
        "Core campaign reporting is live. Search term and product history are still being prepared for analysis.",
    };
  }
  return {
    title: "Analysis is preparing",
    description: getAdvisorBlockedCopy(status),
  };
}
