"use client";

/**
 * app/(dashboard)/platforms/meta/page.tsx — Premium Dashboard Overhaul
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────┐
 *  │ Header + Date Range                             │
 *  ├──────────┬──────────┬──────────┬────────────────┤
 *  │ KPI Spend│ KPI Rev  │ Avg CPA  │ Blended ROAS   │  ← 4-up KPI row
 *  ├─────────────────────────────┬───────────────────┤
 *  │  Campaign Table (70%)       │  Sidebar (30%)    │
 *  │  • Accordion + lazy adsets  │  • Age badges     │  ← 2-col grid
 *  │  • Micro-bars in Spend/Rev  │  • Location list  │
 *  │                             │  • Placement bars │
 *  └─────────────────────────────┴───────────────────┘
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  Target,
  BarChart2,
  Zap,
} from "lucide-react";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { isDemoBusinessSelected } from "@/lib/business-mode";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { DataEmptyState } from "@/components/states/DataEmptyState";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";
import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";
import {
  DateRangePicker,
  type ComparisonPreset,
  DateRangeValue,
  DEFAULT_DATE_RANGE,
  getPresetDates,
} from "@/components/date-range/DateRangePicker";
import { MetaCampaignTable, type MetaCampaignTableRow } from "@/components/meta/meta-campaign-table";
import { PlacementBreakdownChart } from "@/components/meta/placement-breakdown-chart";

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchMetaCampaigns(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<{ status?: string; rows: MetaCampaignRow[] }> {
  const params = new URLSearchParams({ businessId, startDate, endDate });
  const res = await fetch(`/api/meta/campaigns?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      payload?.message ?? `Request failed (${res.status})`
    );
  return payload as { status?: string; rows: MetaCampaignRow[] };
}

async function fetchMetaBreakdowns(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<MetaBreakdownsResponse> {
  const params = new URLSearchParams({ businessId, startDate, endDate });
  const res = await fetch(`/api/meta/breakdowns?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      payload?.message ?? `Request failed (${res.status})`
    );
  return payload as MetaBreakdownsResponse;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return fmt$(n);
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function parseISODate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDaysToISO(value: string, days: number): string {
  const date = parseISODate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDiffInclusive(startDate: string, endDate: string): number {
  const start = parseISODate(startDate).getTime();
  const end = parseISODate(endDate).getTime();
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

function getComparisonWindow(
  startDate: string,
  endDate: string,
  preset: ComparisonPreset,
  comparisonStart?: string,
  comparisonEnd?: string
): { startDate: string; endDate: string } | null {
  if (preset === "none") return null;

  if (comparisonStart && comparisonEnd) {
    return { startDate: comparisonStart, endDate: comparisonEnd };
  }

  if (preset === "previousPeriod") {
    const days = dayDiffInclusive(startDate, endDate);
    const previousEnd = addDaysToISO(startDate, -1);
    const previousStart = addDaysToISO(previousEnd, -(days - 1));
    return { startDate: previousStart, endDate: previousEnd };
  }

  if (preset === "previousWeek") {
    return {
      startDate: addDaysToISO(startDate, -7),
      endDate: addDaysToISO(endDate, -7),
    };
  }

  if (preset === "previousMonth") {
    return {
      startDate: addDaysToISO(startDate, -30),
      endDate: addDaysToISO(endDate, -30),
    };
  }

  if (preset === "previousQuarter") {
    return {
      startDate: addDaysToISO(startDate, -90),
      endDate: addDaysToISO(endDate, -90),
    };
  }

  return {
    startDate: addDaysToISO(startDate, -365),
    endDate: addDaysToISO(endDate, -365),
  };
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────

interface KpiData {
  totalSpend: number;
  totalRevenue: number;
  avgCpa: number;
  blendedRoas: number;
}

function computeChangePct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function computeKpis(rows: MetaCampaignRow[]): KpiData {
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const totalPurchases = rows.reduce((a, r) => a + r.purchases, 0);
  return {
    totalSpend,
    totalRevenue,
    avgCpa: totalPurchases > 0 ? totalSpend / totalPurchases : 0,
    blendedRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
  };
}

interface KpiCardProps {
  label: string;
  value: string;
  subLabel: string;
  icon: React.ElementType;
  accentClass: string; // left-border color
  valueClass?: string; // optional value color override
  changePct?: number | null;
  positiveIsGood?: boolean;
}

function KpiCard({
  label,
  value,
  subLabel,
  icon: Icon,
  accentClass,
  valueClass = "text-foreground",
  changePct = null,
  positiveIsGood = true,
}: KpiCardProps) {
  const hasChange = typeof changePct === "number";
  const isPositive = hasChange ? changePct > 0 : false;
  const isNegative = hasChange ? changePct < 0 : false;
  const colorClass = !hasChange
    ? "text-muted-foreground"
    : positiveIsGood
      ? isPositive
        ? "text-emerald-600"
        : isNegative
          ? "text-red-500"
          : "text-muted-foreground"
      : isPositive
        ? "text-red-500"
        : isNegative
          ? "text-emerald-600"
          : "text-muted-foreground";
  const sign = hasChange && changePct > 0 ? "+" : "";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm ${accentClass}`}
    >
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent to-muted/30" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <p
            className={`mt-1.5 font-mono text-3xl font-bold tracking-tight ${valueClass}`}
          >
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{subLabel}</p>
          {hasChange && (
            <p className={`mt-1 text-[11px] font-semibold ${colorClass}`}>
              {sign}
              {changePct.toFixed(1)}% vs previous period
            </p>
          )}
        </div>
        <div className="shrink-0 rounded-xl bg-muted/50 p-2.5">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

// ── Section error ─────────────────────────────────────────────────────────────

function SectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">Could not load data</p>
      <p className="mt-1 text-xs text-destructive/80">{message}</p>
      <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function NoAccountsAssigned() {
  const router = useRouter();
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <p className="text-sm font-medium">No Meta ad accounts assigned</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Assign one or more Meta ad accounts to this business.
      </p>
      <Button
        className="mt-4"
        variant="outline"
        onClick={() => router.push("/integrations")}
      >
        Open Integrations
      </Button>
    </div>
  );
}

// ── Age breakdown — performance badge grid ────────────────────────────────────
// Each age cohort is a card showing ROAS with the shared green/amber/red
// threshold colour system. Gives instant cohort scanning without a table.

interface AggregatedBreakdownRow {
  key: string;
  label: string;
  spend: number;
  purchases: number;
  revenue: number;
  clicks: number;
  impressions: number;
}

function AgeBreakdownBadges({
  rows,
}: {
  rows: AggregatedBreakdownRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No age breakdown data available.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map((row) => {
        const roas = row.spend > 0 ? row.revenue / row.spend : 0;
        const { bg, border, text } =
          roas > 2.5
            ? {
                bg: "bg-emerald-500/10",
                border: "border-emerald-500/20",
                text: "text-emerald-600",
              }
            : roas >= 1.5
            ? {
                bg: "bg-amber-500/10",
                border: "border-amber-500/20",
                text: "text-amber-600",
              }
            : {
                bg: "bg-red-500/10",
                border: "border-red-500/15",
                text: "text-red-500",
              };

        return (
          <div
            key={row.key}
            className={`rounded-lg border ${border} ${bg} p-2`}
          >
            <p className="text-[10px] font-medium text-muted-foreground leading-none">
              {row.label}
            </p>
            <p className={`mt-1 font-mono text-base font-bold leading-none ${text}`}>
              {roas.toFixed(2)}
              <span className="ml-0.5 text-xs font-normal opacity-70">×</span>
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {fmtK(row.spend)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Location breakdown — compact ranked list ──────────────────────────────────

function LocationBreakdownList({
  rows,
}: {
  rows: AggregatedBreakdownRow[];
}) {
  const total = rows.reduce((a, r) => a + r.spend, 0);
  const top = rows.slice(0, 7);

  if (top.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No location data.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {top.map((row) => {
        const share = total > 0 ? (row.spend / total) * 100 : 0;
        const roas = row.spend > 0 ? row.revenue / row.spend : 0;
        const roasCls =
          roas > 2.5
            ? "text-emerald-600"
            : roas >= 1.5
            ? "text-amber-500"
            : "text-red-500";

        return (
          <div key={row.key} className="flex items-center gap-2">
            {/* Country code pill */}
            <span className="w-7 shrink-0 rounded bg-muted px-1 py-0.5 text-center text-[10px] font-semibold uppercase text-muted-foreground">
              {row.label.slice(0, 2)}
            </span>

            {/* Spend bar */}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[11px] font-medium">
                  {row.label}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-semibold tabular-nums ${roasCls}`}
                >
                  {roas.toFixed(2)}×
                </span>
              </div>
              <div className="relative h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-blue-500/50"
                  style={{ width: `${share.toFixed(1)}%` }}
                />
              </div>
            </div>

            {/* Spend value */}
            <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
              {fmtK(row.spend)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sidebar card wrapper ──────────────────────────────────────────────────────

function SidebarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MetaPage() {
  const businesses = useAppStore((s) => s.businesses);
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";

  const ensureBusiness = useIntegrationsStore((s) => s.ensureBusiness);
  const byBusinessId = useIntegrationsStore((s) => s.byBusinessId);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);

  if (!selectedBusinessId) return <BusinessEmptyState />;

  const metaStatus = byBusinessId[businessId]?.meta?.status;
  const isDemoBusiness = isDemoBusinessSelected(selectedBusinessId, businesses);
  const metaConnected = metaStatus === "connected" || isDemoBusiness;

  const { start: startDate, end: endDate } = getPresetDates(
    dateRange.rangePreset,
    dateRange.customStart,
    dateRange.customEnd
  );
  const comparisonWindow = getComparisonWindow(
    startDate,
    endDate,
    dateRange.comparisonPreset,
    dateRange.comparisonStart,
    dateRange.comparisonEnd
  );

  const campaignsQuery = useQuery({
    queryKey: ["meta-campaigns", businessId, startDate, endDate],
    enabled: metaConnected,
    queryFn: () => fetchMetaCampaigns(businessId, startDate, endDate),
  });

  const breakdownsQuery = useQuery({
    queryKey: ["meta-breakdowns", businessId, startDate, endDate],
    enabled: metaConnected,
    queryFn: () => fetchMetaBreakdowns(businessId, startDate, endDate),
  });

  const comparisonCampaignsQuery = useQuery({
    queryKey: [
      "meta-campaigns-compare",
      businessId,
      comparisonWindow?.startDate,
      comparisonWindow?.endDate,
    ],
    enabled: metaConnected && Boolean(comparisonWindow),
    queryFn: () =>
      fetchMetaCampaigns(
        businessId,
        comparisonWindow!.startDate,
        comparisonWindow!.endDate
      ),
  });

  // KPIs are derived from the campaign rows — no extra API call
  const kpis = useMemo(
    () => computeKpis(campaignsQuery.data?.rows ?? []),
    [campaignsQuery.data]
  );
  const previousKpis = useMemo(
    () => computeKpis(comparisonCampaignsQuery.data?.rows ?? []),
    [comparisonCampaignsQuery.data]
  );

  const campaignRowsForTable = useMemo<MetaCampaignTableRow[]>(() => {
    const rows = campaignsQuery.data?.rows ?? [];
    if (!comparisonWindow || !comparisonCampaignsQuery.data?.rows?.length) {
      return rows;
    }

    const previousById = new Map(
      comparisonCampaignsQuery.data.rows.map((row) => [row.id, row])
    );

    return rows.map((row) => {
      const prev = previousById.get(row.id);
      return {
        ...row,
        previousSpend: prev?.spend,
        previousRevenue: prev?.revenue,
        previousRoas: prev?.roas,
        previousCpa: prev?.cpa,
      };
    });
  }, [campaignsQuery.data?.rows, comparisonCampaignsQuery.data?.rows, comparisonWindow]);

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meta Ads</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Campaign performance, demographic breakdowns, and ad set drill-down.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border bg-card p-1 shadow-sm">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* ── Integration gate ─────────────────────────────────────────────── */}
      {metaStatus === "connecting" && <LoadingSkeleton rows={4} />}

      {!metaConnected && metaStatus !== "connecting" && (
        <IntegrationEmptyState
          providerLabel="Meta"
          status={metaStatus}
          description="View campaigns, ad sets, and creative insights once your Meta account is connected."
        />
      )}

      {metaConnected && (
        <>
          {/* ── KPI Row ───────────────────────────────────────────────────
              Derived from campaign data — no extra fetch.
              Numbers use font-mono for alignment and terminal-grade readability.
          ───────────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Total Spend"
              value={
                campaignsQuery.isLoading ? "—" : fmtK(kpis.totalSpend)
              }
              subLabel={`${campaignsQuery.data?.rows?.length ?? 0} campaigns`}
              icon={DollarSign}
              accentClass="border-l-4 border-l-blue-500/60"
              changePct={
                comparisonWindow
                  ? computeChangePct(kpis.totalSpend, previousKpis.totalSpend)
                  : null
              }
            />
            <KpiCard
              label="Total Revenue"
              value={
                campaignsQuery.isLoading ? "—" : fmtK(kpis.totalRevenue)
              }
              subLabel="Attributed purchases"
              icon={TrendingUp}
              accentClass="border-l-4 border-l-emerald-500/60"
              valueClass="text-emerald-600"
              changePct={
                comparisonWindow
                  ? computeChangePct(kpis.totalRevenue, previousKpis.totalRevenue)
                  : null
              }
            />
            <KpiCard
              label="Avg. CPA"
              value={
                campaignsQuery.isLoading ? "—" : fmt$(kpis.avgCpa)
              }
              subLabel="Cost per conversion"
              icon={Target}
              accentClass="border-l-4 border-l-violet-500/60"
              changePct={
                comparisonWindow
                  ? computeChangePct(kpis.avgCpa, previousKpis.avgCpa)
                  : null
              }
              positiveIsGood={false}
            />
            <KpiCard
              label="Blended ROAS"
              value={
                campaignsQuery.isLoading
                  ? "—"
                  : `${kpis.blendedRoas.toFixed(2)}×`
              }
              subLabel="All campaigns combined"
              icon={BarChart2}
              accentClass={
                kpis.blendedRoas > 2.5
                  ? "border-l-4 border-l-emerald-500/60"
                  : kpis.blendedRoas >= 1.5
                  ? "border-l-4 border-l-amber-500/60"
                  : "border-l-4 border-l-red-500/60"
              }
              valueClass={
                kpis.blendedRoas > 2.5
                  ? "text-emerald-600"
                  : kpis.blendedRoas >= 1.5
                  ? "text-amber-500"
                  : "text-red-500"
              }
              changePct={
                comparisonWindow
                  ? computeChangePct(kpis.blendedRoas, previousKpis.blendedRoas)
                  : null
              }
            />
          </div>

          {/* ── AI Insights ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
            <div className="shrink-0 rounded-lg bg-violet-500/10 p-2">
              <Zap className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">AI Insights</p>
              <p className="text-xs text-muted-foreground">
                Adsecute will surface creative, audience, and budget signals
                once enough synced Meta performance data is available.
              </p>
            </div>
          </div>

          {/* ── Campaign table — full width ──────────────────────────────── */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Campaign Performance
            </h2>
            {comparisonWindow && (
              <p className="text-xs text-muted-foreground">
                Comparison active: deltas are shown against {comparisonWindow.startDate} - {comparisonWindow.endDate}.
              </p>
            )}

            {campaignsQuery.isLoading && <LoadingSkeleton rows={5} />}

            {campaignsQuery.isError && (
              <SectionError
                message={
                  campaignsQuery.error instanceof Error
                    ? campaignsQuery.error.message
                    : "Could not load campaign data."
                }
                onRetry={() => campaignsQuery.refetch()}
              />
            )}

            {!campaignsQuery.isLoading && !campaignsQuery.isError && (() => {
              const status = campaignsQuery.data?.status;
              const rows = campaignsQuery.data?.rows ?? [];

              if (status === "no_accounts_assigned")
                return <NoAccountsAssigned />;

              if (rows.length === 0)
                return (
                  <DataEmptyState
                    title="No campaign data found"
                    description="No campaigns ran in the selected date range for the assigned Meta ad accounts."
                  />
                );

              return (
                <MetaCampaignTable
                  campaigns={campaignRowsForTable}
                  businessId={businessId}
                  since={startDate}
                  until={endDate}
                  showMicroBars
                  columns="compact"
                />
              );
            })()}
          </div>

          {/* ── Breakdown cards — 3 columns below campaign table ─────────── */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* ROAS by Age */}
            <SidebarCard title="ROAS by Age">
              {breakdownsQuery.isLoading ? (
                <LoadingSkeleton rows={3} />
              ) : breakdownsQuery.isError ? (
                <SectionError
                  message="Could not load breakdowns."
                  onRetry={() => breakdownsQuery.refetch()}
                />
              ) : (
                <AgeBreakdownBadges
                  rows={breakdownsQuery.data?.age ?? []}
                />
              )}
            </SidebarCard>

            {/* Top Countries */}
            <SidebarCard title="Top Countries">
              {breakdownsQuery.isLoading ? (
                <LoadingSkeleton rows={4} />
              ) : breakdownsQuery.isError ? null : (
                <LocationBreakdownList
                  rows={breakdownsQuery.data?.location ?? []}
                />
              )}
            </SidebarCard>

            {/* Platform Share */}
            <SidebarCard title="Platform Share">
              {breakdownsQuery.isLoading ? (
                <LoadingSkeleton rows={3} />
              ) : breakdownsQuery.isError ? null : (
                <PlacementBreakdownChart
                  rows={(breakdownsQuery.data?.placement ?? []).map(
                    (row) => ({
                      key: row.key,
                      label: row.label,
                      spend: row.spend,
                      roas:
                        row.spend > 0 ? row.revenue / row.spend : 0,
                    })
                  )}
                />
              )}
            </SidebarCard>
          </div>

          {/* ── Budget Distribution ──────────────────────────────────────── */}
          <SidebarCard title="Budget Distribution">
            {breakdownsQuery.isLoading ? (
              <LoadingSkeleton rows={3} />
            ) : breakdownsQuery.isError ? null : (() => {
              const campaignRows =
                breakdownsQuery.data?.budget.campaign ?? [];
              const total = campaignRows.reduce(
                (a, r) => a + r.spend,
                0
              );
              if (campaignRows.length === 0)
                return (
                  <p className="text-xs text-muted-foreground">
                    Budget data unavailable.
                  </p>
                );

              return (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                  {campaignRows.slice(0, 6).map((row) => (
                    <div key={row.key} className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span
                          className="max-w-[70%] truncate text-[11px] font-medium"
                          title={row.label}
                        >
                          {row.label}
                        </span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {pct(row.spend, total)}
                        </span>
                      </div>
                      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-violet-500/50"
                          style={{
                            width: pct(row.spend, total),
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </SidebarCard>
        </>
      )}
    </div>
  );
}
