"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, ChevronDown, ChevronRight, X, Search, Plus, SlidersHorizontal, LayoutGrid, Ellipsis, Check, Copy, FileDown, Link2 } from "lucide-react";
import { createPortal } from "react-dom";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { CreativeRenderSurface } from "@/components/creatives/CreativeRenderSurface";
import { resolveCreativeCurrency } from "@/components/creatives/money";
import {
  applyCreativeFilters,
  buildMonthGrid,
  DEFAULT_COPY_TOP_METRIC_IDS,
  DEFAULT_CREATIVE_DATE_RANGE,
  DEFAULT_TOP_METRIC_IDS,
  fmtCurrency,
  fmtInteger,
  fmtPercent,
  formatDate,
  formatCreativeDateLabel,
  mapCreativeGroupByToApi,
  moveMonth,
  nextMonth,
  normalizeRange,
  prettyFieldLabel,
  prettyOperatorLabel,
  resolveAverageHeatColor,
  resolveCreativeDateRange,
  selectCalendarDate,
} from "@/components/creatives/creatives-top-section-support";
import { cn } from "@/lib/utils";
import { useDropdownBehavior } from "@/hooks/use-dropdown-behavior";

export type CreativeGroupBy = "adName" | "creative" | "copy" | "headline" | "landingPage" | "campaign" | "adSet";

export type CreativeDatePreset =
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

export interface CreativeDateRangeValue {
  preset: CreativeDatePreset;
  customStart: string;
  customEnd: string;
  lastDays: number;
  sinceDate: string;
}

export interface CreativeFilterRule {
  id: string;
  field: CreativeFilterField;
  operator?: CreativeFilterOperator;
  query: string;
}

export type CreativeFilterOperator = "contains" | "equals" | "not_equals" | "starts_with" | "before" | "after";

export type CreativeFilterField =
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

export interface CreativeMetricDefinition {
  id: string;
  label: string;
  direction: GoodDirection;
  format: (n: number, rowCurrency?: string | null, defaultCurrency?: string | null) => string;
  getValue: (row: MetaCreativeRow, context: CreativeMetricContext) => number;
}

interface CreativeMetricContext {
  totalSpend: number;
  totalPurchaseValue: number;
}

interface CreativesTopSectionProps {
  showHeader?: boolean;
  dateRange: CreativeDateRangeValue;
  onDateRangeChange: (next: CreativeDateRangeValue) => void;
  groupBy: CreativeGroupBy;
  onGroupByChange: (next: CreativeGroupBy) => void;
  filters: CreativeFilterRule[];
  onFiltersChange: (next: CreativeFilterRule[]) => void;
  selectedMetricIds: string[];
  onSelectedMetricIdsChange: (next: string[]) => void;
  selectedRows: MetaCreativeRow[];
  allRowsForHeatmap: MetaCreativeRow[];
  defaultCurrency: string | null;
  onOpenRow: (rowId: string) => void;
  onShareExport: () => void;
  onCsvExport: () => void;
  title?: string;
  description?: string;
  aiActions?: string[];
  groupByOptions?: Array<{ value: CreativeGroupBy; label: string }>;
  previewMode?: "media" | "copy";
  getPreviewCopyText?: (row: MetaCreativeRow) => string;
  shareExportLoading?: boolean;
  csvExportLoading?: boolean;
  shareUrl?: string | null;
  shareError?: string | null;
  csvError?: string | null;
  previewStripState?: "data_loading" | "media_hydrating" | "ready" | "missing";
  showAiActionsRow?: boolean;
  previewStripSummary?: {
    total: number;
    ready: number;
    pending: number;
    missing: number;
    minimumReady: number;
  };
}

const GROUP_BY_OPTIONS: Array<{ value: CreativeGroupBy; label: string }> = [
  { value: "adName", label: "Ad Name" },
  { value: "creative", label: "Creative" },
  { value: "copy", label: "Copy" },
  { value: "headline", label: "Headline" },
  { value: "campaign", label: "Campaign" },
  { value: "adSet", label: "Ad Set" },
  { value: "landingPage", label: "Landing Page" },
];

const FILTER_TREE: Array<{ label: string; children: Array<{ label: string; value: CreativeFilterField }> }> = [
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

const PRESET_OPTIONS: Array<{ value: CreativeDatePreset; label: string }> = [
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
let topRowPropLogCount = 0;

const METRIC_DEFS: CreativeMetricDefinition[] = [
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
  { id: "seeMoreRate", label: "See more rate", direction: "high", format: fmtPercent, getValue: (r) => r.seeMoreRate },
  { id: "ctrAll", label: "Click through rate (all)", direction: "high", format: fmtPercent, getValue: (r) => r.ctrAll },
  { id: "video25Rate", label: "25% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video25 },
  { id: "video50Rate", label: "50% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video50 },
  { id: "video75Rate", label: "75% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video75 },
  { id: "video100Rate", label: "100% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video100 },
  { id: "holdRate", label: "Hold rate", direction: "high", format: fmtPercent, getValue: (r) => r.video100 },
  { id: "watchScore", label: "Watch score", direction: "high", format: fmtInteger, getValue: (r) => r.video100 },
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

const CREATIVE_METRIC_MAP: Record<string, CreativeMetricDefinition> = METRIC_DEFS.reduce(
  (acc, metric) => {
    acc[metric.id] = metric;
    return acc;
  },
  {} as Record<string, CreativeMetricDefinition>
);

export function getCreativeMetricDefinition(id: string): CreativeMetricDefinition | undefined {
  return CREATIVE_METRIC_MAP[id];
}

export function CreativesTopSection({
  showHeader = true,
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
  defaultCurrency,
  onOpenRow,
  onShareExport,
  onCsvExport,
  title = "Top creatives",
  description = "This report shows your top performing creatives. Use this to quickly identify where you are spending money vs making money.",
  aiActions = AI_ACTIONS,
  groupByOptions = GROUP_BY_OPTIONS,
  previewMode = "media",
  getPreviewCopyText,
  shareExportLoading = false,
  csvExportLoading = false,
  shareUrl = null,
  shareError = null,
  csvError = null,
  previewStripState = "ready",
  showAiActionsRow = true,
  previewStripSummary,
}: CreativesTopSectionProps) {
  const metricDefs = useMemo(
    () => selectedMetricIds.map((id) => CREATIVE_METRIC_MAP[id]).filter(Boolean) as CreativeMetricDefinition[],
    [selectedMetricIds]
  );

  const topRows = useMemo(() => selectedRows, [selectedRows]);

  return (
    <section>
      {/* A — Header */}
      {showHeader && (
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Trophy className="h-5 w-5 text-amber-500" />
            {title}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      )}

      {/* B — Filters */}
      <div className={cn(showHeader ? "mt-6" : "mt-0", "rounded-xl border bg-card px-3 py-2")}>
        <div className="flex flex-wrap items-center gap-2">
          <CreativeDateRangePicker value={dateRange} onChange={onDateRangeChange} />

          <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs">
            <span className="text-muted-foreground">Group by</span>
            <select
              value={groupBy}
              onChange={(event) => onGroupByChange(event.target.value as CreativeGroupBy)}
              className="border-0 bg-transparent pr-6 text-xs outline-none"
            >
              {groupByOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <AddFilterDropdown filters={filters} rows={allRowsForHeatmap} onChange={onFiltersChange} />

          <div id="creative-ai-signals-slot" className="inline-flex items-center gap-1.5" />

          <div className="ml-auto">
            <TopExportDropdown
              onShareExport={onShareExport}
              onCsvExport={onCsvExport}
              shareLoading={shareExportLoading}
              csvLoading={csvExportLoading}
              shareUrl={shareUrl}
              shareError={shareError}
              csvError={csvError}
            />
          </div>
        </div>
      </div>

      {showAiActionsRow && (
        <div className="mt-3 rounded-xl border bg-muted/20 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {aiActions.map((action) => (
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
      )}

      {/* D — Selected creatives workspace */}
      <div className="mt-4 rounded-2xl border bg-card p-3">
        <div className="relative z-20 mb-3 flex items-start justify-between gap-3">
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
          defaultCurrency={defaultCurrency}
          onOpenRow={onOpenRow}
          previewMode={previewMode}
          getPreviewCopyText={getPreviewCopyText}
          previewStripState={previewStripState}
          previewStripSummary={previewStripSummary}
        />
      </div>
    </section>
  );
}

function CreativeDateRangePicker({ value, onChange }: { value: CreativeDateRangeValue; onChange: (next: CreativeDateRangeValue) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CreativeDateRangeValue>(value);
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

  const label = formatCreativeDateLabel(value);
  const { start, end } = resolveCreativeDateRange(draft);

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

function AddFilterDropdown({
  filters,
  rows,
  onChange,
}: {
  filters: CreativeFilterRule[];
  rows: MetaCreativeRow[];
  onChange: (next: CreativeFilterRule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "compose">("pick");
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [field, setField] = useState<CreativeFilterField>("campaignName");
  const [operator, setOperator] = useState<CreativeFilterOperator>("contains");
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  useDropdownBehavior({
    id: "top-add-filter",
    open,
    setOpen,
    containerRef: wrapRef,
    triggerRef,
    focusRef: step === "pick" ? searchRef : queryRef,
  });

  const filterOptions = useMemo(
    () => [
      { label: "Campaign name", value: "campaignName" as CreativeFilterField },
      { label: "Ad set name", value: "adSetName" as CreativeFilterField },
      { label: "Ad name", value: "adName" as CreativeFilterField },
      { label: "Ad setup", value: "adSetup" as CreativeFilterField, showChevron: true },
      { label: "Landing page", value: "landingPage" as CreativeFilterField },
      { label: "Launch date", value: "launchDate" as CreativeFilterField },
      { label: "Performance metrics", value: "performanceMetrics" as CreativeFilterField, showChevron: true },
      { label: "AI Tags", value: "aiTags" as CreativeFilterField },
      { label: "Naming convention", value: "namingConvention" as CreativeFilterField },
      { label: "Custom tags", value: "customTags" as CreativeFilterField },
    ],
    []
  );

  const filteredOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return filterOptions;
    return filterOptions.filter((option) => option.label.toLowerCase().includes(normalizedSearch));
  }, [filterOptions, search]);

  const operatorOptions = useMemo(() => {
    if (field === "launchDate") {
      return [
        { value: "contains" as CreativeFilterOperator, label: "contains" },
        { value: "equals" as CreativeFilterOperator, label: "is" },
        { value: "before" as CreativeFilterOperator, label: "before" },
        { value: "after" as CreativeFilterOperator, label: "after" },
      ];
    }
    return [
      { value: "contains" as CreativeFilterOperator, label: "contains" },
      { value: "equals" as CreativeFilterOperator, label: "is" },
      { value: "not_equals" as CreativeFilterOperator, label: "is not" },
      { value: "starts_with" as CreativeFilterOperator, label: "starts with" },
    ];
  }, [field]);

  const fieldSuggestions = useMemo(() => {
    const collect = (values: Array<string | null | undefined>) =>
      Array.from(
        new Set(
          values
            .map((value) => (value ?? "").trim())
            .filter(Boolean)
        )
      ).slice(0, 80);

    switch (field) {
      case "campaignName":
        return collect(rows.map((row) => row.campaignName));
      case "adSetName":
        return collect(rows.map((row) => row.adSetName));
      case "adName":
      case "namingConvention":
        return collect(rows.map((row) => row.name));
      case "launchDate":
        return collect(rows.map((row) => row.launchDate)).sort((a, b) => a.localeCompare(b));
      case "aiTags":
        return collect(rows.flatMap((row) => [...row.tags, ...Object.values(row.aiTags ?? {}).flat()]));
      default:
        return [];
    }
  }, [field, rows]);

  const filteredSuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return fieldSuggestions.slice(0, 8);
    return fieldSuggestions.filter((value) => value.toLowerCase().includes(normalizedQuery)).slice(0, 8);
  }, [fieldSuggestions, query]);

  const campaignGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const groups = new Map<string, Set<string>>();

    for (const row of rows) {
      if (!(row.spend > 0)) continue;
      const campaignName = row.campaignName?.trim();
      if (!campaignName) continue;
      if (!groups.has(campaignName)) groups.set(campaignName, new Set());
      const adSetName = row.adSetName?.trim();
      if (adSetName) groups.get(campaignName)?.add(adSetName);
    }

    return Array.from(groups.entries())
      .map(([campaignName, adSetNames]) => ({
        campaignName,
        adSetNames: Array.from(adSetNames).sort((a, b) => a.localeCompare(b)),
      }))
      .filter((group) => {
        if (!normalizedQuery) return true;
        if (group.campaignName.toLowerCase().includes(normalizedQuery)) return true;
        return group.adSetNames.some((adSetName) => adSetName.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => a.campaignName.localeCompare(b.campaignName));
  }, [query, rows]);

  const showCampaignBrowser = field === "campaignName" || field === "adSetName";

  const toggleCampaignExpanded = (campaignName: string) => {
    setExpandedCampaigns((prev) =>
      prev.includes(campaignName)
        ? prev.filter((item) => item !== campaignName)
        : [...prev, campaignName]
    );
  };

  const addRuleWith = (nextField: CreativeFilterField, nextOperator: CreativeFilterOperator, nextQuery: string) => {
    const cleanQuery = nextQuery.trim();
    if (!cleanQuery) return;

    onChange([
      ...filters,
      {
        id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        field: nextField,
        operator: nextOperator,
        query: cleanQuery,
      },
    ]);
    setQuery("");
    setSearch("");
    setStep("compose");
    setField(nextField);
    setOperator(nextOperator);
    setFieldMenuOpen(false);
    setOperatorMenuOpen(false);
    setOpen(false);
  };

  const addRule = () => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    addRuleWith(field, operator, cleanQuery);
  };

  const selectedFieldLabel = prettyFieldLabel(field);
  const selectedOperatorLabel = operatorOptions.find((item) => item.value === operator)?.label ?? "contains";

  const removeRule = (ruleId: string) => onChange(filters.filter((rule) => rule.id !== ruleId));

  const openBuilder = (nextField: CreativeFilterField) => {
    setField(nextField);
    setOperator(nextField === "launchDate" ? "equals" : "contains");
    setStep("compose");
    setFieldMenuOpen(false);
    setOperatorMenuOpen(false);
    window.setTimeout(() => queryRef.current?.focus(), 0);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={wrapRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setOpen((prev) => {
              const next = !prev;
              if (next) {
                setStep("compose");
                setField("campaignName");
                setOperator("equals");
                setSearch("");
                setQuery("");
              }
              return next;
            });
          }}
          className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Add filter
        </button>

        {open && (
          <div className="animate-in fade-in-0 slide-in-from-top-1 absolute left-0 top-11 z-50 w-[min(460px,calc(100vw-32px))] max-w-[calc(100vw-32px)] rounded-[28px] border bg-background p-3 shadow-lg duration-150">
            <div className="flex items-center gap-2 rounded-2xl border px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                ref={queryRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search campaigns or ad sets..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div className="mt-2 max-h-80 overflow-auto rounded-2xl border bg-muted/10 p-1.5">
              {campaignGroups.map((group) => {
                const isExpanded = expandedCampaigns.includes(group.campaignName) || query.trim().length > 0;
                return (
                  <div key={group.campaignName} className="rounded-xl">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleCampaignExpanded(group.campaignName)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-accent/50"
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${group.campaignName}`}
                      >
                        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !isExpanded && "-rotate-90")} />
                      </button>
                      <button
                        type="button"
                        onClick={() => addRuleWith("campaignName", "equals", group.campaignName)}
                        className="flex-1 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent/50"
                      >
                        {group.campaignName}
                      </button>
                    </div>
                    {isExpanded && group.adSetNames.length > 0 && (
                      <div className="ml-9 mt-1 space-y-1 border-l pl-3">
                        {group.adSetNames.map((adSetName) => (
                          <button
                            key={`${group.campaignName}-${adSetName}`}
                            type="button"
                            onClick={() => addRuleWith("adSetName", "equals", adSetName)}
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          >
                            {adSetName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {campaignGroups.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No campaigns found.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {filters.map((rule) => (
        <span key={rule.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/20 px-3 py-2 text-xs">
          {prettyFieldLabel(rule.field)} {prettyOperatorLabel(rule.operator ?? "contains")} {rule.query}
          <button type="button" onClick={() => removeRule(rule.id)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

function TopExportDropdown({
  onShareExport,
  onCsvExport,
  shareLoading,
  csvLoading,
  shareUrl,
  shareError,
  csvError,
}: {
  onShareExport: () => void;
  onCsvExport: () => void;
  shareLoading: boolean;
  csvLoading: boolean;
  shareUrl: string | null;
  shareError: string | null;
  csvError: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useDropdownBehavior({
    id: "top-export",
    open,
    setOpen,
    containerRef: wrapRef,
    triggerRef,
  });

  const copyShareUrl = async () => {
    if (!shareUrl || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs"
      >
        Export
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 absolute right-0 top-11 z-50 w-[290px] rounded-xl border bg-background p-3 shadow-lg duration-150">
          <button
            type="button"
            onClick={onShareExport}
            disabled={shareLoading}
            className="flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-xs hover:bg-accent/60 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5" />
              {shareLoading ? "Generating link..." : "Share link"}
            </span>
          </button>

          <button
            type="button"
            onClick={onCsvExport}
            disabled={csvLoading}
            className="mt-2 flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-xs hover:bg-accent/60 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              <FileDown className="h-3.5 w-3.5" />
              {csvLoading ? "Exporting CSV..." : "Export CSV"}
            </span>
          </button>

          {shareUrl && (
            <div className="mt-2 space-y-1 rounded-md border bg-muted/30 p-2">
              <p className="text-[11px] text-muted-foreground">Share link ready</p>
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}${shareUrl}`}
                  className="h-7 flex-1 rounded border bg-background px-2 text-[11px] text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={copyShareUrl}
                  className="inline-flex h-7 items-center gap-1 rounded border px-2 text-[11px]"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {shareError ? <p className="mt-2 text-[11px] text-red-600">{shareError}</p> : null}
          {csvError ? <p className="mt-1 text-[11px] text-red-600">{csvError}</p> : null}
        </div>
      )}
    </div>
  );
}

function MetricSelectorBar({ selectedMetricIds, onChange }: { selectedMetricIds: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const insideRefs = useMemo(() => [popoverRef], []);

  useDropdownBehavior({
    id: "top-add-metric",
    open,
    setOpen,
    containerRef: wrapRef,
    triggerRef,
    focusRef: searchRef,
    insideRefs,
    closeOnScroll: false,
  });

  const selectedDefs = selectedMetricIds
    .map((id) => getCreativeMetricDefinition(id))
    .filter(Boolean) as CreativeMetricDefinition[];

  const selectedMetricIdSet = useMemo(() => new Set(selectedMetricIds), [selectedMetricIds]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return METRIC_DEFS;
    return METRIC_DEFS.filter((metric) => metric.label.toLowerCase().includes(normalizedQuery));
  }, [query]);

  const toggleMetric = (metricId: string) => {
    const exists = selectedMetricIdSet.has(metricId);
    onChange(exists ? selectedMetricIds.filter((id) => id !== metricId) : [...selectedMetricIds, metricId]);
  };

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = 290;
      const viewportPadding = 8;
      const rawLeft = rect.left;
      const clampedLeft = Math.min(
        window.innerWidth - panelWidth - viewportPadding,
        Math.max(viewportPadding, rawLeft)
      );
      const nextTop = rect.bottom + 8;
      const panelHeight = popoverRef.current?.offsetHeight ?? 0;
      const overflowsBottom = nextTop + panelHeight > window.innerHeight - viewportPadding;
      const top = overflowsBottom ? Math.max(viewportPadding, rect.top - panelHeight - 8) : nextTop;
      setPanelPosition({ top, left: clampedLeft });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, query, filtered.length]);

  return (
    <div className="min-w-0 overflow-visible">
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

          {open && typeof document !== "undefined" && createPortal(
            <div
              ref={popoverRef}
              className="animate-in fade-in-0 slide-in-from-top-1 fixed z-[180] w-[290px] rounded-lg border bg-background p-2.5 shadow-lg duration-150"
              style={{ top: panelPosition.top, left: panelPosition.left }}
            >
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

              <div className="max-h-64 space-y-1 overflow-auto pr-1">
                {filtered.map((metric) => {
                  const isSelected = selectedMetricIdSet.has(metric.id);
                  return (
                  <button
                    key={metric.id}
                    type="button"
                    onClick={() => toggleMetric(metric.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs",
                      isSelected ? "bg-accent/70" : "hover:bg-accent/60"
                    )}
                  >
                    <span className="truncate pr-2">{metric.label}</span>
                    <span
                      className={cn(
                        "inline-flex h-4 w-4 items-center justify-center rounded-sm border",
                        isSelected ? "border-emerald-500 bg-emerald-500/15 text-emerald-700" : "border-muted-foreground/40 text-transparent"
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">No metrics found.</p>
                )}
              </div>
            </div>,
            document.body
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
  defaultCurrency,
  onOpenRow,
  previewMode = "media",
  getPreviewCopyText,
  previewStripState = "ready",
  previewStripSummary,
}: {
  rows: MetaCreativeRow[];
  metrics: CreativeMetricDefinition[];
  allRowsForHeatmap: MetaCreativeRow[];
  defaultCurrency: string | null;
  onOpenRow: (rowId: string) => void;
  previewMode?: "media" | "copy";
  getPreviewCopyText?: (row: MetaCreativeRow) => string;
  previewStripState?: "data_loading" | "media_hydrating" | "ready" | "missing";
  previewStripSummary?: {
    total: number;
    ready: number;
    pending: number;
    missing: number;
    minimumReady: number;
  };
}) {
  if (previewStripState === "data_loading" || previewStripState === "media_hydrating") {
    const helperText =
      previewStripState === "data_loading"
        ? "Fetching creatives and media previews from Meta"
        : "Preparing preview cards";

    return (
      <div className="min-h-[280px] rounded-xl border border-dashed bg-muted/10 px-4 py-8">
        <div className="mx-auto flex min-h-[248px] max-w-xl flex-col items-center justify-center text-center">
          <p className="text-sm font-medium text-foreground">Waiting for Facebook...</p>
          <div className="mt-4 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-200/80">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-slate-500/70" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{helperText}</p>
          {previewStripSummary ? (
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              {previewStripSummary.total > 0
                ? `${previewStripSummary.ready} of ${previewStripSummary.total} top creatives are preview-ready so far.`
                : "Waiting for your top creatives selection to finish loading."}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (previewStripState === "missing") {
    return (
      <div className="rounded-xl border border-dashed bg-muted/10 px-4 py-5">
        <p className="text-sm font-medium text-foreground">Preview cards unavailable for this selection</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {previewStripSummary?.total === 0
            ? "No creatives are available for the selected range yet, so preview cards cannot be prepared."
            : previewStripSummary?.missing
            ? `${previewStripSummary.missing} selected creatives do not have a usable preview from Meta right now.`
            : "Meta did not return usable preview media for the current top creatives."}
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        Select creatives in the table to populate this strip.
      </div>
    );
  }

  const context = useMemo<CreativeMetricContext>(
    () => ({
      totalSpend: rows.reduce((sum, row) => sum + row.spend, 0),
      totalPurchaseValue: rows.reduce((sum, row) => sum + row.purchaseValue, 0),
    }),
    [rows]
  );

  const metricAverages = useMemo(() => {
    return metrics.reduce<Record<string, number>>((acc, metric) => {
      const sourceRows = allRowsForHeatmap.length > 0 ? allRowsForHeatmap : rows;
      const values = sourceRows
        .map((row) => metric.getValue(row, context))
        .filter((value) => Number.isFinite(value));
      acc[metric.id] = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return acc;
    }, {});
  }, [allRowsForHeatmap, context, metrics, rows]);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-3">
        {rows.map((row) => {
          const assetFallbacks = [
            row.cardPreviewUrl ?? null,
            row.tableThumbnailUrl ?? null,
            row.imageUrl ?? null,
            row.preview?.image_url ?? null,
            row.preview?.poster_url ?? null,
            row.previewUrl ?? null,
            row.cachedThumbnailUrl ?? null,
            row.thumbnailUrl ?? null,
          ];
          if (process.env.NODE_ENV !== "production" && topRowPropLogCount < 20) {
            topRowPropLogCount += 1;
            console.log("[motion-top][row-props]", {
              id: row.id,
              name: row.name,
              cardPreviewUrl: row.cardPreviewUrl ?? null,
              tableThumbnailUrl: row.tableThumbnailUrl ?? null,
              imageUrl: row.imageUrl ?? null,
              previewUrl: row.previewUrl ?? null,
              preview_image_url: row.preview?.image_url ?? null,
              preview_poster_url: row.preview?.poster_url ?? null,
              preview_render_mode: row.preview?.render_mode ?? null,
              assetFallbacks,
            });
          }
          const resolvedRowCurrency = resolveCreativeCurrency(row.currency, defaultCurrency);
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onOpenRow(row.id)}
              className={cn(
                "group shrink-0 overflow-hidden rounded-xl border bg-background text-left transition-shadow hover:shadow-md hover:ring-1 hover:ring-border",
                previewMode === "copy" ? "w-[280px]" : "w-[190px]"
              )}
            >
              {previewMode === "copy" ? (
                <div className="h-[164px] w-full border-b bg-muted/15 px-3 py-3">
                  <p className="line-clamp-6 text-[12px] leading-5 text-foreground/95">
                    {getPreviewCopyText?.(row) ?? row.name}
                  </p>
                </div>
              ) : (
                <div className="relative aspect-square w-full overflow-hidden bg-muted/20">
                  <CreativeRenderSurface
                    id={row.id}
                    name={row.name}
                    preview={row.preview}
                    size="card"
                    mode="asset"
                    assetFallbacks={assetFallbacks}
                    className="aspect-square w-full"
                  />
                </div>
              )}

              <div className="px-3 pb-3 pt-2.5">
                <p className="line-clamp-2 text-[12px] font-semibold leading-4">{row.name}</p>
                <div className="mt-2 space-y-0.5">
                  {metrics.map((metric) => {
                    const value = metric.getValue(row, context);
                    const average = metricAverages[metric.id] ?? value;
                    const heat = resolveAverageHeatColor(metric.direction, value, average);

                    return (
                      <div key={metric.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <p className="truncate text-muted-foreground">{metric.label}</p>
                        <span
                          className="rounded-full px-1.5 py-0.5 font-semibold tabular-nums"
                          style={{ backgroundColor: heat }}
                        >
                          {metric.format(value, resolvedRowCurrency, defaultCurrency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </button>
          );
        })}
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

export {
  applyCreativeFilters,
  DEFAULT_COPY_TOP_METRIC_IDS,
  DEFAULT_CREATIVE_DATE_RANGE,
  DEFAULT_TOP_METRIC_IDS,
  formatCreativeDateLabel,
  mapCreativeGroupByToApi,
  resolveCreativeDateRange,
};
