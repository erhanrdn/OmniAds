"use client";

import type { MetaStatusResponse } from "@/lib/meta/status-types";
import { cn } from "@/lib/utils";

export function shouldRenderMetaSyncProgress(
  status: MetaStatusResponse | undefined | null
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
    status.state === "partial" ||
    status.latestSync?.status === "pending" ||
    status.latestSync?.status === "running" ||
    status.needsBootstrap;
  return Boolean(
    hasStartedWarehouseBootstrap ||
      (typeof progress === "number" && progress < 100)
  );
}

function formatSyncCaption(status: MetaStatusResponse, language: "en" | "tr") {
  const latestSync = status.latestSync;
  if (!latestSync) return null;

  const parts: string[] = [];
  if (latestSync.phaseLabel) parts.push(latestSync.phaseLabel);
  if (typeof latestSync.completedDays === "number" && typeof latestSync.totalDays === "number") {
    parts.push(
      language === "tr"
        ? `${latestSync.completedDays}/${latestSync.totalDays} gün`
        : `${latestSync.completedDays}/${latestSync.totalDays} days`
    );
  }
  if (latestSync.readyThroughDate) {
    parts.push(
      language === "tr"
        ? `Hazır: ${latestSync.readyThroughDate}`
        : `Ready through ${latestSync.readyThroughDate}`
    );
  }
  return parts.join(" • ");
}

export function MetaSyncProgress({
  status,
  language = "en",
  variant = "default",
  className,
}: {
  status: MetaStatusResponse | undefined | null;
  language?: "en" | "tr";
  variant?: "default" | "compact" | "inline";
  className?: string;
}) {
  if (!shouldRenderMetaSyncProgress(status)) return null;
  const activeStatus = status as MetaStatusResponse;

  const progress = Math.max(
    0,
    Math.min(100, Math.round(activeStatus.latestSync?.progressPercent ?? 0))
  );
  const title =
    activeStatus.state === "partial"
      ? language === "tr"
        ? "Meta verileri kısmen hazır"
        : "Meta data is partially ready"
      : language === "tr"
        ? "Meta geçmiş verileri senkronize ediliyor"
        : "Meta historical data is syncing";
  const description =
    language === "tr"
      ? "Hazır bölümler kademeli olarak açılacak."
      : "Ready sections will appear progressively.";
  const caption = formatSyncCaption(activeStatus, language);

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "inline-flex min-w-[220px] items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800",
          className
        )}
      >
        <span className="shrink-0 font-semibold tabular-nums">{progress}%</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px]">{caption ?? description}</div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
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
          "rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900",
          className
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-xs font-medium">{caption ?? title}</p>
          <p className="shrink-0 text-xs font-semibold tabular-nums">{progress}%</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-blue-200 bg-blue-50 text-blue-900",
        "p-4",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-semibold", compact ? "text-sm" : "text-sm")}>{title}</p>
          <p className={cn("mt-0.5 text-blue-800/80", compact ? "text-xs" : "text-sm")}>
            {description}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("font-semibold tabular-nums text-blue-900", compact ? "text-sm" : "text-lg")}>
            {progress}%
          </p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      {caption ? (
        <p className={cn("mt-2 text-blue-800/80", compact ? "text-[11px]" : "text-xs")}>{caption}</p>
      ) : null}
      {activeStatus.latestSync?.lastError && activeStatus.state === "partial" ? (
        <p className={cn("mt-2 text-blue-800/80", compact ? "text-[11px]" : "text-xs")}>
          {activeStatus.latestSync.lastError}
        </p>
      ) : null}
    </div>
  );
}
