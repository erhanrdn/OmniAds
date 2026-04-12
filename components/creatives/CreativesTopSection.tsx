"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, ChevronDown, ChevronRight, X, Search, Plus, SlidersHorizontal, LayoutGrid, Ellipsis, Check, Copy, FileDown, Link2 } from "lucide-react";
import { createPortal } from "react-dom";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { CreativeRenderSurface } from "@/components/creatives/CreativeRenderSurface";
import { OperatorSurfaceSummary } from "@/components/operator/OperatorSurfaceSummary";
import {
  buildCreativeOperatorSurfaceModel,
  buildCreativePreviewTruthSummary,
  type CreativePreviewTruthSummary,
  type CreativeQuickFilter,
  type CreativeQuickFilterKey,
} from "@/lib/creative-operator-surface";
import type { CreativeDecisionOsV1Response } from "@/lib/creative-decision-os";
import {
  calculateCreativeAverageOrderValue,
  calculateCreativeClickToAddToCartRate,
  calculateCreativeClickToPurchaseRate,
  calculateCreativeCpcAll,
  calculateCreativeLinkCtr,
  calculateCreativePurchaseValueShare,
  calculateCreativePurchasesPer1000Impressions,
  calculateCreativeRevenuePer1000Impressions,
  calculateCreativeSpendShare,
} from "@/components/creatives/creative-truth";
import { resolveCreativeCurrency } from "@/components/creatives/money";
import { getCreativeFormatSummaryLabel } from "@/lib/meta/creative-taxonomy";
import { getCreativeStaticPreviewSources, getCreativeStaticPreviewState } from "@/lib/meta/creatives-preview";
import {
  applyCreativeFilters,
  buildMonthGrid,
  creativeDateRangeToStandard,
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
  standardDateRangeToCreative,
} from "@/components/creatives/creatives-top-section-support";
import { DateRangePicker } from "@/components/date-range/DateRangePicker";
import { cn } from "@/lib/utils";
import { useDropdownBehavior } from "@/hooks/use-dropdown-behavior";
import type { ReactNode } from "react";

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
  | "creativePrimaryLabel"
  | "creativeSecondaryLabel"
  | "creativeVisualFormat"
  | "creativeDeliveryType"
  | "taxonomySource"
  | "isCatalog"
  | "lifecycleState"
  | "primaryAction"
  | "surfaceLane"
  | "familySource"
  | "deploymentTargetLane"
  | "deploymentCompatibilityStatus"
  | "namingConvention"
  | "customTags"
  | "assetType"
  | "visualFormat"
  | "intendedAudience"
  | "messagingAngle"
  | "seasonality"
  | "offerType"
  | "hookTactic"
  | "headlineTactic";

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
  businessId?: string;
  showHeader?: boolean;
  showGroupByControl?: boolean;
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
  previewStripState?: "data_loading" | "ready" | "missing";
  showAiActionsRow?: boolean;
  previewStripSummary?: {
    total: number;
    ready: number;
    pending: number;
    missing: number;
    minimumReady: number;
  };
  actionsPrefix?: ReactNode;
  decisionOs?: CreativeDecisionOsV1Response | null;
  quickFilters?: CreativeQuickFilter[];
  activeQuickFilterKey?: CreativeQuickFilterKey | null;
  onToggleQuickFilter?: (key: CreativeQuickFilterKey) => void;
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

function PreviewStripMediaSurface({
  row,
  assetState,
  assetFallbacks,
  assetUpgradeSources,
  shouldUnlockPreview,
  onAdvance,
}: {
  row: MetaCreativeRow;
  assetState: "ready" | "pending" | "missing";
  assetFallbacks: Array<string | null>;
  assetUpgradeSources: Array<string | null>;
  shouldUnlockPreview: boolean;
  onAdvance: () => void;
}) {
  return shouldUnlockPreview ? (
    <CreativeRenderSurface
      id={row.id}
      name={row.name}
      preview={row.preview}
      size="card"
      mode="asset"
      assetState={assetState}
      assetFallbacks={assetFallbacks}
      assetUpgradeSources={assetUpgradeSources}
      pendingLabel="Waiting for Meta"
      className="aspect-square w-full"
      onAssetSettled={onAdvance}
    />
  ) : (
    <div className="h-full w-full animate-pulse bg-gradient-to-br from-slate-100 to-slate-200" />
  );
}

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
    label: "Taxonomy",
    children: [
      { label: "Primary label", value: "creativePrimaryLabel" },
      { label: "Secondary label", value: "creativeSecondaryLabel" },
      { label: "Visual format", value: "creativeVisualFormat" },
      { label: "Delivery type", value: "creativeDeliveryType" },
      { label: "Taxonomy source", value: "taxonomySource" },
      { label: "Is catalog", value: "isCatalog" },
    ],
  },
  {
    label: "Decision OS",
    children: [
      { label: "Lifecycle state", value: "lifecycleState" },
      { label: "Primary action", value: "primaryAction" },
      { label: "Surface lane", value: "surfaceLane" },
      { label: "Family source", value: "familySource" },
      { label: "Deployment lane", value: "deploymentTargetLane" },
      { label: "Compatibility status", value: "deploymentCompatibilityStatus" },
    ],
  },
  {
    label: "AI tags",
    children: [
      { label: "Asset type", value: "assetType" },
      { label: "Visual format", value: "visualFormat" },
      { label: "Intended audience", value: "intendedAudience" },
      { label: "Messaging angle", value: "messagingAngle" },
      { label: "Seasonality", value: "seasonality" },
      { label: "Offer type", value: "offerType" },
      { label: "Hook tactic", value: "hookTactic" },
      { label: "Headline tactic", value: "headlineTactic" },
    ],
  },
  {
    label: "Performance",
    children: [{ label: "Performance metrics", value: "performanceMetrics" }],
  },
  {
    label: "Other",
    children: [
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

function quickFilterToneClasses(
  filter: CreativeQuickFilter,
  active: boolean,
) {
  if (filter.tone === "act_now") {
    return active
      ? "border-emerald-700 bg-emerald-700 text-white"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  }
  if (filter.tone === "needs_truth") {
    return active
      ? "border-amber-600 bg-amber-600 text-white"
      : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100";
  }
  if (filter.tone === "blocked") {
    return active
      ? "border-orange-600 bg-orange-600 text-white"
      : "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100";
  }
  if (filter.tone === "watch") {
    return active
      ? "border-sky-600 bg-sky-600 text-white"
      : "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100";
  }
  return active
    ? "border-slate-700 bg-slate-700 text-white"
    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100";
}

function previewTruthTone(summary: CreativePreviewTruthSummary | null | undefined) {
  if (!summary || summary.state === "ready") {
    return {
      panel: "border-emerald-200 bg-emerald-50/70",
      badge: "border-emerald-200 bg-emerald-100 text-emerald-900",
      stat: "border-emerald-200 bg-white",
    };
  }
  if (summary.state === "missing") {
    return {
      panel: "border-rose-200 bg-rose-50/70",
      badge: "border-rose-200 bg-rose-100 text-rose-900",
      stat: "border-rose-200 bg-white",
    };
  }
  return {
    panel: "border-amber-200 bg-amber-50/70",
    badge: "border-amber-200 bg-amber-100 text-amber-900",
    stat: "border-amber-200 bg-white",
  };
}

const METRIC_DEFS: CreativeMetricDefinition[] = [
  { id: "spend", label: "Spend", direction: "neutral", format: fmtCurrency, getValue: (r) => r.spend },
  { id: "roas", label: "ROAS", direction: "high", format: (n) => n.toFixed(2), getValue: (r) => r.roas },
  { id: "hookScore", label: "Hook proxy (thumbstop)", direction: "high", format: fmtPercent, getValue: (r) => r.thumbstop },
  {
    id: "purchaseValueShare",
    label: "% purchase value",
    direction: "high",
    format: fmtPercent,
    getValue: (r, c) => calculateCreativePurchaseValueShare(r, c.totalPurchaseValue),
  },
  { id: "purchases", label: "Purchases", direction: "high", format: fmtInteger, getValue: (r) => r.purchases },
  { id: "purchaseValue", label: "Purchase value", direction: "high", format: fmtCurrency, getValue: (r) => r.purchaseValue },
  { id: "costPerPurchase", label: "Cost per purchase", direction: "low", format: fmtCurrency, getValue: (r) => r.cpa },
  { id: "costPerLinkClick", label: "Cost per link click", direction: "low", format: fmtCurrency, getValue: (r) => r.cpcLink },
  { id: "costPerMille", label: "Cost per mille", direction: "low", format: fmtCurrency, getValue: (r) => r.cpm },
  { id: "costPerClickAll", label: "Cost per click (all)", direction: "low", format: fmtCurrency, getValue: (r) => calculateCreativeCpcAll(r) },
  {
    id: "averageOrderValue",
    label: "Average order value",
    direction: "high",
    format: fmtCurrency,
    getValue: (r) => calculateCreativeAverageOrderValue(r),
  },
  { id: "clickToAtcRatio", label: "Click to add-to-cart ratio", direction: "high", format: fmtPercent, getValue: (r) => calculateCreativeClickToAddToCartRate(r) },
  { id: "atcToPurchaseRatio", label: "Add-to-cart to purchase ratio", direction: "high", format: fmtPercent, getValue: (r) => r.atcToPurchaseRatio },
  { id: "firstFrameRetention", label: "First-impression proxy (thumbstop)", direction: "high", format: fmtPercent, getValue: (r) => r.thumbstop },
  { id: "thumbstopRatio", label: "Thumbstop ratio", direction: "high", format: fmtPercent, getValue: (r) => r.thumbstop },
  { id: "ctrOutbound", label: "Link CTR (compat)", direction: "high", format: fmtPercent, getValue: (r) => calculateCreativeLinkCtr(r) },
  { id: "clickToPurchaseRatio", label: "Click to purchase ratio", direction: "high", format: fmtPercent, getValue: (r) => calculateCreativeClickToPurchaseRate(r) },
  { id: "seeMoreRate", label: "See more rate", direction: "high", format: fmtPercent, getValue: (r) => r.seeMoreRate },
  { id: "ctrAll", label: "Click through rate (all)", direction: "high", format: fmtPercent, getValue: (r) => r.ctrAll },
  { id: "video25Rate", label: "25% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video25 },
  { id: "video50Rate", label: "50% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video50 },
  { id: "video75Rate", label: "75% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video75 },
  { id: "video100Rate", label: "100% video plays (rate)", direction: "high", format: fmtPercent, getValue: (r) => r.video100 },
  { id: "holdRate", label: "Completion proxy (100% plays)", direction: "high", format: fmtPercent, getValue: (r) => r.video100 },
  { id: "watchScore", label: "Watch proxy (50% plays)", direction: "high", format: fmtPercent, getValue: (r) => r.video50 },
  { id: "clickScore", label: "Click proxy (CTR all x10)", direction: "high", format: (n) => n.toFixed(2), getValue: (r) => r.ctrAll * 10 },
  { id: "convertScore", label: "Conversion proxy (ROAS x10)", direction: "high", format: (n) => n.toFixed(2), getValue: (r) => r.roas * 10 },
  {
    id: "averageOrderValueWebsite",
    label: "Average order value (website)",
    direction: "high",
    format: fmtCurrency,
    getValue: (r) => calculateCreativeAverageOrderValue(r),
  },
  {
    id: "impressions",
    label: "Impressions",
    direction: "high",
    format: fmtInteger,
    getValue: (r) => r.impressions,
  },
  {
    id: "spendShare",
    label: "% spend",
    direction: "neutral",
    format: fmtPercent,
    getValue: (r, c) => calculateCreativeSpendShare(r, c.totalSpend),
  },
  {
    id: "linkCtr",
    label: "Link CTR",
    direction: "high",
    format: fmtPercent,
    getValue: (r) => calculateCreativeLinkCtr(r),
  },
  { id: "websitePurchaseRoas", label: "Website purchase ROAS", direction: "high", format: (n) => n.toFixed(2), getValue: (r) => r.roas },
  { id: "clickToWebsitePurchaseRatio", label: "Click to website purchase ratio", direction: "high", format: fmtPercent, getValue: (r) => calculateCreativeClickToPurchaseRate(r) },
  {
    id: "purchasesPer1000Imp",
    label: "Purchases per 1,000 impressions",
    direction: "high",
    format: (n) => n.toFixed(2),
    getValue: (r) => calculateCreativePurchasesPer1000Impressions(r),
  },
  {
    id: "revenuePer1000Imp",
    label: "Revenue per 1,000 impressions",
    direction: "high",
    format: fmtCurrency,
    getValue: (r) => calculateCreativeRevenuePer1000Impressions(r),
  },
  {
    id: "clicksAll",
    label: "Clicks (all)",
    direction: "high",
    format: fmtInteger,
    getValue: (r) => r.clicks,
  },
  {
    id: "linkClicks",
    label: "Link clicks",
    direction: "high",
    format: fmtInteger,
    getValue: (r) => r.linkClicks,
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
  businessId,
  showHeader = true,
  showGroupByControl = true,
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
  actionsPrefix,
  decisionOs,
  quickFilters = [],
  activeQuickFilterKey = null,
  onToggleQuickFilter,
}: CreativesTopSectionProps) {
  const metricDefs = useMemo(
    () => selectedMetricIds.map((id) => CREATIVE_METRIC_MAP[id]).filter(Boolean) as CreativeMetricDefinition[],
    [selectedMetricIds]
  );
  const operatorSurface = useMemo(
    () =>
      buildCreativeOperatorSurfaceModel(decisionOs ?? null, {
        visibleIds: new Set(allRowsForHeatmap.map((row) => row.id)),
      }),
    [allRowsForHeatmap, decisionOs]
  );
  const topRows = useMemo(() => selectedRows, [selectedRows]);
  const previewTruthSummary = useMemo(
    () =>
      buildCreativePreviewTruthSummary(decisionOs ?? null, {
        creativeIds: allRowsForHeatmap.map((row) => row.id),
      }),
    [allRowsForHeatmap, decisionOs]
  );
  const selectedPreviewTruthSummary = useMemo(
    () =>
      topRows.length > 0
        ? buildCreativePreviewTruthSummary(decisionOs ?? null, {
            creativeIds: topRows.map((row) => row.id),
          })
        : null,
    [decisionOs, topRows]
  );
  const previewTruthClasses = previewTruthTone(previewTruthSummary);

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

          {showGroupByControl ? (
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
          ) : null}

          <AddFilterDropdown
            filters={filters}
            rows={allRowsForHeatmap}
            decisionOs={decisionOs ?? null}
            onChange={onFiltersChange}
          />

          <div className="ml-auto flex items-center gap-2">
            {actionsPrefix}
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

      {(previewTruthSummary || quickFilters.length > 0) ? (
        <section
          className={cn("mt-4 rounded-2xl border p-4 shadow-sm", previewTruthClasses.panel)}
          data-testid="creative-preview-truth-contract"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Preview Truth Contract
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                {previewTruthSummary?.headline ?? "Preview truth is still being prepared for this review scope."}
              </h3>
              <p className="mt-1 text-sm text-slate-700">
                {previewTruthSummary?.summary ??
                  "Authoritative creative action depends on preview readiness before the row can read as decisive work."}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Ready preview media supports decisive action language. Degraded preview keeps review metrics-only. Missing preview blocks authoritative action.
              </p>
            </div>
            <span
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                previewTruthClasses.badge,
              )}
            >
              {previewTruthSummary?.state === "ready"
                ? "Preview ready"
                : previewTruthSummary?.state === "missing"
                  ? "Preview missing"
                  : "Preview gated"}
            </span>
          </div>

          {previewTruthSummary ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                ["Ready", previewTruthSummary.readyCount],
                ["Degraded", previewTruthSummary.degradedCount],
                ["Missing", previewTruthSummary.missingCount],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className={cn("rounded-2xl border px-4 py-3", previewTruthClasses.stat)}
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {selectedPreviewTruthSummary ? (
            <div className="mt-4 rounded-2xl border border-white/60 bg-white/80 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Current workspace
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {selectedPreviewTruthSummary.readyCount} ready · {selectedPreviewTruthSummary.degradedCount} degraded · {selectedPreviewTruthSummary.missingCount} missing
              </p>
              <p className="mt-1 text-xs text-slate-600">
                The preview strip and table now follow this truth before they read as clean operator action.
              </p>
            </div>
          ) : null}

          {quickFilters.length > 0 ? (
            <div className="mt-4 space-y-2" data-testid="creative-quick-filters-panel">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Decision Path
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Scan action first, then truth-capped, test-only, blocked, and protected rows in one order.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 lg:grid-cols-5" data-testid="creative-quick-filters">
                {quickFilters.map((filter) => {
                  const active = activeQuickFilterKey === filter.key;
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => onToggleQuickFilter?.(filter.key)}
                      data-testid={`creative-quick-filter-${filter.key}`}
                      className={cn(
                        "rounded-2xl border p-3 text-left transition-colors",
                        quickFilterToneClasses(filter, active),
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{filter.label}</p>
                          <p className="mt-1 text-xs opacity-85">{filter.summary}</p>
                        </div>
                        <span className={cn("rounded-full px-2 py-1 text-[11px] font-semibold", active ? "bg-white/20" : "bg-black/5")}>
                          {filter.count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <OperatorSurfaceSummary model={operatorSurface} className="mt-4" maxRowsPerBucket={2} />

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
          businessId={businessId}
          rows={topRows}
          metrics={metricDefs}
          allRowsForHeatmap={allRowsForHeatmap}
          defaultCurrency={defaultCurrency}
          onOpenRow={onOpenRow}
          previewMode={previewMode}
          getPreviewCopyText={getPreviewCopyText}
          previewStripState={previewStripState}
          previewStripSummary={previewStripSummary}
          previewTruthSummary={selectedPreviewTruthSummary}
        />
      </div>
    </section>
  );
}

function CreativeDateRangePicker({ value, onChange }: { value: CreativeDateRangeValue; onChange: (next: CreativeDateRangeValue) => void }) {
  return (
    <DateRangePicker
      value={creativeDateRangeToStandard(value)}
      onChange={(next) => onChange(standardDateRangeToCreative(next))}
      showComparisonTrigger={false}
      rangePresets={["today", "yesterday", "7d", "14d", "30d", "365d", "lastMonth", "custom"]}
    />
  );
}

function AddFilterDropdown({
  filters,
  rows,
  decisionOs,
  onChange,
}: {
  filters: CreativeFilterRule[];
  rows: MetaCreativeRow[];
  decisionOs: CreativeDecisionOsV1Response | null;
  onChange: (next: CreativeFilterRule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<CreativeFilterField>("campaignName");
  const [operator, setOperator] = useState<CreativeFilterOperator>("contains");
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  useDropdownBehavior({
    id: "top-add-filter",
    open,
    setOpen,
    containerRef: wrapRef,
    triggerRef,
    focusRef: queryRef,
  });

  const filterOptions = useMemo(
    () =>
      FILTER_TREE.flatMap((group) =>
        group.children.map((child) => ({
          ...child,
          groupLabel: group.label,
        })),
      ),
    [],
  );

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
      case "creativePrimaryLabel":
        return collect(rows.map((row) => row.creativePrimaryLabel));
      case "creativeSecondaryLabel":
        return collect(rows.map((row) => row.creativeSecondaryLabel));
      case "creativeVisualFormat":
        return collect(rows.map((row) => row.creativeVisualFormat));
      case "creativeDeliveryType":
        return collect(rows.map((row) => row.creativeDeliveryType));
      case "taxonomySource":
        return collect(rows.map((row) => row.taxonomySource ?? null));
      case "isCatalog":
        return ["true", "false"];
      case "lifecycleState":
        return collect(decisionOs?.creatives.map((creative) => creative.lifecycleState) ?? []);
      case "primaryAction":
        return collect(decisionOs?.creatives.map((creative) => creative.primaryAction) ?? []);
      case "surfaceLane":
        return collect(decisionOs?.creatives.map((creative) => creative.trust.surfaceLane) ?? []);
      case "familySource":
        return collect(decisionOs?.creatives.map((creative) => creative.familySource) ?? []);
      case "deploymentTargetLane":
        return collect(decisionOs?.creatives.map((creative) => creative.deployment.targetLane) ?? []);
      case "deploymentCompatibilityStatus":
        return collect(
          decisionOs?.creatives.map((creative) => creative.deployment.compatibility.status) ?? [],
        );
      case "assetType":
      case "visualFormat":
      case "intendedAudience":
      case "messagingAngle":
      case "seasonality":
      case "offerType":
      case "hookTactic":
      case "headlineTactic":
        return collect(rows.flatMap((row) => row.aiTags?.[field] ?? []));
      default:
        return collect(rows.flatMap((row) => row.tags ?? []));
    }
  }, [decisionOs, field, rows]);

  const filteredSuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return fieldSuggestions.slice(0, 8);
    return fieldSuggestions.filter((value) => value.toLowerCase().includes(normalizedQuery)).slice(0, 8);
  }, [fieldSuggestions, query]);

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
    setField(nextField);
    setOperator(nextOperator);
    setOpen(false);
  };

  const addRule = () => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    addRuleWith(field, operator, cleanQuery);
  };

  const removeRule = (ruleId: string) => onChange(filters.filter((rule) => rule.id !== ruleId));

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
                setField("campaignName");
                setOperator("equals");
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
          <div className="animate-in fade-in-0 slide-in-from-top-1 absolute left-0 top-11 z-50 w-[min(520px,calc(100vw-32px))] max-w-[calc(100vw-32px)] rounded-[28px] border bg-background p-3 shadow-lg duration-150">
            <div className="grid gap-2 md:grid-cols-[1.15fr_0.9fr_1.15fr_auto]">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Field
                </span>
                <select
                  value={field}
                  onChange={(event) => {
                    const nextField = event.target.value as CreativeFilterField;
                    setField(nextField);
                    setOperator(nextField === "launchDate" ? "equals" : "contains");
                    setQuery("");
                  }}
                  className="h-10 w-full rounded-2xl border bg-background px-3 text-sm outline-none"
                >
                  {FILTER_TREE.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.children.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Operator
                </span>
                <select
                  value={operator}
                  onChange={(event) => setOperator(event.target.value as CreativeFilterOperator)}
                  className="h-10 w-full rounded-2xl border bg-background px-3 text-sm outline-none"
                >
                  {operatorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Query
                </span>
                <div className="flex items-center gap-2 rounded-2xl border px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    ref={queryRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`Filter by ${prettyFieldLabel(field).toLowerCase()}`}
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={addRule}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-900 bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  disabled={!query.trim()}
                >
                  Add
                </button>
              </div>
            </div>

            {filteredSuggestions.length > 0 ? (
              <div className="mt-2 rounded-2xl border bg-muted/10 p-2">
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Suggestions
                </p>
                <div className="flex flex-wrap gap-2">
                  {filteredSuggestions.map((suggestion) => (
                    <button
                      key={`${field}-${suggestion}`}
                      type="button"
                      onClick={() => addRuleWith(field, operator, suggestion)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-2 rounded-2xl border bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600">
              Decision OS filters are deterministic. AI tag filters use tag values only and do not rewrite taxonomy.
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
  businessId,
  rows,
  metrics,
  allRowsForHeatmap,
  defaultCurrency,
  onOpenRow,
  previewMode = "media",
  getPreviewCopyText,
  previewStripState = "ready",
  previewStripSummary,
  previewTruthSummary,
}: {
  businessId?: string;
  rows: MetaCreativeRow[];
  metrics: CreativeMetricDefinition[];
  allRowsForHeatmap: MetaCreativeRow[];
  defaultCurrency: string | null;
  onOpenRow: (rowId: string) => void;
  previewMode?: "media" | "copy";
  getPreviewCopyText?: (row: MetaCreativeRow) => string;
  previewStripState?: "data_loading" | "ready" | "missing";
  previewStripSummary?: {
    total: number;
    ready: number;
    pending: number;
    missing: number;
    minimumReady: number;
  };
  previewTruthSummary?: CreativePreviewTruthSummary | null;
}) {
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

  const rowSignature = useMemo(() => rows.map((row) => row.id).join("|"), [rows]);
  const [unlockedPreviewCount, setUnlockedPreviewCount] = useState(
    previewMode === "media" && rows.length > 0 ? 1 : rows.length
  );

  useEffect(() => {
    setUnlockedPreviewCount(previewMode === "media" && rows.length > 0 ? 1 : rows.length);
  }, [previewMode, rowSignature, rows.length]);

  useEffect(() => {
    if (previewMode !== "media") return;
    if (rows.length === 0) return;
    if (previewStripState === "data_loading" || previewStripState === "missing") return;
    if (unlockedPreviewCount >= rows.length) return;

    const settleTimer = window.setTimeout(() => {
      setUnlockedPreviewCount((prev) =>
        prev >= rows.length ? prev : Math.min(rows.length, prev + 1)
      );
    }, 400);

    return () => window.clearTimeout(settleTimer);
  }, [previewMode, previewStripState, rows.length, unlockedPreviewCount]);

  if (previewStripState === "data_loading") {
    return (
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`creative-preview-skeleton-${index}`}
              className="w-[190px] shrink-0 overflow-hidden rounded-xl border bg-background"
            >
              <div className="aspect-square w-full animate-pulse bg-gradient-to-br from-slate-100 to-slate-200" />
              <div className="space-y-2 px-3 pb-3 pt-2.5">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (previewStripState === "missing") {
    return (
      <div className="rounded-xl border border-dashed bg-muted/10 px-4 py-5">
        <p className="text-sm font-medium text-foreground">Preview truth blocks clean review for this selection</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {previewTruthSummary
            ? `${previewTruthSummary.readyCount} ready · ${previewTruthSummary.degradedCount} degraded · ${previewTruthSummary.missingCount} missing. Missing preview truth blocks authoritative review until Meta returns usable media.`
            : previewStripSummary?.total === 0
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

  return (
    <div className="overflow-x-auto pb-1">
      {previewTruthSummary ? (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Selected Preview Truth
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {previewTruthSummary.headline}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-700">
              <span>Ready {previewTruthSummary.readyCount}</span>
              <span>Degraded {previewTruthSummary.degradedCount}</span>
              <span>Missing {previewTruthSummary.missingCount}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Decisive action language only applies to ready rows. Degraded rows stay metrics-only, and missing rows stay blocked.
          </p>
        </div>
      ) : null}
      <div className="flex min-w-max gap-3">
        {rows.map((row, index) => {
          const assetFallbacks = getCreativeStaticPreviewSources(row, "grid");
          const assetUpgradeSources = assetFallbacks;
          const assetState = getCreativeStaticPreviewState(row, "grid");
          const resolvedRowCurrency = resolveCreativeCurrency(row.currency, defaultCurrency);
          const shouldUnlockPreview = previewMode !== "media" || index < unlockedPreviewCount;
          const creativeTypeLabel = getCreativeFormatSummaryLabel({
            creative_delivery_type: row.creativeDeliveryType,
            creative_visual_format: row.creativeVisualFormat,
            creative_primary_type: row.creativePrimaryType,
            creative_primary_label: row.creativePrimaryLabel,
            creative_secondary_type: row.creativeSecondaryType,
            creative_secondary_label: row.creativeSecondaryLabel,
            taxonomy_source: row.taxonomySource ?? null,
          });
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
                  <PreviewStripMediaSurface
                    row={row}
                    assetState={assetState}
                    assetFallbacks={assetFallbacks}
                    assetUpgradeSources={assetUpgradeSources}
                    shouldUnlockPreview={shouldUnlockPreview}
                    onAdvance={() =>
                      setUnlockedPreviewCount((prev) =>
                        prev >= rows.length ? prev : Math.max(prev, index + 2)
                      )
                    }
                  />
                  {creativeTypeLabel ? (
                    <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                      {creativeTypeLabel}
                    </span>
                  ) : null}
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
