"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { EmptyState } from "@/components/states/empty-state";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LockedFeatureCard } from "@/components/states/LockedFeatureCard";
import { ErrorState } from "@/components/states/error-state";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { Button } from "@/components/ui/button";
import {
  type MetaCreativeRow,
} from "@/components/creatives/metricConfig";
import { CreativeInsightsDrawer } from "@/components/creatives/CreativeInsightsDrawer";
import { MotionCreativesTableSection } from "@/components/creatives/MotionCreativesTableSection";
import type { MetaCreativeApiRow } from "@/app/api/meta/creatives/route";
import {
  applyMotionFilters,
  DEFAULT_MOTION_DATE_RANGE,
  formatMotionDateLabel,
  mapMotionGroupByToApi,
  MotionDateRangeValue,
  MotionFilterRule,
  MotionGroupBy,
  MotionTopSection,
  resolveMotionDateRange,
} from "@/components/creatives/MotionTopSection";
import type { ShareMetricKey, SharePayload, SharedCreative } from "@/components/creatives/shareCreativeTypes";

interface MetaCreativesResponse {
  status?: string;
  message?: string;
  rows: MetaCreativeApiRow[];
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
};

const SHARE_METRIC_IDS = new Set<ShareMetricKey>(["spend", "purchaseValue", "roas", "cpa", "ctrAll", "purchases"]);
let rawApiPreviewTraceCount = 0;
let mappedUiPreviewTraceCount = 0;
let shareMappingPreviewTraceCount = 0;

function toCsv(rows: MetaCreativeRow[]): string {
  const headers = [
    "Creative / Ad Name",
    "Launch date",
    "Tags",
    "Spend",
    "Purchase value",
    "ROAS",
    "Cost per purchase",
    "Cost per link click",
    "CPM",
    "CPC (all)",
    "Average order value",
    "Click to add-to-cart ratio",
    "Add-to-cart to purchase ratio",
    "Purchases",
    "First frame retention",
    "Thumbstop ratio",
    "Click through rate (outbound)",
    "Click to purchase ratio",
    "Click through rate (all)",
    "25% video plays (rate)",
    "50% video plays (rate)",
    "75% video plays (rate)",
    "100% video plays (rate)",
    "Hold rate",
    "Hook score",
    "Watch score",
    "Click score",
    "Convert score",
    "% purchase value",
  ];

  const totalPurchaseValue = rows.reduce((sum, row) => sum + row.purchaseValue, 0);
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const isVideo = (row: MetaCreativeRow) =>
    row.format === "video" || row.thumbstop > 0 || row.video25 > 0 || row.video50 > 0 || row.video75 > 0 || row.video100 > 0;

  const body = rows.map((row) => {
    const videoApplicable = isVideo(row);
    const aov = row.purchases > 0 ? row.purchaseValue / row.purchases : 0;
    const purchaseValueShare = totalPurchaseValue > 0 ? (row.purchaseValue / totalPurchaseValue) * 100 : 0;
    const values = [
      row.name,
      row.launchDate,
      (row.tags ?? []).join(" | "),
      row.spend.toFixed(2),
      row.purchaseValue.toFixed(2),
      row.roas.toFixed(2),
      row.cpa.toFixed(2),
      row.cpcLink.toFixed(2),
      row.cpm.toFixed(2),
      row.cpcLink.toFixed(2),
      aov.toFixed(2),
      row.clickToPurchase.toFixed(2),
      row.atcToPurchaseRatio.toFixed(2),
      row.purchases,
      videoApplicable ? row.thumbstop.toFixed(2) : "",
      videoApplicable ? row.thumbstop.toFixed(2) : "",
      row.ctrAll.toFixed(2),
      row.clickToPurchase.toFixed(2),
      row.ctrAll.toFixed(2),
      videoApplicable ? row.video25.toFixed(2) : "",
      videoApplicable ? row.video50.toFixed(2) : "",
      videoApplicable ? row.video75.toFixed(2) : "",
      videoApplicable ? row.video100.toFixed(2) : "",
      videoApplicable ? row.video100.toFixed(2) : "",
      row.thumbstop.toFixed(0),
      videoApplicable ? row.video50.toFixed(0) : "",
      (row.ctrAll * 10).toFixed(0),
      (row.roas * 10).toFixed(0),
      purchaseValueShare.toFixed(2),
    ];
    return values.map(escape).join(",");
  });

  return [headers.map(escape).join(","), ...body].join("\n");
}

function toSharedCreative(row: MetaCreativeRow): SharedCreative {
  const shared: SharedCreative = {
    id: row.id,
    name: row.name,
    currency: row.currency ?? null,
    format: row.format,
    previewState: row.previewState,
    isCatalog: row.isCatalog,
    previewUrl: row.previewUrl ?? null,
    imageUrl: row.imageUrl ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    preview: row.preview,
    launchDate: row.launchDate,
    tags: row.tags ?? [],
    spend: row.spend,
    purchaseValue: row.purchaseValue,
    roas: row.roas,
    cpa: row.cpa,
    cpcLink: row.cpcLink,
    cpm: row.cpm,
    ctrAll: row.ctrAll,
    purchases: row.purchases,
    impressions: row.impressions,
    linkClicks: row.linkClicks,
    addToCart: row.addToCart,
    thumbstop: row.thumbstop,
    clickToPurchase: row.clickToPurchase,
    video25: row.video25,
    video50: row.video50,
    video75: row.video75,
    video100: row.video100,
    atcToPurchaseRatio: row.atcToPurchaseRatio,
  };
  if (shareMappingPreviewTraceCount < 5) {
    shareMappingPreviewTraceCount += 1;
    console.log("[preview-trace][stage-3-share-mapping]", {
      id: row.id,
      name: row.name,
      input: {
        thumbnailUrl: row.thumbnailUrl ?? null,
        imageUrl: row.imageUrl ?? null,
        previewUrl: row.previewUrl ?? null,
      },
      output: {
        thumbnailUrl: shared.thumbnailUrl ?? null,
        imageUrl: shared.imageUrl ?? null,
        previewUrl: shared.previewUrl ?? null,
      },
    });
  }
  return shared;
}

function hasMessage(payload: unknown): payload is { message: string } {
  if (!payload || typeof payload !== "object") return false;
  return "message" in payload && typeof payload.message === "string";
}

async function fetchMetaCreatives(params: {
  businessId: string;
  start: string;
  end: string;
  groupBy: "adName" | "creative" | "adSet";
  format: "all" | "image" | "video";
  sort: "roas" | "spend" | "ctrAll" | "purchaseValue";
}): Promise<MetaCreativesResponse> {
  const query = new URLSearchParams({
    businessId: params.businessId,
    start: params.start,
    end: params.end,
    groupBy: params.groupBy,
    format: params.format,
    sort: params.sort,
  });

  const response = await fetch(`/api/meta/creatives?${query.toString()}`, {
    headers: { Accept: "application/json" },
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = hasMessage(payload)
      ? payload.message
      : `Could not load creatives (${response.status}).`;
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object" || !Array.isArray((payload as MetaCreativesResponse).rows)) {
    throw new Error("Invalid creatives response received from backend.");
  }

  const rows = (payload as MetaCreativesResponse).rows;
  if (rawApiPreviewTraceCount < 5) {
    const sample = rows.slice(0, Math.max(0, 5 - rawApiPreviewTraceCount));
    for (const row of sample) {
      rawApiPreviewTraceCount += 1;
      console.log("[preview-trace][stage-1-raw-api]", {
        id: row.id,
        name: row.name,
        thumbnail_url: row.thumbnail_url ?? null,
        image_url: row.image_url ?? null,
        preview_url: row.preview_url ?? null,
        preview_state: row.preview_state,
        is_catalog: row.is_catalog,
        format: row.format,
      });
    }
  }

  return payload as MetaCreativesResponse;
}

function mapApiRowToUiRow(row: MetaCreativeApiRow): MetaCreativeRow {
  const fallbackCreativeTypeLabel =
    row.format === "catalog" ? "Feed (Catalog ads)" : row.format === "video" ? "Video" : "Feed";
  const fallbackCreativeType = row.format === "catalog" ? "feed_catalog" : row.format === "video" ? "video" : "feed";

  return {
    id: row.id,
    name: row.name,
    associatedAdsCount: row.associated_ads_count,
    accountId: row.account_id ?? null,
    accountName: row.account_name ?? null,
    currency: row.currency ?? null,
    format: row.format,
    creativeType: row.creative_type ?? fallbackCreativeType,
    creativeTypeLabel: row.creative_type_label ?? fallbackCreativeTypeLabel,
    thumbnailUrl: row.thumbnail_url,
    previewUrl: row.preview_url,
    imageUrl: row.image_url,
    isCatalog: row.is_catalog,
    previewState: row.preview_state,
    preview: row.preview,
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
    purchases: row.purchases,
    impressions: row.impressions,
    linkClicks: row.link_clicks,
    addToCart: row.add_to_cart,
    thumbstop: row.thumbstop,
    clickToPurchase: row.click_to_atc,
    video25: row.video25,
    video50: row.video50,
    video75: row.video75,
    video100: row.video100,
    atcToPurchaseRatio: row.atc_to_purchase,
  };
}

export default function CreativesPage() {
  const router = useRouter();
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businesses = useAppStore((state) => state.businesses);
  const businessId = selectedBusinessId ?? "";
  const selectedBusinessCurrency =
    businesses.find((business) => business.id === selectedBusinessId)?.currency ?? null;

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);
  const assignedAccountsByBusiness = useIntegrationsStore(
    (state) => state.assignedAccountsByBusiness
  );

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  const integrations = byBusinessId[businessId];

  const [dateRangeValue, setDateRangeValue] = useState<MotionDateRangeValue>(
    DEFAULT_MOTION_DATE_RANGE
  );
  const [groupBy, setGroupBy] = useState<MotionGroupBy>("adName");
  const [topFilters, setTopFilters] = useState<MotionFilterRule[]>([]);
  const [topMetricIds, setTopMetricIds] = useState<string[]>(["spend", "roas"]);
  const [selectionState, setSelectionState] = useState<{ selectedRowIds: string[] }>({
    selectedRowIds: [],
  });
  const hasInitializedDefaultSelectionRef = useRef(false);
  const hasUserInteractedSelectionRef = useRef(false);
  const [drawerState, setDrawerState] = useState<{ open: boolean; activeRowId: string | null }>({
    open: false,
    activeRowId: null,
  });
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [notesByRowId, setNotesByRowId] = useState<Record<string, string>>({});
  const [shareExportLoading, setShareExportLoading] = useState(false);
  const [csvExportLoading, setCsvExportLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  useEffect(() => {
    console.log("CREATIVES_BUILD_MARKER_001");
  }, []);

  const platform: "meta" = "meta";
  const platformStatus = integrations?.meta?.status;
  const platformConnected = platformStatus === "connected";
  const assignedMetaAccounts = assignedAccountsByBusiness[businessId]?.meta ?? [];
  const metaHasAssignments = assignedMetaAccounts.length > 0;

  const { start: drStart, end: drEnd } = resolveMotionDateRange(dateRangeValue);

  const creativesQuery = useQuery({
    queryKey: [
      "meta-creatives-motion",
      businessId,
      drStart,
      drEnd,
      groupBy,
    ],
    enabled: platform === "meta" && platformConnected && metaHasAssignments,
    queryFn: () =>
      fetchMetaCreatives({
        businessId,
        start: drStart,
        end: drEnd,
        groupBy: mapMotionGroupByToApi(groupBy),
        format: "all",
        sort: "spend",
      }),
  });

  const allRows = useMemo(() => {
    const rows = (creativesQuery.data?.rows ?? []).map(mapApiRowToUiRow);
    if (rows.length > 0 && process.env.NODE_ENV !== "production") {
      const withPreview = rows.filter((r) => r.previewUrl).length;
      console.log("[creatives-page] UI row preview summary", {
        total: rows.length,
        with_previewUrl: withPreview,
        with_thumbnailUrl: rows.filter((r) => r.thumbnailUrl).length,
        with_imageUrl: rows.filter((r) => r.imageUrl).length,
        state_counts: {
          preview: rows.filter((r) => r.previewState === "preview").length,
          unavailable: rows.filter((r) => r.previewState === "unavailable").length,
        },
        samples: rows.slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name.slice(0, 40),
          previewState: r.previewState,
          previewUrl: r.previewUrl ? r.previewUrl.slice(0, 80) : null,
          thumbnailUrl: r.thumbnailUrl ? r.thumbnailUrl.slice(0, 80) : null,
          imageUrl: r.imageUrl ? r.imageUrl.slice(0, 80) : null,
          isCatalog: r.isCatalog,
        })),
      });
      
      // DIAGNOSTIC: Log raw API data vs mapped rows
      const rawRows = creativesQuery.data?.rows ?? [];
      console.log("[DIAGNOSTIC] API -> UI mapping check", {
        first_3_raw: rawRows.slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name.slice(0, 30),
          thumbnail_url: r.thumbnail_url ?? "NULL",
          image_url: r.image_url ?? "NULL",
          preview_url: r.preview_url ?? "NULL",
          preview_state: r.preview_state,
          preview_render_mode: r.preview?.render_mode,
        })),
        first_3_mapped: rows.slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name.slice(0, 30),
          thumbnailUrl: r.thumbnailUrl ?? "NULL",
          imageUrl: r.imageUrl ?? "NULL",
          previewUrl: r.previewUrl ?? "NULL",
          previewState: r.previewState,
          preview_image_url: r.preview?.image_url ?? "NULL",
          preview_poster_url: r.preview?.poster_url ?? "NULL",
        })),
      });
    }
    return rows;
  }, [creativesQuery.data?.rows]);

  useEffect(() => {
    if (allRows.length === 0) return;
    const sample = allRows.slice(0, Math.max(0, 5 - mappedUiPreviewTraceCount));
    for (const row of sample) {
      mappedUiPreviewTraceCount += 1;
      console.log("[preview-trace][stage-2-ui-mapping]", {
        id: row.id,
        name: row.name,
        thumbnailUrl: row.thumbnailUrl ?? null,
        imageUrl: row.imageUrl ?? null,
        previewUrl: row.previewUrl ?? null,
        previewState: row.previewState,
        isCatalog: row.isCatalog,
        format: row.format,
      });
    }
  }, [allRows]);

  const filteredRows = useMemo(() => {
    if (platform !== "meta") return [];
    return applyMotionFilters(allRows, topFilters);
  }, [allRows, platform, topFilters]);

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
    [filteredRows, selectionState.selectedRowIds]
  );
  const topPanelRows = useMemo(
    () => (selectedRows.length > 0 ? selectedRows : filteredRows.slice(0, 20)),
    [filteredRows, selectedRows]
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (topPanelRows.length === 0 && filteredRows.length === 0) return;

    console.log("[creatives-page] before MotionTopSection", {
      total: topPanelRows.length,
      samples: topPanelRows.slice(0, 3).map((row) => ({
        id: row.id,
        name: row.name,
        previewUrl: row.previewUrl ?? null,
        thumbnailUrl: row.thumbnailUrl ?? null,
        imageUrl: row.imageUrl ?? null,
        previewState: row.previewState,
        isCatalog: row.isCatalog,
      })),
    });

    console.log("[creatives-page] before MotionCreativesTableSection", {
      total: filteredRows.length,
      samples: filteredRows.slice(0, 3).map((row) => ({
        id: row.id,
        name: row.name,
        previewUrl: row.previewUrl ?? null,
        thumbnailUrl: row.thumbnailUrl ?? null,
        imageUrl: row.imageUrl ?? null,
        previewState: row.previewState,
        isCatalog: row.isCatalog,
      })),
    });
  }, [filteredRows, topPanelRows]);

  const activeRow = useMemo(
    () => filteredRows.find((row) => row.id === drawerState.activeRowId) ?? null,
    [filteredRows, drawerState.activeRowId]
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
      selectedRowIds: allIds.every((id) => prev.selectedRowIds.includes(id)) ? [] : allIds,
    }));
  };

  const handleCsvExport = async () => {
    setCsvError(null);
    setCsvExportLoading(true);
    try {
      const csv = toCsv(filteredRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `top-creatives-${drStart}-to-${drEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setCsvError("Could not export CSV.");
    } finally {
      setCsvExportLoading(false);
    }
  };

  const handleShareExport = async () => {
    setShareError(null);
    setShareExportLoading(true);
    try {
      const selectedForShare =
        selectionState.selectedRowIds.length > 0
          ? filteredRows.filter((row) => selectionState.selectedRowIds.includes(row.id))
          : filteredRows;
      const shareMetrics = topMetricIds.filter((id): id is ShareMetricKey => SHARE_METRIC_IDS.has(id as ShareMetricKey));
      const payload: Omit<SharePayload, "token" | "createdAt"> = {
        title: "Top Creatives",
        dateRange: formatMotionDateLabel(dateRangeValue),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        businessId,
        groupBy,
        filters: topFilters.map((rule) => `${rule.field}: ${rule.query}`),
        selectedRowIds: selectionState.selectedRowIds,
        totalRows: filteredRows.length,
        metrics: shareMetrics.length > 0 ? shareMetrics : ["spend", "roas"],
        includeNotes: false,
        note: "",
        creatives: selectedForShare.map(toSharedCreative),
        benchmarkCreatives: filteredRows.map(toSharedCreative),
      };

      const res = await fetch("/api/creatives/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { url?: string; message?: string } | null;
      if (!res.ok || !json?.url) {
        throw new Error(json?.message ?? "Could not create share link.");
      }
      setShareUrl(json.url);
    } catch (error: unknown) {
      setShareError(error instanceof Error ? error.message : "Could not create share link.");
    } finally {
      setShareExportLoading(false);
    }
  };

  const openDrawer = (rowId: string, scrollToRow = false) => {
    setDrawerState({ open: true, activeRowId: rowId });
    setHighlightedRowId(rowId);
    setTimeout(() => setHighlightedRowId((prev) => (prev === rowId ? null : prev)), 1400);
    if (scrollToRow) {
      const target = document.getElementById(`creative-row-${rowId}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const dataStatus = creativesQuery.data?.status;
  if (!selectedBusinessId) return <BusinessEmptyState />;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Top Creatives</h1>
        <p className="text-xs font-mono text-blue-600">CREATIVES_BUILD_MARKER_001</p>
        <p className="text-sm text-muted-foreground">
          Identify the creatives driving the most spend and revenue across your ad accounts. Analyze performance, spot winners, and scale what works.
        </p>
      </div>

      {(() => {
        const platformLabel = PLATFORM_LABELS[platform] ?? platform;

        if (platform !== "meta") {
          if (!platformConnected) {
            return (
              <LockedFeatureCard
                providerLabel={platformLabel}
                description={`Connect ${platformLabel} to view creative performance and sharing tools.`}
              />
            );
          }
          return (
            <EmptyState
              title="Motion view unavailable"
              description={`Motion view for ${platformLabel} is not supported yet.`}
            />
          );
        }

        if (!platformConnected) {
          return (
            <IntegrationEmptyState
              providerLabel="Meta"
              status={platformStatus}
              description="Connect Meta to view creative performance"
            />
          );
        }

        if (!metaHasAssignments || dataStatus === "no_accounts_assigned") {
          return (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-base font-semibold">
                Assign Meta ad accounts to this business to load creatives
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Connect and assign at least one Meta ad account for this business first.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => router.push("/integrations") }>
                Open Integrations
              </Button>
            </div>
          );
        }

        return (
          <>
            <MotionTopSection
              showHeader={false}
              dateRange={dateRangeValue}
              onDateRangeChange={setDateRangeValue}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              filters={topFilters}
              onFiltersChange={setTopFilters}
              selectedMetricIds={topMetricIds}
              onSelectedMetricIdsChange={setTopMetricIds}
              selectedRows={topPanelRows}
              allRowsForHeatmap={filteredRows}
              defaultCurrency={selectedBusinessCurrency}
              onOpenRow={(rowId) => openDrawer(rowId, true)}
              onShareExport={handleShareExport}
              onCsvExport={handleCsvExport}
              shareExportLoading={shareExportLoading}
              csvExportLoading={csvExportLoading}
              shareUrl={shareUrl}
              shareError={shareError}
              csvError={csvError}
            />

            {creativesQuery.isLoading && <LoadingSkeleton rows={5} />}

            {creativesQuery.isError && (
              <ErrorState
                title="Could not load creatives"
                description={
                  creativesQuery.error instanceof Error
                    ? creativesQuery.error.message
                    : "Could not load creative performance data."
                }
                onRetry={() => creativesQuery.refetch()}
              />
            )}

            {!creativesQuery.isLoading &&
              !creativesQuery.isError &&
              (filteredRows.length === 0 || dataStatus === "no_data") && (
                <EmptyState
                  title="No creative performance data found for the selected range"
                  description="Try a wider date range or verify that assigned Meta accounts have active ad delivery."
                />
              )}

            {!creativesQuery.isLoading &&
              !creativesQuery.isError &&
              filteredRows.length > 0 &&
              dataStatus !== "no_data" && (
                <MotionCreativesTableSection
                  rows={filteredRows}
                  selectedMetricIds={topMetricIds}
                  onSelectedMetricIdsChange={setTopMetricIds}
                  selectedRowIds={selectionState.selectedRowIds}
                  highlightedRowId={highlightedRowId}
                  defaultCurrency={selectedBusinessCurrency}
                  onToggleRow={toggleRowSelection}
                  onToggleAll={toggleAllRows}
                  onOpenRow={(rowId) => openDrawer(rowId)}
                />
              )}
          </>
        );
      })()}

      <CreativeInsightsDrawer
        row={activeRow}
        open={drawerState.open}
        notes={activeRow ? notesByRowId[activeRow.id] ?? "" : ""}
        onOpenChange={(open) =>
          setDrawerState((prev) => ({ ...prev, open, activeRowId: open ? prev.activeRowId : null }))
        }
        onNotesChange={(value) => {
          if (!activeRow) return;
          setNotesByRowId((prev) => ({ ...prev, [activeRow.id]: value }));
        }}
      />
    </div>
  );
}
