"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { isDemoBusinessSelected } from "@/lib/business-mode";
import { EmptyState } from "@/components/states/empty-state";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LockedFeatureCard } from "@/components/states/LockedFeatureCard";
import { ErrorState } from "@/components/states/error-state";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { Button } from "@/components/ui/button";
import { fetchProviderAccountSnapshot } from "@/lib/provider-account-client";
import { warmProviderAccountSnapshot } from "@/lib/provider-account-client";
import {
  type MetaCreativeRow,
} from "@/components/creatives/metricConfig";
import { CreativesTableSection } from "@/components/creatives/CreativesTableSection";
import {
  applyCreativeFilters,
  formatCreativeDateLabel,
  mapCreativeGroupByToApi,
  CreativeDateRangeValue,
  CreativeFilterRule,
  CreativeGroupBy,
  CreativesTopSection,
  resolveCreativeDateRange,
} from "@/components/creatives/CreativesTopSection";
import { usePersistentCreativeDateRange } from "@/hooks/use-persistent-date-range";
import type { ShareMetricKey, SharePayload } from "@/components/creatives/shareCreativeTypes";
import {
  CreativesTableShell,
  fetchMetaCreatives,
  hasRenderablePreview,
  mapApiRowToUiRow,
  MetaCreativesResponse,
  PLATFORM_LABELS,
  PreviewStripState,
  SHARE_METRIC_IDS,
  shouldPollForPreviewReadiness,
  toCsv,
  toSharedCreative,
} from "@/app/(dashboard)/creatives/page-support";

const CreativeDetailExperience = dynamic(
  () => import("@/components/creatives/CreativeDetailExperience").then((mod) => mod.CreativeDetailExperience),
  { ssr: false, loading: () => null }
);
const CreativeAdBreakdownDrawer = dynamic(
  () => import("@/components/creatives/CreativeAdBreakdownDrawer").then((mod) => mod.CreativeAdBreakdownDrawer),
  { ssr: false, loading: () => null }
);

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
  const setProviderAccounts = useIntegrationsStore((state) => state.setProviderAccounts);
  const setAssignedAccounts = useIntegrationsStore((state) => state.setAssignedAccounts);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  const integrations = byBusinessId[businessId];

  const [dateRangeValue, setDateRangeValue] = usePersistentCreativeDateRange();
  const [groupBy, setGroupBy] = useState<CreativeGroupBy>("creative");
  const [topFilters, setTopFilters] = useState<CreativeFilterRule[]>([]);
  const [topMetricIds, setTopMetricIds] = useState<string[]>(["spend", "roas"]);
  const [selectionState, setSelectionState] = useState<{ selectedRowIds: string[] }>({
    selectedRowIds: [],
  });
  const hasUserInteractedSelectionRef = useRef(false);
  const [creativeDrawerState, setCreativeDrawerState] = useState<{ open: boolean; activeRowId: string | null }>({
    open: false,
    activeRowId: null,
  });
  const [breakdownDrawerState, setBreakdownDrawerState] = useState<{ open: boolean; activeRowId: string | null }>({
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

  const platform: "meta" = "meta";
  const platformStatus = integrations?.meta?.status;
  const isDemoBusiness = isDemoBusinessSelected(selectedBusinessId, businesses);
  const platformConnected = platformStatus === "connected" || isDemoBusiness;
  const [metaAssignmentsState, setMetaAssignmentsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const assignedMetaAccounts = assignedAccountsByBusiness[businessId]?.meta ?? [];
  const metaHasAssignments = isDemoBusiness || assignedMetaAccounts.length > 0;

  useEffect(() => {
    if (!selectedBusinessId || isDemoBusiness || !platformConnected) {
      setMetaAssignmentsState("idle");
      return;
    }

    let cancelled = false;
    setMetaAssignmentsState("loading");

    (async () => {
      try {
        const snapshot = await fetchProviderAccountSnapshot("meta", businessId);
        if (cancelled) return;
        setProviderAccounts(businessId, "meta", snapshot.accounts);
        setAssignedAccounts(businessId, "meta", snapshot.assignedAccountIds);
        setMetaAssignmentsState("ready");
        if (snapshot.meta?.stale) {
          void warmProviderAccountSnapshot("meta", businessId).catch(() => undefined);
        }
      } catch {
        try {
          const snapshot = await warmProviderAccountSnapshot("meta", businessId);
          if (cancelled) return;
          setProviderAccounts(businessId, "meta", snapshot.accounts);
          setAssignedAccounts(businessId, "meta", snapshot.assignedAccountIds);
          setMetaAssignmentsState("ready");
        } catch {
          if (cancelled) return;
          setMetaAssignmentsState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    businessId,
    isDemoBusiness,
    platformConnected,
    selectedBusinessId,
    setAssignedAccounts,
    setProviderAccounts,
  ]);

  const { start: drStart, end: drEnd } = resolveCreativeDateRange(dateRangeValue);
  const mainTableApiGroupBy = mapCreativeGroupByToApi(groupBy);

  const creativesMetadataQuery = useQuery({
    queryKey: [
      "meta-creatives-creatives-metadata",
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
        groupBy: mainTableApiGroupBy,
        format: "all",
        sort: "spend",
        mediaMode: "metadata",
      }),
    refetchInterval: (query) =>
      shouldPollForPreviewReadiness(query.state.data as MetaCreativesResponse | undefined)
        ? 2500
        : false,
    refetchIntervalInBackground: true,
  });
  const creativesMediaQuery = useQuery({
    queryKey: [
      "meta-creatives-creatives-media",
      businessId,
      drStart,
      drEnd,
      groupBy,
    ],
    enabled:
      platform === "meta" &&
      platformConnected &&
      metaHasAssignments &&
      creativesMetadataQuery.isSuccess &&
      (creativesMetadataQuery.data?.rows?.length ?? 0) > 0,
    queryFn: () =>
      fetchMetaCreatives({
        businessId,
        start: drStart,
        end: drEnd,
        groupBy: mainTableApiGroupBy,
        format: "all",
        sort: "spend",
        mediaMode: "full",
      }),
    refetchInterval: (query) =>
      shouldPollForPreviewReadiness(query.state.data as MetaCreativesResponse | undefined)
        ? 3000
        : false,
    refetchIntervalInBackground: true,
  });
  const adBreakdownQuery = useQuery({
    queryKey: ["meta-creatives-ad-breakdown", businessId, drStart, drEnd],
    enabled:
      platform === "meta" &&
      platformConnected &&
      metaHasAssignments &&
      breakdownDrawerState.open &&
      Boolean(breakdownDrawerState.activeRowId),
    queryFn: () =>
      fetchMetaCreatives({
        businessId,
        start: drStart,
        end: drEnd,
        groupBy: "adName",
        format: "all",
        sort: "spend",
      }),
  });

  const allRows = useMemo(() => {
    const metadataRows = creativesMetadataQuery.data?.rows ?? [];
    const hydratedRows = creativesMediaQuery.data?.rows ?? [];
    const hydratedById = new Map(hydratedRows.map((row) => [row.id, row]));
    const rows = metadataRows.map((row) => mapApiRowToUiRow(hydratedById.get(row.id) ?? row));
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
      const rawRows = metadataRows;
      console.log("[DIAGNOSTIC] API -> UI mapping check", {
        first_3_raw: rawRows.slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name.slice(0, 30),
          thumbnail_url: r.thumbnail_url ?? "NULL",
          image_url: r.image_url ?? "NULL",
          preview_url: r.preview_url ?? "NULL",
          preview_state: r.preview_state,
          preview_render_mode: r.preview?.render_mode,
          preview_object_FULL: r.preview,
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
          preview_object_FULL: r.preview,
        })),
      });
      
      // DIAGNOSTIC: Full backend response status
      console.log("[DIAGNOSTIC] Backend response metadata", {
        status: creativesMetadataQuery.data?.status,
        total_rows: rawRows.length,
        has_preview_field: rawRows.length > 0 ? typeof rawRows[0]?.preview : "N/A",
        media_hydrated: Boolean(creativesMediaQuery.data?.media_hydrated),
      });
    }
    return rows;
  }, [creativesMediaQuery.data?.media_hydrated, creativesMediaQuery.data?.rows, creativesMetadataQuery.data?.rows]);

  const filteredRows = useMemo(() => {
    if (platform !== "meta") return [];
    return applyCreativeFilters(allRows, topFilters);
  }, [allRows, platform, topFilters]);
  const deferredFilteredRows = useDeferredValue(filteredRows);

  useEffect(() => {
    setSelectionState((prev) => {
      const filteredIds = new Set(filteredRows.map((row) => row.id));
      const kept = prev.selectedRowIds.filter((id) => filteredIds.has(id));

      if (
        !hasUserInteractedSelectionRef.current &&
        kept.length === 0 &&
        filteredRows.length > 0
      ) {
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
      deferredFilteredRows
        .filter((row) => selectionState.selectedRowIds.includes(row.id)),
    [deferredFilteredRows, selectionState.selectedRowIds]
  );
  const topPanelRows = useMemo(
    () => selectedRows,
    [selectedRows]
  );
  const previewStatusPayload = creativesMediaQuery.data ?? creativesMetadataQuery.data;
  const previewStripState = useMemo<PreviewStripState>(() => {
    const metadataRows = creativesMetadataQuery.data?.rows ?? [];
    const hasMetadataRows = metadataRows.length > 0;

    if (!hasMetadataRows) {
      if (creativesMetadataQuery.isLoading || creativesMetadataQuery.isFetching) {
        return "data_loading";
      }
      return "media_hydrating";
    }

    // For demo businesses, skip media hydration check — rows have local image URLs and are always ready.
    if (isDemoBusiness) {
      return "ready";
    }

    const mediaHydrated = previewStatusPayload?.media_hydrated === true;
    const previewCoverage = previewStatusPayload?.preview_coverage?.previewCoverage ?? 0;

    if (!mediaHydrated) {
      return "media_hydrating";
    }

    if (previewCoverage > 0) {
      return "ready";
    }

    return "missing";
  }, [
    creativesMetadataQuery.data?.rows,
    creativesMetadataQuery.isFetching,
    creativesMetadataQuery.isLoading,
    isDemoBusiness,
    previewStatusPayload,
  ]);
  const topPreviewRows = useMemo(
    () =>
      previewStripState === "ready"
        ? topPanelRows.filter((row) => hasRenderablePreview(row)).slice(0, 20)
        : [],
    [previewStripState, topPanelRows]
  );
  const topPreviewSummary = useMemo(() => {
    const total = topPanelRows.length;
    const ready = previewStripState === "ready" ? topPreviewRows.length : 0;
    const pending =
      previewStripState === "data_loading" || previewStripState === "media_hydrating"
        ? total
        : 0;
    const missing = previewStripState === "missing" ? total : Math.max(total - ready - pending, 0);
    const minimumReady = total <= 2 ? 1 : Math.min(3, total);

    return {
      state: previewStripState,
      total,
      ready,
      pending,
      missing,
      minimumReady,
    };
  }, [previewStripState, topPanelRows.length, topPreviewRows.length]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (topPanelRows.length === 0 && filteredRows.length === 0) return;

    console.log("[creatives-page] before CreativesTopSection", {
      total: topPanelRows.length,
      top_preview_summary: topPreviewSummary,
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

    console.log("[creatives-page] before CreativesTableSection", {
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
  }, [filteredRows, topPanelRows, topPreviewSummary]);

  const activeCreativeRow = useMemo(
    () => filteredRows.find((row) => row.id === creativeDrawerState.activeRowId) ?? null,
    [filteredRows, creativeDrawerState.activeRowId]
  );
  const activeBreakdownCreativeRow = useMemo(
    () => filteredRows.find((row) => row.id === breakdownDrawerState.activeRowId) ?? null,
    [filteredRows, breakdownDrawerState.activeRowId]
  );
  const adBreakdownRows = useMemo(() => {
    const creativeName = activeBreakdownCreativeRow?.name ?? null;
    if (!creativeName) return [];
      const rows = (adBreakdownQuery.data?.rows ?? []).map(mapApiRowToUiRow);
    return rows.filter((row) => row.name === creativeName);
  }, [activeBreakdownCreativeRow?.name, adBreakdownQuery.data?.rows]);

  const openCreativeDrawer = useCallback((rowId: string, scrollToRow = false) => {
    setCreativeDrawerState({ open: true, activeRowId: rowId });
    if (scrollToRow) {
      const target = document.getElementById(`creative-row-${rowId}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);
  const openAdBreakdownDrawer = useCallback((rowId: string) => {
    setBreakdownDrawerState({ open: true, activeRowId: rowId });
    setHighlightedRowId(rowId);
    setTimeout(() => setHighlightedRowId((prev) => (prev === rowId ? null : prev)), 1400);
  }, []);

  const toggleRowSelection = useCallback((rowId: string) => {
    hasUserInteractedSelectionRef.current = true;
    setSelectionState((prev) => ({
      selectedRowIds: prev.selectedRowIds.includes(rowId)
        ? prev.selectedRowIds.filter((id) => id !== rowId)
        : [...prev.selectedRowIds, rowId],
    }));
  }, []);

  const toggleAllRows = useCallback(() => {
    hasUserInteractedSelectionRef.current = true;
    const allIds = deferredFilteredRows.map((row) => row.id);
    setSelectionState((prev) => ({
      selectedRowIds: allIds.every((id) => prev.selectedRowIds.includes(id)) ? [] : allIds,
    }));
  }, [deferredFilteredRows]);

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
        dateRange: formatCreativeDateLabel(dateRangeValue),
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
        // Keep share payload compact; public page falls back to `creatives` as benchmark when omitted.
        benchmarkCreatives: undefined,
      };

      const res = await fetch("/api/creatives/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      const json = (() => {
        if (!text) return null;
        try {
          return JSON.parse(text) as { url?: string; message?: string };
        } catch {
          return null;
        }
      })();
      if (!res.ok || !json?.url) {
        const fallbackMessage = res.status === 413
          ? "Share payload is too large. Narrow the selection and try again."
          : "Could not create share link.";
        throw new Error(json?.message ?? fallbackMessage);
      }
      setShareUrl(json.url);
    } catch (error: unknown) {
      setShareError(error instanceof Error ? error.message : "Could not create share link.");
    } finally {
      setShareExportLoading(false);
    }
  };

  const dataStatus = creativesMetadataQuery.data?.status;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (creativeDrawerState.open && creativeDrawerState.activeRowId) {
      params.set("creative", creativeDrawerState.activeRowId);
    } else {
      params.delete("creative");
    }
    const next = params.toString();
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [creativeDrawerState.activeRowId, creativeDrawerState.open]);

  useEffect(() => {
    if (creativeDrawerState.open) return;
    if (typeof window === "undefined") return;
    const fromUrl = new URLSearchParams(window.location.search).get("creative");
    if (!fromUrl) return;
    const exists = filteredRows.some((row) => row.id === fromUrl);
    if (!exists) return;
    setCreativeDrawerState({ open: true, activeRowId: fromUrl });
  }, [creativeDrawerState.open, filteredRows]);

  if (!selectedBusinessId) return <BusinessEmptyState />;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Top Creatives</h1>
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
              title="Creative view unavailable"
              description={`Creative view for ${platformLabel} is not supported yet.`}
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

        if (!isDemoBusiness && platformConnected && metaAssignmentsState === "loading" && assignedMetaAccounts.length === 0) {
          return <LoadingSkeleton rows={5} />;
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
            <CreativesTopSection
              showHeader={false}
              showAiActionsRow={false}
              dateRange={dateRangeValue}
              onDateRangeChange={setDateRangeValue}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              filters={topFilters}
              onFiltersChange={setTopFilters}
              selectedMetricIds={topMetricIds}
              onSelectedMetricIdsChange={setTopMetricIds}
              selectedRows={topPreviewRows}
              allRowsForHeatmap={filteredRows}
              defaultCurrency={selectedBusinessCurrency}
              onOpenRow={(rowId) => openCreativeDrawer(rowId, true)}
              onShareExport={handleShareExport}
              onCsvExport={handleCsvExport}
              shareExportLoading={shareExportLoading}
              csvExportLoading={csvExportLoading}
              shareUrl={shareUrl}
              shareError={shareError}
              csvError={csvError}
              previewStripState={previewStripState}
              previewStripSummary={topPreviewSummary}
            />

            {creativesMetadataQuery.isLoading && <CreativesTableShell />}

            {creativesMetadataQuery.isError && (
              <ErrorState
                title="Could not load creatives"
                description={
                  creativesMetadataQuery.error instanceof Error
                    ? creativesMetadataQuery.error.message
                    : "Could not load creative performance data."
                }
                onRetry={() => creativesMetadataQuery.refetch()}
              />
            )}

            {!creativesMetadataQuery.isLoading &&
              !creativesMetadataQuery.isError &&
              (deferredFilteredRows.length === 0 || dataStatus === "no_data") && (
                <EmptyState
                  title="No creative performance data found for the selected range"
                  description="Try a wider date range or verify that assigned Meta accounts have active ad delivery."
                />
              )}

            {!creativesMetadataQuery.isLoading &&
              !creativesMetadataQuery.isError &&
              deferredFilteredRows.length > 0 &&
              dataStatus !== "no_data" && (
                <>
                  <CreativesTableSection
                    rows={deferredFilteredRows}
                    businessId={businessId}
                    selectedMetricIds={topMetricIds}
                    onSelectedMetricIdsChange={setTopMetricIds}
                    selectedRowIds={selectionState.selectedRowIds}
                    onReplaceSelectedRowIds={(rowIds) => {
                      hasUserInteractedSelectionRef.current = true;
                      setSelectionState({ selectedRowIds: rowIds });
                    }}
                    highlightedRowId={highlightedRowId}
                    defaultCurrency={selectedBusinessCurrency}
                    onToggleRow={toggleRowSelection}
                    onToggleAll={toggleAllRows}
                    onOpenRow={openCreativeDrawer}
                    onOpenBreakdownRow={openAdBreakdownDrawer}
                  />
                </>
              )}
          </>
        );
      })()}

      <CreativeDetailExperience
        businessId={businessId}
        row={activeCreativeRow}
        allRows={filteredRows}
        open={creativeDrawerState.open}
        notes={activeCreativeRow ? notesByRowId[activeCreativeRow.id] ?? "" : ""}
        dateRange={dateRangeValue}
        defaultCurrency={selectedBusinessCurrency}
        onOpenChange={(open) =>
          setCreativeDrawerState((prev) => ({ ...prev, open, activeRowId: open ? prev.activeRowId : null }))
        }
        onDateRangeChange={setDateRangeValue}
        onNotesChange={(value) => {
          if (!activeCreativeRow) return;
          setNotesByRowId((prev) => ({ ...prev, [activeCreativeRow.id]: value }));
        }}
      />
      <CreativeAdBreakdownDrawer
        open={breakdownDrawerState.open}
        creative={activeBreakdownCreativeRow}
        rows={adBreakdownRows}
        loading={adBreakdownQuery.isLoading}
        defaultCurrency={selectedBusinessCurrency}
        onOpenChange={(open) =>
          setBreakdownDrawerState((prev) => ({ ...prev, open, activeRowId: open ? prev.activeRowId : null }))
        }
      />
    </div>
  );
}
