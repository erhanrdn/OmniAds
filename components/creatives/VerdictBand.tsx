"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Scissors,
  Search,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type {
  CreativeAction,
  CreativeBlockerReason,
  CreativeReason,
  CreativeReasonTag,
  CreativeVerdict,
} from "@/lib/creative-verdict";
import { cn } from "@/lib/utils";

export interface VerdictBandProps {
  verdict: CreativeVerdict;
  onAction?: (action: CreativeAction) => void;
  size?: "compact" | "full";
}

export interface VerdictWhyProps {
  verdict: CreativeVerdict;
  className?: string;
}

type ActionTone = "emerald" | "rose" | "amber" | "slate" | "sky" | "orange";

interface ActionConfig {
  label: string;
  shortLabel: string;
  reviewLabel: string;
  Icon: LucideIcon;
  tone: ActionTone;
}

const ACTION_CONFIG: Record<CreativeAction, ActionConfig> = {
  scale: {
    label: "Promote to Scale",
    shortLabel: "Ready to Scale",
    reviewLabel: "Promote to Scale (review)",
    Icon: TrendingUp,
    tone: "emerald",
  },
  cut: {
    label: "Cut Now",
    shortLabel: "Cut Now",
    reviewLabel: "Cut Now (review)",
    Icon: Scissors,
    tone: "rose",
  },
  refresh: {
    label: "Refresh Creative",
    shortLabel: "Refresh Required",
    reviewLabel: "Refresh Creative (review)",
    Icon: RefreshCw,
    tone: "amber",
  },
  protect: {
    label: "Keep Active",
    shortLabel: "Keep Active",
    reviewLabel: "Keep Active (review)",
    Icon: ShieldCheck,
    tone: "slate",
  },
  keep_testing: {
    label: "Continue Testing",
    shortLabel: "Continue Testing",
    reviewLabel: "Continue Testing (review)",
    Icon: Search,
    tone: "sky",
  },
  diagnose: {
    label: "Investigate",
    shortLabel: "Investigate",
    reviewLabel: "Investigate (review)",
    Icon: AlertTriangle,
    tone: "orange",
  },
};

const PHASE_CONFIG = {
  test: {
    label: "TEST",
    classes: "border-sky-200 bg-sky-50 text-sky-800",
  },
  scale: {
    label: "SCALE",
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  "post-scale": {
    label: "POST-SCALE",
    classes: "border-amber-200 bg-amber-50 text-amber-800",
  },
  unknown: {
    label: "NEEDS ANALYSIS",
    classes: "border-amber-200 bg-amber-50 text-amber-800",
  },
} as const;

const ACTION_BAND_CLASSES: Record<ActionTone, string> = {
  emerald: "border-l-emerald-500 bg-emerald-50/60",
  rose: "border-l-rose-500 bg-rose-50/60",
  amber: "border-l-amber-500 bg-amber-50/60",
  slate: "border-l-slate-400 bg-slate-50",
  sky: "border-l-sky-500 bg-sky-50/60",
  orange: "border-l-orange-500 bg-orange-50/60",
};

const ACTION_SOLID_BUTTON_CLASSES: Record<ActionTone, string> = {
  emerald: "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700",
  rose: "border-rose-700 bg-rose-600 text-white hover:bg-rose-700",
  amber: "border-amber-700 bg-amber-600 text-white hover:bg-amber-700",
  slate: "border-slate-700 bg-slate-700 text-white hover:bg-slate-800",
  sky: "border-sky-700 bg-sky-600 text-white hover:bg-sky-700",
  orange: "border-orange-700 bg-orange-600 text-white hover:bg-orange-700",
};

const ACTION_OUTLINE_BUTTON_CLASSES: Record<ActionTone, string> = {
  emerald: "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50",
  rose: "border-rose-200 bg-white text-rose-800 hover:bg-rose-50",
  amber: "border-amber-200 bg-white text-amber-800 hover:bg-amber-50",
  slate: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  sky: "border-sky-200 bg-white text-sky-800 hover:bg-sky-50",
  orange: "border-orange-200 bg-white text-orange-800 hover:bg-orange-50",
};

const ACTIONS_WITH_SOLID_READY_BUTTON = new Set<CreativeAction>([
  "scale",
  "cut",
  "refresh",
]);

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getVerdictActionConfig(action: CreativeAction) {
  return ACTION_CONFIG[action];
}

export function getVerdictActionButtonLabel(verdict: CreativeVerdict) {
  const config = getVerdictActionConfig(verdict.action);
  if (verdict.actionReadiness === "needs_review") return config.reviewLabel;
  return config.label;
}

function phaseConfig(verdict: CreativeVerdict) {
  return verdict.phase ? PHASE_CONFIG[verdict.phase] : PHASE_CONFIG.unknown;
}

function blockerTitle(blockers: CreativeBlockerReason[]) {
  if (blockers.length === 0) return "Action is blocked.";
  return `Blocked: ${blockers.map(humanize).join(", ")}`;
}

function buttonClasses(verdict: CreativeVerdict, config: ActionConfig) {
  if (verdict.actionReadiness === "blocked") {
    return "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400";
  }
  if (
    verdict.actionReadiness === "ready" &&
    ACTIONS_WITH_SOLID_READY_BUTTON.has(verdict.action)
  ) {
    return ACTION_SOLID_BUTTON_CLASSES[config.tone];
  }
  return ACTION_OUTLINE_BUTTON_CLASSES[config.tone];
}

function evidenceLabel(tag: CreativeReasonTag) {
  if (tag === "above_break_even") return "Above break-even";
  if (tag === "below_break_even") return "Below break-even";
  if (tag === "near_break_even") return "Near break-even";
  if (tag === "large_spend_scale_phase") return "Large spend scale phase";
  if (tag === "scale_maturity") return "Mature evidence";
  if (tag === "test_phase") return "Test phase";
  if (tag === "low_evidence") return "Low evidence";
  if (tag === "fatigue_recent_collapse") return "Recent fatigue collapse";
  if (tag === "break_even_proxy_used") return "Break-even: median proxy";
  if (tag === "target_pack_configured") return "Target pack configured";
  if (tag === "trust_live_confident") return "Trust live confident";
  return humanize(tag);
}

function blockerLabel(reason: CreativeBlockerReason) {
  if (reason === "trust_degraded_missing_truth") return "Trust degraded";
  if (reason === "business_validation_missing") return "Business validation missing";
  if (reason === "business_validation_unfavorable") return "Business validation unfavorable";
  if (reason === "commercial_truth_target_pack_missing") return "Target pack missing";
  if (reason === "deployment_lane_limited") return "Deployment limited";
  if (reason === "inactive_scale_delivery") return "Inactive scale delivery";
  if (reason === "diagnose_action") return "Diagnosis required";
  if (reason === "hard_truth_blocker") return "Hard truth blocker";
  return humanize(reason);
}

function sortedEvidence(evidence: CreativeReason[]) {
  return [...evidence].sort((left, right) => {
    if (left.weight === right.weight) return 0;
    return left.weight === "primary" ? -1 : 1;
  });
}

function EvidenceChip({ item }: { item: CreativeReason }) {
  const label = evidenceLabel(item.tag);
  if (item.tag === "break_even_proxy_used") {
    return (
      <details className="group relative inline-flex">
        <summary className="inline-flex cursor-help list-none items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 [&::-webkit-details-marker]:hidden">
          {label}
        </summary>
        <div className="absolute left-0 top-7 z-20 w-72 rounded-lg border border-amber-200 bg-white p-3 text-[11px] leading-relaxed text-slate-600 shadow-lg">
          This break-even is computed from the business&apos;s 30-day median ROAS because no commercial truth target pack is configured.
          <a className="mt-2 block font-semibold text-amber-800 hover:text-amber-900" href="/commercial-truth">
            Open Commercial Truth settings
          </a>
        </div>
      </details>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        item.weight === "primary"
          ? "border-slate-300 bg-white text-slate-800"
          : "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {label}
    </span>
  );
}

export function VerdictWhy({ verdict, className }: VerdictWhyProps) {
  const [expanded, setExpanded] = useState(false);
  const evidence = sortedEvidence(verdict.evidence);
  const visibleEvidence = expanded ? evidence : evidence.slice(0, 3);
  const visibleBlockers = expanded ? verdict.blockers : verdict.blockers.slice(0, 2);
  const hiddenCount =
    Math.max(evidence.length - visibleEvidence.length, 0) +
    Math.max(verdict.blockers.length - visibleBlockers.length, 0);

  if (evidence.length === 0 && verdict.blockers.length === 0) return null;

  return (
    <div className={cn("space-y-2 px-1", className)} data-testid="verdict-why">
      {evidence.length > 0 ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Evidence
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleEvidence.map((item) => (
              <EvidenceChip key={item.tag} item={item} />
            ))}
          </div>
        </div>
      ) : null}
      {verdict.blockers.length > 0 ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Blockers
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleBlockers.map((reason) => (
              <span
                key={reason}
                className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-800"
              >
                {blockerLabel(reason)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="text-[11px] font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          {expanded ? "Hide evidence" : `Show all evidence (${hiddenCount} more)`}
        </button>
      ) : null}
    </div>
  );
}

export function VerdictBand({ verdict, onAction, size = "full" }: VerdictBandProps) {
  const config = getVerdictActionConfig(verdict.action);
  const phase = phaseConfig(verdict);
  const Icon = config.Icon;
  const title = `${verdict.headline} — ${config.shortLabel}`;
  const compactTitle = `${verdict.headline}. Phase ${verdict.phase ?? "needs analysis"}. Action ${verdict.action}. Readiness ${verdict.actionReadiness.replaceAll("_", " ")}.`;
  const disabled = verdict.actionReadiness === "blocked";
  const buttonLabel = getVerdictActionButtonLabel(verdict);
  const statusTitle = disabled
    ? blockerTitle(verdict.blockers)
    : verdict.actionReadiness === "needs_review"
      ? "Action requires buyer review before platform changes."
      : `Request action: ${buttonLabel}`;

  if (size === "compact") {
    return (
      <div
        className="group relative inline-flex max-w-full items-center gap-1.5"
        data-testid="verdict-band-compact"
        title={compactTitle}
      >
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-[8px] font-bold tracking-wide",
            phase.classes,
          )}
        >
          {phase.label}
        </span>
        <span className="min-w-0 truncate text-[10px] font-semibold text-slate-900">
          {verdict.headline}
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
      </div>
    );
  }

  return (
    <section
      className={cn(
        "flex min-h-16 items-center justify-between gap-3 rounded-lg border border-slate-200 border-l-4 px-3.5 py-2.5 shadow-sm",
        ACTION_BAND_CLASSES[config.tone],
      )}
      data-testid="verdict-band"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[10px] font-bold tracking-wide",
            phase.classes,
          )}
          title={verdict.phaseSource ? `Phase source: ${verdict.phaseSource}` : undefined}
        >
          {phase.label}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[18px] font-semibold leading-tight text-slate-950">
            {title}
          </h3>
          <p className="mt-0.5 truncate text-[12px] font-medium text-slate-600">
            Confidence {verdict.confidence.toFixed(2)} · {verdict.evidence.length} evidence · {verdict.blockers.length} blockers
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction?.(verdict.action)}
        title={statusTitle}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[12px] font-semibold shadow-sm transition-colors",
          buttonClasses(verdict, config),
        )}
      >
        {disabled ? (
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        ) : verdict.actionReadiness === "ready" ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {buttonLabel}
      </button>
    </section>
  );
}
