"use client";

import { cn } from "@/lib/utils";
import type { BusinessCommercialCoverageSummary } from "@/src/types/business-commercial";
import type { DecisionSurfaceAuthority } from "@/src/types/decision-trust";

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatMaybeNumber(value: number | null, suffix = "") {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `${value}${suffix}`;
}

function resolvePanelTone(
  authority: DecisionSurfaceAuthority | null | undefined,
  commercialSummary: BusinessCommercialCoverageSummary | null | undefined,
) {
  if (authority?.truthState === "live_confident" && commercialSummary?.freshness.status === "fresh") {
    return "border-emerald-200 bg-emerald-50/80 text-emerald-950";
  }
  if (authority?.truthState === "inactive_or_immaterial") {
    return "border-slate-200 bg-slate-50 text-slate-900";
  }
  return "border-amber-200 bg-amber-50/90 text-amber-950";
}

function resolveStatusTone(kind: "truth" | "completeness" | "freshness", value: string) {
  if (kind === "truth") {
    if (value === "live_confident") return "border-emerald-200 bg-emerald-100 text-emerald-800";
    if (value === "inactive_or_immaterial") return "border-slate-200 bg-slate-100 text-slate-700";
    return "border-amber-200 bg-amber-100 text-amber-800";
  }
  if (kind === "freshness") {
    if (value === "fresh") return "border-emerald-200 bg-emerald-100 text-emerald-800";
    if (value === "stale") return "border-amber-200 bg-amber-100 text-amber-800";
    return "border-slate-200 bg-slate-100 text-slate-700";
  }
  if (value === "complete") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (value === "partial") return "border-amber-200 bg-amber-100 text-amber-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export function DecisionAuthorityPanel({
  authority,
  commercialSummary,
  title = "Decision Authority",
  className,
}: {
  authority?: DecisionSurfaceAuthority | null;
  commercialSummary?: BusinessCommercialCoverageSummary | null;
  title?: string;
  className?: string;
}) {
  if (!authority && !commercialSummary) return null;

  const thresholds = commercialSummary?.thresholds;
  const blockingReasons = Array.from(
    new Set([
      ...(authority?.missingInputs ?? []),
      ...(commercialSummary?.blockingReasons ?? []),
    ]),
  );
  const actionCeilings = Array.from(
    new Set([
      ...(commercialSummary?.actionCeilings ?? []),
    ]),
  );
  const thresholdPills = thresholds
    ? [
        `Target ROAS ${formatMaybeNumber(thresholds.targetRoas, "x")}`,
        `Break-even ROAS ${formatMaybeNumber(thresholds.breakEvenRoas, "x")}`,
        `Target CPA ${formatMaybeNumber(thresholds.targetCpa)}`,
        `Break-even CPA ${formatMaybeNumber(thresholds.breakEvenCpa)}`,
        `Risk ${thresholds.defaultRiskPosture}`,
      ]
    : [];

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        resolvePanelTone(authority, commercialSummary),
        className,
      )}
      data-testid="decision-authority-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
            {title}
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {authority?.note ??
              commercialSummary?.freshness.reason ??
              "Commercial thresholds and action ceilings are explicit for this surface."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {authority?.truthState ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                resolveStatusTone("truth", authority.truthState),
              )}
            >
              {formatLabel(authority.truthState)}
            </span>
          ) : null}
          {commercialSummary?.completeness ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                resolveStatusTone("completeness", commercialSummary.completeness),
              )}
            >
              completeness {commercialSummary.completeness}
            </span>
          ) : null}
          {commercialSummary?.freshness.status ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                resolveStatusTone("freshness", commercialSummary.freshness.status),
              )}
            >
              freshness {commercialSummary.freshness.status}
            </span>
          ) : null}
        </div>
      </div>

      {thresholdPills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {thresholdPills.map((item) => (
            <span
              key={item}
              className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}

      {(authority || commercialSummary) ? (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-current/10 bg-white/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
              Surface Counts
            </p>
            <p className="mt-1 text-xs">
              Action core {authority?.actionCoreCount ?? 0} · watchlist {authority?.watchlistCount ?? 0} · archive {authority?.archiveCount ?? 0}
            </p>
            <p className="mt-1 text-xs">Suppressed {authority?.suppressedCount ?? 0}</p>
          </div>
          <div className="rounded-xl border border-current/10 bg-white/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
              Action Ceilings
            </p>
            <p className="mt-1 text-xs">
              {actionCeilings.length > 0
                ? actionCeilings.map((item) => formatLabel(item)).join(", ")
                : "No active ceiling"}
            </p>
          </div>
          <div className="rounded-xl border border-current/10 bg-white/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
              Calibration
            </p>
            <p className="mt-1 text-xs">
              {commercialSummary?.calibration.profileCount ?? 0} profile
              {(commercialSummary?.calibration.profileCount ?? 0) === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs">
              {(commercialSummary?.calibration.channels ?? []).length > 0
                ? commercialSummary?.calibration.channels.join(", ")
                : "No calibration profiles"}
            </p>
          </div>
        </div>
      ) : null}

      {blockingReasons.length > 0 ? (
        <div className="mt-3 rounded-xl border border-current/10 bg-white/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
            Blocking Reasons
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {blockingReasons.join(" · ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
