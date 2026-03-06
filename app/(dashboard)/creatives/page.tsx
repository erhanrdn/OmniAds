"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/states/empty-state";
import { CreativeFiltersState } from "@/components/creatives/CreativeFiltersBar";
import { CreativesToolbar } from "@/components/creatives/CreativesToolbar";
import {
  DEFAULT_TABLE_METRICS,
  MetaCreativeRow,
} from "@/components/creatives/metricConfig";
import { TableControlsBar, TableViewState } from "@/components/creatives/TableControlsBar";
import { CreativesTopGrid } from "@/components/creatives/CreativesTopGrid";
import { CreativesMotionTable } from "@/components/creatives/CreativesMotionTable";
import { CreativeInsightsDrawer } from "@/components/creatives/CreativeInsightsDrawer";
import { ShareCreativesModal } from "@/components/creatives/ShareCreativesModal";

const META_ROWS: MetaCreativeRow[] = [
  {
    id: "m-1",
    name: "UGC Reel - Morning routine hook",
    format: "video",
    thumbnailUrl: "https://picsum.photos/seed/meta1/640/360",
    launchDate: "2026-02-21",
    tags: ["winner", "retargeting"],
    spend: 1840,
    purchaseValue: 6980,
    roas: 3.79,
    cpa: 24.86,
    cpcLink: 0.94,
    cpm: 17.9,
    ctrAll: 2.41,
    purchases: 74,
    thumbstop: 33.6,
    clickToPurchase: 5.7,
    video25: 41.2,
    video50: 24.5,
    atcToPurchaseRatio: 46.8,
  },
  {
    id: "m-2",
    name: "Static card - 20% off tonight",
    format: "image",
    thumbnailUrl: "https://picsum.photos/seed/meta2/640/360",
    launchDate: "2026-02-24",
    tags: ["promo", "prospecting"],
    spend: 1320,
    purchaseValue: 4020,
    roas: 3.05,
    cpa: 28.09,
    cpcLink: 1.08,
    cpm: 16.4,
    ctrAll: 2.02,
    purchases: 47,
    thumbstop: 29.1,
    clickToPurchase: 4.8,
    video25: 0,
    video50: 0,
    atcToPurchaseRatio: 38.4,
  },
  {
    id: "m-3",
    name: "Founder story - trust angle",
    format: "video",
    thumbnailUrl: "https://picsum.photos/seed/meta3/640/360",
    launchDate: "2026-02-19",
    tags: ["video", "evergreen"],
    spend: 2210,
    purchaseValue: 8320,
    roas: 3.76,
    cpa: 26.95,
    cpcLink: 1.01,
    cpm: 19.8,
    ctrAll: 2.26,
    purchases: 82,
    thumbstop: 35.4,
    clickToPurchase: 5.5,
    video25: 44.3,
    video50: 28.7,
    atcToPurchaseRatio: 49.2,
  },
  {
    id: "m-4",
    name: "Offer explainer - carousel",
    format: "image",
    thumbnailUrl: "https://picsum.photos/seed/meta4/640/360",
    launchDate: "2026-02-12",
    tags: ["carousel", "offer"],
    spend: 980,
    purchaseValue: 2690,
    roas: 2.74,
    cpa: 31.61,
    cpcLink: 1.22,
    cpm: 14.9,
    ctrAll: 1.84,
    purchases: 31,
    thumbstop: 26.3,
    clickToPurchase: 4.2,
    video25: 0,
    video50: 0,
    atcToPurchaseRatio: 34.6,
  },
  {
    id: "m-5",
    name: "Problem-solution demo cut",
    format: "video",
    thumbnailUrl: "https://picsum.photos/seed/meta5/640/360",
    launchDate: "2026-02-15",
    tags: ["testing", "demo"],
    spend: 1640,
    purchaseValue: 5180,
    roas: 3.16,
    cpa: 27.8,
    cpcLink: 0.98,
    cpm: 18.1,
    ctrAll: 2.33,
    purchases: 59,
    thumbstop: 31.5,
    clickToPurchase: 5.1,
    video25: 37.8,
    video50: 22.4,
    atcToPurchaseRatio: 44.1,
  },
  {
    id: "m-6",
    name: "Lifestyle static - social proof",
    format: "image",
    thumbnailUrl: "https://picsum.photos/seed/meta6/640/360",
    launchDate: "2026-02-26",
    tags: ["social proof", "image"],
    spend: 760,
    purchaseValue: 2380,
    roas: 3.13,
    cpa: 25.33,
    cpcLink: 0.89,
    cpm: 13.7,
    ctrAll: 2.17,
    purchases: 30,
    thumbstop: 0,
    clickToPurchase: 5.0,
    video25: 0,
    video50: 0,
    atcToPurchaseRatio: 42.8,
  },
  {
    id: "m-7",
    name: "UGC split-test variant B",
    format: "video",
    thumbnailUrl: "https://picsum.photos/seed/meta7/640/360",
    launchDate: "2026-02-28",
    tags: ["split test", "video"],
    spend: 1450,
    purchaseValue: 3790,
    roas: 2.61,
    cpa: 33.72,
    cpcLink: 1.17,
    cpm: 20.8,
    ctrAll: 1.95,
    purchases: 43,
    thumbstop: 28.4,
    clickToPurchase: 4.1,
    video25: 35.2,
    video50: 19.4,
    atcToPurchaseRatio: 31.9,
  },
  {
    id: "m-8",
    name: "Bundle offer - creator POV",
    format: "video",
    thumbnailUrl: "https://picsum.photos/seed/meta8/640/360",
    launchDate: "2026-03-01",
    tags: ["creator", "bundle"],
    spend: 1090,
    purchaseValue: 4120,
    roas: 3.78,
    cpa: 22.71,
    cpcLink: 0.84,
    cpm: 15.2,
    ctrAll: 2.47,
    purchases: 48,
    thumbstop: 34.2,
    clickToPurchase: 5.9,
    video25: 40.8,
    video50: 25.7,
    atcToPurchaseRatio: 47.4,
  },
];

export default function CreativesPage() {
  const [creativeFilters, setCreativeFilters] = useState<CreativeFiltersState>({
    dateRange: "14",
    groupBy: "adName",
    selectedTags: [],
    format: "all",
    sort: "roas",
    platform: "meta",
  });
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [notesByRowId, setNotesByRowId] = useState<Record<string, string>>({});
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const filteredRows = useMemo(() => {
    if (creativeFilters.platform !== "meta") return [];

    const now = new Date("2026-03-05T12:00:00.000Z");
    const minDate = new Date(now);
    minDate.setDate(now.getDate() - Number(creativeFilters.dateRange));

    const rows = META_ROWS.filter((row) => {
      const dateOk = new Date(row.launchDate) >= minDate;
      const formatOk = creativeFilters.format === "all" ? true : row.format === creativeFilters.format;
      const tagsOk =
        creativeFilters.selectedTags.length === 0
          ? true
          : creativeFilters.selectedTags.every((tag) => row.tags.includes(tag));
      return dateOk && formatOk && tagsOk;
    });

    return [...rows].sort((a, b) => b[creativeFilters.sort] - a[creativeFilters.sort]);
  }, [creativeFilters]);

  useEffect(() => {
    setSelectionState((prev) => {
      const filteredIds = new Set(filteredRows.map((row) => row.id));
      const kept = prev.selectedRowIds.filter((id) => filteredIds.has(id));
      if (kept.length > 0) return { selectedRowIds: kept };
      return { selectedRowIds: filteredRows.slice(0, 4).map((row) => row.id) };
    });
  }, [filteredRows]);

  useEffect(() => {
    if (creativeFilters.platform === "meta") return;
    setDrawerState({ open: false, activeRowId: null });
  }, [creativeFilters.platform]);

  const selectedRows = useMemo(
    () =>
      filteredRows
        .filter((row) => selectionState.selectedRowIds.includes(row.id))
        .slice(0, 8),
    [filteredRows, selectionState.selectedRowIds]
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

  const showComingSoon = () => {
    setToastMessage("Coming soon");
    setTimeout(() => setToastMessage(null), 1400);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Creatives</h1>
        <p className="text-sm text-muted-foreground">
          Motion-style creative analytics workspace.
        </p>
      </div>

      {toastMessage && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          {toastMessage}
        </div>
      )}

      <CreativesToolbar
        rows={META_ROWS}
        value={creativeFilters}
        onChange={setCreativeFilters}
        onComingSoon={showComingSoon}
        selectedCount={selectionState.selectedRowIds.length}
        onShareSelected={() => setShareModalOpen(true)}
      />

      {creativeFilters.platform !== "meta" ? (
        <EmptyState
          title="Motion view unavailable"
          description="Only Meta is supported in Motion view for now."
        />
      ) : (
        <>
          <CreativesTopGrid
            rows={selectedRows}
            selectedIds={selectionState.selectedRowIds}
            onToggleSelect={toggleRowSelection}
            onOpenRow={(rowId) => openDrawer(rowId, true)}
          />

          <TableControlsBar value={tableViewState} onChange={setTableViewState} />

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
        </>
      )}

      {shareModalOpen && (
        <ShareCreativesModal
          selectedCount={selectionState.selectedRowIds.length}
          onClose={() => setShareModalOpen(false)}
        />
      )}

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
