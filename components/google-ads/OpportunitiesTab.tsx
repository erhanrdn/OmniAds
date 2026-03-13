"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { GadsOpportunityCard, TabSkeleton, SectionLabel } from "./shared";

// ── Types ──────────────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  type: string;
  title: string;
  whyItMatters: string;
  evidence: string;
  expectedImpact: string;
  effort: "low" | "medium" | "high";
  priority: "high" | "medium" | "low";
}

type TypeFilter = "all" | string;

// ── Type labels ────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  budget_shift: "Budget",
  negative_keyword: "Negatives",
  new_keyword: "Keywords",
  ad_copy: "Creative",
  bid_adjustment: "Bids",
  audience_expansion: "Audiences",
  creative_test: "Creative Test",
  product_scale: "Product Scale",
  product_cutback: "Product Cut",
  geo_optimization: "Geo",
};

// ── Impact summary ─────────────────────────────────────────────────────

function ImpactSummary({ opportunities }: { opportunities: Opportunity[] }) {
  const high = opportunities.filter((o) => o.priority === "high").length;
  const med = opportunities.filter((o) => o.priority === "medium").length;
  const low = opportunities.filter((o) => o.priority === "low").length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-card p-3">
        <p className="text-xs text-muted-foreground">High Priority</p>
        <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{high}</p>
        <p className="text-[10px] text-muted-foreground">opportunities</p>
      </div>
      <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-card p-3">
        <p className="text-xs text-muted-foreground">Medium Priority</p>
        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{med}</p>
        <p className="text-[10px] text-muted-foreground">opportunities</p>
      </div>
      <div className="rounded-xl border bg-card p-3">
        <p className="text-xs text-muted-foreground">Low Priority</p>
        <p className="text-2xl font-bold">{low}</p>
        <p className="text-[10px] text-muted-foreground">opportunities</p>
      </div>
    </div>
  );
}

// ── Type filter ────────────────────────────────────────────────────────

function TypeFilterPills({
  opportunities,
  active,
  onChange,
}: {
  opportunities: Opportunity[];
  active: TypeFilter;
  onChange: (t: TypeFilter) => void;
}) {
  const types = Array.from(new Set(opportunities.map((o) => o.type)));
  if (types.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange("all")}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          active === "all"
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-muted-foreground hover:border-foreground/50 hover:text-foreground"
        )}
      >
        All ({opportunities.length})
      </button>
      {types.map((t) => {
        const count = opportunities.filter((o) => o.type === t).length;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active === t
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground/50 hover:text-foreground"
            )}
          >
            {TYPE_LABELS[t] ?? t} ({count})
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

interface OpportunitiesTabProps {
  opportunities?: Opportunity[];
  isLoading: boolean;
}

export function OpportunitiesTab({ opportunities, isLoading }: OpportunitiesTabProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  if (isLoading) return <TabSkeleton rows={4} />;

  if (!opportunities || opportunities.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center">
        <p className="text-sm font-medium">No opportunities detected</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          Opportunities are generated when there is sufficient performance data — try a wider date range.
        </p>
      </div>
    );
  }

  const filtered = typeFilter === "all" ? opportunities : opportunities.filter((o) => o.type === typeFilter);
  const highPriority = filtered.filter((o) => o.priority === "high");
  const medLow = filtered.filter((o) => o.priority !== "high");

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Opportunities</SectionLabel>
        <p className="text-xs text-muted-foreground mt-0.5">
          Prioritised optimisation opportunities ranked by impact. Each card shows evidence, expected outcome, and implementation effort.
        </p>
      </div>

      <ImpactSummary opportunities={opportunities} />
      <TypeFilterPills opportunities={opportunities} active={typeFilter} onChange={setTypeFilter} />

      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No opportunities match this filter.</p>
      )}

      {highPriority.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
            High Priority
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {highPriority.map((opp) => (
              <GadsOpportunityCard key={opp.id} {...opp} />
            ))}
          </div>
        </div>
      )}

      {medLow.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Medium / Low Priority
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {medLow.map((opp) => (
              <GadsOpportunityCard key={opp.id} {...opp} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
