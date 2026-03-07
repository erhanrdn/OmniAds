"use client";

import { useEffect, useMemo, useState } from "react";
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
  DEFAULT_TABLE_METRICS,
  type MetaCreativeRow,
} from "@/components/creatives/metricConfig";
import { TableViewState } from "@/components/creatives/TableControlsBar";
import { CreativesMotionTable } from "@/components/creatives/CreativesMotionTable";
import { CreativeInsightsDrawer } from "@/components/creatives/CreativeInsightsDrawer";
import type { MetaCreativeApiRow } from "@/app/api/meta/creatives/route";
import {
  applyMotionFilters,
  DEFAULT_MOTION_DATE_RANGE,
  DEFAULT_TOP_METRIC_IDS,
  mapMotionGroupByToApi,
  MotionDateRangeValue,
  MotionFilterRule,
  MotionGroupBy,
  MotionTopSection,
  resolveMotionDateRange,
} from "@/components/creatives/MotionTopSection";

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

  return payload as MetaCreativesResponse;
}

function mapApiRowToUiRow(row: MetaCreativeApiRow): MetaCreativeRow {
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    thumbnailUrl: row.thumbnail_url,
    previewUrl: row.preview_url,
    imageUrl: row.image_url,
    isCatalog: row.is_catalog,
    previewState: row.preview_state,
    launchDate: row.launch_date,
    tags: row.tags ?? [],
    spend: row.spend,
    purchaseValue: row.purchase_value,
    roas: row.roas,
    cpa: row.cpa,
    cpcLink: row.cpc_link,
    cpm: row.cpm,
    ctrAll: row.ctr_all,
    purchases: row.purchases,
    thumbstop: 0,
    clickToPurchase: 0,
    video25: 0,
    video50: 0,
    atcToPurchaseRatio: 0,
  };
}

export default function CreativesPage() {
  const router = useRouter();
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";

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
  const [topMetricIds, setTopMetricIds] = useState<string[]>(DEFAULT_TOP_METRIC_IDS);
  const [tableViewState, setTableViewState] = useState<TableViewState>({
    selectedMetrics: DEFAULT_TABLE_METRICS,
    density: "comfortable",
    heatmapIntensity: "medium",
  });
  const [selectionState, setSelectionState] = useState<{ selectedRowIds: string[] }>({
    selectedRowIds: [],
  });
  const [drawerState, setDrawerState] = useState<{ open: boolean; activeRowId: string | null }>({
    open: false,
    activeRowId: null,
  });
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [notesByRowId, setNotesByRowId] = useState<Record<string, string>>({});

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
        sort: "roas",
      }),
  });

  const allRows = useMemo(
    () => (creativesQuery.data?.rows ?? []).map(mapApiRowToUiRow),
    [creativesQuery.data?.rows]
  );

  const filteredRows = useMemo(() => {
    if (platform !== "meta") return [];
    return applyMotionFilters(allRows, topFilters);
  }, [allRows, platform, topFilters]);

  useEffect(() => {
    setSelectionState((prev) => {
      const filteredIds = new Set(filteredRows.map((row) => row.id));
      const kept = prev.selectedRowIds.filter((id) => filteredIds.has(id));
      if (kept.length > 0) return { selectedRowIds: kept };
      return { selectedRowIds: filteredRows.slice(0, 4).map((row) => row.id) };
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

  const activeRow = useMemo(
    () => filteredRows.find((row) => row.id === drawerState.activeRowId) ?? null,
    [filteredRows, drawerState.activeRowId]
  );

  const toggleRowSelection = (rowId: string) => {
    setSelectionState((prev) => ({
      selectedRowIds: prev.selectedRowIds.includes(rowId)
        ? prev.selectedRowIds.filter((id) => id !== rowId)
        : [...prev.selectedRowIds, rowId],
    }));
  };

  const toggleAllRows = () => {
    const allIds = filteredRows.map((row) => row.id);
    setSelectionState((prev) => ({
      selectedRowIds: allIds.every((id) => prev.selectedRowIds.includes(id)) ? [] : allIds,
    }));
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
        <h1 className="text-2xl font-semibold tracking-tight">Creatives</h1>
        <p className="text-sm text-muted-foreground">
          Motion-style creative analytics workspace.
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
              onOpenRow={(rowId) => openDrawer(rowId, true)}
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
                <CreativesMotionTable
                  rows={filteredRows}
                  selectedMetrics={tableViewState.selectedMetrics}
                  selectedRowIds={selectionState.selectedRowIds}
                  highlightedRowId={highlightedRowId}
                  density={tableViewState.density}
                  heatmapIntensity={tableViewState.heatmapIntensity}
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
