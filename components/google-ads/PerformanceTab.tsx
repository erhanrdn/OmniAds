"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  fmtCurrency, fmtNumber, fmtPercent, fmtRoas,
  TabSkeleton, TabEmpty, SimpleTable, ColDef,
  StatusBadge, CampaignBadges,
  computeEfficiencyLabel, EfficiencyScoreBadge,
  computeQuadrant, QuadrantBadge,
  SpendBar, SectionLabel,
} from "./shared";

// ── Types ──────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  status: string;
  channel: string;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
  impressions: number;
  clicks: number;
  impressionShare: number | null;
  lostIsBudget: number | null;
  lostIsRank: number | null;
  badges: string[];
  conversionRate?: number;
  convRate?: number;
  dailyBudget?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  Search: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  Shopping: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Performance Max": "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  Display: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  Video: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  App: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

type ViewMode = "table" | "quadrant";

// ── Quadrant visualization ─────────────────────────────────────────────

const QUADRANT_ZONES = [
  { key: "Scale", label: "Scale", pos: "top-right", cls: "text-emerald-600 dark:text-emerald-400" },
  { key: "Test", label: "Test / Grow", pos: "top-left", cls: "text-blue-600 dark:text-blue-400" },
  { key: "Optimize", label: "Optimize", pos: "bottom-right", cls: "text-amber-600 dark:text-amber-400" },
  { key: "Pause", label: "Consider Pausing", pos: "bottom-left", cls: "text-rose-600 dark:text-rose-400" },
];

function QuadrantChart({
  campaigns,
  avgRoas,
  medianSpend,
}: {
  campaigns: Campaign[];
  avgRoas: number;
  medianSpend: number;
}) {
  const maxSpend = Math.max(...campaigns.map((c) => c.spend), 1);
  const maxRoas = Math.max(...campaigns.map((c) => c.roas), 1);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b">
        <p className="text-xs font-semibold">Performance Quadrant</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">X = Spend · Y = ROAS · dot size = conversions</p>
      </div>
      <div className="relative p-4" style={{ height: 280 }}>
        {/* Axis lines */}
        <div className="absolute inset-4">
          {/* Y axis label */}
          <div className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] text-muted-foreground whitespace-nowrap select-none">
            ROAS →
          </div>
          {/* X axis label */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground select-none">
            Spend →
          </div>
          {/* Quadrant lines */}
          <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed border-muted-foreground/30" />
          <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-muted-foreground/30" />

          {/* Zone labels */}
          <span className="absolute top-2 right-2 text-[9px] font-medium text-emerald-600 dark:text-emerald-400 select-none">Scale</span>
          <span className="absolute top-2 left-6 text-[9px] font-medium text-blue-600 dark:text-blue-400 select-none">Test</span>
          <span className="absolute bottom-4 right-2 text-[9px] font-medium text-amber-600 dark:text-amber-400 select-none">Optimize</span>
          <span className="absolute bottom-4 left-6 text-[9px] font-medium text-rose-600 dark:text-rose-400 select-none">Pause</span>

          {/* Campaign dots */}
          {campaigns.map((c) => {
            const x = maxSpend > 0 ? (c.spend / maxSpend) * 100 : 50;
            const y = maxRoas > 0 ? 100 - (c.roas / maxRoas) * 100 : 50;
            const size = Math.max(6, Math.min(18, 6 + (c.conversions / 10)));
            const q = computeQuadrant(c.roas, c.spend, avgRoas, medianSpend);
            const dotColor =
              q === "Scale" ? "bg-emerald-500"
              : q === "Test" ? "bg-blue-500"
              : q === "Optimize" ? "bg-amber-500"
              : "bg-rose-500";
            return (
              <div
                key={c.id}
                title={`${c.name}\nSpend: ${fmtCurrency(c.spend)}\nROAS: ${fmtRoas(c.roas)}\nConv: ${fmtNumber(c.conversions)}`}
                className={cn("absolute rounded-full opacity-80 hover:opacity-100 transition-opacity cursor-default border-2 border-background", dotColor)}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: size,
                  height: size,
                  transform: "translate(-50%, -50%)",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Trend callouts ─────────────────────────────────────────────────────

function TrendCallouts({ campaigns, avgRoas, avgCtr }: { campaigns: Campaign[]; avgRoas: number; avgCtr: number }) {
  const callouts: { msg: string; cls: string }[] = [];

  const budgetLimited = campaigns.filter((c) => (c.lostIsBudget ?? 0) > 0.2 && c.roas > avgRoas);
  if (budgetLimited.length > 0) {
    callouts.push({
      msg: `${budgetLimited.length} high-ROAS campaign${budgetLimited.length > 1 ? "s" : ""} losing impression share to budget — increase their budgets.`,
      cls: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100",
    });
  }

  const wastedSpend = campaigns.filter((c) => c.spend > 100 && c.conversions === 0);
  if (wastedSpend.length > 0) {
    const total = wastedSpend.reduce((s, c) => s + c.spend, 0);
    callouts.push({
      msg: `${fmtCurrency(total)} spent across ${wastedSpend.length} campaign${wastedSpend.length > 1 ? "s" : ""} with zero conversions — consider pausing or restructuring.`,
      cls: "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100",
    });
  }

  const lowCtr = campaigns.filter((c) => c.clicks > 100 && c.ctr < avgCtr * 0.5);
  if (lowCtr.length > 0) {
    callouts.push({
      msg: `${lowCtr.length} campaign${lowCtr.length > 1 ? "s have" : " has"} CTR significantly below average — review ad copy and targeting.`,
      cls: "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100",
    });
  }

  if (callouts.length === 0) return null;
  return (
    <div className="space-y-2">
      <SectionLabel>Performance Signals</SectionLabel>
      {callouts.map((c, i) => (
        <div key={i} className={cn("rounded-xl border px-4 py-3 text-xs", c.cls)}>
          {c.msg}
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

interface PerformanceTabProps {
  campaigns?: Campaign[];
  isLoading: boolean;
  emptyMessage?: string;
}

export function PerformanceTab({ campaigns, isLoading, emptyMessage }: PerformanceTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  if (isLoading) return <TabSkeleton />;
  if (!campaigns || campaigns.length === 0) {
    return <TabEmpty message={emptyMessage ?? "No campaign data found for this period."} />;
  }

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const avgRoas = totalSpend > 0
    ? campaigns.reduce((s, c) => s + c.revenue, 0) / totalSpend
    : 0;
  const avgCtr = campaigns.length > 0
    ? campaigns.reduce((s, c) => s + c.ctr, 0) / campaigns.length
    : 0;
  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend);
  const medianSpend = sorted[Math.floor(sorted.length / 2)]?.spend ?? 0;

  const cols: ColDef<Campaign>[] = [
    {
      key: "name",
      header: "Campaign",
      accessor: (r) => r.name,
      render: (r) => (
        <div className="max-w-[200px]">
          <p className="font-medium truncate text-xs" title={r.name}>{r.name}</p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", CHANNEL_COLORS[r.channel] ?? "bg-muted text-muted-foreground")}>
              {r.channel}
            </span>
            <StatusBadge status={r.status} />
          </div>
          {r.badges.length > 0 && <div className="mt-1"><CampaignBadges badges={r.badges} /></div>}
        </div>
      ),
    },
    {
      key: "efficiency",
      header: "Signal",
      accessor: (r) => r.roas,
      render: (r) => (
        <EfficiencyScoreBadge
          label={computeEfficiencyLabel(r.roas, avgRoas, r.ctr, avgCtr, r.conversions, r.spend)}
        />
      ),
      sortable: false,
    },
    {
      key: "quadrant",
      header: "Quadrant",
      accessor: (r) => r.roas,
      render: (r) => <QuadrantBadge label={computeQuadrant(r.roas, r.spend, avgRoas, medianSpend)} />,
      sortable: false,
    },
    { key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right", render: (r) => (
      <div className="text-right min-w-[60px]">
        <p className="text-xs tabular-nums">{fmtCurrency(r.spend)}</p>
        <SpendBar value={r.spend} max={totalSpend} />
      </div>
    )},
    { key: "revenue", header: "Revenue", accessor: (r) => r.revenue, align: "right", render: (r) => fmtCurrency(r.revenue) },
    {
      key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right",
      render: (r) => (
        <span className={cn("font-semibold", r.roas >= avgRoas * 1.2 ? "text-emerald-600 dark:text-emerald-400" : r.roas < avgRoas * 0.5 ? "text-rose-600 dark:text-rose-400" : "")}>
          {fmtRoas(r.roas)}
        </span>
      ),
    },
    { key: "cpa", header: "CPA", accessor: (r) => r.cpa, align: "right", render: (r) => r.cpa === 0 ? "—" : fmtCurrency(r.cpa) },
    { key: "conversions", header: "Conv.", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
    {
      key: "convRate", header: "Conv. Rate", accessor: (r) => r.conversionRate ?? r.convRate ?? 0, align: "right",
      render: (r) => `${(r.conversionRate ?? r.convRate ?? 0).toFixed(1)}%`,
    },
    { key: "ctr", header: "CTR", accessor: (r) => r.ctr, align: "right", render: (r) => `${r.ctr.toFixed(1)}%` },
    {
      key: "impressionShare", header: "Impr. Share", accessor: (r) => r.impressionShare ?? 0, align: "right",
      render: (r) => r.impressionShare != null ? fmtPercent(r.impressionShare * 100) : "—",
    },
    {
      key: "lostIsBudget", header: "Lost IS (Budget)", accessor: (r) => r.lostIsBudget ?? 0, align: "right",
      render: (r) => r.lostIsBudget != null && r.lostIsBudget > 0
        ? <span className="text-amber-600 dark:text-amber-400">{fmtPercent(r.lostIsBudget * 100)}</span>
        : "—",
    },
    {
      key: "lostIsRank", header: "Lost IS (Rank)", accessor: (r) => r.lostIsRank ?? 0, align: "right",
      render: (r) => r.lostIsRank != null && r.lostIsRank > 0
        ? <span className="text-rose-600 dark:text-rose-400">{fmtPercent(r.lostIsRank * 100)}</span>
        : "—",
    },
  ];

  // Summary counts
  const byQuadrant = {
    Scale: campaigns.filter((c) => computeQuadrant(c.roas, c.spend, avgRoas, medianSpend) === "Scale").length,
    Test: campaigns.filter((c) => computeQuadrant(c.roas, c.spend, avgRoas, medianSpend) === "Test").length,
    Optimize: campaigns.filter((c) => computeQuadrant(c.roas, c.spend, avgRoas, medianSpend) === "Optimize").length,
    Pause: campaigns.filter((c) => computeQuadrant(c.roas, c.spend, avgRoas, medianSpend) === "Pause").length,
  };

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {(["Scale", "Test", "Optimize", "Pause"] as const).map((q) => {
          const colors: Record<string, string> = {
            Scale: "border-emerald-200 dark:border-emerald-900/50",
            Test: "border-blue-200 dark:border-blue-900/50",
            Optimize: "border-amber-200 dark:border-amber-900/50",
            Pause: "border-rose-200 dark:border-rose-900/50",
          };
          const text: Record<string, string> = {
            Scale: "text-emerald-600 dark:text-emerald-400",
            Test: "text-blue-600 dark:text-blue-400",
            Optimize: "text-amber-600 dark:text-amber-400",
            Pause: "text-rose-600 dark:text-rose-400",
          };
          return (
            <div key={q} className={cn("rounded-xl border bg-card p-3", colors[q])}>
              <p className="text-xs text-muted-foreground">{q}</p>
              <p className={cn("text-2xl font-bold mt-0.5", text[q])}>{byQuadrant[q]}</p>
              <p className="text-[10px] text-muted-foreground">campaigns</p>
            </div>
          );
        })}
      </div>

      <TrendCallouts campaigns={campaigns} avgRoas={avgRoas} avgCtr={avgCtr} />

      {/* View toggle */}
      <div className="flex items-center justify-between">
        <SectionLabel>Campaign Intelligence</SectionLabel>
        <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
          {([["table", "Table"], ["quadrant", "Quadrant"]] as [ViewMode, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "quadrant" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <QuadrantChart campaigns={campaigns} avgRoas={avgRoas} medianSpend={medianSpend} />
          <div className="space-y-2">
            <SectionLabel>Campaigns by Quadrant</SectionLabel>
            <div className="rounded-xl border bg-card overflow-hidden divide-y">
              {campaigns
                .map((c) => ({ ...c, q: computeQuadrant(c.roas, c.spend, avgRoas, medianSpend) }))
                .sort((a, b) => {
                  const order: Record<string, number> = { Scale: 0, Test: 1, Optimize: 2, Pause: 3 };
                  return order[a.q] - order[b.q];
                })
                .map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate max-w-[180px]" title={c.name}>{c.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", CHANNEL_COLORS[c.channel] ?? "bg-muted text-muted-foreground")}>
                          {c.channel}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-xs tabular-nums font-medium">{fmtCurrency(c.spend)}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtRoas(c.roas)} ROAS</p>
                      </div>
                      <QuadrantBadge label={c.q} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : (
        <SimpleTable cols={cols} rows={campaigns} defaultSort="spend" />
      )}
    </div>
  );
}
