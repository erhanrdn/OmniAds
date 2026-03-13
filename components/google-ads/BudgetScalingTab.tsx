"use client";

import { cn } from "@/lib/utils";
import {
  fmtCurrency, fmtNumber, fmtPercent, fmtRoas,
  TabSkeleton, TabEmpty, SimpleTable, ColDef,
  SectionLabel, SpendBar,
} from "./shared";

// ── Types ──────────────────────────────────────────────────────────────

interface BudgetCampaign {
  id: string;
  name: string;
  dailyBudget: number;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  impressions: number;
  clicks: number;
  impressionShare: number | null;
  lostIsBudget: number | null;
  lostIsRank?: number | null;
}

interface BudgetRec {
  campaign: string;
  currentSpend: number;
  suggestedBudgetChange: number;
  direction: "increase" | "decrease";
  reason: string;
}

// ── Spend concentration ────────────────────────────────────────────────

function SpendConcentration({
  campaigns,
  totalSpend,
}: {
  campaigns: BudgetCampaign[];
  totalSpend: number;
}) {
  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend);
  const top5Spend = sorted.slice(0, 5).reduce((s, c) => s + c.spend, 0);
  const top5Pct = totalSpend > 0 ? (top5Spend / totalSpend) * 100 : 0;
  const otherSpend = totalSpend - top5Spend;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold">Spend Concentration</p>
        <p className="text-[10px] text-muted-foreground">
          Top 5 campaigns = {top5Pct.toFixed(0)}% of spend
        </p>
      </div>
      <div className="space-y-2">
        {sorted.slice(0, 8).map((c, i) => {
          const pct = totalSpend > 0 ? ((c.spend / totalSpend) * 100) : 0;
          const roasCls =
            c.roas >= 3 ? "text-emerald-600 dark:text-emerald-400"
            : c.roas < 1 ? "text-rose-600 dark:text-rose-400"
            : "text-muted-foreground";
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs truncate max-w-[180px]" title={c.name}>{c.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{pct.toFixed(1)}%</span>
                </div>
                <SpendBar value={c.spend} max={totalSpend} />
              </div>
              <div className="text-right shrink-0 w-20">
                <p className="text-xs tabular-nums">{fmtCurrency(c.spend)}</p>
                <p className={cn("text-[10px]", roasCls)}>{c.roas > 0 ? fmtRoas(c.roas) : "—"} ROAS</p>
              </div>
            </div>
          );
        })}
        {otherSpend > 0 && sorted.length > 8 && (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-muted-foreground">All other campaigns ({sorted.length - 8})</span>
                <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                  {totalSpend > 0 ? ((otherSpend / totalSpend) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <SpendBar value={otherSpend} max={totalSpend} />
            </div>
            <div className="text-right shrink-0 w-20">
              <p className="text-xs tabular-nums">{fmtCurrency(otherSpend)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scaling candidates ─────────────────────────────────────────────────

function ScalingCandidates({
  campaigns,
  accountAvgRoas,
}: {
  campaigns: BudgetCampaign[];
  accountAvgRoas: number;
}) {
  const candidates = campaigns.filter(
    (c) => c.roas >= accountAvgRoas * 1.1 && (c.lostIsBudget ?? 0) > 0.1 && c.spend > 50
  );

  if (candidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-4">
      <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
        {candidates.length} campaign{candidates.length > 1 ? "s" : ""} ready to scale
      </p>
      <p className="text-[10px] text-emerald-700 dark:text-emerald-300 mb-3">
        Strong ROAS but losing impression share to budget — increasing budgets should yield efficient growth.
      </p>
      <div className="space-y-2">
        {candidates.map((c, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-emerald-900 dark:text-emerald-100 max-w-[200px]" title={c.name}>
              {c.name}
            </span>
            <div className="flex items-center gap-3 shrink-0 text-emerald-700 dark:text-emerald-300">
              <span>{fmtRoas(c.roas)} ROAS</span>
              <span>{fmtPercent((c.lostIsBudget ?? 0) * 100)} lost to budget</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Waste concentration ────────────────────────────────────────────────

function WasteConcentration({
  campaigns,
  accountAvgRoas,
}: {
  campaigns: BudgetCampaign[];
  accountAvgRoas: number;
}) {
  const waste = campaigns
    .filter((c) => (c.spend > 100 && c.conversions === 0) || (c.roas < accountAvgRoas * 0.3 && c.spend > 100))
    .sort((a, b) => b.spend - a.spend);

  if (waste.length === 0) return null;
  const totalWaste = waste.reduce((s, c) => s + c.spend, 0);

  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-4">
      <p className="text-xs font-semibold text-rose-900 dark:text-rose-100 mb-1">
        {fmtCurrency(totalWaste)} in low-efficiency spend
      </p>
      <p className="text-[10px] text-rose-700 dark:text-rose-300 mb-3">
        These campaigns have significant spend with weak or zero returns — reallocate to high performers.
      </p>
      <div className="space-y-2">
        {waste.slice(0, 5).map((c, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-rose-900 dark:text-rose-100 max-w-[200px]" title={c.name}>
              {c.name}
            </span>
            <div className="flex items-center gap-3 shrink-0 text-rose-700 dark:text-rose-300">
              <span>{fmtCurrency(c.spend)} spent</span>
              <span>{c.conversions === 0 ? "0 conv." : `${fmtRoas(c.roas)} ROAS`}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Budget recommendations ─────────────────────────────────────────────

function BudgetRecommendations({ recommendations }: { recommendations: BudgetRec[] }) {
  if (recommendations.length === 0) return null;

  return (
    <div className="space-y-2">
      <SectionLabel>Budget Recommendations</SectionLabel>
      <div className="grid gap-2 sm:grid-cols-2">
        {recommendations.slice(0, 6).map((rec, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-4",
              rec.direction === "increase"
                ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30"
                : "border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30"
            )}
          >
            <p className="text-xs font-semibold truncate" title={rec.campaign}>{rec.campaign}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
            <p className={cn("text-sm font-bold mt-2", rec.direction === "increase" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {rec.direction === "increase" ? "+" : "-"}{fmtCurrency(Math.abs(rec.suggestedBudgetChange))}
              <span className="text-xs font-normal text-muted-foreground ml-1">suggested shift</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Full campaign table ────────────────────────────────────────────────

const cols: ColDef<BudgetCampaign>[] = [
  {
    key: "name", header: "Campaign", accessor: (r) => r.name,
    render: (r) => <span className="text-xs font-medium truncate block max-w-[160px]">{r.name}</span>,
  },
  {
    key: "dailyBudget", header: "Daily Budget", accessor: (r) => r.dailyBudget, align: "right",
    render: (r) => r.dailyBudget > 0 ? fmtCurrency(r.dailyBudget) : "—",
  },
  { key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right", render: (r) => fmtCurrency(r.spend) },
  { key: "conversions", header: "Conv.", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
  {
    key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right",
    render: (r) => (
      <span className={cn("font-semibold", r.roas >= 3 ? "text-emerald-600 dark:text-emerald-400" : r.roas < 1 ? "text-rose-600 dark:text-rose-400" : "")}>
        {r.roas === 0 ? "—" : fmtRoas(r.roas)}
      </span>
    ),
  },
  { key: "cpa", header: "CPA", accessor: (r) => r.cpa === 0 ? 99999 : r.cpa, align: "right", render: (r) => r.conversions === 0 ? "—" : fmtCurrency(r.cpa) },
  {
    key: "impressionShare", header: "IS", accessor: (r) => r.impressionShare ?? 0, align: "right",
    render: (r) => r.impressionShare != null ? fmtPercent(r.impressionShare * 100) : "—",
  },
  {
    key: "lostIsBudget", header: "Lost IS (Budget)", accessor: (r) => r.lostIsBudget ?? 0, align: "right",
    render: (r) => r.lostIsBudget != null && r.lostIsBudget > 0
      ? <span className="text-amber-600 dark:text-amber-400 font-semibold">{fmtPercent(r.lostIsBudget * 100)}</span>
      : "—",
  },
  {
    key: "lostIsRank", header: "Lost IS (Rank)", accessor: (r) => r.lostIsRank ?? 0, align: "right",
    render: (r) => r.lostIsRank != null && r.lostIsRank > 0
      ? <span className="text-rose-600 dark:text-rose-400 font-semibold">{fmtPercent(r.lostIsRank * 100)}</span>
      : "—",
  },
];

// ── Main component ─────────────────────────────────────────────────────

interface BudgetScalingTabProps {
  campaigns?: BudgetCampaign[];
  recommendations?: BudgetRec[];
  totalSpend?: number;
  accountAvgRoas?: number;
  isLoading: boolean;
}

export function BudgetScalingTab({
  campaigns,
  recommendations,
  totalSpend,
  accountAvgRoas,
  isLoading,
}: BudgetScalingTabProps) {
  if (isLoading) return <TabSkeleton />;
  if (!campaigns || campaigns.length === 0) {
    return <TabEmpty message="No budget data found for this period." />;
  }

  const spend = totalSpend ?? campaigns.reduce((s, c) => s + c.spend, 0);
  const avgRoas = accountAvgRoas ?? (spend > 0 ? campaigns.reduce((s, c) => s + c.revenue, 0) / spend : 0);

  // Account summary stats
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const accountRoas = spend > 0 ? totalRevenue / spend : 0;
  const budgetLimited = campaigns.filter((c) => (c.lostIsBudget ?? 0) > 0.15).length;

  return (
    <div className="space-y-5">
      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Spend</p>
          <p className="text-2xl font-bold mt-1">{fmtCurrency(spend)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Revenue</p>
          <p className="text-2xl font-bold mt-1">{fmtCurrency(totalRevenue)}</p>
        </div>
        <div className={cn("rounded-xl border p-4", accountRoas >= 3 ? "border-emerald-200 dark:border-emerald-900/50" : accountRoas < 1 ? "border-rose-200 dark:border-rose-900/50" : "bg-card")}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Account ROAS</p>
          <p className={cn("text-2xl font-bold mt-1", accountRoas >= 3 ? "text-emerald-600 dark:text-emerald-400" : accountRoas < 1 ? "text-rose-600 dark:text-rose-400" : "")}>
            {fmtRoas(accountRoas)}
          </p>
        </div>
        <div className={cn("rounded-xl border p-4", budgetLimited > 0 ? "border-amber-200 dark:border-amber-900/50" : "bg-card")}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Budget-Limited</p>
          <p className={cn("text-2xl font-bold mt-1", budgetLimited > 0 ? "text-amber-600 dark:text-amber-400" : "")}>
            {budgetLimited}
          </p>
          <p className="text-[10px] text-muted-foreground">campaigns losing IS</p>
        </div>
      </div>

      <BudgetRecommendations recommendations={recommendations ?? []} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ScalingCandidates campaigns={campaigns} accountAvgRoas={avgRoas} />
        <WasteConcentration campaigns={campaigns} accountAvgRoas={avgRoas} />
      </div>

      <SpendConcentration campaigns={campaigns} totalSpend={spend} />

      <div>
        <SectionLabel>Campaign Budget Detail</SectionLabel>
        <div className="mt-3">
          <SimpleTable cols={cols} rows={campaigns} defaultSort="spend" />
        </div>
      </div>
    </div>
  );
}
