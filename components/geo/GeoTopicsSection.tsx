"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TopicCluster {
  topic: string;
  queryCount: number;
  impressions: number;
  clicks: number;
  avgPosition: number;
  geoScore: number;
  coverageStrength: "Strong" | "Moderate" | "Weak";
  queries: string[];
}

function fmt(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

const STRENGTH_CONFIG = {
  Strong: {
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  Moderate: {
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    bar: "bg-amber-400",
  },
  Weak: {
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
    bar: "bg-rose-400",
  },
};

interface GeoTopicsSectionProps {
  topics?: TopicCluster[];
  isLoading: boolean;
}

export function GeoTopicsSection({ topics, isLoading }: GeoTopicsSectionProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!topics || topics.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-10 text-center">
        <p className="text-sm font-medium">No topic clusters yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Connect Search Console to surface topic authority signals.
        </p>
      </div>
    );
  }

  const maxImpressions = Math.max(...topics.map((t) => t.impressions), 1);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Topic clusters grouped from your ranking queries. Strong coverage = many queries ranking
        for this topic. Weak coverage = opportunity to expand.
      </p>
      <div className="grid gap-2.5">
        {topics.slice(0, 20).map((topic) => {
          const cfg = STRENGTH_CONFIG[topic.coverageStrength];
          const barWidth = Math.min(100, (topic.impressions / maxImpressions) * 100);
          return (
            <div key={topic.topic} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold capitalize">{topic.topic}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cfg.cls)}>
                      {topic.coverageStrength}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {topic.queryCount} {topic.queryCount === 1 ? "query" : "queries"}
                    </span>
                  </div>
                  {/* Impression bar */}
                  <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", cfg.bar)}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  {/* Sample queries */}
                  {topic.queries.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {topic.queries.slice(0, 3).map((q, i) => (
                        <span
                          key={i}
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {q}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right space-y-0.5">
                  <p className="text-sm font-semibold">{fmt(topic.impressions)}</p>
                  <p className="text-xs text-muted-foreground">impressions</p>
                  <p className="text-sm tabular-nums">{fmt(topic.clicks)}</p>
                  <p className="text-xs text-muted-foreground">clicks</p>
                  <p className="text-xs text-muted-foreground">
                    avg pos {topic.avgPosition.toFixed(1)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
