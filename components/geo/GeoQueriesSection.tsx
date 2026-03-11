"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface GeoQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  intent: string;
  isAiStyle: boolean;
  opportunityLabel: string | null;
  geoScore: number;
  priority: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  recommendation: string | null;
}

type Filter = "all" | "ai_style" | "high_impression" | "weak_ctr";
type SortKey = "impressions" | "clicks" | "ctr" | "position" | "geoScore";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All Queries" },
  { id: "ai_style", label: "AI-Style Intent" },
  { id: "high_impression", label: "High Impressions" },
  { id: "weak_ctr", label: "Weak CTR" },
];

function fmt(n: number, type: "number" | "percent" = "number"): string {
  if (isNaN(n) || n === undefined) return "—";
  if (type === "percent") return `${(n * 100).toFixed(1)}%`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}

function IntentBadge({ isAiStyle, intent }: { isAiStyle: boolean; intent: string }) {
  if (isAiStyle) {
    return (
      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">
        {intent}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {intent}
    </span>
  );
}

function GeoScorePill({ score }: { score: number }) {
  const cls =
    score >= 60
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : score >= 35
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>
      {score}
    </span>
  );
}

function PriorityDot({ priority }: { priority: "high" | "medium" | "low" }) {
  const cls = {
    high: "bg-rose-500",
    medium: "bg-amber-400",
    low: "bg-muted-foreground",
  }[priority];
  return <span className={cn("inline-block h-2 w-2 rounded-full", cls)} title={`${priority} priority`} />;
}

interface GeoQueriesSectionProps {
  queries?: GeoQuery[];
  isLoading: boolean;
}

export function GeoQueriesSection({ queries, isLoading }: GeoQueriesSectionProps) {
  const [activeFilter, setActiveFilter] = useState<Filter>("ai_style");
  const [sortKey, setSortKey] = useState<SortKey>("geoScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = (queries ?? []).filter((q) => {
    if (activeFilter === "ai_style") return q.isAiStyle;
    if (activeFilter === "high_impression") return q.impressions > 100;
    if (activeFilter === "weak_ctr") return q.ctr < 0.03 && q.impressions > 50;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!queries || queries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-10 text-center">
        <p className="text-sm font-medium">No query data available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Connect Search Console and select a site in Integrations to unlock query intelligence.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ranking queries scored for GEO relevance. Violet badges = high AI answer-engine
        intent. GEO Score combines impressions, position, CTR gap, and intent signals.
      </p>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeFilter === f.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground/50 hover:text-foreground"
            )}
          >
            {f.label}
            {f.id !== "all" && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {
                  (queries ?? []).filter((q) => {
                    if (f.id === "ai_style") return q.isAiStyle;
                    if (f.id === "high_impression") return q.impressions > 100;
                    if (f.id === "weak_ctr") return q.ctr < 0.03 && q.impressions > 50;
                    return true;
                  }).length
                }
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Query
              </th>
              <th className="py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Intent
              </th>
              <SortableHeader label="GEO Score" sortKey="geoScore" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Impressions" sortKey="impressions" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Clicks" sortKey="clicks" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="CTR" sortKey="ctr" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Position" sortKey="position" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recommendation
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 50).map((q, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="py-2.5 pr-4 max-w-[200px]">
                  <div className="flex items-center gap-1.5">
                    <PriorityDot priority={q.priority} />
                    <span className="truncate block text-xs font-medium" title={q.query}>
                      {q.query}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  <IntentBadge isAiStyle={q.isAiStyle} intent={q.intent} />
                </td>
                <td className="py-2.5 pr-4 text-right">
                  <GeoScorePill score={q.geoScore} />
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-xs">{fmt(q.impressions)}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-xs">{fmt(q.clicks)}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-xs">{fmt(q.ctr, "percent")}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-xs">
                  <span
                    className={cn(
                      q.position <= 3
                        ? "text-emerald-600 dark:text-emerald-400 font-medium"
                        : q.position <= 10
                        ? "text-foreground"
                        : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {q.position.toFixed(1)}
                  </span>
                </td>
                <td className="py-2.5 text-xs text-muted-foreground max-w-[180px]">
                  {q.recommendation && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] leading-tight block max-w-[170px] truncate" title={q.recommendation}>
                      {q.recommendation}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No queries match this filter.
          </p>
        )}
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: string;
  current: string;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="py-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-pointer select-none hover:text-foreground"
      onClick={() => onSort(sortKey as SortKey)}
    >
      {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}
