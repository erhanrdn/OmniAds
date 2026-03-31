"use client";

import type { GoogleAdsStatusResponse } from "@/lib/google-ads/status-types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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
  if (
    typeof latestSync?.completedDays === "number" &&
    typeof latestSync?.totalDays === "number" &&
    latestSync.totalDays > 0
  ) {
    parts.push(`${latestSync.completedDays}/${latestSync.totalDays} days`);
  }
  if (latestSync?.readyThroughDate) {
    parts.push(`Ready through ${latestSync.readyThroughDate}`);
  }
  if (status.warehouse?.firstDate && status.state !== "ready") {
    parts.push(`Oldest stored date: ${status.warehouse.firstDate}`);
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

function getTone(status: GoogleAdsStatusResponse) {
  if (status.state === "action_required") {
    return {
      border: "border-amber-200",
      bg: "bg-amber-50",
      track: "bg-amber-100",
      fill: "bg-amber-500",
      text: "text-amber-950",
      subtext: "text-amber-800/85",
      detail: "text-amber-900/90",
    };
  }
  if (status.state === "paused") {
    return {
      border: "border-slate-200",
      bg: "bg-slate-50",
      track: "bg-slate-200",
      fill: "bg-slate-500",
      text: "text-slate-900",
      subtext: "text-slate-700/85",
      detail: "text-slate-800/90",
    };
  }
  if (status.state === "advisor_not_ready" || status.state === "partial") {
    return {
      border: "border-blue-200",
      bg: "bg-blue-50",
      track: "bg-blue-100",
      fill: "bg-blue-500",
      text: "text-blue-950",
      subtext: "text-blue-800/85",
      detail: "text-blue-900/90",
    };
  }
  return {
    border: "border-sky-200",
    bg: "bg-sky-50",
    track: "bg-sky-100",
    fill: "bg-sky-500",
    text: "text-sky-950",
    subtext: "text-sky-800/85",
    detail: "text-sky-900/90",
  };
}

export function GoogleAdsSyncProgressSkeleton({
  variant = "default",
  className,
}: {
  variant?: "default" | "compact" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <div
        className={cn(
          "inline-flex min-w-[170px] max-w-[320px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5",
          className
        )}
      >
        <Skeleton className="h-4 w-10 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-36 rounded-md" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3",
          className
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-36 rounded-md" />
            <Skeleton className="h-6 w-full rounded-md" />
          </div>
          <Skeleton className="h-3.5 w-10 rounded-md" />
        </div>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-slate-50 p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-44 rounded-md" />
          <Skeleton className="h-3 w-56 rounded-md" />
        </div>
        <Skeleton className="h-6 w-12 rounded-md" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-3 w-44 rounded-md" />
      </div>
    </div>
  );
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
  const tone = getTone(activeStatus);

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "inline-flex min-w-[170px] max-w-[320px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]",
          tone.border,
          tone.bg,
          tone.detail,
          className
        )}
      >
        <span className="shrink-0 text-[11px] font-semibold tabular-nums">{progress}%</span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="truncate leading-none">{caption ?? description}</div>
          <div className={cn("mt-1 h-1 overflow-hidden rounded-full", tone.track)}>
            <div
              className={cn("h-full rounded-full transition-[width] duration-300", tone.fill)}
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
          "rounded-xl border px-3.5 py-3",
          tone.border,
          tone.bg,
          tone.text,
          className
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{title}</p>
            <p className={cn("mt-1 line-clamp-2 text-[11px] leading-4", tone.subtext)}>
              {caption ?? description}
            </p>
          </div>
          <p className="shrink-0 text-xs font-semibold tabular-nums">{progress}%</p>
        </div>
        <div className={cn("mt-3 h-1.5 overflow-hidden rounded-full", tone.track)}>
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", tone.fill)}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone.border,
        tone.bg,
        tone.text,
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className={cn("mt-0.5 text-sm", tone.subtext)}>{description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-lg font-semibold tabular-nums", tone.text)}>{progress}%</p>
        </div>
      </div>
      <div className={cn("mt-3 h-2 overflow-hidden rounded-full", tone.track)}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", tone.fill)}
          style={{ width: `${progress}%` }}
        />
      </div>
      {caption ? <p className={cn("mt-2 text-xs", tone.subtext)}>{caption}</p> : null}
      {activeStatus.latestSync?.lastError &&
      (activeStatus.state === "partial" ||
        activeStatus.state === "paused" ||
        activeStatus.state === "stale" ||
        activeStatus.state === "action_required") ? (
        <p className={cn("mt-2 text-xs", tone.subtext)}>{activeStatus.latestSync.lastError}</p>
      ) : null}
    </div>
  );
}
