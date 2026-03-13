"use client";

import { cn } from "@/lib/utils";
import {
  GadsKpiCard, GadsInsightCard,
  fmtCurrency, fmtNumber, fmtRoas,
  TabSkeleton, TabEmpty, SectionLabel, ActionCard, TrendKpiCard,
} from "./shared";

// ── Types ──────────────────────────────────────────────────────────────

interface Kpis {
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
  impressions: number;
  clicks: number;
  convRate: number;
}

interface Insight {
  id: string;
  severity: "critical" | "warning" | "opportunity" | "positive";
  title: string;
  description: string;
  evidence?: string;
  recommendation?: string;
}

interface TopCampaign {
  name: string;
  spend: number;
  roas: number;
  conversions: number;
  channel: string;
}

interface OverviewTabProps {
  kpis?: Kpis;
  insights?: Insight[];
  topCampaigns?: TopCampaign[];
  isLoading: boolean;
}

// ── KPI health helper ──────────────────────────────────────────────────

function roasHealth(roas: number): "healthy" | "warning" | "critical" | "neutral" {
  if (roas >= 3) return "healthy";
  if (roas >= 1.5) return "neutral";
  if (roas >= 1) return "warning";
  return "critical";
}

function cpaHealth(_cpa: number, roas: number): "healthy" | "warning" | "critical" | "neutral" {
  if (roas >= 3) return "healthy";
  if (roas >= 1.5) return "neutral";
  return "warning";
}

// ── Channel colors ─────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  Search: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  Shopping: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Performance Max": "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  Display: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  Video: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

// ── Waste snapshot ─────────────────────────────────────────────────────

function WasteSnapshot({ insights }: { insights: Insight[] }) {
  const critical = insights.filter((i) => i.severity === "critical");
  const warnings = insights.filter((i) => i.severity === "warning");
  if (critical.length === 0 && warnings.length === 0) return null;

  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-4">
      <p className="text-xs font-semibold text-rose-900 dark:text-rose-100 mb-2">Needs Attention</p>
      <div className="space-y-2">
        {critical.map((ins) => (
          <div key={ins.id} className="flex items-start gap-2">
            <span className="text-rose-500 shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-xs font-medium text-rose-900 dark:text-rose-100">{ins.title}</p>
              {ins.evidence && <p className="text-[10px] text-rose-700 dark:text-rose-300 mt-0.5">{ins.evidence}</p>}
            </div>
          </div>
        ))}
        {warnings.slice(0, 2).map((ins) => (
          <div key={ins.id} className="flex items-start gap-2">
            <span className="text-amber-500 shrink-0 mt-0.5">△</span>
            <div>
              <p className="text-xs font-medium text-rose-900 dark:text-rose-100">{ins.title}</p>
              {ins.evidence && <p className="text-[10px] text-rose-700 dark:text-rose-300 mt-0.5">{ins.evidence}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Immediate actions ──────────────────────────────────────────────────

function ImmediateActions({ insights }: { insights: Insight[] }) {
  const actionable = insights.filter((i) => i.recommendation);
  if (actionable.length === 0) return null;

  return (
    <div className="space-y-2">
      <SectionLabel>Actions to Take Now</SectionLabel>
      <div className="grid gap-2 sm:grid-cols-2">
        {actionable.slice(0, 4).map((ins) => (
          <ActionCard
            key={ins.id}
            title={ins.title}
            description={ins.recommendation!}
            urgency={ins.severity === "critical" ? "high" : ins.severity === "warning" ? "medium" : "low"}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function OverviewTab({ kpis, insights, topCampaigns, isLoading }: OverviewTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <TrendKpiCard key={i} label="" value="" isLoading />
          ))}
        </div>
        <TabSkeleton rows={4} />
      </div>
    );
  }

  if (!kpis) return <TabEmpty message="No overview data available." />;

  const allInsights = insights ?? [];
  const positiveInsights = allInsights.filter((i) => i.severity === "positive" || i.severity === "opportunity");
  const negativeInsights = allInsights.filter((i) => i.severity === "critical" || i.severity === "warning");

  return (
    <div className="space-y-6">
      {/* Primary KPI grid — health-colored */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <TrendKpiCard label="Total Spend" value={fmtCurrency(kpis.spend)} />
        <TrendKpiCard label="Revenue" value={fmtCurrency(kpis.revenue)} />
        <TrendKpiCard
          label="ROAS"
          value={fmtRoas(kpis.roas)}
          health={roasHealth(kpis.roas)}
          sub={kpis.roas >= 3 ? "Strong" : kpis.roas >= 1.5 ? "Acceptable" : kpis.roas >= 1 ? "Break-even" : "Below break-even"}
        />
        <TrendKpiCard label="CPA" value={fmtCurrency(kpis.cpa)} health={cpaHealth(kpis.cpa, kpis.roas)} />
        <TrendKpiCard label="Conversions" value={fmtNumber(kpis.conversions)} />
        <TrendKpiCard
          label="CTR"
          value={`${kpis.ctr.toFixed(1)}%`}
          health={kpis.ctr >= 3 ? "healthy" : kpis.ctr >= 1.5 ? "neutral" : "warning"}
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GadsKpiCard label="CPC" value={fmtCurrency(kpis.cpc)} />
        <GadsKpiCard label="Impressions" value={fmtNumber(kpis.impressions)} />
        <GadsKpiCard label="Clicks" value={fmtNumber(kpis.clicks)} />
        <GadsKpiCard label="Conv. Rate" value={`${kpis.convRate.toFixed(1)}%`} />
      </div>

      {/* Waste + actions */}
      {negativeInsights.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <WasteSnapshot insights={negativeInsights} />
          <ImmediateActions insights={allInsights} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Top campaigns */}
        {topCampaigns && topCampaigns.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Top Campaigns by Spend</SectionLabel>
            <div className="rounded-xl border bg-card overflow-hidden">
              {topCampaigns.map((c, i) => (
                <div
                  key={i}
                  className={cn("flex items-center justify-between px-4 py-3", i < topCampaigns.length - 1 && "border-b")}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate max-w-[180px] text-xs" title={c.name}>{c.name}</p>
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", CHANNEL_COLORS[c.channel] ?? "bg-muted text-muted-foreground")}>
                      {c.channel}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-semibold tabular-nums">{fmtCurrency(c.spend)}</p>
                      <p className="text-[10px] text-muted-foreground">spend</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-xs font-semibold", c.roas >= 3 ? "text-emerald-600 dark:text-emerald-400" : c.roas >= 1 ? "text-foreground" : "text-rose-600 dark:text-rose-400")}>
                        {fmtRoas(c.roas)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">ROAS</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold">{fmtNumber(c.conversions)}</p>
                      <p className="text-[10px] text-muted-foreground">conv.</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* What's working */}
        {positiveInsights.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>What's Working</SectionLabel>
            <div className="space-y-2">
              {positiveInsights.map((ins) => (
                <GadsInsightCard
                  key={ins.id}
                  severity={ins.severity}
                  title={ins.title}
                  description={ins.description}
                  evidence={ins.evidence}
                  recommendation={ins.recommendation}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* All insights when no negative split */}
      {negativeInsights.length === 0 && allInsights.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Account Insights</SectionLabel>
          <div className="space-y-2">
            {allInsights.map((ins) => (
              <GadsInsightCard
                key={ins.id}
                severity={ins.severity}
                title={ins.title}
                description={ins.description}
                evidence={ins.evidence}
                recommendation={ins.recommendation}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
