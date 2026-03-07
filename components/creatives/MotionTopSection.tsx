"use client";

import { useMemo, useRef, useState } from "react";
import { Trophy, ChevronDown, X, Search, Plus, SlidersHorizontal, LayoutGrid, Ellipsis } from "lucide-react";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { cn } from "@/lib/utils";
import { useDropdownBehavior } from "@/hooks/use-dropdown-behavior";

export type MotionGroupBy = "adName" | "creative" | "copy" | "headline" | "landingPage";

export type MotionDatePreset =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "thisMonth"
  | "lastWeek"
  | "lastMonth"
  | "last7Days"
  | "last14Days"
  | "last30Days"
  | "last365Days"
  | "custom"
  | "last"
  | "since";

export interface MotionDateRangeValue {
  preset: MotionDatePreset;
  customStart: string;
  customEnd: string;
  lastDays: number;
  sinceDate: string;
}

export interface MotionFilterRule {
  id: string;
  field: MotionFilterField;
  query: string;
}

export type MotionFilterField =
  | "campaignName"
  | "adSetName"
  | "adName"
  | "adSetup"
  | "landingPage"
  | "launchDate"
  | "performanceMetrics"
  | "aiTags"
  | "namingConvention"
  | "customTags";

type GoodDirection = "high" | "low" | "neutral";

export interface MotionMetricDefinition {
  id: string;
  label: string;
  direction: GoodDirection;
  format: (n: number) => string;
  getValue: (row: MetaCreativeRow, context: MotionMetricContext) => number;
}

interface MotionMetricContext {
  totalSpend: number;
  totalPurchaseValue: number;
}

interface MotionTopSectionProps {
  dateRange: MotionDateRangeValue;
  onDateRangeChange: (next: MotionDateRangeValue) => void;
  groupBy: MotionGroupBy;
  onGroupByChange: (next: MotionGroupBy) => void;
  filters: MotionFilterRule[];
  onFiltersChange: (next: MotionFilterRule[]) => void;
  selectedMetricIds: string[];
  onSelectedMetricIdsChange: (next: string[]) => void;
  selectedRows: MetaCreativeRow[];
  allRowsForHeatmap: MetaCreativeRow[];
  onOpenRow: (rowId: string) => void;
}

export const DEFAULT_MOTION_DATE_RANGE: MotionDateRangeValue = {
  preset: "last14Days",
  customStart: "",
  customEnd: "",
  lastDays: 14,
  sinceDate: "",
};

const GROUP_BY_OPTIONS: Array<{ value: MotionGroupBy; label: string }> = [
  { value: "adName", label: "Ad Name" },
  { value: "creative", label: "Creative" },
  { value: "copy", label: "Copy" },
  { value: "headline", label: "Headline" },
  { value: "landingPage", label: "Landing Page" },
];

const FILTER_TREE: Array<{ label: string; children: Array<{ label: string; value: MotionFilterField }> }> = [
  {
    label: "Names",
    children: [
      { label: "Campaign name", value: "campaignName" },
      { label: "Ad set name", value: "adSetName" },
      { label: "Ad name", value: "adName" },
    ],
  },
  {
    label: "Setup",
    children: [
      { label: "Ad setup", value: "adSetup" },
      { label: "Landing page", value: "landingPage" },
      { label: "Launch date", value: "launchDate" },
    ],
  },
  {
    label: "Performance",
    children: [{ label: "Performance metrics", value: "performanceMetrics" }],
  },
  {
    label: "Tags",
    children: [
      { label: "AI Tags", value: "aiTags" },
      { label: "Naming convention", value: "namingConvention" },
      { label: "Custom tags", value: "customTags" },
    ],
  },
];

const AI_ACTIONS = [
  "Ask me anything",
  "Find scaling opportunities",
  "What's working and what's not",
  "Prep me for my team review",
  "Analyze this report",
];

const PRESET_OPTIONS: Array<{ value: MotionDatePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastWeek", label: "Last week" },
  { value: "lastMonth", label: "Last month" },
  { value: "last7Days", label: "Last 7 days" },
  { value: "last14Days", label: "Last 14 days" },
  { value: "last30Days", label: "Last 30 days" },
  { value: "last365Days", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
  { value: "last", label: "Last..." },
  { value: "since", label: "Since..." },
];

const METRIC_COLOR_TOKENS = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700", "bg-indigo-100 text-indigo-700"];

const METRIC_DEFS: MotionMetricDefinition[] = [
  { id: "spend", label: "Spend", direction: "neutral", format: fmtCurrency, getValue: (r) => r.spend },
  { id: "roas", label: "ROAS", direction: "high", format: (n) => n.toFixed(2), getValue: (r) => r.roas },
  { id: "hookScore", label: "Hook score", direction: "high", format: fmtInteger, getValue: (r) => r.thumbstop },
  {
    id: "purchaseValueShare",
    label: "% purchase value",
    direction: "high",
    format: fmtPercent,
    getValue: (r, c) => (c.totalPurchaseValue > 0 ? (r.purchaseValue / c.totalPurchaseValue) * 100 : 0),
  },
  { id: "purchases", label: "Purchases", direction: "high", format: fmtInteger, getValue: (r) => r.purchases },
  { id: "purchaseValue", label: "Purchase value", direction: "high", format: fmtCurrency, getValue: (r) => r.purchaseValue },
  { id: "costPerPurchase", label: "Cost per purchase", direction: "low", format: fmtCurrency, getValue: (r) => r.cpa },
  { id: "costPerLinkClick", label: "Cost per link click", direction: "low", format: fmtCurrency, getValue: (r) => r.cpcLink },
  { id: "costPerMille", label: "Cost per mille", direction: "low", format: fmtCurrency, getValue: (r) => r.cpm },
  { id: "costPerClickAll", label: "Cost per click (all)", direction: "low", format: fmtCurrency, getValue: (r) => r.cpcLink },
  {
    id: "averageOrderValue",
    label: "Average order value",
    direction: "high",
    format: fmtCurrency,
    getValue: (r) => (r.purchases > 0 ? r.purchaseValue / r.purchases : 0),
  },
  { id: "clickToAtcRatio", label: "Click to add-to-cart ratio", direction: "high", format: fmtPercent, getValue: (r) => r.clickToPurchase },
  { id: "atcToPurchaseRatio", label: "Add-to-cart to purchase ratio", direction: "high", format: fmtPercent, getValue: (r) => r.atcToPurchaseRatio },
  { id: "firstFrameRetention", label: "First frame retention", direction: "high", format: fmtPercent, getValue: (r) => r.thumbstop },
  { id: "thumbstopRatio", label: "Thumbstop ratio", direction: "high", format: fmtPercent, getValue: (r) => r.thumbstop },
  { id: "ctrOutbound", label: "Click through rate (outbound)", direction: "high", format: fmtPercent, getValue: (r) => r.ctrAll },
  { id: "clickToPurchaseRatio", label: "Click to purchase ratio", direction: "high", format: fmtPercent, getValue: (r) => r.clickToPurchase },
  { id: "ctrAll", label: "Click through rate (all)", direction: "high", format: fmtPercent, getValue: (r) => r.ctrAll },
  { id: "video25Rate", label: "25% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video25 },
  { id: "video50Rate", label: "50% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video50 },
  { id: "video75Rate", label: "75% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video50 },
  { id: "video100Rate", label: "100% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video50 },
  { id: "holdRate", label: "Hold rate", direction: "high", format: fmtPercent, getValue: (r) => r.video50 },
  { id: "watchScore", label: "Watch score", direction: "high", format: fmtInteger, getValue: (r) => r.video50 },
  { id: "clickScore", label: "Click score", direction: "high", format: fmtInteger, getValue: (r) => r.ctrAll * 10 },
  { id: "convertScore", label: "Convert score", direction: "high", format: fmtInteger, getValue: (r) => r.roas * 10 },
  {
    id: "averageOrderValueWebsite",
    label: "Average order value (website)",
    direction: "high",
    format: fmtCurrency,
    getValue: (r) => (r.purchases > 0 ? r.purchaseValue / r.purchases : 0),
  },
  {
    id: "impressions",
    label: "Impressions",
    direction: "high",
    format: fmtInteger,
    getValue: (r) => (r.cpm > 0 ? (r.spend * 1000) / r.cpm : 0),
  },
  {
    id: "spendShare",
    label: "% spend",
    direction: "neutral",
    format: fmtPercent,
    getValue: (r, c) => (c.totalSpend > 0 ? (r.spend / c.totalSpend) * 100 : 0),
  },
  {
    id: "linkCtr",
    label: "Click through rate (link clicks)",
    direction: "high",
    format: fmtPercent,
    getValue: (r) => r.ctrAll,
  },
  { id: "websitePurchaseRoas", label: "Website purchase ROAS", direction: "high", format: (n) => n.toFixed(2), getValue: (r) => r.roas },
  { id: "clickToWebsitePurchaseRatio", label: "Click to website purchase ratio", direction: "high", format: fmtPercent, getValue: (r) => r.clickToPurchase },
  {
    id: "purchasesPer1000Imp",
    label: "Purchases per 1,000 impressions",
    direction: "high",
    format: (n) => n.toFixed(2),
    getValue: (r) => {
      const impressions = r.cpm > 0 ? (r.spend * 1000) / r.cpm : 0;
      return impressions > 0 ? (r.purchases / impressions) * 1000 : 0;
    },
  },
  {
    id: "revenuePer1000Imp",
    label: "Revenue per 1,000 impressions",
    direction: "high",
    format: fmtCurrency,
    getValue: (r) => {
      const impressions = r.cpm > 0 ? (r.spend * 1000) / r.cpm : 0;
      return impressions > 0 ? (r.purchaseValue / impressions) * 1000 : 0;
    },
  },
  {
    id: "clicksAll",
    label: "Clicks (all)",
    direction: "high",
    format: fmtInteger,
    getValue: (r) => (r.cpcLink > 0 ? r.spend / r.cpcLink : 0),
  },
  {
    id: "linkClicks",
    label: "Link clicks",
    direction: "high",
    format: fmtInteger,
    getValue: (r) => (r.cpcLink > 0 ? r.spend / r.cpcLink : 0),
  },
];

export const DEFAULT_TOP_METRIC_IDS = ["spend", "roas", "hookScore", "purchaseValueShare", "purchases"];

export function getMotionMetricDefinition(id: string): MotionMetricDefinition | undefined {
  return METRIC_DEFS.find((metric) => metric.id === id);
}

export function resolveMotionDateRange(value: MotionDateRangeValue): { start: string; end: string } {
  const today = startOfDay(new Date());

  switch (value.preset) {
    case "today":
      return { start: toISO(today), end: toISO(today) };
    case "yesterday": {
      const date = addDays(today, -1);
      return { start: toISO(date), end: toISO(date) };
    }
    case "thisWeek": {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      return { start: toISO(addDays(today, mondayOffset)), end: toISO(today) };
    }
    case "thisMonth": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toISO(start), end: toISO(today) };
    }
    case "lastWeek": {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const thisWeekStart = addDays(today, mondayOffset);
      const lastWeekStart = addDays(thisWeekStart, -7);
      const lastWeekEnd = addDays(thisWeekStart, -1);
      return { start: toISO(lastWeekStart), end: toISO(lastWeekEnd) };
    }
    case "lastMonth": {
      const year = today.getFullYear();
      const month = today.getMonth();
      const start = new Date(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, 1);
      const end = new Date(year, month, 0);
      return { start: toISO(start), end: toISO(end) };
    }
    case "last7Days":
      return { start: toISO(addDays(today, -6)), end: toISO(today) };
    case "last14Days":
      return { start: toISO(addDays(today, -13)), end: toISO(today) };
    case "last30Days":
      return { start: toISO(addDays(today, -29)), end: toISO(today) };
    case "last365Days":
      return { start: toISO(addDays(today, -364)), end: toISO(today) };
    case "last": {
      const days = Number.isFinite(value.lastDays) ? Math.max(1, Math.floor(value.lastDays)) : 14;
      return { start: toISO(addDays(today, -(days - 1))), end: toISO(today) };
    }
    case "since": {
      if (!value.sinceDate) return { start: toISO(addDays(today, -13)), end: toISO(today) };
      return { start: value.sinceDate, end: toISO(today) };
    }
    case "custom":
      return {
        start: value.customStart || toISO(addDays(today, -13)),
        end: value.customEnd || toISO(today),
      };
  }
}

export function formatMotionDateLabel(value: MotionDateRangeValue): string {
  const preset = PRESET_OPTIONS.find((item) => item.value === value.preset);
  if (value.preset !== "custom" && value.preset !== "last" && value.preset !== "since") {
    return preset?.label ?? "Last 14 days";
  }

  if (value.preset === "last") {
    return `Last ${Math.max(1, Math.floor(value.lastDays || 14))} days`;
  }

  const { start, end } = resolveMotionDateRange(value);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function applyMotionFilters(rows: MetaCreativeRow[], rules: MotionFilterRule[]): MetaCreativeRow[] {
  if (rules.length === 0) return rows;

  return rows.filter((row) =>
    rules.every((rule) => {
      const query = rule.query.trim().toLowerCase();
      if (!query) return true;

      const metricsBlob = [row.spend, row.purchaseValue, row.roas, row.cpa, row.cpcLink, row.cpm, row.ctrAll, row.purchases]
        .map((value) => String(value))
        .join(" ")
        .toLowerCase();
      const tagsBlob = row.tags.join(" ").toLowerCase();

      if (rule.field === "adName" || rule.field === "namingConvention") {
        return row.name.toLowerCase().includes(query);
      }
      if (rule.field === "launchDate") {
        return row.launchDate.toLowerCase().includes(query);
      }
      if (rule.field === "performanceMetrics") {
        return metricsBlob.includes(query);
      }

      return `${row.name} ${tagsBlob}`.toLowerCase().includes(query);
    })
  );
}

export function mapMotionGroupByToApi(groupBy: MotionGroupBy): "adName" | "creative" | "adSet" {
  if (groupBy === "creative") return "creative";
  if (groupBy === "landingPage") return "adSet";
  if (groupBy === "copy" || groupBy === "headline") return "creative";
  return "adName";
}

export function MotionTopSection({
  dateRange,
  onDateRangeChange,
  groupBy,
  onGroupByChange,
  filters,
  onFiltersChange,
  selectedMetricIds,
  onSelectedMetricIdsChange,
  selectedRows,
  allRowsForHeatmap,
  onOpenRow,
}: MotionTopSectionProps) {
  const metricDefs = useMemo(
    () => selectedMetricIds.map((id) => getMotionMetricDefinition(id)).filter(Boolean) as MotionMetricDefinition[],
    [selectedMetricIds]
  );

  const topRows = selectedRows.slice(0, 20);

  return (
    <section>
      {/* A — Header */}
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Trophy className="h-5 w-5 text-amber-500" />
          Top creatives
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          This report shows your top performing creatives. Use this to quickly identify where you are spending money vs making money.
        </p>
      </div>

      {/* B — Filters */}
      <div className="mt-6 rounded-xl border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <MotionDateRangePicker value={dateRange} onChange={onDateRangeChange} />

          <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs">
            <span className="text-muted-foreground">Group by</span>
            <select
              value={groupBy}
              onChange={(event) => onGroupByChange(event.target.value as MotionGroupBy)}
              className="border-0 bg-transparent pr-6 text-xs outline-none"
            >
              {GROUP_BY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <AddFilterDropdown filters={filters} onChange={onFiltersChange} />
        </div>
      </div>

      {/* C — AI action row */}
      <div className="mt-3 rounded-xl border bg-muted/20 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {AI_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground/85 hover:bg-background"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* D — Selected creatives workspace */}
      <div className="mt-4 rounded-2xl border bg-card p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <MetricSelectorBar selectedMetricIds={selectedMetricIds} onChange={onSelectedMetricIdsChange} />
          </div>

          <div className="hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              aria-label="Workspace layout"
              className="rounded-md border p-1.5 text-muted-foreground hover:text-foreground"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Workspace settings"
              className="rounded-md border p-1.5 text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Workspace more"
              className="rounded-md border p-1.5 text-muted-foreground hover:text-foreground"
            >
              <Ellipsis className="h-4 w-4" />
            </button>
          </div>
        </div>

        <PreviewStrip
          rows={topRows}
          metrics={metricDefs}
          allRowsForHeatmap={allRowsForHeatmap}
          onOpenRow={onOpenRow}
        />
      </div>
    </section>
  );
}

function MotionDateRangePicker({ value, onChange }: { value: MotionDateRangeValue; onChange: (next: MotionDateRangeValue) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MotionDateRangeValue>(value);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useDropdownBehavior({
    id: "top-date-range",
    open,
    setOpen,
    containerRef: wrapRef,
    triggerRef,
  });

  const apply = () => {
    onChange(normalizeRange(draft));
    setOpen(false);
  };

  const cancel = () => {
    setDraft(value);
    setOpen(false);
  };

  const label = formatMotionDateLabel(value);
  const { start, end } = resolveMotionDateRange(draft);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setDraft(value);
          setOpen((prev) => !prev);
        }}
        className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 absolute left-0 top-11 z-50 flex w-[760px] rounded-xl border bg-background shadow-lg duration-150">
          <div className="w-56 border-r p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Presets</p>
            <div className="space-y-1">
              {PRESET_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, preset: option.value }))}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-xs",
                    draft.preset === option.value ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {draft.preset === "last" && (
              <div className="mt-3 space-y-1">
                <label className="text-[11px] text-muted-foreground">Days</label>
                <input
                  type="number"
                  min={1}
                  value={draft.lastDays}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      lastDays: Math.max(1, Number.parseInt(event.target.value || "14", 10)),
                    }))
                  }
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                />
              </div>
            )}

            {draft.preset === "since" && (
              <div className="mt-3 space-y-1">
                <label className="text-[11px] text-muted-foreground">Start date</label>
                <input
                  type="date"
                  value={draft.sinceDate}
                  onChange={(event) => setDraft((prev) => ({ ...prev, sinceDate: event.target.value }))}
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                />
              </div>
            )}
          </div>

          <div className="flex-1 p-3">
            <div className="mb-2 text-xs text-muted-foreground">{formatDate(start)} - {formatDate(end)}</div>
            <div className="flex gap-4">
              <MonthCalendar
                year={monthCursor.year}
                month={monthCursor.month}
                start={start}
                end={end}
                onSelect={(iso) => {
                  setDraft((prev) => selectCalendarDate(prev, iso));
                }}
                onPrevMonth={() => setMonthCursor((prev) => moveMonth(prev, -1))}
                onNextMonth={() => setMonthCursor((prev) => moveMonth(prev, 1))}
                showPrev
                showNext={false}
              />
              <MonthCalendar
                year={nextMonth(monthCursor).year}
                month={nextMonth(monthCursor).month}
                start={start}
                end={end}
                onSelect={(iso) => {
                  setDraft((prev) => selectCalendarDate(prev, iso));
                }}
                onPrevMonth={() => setMonthCursor((prev) => moveMonth(prev, -1))}
                onNextMonth={() => setMonthCursor((prev) => moveMonth(prev, 1))}
                showPrev={false}
                showNext
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={cancel} className="rounded-md border px-3 py-1.5 text-xs">
                Cancel
              </button>
              <button type="button" onClick={apply} className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddFilterDropdown({ filters, onChange }: { filters: MotionFilterRule[]; onChange: (next: MotionFilterRule[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [field, setField] = useState<MotionFilterField>("adName");
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useDropdownBehavior({
    id: "top-add-filter",
    open,
    setOpen,
    containerRef: wrapRef,
    triggerRef,
    focusRef: searchRef,
  });

  const filteredTree = FILTER_TREE.map((group) => ({
    ...group,
    children: group.children.filter((option) => option.label.toLowerCase().includes(search.toLowerCase())),
  })).filter((group) => group.children.length > 0);

  const addRule = () => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    onChange([
      ...filters,
      {
        id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        field,
        query: cleanQuery,
      },
    ]);
    setQuery("");
    setOpen(false);
  };

  const removeRule = (ruleId: string) => onChange(filters.filter((rule) => rule.id !== ruleId));

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs"
      >
        <Plus className="h-3.5 w-3.5" />
        Add filter
      </button>

      {open && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 absolute left-0 top-11 z-50 w-[360px] rounded-xl border bg-background p-3 shadow-lg duration-150">
          <div className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search filters"
              className="w-full bg-transparent text-xs outline-none"
            />
          </div>

          <div className="max-h-48 space-y-2 overflow-auto pr-1">
            {filteredTree.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
                {group.children.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setField(option.value)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-xs",
                      field === option.value ? "bg-accent" : "hover:bg-accent/60"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-2 border-t pt-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Contains..."
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
            <button
              type="button"
              onClick={addRule}
              className="h-8 w-full rounded-md bg-foreground text-xs text-background"
            >
              Apply filter
            </button>
          </div>
        </div>
      )}

      {filters.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filters.map((rule) => (
            <span key={rule.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/20 px-2 py-1 text-[11px]">
              {prettyFieldLabel(rule.field)}: {rule.query}
              <button type="button" onClick={() => removeRule(rule.id)}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricSelectorBar({ selectedMetricIds, onChange }: { selectedMetricIds: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useDropdownBehavior({
    id: "top-add-metric",
    open,
    setOpen,
    containerRef: wrapRef,
    triggerRef,
    focusRef: searchRef,
  });

  const selectedDefs = selectedMetricIds
    .map((id) => getMotionMetricDefinition(id))
    .filter(Boolean) as MotionMetricDefinition[];

  const available = METRIC_DEFS.filter(
    (metric) => metric.label.toLowerCase().includes(query.toLowerCase()) && !selectedMetricIds.includes(metric.id)
  );

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
        <button type="button" className="shrink-0 rounded-full border bg-muted/25 px-3 py-1 text-xs">
          + AI tags
        </button>

        <div ref={wrapRef} className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="rounded-full border bg-background px-3 py-1 text-xs"
          >
            + Add metric
          </button>

          {open && (
            <div className="animate-in fade-in-0 slide-in-from-top-1 absolute left-0 top-9 z-50 w-[360px] rounded-xl border bg-background p-3 shadow-lg duration-150">
              <div className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search metrics"
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>

              <div className="max-h-72 space-y-1 overflow-auto pr-1">
                {available.map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    onClick={() => {
                      onChange([...selectedMetricIds, metric.id]);
                      setQuery("");
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/60"
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedDefs.map((metric, index) => (
          <span
            key={metric.id}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
              METRIC_COLOR_TOKENS[index % METRIC_COLOR_TOKENS.length]
            )}
          >
            {index + 1} {metric.label}
            <button
              type="button"
              onClick={() => onChange(selectedMetricIds.filter((item) => item !== metric.id))}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function PreviewStrip({
  rows,
  metrics,
  allRowsForHeatmap,
  onOpenRow,
}: {
  rows: MetaCreativeRow[];
  metrics: MotionMetricDefinition[];
  allRowsForHeatmap: MetaCreativeRow[];
  onOpenRow: (rowId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        Select creatives in the table to populate this strip.
      </div>
    );
  }

  const context: MotionMetricContext = {
    totalSpend: rows.reduce((sum, row) => sum + row.spend, 0),
    totalPurchaseValue: rows.reduce((sum, row) => sum + row.purchaseValue, 0),
  };

  const extremes = metrics.reduce<Record<string, { min: number; max: number }>>((acc, metric) => {
    const sourceRows = allRowsForHeatmap.length > 0 ? allRowsForHeatmap : rows;
    const values = sourceRows.map((row) => metric.getValue(row, context));
    acc[metric.id] = { min: Math.min(...values), max: Math.max(...values) };
    return acc;
  }, {});

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2.5">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpenRow(row.id)}
            className="w-[182px] shrink-0 overflow-hidden rounded-lg border bg-muted/10 text-left"
          >
            <div className="relative aspect-square w-full overflow-hidden bg-muted/30">
              {row.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.previewUrl} alt={row.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  {row.previewState === "catalog" ? "Catalog ad" : "Preview unavailable"}
                </div>
              )}
              <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white">
                {row.format === "video" ? "Video" : "Image"}
              </span>
            </div>

            <div className="space-y-2 p-2.5">
              <p className="line-clamp-2 text-xs font-medium leading-4">{row.name}</p>
              <div className="space-y-1">
                {metrics.map((metric) => {
                  const value = metric.getValue(row, context);
                  const range = extremes[metric.id] ?? { min: value, max: value };
                  const heat =
                    metric.direction === "neutral"
                      ? "rgba(148, 163, 184, 0.15)"
                      : withIntensity(getHeatColor(metric.direction, value, range.min, range.max), 0.8);

                  return (
                    <div key={metric.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <p className="truncate text-muted-foreground">{metric.label}</p>
                      <span
                        className="rounded-full px-1.5 py-0.5 font-semibold"
                        style={{ backgroundColor: heat }}
                      >
                        {metric.format(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthCalendar({
  year,
  month,
  start,
  end,
  onSelect,
  onPrevMonth,
  onNextMonth,
  showPrev,
  showNext,
}: {
  year: number;
  month: number;
  start: string;
  end: string;
  onSelect: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  showPrev: boolean;
  showNext: boolean;
}) {
  const cells = buildMonthGrid(year, month);

  return (
    <div className="w-[238px]">
      <div className="mb-2 flex items-center justify-between text-xs font-medium">
        <button
          type="button"
          onClick={onPrevMonth}
          className={cn("h-6 w-6 rounded hover:bg-accent", !showPrev && "invisible")}
        >
          {"<"}
        </button>
        <span>{new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button
          type="button"
          onClick={onNextMonth}
          className={cn("h-6 w-6 rounded hover:bg-accent", !showNext && "invisible")}
        >
          {">"}
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <div key={day} className="py-1">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty_${index}`} className="h-8 w-8" />;

          const inRange = start && end && cell >= start && cell <= end;
          const isEdge = cell === start || cell === end;
          return (
            <button
              key={cell}
              type="button"
              onClick={() => onSelect(cell)}
              className={cn(
                "mx-auto h-8 w-8 rounded-full text-xs",
                isEdge && "bg-foreground text-background",
                !isEdge && inRange && "bg-accent",
                !inRange && "hover:bg-accent/60"
              )}
            >
              {Number.parseInt(cell.slice(8), 10)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function normalizeRange(range: MotionDateRangeValue): MotionDateRangeValue {
  const next = { ...range };

  if (next.preset === "last") {
    next.lastDays = Math.max(1, Math.floor(next.lastDays || 14));
  }

  if (next.preset === "custom") {
    const { start, end } = resolveMotionDateRange(next);
    next.customStart = start;
    next.customEnd = end;
  }

  if (next.preset === "since" && !next.sinceDate) {
    next.sinceDate = toISO(addDays(startOfDay(new Date()), -13));
  }

  return next;
}

function selectCalendarDate(range: MotionDateRangeValue, iso: string): MotionDateRangeValue {
  if (range.preset !== "custom") {
    return {
      ...range,
      preset: "custom",
      customStart: iso,
      customEnd: iso,
    };
  }

  if (!range.customStart || (range.customStart && range.customEnd)) {
    return {
      ...range,
      customStart: iso,
      customEnd: "",
    };
  }

  if (iso < range.customStart) {
    return {
      ...range,
      customStart: iso,
      customEnd: range.customStart,
    };
  }

  return {
    ...range,
    customEnd: iso,
  };
}

function buildMonthGrid(year: number, month: number): Array<string | null> {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [];

  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function moveMonth(cursor: { year: number; month: number }, delta: number): { year: number; month: number } {
  const next = new Date(cursor.year, cursor.month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function nextMonth(cursor: { year: number; month: number }): { year: number; month: number } {
  return moveMonth(cursor, 1);
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function prettyFieldLabel(field: MotionFilterField): string {
  const lookup: Record<MotionFilterField, string> = {
    campaignName: "Campaign",
    adSetName: "Ad Set",
    adName: "Ad",
    adSetup: "Ad setup",
    landingPage: "Landing page",
    launchDate: "Launch date",
    performanceMetrics: "Performance",
    aiTags: "AI Tags",
    namingConvention: "Naming",
    customTags: "Custom tags",
  };

  return lookup[field];
}

function fmtCurrency(n: number): string {
  return n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
}

function fmtPercent(n: number): string {
  return `${n.toFixed(2)}%`;
}

function fmtInteger(n: number): string {
  return Math.round(n).toLocaleString();
}

function withIntensity(color: string, multiplier: number) {
  const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if (!match) return color;
  const [, r, g, b, alpha] = match;
  const nextAlpha = Math.max(0.04, Math.min(0.38, Number(alpha) * multiplier));
  return `rgba(${r}, ${g}, ${b}, ${nextAlpha.toFixed(3)})`;
}

function getHeatColor(direction: GoodDirection, value: number, min: number, max: number) {
  if (max <= min) return "transparent";

  const normalize = (value - min) / (max - min);

  if (direction === "neutral") {
    const alpha = 0.06 + normalize * 0.14;
    return `rgba(148, 163, 184, ${alpha.toFixed(3)})`;
  }

  const score = direction === "low" ? 1 - normalize : normalize;
  if (score >= 0.5) {
    const alpha = 0.08 + ((score - 0.5) / 0.5) * 0.22;
    return `rgba(16, 185, 129, ${alpha.toFixed(3)})`;
  }

  const alpha = 0.08 + ((0.5 - score) / 0.5) * 0.22;
  return `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
}
