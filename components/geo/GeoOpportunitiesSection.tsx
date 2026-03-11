"use client";

import { Zap, AlertTriangle, TrendingUp, Globe } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface GeoOpportunity {
  type: "content" | "traffic" | "conversion" | "coverage";
  priority: "high" | "medium" | "low";
  title: string;
  target: string;
  evidence: string;
  recommendation: string;
}

const TYPE_CONFIG = {
  content: {
    icon: <TrendingUp className="h-4 w-4" />,
    label: "Content",
    color: "text-violet-600 dark:text-violet-400",
    border: "border-violet-200 dark:border-violet-900/50",
    bg: "bg-violet-50 dark:bg-violet-950/30",
  },
  traffic: {
    icon: <Zap className="h-4 w-4" />,
    label: "Traffic",
    color: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-900/50",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  conversion: {
    icon: <AlertTriangle className="h-4 w-4" />,
    label: "Conversion",
    color: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-900/50",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  coverage: {
    icon: <Globe className="h-4 w-4" />,
    label: "Coverage",
    color: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-900/50",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-muted text-muted-foreground",
};

interface GeoOpportunitiesSectionProps {
  opportunities?: GeoOpportunity[];
  isLoading: boolean;
}

export function GeoOpportunitiesSection({
  opportunities,
  isLoading,
}: GeoOpportunitiesSectionProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!opportunities || opportunities.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-10 text-center">
        <p className="text-sm font-medium">No opportunities detected yet</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          Connect GA4 and Search Console to unlock data-driven GEO recommendations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Evidence-based actions to improve your AI-era discoverability. High priority items
        should be addressed first.
      </p>
      {opportunities.map((op, i) => {
        const cfg = TYPE_CONFIG[op.type];
        return (
          <div
            key={i}
            className={`rounded-xl border p-4 shadow-sm ${cfg.border} ${cfg.bg}`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-semibold text-sm">{op.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_BADGE[op.priority]}`}>
                    {op.priority}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {cfg.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">
                  <span className="font-medium">Target:</span> {op.target}
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  <span className="font-medium">Evidence:</span> {op.evidence}
                </p>
                <div className="rounded-lg bg-background/60 px-3 py-2 border border-border/50">
                  <p className="text-xs font-medium text-foreground">
                    Recommendation
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {op.recommendation}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
