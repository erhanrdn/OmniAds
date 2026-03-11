"use client";

import { GeoKpiCard } from "./GeoKpiCard";
import { GeoInsightCallout } from "./GeoInsightCallout";
import type { GeoInsight } from "@/lib/geo-intelligence";

interface OverviewKpis {
  aiSessions: number;
  aiEngagementRate: number;
  aiPurchaseCvr: number;
  geoScore: number;
  aiPageCount: number;
  topAiSource: string | null;
  siteAvgEngagementRate: number;
  siteAvgPurchaseCvr: number;
  aiStyleQueryCount: number;
  totalQueryCount: number;
}

interface GeoOverviewSectionProps {
  kpis?: OverviewKpis;
  insights?: GeoInsight[];
  isLoading: boolean;
}

function fmt(n: number, type: "number" | "percent" | "score" = "number"): string {
  if (isNaN(n) || n === undefined) return "—";
  if (type === "percent") return `${(n * 100).toFixed(1)}%`;
  if (type === "score") return `${Math.round(n)} / 100`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function GeoOverviewSection({
  kpis,
  insights,
  isLoading,
}: GeoOverviewSectionProps) {
  return (
    <div className="space-y-5">
      {/* KPI Band */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <GeoKpiCard
          label="AI-Source Sessions"
          value={fmt(kpis?.aiSessions ?? 0)}
          isLoading={isLoading}
        />
        <GeoKpiCard
          label="AI Engagement Rate"
          value={fmt(kpis?.aiEngagementRate ?? 0, "percent")}
          sub={
            kpis && kpis.siteAvgEngagementRate > 0
              ? `site avg ${fmt(kpis.siteAvgEngagementRate, "percent")}`
              : undefined
          }
          isLoading={isLoading}
        />
        <GeoKpiCard
          label="AI Purchase CVR"
          value={fmt(kpis?.aiPurchaseCvr ?? 0, "percent")}
          sub={
            kpis && kpis.siteAvgPurchaseCvr > 0
              ? `site avg ${fmt(kpis.siteAvgPurchaseCvr, "percent")}`
              : undefined
          }
          isLoading={isLoading}
        />
        <GeoKpiCard
          label="GEO Opportunity Score"
          value={fmt(kpis?.geoScore ?? 0, "score")}
          highlight
          isLoading={isLoading}
        />
        <GeoKpiCard
          label="Pages with GEO Signals"
          value={fmt(kpis?.aiPageCount ?? 0)}
          isLoading={isLoading}
        />
        <GeoKpiCard
          label="Top AI Source"
          value={kpis?.topAiSource ?? "—"}
          isLoading={isLoading}
        />
      </div>

      {/* Query signal strip */}
      {!isLoading && kpis && kpis.totalQueryCount > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Search Intelligence
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{kpis.aiStyleQueryCount}</span>
            <span className="text-xs text-muted-foreground">
              of {kpis.totalQueryCount} ranking queries have AI / answer intent
            </span>
          </div>
          {kpis.totalQueryCount > 0 && (
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden min-w-[80px]">
              <div
                className="h-full rounded-full bg-violet-500"
                style={{
                  width: `${Math.min(100, (kpis.aiStyleQueryCount / kpis.totalQueryCount) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Insight callouts */}
      {!isLoading && insights && insights.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Insights
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {insights.map((insight, i) => (
              <GeoInsightCallout key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
