"use client";

import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import { cn } from "@/lib/utils";

export function shouldRenderGoogleAdsSyncProgress(
  status: GoogleAdsStatusResponse | undefined | null
) {
  if (!status || !status.connected) return false;
  const hasAssignment = (status.assignedAccountIds?.length ?? 0) > 0;
  if (!hasAssignment) return false;
  const progress = status.latestSync?.progressPercent;
  const warehouseRowCount = status.warehouse?.rowCount ?? 0;
  const pendingSurfaces = status.warehouse?.coverage?.pendingSurfaces ?? [];
  const hasStartedWarehouseBootstrap =
    warehouseRowCount === 0 ||
    pendingSurfaces.length > 0 ||
    status.state === "syncing" ||
    status.state === "paused" ||
    status.state === "partial" ||
    status.state === "advisor_not_ready" ||
    status.state === "stale" ||
    status.latestSync?.status === "pending" ||
    status.latestSync?.status === "running" ||
    status.needsBootstrap;

  return Boolean(
    hasStartedWarehouseBootstrap ||
      (typeof progress === "number" && progress < 100)
  );
}

function formatSyncCaption(status: GoogleAdsStatusResponse) {
  const latestSync = status.latestSync;
  const priorityWindow = status.priorityWindow;
  if (!latestSync && !priorityWindow) return null;

  const parts: string[] = [];
  if (status.domainReadiness?.summary) {
    parts.push(status.domainReadiness.summary);
  }
  if (priorityWindow?.isActive) {
    parts.push("Selected dates are being prepared first");
  } else if (latestSync?.phaseLabel) {
    parts.push(latestSync.phaseLabel);
  }
  const hasRecentGap = Object.values(status.operations?.recentGapCountByScope ?? {}).some(
    (count) => Number(count) > 0
  );
  if (
    status.extendedRecoveryState === "extended_recovery" &&
    status.rangeCompletionBySurface &&
    hasRecentGap
  ) {
    const recentParts = Object.entries(status.rangeCompletionBySurface).map(
      ([scope, completion]) => `${scope.replace("_daily", "")} ${completion.recent.completedDays}/${completion.recent.totalDays}`
    );
    if (recentParts.length > 0) {
      parts.push(`Recent recovery: ${recentParts.join(" • ")}`);
    }
  }
  const autoRepairStage = status.operations?.autoRepairExecutionStage;
  if (autoRepairStage === "runtime_waiting") {
    parts.push("Automatic repair waiting for updated worker");
  } else if (autoRepairStage === "planned_not_leased") {
    parts.push("Automatic repair queued, waiting for lease");
  } else if (autoRepairStage === "leased_not_completed") {
    parts.push("Automatic repair running");
  } else if (autoRepairStage === "completed_state_stale") {
    parts.push("Automatic repair succeeded, refreshing state");
  } else if (autoRepairStage === "failed" && hasRecentGap) {
    parts.push("Automatic repair failed");
  }
  if (priorityWindow?.isActive) {
    parts.push(`${priorityWindow.completedDays}/${priorityWindow.totalDays} selected days ready`);
  }
  if (latestSync?.readyThroughDate) {
    parts.push(`Ready through ${latestSync.readyThroughDate}`);
  }
  if (
    status.checkpointHealth?.resumeCapable &&
    status.checkpointHealth.latestCheckpointPhase &&
    status.checkpointHealth.lastSuccessfulPageIndex != null
  ) {
    parts.push(
      `Checkpoint ${status.checkpointHealth.latestCheckpointPhase} • Chunk ${status.checkpointHealth.lastSuccessfulPageIndex + 1}`
    );
  }
  if (status.jobHealth?.legacyRuntimeJobs) {
    parts.push("Background sync is stabilizing");
  }
  return parts.join(" • ");
}

function getTitle(status: GoogleAdsStatusResponse) {
  if (status.readinessLevel === "usable" && status.state !== "ready") {
    return "Google Ads dashboard is usable while deeper sync continues";
  }
  if (status.state === "action_required") return "Google Ads sync needs attention";
  if (status.state === "paused") return "Google Ads historical sync is paused";
  if (status.priorityWindow?.isActive) return "Preparing selected dates";
  if (status.state === "advisor_not_ready") {
    return status.operations?.fullSyncPriorityRequired
      ? "Full advisor support is being backfilled"
      : "Advisor support is still preparing";
  }
  if (status.state === "stale") return "Google Ads sync is catching up";
  if (status.state === "partial") return "Google Ads data is partially ready";
  if (status.state === "syncing") return "Google Ads historical data is syncing";
  return status.latestSync?.phaseLabel ?? "Google Ads data is ready";
}

function getDescription(status: GoogleAdsStatusResponse) {
  if (status.operations?.autoRepairExecutionStage === "runtime_waiting") {
    return "The latest Google Ads recovery logic is waiting for the durable worker to restart on the current build.";
  }
  if (status.domainReadiness?.summary) {
    return status.domainReadiness.summary;
  }
  if (status.readinessLevel === "usable" && status.state !== "ready") {
    return "Overview and campaign surfaces are ready. Advisor and deeper entity coverage are still filling in.";
  }
  if (status.state === "action_required") {
    return "Historical data paused. Existing warehouse data stays visible while sync is retried.";
  }
  if (status.state === "paused") {
    return "Historical backfill stopped progressing. Existing warehouse data stays visible until the worker resumes.";
  }
  if (status.priorityWindow?.isActive) {
    return "The selected date range is being written first so this screen can fill in sooner.";
  }
  if (status.state === "advisor_not_ready") {
    if (status.operations?.fullSyncPriorityRequired) {
      return (
        status.operations.fullSyncPriorityReason ??
        "Core Google Ads history is live. Full advisor support is being backfilled before analysis is enabled."
      );
    }
    return "Core Google Ads history is ready. Search term and product history are still filling in for advisor analysis.";
  }
  if (status.state === "partial" || status.state === "syncing" || status.state === "stale") {
    return "Ready sections will appear progressively as warehouse coverage expands.";
  }
  return "Warehouse coverage is up to date.";
}

export function GoogleAdsSyncProgress({
  status,
  variant = "default",
  className,
}: {
  status: GoogleAdsStatusResponse | undefined | null;
  variant?: "default" | "compact" | "inline";
  className?: string;
}) {
  if (!shouldRenderGoogleAdsSyncProgress(status)) return null;
  const activeStatus = status as GoogleAdsStatusResponse;

  const progress = Math.max(
    0,
    Math.min(100, Math.round(activeStatus.latestSync?.progressPercent ?? 0))
  );
  const title = getTitle(activeStatus);
  const description = getDescription(activeStatus);
  const caption = formatSyncCaption(activeStatus);

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "inline-flex min-w-[170px] max-w-[320px] items-center gap-2 rounded-lg border border-sky-200/90 bg-sky-50/90 px-2.5 py-1.5 text-[11px] text-sky-800",
          className
        )}
      >
        <span className="shrink-0 text-[11px] font-semibold tabular-nums">{progress}%</span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="truncate leading-none">{caption ?? description}</div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-sky-100">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  const compact = variant === "compact";
  if (compact) {
    return (
      <div
        className={cn(
          "rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900",
          className
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-xs font-medium">{caption ?? title}</p>
          <p className="shrink-0 text-xs font-semibold tabular-nums">{progress}%</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100">
          <div
            className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-900",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-sm text-sky-800/80">{description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-sky-900">{progress}%</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-100">
        <div
          className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      {caption ? <p className="mt-2 text-xs text-sky-800/80">{caption}</p> : null}
      {activeStatus.latestSync?.lastError &&
      (activeStatus.state === "partial" ||
        activeStatus.state === "paused" ||
        activeStatus.state === "stale" ||
        activeStatus.state === "action_required") ? (
        <p className="mt-2 text-xs text-sky-800/80">{activeStatus.latestSync.lastError}</p>
      ) : null}
    </div>
  );
}
