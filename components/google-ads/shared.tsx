"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ── Formatting ────────────────────────────────────────────────────────

export function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function fmtRoas(n: number): string {
  return `${n.toFixed(2)}x`;
}

// ── KPI Card ──────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
  isLoading?: boolean;
}

export function GadsKpiCard({ label, value, sub, highlight, isLoading }: KpiCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-7 w-16" />
      </div>
    );
  }
  return (
    <div className={cn("rounded-xl border bg-card p-4", highlight && "border-primary/30 bg-primary/5")}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p className={cn("text-2xl font-bold tracking-tight", highlight && "text-primary")}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

// ── Insight Card ──────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "opportunity" | "positive";

const SEVERITY_CONFIG: Record<Severity, { border: string; icon: string; iconCls: string }> = {
  critical: { border: "border-rose-200 dark:border-rose-900/50", icon: "⚠", iconCls: "text-rose-500" },
  warning: { border: "border-amber-200 dark:border-amber-900/50", icon: "△", iconCls: "text-amber-500" },
  opportunity: { border: "border-blue-200 dark:border-blue-900/50", icon: "◈", iconCls: "text-blue-500" },
  positive: { border: "border-emerald-200 dark:border-emerald-900/50", icon: "✓", iconCls: "text-emerald-500" },
};

interface InsightCardProps {
  severity: Severity;
  title: string;
  description: string;
  evidence?: string;
  recommendation?: string;
}

export function GadsInsightCard({ severity, title, description, evidence, recommendation }: InsightCardProps) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <div className={cn("rounded-xl border p-4 space-y-1.5", cfg.border)}>
      <div className="flex items-start gap-2">
        <span className={cn("text-base leading-none mt-0.5 shrink-0", cfg.iconCls)}>{cfg.icon}</span>
        <p className="text-sm font-semibold leading-snug">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground pl-6">{description}</p>
      {evidence && (
        <p className="text-[10px] text-muted-foreground pl-6 italic">{evidence}</p>
      )}
      {recommendation && (
        <p className="text-xs text-foreground/80 pl-6">→ {recommendation}</p>
      )}
    </div>
  );
}

// ── Opportunity Card ──────────────────────────────────────────────────

type EffortLevel = "low" | "medium" | "high";
type PriorityLevel = "high" | "medium" | "low";

const EFFORT_CONFIG: Record<EffortLevel, string> = {
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  high: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const PRIORITY_DOT: Record<PriorityLevel, string> = {
  high: "bg-rose-500",
  medium: "bg-amber-400",
  low: "bg-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = {
  budget_shift: "Budget Shift",
  negative_keyword: "Negative Keywords",
  new_keyword: "New Keyword",
  ad_copy: "Ad Copy",
  audience_expansion: "Audience",
  creative_test: "Creative Test",
  bid_adjustment: "Bid Adjustment",
};

interface OpportunityCardProps {
  type: string;
  title: string;
  whyItMatters: string;
  evidence: string;
  expectedImpact: string;
  effort: EffortLevel;
  priority: PriorityLevel;
}

export function GadsOpportunityCard({
  type, title, whyItMatters, evidence, expectedImpact, effort, priority,
}: OpportunityCardProps) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[priority])} />
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {TYPE_LABELS[type] ?? type}
          </span>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0", EFFORT_CONFIG[effort])}>
          {effort} effort
        </span>
      </div>
      <p className="text-sm font-semibold leading-snug">{title}</p>
      <p className="text-xs text-muted-foreground">{whyItMatters}</p>
      {evidence && (
        <p className="text-[10px] text-muted-foreground italic rounded bg-muted px-2 py-1">
          {evidence}
        </p>
      )}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Expected impact:</span>
        <span className="font-medium text-emerald-600 dark:text-emerald-400">{expectedImpact}</span>
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : status === "paused"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", cls)}>
      {status}
    </span>
  );
}

// ── Campaign Badge ────────────────────────────────────────────────────

const BADGE_CONFIG: Record<string, { label: string; cls: string }> = {
  strong_performer: { label: "✦ Strong", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  budget_limited: { label: "⊘ Budget", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  low_roas: { label: "↓ Low ROAS", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  high_cpa: { label: "↑ High CPA", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  wasted_spend: { label: "✕ Wasted Spend", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
};

export function CampaignBadges({ badges }: { badges: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => {
        const cfg = BADGE_CONFIG[b];
        if (!cfg) return null;
        return (
          <span key={b} className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap", cfg.cls)}>
            {cfg.label}
          </span>
        );
      })}
    </div>
  );
}

// ── Section skeleton ─────────────────────────────────────────────────

export function TabSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────

export function TabEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed py-12 text-center">
      <p className="text-sm font-medium">No data available</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">{message}</p>
    </div>
  );
}

export function TabAlert({
  tone,
  title,
  items,
}: {
  tone: "error" | "warning" | "info";
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;

  const styles =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
      : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-100";

  return (
    <div className={cn("rounded-xl border px-4 py-3", styles)}>
      <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      <div className="mt-2 space-y-1">
        {items.map((item, index) => (
          <p key={`${title}-${index}`} className="text-xs">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

// ── Efficiency Score Badge ────────────────────────────────────────────

type EfficiencyLabel = "Scale" | "Stable" | "Needs Optimization" | "Wasting Spend";

const EFFICIENCY_CONFIG: Record<EfficiencyLabel, string> = {
  "Scale": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Stable": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Needs Optimization": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Wasting Spend": "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export function computeEfficiencyLabel(
  roas: number,
  accountAvgRoas: number,
  ctr: number,
  accountAvgCtr: number,
  conversions: number,
  spend: number
): EfficiencyLabel {
  if (spend > 50 && conversions === 0) return "Wasting Spend";
  if (accountAvgRoas <= 0) return "Stable";
  const roasRatio = roas / accountAvgRoas;
  const ctrRatio = accountAvgCtr > 0 ? ctr / accountAvgCtr : 1;
  const weighted = roasRatio * 0.6 + ctrRatio * 0.4;
  if (weighted >= 1.25) return "Scale";
  if (weighted >= 0.75) return "Stable";
  if (weighted >= 0.4) return "Needs Optimization";
  return "Wasting Spend";
}

export function EfficiencyScoreBadge({ label }: { label: EfficiencyLabel }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", EFFICIENCY_CONFIG[label])}>
      {label}
    </span>
  );
}

// ── Trend KPI Card ────────────────────────────────────────────────────

type HealthState = "healthy" | "warning" | "critical" | "neutral";

const HEALTH_CONFIG: Record<HealthState, { border: string; value: string }> = {
  healthy: { border: "border-emerald-200 dark:border-emerald-900/50", value: "text-emerald-600 dark:text-emerald-400" },
  warning: { border: "border-amber-200 dark:border-amber-900/50", value: "text-amber-600 dark:text-amber-400" },
  critical: { border: "border-rose-200 dark:border-rose-900/50", value: "text-rose-600 dark:text-rose-400" },
  neutral: { border: "", value: "" },
};

interface TrendKpiCardProps {
  label: string;
  value: string;
  change?: number;
  health?: HealthState;
  sub?: string;
  isLoading?: boolean;
}

export function TrendKpiCard({ label, value, change, health = "neutral", sub, isLoading }: TrendKpiCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-7 w-16 mb-2" />
        <Skeleton className="h-3 w-12" />
      </div>
    );
  }
  const cfg = HEALTH_CONFIG[health];
  return (
    <div className={cn("rounded-xl border bg-card p-4", cfg.border)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-2xl font-bold tracking-tight", cfg.value)}>{value}</p>
      {change !== undefined && (
        <p className={cn("mt-0.5 text-xs font-medium", change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% vs prior
        </p>
      )}
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Sub-tab navigation ────────────────────────────────────────────────

export function SubTabNav<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            active === t.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────

export function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

// ── Action Card ───────────────────────────────────────────────────────

interface ActionCardProps {
  title: string;
  description: string;
  urgency: "high" | "medium" | "low";
}

const URGENCY_BORDER: Record<string, string> = {
  high: "border-rose-200 dark:border-rose-900/50",
  medium: "border-amber-200 dark:border-amber-900/50",
  low: "border-slate-200 dark:border-slate-700",
};
const URGENCY_DOT: Record<string, string> = {
  high: "bg-rose-500",
  medium: "bg-amber-400",
  low: "bg-muted-foreground",
};

export function ActionCard({ title, description, urgency }: ActionCardProps) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", URGENCY_BORDER[urgency])}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", URGENCY_DOT[urgency])} />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ── Quadrant Badge ────────────────────────────────────────────────────

export type QuadrantLabel = "Scale" | "Optimize" | "Test" | "Pause";

const QUADRANT_CONFIG: Record<QuadrantLabel, string> = {
  "Scale": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Optimize": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Test": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Pause": "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export function computeQuadrant(roas: number, spend: number, avgRoas: number, medianSpend: number): QuadrantLabel {
  const highRoas = roas >= avgRoas * 0.9;
  const highSpend = spend >= medianSpend;
  if (highRoas && highSpend) return "Scale";
  if (highRoas && !highSpend) return "Test";
  if (!highRoas && highSpend) return "Optimize";
  return "Pause";
}

export function QuadrantBadge({ label }: { label: QuadrantLabel }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", QUADRANT_CONFIG[label])}>
      {label}
    </span>
  );
}

// ── Spend bar ─────────────────────────────────────────────────────────

export function SpendBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Intent badge ──────────────────────────────────────────────────────

const INTENT_BADGE_CONFIG: Record<string, string> = {
  transactional: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  commercial: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  informational: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  navigational: "bg-muted text-muted-foreground",
};

export function IntentBadge({ intent }: { intent: string }) {
  const cls = INTENT_BADGE_CONFIG[intent] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize", cls)}>
      {intent}
    </span>
  );
}

// ── Sortable table ────────────────────────────────────────────────────

export interface ColDef<T> {
  key: string;
  header: string;
  accessor: (r: T) => string | number;
  render?: (r: T) => React.ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
}

import { useState } from "react";

export function SimpleTable<T extends object>({
  cols,
  rows,
  defaultSort,
  emptyText,
}: {
  cols: ColDef<T>[];
  rows: T[];
  defaultSort?: string;
  emptyText?: string;
}) {
  const [sortKey, setSortKey] = useState(defaultSort ?? cols[0]?.key ?? "");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const col = cols.find((c) => c.key === sortKey);
  const sorted = col
    ? [...rows].sort((a, b) => {
        const av = col.accessor(a);
        const bv = col.accessor(b);
        if (typeof av === "number" && typeof bv === "number")
          return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      })
    : rows;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {cols.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "py-2.5 pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                  c.align === "right" ? "text-right" : "text-left",
                  c.sortable !== false && "cursor-pointer select-none hover:text-foreground"
                )}
                onClick={() => c.sortable !== false && toggleSort(c.key)}
              >
                {c.header}
                {sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 100).map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={cn("py-2.5 pr-4 text-xs tabular-nums", c.align === "right" ? "text-right" : "")}
                >
                  {c.render ? c.render(row) : String(c.accessor(row))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {emptyText ?? "No data for this period."}
        </p>
      )}
    </div>
  );
}
