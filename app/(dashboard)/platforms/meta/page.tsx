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
  RefreshCw,

} from "lucide-react";

import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { deriveProviderViewState } from "@/store/integrations-support";
import { isDemoBusinessSelected } from "@/lib/business-mode";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { DataEmptyState } from "@/components/states/DataEmptyState";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { usePreferencesStore } from "@/store/preferences-store";
import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";
import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";
import type { MetaWarehouseSummaryResponse } from "@/lib/meta/serving";
import {
  DateRangePicker,
  type ComparisonPreset,
  DateRangeValue,
  getPresetDates,
  getPresetDatesForReferenceDate,
} from "@/components/date-range/DateRangePicker";
import { usePersistentDateRange } from "@/hooks/use-persistent-date-range";
import { useCurrencySymbol } from "@/hooks/use-currency";
import { type MetaCampaignTableRow } from "@/components/meta/meta-campaign-table";
import { PlacementBreakdownChart } from "@/components/meta/placement-breakdown-chart";
import { useBusinessIntegrationsBootstrap } from "@/hooks/use-business-integrations-bootstrap";
import { PlanGate } from "@/components/pricing/PlanGate";
import { MetaCampaignList } from "@/components/meta/meta-campaign-list";
import { MetaCampaignDetail } from "@/components/meta/meta-campaign-detail";
import type { MetaRecommendationsResponse } from "@/lib/meta/recommendations";
import { buildMetaCampaignLaneSignals } from "@/lib/meta/campaign-lanes";
import { MetaSyncProgress, shouldRenderMetaSyncProgress } from "@/components/meta/meta-sync-progress";
import type { MetaStatusResponse } from "@/lib/meta/status-types";
import { usePlanState } from "@/lib/pricing/usePlan";
import { PRICING_PLANS } from "@/lib/pricing/plans";
import { META_WAREHOUSE_HISTORY_DAYS } from "@/lib/meta/history";

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchMetaCampaigns(
  businessId: string,
  startDate: string,
  endDate: string,
  includePrev = false
): Promise<{ status?: string; rows: MetaCampaignRow[] }> {
  const params = new URLSearchParams({ businessId, startDate, endDate });
  if (includePrev) params.set("includePrev", "1");
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

async function fetchMetaRecommendations(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<MetaRecommendationsResponse> {
  const params = new URLSearchParams({ businessId, startDate, endDate });
  const res = await fetch(`/api/meta/recommendations?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.message ?? `Request failed (${res.status})`);
  }
  return payload as MetaRecommendationsResponse;
}

async function fetchMetaSummary(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<MetaWarehouseSummaryResponse> {
  const params = new URLSearchParams({ businessId, startDate, endDate });
  const res = await fetch(`/api/meta/summary?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.message ?? `Request failed (${res.status})`);
  }
  return payload as MetaWarehouseSummaryResponse;
}

async function fetchMetaStatus(
  businessId: string,
  startDate?: string,
  endDate?: string
): Promise<MetaStatusResponse> {
  const params = new URLSearchParams({ businessId });
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const res = await fetch(`/api/meta/status?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.message ?? `Request failed (${res.status})`);
  }
  return payload as MetaStatusResponse;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt$(n: number, sym = "$"): string {
  return `${sym}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtK(n: number, sym = "$"): string {
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}k`;
  return fmt$(n, sym);
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

function overlapDayCountInclusive(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): number {
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  if (start > end) return 0;
  return dayDiffInclusive(start, end);
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

function clampDateRangeForHistoryLimit(
  value: DateRangeValue,
  referenceDate: string | undefined,
  maxHistoryDays: number | null
): DateRangeValue {
  if (maxHistoryDays === null) return value;
  const resolved = referenceDate
    ? getPresetDatesForReferenceDate(
        value.rangePreset,
        referenceDate,
        value.customStart,
        value.customEnd
      )
    : getPresetDates(value.rangePreset, value.customStart, value.customEnd);
  const earliestAllowed = addDaysToISO(resolved.end, -(maxHistoryDays - 1));
  const clampedStart =
    value.rangePreset === "custom" && resolved.start < earliestAllowed
      ? earliestAllowed
      : value.customStart;
  const comparisonPreset =
    value.comparisonPreset === "previousYear" || value.comparisonPreset === "previousYearMatch"
      ? "none"
      : value.comparisonPreset;
  return {
    ...value,
    customStart: clampedStart,
    comparisonPreset,
    comparisonStart: comparisonPreset === "none" ? "" : value.comparisonStart,
    comparisonEnd: comparisonPreset === "none" ? "" : value.comparisonEnd,
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
  comparisonLabel?: string;
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
  comparisonLabel = "vs previous period",
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
              {changePct.toFixed(1)}% {comparisonLabel}
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
  language,
}: {
  message: string;
  onRetry: () => void;
  language: "en" | "tr";
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">
        {language === "tr" ? "Veri yüklenemedi" : "Could not load data"}
      </p>
      <p className="mt-1 text-xs text-destructive/80">{message}</p>
      <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
        {language === "tr" ? "Tekrar dene" : "Retry"}
      </Button>
    </div>
  );
}

function MetaStatusBanner({
  status,
  language,
}: {
  status: MetaStatusResponse | undefined;
  language: "en" | "tr";
}) {
  if (!status || status.state === "ready" || status.state === "not_connected") {
    return null;
  }

  if (status.state === "connected_no_assignment") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-800">
          {language === "tr"
            ? "Meta bağlı, ancak reklam hesabı atanmadı."
            : "Meta is connected, but no ad account is assigned."}
        </p>
        <p className="mt-1 text-sm text-amber-700">
          {language === "tr"
            ? "Veri gösterebilmek için bu workspace'e en az bir Meta reklam hesabı atayın."
            : "Assign at least one Meta ad account to this workspace to start serving data."}
        </p>
      </div>
    );
  }

  if (status.state === "syncing" || status.state === "partial") {
    return null;
  }

  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">
        {language === "tr"
          ? "Meta senkronunda müdahale gerektiren bir durum var."
          : "Meta sync needs attention."}
      </p>
      <p className="mt-1 text-sm text-destructive/80">
        {status.latestSync?.lastError
          ? status.latestSync.lastError
          : language === "tr"
            ? "Senkron tamamlanamadı. Entegrasyonu yeniden bağladıktan sonra tekrar deneyin."
            : "The sync could not finish. Reconnect the integration and try again."}
      </p>
    </div>
  );
}

function NoAccountsAssigned() {
  const router = useRouter();
  const language = usePreferencesStore((state) => state.language);
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <p className="text-sm font-medium">
        {language === "tr" ? "Meta reklam hesabi atanmamis" : "No Meta ad accounts assigned"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {language === "tr"
          ? "Bu isletmeye bir veya daha fazla Meta reklam hesabi atayin."
          : "Assign one or more Meta ad accounts to this business."}
      </p>
      <Button
        className="mt-4"
        variant="outline"
        onClick={() => router.push("/integrations")}
      >
        {language === "tr" ? "Entegrasyonlari ac" : "Open Integrations"}
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
  const sym = useCurrencySymbol();
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
              {fmtK(row.spend, sym)}
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
  const sym = useCurrencySymbol();
  const language = usePreferencesStore((state) => state.language);
  const total = rows.reduce((a, r) => a + r.spend, 0);
  const top = rows.slice(0, 7);

  if (top.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {language === "tr" ? "Lokasyon verisi yok." : "No location data."}
      </p>
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
              {fmtK(row.spend, sym)}
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
  const language = usePreferencesStore((state) => state.language);
  const businesses = useAppStore((s) => s.businesses);
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const { plan: currentPlan } = usePlanState();
  const businessId = selectedBusinessId ?? "";
  const sym = useCurrencySymbol();

  const domains = useIntegrationsStore((s) =>
    selectedBusinessId ? s.domainsByBusinessId[selectedBusinessId] : undefined
  );
  const { isBootstrapping, bootstrapStatus } = useBusinessIntegrationsBootstrap(
    selectedBusinessId ?? null
  );

  const [dateRange, setDateRange] = usePersistentDateRange();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<Date | null>(null);
  const [checkedRecIds, setCheckedRecIds] = useState<Set<string>>(new Set());
  const [isManualRefreshRunning, setIsManualRefreshRunning] = useState(false);
  const [bootstrapRequestedForBusiness, setBootstrapRequestedForBusiness] = useState<string | null>(null);
  const allowedHistoryDays = PRICING_PLANS[currentPlan].limits.analyticsHistoryDays;
  const previousYearAllowed = allowedHistoryDays === null || allowedHistoryDays > 365;


  if (!selectedBusinessId) return <BusinessEmptyState />;

  const isDemoBusiness = isDemoBusinessSelected(selectedBusinessId, businesses);
  const metaView = deriveProviderViewState("meta", domains?.meta ?? {
    provider: "meta",
    connection: { status: "disconnected" },
    discovery: {
      status: "idle",
      entities: [],
      source: null,
      fetchedAt: null,
      notice: null,
      stale: false,
      refreshFailed: false,
    },
    assignment: {
      status: "idle",
      selectedIds: [],
      updatedAt: null,
    },
  });
  const showBootstrapGuard =
    !isDemoBusiness &&
    (isBootstrapping ||
      metaView.status === "loading_data" ||
      (bootstrapStatus !== "ready" && !metaView.isConnected));
  const metaConnected = metaView.isConnected || isDemoBusiness;

  const baseStatusQuery = useQuery({
    queryKey: ["meta-status-base", businessId],
    enabled: metaConnected,
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const state = (query.state.data as MetaStatusResponse | undefined)?.state;
      return state === "syncing" || state === "partial" ? 5_000 : false;
    },
    queryFn: () => fetchMetaStatus(businessId),
  });
  const metaReferenceDate = baseStatusQuery.data?.currentDateInTimezone ?? undefined;
  const metaTimeZoneLabel = baseStatusQuery.data?.primaryAccountTimezone ?? undefined;
  const { start: startDate, end: endDate } = metaReferenceDate
    ? getPresetDatesForReferenceDate(
        dateRange.rangePreset,
        metaReferenceDate,
        dateRange.customStart,
        dateRange.customEnd
      )
    : getPresetDates(
        dateRange.rangePreset,
        dateRange.customStart,
        dateRange.customEnd
      );

  useEffect(() => {
    if (allowedHistoryDays === null && previousYearAllowed) return;
    const normalized = clampDateRangeForHistoryLimit(
      dateRange,
      metaReferenceDate,
      allowedHistoryDays
    );
    const changed =
      normalized.customStart !== dateRange.customStart ||
      normalized.customEnd !== dateRange.customEnd ||
      normalized.comparisonPreset !== dateRange.comparisonPreset ||
      normalized.comparisonStart !== dateRange.comparisonStart ||
      normalized.comparisonEnd !== dateRange.comparisonEnd;
    if (changed) {
      setDateRange(normalized);
    }
  }, [allowedHistoryDays, dateRange, metaReferenceDate, previousYearAllowed, setDateRange]);
  const statusQuery = useQuery({
    queryKey: ["meta-status", businessId],
    enabled: metaConnected,
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const state = (query.state.data as MetaStatusResponse | undefined)?.state;
      return state === "syncing" || state === "partial" ? 5_000 : false;
    },
    queryFn: () => fetchMetaStatus(businessId),
    placeholderData: baseStatusQuery.data,
  });
  const effectiveStatus = statusQuery.data ?? baseStatusQuery.data;
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
    queryFn: () => fetchMetaCampaigns(businessId, startDate, endDate, false),
  });

  const campaignPrevQuery = useQuery({
    queryKey: ["meta-campaigns-prev", businessId, startDate, endDate],
    enabled: metaConnected && campaignsQuery.isSuccess,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchMetaCampaigns(businessId, startDate, endDate, true),
  });

  const breakdownsQuery = useQuery({
    queryKey: ["meta-breakdowns", businessId, startDate, endDate],
    enabled: metaConnected,
    queryFn: () => fetchMetaBreakdowns(businessId, startDate, endDate),
  });

  const summaryQuery = useQuery({
    queryKey: ["meta-warehouse-summary", businessId, startDate, endDate],
    enabled: metaConnected,
    staleTime: 60 * 1000,
    queryFn: () => fetchMetaSummary(businessId, startDate, endDate),
  });

  const recommendationsQuery = useQuery({
    queryKey: ["meta-recommendations-v8", businessId, startDate, endDate],
    enabled: false,
    staleTime: Infinity,
    queryFn: () => fetchMetaRecommendations(businessId, startDate, endDate),
  });

  useEffect(() => {
    if (!businessId || !metaConnected) return;
    const status = effectiveStatus;
    if (!status?.needsBootstrap) return;
    if (status.latestSync?.status === "running") return;
    if (bootstrapRequestedForBusiness === businessId) return;

    setBootstrapRequestedForBusiness(businessId);
    void fetch("/api/sync/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        businessId,
        provider: "meta",
        mode: "initial",
      }),
    }).finally(() => {
      void baseStatusQuery.refetch();
      void statusQuery.refetch();
      void summaryQuery.refetch();
    });
  }, [
    baseStatusQuery,
    bootstrapRequestedForBusiness,
    businessId,
    effectiveStatus,
    metaConnected,
    summaryQuery,
  ]);

  // Scroll the left panel item into view when a campaign is selected via AI recommendation
  useEffect(() => {
    if (!selectedCampaignId) return;
    const el = document.getElementById(`meta-list-item-${selectedCampaignId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedCampaignId]);

  function handleAnalyze() {
    recommendationsQuery.refetch().then(() => {
      setLastAnalyzedAt(new Date());
      setCheckedRecIds(new Set());
    });
  }

  function handleToggleCheck(id: string) {
    setCheckedRecIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRefreshData() {
    if (!businessId || isManualRefreshRunning || isSyncInProgress) return;
    try {
      setIsManualRefreshRunning(true);
      await fetch("/api/sync/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          businessId,
          provider: "meta",
        }),
      });

      await Promise.allSettled([
        statusQuery.refetch(),
        summaryQuery.refetch(),
        campaignsQuery.refetch(),
        campaignPrevQuery.refetch(),
        breakdownsQuery.refetch(),
        comparisonCampaignsQuery.refetch(),
        comparisonSummaryQuery.refetch(),
      ]);
    } finally {
      setIsManualRefreshRunning(false);
    }
  }

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
        comparisonWindow!.endDate,
        false
      ),
  });

  const comparisonSummaryQuery = useQuery({
    queryKey: [
      "meta-warehouse-summary-compare",
      businessId,
      comparisonWindow?.startDate,
      comparisonWindow?.endDate,
    ],
    enabled: metaConnected && Boolean(comparisonWindow),
    staleTime: 60 * 1000,
    queryFn: () =>
      fetchMetaSummary(
        businessId,
        comparisonWindow!.startDate,
        comparisonWindow!.endDate
      ),
  });

  // KPIs are derived from the campaign rows — no extra API call
  const warehouseKpis = useMemo(() => {
    const totals = summaryQuery.data?.totals;
    if (!totals) return null;
    return {
      totalSpend: totals.spend,
      totalRevenue: totals.revenue,
      avgCpa: totals.cpa ?? 0,
      blendedRoas: totals.roas,
    } satisfies KpiData;
  }, [summaryQuery.data]);
  const campaignWarehouseKpis = useMemo(
    () => computeKpis(campaignsQuery.data?.rows ?? []),
    [campaignsQuery.data]
  );
  const isTodayRange =
    dateRange.rangePreset === "today" ||
    (Boolean(metaReferenceDate) && startDate === endDate && startDate === metaReferenceDate);
  const summaryHistoricalProgress = summaryQuery.data?.historicalSync;
  const historicalBackfillEnd =
    metaReferenceDate ? addDaysToISO(metaReferenceDate, -1) : null;
  const historicalBackfillStart =
    historicalBackfillEnd
      ? addDaysToISO(historicalBackfillEnd, -(META_WAREHOUSE_HISTORY_DAYS - 1))
      : null;
  const statusHistoricalProgress = effectiveStatus?.latestSync
    ? {
        progressPercent: effectiveStatus.latestSync.progressPercent ?? 0,
        completedDays: effectiveStatus.latestSync.completedDays ?? 0,
        totalDays: effectiveStatus.latestSync.totalDays ?? META_WAREHOUSE_HISTORY_DAYS,
        readyThroughDate: effectiveStatus.latestSync.readyThroughDate ?? null,
        state: (effectiveStatus.state === "ready"
          ? "ready"
          : effectiveStatus.state === "partial"
            ? "partial"
            : "syncing") as "ready" | "syncing" | "partial",
      }
    : null;
  const mergedHistoricalProgress =
    statusHistoricalProgress ?? summaryHistoricalProgress ?? null;
  const summaryHistoricalWarehouseReady =
    summaryQuery.isSuccess &&
    (summaryHistoricalProgress?.state === "ready" &&
      (summaryHistoricalProgress?.progressPercent ?? 0) >= 100);
  const statusWarehouseWindowReady =
    !isTodayRange &&
    Boolean(
      effectiveStatus?.warehouse?.firstDate &&
        effectiveStatus?.warehouse?.lastDate &&
        effectiveStatus.warehouse.firstDate <= startDate &&
        effectiveStatus.warehouse.lastDate >= endDate
    );
  const historicalWarehouseReady =
    statusWarehouseWindowReady ||
    summaryHistoricalWarehouseReady ||
    (!summaryQuery.isSuccess &&
      (mergedHistoricalProgress?.state === "ready" &&
        (mergedHistoricalProgress?.progressPercent ?? 0) >= 100));
  const hasCampaignSpend =
    (campaignsQuery.data?.rows ?? []).some((row) => (row.spend ?? 0) > 0);
  const hasMissingBreakdownData =
    !isTodayRange &&
    !breakdownsQuery.isLoading &&
    hasCampaignSpend &&
    (breakdownsQuery.data?.age?.length ?? 0) === 0 &&
    (breakdownsQuery.data?.location?.length ?? 0) === 0 &&
    (breakdownsQuery.data?.placement?.length ?? 0) === 0;
  const emptyKpis: KpiData = {
    totalSpend: 0,
    totalRevenue: 0,
    avgCpa: 0,
    blendedRoas: 0,
  };
  const kpis = warehouseKpis ?? campaignWarehouseKpis ?? emptyKpis;
  const historicalProgressStatus: MetaStatusResponse | undefined = effectiveStatus
    ? {
        ...effectiveStatus,
        state:
          shouldRenderMetaSyncProgress(effectiveStatus) || hasMissingBreakdownData
            ? "partial"
            : effectiveStatus.state,
        latestSync: {
          status: effectiveStatus.latestSync?.status ?? "pending",
          syncType: effectiveStatus.latestSync?.syncType ?? "initial_backfill",
          scope: effectiveStatus.latestSync?.scope ?? "account_daily",
          startDate: effectiveStatus.latestSync?.startDate ?? null,
          endDate: effectiveStatus.latestSync?.endDate ?? null,
          triggerSource: effectiveStatus.latestSync?.triggerSource ?? "initial_connect",
          triggeredAt: effectiveStatus.latestSync?.triggeredAt ?? null,
          startedAt: effectiveStatus.latestSync?.startedAt ?? null,
          finishedAt: effectiveStatus.latestSync?.finishedAt ?? null,
          lastError: effectiveStatus.latestSync?.lastError ?? null,
          progressPercent:
            mergedHistoricalProgress?.progressPercent ??
            effectiveStatus.latestSync?.progressPercent ??
            0,
          completedDays:
            mergedHistoricalProgress?.completedDays ??
            effectiveStatus.latestSync?.completedDays ??
            0,
          totalDays:
            mergedHistoricalProgress?.totalDays ??
            effectiveStatus.latestSync?.totalDays ??
            META_WAREHOUSE_HISTORY_DAYS,
          readyThroughDate:
            mergedHistoricalProgress?.readyThroughDate ??
            effectiveStatus.latestSync?.readyThroughDate ??
            effectiveStatus.warehouse?.lastDate ??
            null,
          phaseLabel:
            effectiveStatus.latestSync?.phaseLabel ??
            (language === "tr" ? "Gecmis veriler hazirlaniyor" : "Historical backfill"),
        },
      }
    : undefined;
  const shouldShowHistoricalProgress =
    metaConnected &&
    (shouldRenderMetaSyncProgress(historicalProgressStatus) || hasMissingBreakdownData);
  const isSyncInProgress =
    shouldShowHistoricalProgress &&
    (historicalProgressStatus?.latestSync?.status ?? null) === "running";

  const previousWarehouseKpis = useMemo(() => {
    const totals = comparisonSummaryQuery.data?.totals;
    if (!totals) return null;
    return {
      totalSpend: totals.spend,
      totalRevenue: totals.revenue,
      avgCpa: totals.cpa ?? 0,
      blendedRoas: totals.roas,
    } satisfies KpiData;
  }, [comparisonSummaryQuery.data]);
  const previousCampaignKpis = useMemo(
    () => computeKpis(comparisonCampaignsQuery.data?.rows ?? []),
    [comparisonCampaignsQuery.data]
  );
  const previousKpis = previousWarehouseKpis ?? previousCampaignKpis ?? emptyKpis;
  const campaignRowsForTable = useMemo<MetaCampaignTableRow[]>(() => {
    const rows = campaignsQuery.data?.rows ?? [];
    const laneById = buildMetaCampaignLaneSignals(rows);
    const recommendationMetaById = new Map<
      string,
      { count: number; topActionHint: string | null }
    >();
    for (const recommendation of recommendationsQuery.data?.recommendations ?? []) {
      if (!recommendation.campaignId) continue;
      const existing = recommendationMetaById.get(recommendation.campaignId);
      if (!existing) {
        recommendationMetaById.set(recommendation.campaignId, {
          count: 1,
          topActionHint: recommendation.title,
        });
        continue;
      }
      recommendationMetaById.set(recommendation.campaignId, {
        count: existing.count + 1,
        topActionHint: existing.topActionHint ?? recommendation.title,
      });
    }
    const prevConfigById = new Map(
      (campaignPrevQuery.data?.rows ?? []).map((row) => [row.id, row])
    );
    if (!comparisonWindow || !comparisonCampaignsQuery.data?.rows?.length) {
      return rows.map((row) => ({
        ...row,
        laneLabel: laneById.get(row.id)?.lane ?? null,
        recommendationCount: recommendationMetaById.get(row.id)?.count ?? 0,
        topActionHint: recommendationMetaById.get(row.id)?.topActionHint ?? null,
        isFocused: selectedCampaignId === row.id,
        previousManualBidAmount: prevConfigById.get(row.id)?.previousManualBidAmount ?? row.previousManualBidAmount,
        previousBidValue: prevConfigById.get(row.id)?.previousBidValue ?? row.previousBidValue,
        previousBidValueFormat: prevConfigById.get(row.id)?.previousBidValueFormat ?? row.previousBidValueFormat,
        previousBidValueCapturedAt:
          prevConfigById.get(row.id)?.previousBidValueCapturedAt ?? row.previousBidValueCapturedAt,
        previousDailyBudget: prevConfigById.get(row.id)?.previousDailyBudget ?? row.previousDailyBudget,
        previousLifetimeBudget:
          prevConfigById.get(row.id)?.previousLifetimeBudget ?? row.previousLifetimeBudget,
        previousBudgetCapturedAt:
          prevConfigById.get(row.id)?.previousBudgetCapturedAt ?? row.previousBudgetCapturedAt,
      }));
    }

    const previousById = new Map(
      comparisonCampaignsQuery.data.rows.map((row) => [row.id, row])
    );

    return rows.map((row) => {
      const prev = previousById.get(row.id);
      return {
        ...row,
        laneLabel: laneById.get(row.id)?.lane ?? null,
        recommendationCount: recommendationMetaById.get(row.id)?.count ?? 0,
        topActionHint: recommendationMetaById.get(row.id)?.topActionHint ?? null,
        isFocused: selectedCampaignId === row.id,
        previousManualBidAmount: prevConfigById.get(row.id)?.previousManualBidAmount ?? row.previousManualBidAmount,
        previousBidValue: prevConfigById.get(row.id)?.previousBidValue ?? row.previousBidValue,
        previousBidValueFormat: prevConfigById.get(row.id)?.previousBidValueFormat ?? row.previousBidValueFormat,
        previousBidValueCapturedAt:
          prevConfigById.get(row.id)?.previousBidValueCapturedAt ?? row.previousBidValueCapturedAt,
        previousDailyBudget: prevConfigById.get(row.id)?.previousDailyBudget ?? row.previousDailyBudget,
        previousLifetimeBudget:
          prevConfigById.get(row.id)?.previousLifetimeBudget ?? row.previousLifetimeBudget,
        previousBudgetCapturedAt:
          prevConfigById.get(row.id)?.previousBudgetCapturedAt ?? row.previousBudgetCapturedAt,
        previousSpend: prev?.spend,
        previousRevenue: prev?.revenue,
        previousRoas: prev?.roas,
        previousCpa: prev?.cpa,
      };
    });
  }, [
    campaignPrevQuery.data?.rows,
    campaignsQuery.data?.rows,
    comparisonCampaignsQuery.data?.rows,
    comparisonWindow,
    selectedCampaignId,
    recommendationsQuery.data?.recommendations,
  ]);

  return (
    <PlanGate requiredPlan="growth">
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meta Ads</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {language === "tr"
              ? "Kampanya performansı, demografik kırılımlar ve ad set detay incelemesi."
              : "Campaign performance, demographic breakdowns, and ad set drill-down."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {metaConnected && shouldShowHistoricalProgress && (
            <MetaSyncProgress
              status={historicalProgressStatus}
              language={language}
              variant="inline"
              className="max-w-[320px]"
            />
          )}
          {metaConnected && (
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => void handleRefreshData()}
              disabled={isManualRefreshRunning || isSyncInProgress}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${(isManualRefreshRunning || isSyncInProgress) ? "animate-spin" : ""}`}
              />
              {language === "tr"
                ? isManualRefreshRunning || isSyncInProgress
                  ? "Senkron devam ediyor"
                  : "Veriyi yenile"
                : isManualRefreshRunning || isSyncInProgress
                  ? "Sync in progress"
                  : "Refresh data"}
            </Button>
          )}
          <div className="shrink-0 rounded-xl border bg-card p-1 shadow-sm">
            <DateRangePicker
              value={dateRange}
              onChange={(next) =>
                setDateRange(
                  clampDateRangeForHistoryLimit(next, metaReferenceDate, allowedHistoryDays)
                )
              }
              rangePresets={["today", "yesterday", "3d", "7d", "14d", "30d", "90d", "custom"]}
              comparisonPresets={
                previousYearAllowed
                  ? undefined
                  : ["none", "previousPeriod", "previousWeek", "previousMonth", "previousQuarter"]
              }
              referenceDate={metaReferenceDate}
              timeZoneLabel={metaTimeZoneLabel}
            />
          </div>
        </div>
      </div>

      {/* ── Integration gate ─────────────────────────────────────────────── */}
      {!metaConnected && showBootstrapGuard && (
        <LoadingSkeleton
          rows={4}
          title={language === "tr" ? "Meta bağlantısı hazırlanıyor" : "Preparing Meta connection"}
          description={
            language === "tr"
              ? "Bağlantı, hesap keşfi ve assignment durumu kontrol ediliyor."
              : "We are checking the connection, available ad accounts, and assignment state."
          }
        />
      )}

      {!showBootstrapGuard && !metaConnected && (
        <IntegrationEmptyState
          providerLabel="Meta"
          status={
            metaView.status === "action_required" ? "error" : "disconnected"
          }
          description={
            language === "tr"
              ? "Meta hesabinizi bagladiginizda kampanyalari, ad set'leri ve creative icgorulerini goruntuleyin."
              : "View campaigns, ad sets, and creative insights once your Meta account is connected."
          }
        />
      )}

      {metaConnected && (
        <>
          <MetaStatusBanner status={effectiveStatus} language={language} />
          {/* ── KPI Row — unchanged ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
                label={language === "tr" ? "Toplam Harcama" : "Total Spend"}
                value={campaignsQuery.isLoading ? "—" : fmtK(kpis.totalSpend, sym)}
                subLabel={
                  language === "tr"
                    ? `${campaignsQuery.data?.rows?.length ?? 0} kampanya`
                    : `${campaignsQuery.data?.rows?.length ?? 0} campaigns`
                }
                icon={DollarSign}
                accentClass="border-l-4 border-l-blue-500/60"
                comparisonLabel={language === "tr" ? "önceki döneme göre" : "vs previous period"}
                changePct={comparisonWindow ? computeChangePct(kpis.totalSpend, previousKpis.totalSpend) : null}
              />
              <KpiCard
                label={language === "tr" ? "Toplam Gelir" : "Total Revenue"}
                value={campaignsQuery.isLoading ? "—" : fmtK(kpis.totalRevenue, sym)}
                subLabel={language === "tr" ? "Atfedilen purchase'lar" : "Attributed purchases"}
                icon={TrendingUp}
                accentClass="border-l-4 border-l-emerald-500/60"
                valueClass="text-emerald-600"
                comparisonLabel={language === "tr" ? "önceki döneme göre" : "vs previous period"}
                changePct={comparisonWindow ? computeChangePct(kpis.totalRevenue, previousKpis.totalRevenue) : null}
              />
              <KpiCard
                label="Avg. CPA"
                value={campaignsQuery.isLoading ? "—" : fmt$(kpis.avgCpa, sym)}
                subLabel={language === "tr" ? "Dönüşum basi maliyet" : "Cost per conversion"}
                icon={Target}
                accentClass="border-l-4 border-l-violet-500/60"
                comparisonLabel={language === "tr" ? "önceki döneme göre" : "vs previous period"}
                changePct={comparisonWindow ? computeChangePct(kpis.avgCpa, previousKpis.avgCpa) : null}
                positiveIsGood={false}
              />
              <KpiCard
                label="Blended ROAS"
                value={campaignsQuery.isLoading ? "—" : `${kpis.blendedRoas.toFixed(2)}×`}
                subLabel={language === "tr" ? "Tum kampanyalar birlesik" : "All campaigns combined"}
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
                changePct={comparisonWindow ? computeChangePct(kpis.blendedRoas, previousKpis.blendedRoas) : null}
                comparisonLabel={language === "tr" ? "önceki döneme göre" : "vs previous period"}
              />
          </div>

          {/* ── Master-detail layout ─────────────────────────────────────── */}
          {campaignsQuery.isLoading && (
            <LoadingSkeleton
              rows={6}
              title={language === "tr" ? "Kampanya performansı yükleniyor" : "Loading campaign performance"}
              description={
                language === "tr"
                  ? "Önce Meta account-level özet hazırlanır, ardından kampanyalar ve kırılımlar açılır."
                  : "Account-level performance is prepared first, then campaigns and breakdowns open."
              }
            />
          )}

          {campaignsQuery.isError && (
            <SectionError
              message={
                campaignsQuery.error instanceof Error
                  ? campaignsQuery.error.message
                  : language === "tr"
                  ? "Kampanya verisi yüklenemedi."
                  : "Could not load campaign data."
              }
              language={language}
              onRetry={() => campaignsQuery.refetch()}
            />
          )}

          {!campaignsQuery.isLoading && !campaignsQuery.isError && (() => {
            const status = campaignsQuery.data?.status;
            if (status === "no_accounts_assigned") return <NoAccountsAssigned />;

            const rows = campaignsQuery.data?.rows ?? [];
            if (rows.length === 0)
              return (
                <DataEmptyState
                  title={language === "tr" ? "Kampanya verisi bulunamadi" : "No campaign data found"}
                  description={
                    language === "tr"
                      ? "Secilen tarih araliginda atanmis Meta reklam hesaplari için çalışan kampanya bulunamadi."
                      : "No campaigns ran in the selected date range for the assigned Meta ad accounts."
                  }
                />
              );

            // Map of campaign ID → highest-priority decision state (act > test > watch)
            const ORDER = { act: 0, test: 1, watch: 2 } as const;
            const campaignRecStates = new Map<string, "act" | "test" | "watch">();
            for (const r of recommendationsQuery.data?.recommendations ?? []) {
              if (!r.campaignId) continue;
              const existing = campaignRecStates.get(r.campaignId);
              if (!existing || ORDER[r.decisionState] < ORDER[existing]) {
                campaignRecStates.set(r.campaignId, r.decisionState);
              }
            }

            const selectedCampaign =
              campaignRowsForTable.find((c) => c.id === selectedCampaignId) ?? null;

            const placementRows = (breakdownsQuery.data?.placement ?? []).map((row) => ({
              key: row.key,
              label: row.label,
              spend: row.spend,
              roas: row.spend > 0 ? row.revenue / row.spend : 0,
            }));

            return (
              <div className="flex gap-4" style={{ minHeight: "520px" }}>
                {/* ── Left panel: campaign list + breakdowns ───────────── */}
                <div className="flex w-64 shrink-0 flex-col gap-3 xl:w-72">
                  {/* Campaign list */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {language === "tr" ? "Kampanyalar" : "Campaigns"}
                        <span className="ml-1.5 text-slate-300">{campaignRowsForTable.length}</span>
                      </p>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-1.5">
                      <MetaCampaignList
                        campaigns={campaignRowsForTable}
                        selectedId={selectedCampaignId}
                        onSelect={setSelectedCampaignId}
                        campaignRecStates={campaignRecStates}
                      />
                    </div>
                  </div>

                  {/* Age breakdown */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {language === "tr" ? "Yaşa Göre ROAS" : "ROAS by Age"}
                      </p>
                    </div>
                    <div className="p-3">
                      {breakdownsQuery.isLoading ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-slate-500">
                            {language === "tr"
                              ? "Yaş segment performansı hazırlanıyor."
                              : "Preparing age-segment performance."}
                          </p>
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
                          ))}
                        </div>
                      ) : (
                        <AgeBreakdownBadges rows={breakdownsQuery.data?.age ?? []} />
                      )}
                    </div>
                  </div>

                  {/* Location breakdown */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {language === "tr" ? "En İyi Ülkeler" : "Top Countries"}
                      </p>
                    </div>
                    <div className="p-3">
                      {breakdownsQuery.isLoading ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-slate-500">
                            {language === "tr"
                              ? "Ülke bazlı harcama dağılımı hazırlanıyor."
                              : "Preparing country-level spend distribution."}
                          </p>
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="h-6 animate-pulse rounded bg-slate-100" />
                          ))}
                        </div>
                      ) : (
                        <LocationBreakdownList rows={breakdownsQuery.data?.location ?? []} />
                      )}
                    </div>
                  </div>

                  {/* Platform Share */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {language === "tr" ? "Platform Payı" : "Platform Share"}
                      </p>
                    </div>
                    <div className="p-3">
                      {breakdownsQuery.isLoading ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-slate-500">
                            {language === "tr"
                              ? "Placement dağılımı hazırlanıyor."
                              : "Preparing placement distribution."}
                          </p>
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="h-6 animate-pulse rounded bg-slate-100" />
                          ))}
                        </div>
                      ) : (
                        <PlacementBreakdownChart rows={placementRows} topN={6} />
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Right panel: campaign detail ──────────────────────── */}
                <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 shadow-sm">
                  <MetaCampaignDetail
                    campaign={selectedCampaign}
                    recommendationsData={recommendationsQuery.data}
                    isRecsLoading={recommendationsQuery.isFetching}
                    lastAnalyzedAt={lastAnalyzedAt}
                    checkedRecIds={checkedRecIds}
                    onToggleCheck={handleToggleCheck}
                    onAnalyze={handleAnalyze}
                    businessId={businessId}
                    since={startDate}
                    until={endDate}
                    language={language}
                  />
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
    </PlanGate>
  );
}
