"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
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
import { buildCrossEntityIntelligence } from "@/lib/google-ads/cross-entity-intelligence";
import {
  CampaignBadges,
  ColDef,
  HealthBadge,
  PerfBadge,
  SimpleTable,
  SpendBar,
  StatusBadge,
  TabEmpty,
  TabSkeleton,
  fmtCurrency,
  fmtNumber,
  fmtPercent,
  fmtRoas,
} from "@/components/google-ads/shared";
import { WorkspaceTaskCard } from "@/components/google-ads/workspace-cards";

type DateRange = "7" | "14" | "30" | "90" | "mtd" | "qtd" | "custom";
type CompareMode = "none" | "previous_period" | "previous_year" | "custom";

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
  failed_queries?: Array<{
    query: string;
    message: string;
    customerId?: string;
    loginCustomerId?: string;
    severity?: "core" | "optional";
    category?:
      | "auth_permission_context"
      | "unsupported_query_shape"
      | "unavailable_metric"
      | "bad_query_shape"
      | "optional_advanced_failure"
      | "unknown";
  }>;
  unavailable_metrics?: string[];
};

type QueryFailureShape = NonNullable<MetaShape["failed_queries"]>[number];

type QueryResult = {
  rows?: Array<Record<string, any>>;
  data?: Array<Record<string, any>>;
  summary?: Record<string, any>;
  insights?: any;
  meta?: MetaShape;
  [key: string]: any;
};

const COMPARE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: "none", label: "No comparison" },
  { value: "previous_period", label: "Previous period" },
  { value: "previous_year", label: "Same period last year" },
  { value: "custom", label: "Custom comparison" },
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
      { id: "search-intelligence", label: "Search Terms", icon: Target },
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
      { id: "audiences", label: "Audience", icon: Users2 },
      { id: "geo-devices", label: "Geo & Devices", icon: Map },
      { id: "diagnostics", label: "Diagnostics", icon: ShieldAlert },
    ],
  },
];

async function fetchReport(
  endpoint: string,
  businessId: string,
  dateRange: DateRange,
  extra: Record<string, string | undefined> = {}
): Promise<QueryResult> {
  const params = new URLSearchParams({ businessId, dateRange });
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
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
    failed_queries: [] as QueryFailureShape[],
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
    failed_queries: combined.failed_queries.filter((failure, index, list) => {
      const key = [
        failure.query,
        failure.customerId ?? "",
        failure.loginCustomerId ?? "",
        failure.category ?? "",
        failure.message,
      ].join("|");
      return (
        index ===
        list.findIndex((candidate) =>
          [
            candidate.query,
            candidate.customerId ?? "",
            candidate.loginCustomerId ?? "",
            candidate.category ?? "",
            candidate.message,
          ].join("|") === key
        )
      );
    }),
    unavailable_metrics: Array.from(new Set(combined.unavailable_metrics)),
  };
}

function deltaTone(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "neutral";
  return value > 0 ? "up" : "down";
}

function formatDelta(value: number | null | undefined, suffix = "%") {
  if (value === undefined) return "No compare";
  if (value === null) return "New";
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

function DatePickerCalendar({
  year,
  month,
  rangeStart,
  rangeEnd,
  hoverDate,
  pickStep,
  onDateClick,
  onDateHover,
  onMonthChange,
}: {
  year: number;
  month: number;
  rangeStart: string;
  rangeEnd: string;
  hoverDate: string;
  pickStep: "start" | "end";
  onDateClick: (date: string) => void;
  onDateHover: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
}) {
  const cells = buildMonthGrid(year, month);
  const effectiveEnd = pickStep === "end" && hoverDate && hoverDate > rangeStart ? hoverDate : rangeEnd;

  function getCellClass(date: string) {
    const isStart = date === rangeStart;
    const isEnd = date === effectiveEnd;
    const inRange = rangeStart && effectiveEnd && date > rangeStart && date < effectiveEnd;
    if (isStart || isEnd) {
      return "flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background";
    }
    if (inRange) {
      return "flex h-8 w-8 items-center justify-center bg-accent/70 text-[11px] text-accent-foreground";
    }
    return "flex h-8 w-8 items-center justify-center rounded-full text-[11px] transition-colors hover:bg-accent";
  }

  return (
    <div className="w-[264px]">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const next = shiftMonth(year, month, -1);
            onMonthChange(next.year, next.month);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">{MONTH_NAMES[month]} {year}</span>
        <button
          type="button"
          onClick={() => {
            const next = shiftMonth(year, month, 1);
            onMonthChange(next.year, next.month);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {DAYS_SHORT.map((day) => (
          <div key={day} className="flex h-8 items-center justify-center text-[10px] font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, index) => (
          <div key={index} className="flex items-center justify-center">
            {date ? (
              <button
                type="button"
                className={getCellClass(date)}
                onClick={() => onDateClick(date)}
                onMouseEnter={() => onDateHover(date)}
              >
                {Number(date.slice(8))}
              </button>
            ) : (
              <div className="h-8 w-8" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DateRangeToolbarPopover({
  open,
  onOpenChange,
  currentDateRange,
  customStart,
  customEnd,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDateRange: DateRange;
  customStart: string;
  customEnd: string;
  onApply: (next: { preset: PickerPreset; start: string; end: string }) => void;
}) {
  const initialPreset = getPickerPreset(currentDateRange, customStart, customEnd);
  const initialWindow = getPickerWindow(initialPreset, customStart, customEnd);
  const [draftPreset, setDraftPreset] = useState<PickerPreset>(initialPreset);
  const [draftStart, setDraftStart] = useState(initialWindow.startDate);
  const [draftEnd, setDraftEnd] = useState(initialWindow.endDate);
  const [pickStep, setPickStep] = useState<"start" | "end">("start");
  const initialMonth = parseIsoDate(initialWindow.endDate);
  const [calendarMonth, setCalendarMonth] = useState({ year: initialMonth.getFullYear(), month: initialMonth.getMonth() });
  const [hoverDate, setHoverDate] = useState("");

  const resetDraft = () => {
    const nextPreset = getPickerPreset(currentDateRange, customStart, customEnd);
    const nextWindow = getPickerWindow(nextPreset, customStart, customEnd);
    const nextMonth = parseIsoDate(nextWindow.endDate);
    setDraftPreset(nextPreset);
    setDraftStart(nextWindow.startDate);
    setDraftEnd(nextWindow.endDate);
    setPickStep(nextPreset === "custom" ? "start" : "end");
    setHoverDate("");
    setCalendarMonth({ year: nextMonth.getFullYear(), month: nextMonth.getMonth() });
  };

  const displayWindow = getPickerWindow(draftPreset, draftStart, draftEnd);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) resetDraft();
        onOpenChange(nextOpen);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-full border bg-background px-3 text-xs font-medium"
        >
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{`${formatCompactDate(getDateWindow(currentDateRange, customStart, customEnd).startDate)} — ${formatCompactDate(getDateWindow(currentDateRange, customStart, customEnd).endDate)}`}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} align="start" className="z-50 overflow-hidden rounded-xl border bg-popover shadow-xl">
          <div className="flex">
            <div className="w-52 border-r py-2">
              <p className="px-4 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Date range
              </p>
              {RANGE_PICKER_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    setDraftPreset(preset.value);
                    const nextWindow = getPickerWindow(preset.value, draftStart, draftEnd);
                    setDraftStart(nextWindow.startDate);
                    setDraftEnd(nextWindow.endDate);
                    setPickStep(preset.value === "custom" ? "start" : "end");
                    const nextMonth = parseIsoDate(nextWindow.endDate);
                    setCalendarMonth({ year: nextMonth.getFullYear(), month: nextMonth.getMonth() });
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-accent",
                    draftPreset === preset.value && "bg-accent font-medium text-accent-foreground"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", draftPreset === preset.value ? "bg-foreground" : "bg-transparent")} />
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 p-4">
              <DatePickerCalendar
                year={calendarMonth.year}
                month={calendarMonth.month}
                rangeStart={displayWindow.startDate}
                rangeEnd={displayWindow.endDate}
                hoverDate={hoverDate}
                pickStep={pickStep}
                onDateClick={(date) => {
                  setDraftPreset("custom");
                  if (pickStep === "start") {
                    setDraftStart(date);
                    setDraftEnd(date);
                    setPickStep("end");
                    return;
                  }
                  if (date < draftStart) {
                    setDraftStart(date);
                    setDraftEnd(draftStart);
                  } else {
                    setDraftEnd(date);
                  }
                  setPickStep("start");
                }}
                onDateHover={setHoverDate}
                onMonthChange={(year, month) => setCalendarMonth({ year, month })}
              />
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center text-xs">
                {formatCompactDate(displayWindow.startDate)} — {formatCompactDate(displayWindow.endDate)}
              </div>
              {draftPreset === "custom" ? (
                <p className="text-center text-[11px] text-muted-foreground">
                  {pickStep === "start" ? "Select start date" : "Select end date"}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            <button
              type="button"
              onClick={() => {
                resetDraft();
                onOpenChange(false);
              }}
              className="rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApply({
                  preset: draftPreset,
                  start: displayWindow.startDate,
                  end: displayWindow.endDate,
                });
                onOpenChange(false);
              }}
              className="rounded-md bg-foreground px-4 py-1.5 text-sm font-medium text-background"
            >
              Apply
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function toIsoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function formatCompactDate(value: string) {
  const parsed = parseIsoDate(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

type PickerPreset = "today" | "yesterday" | "7" | "14" | "30" | "90" | "mtd" | "qtd" | "custom";

const RANGE_PICKER_PRESETS: Array<{ value: PickerPreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7", label: "Last 7 Days" },
  { value: "14", label: "Last 14 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "Last 90 Days" },
  { value: "mtd", label: "MTD" },
  { value: "qtd", label: "QTD" },
  { value: "custom", label: "Custom" },
];

const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildMonthGrid(year: number, month: number): (string | null)[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const cells: (string | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(year: number, month: number, delta: number) {
  const next = new Date(year, month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function getPickerWindow(preset: PickerPreset, customStart: string, customEnd: string) {
  if (preset === "today") {
    const today = toIsoDate(new Date());
    return { startDate: today, endDate: today };
  }
  if (preset === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const iso = toIsoDate(yesterday);
    return { startDate: iso, endDate: iso };
  }
  return getDateWindow(preset as DateRange, customStart, customEnd);
}

function getPickerPreset(dateRange: DateRange, customStart: string, customEnd: string): PickerPreset {
  if (dateRange !== "custom") return dateRange;
  const today = toIsoDate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = toIsoDate(yesterday);
  if (customStart === today && customEnd === today) return "today";
  if (customStart === yesterdayIso && customEnd === yesterdayIso) return "yesterday";
  return "custom";
}

function getDateWindow(dateRange: DateRange, customStart?: string, customEnd?: string) {
  const endDate = new Date();
  const startDate = new Date(endDate);

  if (dateRange === "7") {
    startDate.setDate(endDate.getDate() - 7);
  } else if (dateRange === "14") {
    startDate.setDate(endDate.getDate() - 14);
  } else if (dateRange === "30") {
    startDate.setDate(endDate.getDate() - 30);
  } else if (dateRange === "90") {
    startDate.setDate(endDate.getDate() - 90);
  } else if (dateRange === "mtd") {
    startDate.setDate(1);
  } else if (dateRange === "qtd") {
    const month = endDate.getMonth();
    startDate.setMonth(Math.floor(month / 3) * 3, 1);
  } else if (dateRange === "custom" && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }

  return {
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(endDate),
  };
}

function getPreviousWindow(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const daySpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (daySpan - 1));

  return {
    startDate: toIsoDate(previousStart),
    endDate: toIsoDate(previousEnd),
  };
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold">{value}</p>
    </div>
  );
}

function renderStateTone(
  state: "healthy" | "warning" | "critical" | "neutral" | "opportunity",
) {
  return cn(
    "border",
    state === "healthy" && "border-emerald-200 bg-emerald-50 text-emerald-700",
    state === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
    state === "critical" && "border-rose-200 bg-rose-50 text-rose-800",
    state === "neutral" && "border-slate-200 bg-slate-50 text-slate-700",
    state === "opportunity" && "border-sky-200 bg-sky-50 text-sky-700",
  );
}

function DecisionClusterCard({
  title,
  stateLabel,
  tone,
  microcopy,
  evidence,
  action,
}: {
  title: string;
  stateLabel: string;
  tone: "healthy" | "warning" | "critical" | "neutral" | "opportunity";
  microcopy: string;
  evidence: string;
  action: string;
}) {
  return (
    <div className={cn("rounded-2xl border p-4", renderStateTone(tone))}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-tight">{title}</p>
          <p className="mt-1 text-xs leading-5">{microcopy}</p>
        </div>
        <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
          {stateLabel}
        </span>
      </div>
      <p className="mt-3 text-xs font-medium">{evidence}</p>
      <p className="mt-2 text-xs text-foreground/85">Action: {action}</p>
    </div>
  );
}

function SnapshotCard({
  title,
  state,
  interpretation,
  metrics,
  actionHint,
}: {
  title: string;
  state: "healthy" | "warning" | "critical" | "neutral" | "opportunity";
  interpretation: string;
  metrics: string[];
  actionHint: string;
}) {
  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm", renderStateTone(state))}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-tight">{title}</p>
          <p className="mt-1 text-xs leading-5">{interpretation}</p>
        </div>
        <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
          {state === "opportunity" ? "opportunity" : state}
        </span>
      </div>
      <div className="mt-4 space-y-1.5">
        {metrics.map((metric) => (
          <p key={metric} className="text-xs font-medium">
            {metric}
          </p>
        ))}
      </div>
      <div className="mt-4 border-t border-border/50 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Action hint
        </p>
        <p className="mt-1 text-xs">{actionHint}</p>
      </div>
    </div>
  );
}

function PriorityInsightCard({
  title,
  severity,
  explanation,
  evidence,
  action,
}: {
  title: string;
  severity: "healthy" | "warning" | "critical" | "opportunity";
  explanation: string;
  evidence: string[];
  action: string;
}) {
  return (
    <div className={cn("rounded-2xl border p-4", renderStateTone(severity))}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
        <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
          {severity}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6">{explanation}</p>
      <div className="mt-3 rounded-xl bg-background/60 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Evidence
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {evidence.map((item) => (
            <span
              key={item}
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs font-medium">Suggested action: {action}</p>
    </div>
  );
}

function InterpretationCell({
  title,
  state,
  issue,
  microcopy,
  evidence,
  action,
  meta,
}: {
  title: string;
  state: string;
  issue: string;
  microcopy: string;
  evidence: string;
  action: string;
  meta?: ReactNode;
}) {
  return (
    <div className="min-w-[280px] max-w-[320px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-xs font-semibold">{title}</p>
        <ActionStateBadge state={state} />
      </div>
      <p className="mt-2 text-xs font-medium text-foreground">{issue}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{microcopy}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {evidence}
        </span>
        <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border/70">
          {action}
        </span>
      </div>
      {meta ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
    </div>
  );
}

function getCampaignDecision(row: Record<string, any>) {
  const actionState = String(row.actionState ?? "optimize");
  const lostBudget = Number(row.lostIsBudget ?? 0);
  const roas = Number(row.roas ?? 0);
  const spendShare = Number(row.spendShare ?? 0);
  const revenueShare = Number(row.revenueShare ?? 0);
  const shareGap = revenueShare - spendShare;

  if (actionState === "scale") {
    return {
      issue: "Budget pressure with healthy efficiency",
      microcopy: "Return is holding up, but impression share loss suggests this campaign is capped before demand is exhausted.",
      evidence: `${fmtRoas(roas)} ROAS · ${fmtPercent(lostBudget * 100)} lost to budget`,
      action: "Scale candidate",
    };
  }
  if (actionState === "reduce") {
    return {
      issue: "Spend outruns revenue contribution",
      microcopy: "This campaign is absorbing more wallet share than the value it sends back to the account.",
      evidence: `${spendShare.toFixed(1)}% spend share vs ${revenueShare.toFixed(1)}% revenue share`,
      action: "Reduce or rebuild",
    };
  }
  if (actionState === "test") {
    return {
      issue: "Signal is mixed and needs cleaner proof",
      microcopy: "Performance is neither strong enough to scale nor weak enough to cut without a more controlled test.",
      evidence: `${fmtRoas(roas)} ROAS · ${formatDelta(row.roasChange)}`,
      action: "Test before scaling",
    };
  }
  return {
    issue: shareGap >= 0 ? "Healthy base with tuning room" : "Usable performance, but efficiency needs work",
    microcopy:
      shareGap >= 0
        ? "This campaign is carrying its spend share, so optimization can focus on incremental gains."
        : "The campaign is still contributing, but efficiency is not strong enough to call it a scale path yet.",
    evidence: `${fmtRoas(roas)} ROAS · Rev ${formatDelta(row.revenueChange)}`,
    action: "Optimize next",
  };
}

function getSearchDecision(row: Record<string, any>) {
  const recommendation = String(row.recommendation ?? "").toLowerCase();
  if (recommendation.includes("negative")) {
    return {
      state: "reduce",
      issue: "Waste-heavy intent leakage",
      microcopy: "The cluster is pulling clicks and spend without enough conversion proof to justify wider coverage.",
      action: "Block or narrow intent",
    };
  }
  if (recommendation.includes("exact") || recommendation.includes("promote")) {
    return {
      state: "scale",
      issue: "Strong intent deserves tighter coverage",
      microcopy: "This demand is converting well enough that direct control should improve scale and message precision.",
      action: "Promote coverage",
    };
  }
  return {
    state: "test",
    issue: "Emerging intent with incomplete proof",
    microcopy: "The cluster is promising, but it still needs clearer routing between keyword control, copy, and budget.",
    action: "Monitor and test",
  };
}

function getProductDecision(row: Record<string, any>) {
  const state = String(row.statusLabel ?? "optimize");
  const spendShare = Number(row.spendShare ?? 0);
  const revenueShare = Number(row.revenueShare ?? 0);
  if (state === "scale") {
    return {
      issue: "Healthy product with room to win more budget",
      microcopy: "Revenue contribution is keeping up with or beating exposure, which makes this product a clean scale path.",
      evidence: `${fmtRoas(Number(row.roas ?? 0))} ROAS · ${fmtCurrency(Number(row.revenue ?? 0))} revenue`,
      action: "Increase exposure",
    };
  }
  if (state === "reduce") {
    return {
      issue: "Product drag is soaking up spend",
      microcopy: "Spend concentration is not converting into enough value to justify the current exposure level.",
      evidence: `${fmtCurrency(Number(row.spend ?? 0))} spend · ${fmtRoas(Number(row.roas ?? 0))}`,
      action: "Trim budget or fix feed/support",
    };
  }
  return {
    issue: "Support path needs validation",
    microcopy:
      revenueShare >= spendShare
        ? "The product is healthy enough to keep funding, but support paths should be protected."
        : "The product may still matter strategically, but contribution is not yet clear enough for aggressive spend.",
    evidence: `${spendShare.toFixed(1)}% spend share · ${revenueShare.toFixed(1)}% revenue share`,
    action: "Watch contribution",
  };
}

function getRowAccountLabel(row: Record<string, any>) {
  return String(
    row.customerName ??
      row.customerDescriptiveName ??
      row.accountName ??
      row.account ??
      row.customerId ??
      row.accountId ??
      "All accounts",
  );
}

function getRowCampaignType(row: Record<string, any>) {
  return String(row.campaignType ?? row.channel ?? row.type ?? "All campaign types");
}

function filteredTaskFromOpportunities(opportunity?: Record<string, any> | null) {
  if (!opportunity) return null;
  return {
    title: String(opportunity.title ?? "Investigate Google Ads opportunity"),
    impact:
      String(opportunity.expectedImpact ?? "medium").toLowerCase() === "high"
        ? "High impact"
        : String(opportunity.expectedImpact ?? "medium").toLowerCase() === "medium"
          ? "Medium impact"
          : "Low impact",
    evidence: [
      opportunity.metrics?.spend != null
        ? `Spend ${fmtCurrency(Number(opportunity.metrics.spend ?? 0))}`
        : "Spend not specified",
      opportunity.metrics?.roas != null
        ? `ROAS ${fmtRoas(Number(opportunity.metrics.roas ?? 0))}`
        : "ROAS not specified",
    ],
    action: String(opportunity.reasoning ?? opportunity.description ?? "Review and act on this opportunity."),
    tone:
      opportunity.type === "scale"
        ? ("good" as const)
        : opportunity.type === "reduce" || opportunity.type === "fix"
          ? ("risk" as const)
          : ("warning" as const),
  };
}

function OpportunityCard({ opportunity }: { opportunity: Record<string, any> }) {
  const tone =
    opportunity.type === "scale"
      ? "bg-emerald-100 text-emerald-800"
      : opportunity.type === "reduce"
      ? "bg-rose-100 text-rose-800"
      : opportunity.type === "fix"
      ? "bg-amber-100 text-amber-800"
      : "bg-sky-100 text-sky-800";
  const impactTone =
    opportunity.expectedImpact === "high"
      ? "text-emerald-700"
      : opportunity.expectedImpact === "medium"
      ? "text-amber-700"
      : "text-slate-700";

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", tone)}>
            {String(opportunity.type ?? "").replaceAll("_", " ")}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">
            {(Number(opportunity.confidence ?? 0)).toFixed(2)} confidence
          </span>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {opportunity.entityType}
        </span>
      </div>
      <h4 className="mt-3 text-sm font-semibold">{opportunity.title}</h4>
      <p className="mt-1 text-xs text-muted-foreground">{opportunity.description}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Impact</p>
          <p className={cn("mt-1 text-xs font-medium capitalize", impactTone)}>{opportunity.expectedImpact}</p>
        </div>
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Confidence</p>
          <p className="mt-1 text-xs font-medium">{(Number(opportunity.confidence ?? 0)).toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Spend</p>
          <p className="mt-1 text-xs font-medium">
            {opportunity.metrics?.spend != null ? fmtCurrency(Number(opportunity.metrics.spend ?? 0)) : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">ROAS</p>
          <p className="mt-1 text-xs font-medium">
            {opportunity.metrics?.roas != null ? fmtRoas(Number(opportunity.metrics.roas ?? 0)) : "—"}
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-dashed p-3">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Reasoning</p>
        <p className="mt-1 text-xs">{opportunity.reasoning}</p>
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
  const coreBlockers = meta.failed_queries.filter((failure) => failure.severity === "core").length;
  const optionalFailures = meta.failed_queries.filter((failure) => failure.severity !== "core").length;
  const limitationCount = meta.failed_queries.filter(
    (failure) =>
      failure.category === "unsupported_query_shape" ||
      failure.category === "unavailable_metric"
  ).length;
  const issueCount = coreBlockers + optionalFailures + limitationCount;
  if (issueCount === 0 && meta.warnings.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
      <div className="space-y-1">
        <p className="font-medium">
          {coreBlockers > 0
            ? "Some core Google Ads queries are blocked. Core data may be partial until customer context or permissions are fixed."
            : "Some optional Google Ads metrics are unavailable. Core reporting can still render from successful queries."}
        </p>
        <p className="text-[11px] text-amber-800/80">
          {coreBlockers} core blockers, {optionalFailures} optional failures, {limitationCount} API limitations
        </p>
      </div>
      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-800">
        {coreBlockers} core / {optionalFailures} optional
      </span>
    </div>
  );
}

function OverviewView({
  overview,
  campaigns,
  opportunities,
  budget,
  products,
  crossEntityInsights,
}: {
  overview: QueryResult | undefined;
  campaigns: Array<Record<string, any>>;
  opportunities: Array<Record<string, any>>;
  budget: Array<Record<string, any>>;
  products: Array<Record<string, any>>;
  crossEntityInsights: Array<Record<string, any>>;
}) {
  if (!overview?.kpis) {
    return <TabEmpty message="No overview data is available for this period." />;
  }

  const kpis = overview.kpis as Record<string, number>;
  const deltas = (overview.kpiDeltas ?? {}) as Record<string, number | null | undefined>;
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
  const concentrationInsight = crossEntityInsights.find((insight) => insight.type === "spend_concentration");
  const revenueDependencyInsight = crossEntityInsights.find((insight) => insight.type === "revenue_dependency");
  const scalePathInsight = crossEntityInsights.find((insight) => insight.type === "scale_path");
  const wasteConcentrationInsight = crossEntityInsights.find((insight) => insight.type === "waste_concentration");
  const budgetPressure = budget.filter((row) => Number(row.lostIsBudget ?? 0) > 0.15).length;
  const dataHealth = opportunities.length > 0 ? "healthy" : "warning";
  const healthyBudgetPressure = budget.filter(
    (row) => Number(row.lostIsBudget ?? 0) > 0.15 && Number(row.roas ?? 0) >= Number(kpis.roas ?? 0),
  ).length;
  const weakDemandCoverage = campaigns.filter(
    (campaign) => Number(campaign.impressionShare ?? 0) > 0 && Number(campaign.impressionShare ?? 0) < 0.4,
  ).length;
  const avgConversionRate =
    campaigns.length > 0
      ? campaigns.reduce((sum, campaign) => sum + Number(campaign.conversionRate ?? 0), 0) /
        campaigns.length
      : Number(kpis.conversionRate ?? kpis.convRate ?? 0);
  const efficiencyState =
    Number(kpis.roas ?? 0) >= 3 ? "healthy" : Number(kpis.roas ?? 0) >= 2 ? "warning" : "critical";
  const wasteSpendTotal = spendWaste.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const top3ProductSpendShare =
    (Number(products.slice(0, 3).reduce((sum, row) => sum + Number(row.spend ?? 0), 0)) /
      Math.max(Number(products.reduce((sum, row) => sum + Number(row.spend ?? 0), 0)), 1)) *
    100;
  const efficiencyScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Number(kpis.roas ?? 0) * 18 +
          avgConversionRate * 800 -
          Math.min(healthyBudgetPressure * 2, 10) -
          spendWaste.length * 6,
      ),
    ),
  );
  const priorityInsights = [
    {
      title: "Budget pressure detected",
      severity: healthyBudgetPressure > 0 ? "opportunity" : budgetPressure > 0 ? "warning" : "healthy",
      explanation:
        healthyBudgetPressure > 0
          ? "Campaigns are efficient but limited by budget, so this looks like a scale constraint rather than a performance failure."
          : budgetPressure > 0
            ? "Budget loss exists, but the supporting efficiency is mixed enough that scaling should stay selective."
            : "No major budget constraint is limiting account performance right now.",
      evidence: [
        `${budgetPressure} campaigns limited by budget`,
        `${healthyBudgetPressure} efficient rows under budget pressure`,
        `ROAS ${fmtRoas(Number(kpis.roas ?? 0))}`,
      ],
      action:
        healthyBudgetPressure > 0
          ? "Increase budget or run scale tests on the efficient subset."
          : "Fix efficiency before broad budget expansion.",
    },
    {
      title: "Waste and inefficiency concentration",
      severity: spendWaste.length > 0 ? "critical" : "healthy",
      explanation:
        spendWaste.length > 0
          ? "Spend is concentrated in campaigns where value is lagging, which makes the account feel heavier than it should."
          : "No major waste pockets are dominating the account right now.",
      evidence: [
        `${spendWaste.length} waste-heavy campaigns`,
        `${fmtCurrency(wasteSpendTotal)} flagged spend`,
        `${fmtCurrency(Number(kpis.cpa ?? 0))} blended CPA`,
      ],
      action:
        spendWaste.length > 0
          ? "Trim, rebuild, or isolate weak spend before pushing more budget."
          : "Keep monitoring waste while protecting efficient campaigns.",
    },
    {
      title: "Demand coverage and scale path",
      severity: scalingHeadroom.length > 0 ? "opportunity" : weakDemandCoverage > 0 ? "warning" : "healthy",
      explanation:
        scalingHeadroom.length > 0
          ? "There are campaigns with both demand pressure and enough return to justify broader coverage."
          : weakDemandCoverage > 0
            ? "Coverage looks uneven and some demand may be leaking before it turns into efficient growth."
            : "Demand capture appears balanced for the current account state.",
      evidence: [
        `${scalingHeadroom.length} scale-ready campaigns`,
        `${weakDemandCoverage} low-impression-share campaigns`,
        `${topDrivers.length} strong campaign drivers`,
      ],
      action:
        scalingHeadroom.length > 0
          ? "Expand coverage where demand exists and efficiency stays above account average."
          : "Improve efficiency or messaging before broadening coverage.",
    },
  ] as const;
  const aiTasks = [
    healthyBudgetPressure > 0
      ? {
          title: `Increase budget for ${healthyBudgetPressure} campaign${healthyBudgetPressure === 1 ? "" : "s"}`,
          impact: "Opportunity",
          evidence: [
            `${healthyBudgetPressure} efficient rows under budget pressure`,
            `ROAS ${fmtRoas(Number(kpis.roas ?? 0))}`,
          ],
          action: "Review scale-ready campaigns and increase budget where lost impression share is tied to profitable traffic.",
          tone: "good" as const,
        }
      : null,
    spendWaste.length > 0
      ? {
          title: `Reduce waste in ${spendWaste.length} campaign${spendWaste.length === 1 ? "" : "s"}`,
          impact: "Risk",
          evidence: [
            `${fmtCurrency(wasteSpendTotal)} flagged spend`,
            `${spendWaste.length} low-return campaigns`,
          ],
          action: "Trim budget, rebuild structure, or isolate weak search demand before spending more.",
          tone: "risk" as const,
        }
      : null,
    top3ProductSpendShare >= 50
      ? {
          title: "Investigate product concentration",
          impact: "Watch",
          evidence: [
            `Top 3 products hold ${top3ProductSpendShare.toFixed(0)}% of spend`,
            `${topProducts.length} leading product drivers`,
          ],
          action: "Check whether scale depends too heavily on a narrow product set and spread support more deliberately.",
          tone: "warning" as const,
        }
      : null,
    filteredTaskFromOpportunities(opportunities[0]),
    filteredTaskFromOpportunities(opportunities[1]),
  ].filter(Boolean) as Array<{
    title: string;
    impact: string;
    evidence: string[];
    action: string;
    tone: "good" | "warning" | "risk" | "neutral";
  }>;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Section 1 — Account Health Snapshot"
        description="Quick account state cards that combine health, pressure, and action hints so performance marketers do not need to hunt for related context."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SnapshotCard
            title="Revenue"
            state={Number(deltas.revenue ?? 0) >= 0 ? "healthy" : "warning"}
            interpretation={
              Number(deltas.revenue ?? 0) >= 0
                ? "Revenue is growing versus the comparison window."
                : "Revenue is slipping and needs fast diagnosis."
            }
            metrics={[`${fmtCurrency(Number(kpis.revenue ?? 0))}`, `${formatDelta(deltas.revenue)}`]}
            actionHint="Check whether growth is coming from efficient scale or fragile spend."
          />
          <SnapshotCard
            title="Spend"
            state={Number(deltas.spend ?? 0) <= Number(deltas.revenue ?? 0) ? "healthy" : "warning"}
            interpretation={
              Number(deltas.spend ?? 0) <= Number(deltas.revenue ?? 0)
                ? "Spend is rising no faster than revenue."
                : "Spend is climbing faster than the value it produces."
            }
            metrics={[`${fmtCurrency(Number(kpis.spend ?? 0))}`, `${formatDelta(deltas.spend)}`]}
            actionHint="Use waste and efficiency signals before increasing budgets further."
          />
          <SnapshotCard
            title="ROAS"
            state={efficiencyState}
            interpretation={
              efficiencyState === "healthy"
                ? "Return is healthy enough to support selective scaling."
                : efficiencyState === "warning"
                  ? "Return is usable, but not strong enough to ignore inefficiency."
                  : "Return is weak enough that expansion should pause."
            }
            metrics={[`${fmtRoas(Number(kpis.roas ?? 0))}`, `${formatDelta(deltas.roas)}`]}
            actionHint="Judge scale decisions against ROAS and budget pressure together."
          />
          <SnapshotCard
            title="Conversion Rate"
            state={avgConversionRate >= 0.03 ? "healthy" : avgConversionRate >= 0.02 ? "warning" : "critical"}
            interpretation={
              avgConversionRate >= 0.03
                ? "Conversion efficiency is holding up."
                : avgConversionRate >= 0.02
                  ? "Conversion efficiency is softening."
                  : "Conversion efficiency is a drag on account growth."
            }
            metrics={[`${fmtPercent(avgConversionRate * 100)}`, `${fmtNumber(Number(kpis.conversions ?? 0))} conv`]}
            actionHint="Use search intent, landing quality, and product drag signals to explain weakening conversion."
          />
          <SnapshotCard
            title="Budget Pressure"
            state={healthyBudgetPressure > 0 ? "opportunity" : budgetPressure > 0 ? "warning" : "healthy"}
            interpretation={
              healthyBudgetPressure > 0
                ? "Healthy efficiency but limited by budget."
                : budgetPressure > 0
                  ? "Budget loss exists, but not all constrained campaigns are healthy enough to scale."
                  : "Budget pressure is not a major limiter right now."
            }
            metrics={[
              `Efficient budget-limited campaigns: ${healthyBudgetPressure}`,
              `Lost IS (budget) rows: ${budgetPressure}`,
            ]}
            actionHint={healthyBudgetPressure > 0 ? "Scale budget cautiously." : "Fix efficiency before adding spend."}
          />
          <SnapshotCard
            title="Demand Coverage"
            state={scalingHeadroom.length > 0 ? "opportunity" : weakDemandCoverage > 0 ? "warning" : "healthy"}
            interpretation={
              scalingHeadroom.length > 0
                ? "There is proven demand that could support broader coverage."
                : weakDemandCoverage > 0
                  ? "Coverage looks uneven and some demand may be leaking."
                  : "Demand coverage looks balanced for the current account state."
            }
            metrics={[
              `Scale-ready campaigns: ${scalingHeadroom.length}`,
              `Low impression share campaigns: ${weakDemandCoverage}`,
            ]}
            actionHint="Protect proven demand before broadening into weaker traffic."
          />
          <SnapshotCard
            title="Demand Coverage"
            state={scalingHeadroom.length > 0 ? "opportunity" : weakDemandCoverage > 0 ? "warning" : "healthy"}
            interpretation={
              scalingHeadroom.length > 0
                ? "There is proven demand that could support broader coverage."
                : weakDemandCoverage > 0
                  ? "Coverage looks uneven and some demand may be leaking."
                  : "Demand coverage looks balanced for the current account state."
            }
            metrics={[
              `Scale-ready campaigns: ${scalingHeadroom.length}`,
              `Low impression share campaigns: ${weakDemandCoverage}`,
            ]}
            actionHint="Protect proven demand before broadening into weaker traffic."
          />
          <SnapshotCard
            title="Efficiency Score"
            state={efficiencyScore >= 70 ? "healthy" : efficiencyScore >= 50 ? "warning" : "critical"}
            interpretation={
              efficiencyScore >= 70
                ? "The account is operating at a strong efficiency baseline."
                : efficiencyScore >= 50
                  ? "The account is workable but not yet clean enough to scale aggressively."
                  : "The account needs material efficiency cleanup."
            }
            metrics={[`${efficiencyScore}/100`, `${spendWaste.length} waste-heavy campaigns`]}
            actionHint="Use this as the blended read across return, conversion efficiency, and spend waste."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Section 2 — AI Tasks Today"
        description="A daily task list for the ad manager so the system turns analysis into operational next steps."
        className="scroll-mt-24"
      >
        <div id="ai-tasks-today" className="grid gap-4 xl:grid-cols-2">
          {aiTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No urgent AI tasks surfaced for the selected filters.
            </p>
          ) : (
            aiTasks.map((task) => (
              <WorkspaceTaskCard
                key={`${task.title}-${task.action}`}
                title={task.title}
                impact={task.impact}
                evidence={task.evidence}
                action={task.action}
                tone={task.tone}
              />
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Section 3 — Decision Insights"
        description="High-priority account issues are presented with explanation, evidence, and a recommended direction."
      >
        <div className="space-y-4">
          {priorityInsights.map((insight) => (
            <PriorityInsightCard
              key={insight.title}
              title={insight.title}
              severity={insight.severity}
              explanation={insight.explanation}
              evidence={[...insight.evidence]}
              action={insight.action}
            />
          ))}
          {opportunities.slice(0, 2).map((opportunity) => (
            <OpportunityCard key={String(opportunity.id)} opportunity={opportunity} />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Decision Clusters"
        description="Optimization work is grouped by category so users can understand where to focus without stitching together distant signals."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            title="Scale Opportunities"
            description="Campaigns and products where return, demand, and share mix support cautious expansion."
            className="border-emerald-200 bg-emerald-50/50"
          >
            <div className="space-y-3">
              {topDrivers.slice(0, 3).map((campaign) => (
                <DecisionClusterCard
                  key={String(campaign.id)}
                  title={String(campaign.name ?? "")}
                  stateLabel="scale"
                  tone="healthy"
                  microcopy={getCampaignDecision(campaign).microcopy}
                  evidence={getCampaignDecision(campaign).evidence}
                  action={getCampaignDecision(campaign).action}
                />
              ))}
              {topProducts.slice(0, 2).map((product) => (
                <DecisionClusterCard
                  key={String(product.itemId)}
                  title={String(product.title ?? "")}
                  stateLabel="product"
                  tone="opportunity"
                  microcopy="Revenue contribution is concentrated here, which makes this product a likely scale lever."
                  evidence={`${fmtRoas(Number(product.roas ?? 0))} ROAS · ${fmtCurrency(Number(product.revenue ?? 0))} revenue`}
                  action="Protect and expand winning support paths"
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Budget Constraints"
            description="Budget pressure is paired with efficiency so healthy pressure and unhealthy pressure are easy to separate."
            className="border-amber-200 bg-amber-50/50"
          >
            <div className="space-y-3">
              {scalingHeadroom.length === 0 ? (
                <p className="text-xs text-muted-foreground">No budget-limited winners detected in this period.</p>
              ) : (
                scalingHeadroom.map((row) => (
                  <DecisionClusterCard
                    key={String(row.id)}
                    title={String(row.name ?? "")}
                    stateLabel="budget"
                    tone={Number(row.roas ?? 0) >= Number(kpis.roas ?? 0) ? "opportunity" : "warning"}
                    microcopy={
                      Number(row.roas ?? 0) >= Number(kpis.roas ?? 0)
                        ? "Budget-limited but efficient."
                        : "Budget pressure is present, but efficiency needs more proof."
                    }
                    evidence={`${fmtRoas(Number(row.roas ?? 0))} ROAS · ${fmtPercent(Number(row.lostIsBudget ?? 0) * 100)} lost IS`}
                    action={
                      Number(row.roas ?? 0) >= Number(kpis.roas ?? 0)
                        ? "Increase budget or scale carefully"
                        : "Fix efficiency before scaling"
                    }
                  />
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Waste & Inefficiency"
            description="Where money is working against the account instead of creating scalable performance."
            className="border-rose-200 bg-rose-50/50"
          >
            <div className="space-y-3">
              {spendWaste.length === 0 ? (
                <p className="text-xs text-muted-foreground">No obvious spend waste hotspots surfaced for this period.</p>
              ) : (
                spendWaste.map((campaign) => (
                  <DecisionClusterCard
                    key={String(campaign.id)}
                    title={String(campaign.name ?? "")}
                    stateLabel="fix"
                    tone="critical"
                    microcopy={getCampaignDecision(campaign).microcopy}
                    evidence={getCampaignDecision(campaign).evidence}
                    action={getCampaignDecision(campaign).action}
                  />
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Demand / Coverage Issues"
            description="Coverage, dependency, and scale path signals are grouped so demand loss is easier to interpret."
            className="border-sky-200 bg-sky-50/50"
          >
            <div className="space-y-3">
              {[concentrationInsight, revenueDependencyInsight, scalePathInsight, wasteConcentrationInsight]
                .filter(Boolean)
                .map((insight) => (
                  <DecisionClusterCard
                    key={String(insight?.id)}
                    title={String(insight?.title ?? "Coverage signal")}
                    stateLabel="coverage"
                    tone="opportunity"
                    microcopy={String(insight?.description ?? "")}
                    evidence={String(insight?.reasoning ?? "Cross-entity relationship detected.")}
                    action="Use this signal to guide campaign and product prioritization"
                  />
                ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Product Performance"
            description="Product winners, drag, and dependency are kept together so spend and value can be judged quickly."
            className="border-slate-200 bg-slate-50/60"
          >
            <div className="space-y-3">
              <DecisionClusterCard
                title="Product dependency"
                stateLabel="watch"
                tone={top3ProductSpendShare >= 50 ? "warning" : "neutral"}
                microcopy="Revenue can still be healthy while product exposure becomes too concentrated."
                evidence={`Top 3 products hold ${top3ProductSpendShare.toFixed(0)}% of tracked product spend`}
                action="Make sure scale is not over-dependent on a narrow product set"
              />
              {topProducts.slice(0, 2).map((product) => (
                <DecisionClusterCard
                  key={String(product.itemId)}
                  title={String(product.title ?? "")}
                  stateLabel="driver"
                  tone="healthy"
                  microcopy="This product is currently doing real work for the account."
                  evidence={`${fmtRoas(Number(product.roas ?? 0))} ROAS · ${fmtCurrency(Number(product.revenue ?? 0))} revenue`}
                  action="Protect support and expand cleanly"
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Search Intent Quality"
            description="The dedicated Search Intelligence tab carries the deepest view, but the account-level pressure is surfaced here first."
            className="border-slate-200 bg-slate-50/60"
          >
            <div className="space-y-3">
              <DecisionClusterCard
                title="Intent quality signal"
                stateLabel="search"
                tone={Number(wasteSpendTotal) > 0 ? "warning" : "neutral"}
                microcopy="Search quality should be judged by waste, conversion proof, and coverage together."
                evidence={`${fmtCurrency(wasteSpendTotal)} waste-heavy spend · ${opportunities.length} account opportunities`}
                action="Use Search Intelligence to tighten negatives, add winners, and align messaging"
              />
            </div>
          </SectionCard>
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
  const budgetPressuredHealthy = rows.filter(
    (row) => Number(row.lostIsBudget ?? 0) > 0.15 && String(row.actionState ?? "") === "scale",
  ).length;
  const weakEfficiency = rows.filter(
    (row) => String(row.actionState ?? "") === "reduce",
  ).length;
  const mixedSignal = rows.filter((row) => String(row.actionState ?? "") === "test").length;

  const campaignCols: Array<ColDef<Record<string, any>>> = [
    {
      key: "entity",
      header: "Entity",
      accessor: (row) => String(row.name ?? ""),
      sticky: true,
      render: (row) => (
        <div className="min-w-[220px] max-w-[240px]">
          <p className="text-xs font-semibold">{row.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge status={String(row.status ?? "")} />
            <PerformanceLabelBadge label={String(row.performanceLabel ?? "stable")} />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {row.channel}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      accessor: (row) => String(row.actionState ?? "optimize"),
      render: (row) => (
        <ActionStateBadge state={String(row.actionState ?? "optimize")} />
      ),
    },
    {
      key: "issue",
      header: "Primary issue",
      accessor: (row) => getCampaignDecision(row).issue,
      render: (row) => (
        <div className="min-w-[200px] max-w-[240px]">
          <p className="text-xs font-semibold">{getCampaignDecision(row).issue}</p>
          <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
            {getCampaignDecision(row).microcopy}
          </p>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action bias",
      accessor: (row) => getCampaignDecision(row).action,
      render: (row) => (
        <div className="space-y-1">
          <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border/70">
            {getCampaignDecision(row).action}
          </span>
          <p className="text-[10px] text-muted-foreground">{getCampaignDecision(row).evidence}</p>
        </div>
      ),
    },
    { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
    {
      key: "conversionRate",
      header: "Conv Rate",
      accessor: (row) => Number(row.conversionRate ?? 0),
      align: "right",
      render: (row) => (row.conversionRate != null ? percentNumber(Number(row.conversionRate ?? 0)) : "—"),
    },
    { key: "cpa", header: "CPA", accessor: (row) => Number(row.cpa ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.cpa ?? 0)) },
    { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
    { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
    { key: "conversions", header: "Conv.", accessor: (row) => Number(row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.conversions ?? 0)) },
    { key: "ctr", header: "CTR", accessor: (row) => Number(row.ctr ?? 0), align: "right", render: (row) => percentNumber(Number(row.ctr ?? 0)) },
    { key: "cpc", header: "CPC", accessor: (row) => Number(row.cpc ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.cpc ?? 0)) },
    {
      key: "impressionShare",
      header: "Search IS",
      accessor: (row) => Number(row.impressionShare ?? 0),
      align: "right",
      render: (row) => (row.impressionShare != null ? fmtPercent(Number(row.impressionShare ?? 0) * 100) : "—"),
    },
    {
      key: "lostIsBudget",
      header: "Lost IS (Budget)",
      accessor: (row) => Number(row.lostIsBudget ?? 0),
      align: "right",
      render: (row) => fmtPercent(Number(row.lostIsBudget ?? 0) * 100),
    },
    {
      key: "mix",
      header: "Share Mix",
      accessor: (row) => Number(row.revenueShare ?? 0) - Number(row.spendShare ?? 0),
      render: (row) => (
        <div className="space-y-1">
          <MixCell
            spendShare={Number(row.spendShare ?? 0)}
            revenueShare={Number(row.revenueShare ?? 0)}
          />
          <p className="text-[10px] text-muted-foreground">
            {Number(row.revenueShare ?? 0) >= Number(row.spendShare ?? 0)
              ? "Revenue share supports spend"
              : "Spend share is ahead of value"}
          </p>
        </div>
      ),
    },
    {
      key: "trend",
      header: "Secondary",
      accessor: (row) => Number(row.roasChange ?? 0),
      render: (row) => (
        <div className="space-y-1">
          {renderTrendBadge(row.roasChange)}
          <p className="text-[10px] text-muted-foreground">Rev {formatDelta(row.revenueChange)}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <InsightStrip title="Scale" value={String(counts.scale)} note="High-return campaigns with headroom" tone="good" />
        <InsightStrip title="Optimize" value={String(counts.optimize)} note="Solid performers with room to tune" />
        <InsightStrip title="Test" value={String(counts.test)} note="Needs more signal or cleaner structure" />
        <InsightStrip title="Reduce" value={String(counts.reduce)} note="Spend is outrunning value" tone="bad" />
        <InsightStrip title="Healthy pressure" value={String(budgetPressuredHealthy)} note="Budget-limited but otherwise healthy" tone="good" />
        <InsightStrip title="Efficiency risk" value={String(weakEfficiency + mixedSignal)} note="Rows needing fix or tighter test logic" tone="bad" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Scale Now" description="Budget pressure is shown with healthy efficiency so you can trust the push.">
          <div className="space-y-3">
            {rows.filter((row) => row.actionState === "scale").slice(0, 4).map((row) => (
              <DecisionClusterCard
                key={String(row.id)}
                title={String(row.name ?? "")}
                stateLabel="scale"
                tone="healthy"
                microcopy={getCampaignDecision(row).microcopy}
                evidence={getCampaignDecision(row).evidence}
                action={getCampaignDecision(row).action}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Reduce Or Rebuild" description="These rows are explicitly grouped as efficiency problems, not just weak numbers.">
          <div className="space-y-3">
            {rows.filter((row) => row.actionState === "reduce").slice(0, 4).map((row) => (
              <DecisionClusterCard
                key={String(row.id)}
                title={String(row.name ?? "")}
                stateLabel="reduce"
                tone="critical"
                microcopy={getCampaignDecision(row).microcopy}
                evidence={getCampaignDecision(row).evidence}
                action={getCampaignDecision(row).action}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Watch And Test" description="Mixed-signal rows keep their nuance, but the likely reason and next move are now adjacent.">
          <div className="space-y-3">
            {rows
              .filter((row) => ["optimize", "test"].includes(String(row.actionState ?? "")))
              .slice(0, 4)
              .map((row) => (
                <DecisionClusterCard
                  key={String(row.id)}
                  title={String(row.name ?? "")}
                  stateLabel={String(row.actionState ?? "optimize")}
                  tone="warning"
                  microcopy={getCampaignDecision(row).microcopy}
                  evidence={getCampaignDecision(row).evidence}
                  action={getCampaignDecision(row).action}
                />
              ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Section 4 — Campaign Decision Table" description="Rows now read left to right as entity, state, issue, action, then supporting metrics so users can understand direction before parsing the full metric block.">
        <div className="mb-4 grid gap-2 rounded-2xl border border-border/70 bg-muted/20 p-3 md:grid-cols-5">
          <MiniStat label="Interpretation" value="Entity • State • Issue • Action" />
          <MiniStat label="Efficiency" value="ROAS • Conv Rate • CPA" />
          <MiniStat label="Revenue" value="Spend • Revenue • Conversions" />
          <MiniStat label="Demand" value="CTR • CPC • Search IS • Lost IS" />
          <MiniStat label="Secondary" value="Share mix • Trend" />
        </div>
        <SimpleTable cols={campaignCols} rows={rows} defaultSort="spend" />
      </SectionCard>
    </div>
  );
}

function SearchIntelligenceView({
  rows,
  summary,
  insights,
  crossEntityInsights,
}: {
  rows: Array<Record<string, any>>;
  summary: Record<string, any>;
  insights: Record<string, any>;
  crossEntityInsights: Array<Record<string, any>>;
}) {
  if (rows.length === 0) {
    return <TabEmpty message="No search intelligence is available for this period." />;
  }

  const clusterCols: Array<ColDef<Record<string, any>>> = [
    {
      key: "decision",
      header: "Interpretation",
      accessor: (row) => String(row.cluster ?? ""),
      sticky: true,
      render: (row) => (
        <InterpretationCell
          title={String(row.cluster ?? "")}
          state={getSearchDecision(row).state}
          issue={getSearchDecision(row).issue}
          microcopy={getSearchDecision(row).microcopy}
          evidence={`${fmtCurrency(Number(row.spend ?? 0))} spend • ${fmtRoas(Number(row.roas ?? 0))}`}
          action={getSearchDecision(row).action}
          meta={
            <>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">
                {row.intent}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {row.state}
              </span>
            </>
          }
        />
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
  const bestThemes = (insights.bestConvertingThemes ?? []) as Array<Record<string, any>>;
  const wastefulThemes = (insights.wastefulThemes ?? []) as Array<Record<string, any>>;
  const newOpportunityQueries = (insights.newOpportunityQueries ?? []) as Array<Record<string, any>>;
  const clusterProductInsights = crossEntityInsights
    .filter((insight) => insight.type === "search_cluster_product")
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Add As Exact" value={fmtNumber(Number(summary.keywordOpportunityCount ?? 0))} sublabel="Converting queries not yet keywords" />
        <MetricCard label="Recommended Negatives" value={fmtNumber(Number(summary.negativeKeywordCount ?? 0))} sublabel="Wasteful terms to block" />
        <MetricCard label="Wasteful Spend" value={fmtCurrency(Number(summary.wastefulSpend ?? 0))} sublabel="Spend tied to negative candidates" />
        <MetricCard label="Promotion Suggestions" value={fmtNumber(Number(summary.promotionSuggestionCount ?? 0))} sublabel="High-value language worth echoing in ads" />
        <MetricCard label="Emerging Themes" value={fmtNumber(Number(summary.emergingThemeCount ?? 0))} sublabel="Low-spend clusters with early conversion signal" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Best Converting Search Themes" description="Semantic clusters with the strongest early conversion and return signal.">
          <div className="space-y-3">
            {bestThemes.slice(0, 4).map((theme) => (
              <div key={String(theme.cluster)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">{theme.cluster}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtRoas(Number(theme.roas ?? 0))} ROAS · {fmtNumber(Number(theme.conversions ?? 0))} conv
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Wasteful Search Themes" description="Clusters drawing spend without enough conversion proof.">
          <div className="space-y-3">
            {wastefulThemes.slice(0, 4).map((theme) => (
              <div key={String(theme.cluster)} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-900">{theme.cluster}</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  {fmtCurrency(Number(theme.spend ?? 0))} spend · {fmtNumber(Number(theme.conversions ?? 0))} conv
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="New Opportunity Queries" description="Converting search demand that still needs better direct coverage.">
          <div className="space-y-3">
            {newOpportunityQueries.slice(0, 4).map((row: Record<string, any>) => (
              <div key={String(row.key)} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-semibold text-sky-900">{row.searchTerm}</p>
                <p className="mt-1 text-[11px] text-sky-700">
                  {fmtNumber(Number(row.conversions ?? 0))} conv · {fmtRoas(Number(row.roas ?? 0))} ROAS
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <DecisionClusterCard
          title="Search quality risk"
          stateLabel="waste"
          tone={Number(summary.wastefulSpend ?? 0) > 0 ? "critical" : "neutral"}
          microcopy="Waste and negative-keyword opportunities are grouped together so leakage is visible before you inspect individual queries."
          evidence={`${fmtCurrency(Number(summary.wastefulSpend ?? 0))} wasteful spend • ${fmtNumber(Number(summary.negativeKeywordCount ?? 0))} negative candidates`}
          action="Trim low-intent traffic"
        />
        <DecisionClusterCard
          title="Coverage opportunity"
          stateLabel="scale"
          tone={Number(summary.keywordOpportunityCount ?? 0) > 0 ? "opportunity" : "neutral"}
          microcopy="Converting search demand that is still outside direct keyword control should be promoted faster."
          evidence={`${fmtNumber(Number(summary.keywordOpportunityCount ?? 0))} exact-match adds • ${fmtNumber(Number(summary.emergingThemeCount ?? 0))} emerging themes`}
          action="Add coverage deliberately"
        />
        <DecisionClusterCard
          title="Messaging alignment"
          stateLabel="message"
          tone={Number(summary.promotionSuggestionCount ?? 0) > 0 ? "healthy" : "neutral"}
          microcopy="Winning language deserves faster reuse in ads and landing paths so demand quality is not lost between query and message."
          evidence={`${fmtNumber(Number(summary.promotionSuggestionCount ?? 0))} promotion suggestions`}
          action="Echo winning search language"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Cluster To Product Alignment" description="Best-effort mapping between search demand and likely product support.">
          <div className="space-y-3">
            {clusterProductInsights.map((insight) => (
              <div key={String(insight.id)} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-semibold text-sky-900">{insight.title}</p>
                <p className="mt-1 text-[11px] text-sky-700">{insight.reasoning}</p>
              </div>
            ))}
          </div>
        </SectionCard>

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

      <SectionCard title="Intent Clusters" description="The left side now tells you whether a cluster is a waste problem, coverage opportunity, or test candidate before the supporting metrics.">
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
              header: "Query + action",
              accessor: (row) => String(row.searchTerm ?? ""),
              sticky: true,
              render: (row) => (
                <div className="min-w-[260px] max-w-[300px]">
                  <p className="text-xs font-semibold">{row.searchTerm}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {row.campaign} · {row.matchSource}
                  </p>
                  <p className="mt-1 text-[10px] font-medium text-foreground">
                    {getSearchDecision(row).issue}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {getSearchDecision(row).action}
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

function KeywordsView({
  rows,
  summary,
  insights,
}: {
  rows: Array<Record<string, any>>;
  summary: Record<string, any>;
  insights: Record<string, any>;
}) {
  if (rows.length === 0) {
    return <TabEmpty message="No keyword management data is available for this period." />;
  }

  const qsAvailable = rows.some((row) => row.qualityScore != null);
  const scaleKeywords = (insights.scaleKeywords ?? []) as Array<Record<string, any>>;
  const weakKeywords = (insights.weakKeywords ?? []) as Array<Record<string, any>>;
  const negativeCandidates = (insights.negativeCandidates ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="High CTR, Low Conv." value={fmtNumber(Number(summary.highCtrLowConvCount ?? 0))} sublabel="Likely landing page or intent mismatch" />
        <MetricCard label="Scale Keywords" value={fmtNumber(Number(summary.scaleKeywordCount ?? 0))} sublabel="Keywords beating account-average return" />
        <MetricCard label="Weak Keywords" value={fmtNumber(Number(summary.weakKeywordCount ?? 0))} sublabel="Keywords lagging account-average return" />
        <MetricCard label="Negative Candidates" value={fmtNumber(Number(summary.negativeCandidateCount ?? 0))} sublabel="Spend without conversion proof" />
        <MetricCard label="Quality Coverage" value={qsAvailable ? "Available" : "Limited"} sublabel={qsAvailable ? "QS signals are flowing" : "Google quality fields unavailable"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Scale Keywords" description="Keywords outperforming the account average and worth broader coverage.">
          <div className="space-y-3">
            {scaleKeywords.slice(0, 4).map((row) => (
              <div key={String(row.criterionId)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">{row.keyword}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · {fmtNumber(Number(row.conversions ?? 0))} conv
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Weak Keywords" description="Keywords that need tighter intent, new landing pages, or budget restraint.">
          <div className="space-y-3">
            {weakKeywords.slice(0, 4).map((row) => (
              <div key={String(row.criterionId)} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">{row.keyword}</p>
                <p className="mt-1 text-[11px] text-amber-700">
                  {fmtCurrency(Number(row.spend ?? 0))} spend · {fmtRoas(Number(row.roas ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Negative Candidates" description="Keywords spending enough to justify exclusion or major cleanup.">
          <div className="space-y-3">
            {negativeCandidates.slice(0, 4).map((row) => (
              <div key={String(row.criterionId)} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-900">{row.keyword}</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  {fmtCurrency(Number(row.spend ?? 0))} spend · {fmtNumber(Number(row.clicks ?? 0))} clicks
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Keyword Intelligence"
        description="Keyword-level management with honest quality signals and impression-share context."
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

function AssetsView({
  rows,
  summary,
  insights,
}: {
  rows: Array<Record<string, any>>;
  summary: Record<string, any>;
  insights: Record<string, any>;
}) {
  if (rows.length === 0) {
    return <TabEmpty message="No Google asset performance data is available for this period." />;
  }

  const byType = (summary.typeBreakdown ?? []) as Array<Record<string, any>>;
  const topPerformingAssets = (insights.topPerformingAssets ?? []) as Array<Record<string, any>>;
  const weakAssets = (insights.weakAssets ?? []) as Array<Record<string, any>>;
  const spendNoConversionAssets = (insights.spendNoConversionAssets ?? []) as Array<Record<string, any>>;
  const topConvertingAssets = (insights.topConvertingAssets ?? []) as Array<Record<string, any>>;
  const assetsWastingSpend = (insights.assetsWastingSpend ?? []) as Array<Record<string, any>>;
  const assetsToExpand = (insights.assetsToExpand ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Top Performers" value={fmtNumber(Number(summary.topPerformerCount ?? summary.topPerformingCount ?? 0))} sublabel="Assets beating account-average return" />
        <MetricCard label="Stable Assets" value={fmtNumber(Number(summary.stableCount ?? 0))} sublabel="Reliable assets worth protecting" />
        <MetricCard label="Weak Assets" value={fmtNumber(Number(summary.weakCount ?? summary.underperformingCount ?? 0))} sublabel="Assets needing refresh or replacement" />
        <MetricCard label="Budget Waste" value={fmtNumber(Number(summary.budgetWasteCount ?? summary.spendNoConversionCount ?? 0))} sublabel="Spend share ahead of revenue share" />
        <MetricCard label="Asset Types" value={fmtNumber(byType.length)} sublabel="Headline, image, video, and more" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Top Converting Assets" description="Assets creating the strongest conversion value right now.">
          <div className="space-y-3">
            {(topConvertingAssets.length > 0 ? topConvertingAssets : topPerformingAssets).slice(0, 4).map((asset) => (
              <div key={String(asset.id)} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <PerfBadge label="top" />
                <p className="mt-3 text-xs font-semibold text-emerald-950">{asset.preview}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtCurrency(Number(asset.revenue ?? 0))} value · {fmtRoas(Number(asset.roas ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Assets Wasting Spend" description="Low-efficiency assets that deserve refresh, replacement, or reduced rotation.">
          <div className="space-y-3">
            {(assetsWastingSpend.length > 0 ? assetsWastingSpend : weakAssets).slice(0, 4).map((asset) => (
              <div key={String(asset.id)} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <PerfBadge label="underperforming" />
                <p className="mt-3 text-xs font-semibold text-rose-900">{asset.preview}</p>
                <p className="mt-1 text-[11px] text-rose-700">{asset.hint}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Assets To Expand" description="Creative winners that should be reused in more tests or asset groups.">
          <div className="space-y-3">
            {(assetsToExpand.length > 0 ? assetsToExpand : spendNoConversionAssets).slice(0, 4).map((asset) => (
              <div
                key={String(asset.id)}
                className={cn(
                  "rounded-2xl border p-4",
                  assetsToExpand.length > 0
                    ? "border-sky-200 bg-sky-50"
                    : "border-amber-200 bg-amber-50"
                )}
              >
                <p className={cn("text-xs font-semibold", assetsToExpand.length > 0 ? "text-sky-900" : "text-amber-900")}>{asset.preview}</p>
                <p className={cn("mt-1 text-[11px]", assetsToExpand.length > 0 ? "text-sky-700" : "text-amber-700")}>
                  {assetsToExpand.length > 0
                    ? `${fmtRoas(Number(asset.roas ?? 0))} ROAS · ${fmtNumber(Number(asset.conversions ?? 0))} conv`
                    : `${fmtCurrency(Number(asset.spend ?? 0))} spend · ${fmtNumber(Number(asset.clicks ?? asset.interactions ?? 0))} clicks/interactions`}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
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

function AssetGroupsView({
  rows,
  summary,
  insights,
  crossEntityInsights,
}: {
  rows: Array<Record<string, any>>;
  summary: Record<string, any>;
  insights: Record<string, any>;
  crossEntityInsights: Array<Record<string, any>>;
}) {
  if (rows.length === 0) {
    return <TabEmpty message="No Performance Max asset groups were found for this period." />;
  }

  const scaleCandidates = ((insights.scaleCandidates ?? []) as Array<Record<string, any>>).slice(0, 4);
  const weakGroups = ((insights.weakGroups ?? []) as Array<Record<string, any>>).slice(0, 4);
  const coverageGaps = ((insights.coverageGaps ?? []) as Array<Record<string, any>>).slice(0, 4);
  const productSupport = crossEntityInsights
    .filter((insight) => insight.type === "asset_group_product")
    .slice(0, 3);
  const themeMismatch = crossEntityInsights
    .filter((insight) => insight.type === "asset_theme_alignment")
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Scale Candidates" value={fmtNumber(Number(summary.strongCount ?? 0))} sublabel="Revenue share is outrunning spend share" />
        <MetricCard label="Healthy Groups" value={fmtNumber(Number(summary.healthyCount ?? 0))} sublabel="Solid groups worth protecting" />
        <MetricCard label="Weak Groups" value={fmtNumber(Number(summary.weakCount ?? 0))} sublabel="Budget consumers with weak return" />
        <MetricCard label="Coverage Risk" value={fmtNumber(Number(summary.coverageRiskCount ?? summary.coverageGaps ?? 0))} sublabel="Groups missing enough coverage to scale cleanly" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Dominant Products" description="Best-effort product drivers likely supporting these asset groups.">
          <div className="space-y-3">
            {productSupport.map((insight) => (
              <div key={String(insight.id)} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-semibold text-sky-900">{insight.title}</p>
                <p className="mt-1 text-[11px] text-sky-700">{insight.reasoning}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Scale Candidates" description="Strong asset groups with healthy return and coverage.">
          <div className="space-y-3">
            {scaleCandidates.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">{row.name}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · revenue share {row.revenueShare}% vs spend share {row.spendShare}%
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Weak Groups" description="Groups that need efficiency fixes or budget reduction.">
          <div className="space-y-3">
            {weakGroups.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-xs font-semibold text-rose-900">{row.name}</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  {fmtCurrency(Number(row.spend ?? 0))} spend · {fmtRoas(Number(row.roas ?? 0))}
                </p>
                <p className="mt-2 text-xs text-rose-800">{row.recommendation}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Coverage Gaps" description="Groups missing enough variety or theme coverage to support scale.">
          <div className="space-y-3">
            {coverageGaps.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-900">{row.name}</p>
                <p className="mt-1 text-[11px] text-amber-700">
                  Coverage {row.coverageScore}% · {row.searchThemeAlignedCount}/{row.searchThemeCount} themes aligned
                </p>
                <p className="mt-2 text-xs text-amber-800">
                  Missing: {Array.isArray(row.missingAssetFields) && row.missingAssetFields.length > 0 ? row.missingAssetFields.join(", ") : "No required types missing"}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {themeMismatch.length > 0 ? (
        <SectionCard title="Theme Mismatch" description="Configured themes that lack enough support in current asset messaging.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {themeMismatch.map((insight) => (
              <div key={String(insight.id)} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900">{insight.title}</p>
                <p className="mt-1 text-[11px] text-amber-700">{insight.reasoning}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

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
                    {row.campaign} · {row.searchThemeCount} search themes · {row.classification.replaceAll("_", " ")}
                  </p>
                  {row.searchThemeSummary ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">{row.searchThemeSummary}</p>
                  ) : null}
                  {Number(row.messagingMismatchCount ?? 0) > 0 ? (
                    <p className="mt-1 text-[10px] text-amber-700">
                      Messaging mismatch on {row.messagingMismatchCount} theme{row.messagingMismatchCount === 1 ? "" : "s"}
                    </p>
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

function ProductsView({
  rows,
  summary,
  insights,
  crossEntityInsights,
}: {
  rows: Array<Record<string, any>>;
  summary: Record<string, any>;
  insights: Record<string, any>;
  crossEntityInsights: Array<Record<string, any>>;
}) {
  if (rows.length === 0) {
    return <TabEmpty message="No product-level Google Ads data is available for this period." />;
  }

  const productSupportInsights = crossEntityInsights
    .filter((insight) => insight.type === "product_support")
    .slice(0, 4);
  const hiddenWinners = ((insights.hiddenWinners ?? []) as Array<Record<string, any>>).slice(0, 4);
  const spendWithoutReturn = ((insights.spendWithoutReturn ?? insights.lowReturnProducts ?? []) as Array<Record<string, any>>).slice(0, 4);
  const topRevenueProducts = ((insights.topRevenueProducts ?? []) as Array<Record<string, any>>).slice(0, 4);
  const scaleCandidates = ((insights.scaleCandidates ?? []) as Array<Record<string, any>>).slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Spend" value={fmtCurrency(Number(summary.totalSpend ?? 0))} sublabel="Tracked product-level spend" />
        <MetricCard label="Revenue" value={fmtCurrency(Number(summary.totalRevenue ?? 0))} sublabel="Tracked conversion value" tone="highlight" />
        <MetricCard label="Scale Candidates" value={fmtNumber(Number(summary.scaleCandidates ?? 0))} sublabel="Products with strong return" />
        <MetricCard label="Hidden Winners" value={fmtNumber(Number(summary.hiddenWinnerCount ?? 0))} sublabel="High-return products with low current exposure" />
        <MetricCard label="Top 3 Concentration" value={`${Number(summary.spendConcentrationTop3 ?? 0) * 100}%`} sublabel="Dependency risk across leading products" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <DecisionClusterCard
          title="Scale candidates"
          stateLabel="scale"
          tone={scaleCandidates.length > 0 ? "healthy" : "neutral"}
          microcopy="These products are earning the right to more demand because return is keeping up with or outrunning exposure."
          evidence={`${scaleCandidates.length} products flagged for scale`}
          action="Protect and expand winning product paths"
        />
        <DecisionClusterCard
          title="Product drag"
          stateLabel="reduce"
          tone={spendWithoutReturn.length > 0 ? "critical" : "neutral"}
          microcopy="These products are consuming spend without enough downstream value, which can hide healthier scale paths."
          evidence={`${spendWithoutReturn.length} low-return products needing review`}
          action="Trim or fix weak support paths"
        />
        <DecisionClusterCard
          title="Hidden winners"
          stateLabel="opportunity"
          tone={hiddenWinners.length > 0 ? "opportunity" : "neutral"}
          microcopy="Some products are efficient but still underexposed, which means budget trust is lagging behind performance proof."
          evidence={`${hiddenWinners.length} products with strong return but low spend share`}
          action="Increase exposure carefully"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Likely Support Paths" description="Which campaigns and asset groups appear to be carrying these products.">
          <div className="space-y-3">
            {productSupportInsights.map((insight) => (
              <div key={String(insight.id)} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-semibold text-sky-900">{insight.title}</p>
                <p className="mt-1 text-[11px] text-sky-700">{insight.reasoning}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Top Revenue Products" description="Products creating the most value from paid demand.">
          <div className="space-y-3">
            {topRevenueProducts.map((row: Record<string, any>) => (
              <div key={String(row.itemId)} className="rounded-xl border p-3">
                <p className="text-xs font-semibold">{row.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmtCurrency(Number(row.revenue ?? 0))} revenue · {fmtRoas(Number(row.roas ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Spend Without Return" description="Products spending enough to justify review or budget cuts.">
          <div className="space-y-3">
            {spendWithoutReturn.map((row: Record<string, any>) => (
              <div key={String(row.itemId)} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-900">{row.title}</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  {fmtCurrency(Number(row.spend ?? 0))} spend · {fmtRoas(Number(row.roas ?? 0))}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Scale Candidates" description="Products with strong return and room for more demand.">
          <div className="space-y-3">
            {scaleCandidates.map((row: Record<string, any>) => (
              <div key={String(row.itemId)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">{row.title}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · {fmtCurrency(Number(row.revenue ?? 0))} revenue
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Hidden Winners" description="High-ROAS products that still hold a small share of spend.">
          <div className="space-y-3">
            {hiddenWinners.map((row: Record<string, any>) => (
              <div key={String(row.itemId)} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-semibold text-sky-900">{row.title}</p>
                <p className="mt-1 text-[11px] text-sky-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · {Number(row.spendShare ?? 0).toFixed(1)}% spend share
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Product Intelligence" description="Rows now lead with product state, why it matters, and the action bias before the economics table.">
        <SimpleTable
          cols={[
            {
              key: "decision",
              header: "Interpretation",
              accessor: (row) => String(row.title ?? ""),
              sticky: true,
              render: (row) => (
                <InterpretationCell
                  title={String(row.title ?? "")}
                  state={String(row.statusLabel ?? "optimize")}
                  issue={getProductDecision(row).issue}
                  microcopy={getProductDecision(row).microcopy}
                  evidence={getProductDecision(row).evidence}
                  action={getProductDecision(row).action}
                  meta={
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {row.productId ?? row.itemId} • {fmtNumber(Number(row.orders ?? row.conversions ?? 0))} orders
                    </span>
                  }
                />
              ),
            },
            {
              key: "shareMix",
              header: "Exposure vs value",
              accessor: (row) => Number(row.revenueShare ?? 0) - Number(row.spendShare ?? 0),
              render: (row) => (
                <div className="space-y-1">
                  <p className="text-xs font-semibold">
                    {Number(row.spendShare ?? 0).toFixed(1)}% spend • {Number(row.revenueShare ?? 0).toFixed(1)}% revenue
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {Number(row.revenueShare ?? 0) >= Number(row.spendShare ?? 0)
                      ? "Value share is keeping up"
                      : "Exposure is ahead of value"}
                  </p>
                </div>
              ),
            },
            { key: "spend", header: "Spend", accessor: (row) => Number(row.spend ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.spend ?? 0)) },
            { key: "revenue", header: "Revenue", accessor: (row) => Number(row.revenue ?? 0), align: "right", render: (row) => fmtCurrency(Number(row.revenue ?? 0)) },
            { key: "roas", header: "ROAS", accessor: (row) => Number(row.roas ?? 0), align: "right", render: (row) => fmtRoas(Number(row.roas ?? 0)) },
            { key: "orders", header: "Orders", accessor: (row) => Number(row.orders ?? row.conversions ?? 0), align: "right", render: (row) => fmtNumber(Number(row.orders ?? row.conversions ?? 0)) },
            { key: "cpa", header: "CPA", accessor: (row) => Number(row.cpa ?? 0), align: "right", render: (row) => (Number(row.orders ?? row.conversions ?? 0) > 0 ? fmtCurrency(Number(row.cpa ?? 0)) : "—") },
            {
              key: "contributionProxy",
              header: "Contribution Proxy (Not Profit)",
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
  budgetInsights,
  products,
}: {
  budgetRows: Array<Record<string, any>>;
  budgetSummary: Record<string, any>;
  budgetInsights: Record<string, any>;
  products: Array<Record<string, any>>;
}) {
  if (budgetRows.length === 0) {
    return <TabEmpty message="No budget and scaling data is available for this period." />;
  }

  const scaleCampaigns = ((budgetInsights.scaleBudgetCandidates ?? []) as Array<Record<string, any>>).slice(0, 4);
  const reduceCampaigns = ((budgetInsights.budgetWasteCampaigns ?? []) as Array<Record<string, any>>).slice(0, 4);
  const balancedCampaigns = ((budgetInsights.balancedCampaigns ?? []) as Array<Record<string, any>>).slice(0, 4);
  const scaleProducts = products.filter((row) => row.statusLabel === "scale").slice(0, 3);
  const reduceProducts = products.filter((row) => row.statusLabel === "reduce").slice(0, 3);
  const totalSpend = Number(budgetSummary.totalSpend ?? 0);
  const budgetLimitedHealthy = budgetRows.filter(
    (row) => Number(row.lostIsBudget ?? 0) > 0.15 && Number(row.roas ?? 0) >= Number(budgetSummary.accountAvgRoas ?? 0),
  ).length;
  const budgetRiskRows = budgetRows.filter(
    (row) => Number(row.lostIsBudget ?? 0) > 0.15 && Number(row.roas ?? 0) < Number(budgetSummary.accountAvgRoas ?? 0),
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Spend" value={fmtCurrency(totalSpend)} sublabel="Campaign-level budget analysis" />
        <MetricCard label="Avg ROAS" value={fmtRoas(Number(budgetSummary.accountAvgRoas ?? 0))} sublabel="Blended campaign efficiency" tone="highlight" />
        <MetricCard label="Scale Now" value={fmtNumber(Number(budgetSummary.scaleCampaignCount ?? scaleCampaigns.length) + scaleProducts.length)} sublabel="Campaigns and products with headroom" />
        <MetricCard label="Reduce Now" value={fmtNumber(Number(budgetSummary.budgetSinkCount ?? reduceCampaigns.length) + reduceProducts.length)} sublabel="Inefficient budget concentration" />
        <MetricCard label="Balanced" value={fmtNumber(Number(budgetSummary.stableCampaignCount ?? balancedCampaigns.length))} sublabel="Campaigns holding an efficient share mix" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <DecisionClusterCard
          title="Healthy budget pressure"
          stateLabel="scale"
          tone={budgetLimitedHealthy > 0 ? "healthy" : "neutral"}
          microcopy="These campaigns are limited by budget, but efficiency is still strong enough that pressure is a good sign, not a warning sign."
          evidence={`${budgetLimitedHealthy} campaigns budget-limited above account-average ROAS`}
          action="Lean into scale tests"
        />
        <DecisionClusterCard
          title="Budget pressure with weak efficiency"
          stateLabel="fix"
          tone={budgetRiskRows > 0 ? "critical" : "neutral"}
          microcopy="Not all pressure is healthy. Some campaigns are losing share while also failing to earn incremental budget trust."
          evidence={`${budgetRiskRows} campaigns constrained below average efficiency`}
          action="Fix return before adding spend"
        />
        <DecisionClusterCard
          title="Budget concentration"
          stateLabel="watch"
          tone={totalSpend > 0 ? "warning" : "neutral"}
          microcopy="Budget pooling matters most when it concentrates in weak return pockets or starves emerging winners."
          evidence={`${fmtCurrency(totalSpend)} tracked spend across ${budgetRows.length} campaigns`}
          action="Rebalance toward proven drivers"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Scale Budget Candidates" description="Efficiency-backed scale opportunities across campaigns and products.">
          <div className="space-y-3">
            {scaleCampaigns.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900">{row.name}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · revenue share {Number(row.revenueShare ?? 0).toFixed(1)}% vs spend share {Number(row.spendShare ?? 0).toFixed(1)}%
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

        <SectionCard title="Budget Waste Campaigns" description="Spend concentration that is not earning enough return.">
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

        <SectionCard title="Balanced Campaigns" description="Campaigns holding a healthier spend-to-revenue mix.">
          <div className="space-y-3">
            {balancedCampaigns.map((row) => (
              <div key={String(row.id)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-900">{row.name}</p>
                <p className="mt-1 text-[11px] text-slate-700">
                  {fmtRoas(Number(row.roas ?? 0))} ROAS · spend share {Number(row.spendShare ?? 0).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Spend Concentration" description="Budget share now sits beside efficiency context so pressure can be read as healthy, risky, or balanced without hunting elsewhere.">
        <div className="space-y-4">
          {budgetRows.slice(0, 8).map((row) => {
            const share = totalSpend > 0 ? (Number(row.spend ?? 0) / totalSpend) * 100 : 0;
            const healthyPressure =
              Number(row.lostIsBudget ?? 0) > 0.15 &&
              Number(row.roas ?? 0) >= Number(budgetSummary.accountAvgRoas ?? 0);
            return (
              <div key={String(row.id)} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-semibold">{row.name}</span>
                      <span className="text-muted-foreground">{share.toFixed(1)}%</span>
                    </div>
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      {healthyPressure
                        ? "Healthy efficiency, but budget constrained."
                        : Number(row.roas ?? 0) >= Number(budgetSummary.accountAvgRoas ?? 0)
                          ? "Balanced efficiency with moderate scale room."
                          : "Budget is concentrated where efficiency is weaker."}
                    </p>
                    <SpendBar value={Number(row.spend ?? 0)} max={totalSpend} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 lg:w-[360px]">
                    <MiniStat label="Spend" value={fmtCurrency(Number(row.spend ?? 0))} />
                    <MiniStat label="ROAS" value={fmtRoas(Number(row.roas ?? 0))} />
                    <MiniStat label="Budget loss" value={fmtPercent(Number(row.lostIsBudget ?? 0) * 100)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function OpportunitiesView({
  rows,
  summary,
}: {
  rows: Array<Record<string, any>>;
  summary: Record<string, any>;
}) {
  if (rows.length === 0) {
    return <TabEmpty message="No opportunities are available for this period." />;
  }

  const grouped = {
    scale: rows.filter((row) => row.type === "scale"),
    reduce: rows.filter((row) => row.type === "reduce"),
    fix: rows.filter((row) => row.type === "fix"),
    test: rows.filter((row) => row.type === "test"),
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Scale" value={fmtNumber(Number(summary.scale ?? grouped.scale.length))} sublabel="Growth opportunities" />
        <MetricCard label="Reduce" value={fmtNumber(Number(summary.reduce ?? grouped.reduce.length))} sublabel="Budget waste to trim" />
        <MetricCard label="Fix" value={fmtNumber(Number(summary.fix ?? grouped.fix.length))} sublabel="Structural issues to repair" />
        <MetricCard label="Test" value={fmtNumber(Number(summary.test ?? grouped.test.length))} sublabel="Experiments worth running" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Scale" description="Where the account can lean in with confidence.">
          <div className="space-y-4">
            {grouped.scale.map((row) => (
              <OpportunityCard key={String(row.id)} opportunity={row} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Reduce" description="Where spend is outrunning value.">
          <div className="space-y-4">
            {grouped.reduce.map((row) => (
              <OpportunityCard key={String(row.id)} opportunity={row} />
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Fix" description="Structural improvements to unlock better performance.">
          <div className="space-y-4">
            {grouped.fix.map((row) => (
              <OpportunityCard key={String(row.id)} opportunity={row} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Test" description="Controlled experiments worth prioritizing next.">
          <div className="space-y-4">
            {grouped.test.map((row) => (
              <OpportunityCard key={String(row.id)} opportunity={row} />
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Ranked Opportunities" description="All decisions ranked by expected impact and confidence.">
        <div className="space-y-4">
          {rows.slice(0, 12).map((row) => (
            <OpportunityCard key={String(row.id)} opportunity={row} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function DiagnosticsView({
  diagnostics,
  meta,
}: {
  diagnostics: QueryResult | undefined;
  meta: ReturnType<typeof combineMetas>;
}) {
  const rows = firstRows(diagnostics);
  if (rows.length === 0) {
    return <TabEmpty message="No diagnostics are available yet." />;
  }

  const summary = (diagnostics?.summary ?? {}) as Record<string, any>;
  const insights = (diagnostics?.insights ?? {}) as Record<string, any>;
  const groupedIssues = (insights.groupedIssues ?? {}) as Record<string, Array<Record<string, any>>>;
  const issueInventory = (insights.issueInventory ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-6">
      <SectionCard title="Diagnostic Summary" description="Centralized view of query failures, partial data, and unavailable advanced metrics.">
        <div className="grid gap-3 md:grid-cols-4">
          <InsightStrip title="Core Blockers" value={fmtNumber(Number(summary.coreBlockers ?? 0))} note="Queries that can block overview/account health." tone={Number(summary.coreBlockers ?? 0) > 0 ? "bad" : "neutral"} />
          <InsightStrip title="Optional Failures" value={fmtNumber(Number(summary.optionalFailures ?? 0))} note="Advanced modules that failed without blocking core data." tone={Number(summary.optionalFailures ?? 0) > 0 ? "bad" : "neutral"} />
          <InsightStrip title="API Limitations" value={fmtNumber(Number(summary.apiLimitations ?? 0))} note="Unsupported fields or unavailable metrics." tone={Number(summary.apiLimitations ?? 0) > 0 ? "bad" : "neutral"} />
          <InsightStrip title="Warnings" value={fmtNumber(meta.warnings.length)} note="Partial-data notices after fail-soft handling." tone={meta.warnings.length > 0 ? "bad" : "neutral"} />
        </div>
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Loaded Sections" value={fmtNumber(Number(summary.loadedSections ?? 0))} sublabel="Tabs included in the health scan" />
        <MetricCard label="Healthy Sections" value={fmtNumber(Number(summary.healthySections ?? 0))} sublabel="No warnings or failures" />
        <MetricCard label="Warnings" value={fmtNumber(Number(summary.totalWarnings ?? 0))} sublabel="Partial-data or limitation notices" />
        <MetricCard label="Query Failures" value={fmtNumber(Number(summary.totalFailures ?? 0))} sublabel={summary.generatedAt ? `Generated ${new Date(String(summary.generatedAt)).toLocaleString()}` : "Latest scan"} />
      </div>

      <SectionCard title="Issue Groups" description="Failures are grouped so core blockers are separated from optional advanced-query problems.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Core Blockers" value={fmtNumber((groupedIssues.coreBlockers ?? []).length)} sublabel="Customer summary or core campaign queries" />
          <MetricCard label="Optional Failures" value={fmtNumber((groupedIssues.optionalFailures ?? []).length)} sublabel="Assets, products, enrichment, and similar modules" />
          <MetricCard label="Permission / Context" value={fmtNumber((groupedIssues.permissionContext ?? []).length)} sublabel="Auth, manager header, or customer-access issues" />
          <MetricCard label="API Limitations" value={fmtNumber((groupedIssues.apiLimitations ?? []).length)} sublabel="Unsupported field/resource combinations" />
        </div>
      </SectionCard>

      <SectionCard title="Failure Inventory" description="Exact query failures with severity and category for debugging.">
        <div className="space-y-3">
          {issueInventory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No query failures captured.</p>
          ) : (
            issueInventory.map((issue, index) => (
              <div key={`${issue.query}-${issue.customerId}-${index}`} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{String(issue.query)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {String(issue.severity ?? "optional")}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {String(issue.category ?? "unknown")}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  customer {String(issue.customerId ?? "—")} · login {String(issue.loginCustomerId ?? "—")} · status {String(issue.status ?? "—")} · api {String(issue.apiStatus ?? "—")} · code {String(issue.apiErrorCode ?? "—")}
                </p>
                <p className="mt-2 text-sm">{String(issue.message ?? "Unknown query failure")}</p>
              </div>
            ))
          )}
        </div>
      </SectionCard>

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
  const defaultPrimaryWindow = getDateWindow("30");
  const defaultCompareWindow = getPreviousWindow(
    defaultPrimaryWindow.startDate,
    defaultPrimaryWindow.endDate
  );
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [dateRange, setDateRange] = useState<DateRange>("30");
  const [customStart, setCustomStart] = useState(defaultPrimaryWindow.startDate);
  const [customEnd, setCustomEnd] = useState(defaultPrimaryWindow.endDate);
  const [compareMode, setCompareMode] = useState<CompareMode>("previous_period");
  const [compareStart, setCompareStart] = useState(defaultCompareWindow.startDate);
  const [compareEnd, setCompareEnd] = useState(defaultCompareWindow.endDate);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customCompareOpen, setCustomCompareOpen] = useState(false);
  const [customCompareDraft, setCustomCompareDraft] = useState({
    start: defaultCompareWindow.startDate,
    end: defaultCompareWindow.endDate,
  });
  const [campaignTypeFilter, setCampaignTypeFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");

  const applyDateRange = (nextRange: DateRange) => {
    setDateRange(nextRange);
    if (nextRange === "custom" && (!customStart || !customEnd)) {
      setCustomStart(defaultPrimaryWindow.startDate);
      setCustomEnd(defaultPrimaryWindow.endDate);
    }
  };

  const applyCompareMode = (nextMode: CompareMode) => {
    setCompareMode(nextMode);
    if (nextMode === "custom" && (!compareStart || !compareEnd)) {
      const currentWindow = getDateWindow(dateRange, customStart, customEnd);
      const fallbackWindow = getPreviousWindow(currentWindow.startDate, currentWindow.endDate);
      setCompareStart(fallbackWindow.startDate);
      setCompareEnd(fallbackWindow.endDate);
    }
  };

  const resetControls = () => {
    setDateRange("30");
    setCustomStart(defaultPrimaryWindow.startDate);
    setCustomEnd(defaultPrimaryWindow.endDate);
    setCompareMode("previous_period");
    setCompareStart(defaultCompareWindow.startDate);
    setCompareEnd(defaultCompareWindow.endDate);
    setCampaignTypeFilter("all");
    setAccountFilter("all");
  };

  const rangeParams =
    dateRange === "custom"
      ? {
          customStart,
          customEnd,
        }
      : {};
  const comparisonParams =
    compareMode === "custom"
      ? {
          compareMode,
          compareStart,
          compareEnd,
        }
      : {
          compareMode,
        };
  const customCompareLabel = `${formatCompactDate(compareStart)} — ${formatCompactDate(compareEnd)}`;

  const overviewQ = useQuery({
    queryKey: [
      "google-ads-overview",
      businessId,
      dateRange,
      customStart,
      customEnd,
      compareMode,
      compareStart,
      compareEnd,
    ],
    queryFn: () => fetchReport("overview", businessId, dateRange, { ...rangeParams, ...comparisonParams }),
    enabled: Boolean(businessId) && activeTab === "overview",
    staleTime: 60_000,
  });

  const campaignsQ = useQuery({
    queryKey: [
      "google-ads-campaigns",
      businessId,
      dateRange,
      customStart,
      customEnd,
      compareMode,
      compareStart,
      compareEnd,
    ],
    queryFn: () => fetchReport("campaigns", businessId, dateRange, { ...rangeParams, ...comparisonParams }),
    enabled:
      Boolean(businessId) &&
      ["overview", "campaigns", "budget-scaling"].includes(activeTab),
    staleTime: 60_000,
  });

  const searchIntelligenceQ = useQuery({
    queryKey: ["google-ads-search-intelligence", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("search-intelligence", businessId, dateRange, rangeParams),
    enabled: Boolean(businessId) && activeTab === "search-intelligence",
    staleTime: 60_000,
  });

  const keywordsQ = useQuery({
    queryKey: ["google-ads-keywords", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("keywords", businessId, dateRange, rangeParams),
    enabled: Boolean(businessId) && activeTab === "keywords",
    staleTime: 60_000,
  });

  const assetsQ = useQuery({
    queryKey: ["google-ads-assets", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("assets", businessId, dateRange, rangeParams),
    enabled: Boolean(businessId) && ["assets", "opportunities"].includes(activeTab),
    staleTime: 60_000,
  });

  const assetGroupsQ = useQuery({
    queryKey: ["google-ads-asset-groups", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("asset-groups", businessId, dateRange, rangeParams),
    enabled:
      Boolean(businessId) &&
      ["asset-groups", "opportunities"].includes(activeTab),
    staleTime: 60_000,
  });

  const productsQ = useQuery({
    queryKey: ["google-ads-products", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("products", businessId, dateRange, rangeParams),
    enabled:
      Boolean(businessId) &&
      ["overview", "products", "budget-scaling", "opportunities"].includes(activeTab),
    staleTime: 60_000,
  });

  const audiencesQ = useQuery({
    queryKey: ["google-ads-audiences", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("audiences", businessId, dateRange, rangeParams),
    enabled: Boolean(businessId) && activeTab === "audiences",
    staleTime: 60_000,
  });

  const geoQ = useQuery({
    queryKey: ["google-ads-geo", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("geo", businessId, dateRange, rangeParams),
    enabled: Boolean(businessId) && activeTab === "geo-devices",
    staleTime: 60_000,
  });

  const devicesQ = useQuery({
    queryKey: ["google-ads-devices", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("devices", businessId, dateRange, rangeParams),
    enabled: Boolean(businessId) && activeTab === "geo-devices",
    staleTime: 60_000,
  });

  const budgetQ = useQuery({
    queryKey: ["google-ads-budget", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("budget", businessId, dateRange, rangeParams),
    enabled:
      Boolean(businessId) &&
      ["overview", "budget-scaling"].includes(activeTab),
    staleTime: 60_000,
  });

  const opportunitiesQ = useQuery({
    queryKey: ["google-ads-opportunities", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("opportunities", businessId, dateRange, rangeParams),
    enabled:
      Boolean(businessId) &&
      ["overview", "opportunities"].includes(activeTab),
    staleTime: 60_000,
  });

  const diagnosticsQ = useQuery({
    queryKey: ["google-ads-diagnostics", businessId, dateRange, customStart, customEnd],
    queryFn: () => fetchReport("diagnostics", businessId, dateRange, rangeParams),
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
  const accountOptions = Array.from(
    new Set(campaigns.map((row) => getRowAccountLabel(row)).filter((value) => value && value !== "All accounts")),
  ).sort((a, b) => a.localeCompare(b));
  const campaignTypeOptions = Array.from(
    new Set(campaigns.map((row) => getRowCampaignType(row)).filter((value) => value && value !== "All campaign types")),
  ).sort((a, b) => a.localeCompare(b));

  const matchesWorkspaceFilters = (row: Record<string, any>) => {
    const matchesAccount =
      accountFilter === "all" || getRowAccountLabel(row) === accountFilter;
    const matchesType =
      campaignTypeFilter === "all" || getRowCampaignType(row) === campaignTypeFilter;
    return matchesAccount && matchesType;
  };

  const filteredCampaigns = campaigns.filter(matchesWorkspaceFilters);
  const filteredSearchRows = searchRows.filter(matchesWorkspaceFilters);
  const filteredKeywordRows = keywordRows.filter(matchesWorkspaceFilters);
  const filteredAssetRows = assetRows.filter(matchesWorkspaceFilters);
  const filteredAssetGroupRows = assetGroupRows.filter(matchesWorkspaceFilters);
  const filteredProductRows = productRows.filter(matchesWorkspaceFilters);
  const filteredAudienceRows = audienceRows.filter(matchesWorkspaceFilters);
  const filteredGeoRows = geoRows.filter(matchesWorkspaceFilters);
  const filteredDeviceRows = deviceRows.filter(matchesWorkspaceFilters);
  const filteredBudgetRows = budgetRows.filter(matchesWorkspaceFilters);
  const filteredOpportunityRows = opportunityRows.filter((row) => {
    if (accountFilter === "all" && campaignTypeFilter === "all") return true;
    const haystack = JSON.stringify(row).toLowerCase();
    const accountOk =
      accountFilter === "all" || haystack.includes(accountFilter.toLowerCase());
    const typeOk =
      campaignTypeFilter === "all" || haystack.includes(campaignTypeFilter.toLowerCase());
    return accountOk && typeOk;
  });
  const crossEntity = buildCrossEntityIntelligence({
    campaigns: filteredCampaigns,
    products: filteredProductRows,
    assets: filteredAssetRows,
    assetGroups: filteredAssetGroupRows,
    searchTerms: filteredSearchRows,
  });

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

  const activeTabGuide: Record<TabId, { title: string; body: string }> = {
    overview: {
      title: "Start with the account decision clusters",
      body: "Scan budget pressure, waste, scale paths, and concentration together before diving into the supporting tables below.",
    },
    campaigns: {
      title: "Read state before metrics",
      body: "Each campaign now leads with issue, action bias, and evidence so you can judge health before parsing the full metric block.",
    },
    "search-intelligence": {
      title: "Intent quality first",
      body: "Search term rows now pair intent classification with the likely action so waste, coverage gaps, and winning demand are easier to separate.",
    },
    keywords: {
      title: "Keyword management stays deep",
      body: "The emphasis remains on quality, return, and control, but the surrounding summaries help explain where to scale, fix, or suppress.",
    },
    assets: {
      title: "Creative issues sit next to action",
      body: "Weak asset support and expansion paths are grouped more tightly so message problems are easier to act on.",
    },
    "asset-groups": {
      title: "Coverage and performance stay connected",
      body: "Theme mismatch, coverage gaps, and scale readiness are clustered so PMax interpretation takes fewer jumps.",
    },
    products: {
      title: "Product contribution is easier to judge",
      body: "Products now surface state, support, and exposure context before the raw economics, which reduces row-by-row decoding.",
    },
    audiences: {
      title: "Audience nuance is preserved",
      body: "The view keeps depth while prioritizing which segments deserve protection, caution, or expansion.",
    },
    "geo-devices": {
      title: "Geo and device read as levers",
      body: "Top and weak regions remain available, but the interpretation path is cleaner for quick adjustment decisions.",
    },
    "budget-scaling": {
      title: "Budget pressure is now read with efficiency",
      body: "Scale candidates, waste sinks, and balanced campaigns are grouped so you can tell whether pressure is healthy or dangerous at a glance.",
    },
    opportunities: {
      title: "Opportunity triage stays actionable",
      body: "The recommendation set is still deep, but grouped to highlight what matters first and why.",
    },
    diagnostics: {
      title: "Trust and limitations stay explicit",
      body: "Diagnostics still surface partial data and query issues, but the hierarchy is calmer and easier to scan.",
    },
  };

  const handleExport = () => {
    const payload =
      activeTab === "overview"
        ? {
            campaigns: filteredCampaigns,
            budget: filteredBudgetRows,
            products: filteredProductRows,
            opportunities: filteredOpportunityRows,
          }
        : activeTab === "campaigns"
          ? filteredCampaigns
          : activeTab === "search-intelligence"
            ? filteredSearchRows
            : activeTab === "keywords"
              ? filteredKeywordRows
              : activeTab === "assets"
                ? filteredAssetRows
                : activeTab === "asset-groups"
                  ? filteredAssetGroupRows
                  : activeTab === "products"
                    ? filteredProductRows
                    : activeTab === "audiences"
                      ? filteredAudienceRows
                      : activeTab === "geo-devices"
                        ? { geo: filteredGeoRows, devices: filteredDeviceRows }
                        : activeTab === "budget-scaling"
                          ? filteredBudgetRows
                          : activeTab === "opportunities"
                            ? filteredOpportunityRows
                            : diagnosticsQ.data ?? {};

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `google-ads-${activeTab}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="sticky top-0 z-20 rounded-2xl border border-border/70 bg-card/95 px-3 py-3 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Command Bar
              </p>
              <h1 className="text-base font-semibold tracking-tight">
                Google Ads Management Workspace
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Date range</span>
              </div>

              <DateRangeToolbarPopover
                open={customRangeOpen}
                onOpenChange={setCustomRangeOpen}
                currentDateRange={dateRange}
                customStart={customStart}
                customEnd={customEnd}
                onApply={({ preset, start, end }) => {
                  if (preset === "today" || preset === "yesterday" || preset === "custom") {
                    setDateRange("custom");
                    setCustomStart(start);
                    setCustomEnd(end);
                    return;
                  }
                  setDateRange(preset as DateRange);
                }}
              />

              <select
                value={compareMode}
                onChange={(event) => applyCompareMode(event.target.value as CompareMode)}
                className="h-8 min-w-[176px] rounded-full border bg-background px-3 text-xs font-medium"
              >
                {COMPARE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={campaignTypeFilter}
                onChange={(event) => setCampaignTypeFilter(event.target.value)}
                className="h-8 min-w-[168px] rounded-full border bg-background px-3 text-xs font-medium"
              >
                <option value="all">All campaign types</option>
                {campaignTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={accountFilter}
                onChange={(event) => setAccountFilter(event.target.value)}
                className="h-8 min-w-[168px] rounded-full border bg-background px-3 text-xs font-medium"
              >
                <option value="all">All accounts</option>
                {accountOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

            {compareMode === "custom" ? (
              <Popover.Root
                open={customCompareOpen}
                onOpenChange={(open) => {
                  setCustomCompareOpen(open);
                  if (open) {
                    setCustomCompareDraft({ start: compareStart, end: compareEnd });
                  }
                }}
              >
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-full border bg-background px-2.5 text-[11px] font-semibold text-foreground"
                  >
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{customCompareLabel}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    sideOffset={6}
                    align="start"
                    className="z-50 w-[320px] rounded-xl border bg-popover p-3 shadow-xl"
                  >
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold">Custom comparison</p>
                        <p className="text-[11px] text-muted-foreground">Set the comparison window.</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Start</span>
                          <input
                            type="date"
                            value={customCompareDraft.start}
                            max={customCompareDraft.end}
                            onChange={(event) =>
                              setCustomCompareDraft((prev) => ({ ...prev, start: event.target.value }))
                            }
                            className="h-9 w-full rounded-lg border bg-background px-3 text-xs"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">End</span>
                          <input
                            type="date"
                            value={customCompareDraft.end}
                            min={customCompareDraft.start}
                            onChange={(event) =>
                              setCustomCompareDraft((prev) => ({ ...prev, end: event.target.value }))
                            }
                            className="h-9 w-full rounded-lg border bg-background px-3 text-xs"
                          />
                        </label>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCustomCompareOpen(false);
                            setCustomCompareDraft({ start: compareStart, end: compareEnd });
                          }}
                          className="rounded-lg border px-3 py-1.5 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCompareStart(customCompareDraft.start);
                            setCompareEnd(customCompareDraft.end);
                            setCompareMode("custom");
                            setCustomCompareOpen(false);
                          }}
                          className="rounded-lg bg-foreground px-3 py-1.5 text-xs text-background"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            ) : null}

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-8 items-center gap-1 rounded-full border bg-background px-3 text-[11px] font-semibold text-foreground transition-colors hover:border-foreground/40"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              Export
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("overview");
                requestAnimationFrame(() => {
                  document.getElementById("ai-tasks-today")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                });
              }}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-[11px] font-semibold text-background"
            >
              <Bot className="h-3.5 w-3.5" />
              AI Assistant
            </button>

            <button
              type="button"
              onClick={resetControls}
              className="h-8 rounded-full border px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
	            >
	              Reset filters
	            </button>
	          </div>
	        </div>
	      </div>

	        <div className="rounded-2xl border bg-card px-3 py-2.5">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Analysis Workspace
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Deep analysis modules for campaigns, search terms, products, assets, audience, and diagnostics.
              </p>
            </div>
          </div>
          <div className="grid gap-2 xl:grid-cols-4">
            {TAB_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.tabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card to-muted/20 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Scan guide
          </p>
          <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-tight">
                {activeTabGuide[activeTab].title}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {activeTabGuide[activeTab].body}
              </p>
            </div>
            <HealthBadge
              state={activeMeta.failed_queries.length > 0 ? "critical" : activeMeta.warnings.length > 0 ? "warning" : "healthy"}
              label={activeMeta.failed_queries.length > 0 ? "Issues present" : activeMeta.warnings.length > 0 ? "Partial data" : "Healthy data"}
            />
          </div>
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
          campaigns={filteredCampaigns}
          opportunities={filteredOpportunityRows}
          budget={filteredBudgetRows}
          products={filteredProductRows}
          crossEntityInsights={crossEntity.rows}
        />
      ) : activeTab === "campaigns" ? (
        <CampaignsView rows={filteredCampaigns} />
      ) : activeTab === "search-intelligence" ? (
        <SearchIntelligenceView
          rows={filteredSearchRows}
          summary={(searchIntelligenceQ.data?.summary ?? {}) as Record<string, any>}
          insights={(searchIntelligenceQ.data?.insights ?? {}) as Record<string, any>}
          crossEntityInsights={crossEntity.rows}
        />
      ) : activeTab === "keywords" ? (
        <KeywordsView
          rows={filteredKeywordRows}
          summary={(keywordsQ.data?.summary ?? {}) as Record<string, any>}
          insights={(keywordsQ.data?.insights ?? {}) as Record<string, any>}
        />
      ) : activeTab === "assets" ? (
        <AssetsView
          rows={filteredAssetRows}
          summary={(assetsQ.data?.summary ?? {}) as Record<string, any>}
          insights={(assetsQ.data?.insights ?? {}) as Record<string, any>}
        />
      ) : activeTab === "asset-groups" ? (
        <AssetGroupsView
          rows={filteredAssetGroupRows}
          summary={(assetGroupsQ.data?.summary ?? {}) as Record<string, any>}
          insights={(assetGroupsQ.data?.insights ?? {}) as Record<string, any>}
          crossEntityInsights={crossEntity.rows}
        />
      ) : activeTab === "products" ? (
        <ProductsView
          rows={filteredProductRows}
          summary={(productsQ.data?.summary ?? {}) as Record<string, any>}
          insights={(productsQ.data?.insights ?? {}) as Record<string, any>}
          crossEntityInsights={crossEntity.rows}
        />
      ) : activeTab === "audiences" ? (
        <AudienceView
          rows={filteredAudienceRows}
          summary={(audiencesQ.data?.summary ?? {}) as Record<string, any>}
        />
      ) : activeTab === "geo-devices" ? (
        <GeoDevicesView geoRows={filteredGeoRows} deviceRows={filteredDeviceRows} />
      ) : activeTab === "budget-scaling" ? (
        <BudgetScalingView
          budgetRows={filteredBudgetRows}
          budgetSummary={(budgetQ.data?.summary ?? {}) as Record<string, any>}
          budgetInsights={(budgetQ.data?.insights ?? {}) as Record<string, any>}
          products={filteredProductRows}
        />
      ) : activeTab === "opportunities" ? (
        <OpportunitiesView
          rows={filteredOpportunityRows}
          summary={(opportunitiesQ.data?.summary ?? {}) as Record<string, any>}
        />
      ) : (
        <DiagnosticsView diagnostics={diagnosticsQ.data} meta={activeMeta} />
      )}
    </div>
  );
}
