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
  mapMotionGroupByToApi,
  MotionDateRangeValue,
  MotionFilterRule,
  MotionGroupBy,
  MotionTopSection,
  resolveMotionDateRange,
} from "@/components/creatives/MotionTopSection";
import type { MetaCreativeRow, MetaCreativePreview } from "@/components/creatives/metricConfig";
import { useAppStore } from "@/store/app-store";
import type { MetaCreativeApiRow } from "@/app/api/meta/creatives/route";

type CopyMotionRow = MetaCreativeRow & {
  copyText: string;
  usedInCampaigns: string[];
  usedInAds: string[];
};

interface MetaCreativesResponse {
  status?: string;
  message?: string;
  rows: MetaCreativeApiRow[];
}

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

function hasMessage(payload: unknown): payload is { message: string } {
  if (!payload || typeof payload !== "object") return false;
  return "message" in payload && typeof payload.message === "string";
}

async function fetchCopyRows(params: {
  businessId: string;
  start: string;
  end: string;
  groupBy: "adName" | "creative" | "adSet";
}): Promise<MetaCreativesResponse> {
  const query = new URLSearchParams({
    businessId: params.businessId,
    start: params.start,
    end: params.end,
    groupBy: params.groupBy,
    format: "all",
    sort: "spend",
  });

  const response = await fetch(`/api/meta/creatives?${query.toString()}`, {
    headers: { Accept: "application/json" },
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = hasMessage(payload)
      ? payload.message
      : `Could not load copies (${response.status}).`;
    throw new Error(message);
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as MetaCreativesResponse).rows)
  ) {
    throw new Error("Invalid copies response received from backend.");
  }

  return payload as MetaCreativesResponse;
}

function mapApiRowToCopyRow(row: MetaCreativeApiRow): CopyMotionRow {
  const linkClicks = row.link_clicks ?? 0;
  const purchases = row.purchases ?? 0;
  const addToCart = row.add_to_cart ?? 0;

  const copyText = row.name;

  return {
    id: row.id,
    creativeId: row.creative_id,
    objectStoryId: row.object_story_id ?? null,
    effectiveObjectStoryId: row.effective_object_story_id ?? null,
    postId: row.post_id ?? null,
    name: row.name,
    associatedAdsCount: row.associated_ads_count,
    accountId: row.account_id ?? null,
    accountName: row.account_name ?? null,
    campaignId: row.campaign_id ?? null,
    campaignName: row.campaign_name ?? null,
    adSetId: row.adset_id ?? null,
    adSetName: row.adset_name ?? null,
    currency: row.currency ?? null,
    format: row.format,
    creativeType: row.creative_type,
    creativeTypeLabel: row.creative_type_label,
    thumbnailUrl: row.thumbnail_url,
    previewUrl: row.preview_url,
    imageUrl: row.image_url,
    tableThumbnailUrl: row.table_thumbnail_url ?? row.thumbnail_url ?? null,
    cardPreviewUrl:
      row.card_preview_url ?? row.image_url ?? row.thumbnail_url ?? row.preview_url ?? null,
    cachedThumbnailUrl: null,
    isCatalog: row.is_catalog,
    previewState: row.preview_state,
    preview: row.preview ?? EMPTY_PREVIEW,
    launchDate: row.launch_date,
    tags: row.tags ?? [],
    aiTags: row.ai_tags ?? {},
    spend: row.spend,
    purchaseValue: row.purchase_value,
    roas: row.roas,
    cpa: row.cpa,
    cpcLink: row.cpc_link,
    cpm: row.cpm,
    ctrAll: row.ctr_all,
    purchases,
    impressions: row.impressions ?? 0,
    linkClicks,
    addToCart,
    thumbstop: row.thumbstop,
    clickToPurchase: row.click_to_atc,
    seeMoreRate: clamp(row.ctr_all * 1.5, 0, 100),
    video25: row.video25,
    video50: row.video50,
    video75: row.video75,
    video100: row.video100,
    atcToPurchaseRatio:
      row.atc_to_purchase > 0
        ? row.atc_to_purchase
        : addToCart > 0
          ? (purchases / addToCart) * 100
          : 0,
    copyText,
    usedInCampaigns: row.campaign_name ? [row.campaign_name] : [],
    usedInAds: row.name ? [row.name] : [],
  };
}

export default function CopiesPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businesses = useAppStore((state) => state.businesses);
  const businessId = selectedBusinessId ?? "";
  const selectedBusinessCurrency =
    businesses.find((business) => business.id === selectedBusinessId)?.currency ?? null;

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

  const { start: drStart, end: drEnd } = resolveMotionDateRange(dateRangeValue);
  const copyApiGroupBy = mapMotionGroupByToApi(groupBy);

  const copiesQuery = useQuery({
    queryKey: ["copies-motion", businessId, drStart, drEnd, copyApiGroupBy],
    enabled: Boolean(selectedBusinessId),
    queryFn: () =>
      fetchCopyRows({
        businessId,
        start: drStart,
        end: drEnd,
        groupBy: copyApiGroupBy,
      }),
  });

  const allRows = useMemo(
    () => (copiesQuery.data?.rows ?? []).map(mapApiRowToCopyRow),
    [copiesQuery.data?.rows],
  );

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
          </aside>
        </div>
      ) : null}
    </div>
  );
}
