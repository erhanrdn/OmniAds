"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { MotionCreativesTableSection } from "@/components/creatives/MotionCreativesTableSection";
import {
  applyMotionFilters,
  DEFAULT_COPY_TOP_METRIC_IDS,
  DEFAULT_MOTION_DATE_RANGE,
  MotionDateRangeValue,
  MotionFilterRule,
  MotionGroupBy,
  MotionTopSection,
  resolveMotionDateRange,
} from "@/components/creatives/MotionTopSection";
import type { MetaCreativeRow, MetaCreativePreview } from "@/components/creatives/metricConfig";
import { useAppStore } from "@/store/app-store";
import { getCopies } from "@/src/services";
import type { Copy } from "@/src/types";

type CopyMotionRow = MetaCreativeRow & {
  copyText: string;
  usedInCampaigns: string[];
  usedInAds: string[];
};

const COPY_GROUP_OPTIONS: Array<{ value: MotionGroupBy; label: string }> = [
  { value: "copy", label: "Copy" },
  { value: "adName", label: "Ad Name" },
  { value: "campaign", label: "Campaign" },
  { value: "adSet", label: "Ad Set" },
];

const COPY_AI_ACTIONS = [
  "Ask me anything",
  "What should I create next?",
  "What's working and what's not",
  "Give me a testing plan",
];

const EMPTY_PREVIEW: MetaCreativePreview = {
  render_mode: "unavailable",
  image_url: null,
  video_url: null,
  poster_url: null,
  source: null,
  is_catalog: false,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toDateRangeFilter(value: MotionDateRangeValue): "7d" | "30d" {
  const { start, end } = resolveMotionDateRange(value);
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const days = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
  return days <= 7 ? "7d" : "30d";
}

function normalizeCopyToRow(copy: Copy): CopyMotionRow {
  const spend = copy.spend;
  const purchaseValue = spend * copy.roas;
  const purchases = Math.max(1, Math.round(purchaseValue / 120));
  const impressions = Math.max(100, Math.round(spend * 180));
  const ctrAll = copy.ctr;
  const linkClicks = Math.max(1, Math.round(impressions * (ctrAll / 100)));
  const cpm = impressions > 0 ? (spend * 1000) / impressions : 0;
  const cpcLink = linkClicks > 0 ? spend / linkClicks : 0;
  const addToCart = Math.max(purchases, Math.round(purchases * 1.9));
  const clickToPurchase = linkClicks > 0 ? (purchases / linkClicks) * 100 : 0;
  const atcToPurchaseRatio = addToCart > 0 ? (purchases / addToCart) * 100 : 0;
  const seeMoreRate = clamp(12 + copy.usageCount * 1.7 + copy.ctr * 2.4, 0, 100);

  return {
    id: copy.id,
    creativeId: copy.id,
    name: copy.headline,
    associatedAdsCount: copy.usageCount,
    accountId: null,
    accountName: null,
    campaignId: null,
    campaignName: copy.usedIn.campaigns[0] ?? null,
    adSetId: null,
    adSetName: copy.usedIn.campaigns[0] ?? null,
    currency: "USD",
    format: "image",
    creativeType: "feed",
    creativeTypeLabel: "Copy",
    thumbnailUrl: null,
    previewUrl: null,
    imageUrl: null,
    tableThumbnailUrl: null,
    cardPreviewUrl: null,
    cachedThumbnailUrl: null,
    isCatalog: false,
    previewState: "unavailable",
    preview: EMPTY_PREVIEW,
    launchDate: copy.updatedAt,
    tags: [copy.platform, copy.objective, copy.status],
    aiTags: {},
    spend,
    purchaseValue,
    roas: copy.roas,
    cpa: purchases > 0 ? spend / purchases : 0,
    cpcLink,
    cpm,
    ctrAll,
    purchases,
    impressions,
    linkClicks,
    addToCart,
    thumbstop: clamp(copy.ctr * 9 + 18, 0, 100),
    clickToPurchase,
    seeMoreRate,
    video25: 0,
    video50: 0,
    video75: 0,
    video100: 0,
    atcToPurchaseRatio,
    copyText: copy.fullText || copy.body || `${copy.headline} ${copy.snippet}`,
    usedInCampaigns: copy.usedIn.campaigns,
    usedInAds: copy.usedIn.ads,
  };
}

function aggregateRows(rows: CopyMotionRow[], groupBy: MotionGroupBy): CopyMotionRow[] {
  if (groupBy === "copy") return rows;

  const grouped = new Map<string, CopyMotionRow[]>();
  for (const row of rows) {
    let key = row.name;
    if (groupBy === "adName") key = row.usedInAds[0] ?? row.name;
    if (groupBy === "campaign") key = row.usedInCampaigns[0] ?? row.name;
    if (groupBy === "adSet") key = row.adSetName ?? row.campaignName ?? row.name;

    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries()).map(([key, bucket], index) => {
    const spend = bucket.reduce((sum, row) => sum + row.spend, 0);
    const purchaseValue = bucket.reduce((sum, row) => sum + row.purchaseValue, 0);
    const purchases = bucket.reduce((sum, row) => sum + row.purchases, 0);
    const impressions = bucket.reduce((sum, row) => sum + row.impressions, 0);
    const linkClicks = bucket.reduce((sum, row) => sum + row.linkClicks, 0);
    const addToCart = bucket.reduce((sum, row) => sum + row.addToCart, 0);
    const usageCount = bucket.reduce((sum, row) => sum + row.associatedAdsCount, 0);
    const avgSeeMore =
      bucket.length > 0
        ? bucket.reduce((sum, row) => sum + row.seeMoreRate, 0) / bucket.length
        : 0;

    const primary = bucket[0];
    const tags = Array.from(new Set(bucket.flatMap((row) => row.tags))).slice(0, 6);

    return {
      ...primary,
      id: `${groupBy}_${index}_${key}`,
      creativeId: `${groupBy}_${index}_${key}`,
      name: key,
      associatedAdsCount: usageCount,
      campaignName: groupBy === "campaign" ? key : primary.campaignName,
      adSetName: groupBy === "adSet" ? key : primary.adSetName,
      launchDate: bucket
        .map((row) => row.launchDate)
        .sort((a, b) => (a > b ? -1 : 1))[0],
      tags,
      spend,
      purchaseValue,
      roas: spend > 0 ? purchaseValue / spend : 0,
      purchases,
      cpa: purchases > 0 ? spend / purchases : 0,
      impressions,
      linkClicks,
      cpm: impressions > 0 ? (spend * 1000) / impressions : 0,
      cpcLink: linkClicks > 0 ? spend / linkClicks : 0,
      ctrAll: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
      addToCart,
      clickToPurchase: linkClicks > 0 ? (purchases / linkClicks) * 100 : 0,
      atcToPurchaseRatio: addToCart > 0 ? (purchases / addToCart) * 100 : 0,
      seeMoreRate: avgSeeMore,
      thumbstop: bucket.length
        ? bucket.reduce((sum, row) => sum + row.thumbstop, 0) / bucket.length
        : 0,
      copyText: bucket
        .map((row) => row.copyText)
        .filter(Boolean)
        .slice(0, 2)
        .join("\n\n"),
      usedInCampaigns: Array.from(new Set(bucket.flatMap((row) => row.usedInCampaigns))),
      usedInAds: Array.from(new Set(bucket.flatMap((row) => row.usedInAds))),
    };
  });
}

export default function CopiesPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businesses = useAppStore((state) => state.businesses);
  const businessId = selectedBusinessId ?? "";
  const selectedBusinessCurrency =
    businesses.find((business) => business.id === selectedBusinessId)?.currency ?? "USD";

  const [dateRangeValue, setDateRangeValue] = useState<MotionDateRangeValue>(
    DEFAULT_MOTION_DATE_RANGE,
  );
  const [groupBy, setGroupBy] = useState<MotionGroupBy>("copy");
  const [topFilters, setTopFilters] = useState<MotionFilterRule[]>([]);
  const [topMetricIds, setTopMetricIds] = useState<string[]>(
    DEFAULT_COPY_TOP_METRIC_IDS,
  );
  const [selectionState, setSelectionState] = useState<{ selectedRowIds: string[] }>({
    selectedRowIds: [],
  });
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const hasInitializedDefaultSelectionRef = useRef(false);
  const hasUserInteractedSelectionRef = useRef(false);

  const copiesQuery = useQuery({
    queryKey: ["copies-motion", businessId, dateRangeValue.preset],
    enabled: Boolean(selectedBusinessId),
    queryFn: () => getCopies(businessId, { dateRange: toDateRangeFilter(dateRangeValue) }),
  });

  const allRows = useMemo(() => {
    const normalized = (copiesQuery.data ?? []).map(normalizeCopyToRow);
    const grouped = aggregateRows(normalized, groupBy);
    return grouped.sort((a, b) => b.spend - a.spend);
  }, [copiesQuery.data, groupBy]);

  const filteredRows = useMemo(
    () => applyMotionFilters(allRows, topFilters),
    [allRows, topFilters],
  );

  useEffect(() => {
    setSelectionState((prev) => {
      const filteredIds = new Set(filteredRows.map((row) => row.id));
      const kept = prev.selectedRowIds.filter((id) => filteredIds.has(id));

      if (
        !hasInitializedDefaultSelectionRef.current &&
        !hasUserInteractedSelectionRef.current &&
        kept.length === 0 &&
        filteredRows.length > 0
      ) {
        hasInitializedDefaultSelectionRef.current = true;
        return { selectedRowIds: filteredRows.slice(0, 5).map((row) => row.id) };
      }

      if (kept.length !== prev.selectedRowIds.length) {
        return { selectedRowIds: kept };
      }

      return prev;
    });
  }, [filteredRows]);

  const selectedRows = useMemo(
    () =>
      filteredRows
        .filter((row) => selectionState.selectedRowIds.includes(row.id))
        .slice(0, 20),
    [filteredRows, selectionState.selectedRowIds],
  );

  const topPanelRows = useMemo(
    () => (selectedRows.length > 0 ? selectedRows : filteredRows.slice(0, 20)),
    [filteredRows, selectedRows],
  );

  const activeDetailRow = useMemo(
    () => filteredRows.find((row) => row.id === detailRowId) ?? null,
    [detailRowId, filteredRows],
  );

  const toggleRowSelection = (rowId: string) => {
    hasUserInteractedSelectionRef.current = true;
    setSelectionState((prev) => ({
      selectedRowIds: prev.selectedRowIds.includes(rowId)
        ? prev.selectedRowIds.filter((id) => id !== rowId)
        : [...prev.selectedRowIds, rowId],
    }));
  };

  const toggleAllRows = () => {
    hasUserInteractedSelectionRef.current = true;
    const allIds = filteredRows.map((row) => row.id);
    setSelectionState((prev) => ({
      selectedRowIds: allIds.every((id) => prev.selectedRowIds.includes(id))
        ? []
        : allIds,
    }));
  };

  if (!selectedBusinessId) return <BusinessEmptyState />;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Copies</h1>
        <p className="text-sm text-muted-foreground">
          Compare copy performance and inspect usage across campaign structure.
        </p>
      </div>

      <MotionTopSection
        showHeader={false}
        title="Top copy"
        description="Compare high-performing ad texts, isolate winning angles, and scale copy that drives efficient purchases."
        dateRange={dateRangeValue}
        onDateRangeChange={setDateRangeValue}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        groupByOptions={COPY_GROUP_OPTIONS}
        filters={topFilters}
        onFiltersChange={setTopFilters}
        aiActions={COPY_AI_ACTIONS}
        selectedMetricIds={topMetricIds}
        onSelectedMetricIdsChange={setTopMetricIds}
        selectedRows={topPanelRows}
        allRowsForHeatmap={filteredRows}
        defaultCurrency={selectedBusinessCurrency}
        previewMode="copy"
        getPreviewCopyText={(row) => (row as CopyMotionRow).copyText}
        onOpenRow={(rowId) => setDetailRowId(rowId)}
        onShareExport={() => undefined}
        onCsvExport={() => undefined}
      />

      {copiesQuery.isLoading && <LoadingSkeleton rows={5} />}

      {copiesQuery.isError && (
        <ErrorState
          title="Could not load copies"
          description={
            copiesQuery.error instanceof Error
              ? copiesQuery.error.message
              : "Could not load copy performance data."
          }
          onRetry={() => copiesQuery.refetch()}
        />
      )}

      {!copiesQuery.isLoading && !copiesQuery.isError && filteredRows.length === 0 && (
        <EmptyState
          title="No copy performance data found for the selected range"
          description="Try a wider date range or adjust filters to inspect copy performance."
        />
      )}

      {!copiesQuery.isLoading && !copiesQuery.isError && filteredRows.length > 0 && (
        <MotionCreativesTableSection
          rows={filteredRows}
          selectedMetricIds={topMetricIds}
          onSelectedMetricIdsChange={setTopMetricIds}
          selectedRowIds={selectionState.selectedRowIds}
          defaultCurrency={selectedBusinessCurrency}
          onToggleRow={toggleRowSelection}
          onToggleAll={toggleAllRows}
          onOpenRow={(rowId) => setDetailRowId(rowId)}
        />
      )}

      {activeDetailRow ? (
        <div className="fixed inset-0 z-50 bg-black/35">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setDetailRowId(null)}
            aria-label="Close drawer overlay"
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Copy Detail</h2>
              <button
                type="button"
                onClick={() => setDetailRowId(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 rounded-xl border p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Copy unit
                </p>
                <p className="mt-1 text-base font-semibold">{activeDetailRow.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Copy text
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                  {(activeDetailRow as CopyMotionRow).copyText}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(activeDetailRow.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="outline" className="capitalize">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-xl border p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Usage
              </h3>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Campaigns</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(activeDetailRow as CopyMotionRow).usedInCampaigns.map((item) => (
                      <Badge key={item} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ads</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(activeDetailRow as CopyMotionRow).usedInAds.map((item) => (
                      <Badge key={item} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
