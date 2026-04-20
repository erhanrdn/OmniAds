import type { GoogleAdsProgressState, GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";

export type GoogleAdsSyncProgressVariant = "default" | "compact" | "inline";

export interface GoogleAdsResolvedSyncProgress {
  kind: "advisor" | "historical";
  percent: number;
  title: string;
  description: string;
  tone: "primary" | "secondary";
}

function isVisibleProgress(progress: GoogleAdsProgressState | null | undefined) {
  return Boolean(progress?.visible && typeof progress.percent === "number");
}

export function isGoogleAdsControlPlaneClosed(
  status: GoogleAdsStatusResponse | undefined | null,
) {
  if (!status || !status.connected) return false;
  if ((status.assignedAccountIds?.length ?? 0) === 0) return false;
  return (
    status.controlPlanePersistence?.exactRowsPresent === true &&
    status.releaseGate?.verdict === "pass" &&
    (status.repairPlan?.recommendations?.length ?? 0) === 0 &&
    status.blockerClass === "none"
  );
}

export function getGoogleAdsStatusRefetchInterval(
  status: GoogleAdsStatusResponse | undefined | null,
) {
  if (!status) return false;
  if (isGoogleAdsControlPlaneClosed(status)) return false;

  const state = status.state;
  const queueDepth = status.jobHealth?.queueDepth ?? 0;
  const leasedPartitions = status.jobHealth?.leasedPartitions ?? 0;
  const repairCount = status.repairPlan?.recommendations?.length ?? 0;
  const exactRowsPresent = status.controlPlanePersistence?.exactRowsPresent === true;

  if (
    state === "syncing" ||
    state === "partial" ||
    state === "advisor_not_ready"
  ) {
    return 5_000;
  }

  if (
    state === "paused" ||
    state === "stale" ||
    queueDepth > 0 ||
    leasedPartitions > 0 ||
    repairCount > 0 ||
    (exactRowsPresent && status.releaseGate?.verdict && status.releaseGate.verdict !== "pass")
  ) {
    return 10_000;
  }

  return false;
}

export function resolveGoogleAdsSyncProgress(
  status: GoogleAdsStatusResponse | undefined | null,
  variant: GoogleAdsSyncProgressVariant = "default"
): GoogleAdsResolvedSyncProgress | null {
  if (!status || !status.connected) return null;
  if ((status.assignedAccountIds?.length ?? 0) === 0) return null;
  if (isGoogleAdsControlPlaneClosed(status)) return null;

  if (
    status.requiredScopeCompletion &&
    !status.requiredScopeCompletion.complete &&
    status.platformDateBoundary?.selectedRangeMode !== "current_day_live"
  ) {
    return {
      kind: "historical",
      percent: Math.max(0, Math.min(99, Math.round(status.requiredScopeCompletion.percent))),
      title:
        variant === "inline"
          ? "Required sync continues"
          : "Required warehouse sync continues in the background",
      description:
        status.requiredScopeCompletion.readyThroughDate
          ? `Required Google Ads warehouse coverage is ready through ${status.requiredScopeCompletion.readyThroughDate}.`
          : "Required Google Ads warehouse coverage is still preparing.",
      tone: "secondary",
    };
  }

  if (isVisibleProgress(status.advisorProgress)) {
    return {
      kind: "advisor",
      percent: Math.max(0, Math.min(99, Math.round(status.advisorProgress!.percent))),
      title:
        variant === "inline"
          ? "Preparing analysis inputs"
          : "Growth analysis is preparing",
      description: status.advisorProgress!.summary,
      tone: "primary",
    };
  }

  if (isVisibleProgress(status.historicalProgress)) {
    return {
      kind: "historical",
      percent: Math.max(0, Math.min(99, Math.round(status.historicalProgress!.percent))),
      title:
        variant === "inline"
          ? "Historical sync continues"
          : "Historical sync continues in the background",
      description: status.historicalProgress!.summary,
      tone: "secondary",
    };
  }

  return null;
}

export function shouldRenderGoogleAdsSyncProgress(
  status: GoogleAdsStatusResponse | undefined | null,
  variant: GoogleAdsSyncProgressVariant = "default"
) {
  return resolveGoogleAdsSyncProgress(status, variant) !== null;
}
