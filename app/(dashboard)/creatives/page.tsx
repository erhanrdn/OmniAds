"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { buildDefaultProviderDomains, deriveProviderViewState } from "@/store/integrations-support";
import { isDemoBusinessSelected } from "@/lib/business-mode";
import { EmptyState } from "@/components/states/empty-state";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LockedFeatureCard } from "@/components/states/LockedFeatureCard";
import { ErrorState } from "@/components/states/error-state";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { Button } from "@/components/ui/button";
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
import { getCreativeDecisionOs, type CreativeDecisionOs, type CreativeDecisionOperatorQueue } from "@/src/services";
import {
  CreativesTableShell,
  buildCreativeHistoryById,
  fetchMetaCreatives,
  fetchMetaCreativesHistory,
  getPreviewPollingInterval,
  hasRenderablePreview,
  mapApiRowToUiRow,
  PLATFORM_LABELS,
  PreviewStripState,
  SHARE_METRIC_IDS,
  shouldPollForPreviewReadiness,
  toCsv,
  toSharedCreative,
  type CreativeHistoryWindowKey,
} from "@/app/(dashboard)/creatives/page-support";
import { useBusinessIntegrationsBootstrap } from "@/hooks/use-business-integrations-bootstrap";
import { PlanGate } from "@/components/pricing/PlanGate";
import { usePlanState } from "@/lib/pricing/usePlan";
import { PRICING_PLANS } from "@/lib/pricing/plans";
import {
  META_WAREHOUSE_HISTORY_DAYS,
  addDaysToIsoDate,
  dayCountInclusive,
} from "@/lib/meta/history";
import { getCreativeStaticPreviewState } from "@/lib/meta/creatives-preview";

function clampCreativeDateRangeToHistoryLimit(
  value: CreativeDateRangeValue,
  maxHistoryDays: number | null
): CreativeDateRangeValue {
  if (maxHistoryDays === null) return value;
  const resolved = resolveCreativeDateRange(value);
  const totalDays = dayCountInclusive(resolved.start, resolved.end);
  if (totalDays <= maxHistoryDays) return value;
  return {
    ...value,
    preset: "custom",
    customStart: addDaysToIsoDate(resolved.end, -(maxHistoryDays - 1)),
    customEnd: resolved.end,
    lastDays: Math.min(value.lastDays, maxHistoryDays),
  };
}

function scheduleIdlePhase(work: () => void, timeout = 900) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const idleWindow = window as typeof window & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    const idleHandle = idleWindow.requestIdleCallback(() => work(), { timeout });
    return () => idleWindow.cancelIdleCallback?.(idleHandle);
  }

  const timeoutHandle = window.setTimeout(work, Math.min(timeout, 350));
  return () => window.clearTimeout(timeoutHandle);
}

const CreativeDetailExperience = dynamic(
  () => import("@/components/creatives/CreativeDetailExperience").then((mod) => mod.CreativeDetailExperience),
  { ssr: false, loading: () => null }
);
const CreativeAdBreakdownDrawer = dynamic(
  () => import("@/components/creatives/CreativeAdBreakdownDrawer").then((mod) => mod.CreativeAdBreakdownDrawer),
  { ssr: false, loading: () => null }
);
const CreativeDecisionOsDrawer = dynamic(
  () => import("@/components/creatives/CreativeDecisionOsDrawer").then((mod) => mod.CreativeDecisionOsDrawer),
  { ssr: false, loading: () => null }
);

export default function CreativesPage() {
  const router = useRouter();
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businesses = useAppStore((state) => state.businesses);
  const { plan: currentPlan } = usePlanState();
  const businessId = selectedBusinessId ?? "";
  const selectedBusinessCurrency =
    businesses.find((business) => business.id === selectedBusinessId)?.currency ?? null;
  const language = usePreferencesStore((state) => state.language);
  const creativeOperatorPreset = usePreferencesStore((state) => state.creativeOperatorPreset);
  const setCreativeOperatorPreset = usePreferencesStore((state) => state.setCreativeOperatorPreset);

  const domains = useIntegrationsStore((state) =>
    selectedBusinessId ? state.domainsByBusinessId[selectedBusinessId] : undefined
  );
  const assignedAccountsByBusiness = useIntegrationsStore(
    (state) => state.assignedAccountsByBusiness
  );
  const { isBootstrapping, bootstrapStatus } = useBusinessIntegrationsBootstrap(
    selectedBusinessId ?? null
  );

  const [dateRangeValue, setDateRangeValue] = usePersistentCreativeDateRange();
  const allowedHistoryDays = PRICING_PLANS[currentPlan].limits.analyticsHistoryDays;
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
  const [historyPhaseStarted, setHistoryPhaseStarted] = useState(false);
  const [tableSortedRows, setTableSortedRows] = useState<MetaCreativeRow[]>([]);
  const [decisionOsFamilyFilter, setDecisionOsFamilyFilter] = useState<string | null>(null);
  const [decisionOsQueueFilter, setDecisionOsQueueFilter] = useState<CreativeDecisionOperatorQueue["key"] | null>(null);
  const [decisionOsDrawerOpen, setDecisionOsDrawerOpen] = useState(false);

  const platform: "meta" = "meta";
  const metaView = deriveProviderViewState(
    "meta",
    domains?.meta ?? buildDefaultProviderDomains().meta
  );
  const isDemoBusiness = isDemoBusinessSelected(selectedBusinessId, businesses);
  const platformConnected = metaView.isConnected || isDemoBusiness;
  const showBootstrapGuard =
    !isDemoBusiness &&
    (isBootstrapping ||
      metaView.status === "loading_data" ||
      (bootstrapStatus !== "ready" && !metaView.isConnected));
  const assignedMetaAccounts = assignedAccountsByBusiness[businessId]?.meta ?? [];
  const metaHasAssignments = isDemoBusiness || assignedMetaAccounts.length > 0;
  const canLoadCreatives =
    platform === "meta" && platformConnected && metaHasAssignments;

  const { start: drStart, end: drEnd } = resolveCreativeDateRange(dateRangeValue);
  const setBoundedDateRangeValue = useCallback(
    (next: CreativeDateRangeValue) => {
      setDateRangeValue(clampCreativeDateRangeToHistoryLimit(next, allowedHistoryDays));
    },
    [allowedHistoryDays, setDateRangeValue]
  );
  const mainTableApiGroupBy = mapCreativeGroupByToApi(groupBy);
  const endDate = new Date(`${drEnd}T00:00:00.000Z`);
  const offsetIso = useCallback(
    (days: number) => {
      const date = new Date(endDate);
      date.setUTCDate(date.getUTCDate() - days);
      return date.toISOString().slice(0, 10);
    },
    [endDate]
  );

  useEffect(() => {
    const normalized = clampCreativeDateRangeToHistoryLimit(dateRangeValue, allowedHistoryDays);
    if (JSON.stringify(normalized) !== JSON.stringify(dateRangeValue)) {
      setDateRangeValue(normalized);
    }
  }, [allowedHistoryDays, dateRangeValue, setDateRangeValue]);

  useEffect(() => {
    setHistoryPhaseStarted(false);
  }, [businessId, drStart, drEnd, groupBy]);

  const creativesMetadataQuery = useQuery({
    queryKey: [
      "meta-creatives-creatives-metadata",
      businessId,
      drStart,
      drEnd,
      groupBy,
    ],
    enabled: canLoadCreatives,
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
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => getPreviewPollingInterval(query.state.data),
    placeholderData: (previousData) => previousData,
  });
  const shouldLoadHistory =
    historyPhaseStarted || creativeDrawerState.open || breakdownDrawerState.open;
  useEffect(() => {
    if (!canLoadCreatives || shouldLoadHistory) return;
    if (creativesMetadataQuery.isLoading || creativesMetadataQuery.isFetching) return;
    if ((creativesMetadataQuery.data?.rows?.length ?? 0) === 0) return;
    return scheduleIdlePhase(() => setHistoryPhaseStarted(true), 1_500);
  }, [
    canLoadCreatives,
    creativesMetadataQuery.data?.rows?.length,
    creativesMetadataQuery.isFetching,
    creativesMetadataQuery.isLoading,
    shouldLoadHistory,
  ]);
  const creativeHistoryWindowDefs = useMemo<Array<{ key: CreativeHistoryWindowKey; start: string; end: string }>>(
    () => [
      { key: "last3", start: offsetIso(2), end: drEnd },
      { key: "last7", start: offsetIso(6), end: drEnd },
      { key: "last14", start: offsetIso(13), end: drEnd },
      { key: "last30", start: offsetIso(29), end: drEnd },
      { key: "last90", start: offsetIso(89), end: drEnd },
      { key: "allHistory", start: offsetIso(META_WAREHOUSE_HISTORY_DAYS - 1), end: drEnd },
    ],
    [drEnd, offsetIso]
  );
  const creativeHistoryQueries = useQueries({
    queries: creativeHistoryWindowDefs.map((windowDef) => ({
      queryKey: [
        "meta-creatives-history",
        businessId,
        drEnd,
        groupBy,
        windowDef.key,
        windowDef.start,
        windowDef.end,
      ],
      enabled: canLoadCreatives && shouldLoadHistory,
      queryFn: () =>
        fetchMetaCreativesHistory({
          businessId,
          start: windowDef.start,
          end: windowDef.end,
          groupBy: mainTableApiGroupBy,
          format: "all",
          sort: "spend",
          mediaMode: "metadata",
        }),
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    })),
  });
  const adBreakdownQuery = useQuery({
    queryKey: ["meta-creatives-ad-breakdown", businessId, drStart, drEnd],
    enabled:
      canLoadCreatives &&
      breakdownDrawerState.open &&
      Boolean(breakdownDrawerState.activeRowId),
    queryFn: () =>
      fetchMetaCreativesHistory({
        businessId,
        start: drStart,
        end: drEnd,
        groupBy: "adName",
        format: "all",
        sort: "spend",
      }),
  });
  const creativeDecisionOsQuery = useQuery({
    queryKey: ["creative-decision-os", businessId, drStart, drEnd],
    enabled: canLoadCreatives,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () => getCreativeDecisionOs(businessId, drStart, drEnd),
  });
  const activeCreativesPayload = creativesMetadataQuery.data;
  const creativeDecisionOs = creativeDecisionOsQuery.data ?? null;

  const allRows = useMemo(() => {
    const payloadRows = activeCreativesPayload?.rows ?? [];
    const rows = payloadRows.map(mapApiRowToUiRow);
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
      const rawRows = payloadRows;
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
        status: activeCreativesPayload?.status,
        total_rows: rawRows.length,
        has_preview_field: rawRows.length > 0 ? typeof rawRows[0]?.preview : "N/A",
        media_mode: activeCreativesPayload?.media_mode ?? null,
      });
    }
    return rows;
  }, [activeCreativesPayload?.media_mode, activeCreativesPayload?.rows]);

  const decisionOsFocusIds = useMemo(() => {
    if (!creativeDecisionOs) return null;
    if (decisionOsFamilyFilter) {
      const family = creativeDecisionOs.families.find((item) => item.familyId === decisionOsFamilyFilter);
      return family ? new Set(family.creativeIds) : null;
    }
    if (decisionOsQueueFilter) {
      const queue = creativeDecisionOs.operatorQueues.find((item) => item.key === decisionOsQueueFilter);
      return queue ? new Set(queue.creativeIds) : null;
    }
    return null;
  }, [creativeDecisionOs, decisionOsFamilyFilter, decisionOsQueueFilter]);
  const clearDecisionOsFilters = useCallback(() => {
    setDecisionOsFamilyFilter(null);
    setDecisionOsQueueFilter(null);
  }, []);
  const activeDecisionOsQueue = useMemo(
    () =>
      decisionOsQueueFilter
        ? creativeDecisionOs?.operatorQueues.find((item) => item.key === decisionOsQueueFilter) ?? null
        : null,
    [creativeDecisionOs, decisionOsQueueFilter],
  );
  const activeDecisionOsFamily = useMemo(
    () =>
      decisionOsFamilyFilter
        ? creativeDecisionOs?.families.find((item) => item.familyId === decisionOsFamilyFilter) ?? null
        : null,
    [creativeDecisionOs, decisionOsFamilyFilter],
  );
  const filteredRows = useMemo(() => {
    if (platform !== "meta") return [];
    const baseRows = applyCreativeFilters(allRows, topFilters, creativeDecisionOs);
    if (!decisionOsFocusIds || decisionOsFocusIds.size === 0) return baseRows;
    return baseRows.filter((row) => decisionOsFocusIds.has(row.id));
  }, [allRows, creativeDecisionOs, decisionOsFocusIds, platform, topFilters]);
  const creativeHistoryById = useMemo(() => {
    const historyRows: Partial<Record<CreativeHistoryWindowKey, MetaCreativeRow[]>> = {};
    creativeHistoryQueries.forEach((query, index) => {
      const key = creativeHistoryWindowDefs[index]?.key;
      if (!key) return;
      historyRows[key] = (query.data?.rows ?? []).map(mapApiRowToUiRow);
    });
    return buildCreativeHistoryById(historyRows);
  }, [creativeHistoryQueries, creativeHistoryWindowDefs]);
  const deferredFilteredRows = useDeferredValue(filteredRows);

  const orderedTableRows = useMemo(() => {
    if (tableSortedRows.length === 0) return deferredFilteredRows;

    const filteredIds = new Set(deferredFilteredRows.map((row) => row.id));
    const sortedVisibleRows = tableSortedRows.filter((row) => filteredIds.has(row.id));

    return sortedVisibleRows.length === deferredFilteredRows.length
      ? sortedVisibleRows
      : deferredFilteredRows;
  }, [deferredFilteredRows, tableSortedRows]);

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

  const selectedRows = useMemo(() => {
    const selectedRowIdSet = new Set(selectionState.selectedRowIds);
    return orderedTableRows.filter((row) => selectedRowIdSet.has(row.id));
  }, [orderedTableRows, selectionState.selectedRowIds]);
  const topPanelRows = useMemo(
    () => (selectedRows.length > 0 ? selectedRows : orderedTableRows),
    [orderedTableRows, selectedRows]
  );
  const topPreviewRows = useMemo(() => topPanelRows.slice(0, 20), [topPanelRows]);
  const previewStripSummary = useMemo(() => {
    const states = topPreviewRows.map((row) =>
      hasRenderablePreview(row) ? "ready" : getCreativeStaticPreviewState(row, "grid")
    );

    const ready = states.filter((state) => state === "ready").length;
    const pending = states.filter((state) => state === "pending").length;
    const missing = states.filter((state) => state === "missing").length;

    return {
      total: topPreviewRows.length,
      ready,
      pending,
      missing,
      minimumReady: Math.min(3, topPreviewRows.length),
    };
  }, [topPreviewRows]);
  const previewStripState = useMemo<PreviewStripState>(() => {
    const metadataRows = activeCreativesPayload?.rows ?? [];
    const hasMetadataRows = metadataRows.length > 0;

    if (!hasMetadataRows) {
      if (creativesMetadataQuery.isLoading || creativesMetadataQuery.isFetching) {
        return "data_loading";
      }
      return "missing";
    }

    if (topPreviewRows.length === 0) return "missing";
    if (previewStripSummary.ready > 0) return "ready";
    if (shouldPollForPreviewReadiness(activeCreativesPayload)) return "data_loading";
    if (previewStripSummary.pending > 0) return "data_loading";
    return "missing";
  }, [
    activeCreativesPayload,
    creativesMetadataQuery.isFetching,
    creativesMetadataQuery.isLoading,
    previewStripSummary.pending,
    previewStripSummary.ready,
    topPreviewRows.length,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (topPanelRows.length === 0 && filteredRows.length === 0) return;

    console.log("[creatives-page] before CreativesTopSection", {
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
  }, [filteredRows, topPanelRows]);

  const activeCreativeRow = useMemo(
    () => allRows.find((row) => row.id === creativeDrawerState.activeRowId) ?? null,
    [allRows, creativeDrawerState.activeRowId]
  );
  const activeBreakdownCreativeRow = useMemo(
    () => allRows.find((row) => row.id === breakdownDrawerState.activeRowId) ?? null,
    [allRows, breakdownDrawerState.activeRowId]
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

  const dataStatus = activeCreativesPayload?.status;

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
    <PlanGate requiredPlan="growth">
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Top Creatives</h1>
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-[11px]">
            {[
              ["action_first", "Action-first"],
              ["creative_rich", "Creative-rich"],
              ["media_limited", "Media-limited"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCreativeOperatorPreset(value as typeof creativeOperatorPreset)}
                className={
                  creativeOperatorPreset === value
                    ? "rounded-full bg-slate-900 px-2.5 py-1 font-medium text-white"
                    : "rounded-full px-2.5 py-1 text-slate-600 hover:bg-slate-50"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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

        if (showBootstrapGuard) {
          return (
            <LoadingSkeleton
              rows={5}
              title={
                language === "tr"
                  ? "Creative görünümü hazırlanıyor"
                  : "Preparing the creatives view"
              }
              description={
                language === "tr"
                  ? "Meta bağlantısı, hesap atamaları ve ilk creative özetleri kontrol ediliyor."
                  : "We are checking the Meta connection, assigned accounts, and the initial creative snapshot."
              }
            />
          );
        }

        if (!platformConnected) {
          return (
            <IntegrationEmptyState
              providerLabel="Meta"
              status={metaView.status === "action_required" ? "error" : "disconnected"}
              title={
                language === "tr"
                  ? "Creative performansını açmak için Meta'yı bağlayın"
                  : "Connect Meta to unlock creative performance"
              }
              description={
                language === "tr"
                  ? "Creative performansı, önizlemeler ve paylaşım araçları Meta bağlantısı tamamlandığında görünür."
                  : "Creative performance, preview coverage, and sharing tools appear once Meta is connected."
              }
            />
          );
        }

        if (!metaHasAssignments || dataStatus === "no_accounts_assigned") {
          return (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-base font-semibold">
                {language === "tr"
                  ? "Creative verilerini açmak için Meta reklam hesaplarını atayın"
                  : "Assign Meta ad accounts to load creatives"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {language === "tr"
                  ? "Önce bu işletmeye en az bir Meta reklam hesabı bağlayıp atayın."
                  : "Connect and assign at least one Meta ad account for this business first."}
              </p>
              <Button className="mt-4" variant="outline" onClick={() => router.push("/integrations") }>
                {language === "tr" ? "Entegrasyonları aç" : "Open Integrations"}
              </Button>
            </div>
          );
        }

        return (
          <>
            <CreativesTopSection
              businessId={businessId}
              showHeader={false}
              showGroupByControl={false}
              showAiActionsRow={false}
              dateRange={dateRangeValue}
              onDateRangeChange={setBoundedDateRangeValue}
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
              previewStripSummary={previewStripSummary}
              decisionOs={creativeDecisionOs}
              actionsPrefix={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setDecisionOsDrawerOpen(true)}
                  >
                    {creativeDecisionOsQuery.isLoading && !creativeDecisionOs
                      ? "Show why · Loading..."
                      : "Show why"}
                  </Button>

                  {(activeDecisionOsQueue || activeDecisionOsFamily) ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {activeDecisionOsQueue ? (
                        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-medium text-sky-800">
                          Reasoning filter: {activeDecisionOsQueue.label}
                        </span>
                      ) : null}
                      {activeDecisionOsFamily ? (
                        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-medium text-violet-800">
                          Family: {activeDecisionOsFamily.familyLabel}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={clearDecisionOsFilters}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>
              }
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
                  title={
                    (activeCreativesPayload?.rows?.length ?? 0) > 0
                      ? language === "tr"
                        ? "Bu filtrelerle eşleşen creative bulunamadı"
                        : "No creatives match the current filters"
                      : language === "tr"
                        ? "Seçili aralık için creative performans verisi bulunamadı"
                        : "No creative performance data found for the selected range"
                  }
                  description={
                    (activeCreativesPayload?.rows?.length ?? 0) > 0
                      ? language === "tr"
                        ? "Tarih aralığını veya filtreleri gevşeterek daha fazla creative görebilirsiniz."
                        : "Relax the current filters or widen the date range to reveal more creatives."
                      : language === "tr"
                        ? "Daha geniş bir tarih aralığı deneyin veya bağlı Meta hesaplarında aktif reklam yayını olduğunu doğrulayın."
                        : "Try a wider date range or verify that assigned Meta accounts have active ad delivery."
                  }
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
                    creativeHistoryById={creativeHistoryById}
                    decisionOs={creativeDecisionOs}
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
                    onSortedRowsChange={setTableSortedRows}
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
        creativeHistoryById={creativeHistoryById}
        decisionOs={creativeDecisionOs}
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
      <CreativeDecisionOsDrawer
        decisionOs={creativeDecisionOs}
        isLoading={creativeDecisionOsQuery.isLoading}
        open={decisionOsDrawerOpen}
        onOpenChange={setDecisionOsDrawerOpen}
        activeFamilyId={decisionOsFamilyFilter}
        activeQueueKey={decisionOsQueueFilter}
        onSelectFamily={(familyId) => {
          setDecisionOsQueueFilter(null);
          setDecisionOsFamilyFilter(familyId);
        }}
        onSelectQueue={(queueKey) => {
          setDecisionOsFamilyFilter(null);
          setDecisionOsQueueFilter(queueKey);
        }}
        onClearFilters={clearDecisionOsFilters}
      />
    </div>
    </PlanGate>
  );
}
