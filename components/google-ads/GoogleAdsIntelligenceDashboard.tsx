"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  Image,
  KeyRound,
  LayoutDashboard,
  Map,
  Megaphone,
  Package,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users2,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CampaignBadges,
  ColDef,
  HealthBadge,
  PerfBadge,
  SectionLabel,
  SimpleTable,
  SpendBar,
  StatusBadge,
  TabAlert,
  TabEmpty,
  TabSkeleton,
  fmtCurrency,
  fmtNumber,
  fmtPercent,
  fmtRoas,
} from "@/components/google-ads/shared";

type DateRange = "7" | "14" | "30";

type TabId =
  | "overview"
  | "campaigns"
  | "search-intelligence"
  | "keywords"
  | "assets"
  | "asset-groups"
  | "products"
  | "audiences"
  | "geo-devices"
  | "budget-scaling"
  | "opportunities"
  | "diagnostics";

type MetaShape = {
  partial?: boolean;
  warnings?: string[];
  failed_queries?: Array<{ query: string; message: string; customerId?: string }>;
  unavailable_metrics?: string[];
};

type QueryResult = {
  rows?: Array<Record<string, any>>;
  data?: Array<Record<string, any>>;
  summary?: Record<string, any>;
  insights?: any;
  meta?: MetaShape;
  [key: string]: any;
};

const DATE_RANGE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
];

const TAB_GROUPS: Array<{
  label: string;
  tabs: Array<{ id: TabId; label: string; icon: LucideIcon }>;
}> = [
  {
    label: "Decision",
    tabs: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "campaigns", label: "Campaigns", icon: Megaphone },
      { id: "budget-scaling", label: "Budget & Scaling", icon: WalletCards },
      { id: "opportunities", label: "Opportunities", icon: Sparkles },
    ],
  },
  {
    label: "Demand",
    tabs: [
      { id: "search-intelligence", label: "Search Intelligence", icon: Target },
      { id: "keywords", label: "Keywords", icon: KeyRound },
      { id: "products", label: "Products", icon: Package },
    ],
  },
  {
    label: "PMax & Assets",
    tabs: [
      { id: "assets", label: "Assets", icon: Image },
      { id: "asset-groups", label: "Asset Groups", icon: Boxes },
    ],
  },
  {
    label: "Targeting & Trust",
    tabs: [
      { id: "audiences", label: "Audience Intelligence", icon: Users2 },
      { id: "geo-devices", label: "Geo & Devices", icon: Map },
      { id: "diagnostics", label: "Diagnostics", icon: ShieldAlert },
    ],
  },
];

async function fetchReport(
  endpoint: string,
  businessId: string,
  dateRange: DateRange,
  extra: Record<string, string> = {}
): Promise<QueryResult> {
  const params = new URLSearchParams({ businessId, dateRange, ...extra });
  const response = await fetch(`/api/google-ads/${endpoint}?${params.toString()}`);
  const data = (await response.json()) as QueryResult & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Failed to fetch ${endpoint}`);
  }
  return data;
}

function firstRows(data?: QueryResult | null) {
  return (data?.rows ?? data?.data ?? []) as Array<Record<string, any>>;
}

function combineMetas(metas: Array<MetaShape | null | undefined>) {
  const combined = {
    partial: false,
    warnings: [] as string[],
    failed_queries: [] as Array<{ query: string; message: string; customerId?: string }>,
    unavailable_metrics: [] as string[],
  };

  for (const meta of metas) {
    if (!meta) continue;
    combined.partial = combined.partial || Boolean(meta.partial);
    combined.warnings.push(...(meta.warnings ?? []));
    combined.failed_queries.push(...(meta.failed_queries ?? []));
    combined.unavailable_metrics.push(...(meta.unavailable_metrics ?? []));
  }

  return {
    partial: combined.partial,
    warnings: Array.from(new Set(combined.warnings)),
    failed_queries: combined.failed_queries,
    unavailable_metrics: Array.from(new Set(combined.unavailable_metrics)),
  };
}

function deltaTone(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "neutral";
  return value > 0 ? "up" : "down";
}

function formatDelta(value: number | null | undefined, suffix = "%") {
  if (value === null || value === undefined) return "New";
  if (value === 0) return "Flat";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}${suffix}`;
}

function percentNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return fmtPercent(value);
}

function renderTrendBadge(value: number | null | undefined) {
  const tone = deltaTone(value);
  const cls =
    tone === "up"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "down"
      ? "bg-rose-100 text-rose-800"
      : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", cls)}>
      {tone === "up" ? <TrendingUp className="mr-1 h-3 w-3" /> : tone === "down" ? <TrendingDown className="mr-1 h-3 w-3" /> : null}
      {formatDelta(value)}
    </span>
  );
}

function ActionStateBadge({ state }: { state: string }) {
  const cls =
    state === "scale"
      ? "bg-emerald-100 text-emerald-800"
      : state === "reduce"
      ? "bg-rose-100 text-rose-800"
      : state === "test"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-800";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", cls)}>
      {state}
    </span>
  );
}

function PerformanceLabelBadge({ label }: { label: string }) {
  const cls =
    label === "leader"
      ? "bg-emerald-100 text-emerald-800"
      : label === "at-risk"
      ? "bg-rose-100 text-rose-800"
      : label === "watch"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-800";

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", cls)}>
      {label}
    </span>
  );
}

function SectionCard({
  title,
  description,
  children,
  action,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  delta,
  tone = "neutral",
  sublabel,
}: {
  label: string;
  value: string;
  delta?: number | null;
  tone?: "neutral" | "highlight";
  sublabel?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4",
        tone === "highlight" && "border-emerald-200 bg-emerald-50/70"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className={cn("text-2xl font-semibold tracking-tight", tone === "highlight" && "text-emerald-700")}>
            {value}
          </p>
          {sublabel ? <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p> : null}
        </div>
        {delta !== undefined ? renderTrendBadge(delta) : null}
      </div>
    </div>
  );
}

function InsightStrip({
  title,
  value,
  note,
  tone = "neutral",
}: {
  title: string;
  value: string;
  note: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "bad"
      ? "border-rose-200 bg-rose-50"
      : "bg-muted/30";
  return (
    <div className={cn("rounded-2xl border p-4", cls)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function OpportunityCard({ opportunity }: { opportunity: Record<string, any> }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
            {String(opportunity.type ?? "").replaceAll("_", " ")}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">
            {opportunity.confidence ?? "medium"} confidence
          </span>
        </div>
        <ActionStateBadge state={opportunity.priority ?? "medium"} />
      </div>
      <h4 className="mt-3 text-sm font-semibold">{opportunity.title}</h4>
      <p className="mt-1 text-xs text-muted-foreground">{opportunity.whyItMatters}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Impact</p>
          <p className="mt-1 text-xs font-medium">{opportunity.impact ?? opportunity.expectedImpact}</p>
        </div>
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Effort</p>
          <p className="mt-1 text-xs font-medium capitalize">{opportunity.effort}</p>
        </div>
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Evidence</p>
          <p className="mt-1 text-xs font-medium">{opportunity.evidence}</p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-dashed p-3">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
          Recommended Action
        </p>
        <p className="mt-1 text-xs">{opportunity.recommendedAction ?? opportunity.expectedImpact}</p>
      </div>
    </div>
  );
}

function MixCell({
  spendShare,
  revenueShare,
}: {
  spendShare: number;
  revenueShare: number;
}) {
  const max = Math.max(spendShare, revenueShare, 1);
  return (
    <div className="min-w-[120px]">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Spend {spendShare.toFixed(1)}%</span>
        <span>Revenue {revenueShare.toFixed(1)}%</span>
      </div>
      <div className="mt-1 space-y-1">
        <SpendBar value={spendShare} max={max} />
        <SpendBar value={revenueShare} max={max} />
      </div>
    </div>
  );
}

function QueryIssueBanner({ meta }: { meta: ReturnType<typeof combineMetas> }) {
  const failures = meta.failed_queries.map(
    (failure) => `${failure.query}${failure.customerId ? ` (${failure.customerId})` : ""}: ${failure.message}`
  );

  return (
    <div className="space-y-3">
      <TabAlert tone="error" title="Query failures" items={failures} />
      <TabAlert tone="warning" title="Partial data" items={meta.warnings} />
      <TabAlert
        tone="info"
        title="Unavailable metrics"
        items={meta.unavailable_metrics.map((metric) => metric.replaceAll("_", " "))}
      />
    </div>
  );
}

function OverviewView({
  overview,
  campaigns,
  opportunities,
  budget,
  products,
}: {
  overview: QueryResult | undefined;
  campaigns: Array<Record<string, any>>;
  opportunities: Array<Record<string, any>>;
  budget: Array<Record<string, any>>;
  products: Array<Record<string, any>>;
}) {
  if (!overview?.kpis) {
    return <TabEmpty message="No overview data is available for this period." />;
  }

  const kpis = overview.kpis as Record<string, number>;
  const deltas = (overview.kpiDeltas ?? {}) as Record<string, number | null>;
  const improved = [...campaigns]
    .filter((campaign) => Number(campaign.roasChange ?? 0) > 0)
    .sort((a, b) => Number(b.roasChange ?? 0) - Number(a.roasChange ?? 0))
    .slice(0, 3);
  const declined = [...campaigns]
    .filter((campaign) => Number(campaign.roasChange ?? 0) < 0)
    .sort((a, b) => Number(a.roasChange ?? 0) - Number(b.roasChange ?? 0))
    .slice(0, 3);
  const topDrivers = [...campaigns]
    .filter((campaign) => campaign.actionState === "scale")
    .sort((a, b) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0))
    .slice(0, 4);
  const spendWaste = [...campaigns]
    .filter((campaign) => campaign.actionState === "reduce" || campaign.badges?.includes("wasted_spend"))
    .sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0))
    .slice(0, 4);
  const scalingHeadroom = [...budget]
    .filter((row) => Number(row.lostIsBudget ?? 0) > 0.1 && Number(row.roas ?? 0) >= Number(overview.kpis.roas ?? 0))
    .slice(0, 4);
  const topProducts = [...products]
    .sort((a, b) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0))
    .slice(0, 3);
  const budgetPressure = budget.filter((row) => Number(row.lostIsBudget ?? 0) > 0.15).length;
  const dataHealth = opportunities.length > 0 ? "healthy" : "warning";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Spend" value={fmtCurrency(Number(kpis.spend ?? 0))} delta={deltas.spend} />
        <MetricCard label="Revenue" value={fmtCurrency(Number(kpis.revenue ?? 0))} delta={deltas.revenue} tone="highlight" />
        <MetricCard label="ROAS" value={fmtRoas(Number(kpis.roas ?? 0))} delta={deltas.roas} tone="highlight" />
        <MetricCard label="Conversions" value={fmtNumber(Number(kpis.conversions ?? 0))} delta={deltas.conversions} />
        <MetricCard label="CPA" value={fmtCurrency(Number(kpis.cpa ?? 0))} delta={deltas.cpa} sublabel="Lower is better" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr,0.9fr]">
        <SectionCard
          title="What To Act On First"
          description="The highest-value actions based on current performance, efficiency pressure, and revenue upside."
        >
          <div className="space-y-3">
            {opportunities.slice(0, 3).map((opportunity) => (
              <OpportunityCard key={String(opportunity.id)} opportunity={opportunity} />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Account Health"
          description="A quick read on budget pressure, waste, concentration, and data trust."
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-muted/30 p-3">
              <div>
                <p className="text-xs font-semibold">Budget Pressure</p>
                <p className="text-xs text-muted-foreground">{budgetPressure} campaigns are budget-limited.</p>
              </div>
              <HealthBadge state={budgetPressure > 0 ? "warning" : "healthy"} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/30 p-3">
              <div>
                <p className="text-xs font-semibold">Waste Exposure</p>
                <p className="text-xs text-muted-foreground">{spendWaste.length} campaigns are consuming weak spend.</p>
              </div>
              <HealthBadge state={spendWaste.length > 0 ? "critical" : "healthy"} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/30 p-3">
              <div>
                <p className="text-xs font-semibold">Product Dependency</p>
                <p className="text-xs text-muted-foreground">
                  Top 3 products account for {((Number(products.slice(0, 3).reduce((sum, row) => sum + Number(row.spend ?? 0), 0)) / Math.max(Number(products.reduce((sum, row) => sum + Number(row.spend ?? 0), 0)), 1)) * 100).toFixed(0)}% of tracked product spend.
                </p>
              </div>
              <HealthBadge state={products.length > 0 ? "warning" : "neutral"} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/30 p-3">
              <div>
                <p className="text-xs font-semibold">Data Trust</p>
                <p className="text-xs text-muted-foreground">Diagnostics are ready with meta coverage across tabs.</p>
              </div>
              <HealthBadge state={dataHealth as "healthy" | "warning"} />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Improved" description="Campaigns gaining efficiency or revenue versus the previous period.">
          <div className="space-y-3">
            {improved.length === 0 ? (
              <p className="text-xs text-muted-foreground">No clear improving campaigns yet.</p>
            ) : (
              improved.map((campaign) => (
                <div key={String(campaign.id)} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold">{campaign.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {campaign.channel} · {fmtRoas(Number(campaign.roas ?? 0))}
                      </p>
                    </div>
                    {renderTrendBadge(Number(campaign.roasChange ?? 0))}
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Declined" description="Campaigns that lost efficiency and deserve faster review.">
          <div className="space-y-3">
            {declined.length === 0 ? (
              <p className="text-xs text-muted-foreground">No sharp efficiency declines detected.</p>
            ) : (
              declined.map((campaign) => (
                <div key={String(campaign.id)} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold">{campaign.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {campaign.channel} · {fmtCurrency(Number(campaign.spend ?? 0))} spend
                      </p>
                    </div>
                    {renderTrendBadge(Number(campaign.roasChange ?? 0))}
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Scale Signals" description="High-ROAS drivers with budget or product headroom.">
          <div className="space-y-3">
            {topDrivers.slice(0, 2).map((campaign) => (
              <div key={String(campaign.id)} className="rounded-xl border p-3">
                <p className="text-xs font-semibold">{campaign.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmtRoas(Number(campaign.roas ?? 0))} ROAS · {campaign.lostIsBudget ? percentNumber(Number(campaign.lostIsBudget) * 100) : "No"} budget loss
                </p>
              </div>
            ))}
            {topProducts.map((product) => (
              <div key={String(product.itemId)} className="rounded-xl border p-3">
                <p className="text-xs font-semibold">{product.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmtRoas(Number(product.roas ?? 0))} ROAS · {fmtCurrency(Number(product.revenue ?? 0))} revenue
                </p>
              </div>
            ))}
            {topDrivers.length === 0 && topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Scale signals will appear as soon as tracked winners emerge.</p>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Drivers" description="Where the account is creating the most return right now.">
          <div className="space-y-3">
            {topDrivers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No scale-ready campaigns identified yet.</p>
            ) : (
              topDrivers.map((campaign) => (
                <div key={String(campaign.id)} className="rounded-xl bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold">{campaign.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Spend share {campaign.spendShare}% vs revenue share {campaign.revenueShare}%
                      </p>
                    </div>
                    <MixCell
                      spendShare={Number(campaign.spendShare ?? 0)}
                      revenueShare={Number(campaign.revenueShare ?? 0)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Spend Waste Highlights" description="Where money is working hardest against the account.">
          <div className="space-y-3">
            {spendWaste.length === 0 ? (
              <p className="text-xs text-muted-foreground">No obvious spend waste hotspots surfaced for this period.</p>
            ) : (
              spendWaste.map((campaign) => (
                <div key={String(campaign.id)} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-rose-900">{campaign.name}</p>
                      <p className="text-[11px] text-rose-700">
                        {fmtCurrency(Number(campaign.spend ?? 0))} spend · {fmtRoas(Number(campaign.roas ?? 0))} ROAS
                      </p>
                    </div>
                    <ActionStateBadge state={String(campaign.actionState ?? "reduce")} />
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Scaling Opportunities" description="Campaigns with budget pressure and enough efficiency to justify more spend.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {scalingHeadroom.length === 0 ? (
            <p className="text-xs text-muted-foreground">No budget-limited winners detected in this period.</p>
          ) : (
            scalingHeadroom.map((row) => (
              <InsightStrip
                key={String(row.id)}
                title={row.name}
                value={`${fmtRoas(Number(row.roas ?? 0))} ROAS`}
                note={`${percentNumber(Number(row.lostIsBudget ?? 0) * 100)} lost to budget`}
                tone="good"
              />
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function CampaignsView({ rows }: { rows: Array<Record<string, any>> }) {
  if (rows.length === 0) {
    return <TabEmpty message="No campaign intelligence is available for this period." />;
  }

  const counts = {
    scale: rows.filter((row) => row.actionState === "scale").length,
    optimize: rows.filter((row) => row.actionState === "optimize").length,
    test: rows.filter((row) => row.actionState === "test").length,
    reduce: rows.filter((row) => row.actionState === "reduce").length,
  };

  const campaignCols: Array<ColDef<Record<string, any>>> = [
    {
      key: "name",
      header: "Campaign",
      accessor: (row) => String(row.name ?? ""),
      render: (row) => (
        <div className="max-w-[230px]">
          <p className="text-xs font-semibold">{row.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <StatusBadge status={String(row.status ?? "")} />
            <ActionStateBadge state={String(row.actionState ?? "optimize")} />
            <PerformanceLabelBadge label={String(row.performanceLabel ?? "stable")} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {row.channel}
            </span>
            {Array.isArray(row.badges) && row.badges.length > 0 ? (
              <CampaignBadges badges={row.badges as string[]} />
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "mix",
      header: "Spend vs Revenue Mix",
      accessor: (row) => Number(row.revenueShare ?? 0) - Number(row.spendShare ?? 0),
      render: (row) => (
        <MixCell
          spendShare={Number(row.spendShare ?? 0)}
          revenueShare={Number(row.revenueShare ?? 0)}
        />
      ),
    },
    {
      key: "trend",
      header: "Trend",
      accessor: (row) => Number(row.roasChange ?? 0),
      render: (row) => (
        <div className="space-y-1">
          {renderTrendBadge(Number(row.roasChange ?? 0))}
          <p className="text-[10px] text-muted-foreground">
            Rev {formatDelta(Number(row.revenueChange ?? 0))}
          </p>
        </div>
      ),
    },
    { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
    { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
    { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
    { key: "cpa", header: "CPA", accessor: (row) => Number(row.cpa ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.cpa ?? 0)) },
    { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
    { key: "ctr", header: "CTR", accessor: (row) => Number(row.ctr ?? 0), align: "right", render: (row) => percentNumber(Number(row.ctr ?? 0)) },
    {
      key: "conversionRate",
      header: "CVR",
      accessor: (row) => Number(row.conversionRate ?? 0),
      align: "right",
      render: (row) => (row.conversionRate != null ? percentNumber(Number(row.conversionRate ?? 0)) : "—"),
    },
    {
      key: "impressionShare",
      header: "IS",
      accessor: (row) => Number(row.impressionShare ?? 0),
      align: "right",
      render: (row) => (row.impressionShare != null ? fmtPercent(Number(row.impressionShare ?? 0) * 100) : "—"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InsightStrip title="Scale" value={String(counts.scale)} note="High-return campaigns with headroom" tone="good" />
        <InsightStrip title="Optimize" value={String(counts.optimize)} note="Solid performers with room to tune" />
        <InsightStrip title="Test" value={String(counts.test)} note="Needs more signal or cleaner structure" />
        <InsightStrip title="Reduce" value={String(counts.reduce)} note="Spend is outrunning value" tone="bad" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Scale Now" description="Campaigns combining efficiency with clear room to grow.">
          <div className="space-y-3">
            {rows.filter((row) => row.actionState === "scale").slice(0, 4).map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-emerald-900">{row.name}</p>
                    <p className="text-[11px] text-emerald-700">
                      {fmtRoas(Number(row.roas ?? 0))} ROAS · {fmtPercent(Number(row.lostIsBudget ?? 0) * 100)} lost to budget
                    </p>
                  </div>
                  {renderTrendBadge(Number(row.revenueChange ?? 0))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Reduce Or Rebuild" description="Campaigns where spend share is ahead of revenue share.">
          <div className="space-y-3">
            {rows.filter((row) => row.actionState === "reduce").slice(0, 4).map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-rose-900">{row.name}</p>
                    <p className="text-[11px] text-rose-700">
                      Spend share {row.spendShare}% vs revenue share {row.revenueShare}%
                    </p>
                  </div>
                  <ActionStateBadge state="reduce" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Campaign Intelligence" description="Performance labels, share-of-wallet context, trend signals, and scale state in one view.">
        <SimpleTable cols={campaignCols} rows={rows} defaultSort="spend" />
      </SectionCard>
    </div>
  );
}

function SearchIntelligenceView({
  rows,
  summary,
  insights,
}: {
  rows: Array<Record<string, any>>;
  summary: Record<string, any>;
  insights: Record<string, any>;
}) {
  if (rows.length === 0) {
    return <TabEmpty message="No search intelligence is available for this period." />;
  }

  const clusterCols: Array<ColDef<Record<string, any>>> = [
    {
      key: "cluster",
      header: "Intent Cluster",
      accessor: (row) => String(row.cluster ?? ""),
      render: (row) => (
        <div className="max-w-[220px]">
          <p className="text-xs font-semibold">{row.cluster}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">
              {row.intent}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {row.state}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{row.examples?.join(", ")}</p>
        </div>
      ),
    },
    { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
    { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
    { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
    { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
    {
      key: "recommendation",
      header: "Recommendation",
      accessor: (row) => String(row.recommendation ?? ""),
      render: (row) => (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
          {row.recommendation}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Add As Exact" value={fmtNumber(Number(summary.keywordOpportunityCount ?? 0))} sublabel="Converting queries not yet keywords" />
        <MetricCard label="Recommended Negatives" value={fmtNumber(Number(summary.negativeKeywordCount ?? 0))} sublabel="Wasteful terms to block" />
        <MetricCard label="Wasteful Spend" value={fmtCurrency(Number(summary.wastefulSpend ?? 0))} sublabel="Spend tied to negative candidates" />
        <MetricCard label="Promotion Suggestions" value={fmtNumber(Number(summary.promotionSuggestionCount ?? 0))} sublabel="High-value language worth echoing in ads" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Add As Exact Keyword" description="High-intent converting queries not yet under direct bid control.">
          <div className="space-y-3">
            {(insights.keywordCandidates ?? []).slice(0, 4).map((row: Record<string, any>) => (
              <div key={String(row.key)} className="rounded-xl border p-3">
                <p className="text-xs font-semibold">{row.searchTerm}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmtNumber(Number(row.conversions ?? 0))} conv · {fmtRoas(Number(row.roas ?? 0))} ROAS
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Add As Negative" description="Queries spending without enough conversion proof.">
          <div className="space-y-3">
            {(insights.negativeCandidates ?? []).slice(0, 4).map((row: Record<string, any>) => (
              <div key={String(row.key)} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-900">{row.searchTerm}</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  {fmtCurrency(Number(row.spend ?? 0))} spend · {fmtNumber(Number(row.clicks ?? 0))} clicks
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Promotion Suggestions" description="Winning search language that deserves stronger message coverage.">
          <div className="space-y-3">
            {(insights.promotionCandidates ?? []).slice(0, 4).map((row: Record<string, any>) => (
              <div key={String(row.key)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">{row.searchTerm}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · {row.campaign}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Intent Clusters" description="Grouped search demand so teams can see patterns, not just raw rows.">
        <SimpleTable
          cols={clusterCols}
          rows={(insights.clusters ?? []) as Array<Record<string, any>>}
          defaultSort="spend"
        />
      </SectionCard>

      <SectionCard title="Query Detail" description="Search and Performance Max query coverage with recommended next actions.">
        <SimpleTable
          cols={[
            {
              key: "searchTerm",
              header: "Query",
              accessor: (row) => String(row.searchTerm ?? ""),
              render: (row) => (
                <div className="max-w-[220px]">
                  <p className="text-xs font-semibold">{row.searchTerm}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {row.campaign} · {row.matchSource}
                  </p>
                </div>
              ),
            },
            { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
            { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
            { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
            {
              key: "recommendation",
              header: "Action",
              accessor: (row) => String(row.recommendation ?? ""),
              render: (row) => (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {row.recommendation}
                </span>
              ),
            },
          ]}
          rows={rows}
          defaultSort="spend"
        />
      </SectionCard>
    </div>
  );
}

function KeywordsView({ rows, summary, meta }: { rows: Array<Record<string, any>>; summary: Record<string, any>; meta: MetaShape | null }) {
  if (rows.length === 0) {
    return <TabEmpty message="No keyword management data is available for this period." />;
  }

  const qsAvailable = rows.some((row) => row.qualityScore != null);
  const wastingCount = rows.filter((row) => Number(row.spend ?? 0) > 20 && Number(row.conversions ?? 0) === 0).length;
  const scaleCount = rows.filter((row) => Number(row.conversions ?? 0) >= 3 && Number(row.impressionShare ?? 1) < 0.4).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="High CTR, Low Conv." value={fmtNumber(Number(summary.highCtrLowConvCount ?? 0))} sublabel="Likely landing page or intent mismatch" />
        <MetricCard label="Scale Candidates" value={fmtNumber(scaleCount)} sublabel="Low impression share despite conversions" />
        <MetricCard label="Wasting Keywords" value={fmtNumber(wastingCount)} sublabel="Spend without sufficient conversion value" />
        <MetricCard label="Quality Coverage" value={qsAvailable ? "Available" : "Limited"} sublabel={qsAvailable ? "QS signals are flowing" : "Google quality fields unavailable"} />
      </div>

      <SectionCard
        title="Keyword Intelligence"
        description="Keyword-level management with honest quality signals and impression-share context."
        action={
          meta?.unavailable_metrics?.length ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              Quality signals partial
            </span>
          ) : null
        }
      >
        <SimpleTable
          cols={[
            {
              key: "keyword",
              header: "Keyword",
              accessor: (row) => String(row.keyword ?? ""),
              render: (row) => (
                <div className="max-w-[220px]">
                  <p className="text-xs font-semibold">{row.keyword}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {row.matchType}
                    </span>
                    <StatusBadge status={String(row.status ?? "")} />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {row.campaign} · {row.adGroup}
                  </p>
                </div>
              ),
            },
            { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
            { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
            { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
            { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
            { key: "cpa", header: "CPA", accessor: (row) => Number(row.cpa ?? 0), align: "right", render: (row) => (Number(row.conversions ?? 0) > 0 ? fmtCurrency(Number(row.cpa ?? 0)) : "—") },
            {
              key: "impressionShare",
              header: "IS",
              accessor: (row) => Number(row.impressionShare ?? 0),
              align: "right",
              render: (row) => (row.impressionShare != null ? fmtPercent(Number(row.impressionShare ?? 0) * 100) : "—"),
            },
            {
              key: "qualityScore",
              header: "QS",
              accessor: (row) => Number(row.qualityScore ?? 0),
              align: "right",
              render: (row) => (row.qualityScore != null ? `${row.qualityScore}/10` : "—"),
            },
            { key: "ctr", header: "CTR", accessor: (row) => Number(row.ctr ?? 0), align: "right", render: (row) => percentNumber(Number(row.ctr ?? 0)) },
          ]}
          rows={rows}
          defaultSort="spend"
        />
      </SectionCard>
    </div>
  );
}

function AssetsView({ rows, summary }: { rows: Array<Record<string, any>>; summary: Record<string, any> }) {
  if (rows.length === 0) {
    return <TabEmpty message="No Google asset performance data is available for this period." />;
  }

  const byType = (summary.typeBreakdown ?? []) as Array<Record<string, any>>;
  const underperformers = rows.filter((row) => row.performanceLabel === "underperforming").slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Top Performing" value={fmtNumber(Number(summary.topPerformingCount ?? 0))} sublabel="Best-labelled assets" />
        <MetricCard label="Underperforming" value={fmtNumber(Number(summary.underperformingCount ?? 0))} sublabel="Needs refresh or replacement" />
        <MetricCard label="Low CTR / IR" value={fmtNumber(Number(summary.lowCtrCount ?? 0))} sublabel="Below-account engagement quality" />
        <MetricCard label="Asset Types" value={fmtNumber(byType.length)} sublabel="Headline, image, video, and more" />
      </div>

      <SectionCard title="Coverage By Asset Type" description="Real Google asset semantics, not ad-level creative clones.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {byType.map((entry) => (
            <InsightStrip
              key={String(entry.type)}
              title={String(entry.type)}
              value={fmtNumber(Number(entry.count ?? 0))}
              note="Tracked asset count"
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Optimization Hints" description="The clearest weak points based on interaction and conversion quality.">
        <div className="grid gap-3 xl:grid-cols-3">
          {underperformers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No underperforming assets surfaced for this period.</p>
          ) : (
            underperformers.map((asset) => (
              <div key={String(asset.id)} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <PerfBadge label="underperforming" />
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                    {asset.type}
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold text-rose-900">{asset.preview}</p>
                <p className="mt-1 text-[11px] text-rose-700">{asset.hint || "Refresh asset messaging and variety."}</p>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard title="Asset Performance" description="Preview, asset type, related campaign context, and performance labels.">
        <SimpleTable
          cols={[
            {
              key: "preview",
              header: "Asset",
              accessor: (row) => String(row.preview ?? ""),
              render: (row) => (
                <div className="max-w-[240px]">
                  <div className="mb-1 flex items-center gap-2">
                    <PerfBadge label={row.performanceLabel as "top" | "average" | "underperforming"} />
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {row.type}
                    </span>
                  </div>
                  <p className="text-xs font-semibold">{row.preview}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {row.campaign} · {row.assetGroup}
                  </p>
                </div>
              ),
            },
            { key: "impressions", header: "Impr.", accessor: (row) => Number(row.impressions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.impressions ?? 0)) },
            { key: "interactions", header: "Interactions", accessor: (row) => Number(row.interactions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.interactions ?? 0)) },
            {
              key: "interactionRate",
              header: "IR / CTR",
              accessor: (row) => Number(row.interactionRate ?? row.ctr ?? 0),
              align: "right",
              render: (row) => row.interactionRate != null ? percentNumber(Number(row.interactionRate ?? 0)) : percentNumber(Number(row.ctr ?? 0)),
            },
            { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
            { key: "revenue", header: "Value", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
            { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => (Number(row.revenue ?? 0) > 0 ? fmtRoas(Number(row.roas ?? 0)) : "—") },
            { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
          ]}
          rows={rows}
          defaultSort="spend"
        />
      </SectionCard>

      <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
        <p className="text-sm font-semibold">Future AI Layer</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Suggested replacement headlines, asset gap detection, and message-angle generation can land here without changing the underlying report contract.
        </p>
      </div>
    </div>
  );
}

function AssetGroupsView({ rows, summary }: { rows: Array<Record<string, any>>; summary: Record<string, any> }) {
  if (rows.length === 0) {
    return <TabEmpty message="No Performance Max asset groups were found for this period." />;
  }

  const weakGroup = rows.find((row) => row.state === "weak");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Strong Groups" value={fmtNumber(Number(summary.strongCount ?? 0))} sublabel="Ready to scale or defend" />
        <MetricCard label="Weak Groups" value={fmtNumber(Number(summary.weakCount ?? 0))} sublabel="Budget consumers with weak return" />
        <MetricCard label="Coverage Gaps" value={fmtNumber(Number(summary.coverageGaps ?? 0))} sublabel="Missing required asset variety" />
        <MetricCard label="Search Themes" value={fmtNumber(Number(summary.searchThemeCount ?? 0))} sublabel="Configured PMax theme signals" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Scale Candidates" description="Strong asset groups with healthy return and coverage.">
          <div className="space-y-3">
            {(rows.filter((row) => row.state === "strong").slice(0, 4)).map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">{row.name}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · coverage {row.coverageScore}%
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Coverage & Theme Risk" description="Underpowered groups missing enough assets or aligned search themes.">
          <div className="space-y-3">
            {weakGroup ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-900">{weakGroup.name}</p>
                <p className="mt-1 text-[11px] text-amber-700">
                  {weakGroup.coverageScore}% coverage · {weakGroup.searchThemeAlignedCount}/{weakGroup.searchThemeCount} themes aligned in messaging
                </p>
                <p className="mt-2 text-xs text-amber-800">
                  Missing: {Array.isArray(weakGroup.missingAssetFields) && weakGroup.missingAssetFields.length > 0 ? weakGroup.missingAssetFields.join(", ") : "No required types missing"}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No obvious coverage or search-theme mismatch surfaced.</p>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Asset Group Intelligence" description="Performance Max asset groups with share-of-spend, coverage, and search-theme alignment.">
        <SimpleTable
          cols={[
            {
              key: "name",
              header: "Asset Group",
              accessor: (row) => String(row.name ?? ""),
              render: (row) => (
                <div className="max-w-[240px]">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 capitalize">
                      {row.state}
                    </span>
                    <StatusBadge status={String(row.status ?? "")} />
                  </div>
                  <p className="text-xs font-semibold">{row.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {row.campaign} · {row.searchThemeCount} search themes
                  </p>
                  {row.searchThemeSummary ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">{row.searchThemeSummary}</p>
                  ) : null}
                </div>
              ),
            },
            {
              key: "mix",
              header: "Spend vs Revenue",
              accessor: (row) => Number(row.revenueShare ?? 0) - Number(row.spendShare ?? 0),
              render: (row) => (
                <MixCell
                  spendShare={Number(row.spendShare ?? 0)}
                  revenueShare={Number(row.revenueShare ?? 0)}
                />
              ),
            },
            { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
            { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
            { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
            { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
            { key: "coverage", header: "Coverage", accessor: (row) => Number(row.coverageScore ?? 0), align: "right", render: (row) => `${row.coverageScore}%` },
            {
              key: "themes",
              header: "Theme Alignment",
              accessor: (row) => Number(row.searchThemeAlignedCount ?? 0),
              align: "right",
              render: (row) => `${row.searchThemeAlignedCount}/${row.searchThemeCount}`,
            },
          ]}
          rows={rows}
          defaultSort="spend"
        />
      </SectionCard>
    </div>
  );
}

function ProductsView({ rows, summary, insights }: { rows: Array<Record<string, any>>; summary: Record<string, any>; insights: Record<string, any> }) {
  if (rows.length === 0) {
    return <TabEmpty message="No product-level Google Ads data is available for this period." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Spend" value={fmtCurrency(Number(summary.totalSpend ?? 0))} sublabel="Tracked product-level spend" />
        <MetricCard label="Revenue" value={fmtCurrency(Number(summary.totalRevenue ?? 0))} sublabel="Tracked conversion value" tone="highlight" />
        <MetricCard label="Scale Candidates" value={fmtNumber(Number(summary.scaleCandidates ?? 0))} sublabel="Products with strong return" />
        <MetricCard label="Top 3 Concentration" value={`${Number(summary.spendConcentrationTop3 ?? 0) * 100}%`} sublabel="Dependency risk across leading products" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Top Revenue Products" description="Products creating the most value from paid demand.">
          <div className="space-y-3">
            {(insights.topRevenueProducts ?? []).slice(0, 4).map((row: Record<string, any>) => (
              <div key={String(row.itemId)} className="rounded-xl border p-3">
                <p className="text-xs font-semibold">{row.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmtCurrency(Number(row.revenue ?? 0))} revenue · {fmtRoas(Number(row.roas ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Low-ROAS Products" description="Products spending enough to justify review or budget cuts.">
          <div className="space-y-3">
            {(insights.lowRoasProducts ?? []).slice(0, 4).map((row: Record<string, any>) => (
              <div key={String(row.itemId)} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-900">{row.title}</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  {fmtCurrency(Number(row.spend ?? 0))} spend · {fmtRoas(Number(row.roas ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Spend Without Enough Return" description="Products absorbing spend with weak contribution proxy.">
          <div className="space-y-3">
            {(insights.spendWithoutReturn ?? []).slice(0, 4).map((row: Record<string, any>) => (
              <div key={String(row.itemId)} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">{row.title}</p>
                <p className="mt-1 text-[11px] text-amber-700">
                  Contribution proxy {fmtCurrency(Number(row.contributionProxy ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Product Intelligence" description="Which products are really receiving spend, value, and budget trust.">
        <SimpleTable
          cols={[
            {
              key: "title",
              header: "Product",
              accessor: (row) => String(row.title ?? ""),
              render: (row) => (
                <div className="max-w-[220px]">
                  <p className="text-xs font-semibold">{row.title}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {row.brand ?? "No brand"} · {row.feedPrice ? fmtCurrency(Number(row.feedPrice)) : "Feed price unavailable"}
                  </p>
                  <div className="mt-1">
                    <ActionStateBadge state={String(row.statusLabel ?? "stable")} />
                  </div>
                </div>
              ),
            },
            { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
            { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
            { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
            { key: "conversions", header: "Orders", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
            { key: "cpa", header: "CPA", accessor: (row) => Number(row.cpa ?? 0), align: "right", render: (row) => (Number(row.conversions ?? 0) > 0 ? fmtCurrency(Number(row.cpa ?? 0)) : "—") },
            {
              key: "contributionProxy",
              header: "Contribution Proxy",
              accessor: (row) => Number(row.contributionProxy ?? 0),
              align: "right",
              render: (row) => (
                <span className={cn(Number(row.contributionProxy ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {fmtCurrency(Number(row.contributionProxy ?? 0))}
                </span>
              ),
            },
            {
              key: "statusLabel",
              header: "State",
              accessor: (row) => String(row.statusLabel ?? ""),
              align: "right",
              render: (row) => <ActionStateBadge state={String(row.statusLabel ?? "stable")} />,
            },
          ]}
          rows={rows}
          defaultSort="spend"
        />
      </SectionCard>
    </div>
  );
}

function AudienceView({ rows, summary }: { rows: Array<Record<string, any>>; summary: Record<string, any> }) {
  if (rows.length === 0) {
    return <TabEmpty message="No audience intelligence is available for this period." />;
  }

  const audienceSummary = (summary.byType ?? []) as Array<Record<string, any>>;
  const best = [...audienceSummary].sort((a, b) => Number(b.roas ?? 0) - Number(a.roas ?? 0))[0];
  const weak = [...rows].filter((row) => Number(row.spend ?? 0) > 50 && Number(row.roas ?? 0) < 1.5).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Best Audience Type" value={best ? String(best.type) : "—"} sublabel={best ? `${fmtRoas(Number(best.roas ?? 0))} ROAS` : "No audience summary"} />
        <MetricCard label="Tracked Audience Types" value={fmtNumber(audienceSummary.length)} sublabel="Best-available segment grouping" />
        <MetricCard label="Weak Segments" value={fmtNumber(weak.length)} sublabel="Spend with low contribution" />
        <MetricCard label="Audience Rows" value={fmtNumber(rows.length)} sublabel="Audience, campaign, and ad-group scope" />
      </div>

      <SectionCard title="Audience Signals" description="Even when naming is weak, spend contribution and quality still matter.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {audienceSummary.map((item) => (
            <InsightStrip
              key={String(item.type)}
              title={String(item.type)}
              value={fmtRoas(Number(item.roas ?? 0))}
              note={`${fmtCurrency(Number(item.spend ?? 0))} spend · ${fmtNumber(Number(item.conversions ?? 0))} conv`}
              tone={Number(item.roas ?? 0) >= 3 ? "good" : Number(item.roas ?? 0) < 1.5 ? "bad" : "neutral"}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Audience Intelligence" description="Spend, conversions, return, and CPA by best-available audience grouping.">
        <SimpleTable
          cols={[
            {
              key: "type",
              header: "Audience",
              accessor: (row) => String(row.type ?? ""),
              render: (row) => (
                <div className="max-w-[200px]">
                  <p className="text-xs font-semibold">{row.type}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {row.campaign} · {row.adGroup}
                  </p>
                </div>
              ),
            },
            { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
            { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
            { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
            { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
            { key: "cpa", header: "CPA", accessor: (row) => Number(row.cpa ?? 0), align: "right", render: (row) => (Number(row.conversions ?? 0) > 0 ? fmtCurrency(Number(row.cpa ?? 0)) : "—") },
            { key: "ctr", header: "CTR", accessor: (row) => Number(row.ctr ?? 0), align: "right", render: (row) => percentNumber(Number(row.ctr ?? 0)) },
          ]}
          rows={rows}
          defaultSort="spend"
        />
      </SectionCard>
    </div>
  );
}

function GeoDevicesView({
  geoRows,
  deviceRows,
}: {
  geoRows: Array<Record<string, any>>;
  deviceRows: Array<Record<string, any>>;
}) {
  if (geoRows.length === 0 && deviceRows.length === 0) {
    return <TabEmpty message="No geo or device intelligence is available for this period." />;
  }

  const bestGeo = [...geoRows].sort((a, b) => Number(b.roas ?? 0) - Number(a.roas ?? 0))[0];
  const weakGeo = [...geoRows].filter((row) => Number(row.spend ?? 0) > 50).sort((a, b) => Number(a.roas ?? 0) - Number(b.roas ?? 0))[0];
  const bestDevice = [...deviceRows].sort((a, b) => Number(b.roas ?? 0) - Number(a.roas ?? 0))[0];
  const mobile = deviceRows.find((row) => String(row.device ?? "").toLowerCase().includes("mobile"));
  const desktop = deviceRows.find((row) => String(row.device ?? "").toLowerCase().includes("desktop"));
  const deviceGap =
    mobile && desktop ? Number((Number(desktop.roas ?? 0) - Number(mobile.roas ?? 0)).toFixed(2)) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Top Geo" value={bestGeo ? String(bestGeo.country) : "—"} sublabel={bestGeo ? `${fmtRoas(Number(bestGeo.roas ?? 0))} ROAS` : "No geo data"} />
        <MetricCard label="Weak Geo" value={weakGeo ? String(weakGeo.country) : "—"} sublabel={weakGeo ? `${fmtRoas(Number(weakGeo.roas ?? 0))} ROAS` : "No geo laggard"} />
        <MetricCard label="Best Device" value={bestDevice ? String(bestDevice.device) : "—"} sublabel={bestDevice ? `${fmtRoas(Number(bestDevice.roas ?? 0))} ROAS` : "No device data"} />
        <MetricCard label="Desktop vs Mobile" value={deviceGap != null ? `${deviceGap >= 0 ? "+" : ""}${deviceGap.toFixed(2)}x` : "—"} sublabel="ROAS gap" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Geo Intelligence" description="Where location-level return is strongest or weakest.">
          <SimpleTable
            cols={[
              { key: "country", header: "Geo", accessor: (row) => String(row.country ?? ""), render: (row) => <span className="text-xs font-semibold">{row.country}</span> },
              { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
              { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
              { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
              { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
              { key: "cpa", header: "CPA", accessor: (row) => Number(row.cpa ?? 0), align: "right", render: (row) => (Number(row.conversions ?? 0) > 0 ? fmtCurrency(Number(row.cpa ?? 0)) : "—") },
            ]}
            rows={geoRows}
            defaultSort="spend"
          />
        </SectionCard>

        <SectionCard title="Device Intelligence" description="Bid-adjustment-style view of cross-device performance.">
          <SimpleTable
            cols={[
              { key: "device", header: "Device", accessor: (row) => String(row.device ?? ""), render: (row) => <span className="text-xs font-semibold">{row.device}</span> },
              { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
              { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
              { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
              { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
              { key: "ctr", header: "CTR", accessor: (row) => Number(row.ctr ?? 0), align: "right", render: (row) => percentNumber(Number(row.ctr ?? 0)) },
            ]}
            rows={deviceRows}
            defaultSort="spend"
          />
        </SectionCard>
      </div>
    </div>
  );
}

function BudgetScalingView({
  budgetRows,
  budgetSummary,
  products,
}: {
  budgetRows: Array<Record<string, any>>;
  budgetSummary: Record<string, any>;
  products: Array<Record<string, any>>;
}) {
  if (budgetRows.length === 0) {
    return <TabEmpty message="No budget and scaling data is available for this period." />;
  }

  const scaleCampaigns = budgetRows.filter((row) => Number(row.lostIsBudget ?? 0) > 0.1 && Number(row.roas ?? 0) >= Number(budgetSummary.accountAvgRoas ?? 0)).slice(0, 4);
  const reduceCampaigns = budgetRows.filter((row) => Number(row.roas ?? 0) < Number(budgetSummary.accountAvgRoas ?? 0) * 0.7 && Number(row.spend ?? 0) > 50).slice(0, 4);
  const scaleProducts = products.filter((row) => row.statusLabel === "scale").slice(0, 3);
  const reduceProducts = products.filter((row) => row.statusLabel === "reduce").slice(0, 3);
  const totalSpend = Number(budgetSummary.totalSpend ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Spend" value={fmtCurrency(totalSpend)} sublabel="Campaign-level budget analysis" />
        <MetricCard label="Avg ROAS" value={fmtRoas(Number(budgetSummary.accountAvgRoas ?? 0))} sublabel="Blended campaign efficiency" tone="highlight" />
        <MetricCard label="Scale Now" value={fmtNumber(scaleCampaigns.length + scaleProducts.length)} sublabel="Campaigns and products with headroom" />
        <MetricCard label="Reduce Now" value={fmtNumber(reduceCampaigns.length + reduceProducts.length)} sublabel="Inefficient budget concentration" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Where To Put More Budget" description="Efficiency-backed scale opportunities across campaigns and products.">
          <div className="space-y-3">
            {scaleCampaigns.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">{row.name}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · {fmtPercent(Number(row.lostIsBudget ?? 0) * 100)} lost to budget
                </p>
              </div>
            ))}
            {scaleProducts.map((row) => (
              <div key={String(row.itemId)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">{row.title}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · {fmtCurrency(Number(row.revenue ?? 0))} value
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Where To Pull Back" description="Spend concentration that is not earning enough return.">
          <div className="space-y-3">
            {reduceCampaigns.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-900">{row.name}</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  {fmtCurrency(Number(row.spend ?? 0))} spend · {fmtRoas(Number(row.roas ?? 0))}
                </p>
              </div>
            ))}
            {reduceProducts.map((row) => (
              <div key={String(row.itemId)} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-900">{row.title}</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  {fmtCurrency(Number(row.spend ?? 0))} spend · {fmtRoas(Number(row.roas ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Spend Concentration" description="Where campaign budget is currently pooling.">
        <div className="space-y-4">
          {budgetRows.slice(0, 8).map((row) => {
            const share = totalSpend > 0 ? (Number(row.spend ?? 0) / totalSpend) * 100 : 0;
            return (
              <div key={String(row.id)} className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate">{row.name}</span>
                    <span className="text-muted-foreground">{share.toFixed(1)}%</span>
                  </div>
                  <SpendBar value={Number(row.spend ?? 0)} max={totalSpend} />
                </div>
                <div className="w-20 text-right text-xs">
                  <p>{fmtCurrency(Number(row.spend ?? 0))}</p>
                  <p className="text-muted-foreground">{fmtRoas(Number(row.roas ?? 0))}</p>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function OpportunitiesView({ rows }: { rows: Array<Record<string, any>> }) {
  if (rows.length === 0) {
    return <TabEmpty message="No opportunities are available for this period." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="High Priority" value={fmtNumber(rows.filter((row) => row.priority === "high").length)} sublabel="Act-first opportunities" />
        <MetricCard label="Medium Priority" value={fmtNumber(rows.filter((row) => row.priority === "medium").length)} sublabel="Important, but not urgent" />
        <MetricCard label="Low Effort" value={fmtNumber(rows.filter((row) => row.effort === "low").length)} sublabel="Quick operational wins" />
        <MetricCard label="Action Types" value={fmtNumber(Array.from(new Set(rows.map((row) => row.type))).length)} sublabel="Budget, keyword, asset, product, and more" />
      </div>

      <SectionCard title="Ranked Opportunities" description="Evidence-based actions sorted by likely usefulness.">
        <div className="space-y-4">
          {rows.map((row) => (
            <OpportunityCard key={String(row.id)} opportunity={row} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function DiagnosticsView({ diagnostics }: { diagnostics: QueryResult | undefined }) {
  const rows = firstRows(diagnostics);
  if (rows.length === 0) {
    return <TabEmpty message="No diagnostics are available yet." />;
  }

  const summary = (diagnostics?.summary ?? {}) as Record<string, any>;
  const insights = (diagnostics?.insights ?? {}) as Record<string, any>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Loaded Sections" value={fmtNumber(Number(summary.loadedSections ?? 0))} sublabel="Tabs included in the health scan" />
        <MetricCard label="Healthy Sections" value={fmtNumber(Number(summary.healthySections ?? 0))} sublabel="No warnings or failures" />
        <MetricCard label="Warnings" value={fmtNumber(Number(summary.totalWarnings ?? 0))} sublabel="Partial-data or limitation notices" />
        <MetricCard label="Query Failures" value={fmtNumber(Number(summary.totalFailures ?? 0))} sublabel={summary.generatedAt ? `Generated ${new Date(String(summary.generatedAt)).toLocaleString()}` : "Latest scan"} />
      </div>

      <SectionCard title="Section Health" description="Readable diagnostics aggregated per tab or report family.">
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={String(row.label)} className="rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {Number(row.failureCount ?? 0) === 0 && Number(row.warningCount ?? 0) === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <p className="text-sm font-semibold">{row.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  {row.partial ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Partial
                    </span>
                  ) : null}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {row.rows} rows
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Warnings</p>
                  <p className="mt-1 text-xs font-medium">{row.warningCount}</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Failures</p>
                  <p className="mt-1 text-xs font-medium">{row.failureCount}</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Unavailable Metrics</p>
                  <p className="mt-1 text-xs font-medium">{row.unavailableMetricCount}</p>
                </div>
              </div>
              {row.meta?.warnings?.length ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {row.meta.warnings.join(" ")}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Known API Limitations" description="Trust and transparency around what Google Ads exposes cleanly here.">
        <div className="space-y-2">
          {(insights.limitations ?? []).map((item: string) => (
            <div key={item} className="rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">
              {item}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function GoogleAdsIntelligenceDashboard({ businessId }: { businessId: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [dateRange, setDateRange] = useState<DateRange>("30");

  const overviewQ = useQuery({
    queryKey: ["google-ads-overview", businessId, dateRange],
    queryFn: () => fetchReport("overview", businessId, dateRange),
    enabled: Boolean(businessId) && activeTab === "overview",
    staleTime: 60_000,
  });

  const campaignsQ = useQuery({
    queryKey: ["google-ads-campaigns", businessId, dateRange],
    queryFn: () => fetchReport("campaigns", businessId, dateRange),
    enabled:
      Boolean(businessId) &&
      ["overview", "campaigns", "budget-scaling"].includes(activeTab),
    staleTime: 60_000,
  });

  const searchIntelligenceQ = useQuery({
    queryKey: ["google-ads-search-intelligence", businessId, dateRange],
    queryFn: () => fetchReport("search-intelligence", businessId, dateRange),
    enabled: Boolean(businessId) && activeTab === "search-intelligence",
    staleTime: 60_000,
  });

  const keywordsQ = useQuery({
    queryKey: ["google-ads-keywords", businessId, dateRange],
    queryFn: () => fetchReport("keywords", businessId, dateRange),
    enabled: Boolean(businessId) && activeTab === "keywords",
    staleTime: 60_000,
  });

  const assetsQ = useQuery({
    queryKey: ["google-ads-assets", businessId, dateRange],
    queryFn: () => fetchReport("assets", businessId, dateRange),
    enabled: Boolean(businessId) && ["assets", "opportunities"].includes(activeTab),
    staleTime: 60_000,
  });

  const assetGroupsQ = useQuery({
    queryKey: ["google-ads-asset-groups", businessId, dateRange],
    queryFn: () => fetchReport("asset-groups", businessId, dateRange),
    enabled:
      Boolean(businessId) &&
      ["asset-groups", "opportunities"].includes(activeTab),
    staleTime: 60_000,
  });

  const productsQ = useQuery({
    queryKey: ["google-ads-products", businessId, dateRange],
    queryFn: () => fetchReport("products", businessId, dateRange),
    enabled:
      Boolean(businessId) &&
      ["overview", "products", "budget-scaling", "opportunities"].includes(activeTab),
    staleTime: 60_000,
  });

  const audiencesQ = useQuery({
    queryKey: ["google-ads-audiences", businessId, dateRange],
    queryFn: () => fetchReport("audiences", businessId, dateRange),
    enabled: Boolean(businessId) && activeTab === "audiences",
    staleTime: 60_000,
  });

  const geoQ = useQuery({
    queryKey: ["google-ads-geo", businessId, dateRange],
    queryFn: () => fetchReport("geo", businessId, dateRange),
    enabled: Boolean(businessId) && activeTab === "geo-devices",
    staleTime: 60_000,
  });

  const devicesQ = useQuery({
    queryKey: ["google-ads-devices", businessId, dateRange],
    queryFn: () => fetchReport("devices", businessId, dateRange),
    enabled: Boolean(businessId) && activeTab === "geo-devices",
    staleTime: 60_000,
  });

  const budgetQ = useQuery({
    queryKey: ["google-ads-budget", businessId, dateRange],
    queryFn: () => fetchReport("budget", businessId, dateRange),
    enabled:
      Boolean(businessId) &&
      ["overview", "budget-scaling"].includes(activeTab),
    staleTime: 60_000,
  });

  const opportunitiesQ = useQuery({
    queryKey: ["google-ads-opportunities", businessId, dateRange],
    queryFn: () => fetchReport("opportunities", businessId, dateRange),
    enabled:
      Boolean(businessId) &&
      ["overview", "opportunities"].includes(activeTab),
    staleTime: 60_000,
  });

  const diagnosticsQ = useQuery({
    queryKey: ["google-ads-diagnostics", businessId, dateRange],
    queryFn: () => fetchReport("diagnostics", businessId, dateRange),
    enabled: Boolean(businessId) && activeTab === "diagnostics",
    staleTime: 60_000,
  });

  const campaigns = firstRows(campaignsQ.data);
  const searchRows = firstRows(searchIntelligenceQ.data);
  const keywordRows = firstRows(keywordsQ.data);
  const assetRows = firstRows(assetsQ.data);
  const assetGroupRows = firstRows(assetGroupsQ.data);
  const productRows = firstRows(productsQ.data);
  const audienceRows = firstRows(audiencesQ.data);
  const geoRows = firstRows(geoQ.data);
  const deviceRows = firstRows(devicesQ.data);
  const budgetRows = firstRows(budgetQ.data);
  const opportunityRows = firstRows(opportunitiesQ.data);

  const activeMeta =
    activeTab === "overview"
      ? combineMetas([overviewQ.data?.meta, campaignsQ.data?.meta, budgetQ.data?.meta, opportunitiesQ.data?.meta, productsQ.data?.meta])
      : activeTab === "campaigns"
      ? combineMetas([campaignsQ.data?.meta])
      : activeTab === "search-intelligence"
      ? combineMetas([searchIntelligenceQ.data?.meta])
      : activeTab === "keywords"
      ? combineMetas([keywordsQ.data?.meta])
      : activeTab === "assets"
      ? combineMetas([assetsQ.data?.meta])
      : activeTab === "asset-groups"
      ? combineMetas([assetGroupsQ.data?.meta])
      : activeTab === "products"
      ? combineMetas([productsQ.data?.meta])
      : activeTab === "audiences"
      ? combineMetas([audiencesQ.data?.meta])
      : activeTab === "geo-devices"
      ? combineMetas([geoQ.data?.meta, devicesQ.data?.meta])
      : activeTab === "budget-scaling"
      ? combineMetas([budgetQ.data?.meta, productsQ.data?.meta])
      : activeTab === "opportunities"
      ? combineMetas([opportunitiesQ.data?.meta])
      : combineMetas([diagnosticsQ.data?.meta]);

  const activeError =
    activeTab === "overview"
      ? overviewQ.error
      : activeTab === "campaigns"
      ? campaignsQ.error
      : activeTab === "search-intelligence"
      ? searchIntelligenceQ.error
      : activeTab === "keywords"
      ? keywordsQ.error
      : activeTab === "assets"
      ? assetsQ.error
      : activeTab === "asset-groups"
      ? assetGroupsQ.error
      : activeTab === "products"
      ? productsQ.error
      : activeTab === "audiences"
      ? audiencesQ.error
      : activeTab === "geo-devices"
      ? geoQ.error ?? devicesQ.error
      : activeTab === "budget-scaling"
      ? budgetQ.error
      : activeTab === "opportunities"
      ? opportunitiesQ.error
      : diagnosticsQ.error;

  const isLoading =
    activeTab === "overview"
      ? overviewQ.isLoading || campaignsQ.isLoading || budgetQ.isLoading || opportunitiesQ.isLoading || productsQ.isLoading
      : activeTab === "campaigns"
      ? campaignsQ.isLoading
      : activeTab === "search-intelligence"
      ? searchIntelligenceQ.isLoading
      : activeTab === "keywords"
      ? keywordsQ.isLoading
      : activeTab === "assets"
      ? assetsQ.isLoading
      : activeTab === "asset-groups"
      ? assetGroupsQ.isLoading
      : activeTab === "products"
      ? productsQ.isLoading
      : activeTab === "audiences"
      ? audiencesQ.isLoading
      : activeTab === "geo-devices"
      ? geoQ.isLoading || devicesQ.isLoading
      : activeTab === "budget-scaling"
      ? budgetQ.isLoading || productsQ.isLoading
      : activeTab === "opportunities"
      ? opportunitiesQ.isLoading
      : diagnosticsQ.isLoading;

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border bg-[linear-gradient(135deg,rgba(15,23,42,0.04),rgba(14,165,233,0.08),rgba(16,185,129,0.06))] p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Google Ads Intelligence
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Decision-first reporting for ecommerce teams
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              See what changed, why it changed, what deserves attention, and which campaigns, products, assets, or search themes should move next.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white/70 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Operating Mode
              </p>
              <p className="mt-2 text-sm font-semibold">Intelligence Dashboard</p>
              <p className="mt-1 text-xs text-muted-foreground">Campaign correctness preserved, UX upgraded.</p>
            </div>
            <div className="rounded-2xl border bg-white/70 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Focus
              </p>
              <p className="mt-2 text-sm font-semibold">Scale, reduce, fix</p>
              <p className="mt-1 text-xs text-muted-foreground">Priority sorted by value, waste, and confidence.</p>
            </div>
            <div className="rounded-2xl border bg-white/70 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Date Range
              </p>
              <div className="mt-2 flex items-center gap-1 rounded-full border bg-background/90 p-1">
                {DATE_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setDateRange(option.value)}
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                      dateRange === option.value
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border bg-card p-4">
        <div className="flex flex-col gap-4">
          {TAB_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <QueryIssueBanner meta={activeMeta} />

      {activeError ? (
        <TabEmpty
          message={
            activeError instanceof Error
              ? activeError.message
              : "Google Ads data could not be loaded."
          }
        />
      ) : isLoading ? (
        <TabSkeleton rows={8} />
      ) : activeTab === "overview" ? (
        <OverviewView
          overview={overviewQ.data}
          campaigns={campaigns}
          opportunities={opportunityRows}
          budget={budgetRows}
          products={productRows}
        />
      ) : activeTab === "campaigns" ? (
        <CampaignsView rows={campaigns} />
      ) : activeTab === "search-intelligence" ? (
        <SearchIntelligenceView
          rows={searchRows}
          summary={(searchIntelligenceQ.data?.summary ?? {}) as Record<string, any>}
          insights={(searchIntelligenceQ.data?.insights ?? {}) as Record<string, any>}
        />
      ) : activeTab === "keywords" ? (
        <KeywordsView
          rows={keywordRows}
          summary={(keywordsQ.data?.summary ?? {}) as Record<string, any>}
          meta={keywordsQ.data?.meta ?? null}
        />
      ) : activeTab === "assets" ? (
        <AssetsView
          rows={assetRows}
          summary={(assetsQ.data?.summary ?? {}) as Record<string, any>}
        />
      ) : activeTab === "asset-groups" ? (
        <AssetGroupsView
          rows={assetGroupRows}
          summary={(assetGroupsQ.data?.summary ?? {}) as Record<string, any>}
        />
      ) : activeTab === "products" ? (
        <ProductsView
          rows={productRows}
          summary={(productsQ.data?.summary ?? {}) as Record<string, any>}
          insights={(productsQ.data?.insights ?? {}) as Record<string, any>}
        />
      ) : activeTab === "audiences" ? (
        <AudienceView
          rows={audienceRows}
          summary={(audiencesQ.data?.summary ?? {}) as Record<string, any>}
        />
      ) : activeTab === "geo-devices" ? (
        <GeoDevicesView geoRows={geoRows} deviceRows={deviceRows} />
      ) : activeTab === "budget-scaling" ? (
        <BudgetScalingView
          budgetRows={budgetRows}
          budgetSummary={(budgetQ.data?.summary ?? {}) as Record<string, any>}
          products={productRows}
        />
      ) : activeTab === "opportunities" ? (
        <OpportunitiesView rows={opportunityRows} />
      ) : (
        <DiagnosticsView diagnostics={diagnosticsQ.data} />
      )}
    </div>
  );
}
