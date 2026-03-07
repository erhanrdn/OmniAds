"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  GripVertical,
  Plus,
  Search,
  Settings2,
  Tag,
  X,
} from "lucide-react";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { cn } from "@/lib/utils";

type GoodDirection = "high" | "low" | "neutral";
type ColorFormattingMode = "heatmap" | "none";
type TableColumnAlign = "left" | "right" | "center";

type TableColumnKey =
  | "associatedAds"
  | "spend"
  | "purchaseValue"
  | "roas"
  | "cpa"
  | "cpcLink"
  | "cpm"
  | "cpcAll"
  | "averageOrderValue"
  | "clickToAtcRatio"
  | "atcToPurchaseRatio"
  | "purchases"
  | "firstFrameRetention"
  | "thumbstopRatio"
  | "ctrOutbound"
  | "clickToPurchaseRatio"
  | "ctrAll"
  | "video25Rate"
  | "video50Rate"
  | "video75Rate"
  | "video100Rate"
  | "holdRate"
  | "hookScore"
  | "purchaseValueShare"
  | "watchScore"
  | "clickScore"
  | "convertScore"
  | "averageOrderValueWebsite"
  | "averageOrderValueShop"
  | "impressions"
  | "spendShare"
  | "linkCtr"
  | "websitePurchaseRoas"
  | "clickToWebsitePurchaseRatio"
  | "purchasesPer1000Imp"
  | "revenuePer1000Imp"
  | "clicksAll"
  | "linkClicks";

type TagKey =
  | "assetType"
  | "visualFormat"
  | "intendedAudience"
  | "messagingAngle"
  | "seasonality"
  | "offerType"
  | "hookTactic"
  | "headlineTactic";

interface TableColumnDefinition {
  key: TableColumnKey;
  label: string;
  description: string;
  direction: GoodDirection;
  minWidth: number;
  preferredWidth: number;
  align: TableColumnAlign;
  format: (n: number) => string;
  getValue: (row: MetaCreativeRow, ctx: TableCalcContext) => number;
}

interface TableCalcContext {
  totalSpend: number;
  totalPurchaseValue: number;
}

interface TablePreset {
  presetName: string;
  selectedColumns: TableColumnKey[];
  selectedTags: TagKey[];
  resultsPerPage: 20 | 50 | 100;
  colorFormatting: ColorFormattingMode;
  showTags: boolean;
  showActiveStatus: boolean;
  showLaunchDate: boolean;
  showAdLength: boolean;
}

interface MotionCreativesTableSectionProps {
  rows: MetaCreativeRow[];
  selectedRowIds: string[];
  highlightedRowId?: string | null;
  onToggleRow: (rowId: string) => void;
  onToggleAll: () => void;
  onOpenRow: (rowId: string) => void;
}

const FACEBOOK_ECOMMERCE_COLUMNS: TableColumnKey[] = [
  "associatedAds",
  "spend",
  "purchaseValue",
  "roas",
  "cpa",
  "cpcLink",
  "cpm",
  "cpcAll",
  "averageOrderValue",
  "clickToAtcRatio",
  "atcToPurchaseRatio",
  "purchases",
  "firstFrameRetention",
  "thumbstopRatio",
  "ctrOutbound",
  "clickToPurchaseRatio",
  "ctrAll",
  "video25Rate",
  "video50Rate",
  "video75Rate",
  "video100Rate",
  "holdRate",
  "hookScore",
  "purchaseValueShare",
];

const PRESETS: TablePreset[] = [
  {
    presetName: "Facebook Ecommerce",
    selectedColumns: FACEBOOK_ECOMMERCE_COLUMNS,
    selectedTags: [],
    resultsPerPage: 20,
    colorFormatting: "heatmap",
    showTags: true,
    showActiveStatus: false,
    showLaunchDate: true,
    showAdLength: false,
  },
  {
    presetName: "Facebook Video",
    selectedColumns: [
      "spend",
      "roas",
      "video25Rate",
      "video50Rate",
      "video75Rate",
      "video100Rate",
      "holdRate",
      "thumbstopRatio",
      "firstFrameRetention",
      "hookScore",
    ],
    selectedTags: [],
    resultsPerPage: 20,
    colorFormatting: "heatmap",
    showTags: true,
    showActiveStatus: false,
    showLaunchDate: true,
    showAdLength: true,
  },
  {
    presetName: "Creative teams",
    selectedColumns: ["spend", "purchaseValue", "roas", "hookScore", "watchScore", "clickScore", "convertScore"],
    selectedTags: ["assetType", "messagingAngle"],
    resultsPerPage: 20,
    colorFormatting: "heatmap",
    showTags: true,
    showActiveStatus: false,
    showLaunchDate: true,
    showAdLength: false,
  },
  {
    presetName: "Facebook SaaS",
    selectedColumns: ["spend", "cpcLink", "ctrAll", "clicksAll", "linkClicks", "roas"],
    selectedTags: [],
    resultsPerPage: 20,
    colorFormatting: "heatmap",
    showTags: false,
    showActiveStatus: true,
    showLaunchDate: true,
    showAdLength: true,
  },
  {
    presetName: "Customize columns",
    selectedColumns: ["spend", "purchaseValue", "roas", "purchases"],
    selectedTags: [],
    resultsPerPage: 20,
    colorFormatting: "heatmap",
    showTags: true,
    showActiveStatus: false,
    showLaunchDate: true,
    showAdLength: false,
  },
];

const TABLE_COLUMNS: TableColumnDefinition[] = [
  {
    key: "associatedAds",
    label: "Number of Associated Ads",
    description: "Count of associated ads for this row.",
    direction: "high",
    minWidth: 120,
    preferredWidth: 150,
    align: "right",
    format: fmtInteger,
    getValue: () => 1,
  },
  { key: "spend", label: "Spend", description: "Amount spent.", direction: "neutral", minWidth: 110, preferredWidth: 130, align: "right", format: fmtCurrency, getValue: (r) => r.spend },
  { key: "purchaseValue", label: "Purchase value", description: "Revenue from purchases.", direction: "high", minWidth: 135, preferredWidth: 160, align: "right", format: fmtCurrency, getValue: (r) => r.purchaseValue },
  { key: "roas", label: "ROAS (return on ad spend)", description: "Revenue / spend.", direction: "high", minWidth: 100, preferredWidth: 120, align: "right", format: (n) => n.toFixed(2), getValue: (r) => r.roas },
  { key: "cpa", label: "Cost per purchase", description: "Spend per purchase.", direction: "low", minWidth: 120, preferredWidth: 140, align: "right", format: fmtCurrency, getValue: (r) => r.cpa },
  { key: "cpcLink", label: "Cost per link click", description: "Spend per link click.", direction: "low", minWidth: 130, preferredWidth: 150, align: "right", format: fmtCurrency, getValue: (r) => r.cpcLink },
  { key: "cpm", label: "Cost per mille", description: "Spend per 1000 impressions.", direction: "low", minWidth: 120, preferredWidth: 135, align: "right", format: fmtCurrency, getValue: (r) => r.cpm },
  { key: "cpcAll", label: "Cost per click (all)", description: "Estimated cost per all clicks.", direction: "low", minWidth: 130, preferredWidth: 150, align: "right", format: fmtCurrency, getValue: (r) => r.cpcLink },
  { key: "averageOrderValue", label: "Average order value", description: "Purchase value / purchases.", direction: "high", minWidth: 130, preferredWidth: 150, align: "right", format: fmtCurrency, getValue: (r) => (r.purchases > 0 ? r.purchaseValue / r.purchases : 0) },
  { key: "clickToAtcRatio", label: "Click to add-to-cart ratio", description: "Estimated click-to-ATC rate.", direction: "high", minWidth: 150, preferredWidth: 170, align: "right", format: fmtPercent, getValue: (r) => r.clickToPurchase },
  { key: "atcToPurchaseRatio", label: "Add-to-cart to purchase ratio", description: "ATC to purchase conversion.", direction: "high", minWidth: 155, preferredWidth: 180, align: "right", format: fmtPercent, getValue: (r) => r.atcToPurchaseRatio },
  { key: "purchases", label: "Purchases", description: "Purchase count.", direction: "high", minWidth: 100, preferredWidth: 120, align: "right", format: fmtInteger, getValue: (r) => r.purchases },
  { key: "firstFrameRetention", label: "First frame retention", description: "Estimated first frame retention.", direction: "high", minWidth: 145, preferredWidth: 165, align: "right", format: fmtPercent, getValue: (r) => r.thumbstop },
  { key: "thumbstopRatio", label: "Thumbstop ratio", description: "Thumbstop performance ratio.", direction: "high", minWidth: 120, preferredWidth: 140, align: "right", format: fmtPercent, getValue: (r) => r.thumbstop },
  { key: "ctrOutbound", label: "Click through rate (outbound)", description: "Outbound CTR.", direction: "high", minWidth: 165, preferredWidth: 185, align: "right", format: fmtPercent, getValue: (r) => r.ctrAll },
  { key: "clickToPurchaseRatio", label: "Click to purchase ratio", description: "Click to purchase conversion.", direction: "high", minWidth: 145, preferredWidth: 165, align: "right", format: fmtPercent, getValue: (r) => r.clickToPurchase },
  { key: "ctrAll", label: "Click through rate (all)", description: "All-click CTR.", direction: "high", minWidth: 135, preferredWidth: 150, align: "right", format: fmtPercent, getValue: (r) => r.ctrAll },
  { key: "video25Rate", label: "25% video plays (rate)", description: "25% play rate.", direction: "high", minWidth: 145, preferredWidth: 165, align: "right", format: fmtPercent, getValue: (r) => r.video25 },
  { key: "video50Rate", label: "50% video plays (rate)", description: "50% play rate.", direction: "high", minWidth: 145, preferredWidth: 165, align: "right", format: fmtPercent, getValue: (r) => r.video50 },
  { key: "video75Rate", label: "75% video plays (rate)", description: "75% play rate.", direction: "high", minWidth: 145, preferredWidth: 165, align: "right", format: fmtPercent, getValue: (r) => r.video50 },
  { key: "video100Rate", label: "100% video plays (rate)", description: "100% play rate.", direction: "high", minWidth: 150, preferredWidth: 170, align: "right", format: fmtPercent, getValue: (r) => r.video50 },
  { key: "holdRate", label: "Hold rate", description: "Estimated hold rate.", direction: "high", minWidth: 100, preferredWidth: 120, align: "right", format: fmtPercent, getValue: (r) => r.video50 },
  { key: "hookScore", label: "Hook score", description: "Motion hook score.", direction: "high", minWidth: 100, preferredWidth: 120, align: "right", format: fmtInteger, getValue: (r) => r.thumbstop },
  { key: "purchaseValueShare", label: "% purchase value", description: "Share of purchase value.", direction: "high", minWidth: 130, preferredWidth: 145, align: "right", format: fmtPercent, getValue: (r, c) => (c.totalPurchaseValue > 0 ? (r.purchaseValue / c.totalPurchaseValue) * 100 : 0) },
  { key: "watchScore", label: "Watch score", description: "Motion watch score.", direction: "high", minWidth: 110, preferredWidth: 125, align: "right", format: fmtInteger, getValue: (r) => r.video50 },
  { key: "clickScore", label: "Click score", description: "Motion click score.", direction: "high", minWidth: 110, preferredWidth: 125, align: "right", format: fmtInteger, getValue: (r) => r.ctrAll * 10 },
  { key: "convertScore", label: "Convert score", description: "Motion convert score.", direction: "high", minWidth: 115, preferredWidth: 130, align: "right", format: fmtInteger, getValue: (r) => r.roas * 10 },
  { key: "averageOrderValueWebsite", label: "Average order value (website)", description: "Website AOV.", direction: "high", minWidth: 175, preferredWidth: 195, align: "right", format: fmtCurrency, getValue: (r) => (r.purchases > 0 ? r.purchaseValue / r.purchases : 0) },
  { key: "averageOrderValueShop", label: "Average order value (Shop)", description: "Shop AOV.", direction: "high", minWidth: 165, preferredWidth: 185, align: "right", format: fmtCurrency, getValue: (r) => (r.purchases > 0 ? r.purchaseValue / r.purchases : 0) },
  { key: "impressions", label: "Impressions", description: "Estimated impressions.", direction: "high", minWidth: 120, preferredWidth: 140, align: "right", format: fmtInteger, getValue: (r) => (r.cpm > 0 ? (r.spend * 1000) / r.cpm : 0) },
  { key: "spendShare", label: "% spend", description: "Share of spend.", direction: "neutral", minWidth: 100, preferredWidth: 120, align: "right", format: fmtPercent, getValue: (r, c) => (c.totalSpend > 0 ? (r.spend / c.totalSpend) * 100 : 0) },
  { key: "linkCtr", label: "Click through rate (link clicks)", description: "Link CTR.", direction: "high", minWidth: 175, preferredWidth: 195, align: "right", format: fmtPercent, getValue: (r) => r.ctrAll },
  { key: "websitePurchaseRoas", label: "Website purchase ROAS", description: "Website purchase ROAS.", direction: "high", minWidth: 145, preferredWidth: 165, align: "right", format: (n) => n.toFixed(2), getValue: (r) => r.roas },
  { key: "clickToWebsitePurchaseRatio", label: "Click to website purchase ratio", description: "Click-to-website purchase conversion.", direction: "high", minWidth: 185, preferredWidth: 210, align: "right", format: fmtPercent, getValue: (r) => r.clickToPurchase },
  { key: "purchasesPer1000Imp", label: "Purchases per 1,000 impressions", description: "Purchases normalized by 1,000 impressions.", direction: "high", minWidth: 200, preferredWidth: 230, align: "right", format: (n) => n.toFixed(2), getValue: (r) => {
      const imp = r.cpm > 0 ? (r.spend * 1000) / r.cpm : 0;
      return imp > 0 ? (r.purchases / imp) * 1000 : 0;
    } },
  { key: "revenuePer1000Imp", label: "Revenue per 1,000 impressions", description: "Revenue normalized by 1,000 impressions.", direction: "high", minWidth: 190, preferredWidth: 220, align: "right", format: fmtCurrency, getValue: (r) => {
      const imp = r.cpm > 0 ? (r.spend * 1000) / r.cpm : 0;
      return imp > 0 ? (r.purchaseValue / imp) * 1000 : 0;
    } },
  { key: "clicksAll", label: "Clicks (all)", description: "Estimated all clicks.", direction: "high", minWidth: 110, preferredWidth: 130, align: "right", format: fmtInteger, getValue: (r) => (r.cpcLink > 0 ? r.spend / r.cpcLink : 0) },
  { key: "linkClicks", label: "Link clicks", description: "Estimated link clicks.", direction: "high", minWidth: 110, preferredWidth: 130, align: "right", format: fmtInteger, getValue: (r) => (r.cpcLink > 0 ? r.spend / r.cpcLink : 0) },
];

const AI_TAG_GROUPS: Array<{ label: string; items: Array<{ label: string; value: TagKey }> }> = [
  { label: "Visual", items: [{ label: "Asset Type", value: "assetType" }, { label: "Visual Format", value: "visualFormat" }] },
  { label: "Persona", items: [{ label: "Intended Audience", value: "intendedAudience" }] },
  { label: "Messaging", items: [{ label: "Messaging Angle", value: "messagingAngle" }, { label: "Seasonality", value: "seasonality" }, { label: "Offer Type", value: "offerType" }] },
  { label: "Hook", items: [{ label: "Hook Tactic", value: "hookTactic" }, { label: "Headline Tactic", value: "headlineTactic" }] },
];

const PRESET_NOTES = "Preset controls only this table. Top creative cards keep their own metric model.";

export function MotionCreativesTableSection({
  rows,
  selectedRowIds,
  highlightedRowId = null,
  onToggleRow,
  onToggleAll,
  onOpenRow,
}: MotionCreativesTableSectionProps) {
  const defaultPreset = PRESETS.find((p) => p.presetName === "Facebook Ecommerce") ?? PRESETS[0];
  const [tablePreset, setTablePreset] = useState<TablePreset>(defaultPreset);
  const [presetSearch, setPresetSearch] = useState("");
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTagsMenu, setShowTagsMenu] = useState(false);
  const [showMetricModal, setShowMetricModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [hoverMetric, setHoverMetric] = useState<TableColumnKey | null>(null);
  const [modalColumns, setModalColumns] = useState<TableColumnKey[]>(tablePreset.selectedColumns);
  const [page, setPage] = useState(1);

  const filteredPresets = PRESETS.filter((preset) =>
    preset.presetName.toLowerCase().includes(presetSearch.toLowerCase())
  );

  const ctx: TableCalcContext = useMemo(
    () => ({
      totalSpend: rows.reduce((sum, row) => sum + row.spend, 0),
      totalPurchaseValue: rows.reduce((sum, row) => sum + row.purchaseValue, 0),
    }),
    [rows]
  );

  const selectedColumns = useMemo(
    () => tablePreset.selectedColumns.map((key) => TABLE_COLUMNS.find((col) => col.key === key)).filter(Boolean) as TableColumnDefinition[],
    [tablePreset.selectedColumns]
  );

  const allSelected = rows.length > 0 && rows.every((row) => selectedRowIds.includes(row.id));

  const totalResults = rows.length;
  const pageCount = Math.max(1, Math.ceil(totalResults / tablePreset.resultsPerPage));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * tablePreset.resultsPerPage;
  const endIndex = Math.min(totalResults, startIndex + tablePreset.resultsPerPage);
  const pagedRows = rows.slice(startIndex, endIndex);

  const metricExtremes = useMemo(() => {
    return selectedColumns.reduce<Record<string, { min: number; max: number }>>((acc, column) => {
      const values = rows.map((row) => column.getValue(row, ctx));
      acc[column.key] = {
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
      };
      return acc;
    }, {});
  }, [ctx, rows, selectedColumns]);

  const modalMetricGroups = useMemo(() => {
    const query = modalSearch.toLowerCase().trim();
    const aiTagMetrics = [
      "assetType",
      "visualFormat",
      "messagingAngle",
      "hookTactic",
      "headlineTactic",
      "intendedAudience",
      "seasonality",
      "offerType",
    ] as const;

    const motionMetrics: TableColumnKey[] = ["hookScore", "watchScore", "clickScore", "convertScore"];

    const performanceMetrics = TABLE_COLUMNS.map((column) => column.key).filter((key) => !motionMetrics.includes(key));

    const filterList = <T extends string>(items: T[]) =>
      items.filter((id) => {
        const label = resolveMetricLabel(id);
        return label.toLowerCase().includes(query);
      });

    return {
      aiTags: filterList([...aiTagMetrics]),
      motion: filterList(motionMetrics),
      performance: filterList(performanceMetrics),
    };
  }, [modalSearch]);

  const applyPreset = (preset: TablePreset) => {
    setTablePreset(preset);
    setModalColumns(preset.selectedColumns);
    setPage(1);
    setShowPresetMenu(false);
  };

  const toggleTag = (tag: TagKey) => {
    const next = tablePreset.selectedTags.includes(tag)
      ? tablePreset.selectedTags.filter((item) => item !== tag)
      : [...tablePreset.selectedTags, tag];
    setTablePreset({ ...tablePreset, selectedTags: next });
  };

  const removeColumn = (key: TableColumnKey) => {
    const next = tablePreset.selectedColumns.filter((item) => item !== key);
    setTablePreset({ ...tablePreset, selectedColumns: next.length > 0 ? next : tablePreset.selectedColumns });
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= tablePreset.selectedColumns.length) return;
    const next = [...tablePreset.selectedColumns];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setTablePreset({ ...tablePreset, selectedColumns: next });
  };

  const openMetricModal = () => {
    setModalColumns(tablePreset.selectedColumns);
    setShowMetricModal(true);
  };

  const applyMetricModal = () => {
    setTablePreset({ ...tablePreset, selectedColumns: modalColumns });
    setShowMetricModal(false);
  };

  return (
    <section className="space-y-2 rounded-2xl border bg-card p-3">
      {/* A) controls row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPresetMenu((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs"
          >
            {tablePreset.presetName}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {showPresetMenu && (
            <div className="absolute left-0 top-10 z-40 w-64 rounded-xl border bg-background p-3 shadow-lg">
              <div className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={presetSearch}
                  onChange={(event) => setPresetSearch(event.target.value)}
                  placeholder="Search presets"
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>
              <div className="max-h-60 space-y-1 overflow-auto">
                {filteredPresets.map((preset) => (
                  <button
                    key={preset.presetName}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-xs",
                      preset.presetName === tablePreset.presetName ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    {preset.presetName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Table settings
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {showSettings && (
            <div className="absolute left-0 top-10 z-40 w-[360px] rounded-xl border bg-background p-3 shadow-lg">
              <div className="space-y-2 border-b pb-3">
                <label className="flex items-center justify-between text-xs">
                  <span>Color formatting</span>
                  <select
                    value={tablePreset.colorFormatting}
                    onChange={(event) =>
                      setTablePreset({
                        ...tablePreset,
                        colorFormatting: event.target.value as ColorFormattingMode,
                      })
                    }
                    className="h-7 rounded border bg-background px-2 text-xs"
                  >
                    <option value="heatmap">Heatmap</option>
                    <option value="none">None</option>
                  </select>
                </label>

                <label className="flex items-center justify-between text-xs">
                  <span>Results per page</span>
                  <select
                    value={tablePreset.resultsPerPage}
                    onChange={(event) =>
                      setTablePreset({
                        ...tablePreset,
                        resultsPerPage: Number(event.target.value) as 20 | 50 | 100,
                      })
                    }
                    className="h-7 rounded border bg-background px-2 text-xs"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>

                {[
                  { key: "showTags", label: "Show tags" },
                  { key: "showActiveStatus", label: "Show active status" },
                  { key: "showLaunchDate", label: "Show launch date" },
                  { key: "showAdLength", label: "Show ad length" },
                ].map((toggle) => (
                  <label key={toggle.key} className="flex items-center justify-between text-xs">
                    <span>{toggle.label}</span>
                    <input
                      type="checkbox"
                      checked={tablePreset[toggle.key as keyof TablePreset] as boolean}
                      onChange={(event) =>
                        setTablePreset({ ...tablePreset, [toggle.key]: event.target.checked })
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="mt-3">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Selected metrics
                </p>
                <div className="max-h-44 space-y-1 overflow-auto">
                  {tablePreset.selectedColumns.map((columnKey, index) => (
                    <div key={columnKey} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{resolveMetricLabel(columnKey)}</span>
                      <button
                        type="button"
                        onClick={() => moveColumn(index, -1)}
                        className="rounded border px-1 text-[10px]"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveColumn(index, 1)}
                        className="rounded border px-1 text-[10px]"
                      >
                        ↓
                      </button>
                      <button type="button" onClick={() => removeColumn(columnKey)}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={openMetricModal}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add metric
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTagsMenu((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs"
          >
            <Tag className="h-3.5 w-3.5" />
            + AI tags
          </button>

          {showTagsMenu && (
            <div className="absolute left-0 top-10 z-40 w-[300px] rounded-xl border bg-background p-3 shadow-lg">
              <div className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input placeholder="Search AI tags" className="w-full bg-transparent text-xs outline-none" />
              </div>

              <div className="max-h-56 space-y-2 overflow-auto">
                {AI_TAG_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    {group.items.map((item) => (
                      <label key={item.value} className="flex items-center justify-between text-xs">
                        <span>{item.label}</span>
                        <input
                          type="checkbox"
                          checked={tablePreset.selectedTags.includes(item.value)}
                          onChange={() => toggleTag(item.value)}
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={openMetricModal}
          className="rounded-full border bg-background px-3 py-1.5 text-xs"
        >
          + Add metric
        </button>
      </div>

      {/* B) selection info */}
      <div className="text-xs text-muted-foreground">{selectedRowIds.length} ad groups selected</div>

      {/* C) table */}
      <div className="max-h-[620px] overflow-auto rounded-xl border">
        <table className="min-w-full table-fixed text-sm">
          <thead className="sticky top-0 z-20 bg-background">
            <tr className="border-b">
              <th
                className="sticky left-0 z-30 border-r bg-background px-3 py-2 text-left text-xs font-medium"
                style={{ minWidth: 320, width: 320 }}
              >
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
                  <span>Creative / Ad Name</span>
                </label>
              </th>

              {tablePreset.showLaunchDate && (
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ minWidth: 120, width: 130 }}>
                  Launch date
                </th>
              )}

              {tablePreset.showTags && (
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ minWidth: 160, width: 180 }}>
                  Tags
                </th>
              )}

              {tablePreset.showActiveStatus && (
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ minWidth: 100, width: 110 }}>
                  Active status
                </th>
              )}

              {tablePreset.showAdLength && (
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ minWidth: 90, width: 110 }}>
                  Ad length
                </th>
              )}

              {selectedColumns.map((column, index) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-3 py-2 text-xs font-medium",
                    column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"
                  )}
                  style={{ minWidth: column.minWidth, width: column.preferredWidth }}
                >
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px]">
                      {index + 1}
                    </span>
                    {column.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pagedRows.map((row) => (
              <tr
                key={row.id}
                id={`creative-row-${row.id}`}
                onClick={() => onOpenRow(row.id)}
                className={cn("cursor-pointer", highlightedRowId === row.id && "bg-emerald-500/10")}
              >
                <td className="sticky left-0 z-10 border-b border-r bg-background px-3 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.includes(row.id)}
                      onChange={() => onToggleRow(row.id)}
                      onClick={(event) => event.stopPropagation()}
                    />

                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted/30">
                      {row.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.previewUrl} alt={row.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                          {row.previewState === "catalog" ? "Catalog" : "No preview"}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="text-[11px] text-muted-foreground">1 ad</p>
                    </div>
                  </div>
                </td>

                {tablePreset.showLaunchDate && (
                  <td className="border-b px-3 py-2 text-xs">{row.launchDate}</td>
                )}

                {tablePreset.showTags && (
                  <td className="border-b px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {[...row.tags, ...tablePreset.selectedTags.map(prettyTagLabel)].slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full border bg-muted/25 px-2 py-0.5 text-[10px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                )}

                {tablePreset.showActiveStatus && (
                  <td className="border-b px-3 py-2 text-xs">Active</td>
                )}

                {tablePreset.showAdLength && (
                  <td className="border-b px-3 py-2 text-xs">{row.format === "video" ? "15s" : "Static"}</td>
                )}

                {selectedColumns.map((column) => {
                  const value = column.getValue(row, ctx);
                  const range = metricExtremes[column.key] ?? { min: value, max: value };
                  const bg =
                    tablePreset.colorFormatting === "heatmap"
                      ? withIntensity(getHeatColor(column.direction, value, range.min, range.max), 1)
                      : "transparent";

                  return (
                    <td
                      key={`${row.id}_${column.key}`}
                      className={cn(
                        "border-b px-3 py-2 text-xs",
                        column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"
                      )}
                      style={{ backgroundColor: bg }}
                    >
                      {column.format(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-10 bg-background/95 backdrop-blur">
            <tr className="border-t">
              <td
                className="sticky left-0 z-20 border-r bg-background px-3 py-2 text-xs font-semibold"
                style={{ minWidth: 320, width: 320 }}
              >
                Net Results
              </td>

              {tablePreset.showLaunchDate && <td className="px-3 py-2 text-xs text-muted-foreground">-</td>}
              {tablePreset.showTags && <td className="px-3 py-2 text-xs text-muted-foreground">-</td>}
              {tablePreset.showActiveStatus && <td className="px-3 py-2 text-xs text-muted-foreground">-</td>}
              {tablePreset.showAdLength && <td className="px-3 py-2 text-xs text-muted-foreground">-</td>}

              {selectedColumns.map((column) => {
                const values = rows.map((row) => column.getValue(row, ctx));
                const total = values.reduce((sum, v) => sum + v, 0);
                const avg = values.length > 0 ? total / values.length : 0;
                return (
                  <td
                    key={`summary_${column.key}`}
                    className={cn(
                      "px-3 py-2 text-[11px]",
                      column.align === "right"
                        ? "text-right"
                        : column.align === "center"
                        ? "text-center"
                        : "text-left"
                    )}
                  >
                    <div className="space-y-0.5">
                      <p className="font-semibold">{column.format(total)}</p>
                      <p className="text-muted-foreground">avg {column.format(avg)}</p>
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* D/E) pagination row */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1">
            <span className="text-muted-foreground">Results per page</span>
            <select
              value={tablePreset.resultsPerPage}
              onChange={(event) =>
                setTablePreset({
                  ...tablePreset,
                  resultsPerPage: Number(event.target.value) as 20 | 50 | 100,
                })
              }
              className="h-7 rounded border bg-background px-2 text-xs"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <span className="text-muted-foreground">
            {totalResults === 0 ? "0" : `${startIndex + 1}-${endIndex}`} of {totalResults}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {Array.from({ length: pageCount }).slice(0, 7).map((_, idx) => {
            const pageNo = idx + 1;
            return (
              <button
                key={`page_${pageNo}`}
                type="button"
                onClick={() => setPage(pageNo)}
                className={cn(
                  "h-7 min-w-7 rounded border px-2",
                  safePage === pageNo ? "bg-foreground text-background" : "bg-background"
                )}
              >
                {pageNo}
              </button>
            );
          })}
        </div>
      </div>

      {showMetricModal && (
        <MetricModal
          selectedColumns={modalColumns}
          onSelectedColumnsChange={setModalColumns}
          onClose={() => setShowMetricModal(false)}
          onApply={applyMetricModal}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          metricGroups={modalMetricGroups}
          hoveredMetric={hoverMetric}
          onHoverMetric={setHoverMetric}
          presetName={tablePreset.presetName}
        />
      )}
    </section>
  );
}

function MetricModal({
  selectedColumns,
  onSelectedColumnsChange,
  onClose,
  onApply,
  searchValue,
  onSearchChange,
  metricGroups,
  hoveredMetric,
  onHoverMetric,
  presetName,
}: {
  selectedColumns: TableColumnKey[];
  onSelectedColumnsChange: (next: TableColumnKey[]) => void;
  onClose: () => void;
  onApply: () => void;
  searchValue: string;
  onSearchChange: (next: string) => void;
  metricGroups: { aiTags: string[]; motion: TableColumnKey[]; performance: TableColumnKey[] };
  hoveredMetric: TableColumnKey | null;
  onHoverMetric: (next: TableColumnKey | null) => void;
  presetName: string;
}) {
  const [setAsDefault, setSetAsDefault] = useState(false);

  const addMetric = (key: TableColumnKey) => {
    if (selectedColumns.includes(key)) return;
    onSelectedColumnsChange([...selectedColumns, key]);
  };

  const removeMetric = (key: TableColumnKey) => {
    onSelectedColumnsChange(selectedColumns.filter((col) => col !== key));
  };

  const moveMetric = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selectedColumns.length) return;
    const next = [...selectedColumns];
    const [metric] = next.splice(index, 1);
    next.splice(target, 0, metric);
    onSelectedColumnsChange(next);
  };

  const hoveredDef = hoveredMetric ? TABLE_COLUMNS.find((col) => col.key === hoveredMetric) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="flex h-[78vh] w-[min(1240px,96vw)] flex-col overflow-hidden rounded-2xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search KPIs"
              className="w-72 bg-transparent text-xs outline-none"
            />
          </div>
          <button type="button" onClick={onClose} className="rounded-md border p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_300px] gap-0">
          <div className="min-h-0 border-r p-3">
            <p className="mb-2 text-xs font-medium">Selected metrics</p>
            <div className="max-h-[52vh] space-y-1 overflow-auto">
              {selectedColumns.map((metric, index) => (
                <div key={metric} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{resolveMetricLabel(metric)}</span>
                  <button type="button" onClick={() => moveMetric(index, -1)} className="rounded border px-1 text-[10px]">↑</button>
                  <button type="button" onClick={() => moveMetric(index, 1)} className="rounded border px-1 text-[10px]">↓</button>
                  <button type="button" onClick={() => removeMetric(metric)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">Preset: {presetName}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{PRESET_NOTES}</p>

            <label className="mt-3 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(event) => setSetAsDefault(event.target.checked)}
              />
              Set as default preset
            </label>

            <select className="mt-3 h-8 w-full rounded border bg-background px-2 text-xs" defaultValue={presetName}>
              {PRESETS.map((preset) => (
                <option key={preset.presetName} value={preset.presetName}>
                  {preset.presetName}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 overflow-auto p-3">
            <MetricGroup
              title="AI tags"
              items={metricGroups.aiTags}
              onAdd={() => null}
              onHover={() => null}
              isAdded={() => false}
            />

            <MetricGroup
              title="Motion Metrics"
              items={metricGroups.motion}
              onAdd={addMetric}
              onHover={onHoverMetric}
              isAdded={(key) => selectedColumns.includes(key as TableColumnKey)}
            />

            <MetricGroup
              title="Performance"
              items={metricGroups.performance}
              onAdd={addMetric}
              onHover={onHoverMetric}
              isAdded={(key) => selectedColumns.includes(key as TableColumnKey)}
            />
          </div>

          <div className="border-l p-3">
            <p className="mb-2 text-xs font-medium">Metric description</p>
            {hoveredDef ? (
              <div className="space-y-1 text-xs">
                <p className="font-medium">{hoveredDef.label}</p>
                <p className="text-muted-foreground">{hoveredDef.description}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Hover over a metric to see its description.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs">
            Cancel
          </button>
          <button type="button" className="rounded-md border px-3 py-1.5 text-xs">
            Update Preset
          </button>
          <button type="button" className="rounded-md border px-3 py-1.5 text-xs">
            Save As New Preset
          </button>
          <button type="button" onClick={onApply} className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricGroup({
  title,
  items,
  onAdd,
  onHover,
  isAdded,
}: {
  title: string;
  items: string[];
  onAdd: (key: TableColumnKey) => void;
  onHover: (key: TableColumnKey) => void;
  isAdded: (key: string) => boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1">
        {items.map((key) => {
          const added = isAdded(key);
          return (
            <button
              key={key}
              type="button"
              onMouseEnter={() => onHover(key as TableColumnKey)}
              onFocus={() => onHover(key as TableColumnKey)}
              onClick={() => onAdd(key as TableColumnKey)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs",
                added ? "bg-emerald-50 text-emerald-700" : "hover:bg-accent/60"
              )}
            >
              <span>{resolveMetricLabel(key)}</span>
              {added ? "Added" : "+"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function resolveMetricLabel(key: string): string {
  const map: Record<string, string> = {
    assetType: "Asset Type",
    visualFormat: "Visual Format",
    messagingAngle: "Messaging Angle",
    hookTactic: "Hook Tactic",
    headlineTactic: "Headline Tactic",
    intendedAudience: "Intended Audience",
    seasonality: "Seasonality",
    offerType: "Offer Type",
  };

  if (map[key]) return map[key];

  return TABLE_COLUMNS.find((column) => column.key === key)?.label ?? key;
}

function prettyTagLabel(key: TagKey): string {
  return resolveMetricLabel(key);
}

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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
