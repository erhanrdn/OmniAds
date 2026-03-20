"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, LayoutPanelTop, Table2, TextCursorInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clampWidgetSpan,
  cloneReportDefinition,
  createCustomReportId,
  createBlankReportDefinition,
  CUSTOM_REPORT_TEMPLATES,
  ensureReportDefinition,
  getDefaultWidgetSpan,
  REPORT_SHARE_EXPIRY_OPTIONS,
  type CustomReportDocument,
  type CustomReportPlatform,
  type CustomReportRecord,
  type CustomReportTemplate,
  type CustomReportWidgetDefinition,
  type CustomReportWidgetType,
  type RenderedReportPayload,
  REPORT_GRID_COLUMNS,
  REPORT_GRID_SLOT_COUNT,
  type RenderedReportWidget,
} from "@/lib/custom-reports";
import {
  getBreakdownOptionsForPlatform,
  getColumnOptionsForPlatform,
  getDataSourceForPlatform,
  getDefaultColumnsForPlatform,
  getDefaultMetricForPlatform,
  getMetricOptionsForPlatform,
  getReportPlatformLogo,
  getSupportedPlatformsForWidget,
  platformSupportsAccountSelection,
  REPORT_PLATFORM_CATALOG,
  resolveWidgetPlatform,
} from "@/lib/report-metric-catalog";
import { ReportCanvas } from "@/components/reports/report-canvas";
import { TemplateMiniPreview } from "@/components/reports/template-mini-preview";
import { useIntegrationsStore } from "@/store/integrations-store";

const WIDGET_LIBRARY: Array<{
  type: CustomReportWidgetType;
  label: string;
  eyebrow: string;
  detail: string;
}> = [
  { type: "metric", label: "Metric", eyebrow: "KPI", detail: "Single number with context" },
  { type: "trend", label: "Line Chart", eyebrow: "Trend", detail: "Show movement over time" },
  { type: "bar", label: "Bar Chart", eyebrow: "Compare", detail: "Highlight ranked values" },
  { type: "table", label: "Table", eyebrow: "Rows", detail: "Detailed campaign breakdown" },
  { type: "text", label: "Text", eyebrow: "Notes", detail: "Narrative and commentary" },
  { type: "section", label: "Section", eyebrow: "Structure", detail: "Create a visual chapter" },
];

const EMPTY_DISCOVERY_ENTITIES: Array<{ id: string; name: string }> = [];

function WidgetLibraryPreview({ type }: { type: CustomReportWidgetType }) {
  if (type === "metric") {
    return (
      <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-3 py-3 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">KPI</div>
        <div className="mt-2 text-lg font-semibold leading-none text-slate-950">$12.4K</div>
        <div className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
          +12.4%
        </div>
      </div>
    );
  }

  if (type === "trend") {
    return (
      <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-3 py-3 shadow-sm">
        <div className="flex h-12 items-end gap-1">
          {[20, 28, 24, 36, 30, 41].map((point, index) => (
            <div key={index} className="relative flex-1">
              {index > 0 ? (
                <div
                  className="absolute -left-1/2 top-1/2 h-[2px] w-full -translate-y-1/2 rounded-full bg-blue-500"
                  style={{ transform: `translateY(${18 - point / 3}px) rotate(${index % 2 === 0 ? "-8deg" : "8deg"})` }}
                />
              ) : null}
              <div
                className="mx-auto h-1.5 w-1.5 rounded-full bg-blue-600"
                style={{ marginTop: `${44 - point}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-[9px] text-slate-400">
          <span>Mar</span>
          <span>Apr</span>
          <span>May</span>
        </div>
      </div>
    );
  }

  if (type === "bar") {
    return (
      <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-3 py-3 shadow-sm">
        <div className="flex h-12 items-end gap-2">
          {[38, 26, 44, 31].map((height, index) => (
            <div key={index} className="flex-1 rounded-t-xl bg-[linear-gradient(180deg,#60a5fa,#2563eb)]" style={{ height }} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Ranked comparison</span>
        </div>
      </div>
    );
  }

  if (type === "table") {
    return (
      <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-3 py-3 shadow-sm">
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }).map((_, index) => (
            <div
              key={index}
              className={`h-3 rounded-md ${index < 3 ? "bg-slate-200" : "bg-slate-100"}`}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
          <Table2 className="h-3.5 w-3.5" />
          <span>Detailed rows</span>
        </div>
      </div>
    );
  }

  if (type === "text") {
    return (
      <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-3 py-3 shadow-sm">
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-slate-200" />
          <div className="h-2 w-5/6 rounded-full bg-slate-200" />
          <div className="h-2 w-2/3 rounded-full bg-slate-100" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
          <TextCursorInput className="h-3.5 w-3.5" />
          <span>Narrative block</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-3 py-3 shadow-sm">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center">
        <LayoutPanelTop className="mx-auto h-5 w-5 text-slate-500" />
        <div className="mt-2 text-[10px] font-medium text-slate-500">Section divider</div>
      </div>
    </div>
  );
}

function PlatformLogoStack({ channels }: { channels: Array<CustomReportPlatform> }) {
  return (
    <span className="flex items-center">
      {channels.map((channel, index) => {
        const logo = getReportPlatformLogo(channel);
        if (!logo) return null;
        return (
          <span
            key={channel}
            className={`inline-flex h-5 w-5 items-center justify-center overflow-hidden ${
              index > 0 ? "-ml-1.5" : ""
            }`}
          >
            <Image
              src={logo}
              alt={channel}
              width={12}
              height={12}
              className="h-4 w-4 object-contain"
            />
          </span>
        );
      })}
    </span>
  );
}

function getMetricOptionsForWidget(widget: CustomReportWidgetDefinition | null) {
  if (!widget) return [];
  return getMetricOptionsForPlatform(resolveWidgetPlatform(widget), widget.type);
}

const REPORT_GRID_ROWS = Math.ceil(REPORT_GRID_SLOT_COUNT / REPORT_GRID_COLUMNS);

function getWidgetPlacement(widget: Pick<CustomReportWidgetDefinition, "slot" | "colSpan" | "rowSpan">) {
  const colStart = widget.slot % REPORT_GRID_COLUMNS;
  const rowStart = Math.floor(widget.slot / REPORT_GRID_COLUMNS);
  return {
    colStart,
    colEnd: colStart + widget.colSpan - 1,
    rowStart,
    rowEnd: rowStart + widget.rowSpan - 1,
  };
}

function widgetFitsGrid(widget: Pick<CustomReportWidgetDefinition, "slot" | "colSpan" | "rowSpan">) {
  const placement = getWidgetPlacement(widget);
  return placement.colEnd < REPORT_GRID_COLUMNS && placement.rowEnd < REPORT_GRID_ROWS;
}

function widgetsOverlap(
  left: Pick<CustomReportWidgetDefinition, "slot" | "colSpan" | "rowSpan">,
  right: Pick<CustomReportWidgetDefinition, "slot" | "colSpan" | "rowSpan">
) {
  const a = getWidgetPlacement(left);
  const b = getWidgetPlacement(right);
  return !(a.colEnd < b.colStart || b.colEnd < a.colStart || a.rowEnd < b.rowStart || b.rowEnd < a.rowStart);
}

function getCoveredSlots(widget: Pick<CustomReportWidgetDefinition, "slot" | "colSpan" | "rowSpan">) {
  const placement = getWidgetPlacement(widget);
  const slots: number[] = [];
  for (let row = placement.rowStart; row <= placement.rowEnd; row += 1) {
    for (let col = placement.colStart; col <= placement.colEnd; col += 1) {
      slots.push(row * REPORT_GRID_COLUMNS + col);
    }
  }
  return slots;
}

function canPlaceWidget(
  widgets: CustomReportWidgetDefinition[],
  candidate: CustomReportWidgetDefinition,
  ignoreWidgetId?: string
) {
  if (!widgetFitsGrid(candidate)) return false;
  return widgets.every((widget) => {
    if (widget.id === ignoreWidgetId) return true;
    return !widgetsOverlap(widget, candidate);
  });
}

function toPlacementCandidate(
  widget: Pick<
    CustomReportWidgetDefinition,
    | "colSpan"
    | "rowSpan"
    | "type"
    | "title"
  | "subtitle"
  | "dataSource"
  | "accountId"
  | "metricKey"
  | "yMetrics"
  | "breakdown"
    | "text"
    | "platform"
    | "limit"
    | "columns"
  >
): Omit<CustomReportWidgetDefinition, "id" | "slot"> {
  return {
    colSpan: widget.colSpan,
    rowSpan: widget.rowSpan,
    type: widget.type,
    title: widget.title,
    subtitle: widget.subtitle,
    dataSource: widget.dataSource,
    accountId: widget.accountId,
    metricKey: widget.metricKey,
    yMetrics: widget.yMetrics,
    breakdown: widget.breakdown,
    text: widget.text,
    platform: widget.platform,
    limit: widget.limit,
    columns: widget.columns,
  };
}

function findAvailableSlot(
  widgets: CustomReportWidgetDefinition[],
  candidate: Omit<CustomReportWidgetDefinition, "id" | "slot">,
  preferredSlot: number
) {
  const orderedSlots = Array.from({ length: REPORT_GRID_SLOT_COUNT }, (_, slot) => slot).sort((left, right) => {
    const leftDistance = Math.abs(left - preferredSlot);
    const rightDistance = Math.abs(right - preferredSlot);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return left - right;
  });
  for (const slot of orderedSlots) {
    const nextWidget = { id: "__candidate__", slot, ...candidate };
    if (canPlaceWidget(widgets, nextWidget)) return slot;
  }
  return null;
}

function createWidgetForType(type: CustomReportWidgetType, slot: number): CustomReportWidgetDefinition {
  const span = getDefaultWidgetSpan(type);
  const defaultPlatform: CustomReportPlatform = "all";
  return {
    id: createCustomReportId(),
    slot,
    colSpan: span.colSpan,
    rowSpan: span.rowSpan,
    type,
    title:
      type === "metric"
        ? "New Metric"
        : type === "trend"
          ? "Trend Widget"
            : type === "bar"
              ? "Comparison Widget"
            : type === "table"
              ? "Table Widget"
              : type === "section"
                ? "Section Title"
                : "Commentary",
    dataSource:
      type === "text" || type === "section"
        ? undefined
        : getDataSourceForPlatform(defaultPlatform, type),
    accountId: undefined,
    metricKey:
      type === "table" || type === "text" || type === "section"
        ? undefined
        : getDefaultMetricForPlatform(defaultPlatform, type),
    yMetrics:
      type === "trend" || type === "bar"
        ? ["combined.spend"]
        : undefined,
    breakdown:
      type === "trend" || type === "bar"
        ? "day"
        : undefined,
    columns:
      type === "table"
        ? getDefaultColumnsForPlatform(defaultPlatform)
        : undefined,
    text:
      type === "text"
        ? "Write a short narrative, insight, or next step."
        : type === "section"
          ? ""
          : undefined,
    limit: type === "table" ? 8 : undefined,
  };
}

function getWidgetPreviewSummary(widget: RenderedReportWidget | undefined) {
  if (!widget) return null;
  if (widget.type === "metric") {
    return {
      primary: widget.value ?? "-",
      secondary: widget.deltaLabel ?? widget.emptyMessage ?? null,
    };
  }
  if (widget.type === "trend" || widget.type === "bar") {
    return {
      primary: widget.series?.length ? `${widget.series.length} metrics` : widget.points?.length ? `${widget.points.length} points` : "No points yet",
      secondary:
        widget.points && widget.points.length > 0
          ? `${widget.points[0]?.label} to ${widget.points[widget.points.length - 1]?.label}`
          : widget.emptyMessage ?? null,
    };
  }
  if (widget.type === "table") {
    return {
      primary: widget.rows?.length ? `${widget.rows.length} rows` : "No rows yet",
      secondary: widget.columns?.length ? widget.columns.slice(0, 3).join(" • ") : widget.emptyMessage ?? null,
    };
  }
  if (widget.type === "text" || widget.type === "section") {
    return {
      primary: widget.text?.trim() ? widget.text.trim().slice(0, 72) : "No content yet",
      secondary: null,
    };
  }
  return null;
}

export function ReportBuilder({
  businessId,
  initialRecord,
  initialTemplateId,
}: {
  businessId: string;
  initialRecord?: CustomReportRecord | null;
  initialTemplateId?: string | null;
}) {
  const router = useRouter();
  const initialTemplate = CUSTOM_REPORT_TEMPLATES.find((item) => item.id === initialTemplateId) ?? null;
  const isBlankBuilder = !initialRecord && !initialTemplate;
  const startingDefinition = initialRecord?.definition
    ? ensureReportDefinition(initialRecord.definition)
    : initialTemplate
      ? cloneReportDefinition(initialTemplate.definition)
      : createBlankReportDefinition();

  const [name, setName] = useState(initialRecord?.name ?? initialTemplate?.name ?? "Untitled Report");
  const [description, setDescription] = useState(initialRecord?.description ?? initialTemplate?.description ?? "");
  const [templateId, setTemplateId] = useState<string | null>(initialRecord?.templateId ?? initialTemplate?.id ?? null);
  const [definition, setDefinition] = useState<CustomReportDocument>(startingDefinition);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(startingDefinition.widgets[0]?.slot ?? null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(
    startingDefinition.widgets[0]?.id ?? null
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [toolbarMessage, setToolbarMessage] = useState<string | null>(null);
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [draggedWidgetType, setDraggedWidgetType] = useState<CustomReportWidgetType | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [templateFilter, setTemplateFilter] = useState<string>("All");
  const [shareExpiryDays, setShareExpiryDays] = useState<number>(7);
  const [metricSearch, setMetricSearch] = useState("");
  const [metricMenuOpen, setMetricMenuOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [dataSourcePickerOpen, setDataSourcePickerOpen] = useState(false);
  const [pickerPlatform, setPickerPlatform] = useState<"meta" | "google">("meta");
  const [accountSearch, setAccountSearch] = useState("");
  const [activeResize, setActiveResize] = useState<{
    widgetId: string;
    mode: "col" | "row" | "both";
    startX: number;
    startY: number;
    originColSpan: number;
    originRowSpan: number;
  } | null>(null);
  const canvasOverlayRef = useRef<HTMLDivElement | null>(null);
  const metaEntities = useIntegrationsStore((state) =>
    businessId
      ? state.domainsByBusinessId[businessId]?.meta?.discovery.entities ?? EMPTY_DISCOVERY_ENTITIES
      : EMPTY_DISCOVERY_ENTITIES
  );
  const googleEntities = useIntegrationsStore((state) =>
    businessId
      ? state.domainsByBusinessId[businessId]?.google?.discovery.entities ?? EMPTY_DISCOVERY_ENTITIES
      : EMPTY_DISCOVERY_ENTITIES
  );

  useEffect(() => {
    const nextTemplate = CUSTOM_REPORT_TEMPLATES.find((item) => item.id === initialTemplateId) ?? null;
    const nextDefinition = initialRecord?.definition
      ? ensureReportDefinition(initialRecord.definition)
      : nextTemplate
        ? cloneReportDefinition(nextTemplate.definition)
        : createBlankReportDefinition();
    setName(initialRecord?.name ?? nextTemplate?.name ?? "Untitled Report");
    setDescription(initialRecord?.description ?? nextTemplate?.description ?? "");
    setTemplateId(initialRecord?.templateId ?? nextTemplate?.id ?? null);
    setDefinition(nextDefinition);
    setSelectedWidgetId(nextDefinition.widgets[0]?.id ?? null);
    setSelectedSlot(nextDefinition.widgets[0]?.slot ?? null);
    setMetricSearch("");
    setColumnSearch("");
    setMetricMenuOpen(false);
    setColumnMenuOpen(false);
    setDataSourcePickerOpen(false);
    setAccountSearch("");
    setDraggedWidgetType(null);
  }, [initialRecord, initialTemplateId]);

  useEffect(() => {
    setMetricMenuOpen(false);
    setMetricSearch("");
    setColumnMenuOpen(false);
    setColumnSearch("");
  }, [selectedWidgetId]);

  useEffect(() => {
    if (!dataSourcePickerOpen) {
      setAccountSearch("");
    }
  }, [dataSourcePickerOpen]);

  const deferredDefinition = useDeferredValue(definition);
  const deferredName = useDeferredValue(name);
  const deferredDescription = useDeferredValue(description);
  const shouldRenderPreview = Boolean(businessId) && deferredDefinition.widgets.length > 0;
  const previewKey = JSON.stringify({
    businessId,
    definition: deferredDefinition,
    name: deferredName,
    description: deferredDescription,
  });
  const previewQuery = useQuery({
    queryKey: ["custom-report-preview", businessId, previewKey],
    enabled: shouldRenderPreview,
    queryFn: async () => {
      const response = await fetch("/api/reports/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          name: deferredName,
          description: deferredDescription,
          definition: deferredDefinition,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((payload as { message?: string } | null)?.message ?? "Preview failed.");
      }
      return (payload as { report: RenderedReportPayload }).report;
    },
  });

  const selectedWidget = useMemo(
    () => definition.widgets.find((widget) => widget.id === selectedWidgetId) ?? null,
    [definition.widgets, selectedWidgetId]
  );
  const selectedWidgetChannel: CustomReportPlatform = selectedWidget ? resolveWidgetPlatform(selectedWidget) : "all";
  const selectedMetricOptions = useMemo(() => {
    const query = metricSearch.trim().toLowerCase();
    const options = getMetricOptionsForWidget(selectedWidget);
    if (!query) return options;
    return options.filter(
      (metric) =>
        metric.label.toLowerCase().includes(query) ||
        metric.value.toLowerCase().includes(query)
    );
  }, [metricSearch, selectedWidget]);
  const selectedColumnOptions = useMemo(() => {
    if (!selectedWidget || selectedWidget.type !== "table") return [];
    return getColumnOptionsForPlatform(selectedWidgetChannel).filter((column) =>
      column.label.toLowerCase().includes(columnSearch.trim().toLowerCase())
    );
  }, [columnSearch, selectedWidget, selectedWidgetChannel]);
  const accountEntityMap = useMemo(() => {
    return new Map([...metaEntities, ...googleEntities].map((entity) => [entity.id, entity.name]));
  }, [googleEntities, metaEntities]);
  const pickerAccounts = useMemo(() => {
    const base = pickerPlatform === "meta" ? metaEntities : googleEntities;
    const query = accountSearch.trim().toLowerCase();
    if (!query) return base;
    return base.filter(
      (account) =>
        account.name.toLowerCase().includes(query) ||
        account.id.toLowerCase().includes(query)
    );
  }, [accountSearch, googleEntities, metaEntities, pickerPlatform]);
  const selectedAccountName =
    selectedWidget?.accountId != null
      ? accountEntityMap.get(selectedWidget.accountId) ?? null
      : null;

  const tableWidgets = useMemo(
    () => (previewQuery.data?.widgets ?? []).filter((widget) => widget.type === "table"),
    [previewQuery.data]
  );
  const renderedWidgetsById = useMemo(() => {
    return new Map((previewQuery.data?.widgets ?? []).map((widget) => [widget.id, widget]));
  }, [previewQuery.data]);
  const occupiedSlots = useMemo(() => {
    const covered = new Set<number>();
    for (const widget of definition.widgets) {
      for (const slot of getCoveredSlots(widget)) {
        covered.add(slot);
      }
    }
    return covered;
  }, [definition.widgets]);
  const templateCategories = useMemo(
    () => ["All", ...Array.from(new Set(CUSTOM_REPORT_TEMPLATES.map((template) => template.category)))],
    []
  );
  const filteredTemplates = useMemo(
    () =>
      templateFilter === "All"
        ? CUSTOM_REPORT_TEMPLATES
        : CUSTOM_REPORT_TEMPLATES.filter((template) => template.category === templateFilter),
    [templateFilter]
  );

  const addWidget = (type: CustomReportWidgetType, preferredSlot = selectedSlot ?? 0) => {
    const draftWidget = createWidgetForType(type, preferredSlot);
    const nextSlot = findAvailableSlot(definition.widgets, toPlacementCandidate(draftWidget), preferredSlot);
    if (nextSlot === null) {
      setToolbarMessage("No space left for this widget size. Resize or remove another widget first.");
      return;
    }
    const widget = { ...draftWidget, slot: nextSlot };
    setDefinition((current) => ({
      ...current,
      widgets: [...current.widgets, widget].sort((a, b) => a.slot - b.slot),
    }));
    setSelectedWidgetId(widget.id);
    setSelectedSlot(nextSlot);
    setToolbarMessage(`${widget.title} added to the canvas.`);
  };

  const duplicateWidget = (widgetId: string) => {
    const currentWidget = definition.widgets.find((widget) => widget.id === widgetId);
    if (!currentWidget) return;
    const nextSlot = findAvailableSlot(
      definition.widgets,
      toPlacementCandidate(currentWidget),
      Math.min(currentWidget.slot + 1, REPORT_GRID_SLOT_COUNT - 1)
    );
    if (nextSlot === null) {
      setToolbarMessage("No room to duplicate this widget with its current size.");
      return;
    }
    const duplicate: CustomReportWidgetDefinition = {
      ...currentWidget,
      id: createCustomReportId(),
      slot: nextSlot,
      title: `${currentWidget.title} Copy`,
    };
    setDefinition((current) => ({
      ...current,
      widgets: [...current.widgets, duplicate].sort((a, b) => a.slot - b.slot),
    }));
    setSelectedWidgetId(duplicate.id);
    setSelectedSlot(duplicate.slot);
    setToolbarMessage("Widget duplicated.");
  };

  const updateWidget = (widgetId: string, patch: Partial<CustomReportWidgetDefinition>) => {
    const currentWidget = definition.widgets.find((widget) => widget.id === widgetId);
    if (!currentWidget) return;
    const nextType = patch.type ?? currentWidget.type;
    const nextSpan =
      patch.colSpan || patch.rowSpan || patch.type
        ? clampWidgetSpan({
            type: nextType,
            colSpan: patch.colSpan ?? currentWidget.colSpan,
            rowSpan: patch.rowSpan ?? currentWidget.rowSpan,
          })
        : { colSpan: currentWidget.colSpan, rowSpan: currentWidget.rowSpan };
    const candidate: CustomReportWidgetDefinition = {
      ...currentWidget,
      ...patch,
      type: nextType,
      colSpan: nextSpan.colSpan,
      rowSpan: nextSpan.rowSpan,
    };
    if (!canPlaceWidget(definition.widgets, candidate, widgetId)) {
      const remainingWidgets = definition.widgets.filter((widget) => widget.id !== widgetId);
      const fallbackSlot = findAvailableSlot(remainingWidgets, toPlacementCandidate(candidate), candidate.slot);
      if (fallbackSlot === null) {
        setToolbarMessage("That resize would overlap another widget or exceed the canvas.");
        return;
      }
      candidate.slot = fallbackSlot;
      setToolbarMessage("Widget resized and snapped to the nearest available slot.");
    } else {
      setToolbarMessage(null);
    }
    setDefinition((current) => ({
      ...current,
      widgets: current.widgets.map((widget) => (widget.id === widgetId ? candidate : widget)),
    }));
    setSelectedSlot(candidate.slot);
  };

  useEffect(() => {
    if (!activeResize) return;

    const handlePointerMove = (event: MouseEvent) => {
      const currentWidget = definition.widgets.find((widget) => widget.id === activeResize.widgetId);
      const canvas = canvasOverlayRef.current;
      if (!currentWidget || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const styles = window.getComputedStyle(canvas);
      const columnGap = Number.parseFloat(styles.columnGap || "12") || 12;
      const rowGap = Number.parseFloat(styles.rowGap || styles.gap || "12") || 12;
      const columnWidth = (rect.width - columnGap * (REPORT_GRID_COLUMNS - 1)) / REPORT_GRID_COLUMNS;
      const rowHeight = 120;
      const colDelta =
        activeResize.mode === "row"
          ? 0
          : Math.round((event.clientX - activeResize.startX) / Math.max(columnWidth + columnGap, 1));
      const rowDelta =
        activeResize.mode === "col"
          ? 0
          : Math.round((event.clientY - activeResize.startY) / Math.max(rowHeight + rowGap, 1));

      const nextColSpan = Math.max(1, Math.min(REPORT_GRID_COLUMNS, activeResize.originColSpan + colDelta));
      const nextRowSpan = Math.max(1, Math.min(4, activeResize.originRowSpan + rowDelta));

      if (nextColSpan === currentWidget.colSpan && nextRowSpan === currentWidget.rowSpan) return;
      updateWidget(activeResize.widgetId, {
        colSpan: nextColSpan,
        rowSpan: nextRowSpan,
      });
    };

    const handlePointerUp = () => setActiveResize(null);

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [activeResize, definition.widgets]);

  const removeWidget = (widgetId: string) => {
    const removedWidget = definition.widgets.find((widget) => widget.id === widgetId);
    setDefinition((current) => ({
      ...current,
      widgets: current.widgets.filter((widget) => widget.id !== widgetId),
    }));
    setSelectedWidgetId(null);
    setSelectedSlot(removedWidget?.slot ?? selectedSlot);
  };

  const applyTemplate = (template: CustomReportTemplate) => {
    setTemplateId(template.id);
    setName(template.name);
    setDescription(template.description);
    setDefinition(cloneReportDefinition(template.definition));
    setSelectedWidgetId(template.definition.widgets[0]?.id ?? null);
    setSelectedSlot(template.definition.widgets[0]?.slot ?? null);
  };

  const moveWidgetToSlot = (widgetId: string, nextSlot: number) => {
    const currentWidget = definition.widgets.find((widget) => widget.id === widgetId);
    if (!currentWidget) return;
    const candidate = { ...currentWidget, slot: nextSlot };
    if (!canPlaceWidget(definition.widgets, candidate, widgetId)) {
      const remainingWidgets = definition.widgets.filter((widget) => widget.id !== widgetId);
      const fallbackSlot = findAvailableSlot(remainingWidgets, toPlacementCandidate(candidate), nextSlot);
      if (fallbackSlot === null) {
        setToolbarMessage("That slot is already occupied by another widget's layout.");
        return;
      }
      candidate.slot = fallbackSlot;
      setToolbarMessage("Widget snapped to the nearest available slot.");
    } else {
      setToolbarMessage(null);
    }
    setDefinition((current) => ({
      ...current,
      widgets: current.widgets.map((widget) => (widget.id === widgetId ? candidate : widget)),
    }));
    setSelectedSlot(candidate.slot);
    setSelectedWidgetId(widgetId);
  };

  const canvasWidgets = useMemo(
    () => [...definition.widgets].sort((a, b) => a.slot - b.slot),
    [definition.widgets]
  );
  const dragPreview = useMemo(() => {
    if (hoveredSlot === null) return null;

    if (draggedWidgetType) {
      const previewWidget = createWidgetForType(draggedWidgetType, hoveredSlot);
      const resolvedSlot = findAvailableSlot(
        definition.widgets,
        toPlacementCandidate(previewWidget),
        hoveredSlot
      );
      if (resolvedSlot === null) return null;
      return {
        ...previewWidget,
        slot: resolvedSlot,
        requestedSlot: hoveredSlot,
        snapped: resolvedSlot !== hoveredSlot,
        mode: "create" as const,
      };
    }

    if (!draggedWidgetId) return null;
    const draggedWidget = definition.widgets.find((widget) => widget.id === draggedWidgetId);
    if (!draggedWidget) return null;
    const remainingWidgets = definition.widgets.filter((widget) => widget.id !== draggedWidgetId);
    const resolvedSlot = findAvailableSlot(remainingWidgets, toPlacementCandidate(draggedWidget), hoveredSlot);
    if (resolvedSlot === null) return null;
    return {
      ...draggedWidget,
      slot: resolvedSlot,
      requestedSlot: hoveredSlot,
      snapped: resolvedSlot !== hoveredSlot,
      mode: "move" as const,
    };
  }, [definition.widgets, draggedWidgetId, draggedWidgetType, hoveredSlot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedWidget) {
        if (event.key === "Escape") {
          setSelectedSlot(null);
        }
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removeWidget(selectedWidget.id);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateWidget(selectedWidget.id);
      } else if (event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const col = selectedWidget.slot % REPORT_GRID_COLUMNS;
        const row = Math.floor(selectedWidget.slot / REPORT_GRID_COLUMNS);
        const nextSlot =
          event.key === "ArrowLeft"
            ? col > 0
              ? selectedWidget.slot - 1
              : selectedWidget.slot
            : event.key === "ArrowRight"
              ? col < REPORT_GRID_COLUMNS - 1
                ? selectedWidget.slot + 1
                : selectedWidget.slot
              : event.key === "ArrowUp"
                ? row > 0
                  ? selectedWidget.slot - REPORT_GRID_COLUMNS
                  : selectedWidget.slot
                : row < REPORT_GRID_ROWS - 1
                  ? selectedWidget.slot + REPORT_GRID_COLUMNS
                  : selectedWidget.slot;
        if (nextSlot !== selectedWidget.slot) {
          moveWidgetToSlot(selectedWidget.id, nextSlot);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setSelectedWidgetId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedWidget, selectedSlot, definition.widgets]);

  const getCanvasWidgetStyle = (widget: CustomReportWidgetDefinition) => {
    const colStart = (widget.slot % REPORT_GRID_COLUMNS) + 1;
    const rowStart = Math.floor(widget.slot / REPORT_GRID_COLUMNS) + 1;
    return {
      gridColumn: `${colStart} / span ${Math.min(widget.colSpan, REPORT_GRID_COLUMNS - colStart + 1)}`,
      gridRow: `${rowStart} / span ${widget.rowSpan}`,
    };
  };

  const handleSave = async () => {
    setSaveState("saving");
    setToolbarMessage(null);
    const response = await fetch(initialRecord ? `/api/reports/${initialRecord.id}` : "/api/reports", {
      method: initialRecord ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        name,
        description,
        templateId,
        definition,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setSaveState("error");
      setToolbarMessage((payload as { message?: string } | null)?.message ?? "Save failed.");
      return;
    }
    const report = (payload as { report: CustomReportRecord }).report;
    setSaveState("saved");
    setToolbarMessage("Report saved.");
    if (!initialRecord) {
      router.replace(`/reports/${report.id}`);
    }
  };

  const handleShare = async () => {
    if (!initialRecord) {
      setToolbarMessage("Save the report first to create a share link.");
      return;
    }
    const response = await fetch(`/api/reports/${initialRecord.id}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiryDays: shareExpiryDays }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setToolbarMessage((payload as { message?: string } | null)?.message ?? "Share failed.");
      return;
    }
    const nextUrl = new URL((payload as { url: string }).url, window.location.origin).toString();
    setShareUrl(nextUrl);
    await navigator.clipboard.writeText(nextUrl).catch(() => undefined);
    setToolbarMessage("Share link copied.");
  };

  const handleExport = async (widgetId?: string) => {
    if (!initialRecord) {
      setToolbarMessage("Save the report first to export CSV.");
      return;
    }
    const targetWidgetId = widgetId ?? tableWidgets[0]?.id;
    if (!targetWidgetId) {
      setToolbarMessage("Add a table widget to export CSV.");
      return;
    }
    const response = await fetch(`/api/reports/${initialRecord.id}/export?widgetId=${encodeURIComponent(targetWidgetId)}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setToolbarMessage((payload as { message?: string } | null)?.message ?? "CSV export failed.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!initialRecord) {
      setToolbarMessage("Save the report first to export PDF.");
      return;
    }
    window.open(`/reports/${initialRecord.id}/print`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb]">
      <div className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push("/reports")}>
              Back
            </Button>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-w-[280px] rounded-xl border px-4 py-2 text-lg font-semibold"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={definition.dateRangePreset}
              onChange={(event) =>
                setDefinition((current) => ({
                  ...current,
                  dateRangePreset: event.target.value as CustomReportDocument["dateRangePreset"],
                }))
              }
              className="rounded-xl border px-3 py-2 text-sm"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>
            <select
              value={definition.compareMode}
              onChange={(event) =>
                setDefinition((current) => ({
                  ...current,
                  compareMode: event.target.value as CustomReportDocument["compareMode"],
                }))
              }
              className="rounded-xl border px-3 py-2 text-sm"
            >
              <option value="none">No Comparison</option>
              <option value="previous_period">Previous Period</option>
            </select>
            <Button variant="outline" onClick={() => handleExport()}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              Export PDF
            </Button>
            <select
              value={String(shareExpiryDays)}
              onChange={(event) => setShareExpiryDays(Number(event.target.value))}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              {REPORT_SHARE_EXPIRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Share: {option.label}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={handleShare}>
              Share Link
            </Button>
            <Button onClick={handleSave}>
              {saveState === "saving" ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="min-h-[60px] w-full rounded-2xl border px-4 py-3 text-sm md:max-w-2xl"
            placeholder="What should this report help you communicate?"
          />
          {toolbarMessage ? <p className="text-sm text-muted-foreground">{toolbarMessage}</p> : null}
          {shareUrl ? (
            <a href={shareUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
              Open shared report
            </a>
          ) : null}
        </div>
      </div>

      {dataSourcePickerOpen && selectedWidget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-6 py-8">
          <div className="flex h-[80vh] w-full max-w-6xl overflow-hidden rounded-[32px] border bg-white shadow-2xl">
            <aside className="w-64 border-r bg-slate-50/80 p-4">
              <div className="text-lg font-semibold text-slate-950">Select accounts</div>
              <div className="mt-4 space-y-2">
                {[
                  { id: "meta" as const, label: REPORT_PLATFORM_CATALOG.meta.label, count: metaEntities.length },
                  { id: "google" as const, label: REPORT_PLATFORM_CATALOG.google.label, count: googleEntities.length },
                ].map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => setPickerPlatform(platform.id)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm transition ${
                      pickerPlatform === platform.id
                        ? "border-blue-500 bg-white text-slate-950"
                        : "border-transparent bg-white/70 text-slate-600 hover:border-slate-200"
                    }`}
                  >
                    <span>{platform.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{platform.count}</span>
                  </button>
                ))}
              </div>
            </aside>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <div className="text-lg font-semibold text-slate-950">Select required accounts</div>
                  <div className="mt-1 text-sm text-slate-500">
                    Choose the platform and account this widget should read from.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDataSourcePickerOpen(false)}
                  className="rounded-xl border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                    placeholder="Search account"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                  {REPORT_PLATFORM_CATALOG[pickerPlatform].label} accounts
                </div>
                <div className="mt-4 space-y-3">
                  {pickerAccounts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-6 text-sm text-slate-500">
                      No connected accounts found for this platform yet.
                    </div>
                  ) : (
                    pickerAccounts.map((account) => {
                      const selected = selectedWidget.accountId === account.id;
                      const platformLogo = getReportPlatformLogo(pickerPlatform);
                      const defaultMetric = getDefaultMetricForPlatform(pickerPlatform, selectedWidget.type);
                      return (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => {
                            updateWidget(selectedWidget.id, {
                              platform: pickerPlatform,
                              accountId: account.id,
                              dataSource: getDataSourceForPlatform(pickerPlatform, selectedWidget.type),
                              metricKey:
                                selectedWidget.type === "metric"
                                  ? defaultMetric
                                  : selectedWidget.metricKey,
                              columns:
                                selectedWidget.type === "table"
                                  ? getDefaultColumnsForPlatform(pickerPlatform)
                                  : selectedWidget.columns,
                            });
                            setDataSourcePickerOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition ${
                            selected
                              ? "border-blue-500 bg-blue-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white">
                              {platformLogo ? (
                                <Image src={platformLogo} alt={pickerPlatform} width={18} height={18} className="h-[18px] w-[18px] object-contain" />
                              ) : (
                                <span className="text-xs font-semibold text-slate-500">{pickerPlatform[0].toUpperCase()}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-950">{account.name}</div>
                              <div className="mt-1 truncate text-xs text-slate-500">{account.id}</div>
                            </div>
                          </div>
                          <div
                            className={`h-5 w-5 rounded-md border ${
                              selected ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
                            }`}
                          />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t px-5 py-4">
                <Button variant="outline" onClick={() => setDataSourcePickerOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setDataSourcePickerOpen(false)}>Done</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {!selectedWidget ? (
            <section className="rounded-3xl border bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Widgets
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {WIDGET_LIBRARY.map((widget) => (
                  <div
                    key={widget.type}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(event) => {
                      setDraggedWidgetType(widget.type);
                      event.dataTransfer.setData("text/report-widget-type", widget.type);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onDragEnd={() => {
                      setDraggedWidgetType(null);
                      setHoveredSlot(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        addWidget(widget.type, selectedSlot ?? 0);
                      }
                    }}
                    className="group relative rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-3 text-left text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-sm cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {widget.eyebrow}
                        </div>
                        <div className="mt-1 text-base font-semibold text-slate-950">{widget.label}</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <WidgetLibraryPreview type={widget.type} />
                    </div>
                    <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-3 hidden w-44 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center shadow-lg group-hover:block">
                      <div className="text-sm font-semibold text-slate-900">{widget.label}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{widget.detail}</div>
                      <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-slate-200 bg-white" />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Drag a widget type onto the canvas.
              </p>
            </section>
          ) : null}

          {selectedWidget ? (
            <section className="rounded-3xl border bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setSelectedWidgetId(null);
                  setMetricMenuOpen(false);
                  setMetricSearch("");
                  setColumnMenuOpen(false);
                  setColumnSearch("");
                }}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Back to widgets
              </button>

              <div className="mt-4 space-y-4">
                  {selectedWidget.type === "metric" || selectedWidget.type === "table" || selectedWidget.type === "trend" || selectedWidget.type === "bar" ? (
                    <div className="rounded-[24px] border border-slate-200 p-4">
                      <h3 className="text-base font-semibold text-slate-950">Data source</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedWidget.type === "metric" || selectedWidget.type === "table"
                          ? "Pick a channel first, then choose the exact account and metric."
                          : "Pick a reporting channel first, then choose which blended trend metric to visualize."}
                      </p>

                      <div className="mt-4">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Channel
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {getSupportedPlatformsForWidget(selectedWidget.type).map((channel) => {
                            const isSelected = selectedWidgetChannel === channel.id;
                            const channelLogo = getReportPlatformLogo(channel.id);
                            const nextMetric =
                              getDefaultMetricForPlatform(channel.id, selectedWidget.type) ??
                              selectedWidget.metricKey ??
                              "spend";
                            return (
                              <button
                                key={channel.id}
                                type="button"
                                onClick={() => {
                                  updateWidget(selectedWidget.id, {
                                    platform: channel.id,
                                    accountId: undefined,
                                    dataSource: getDataSourceForPlatform(channel.id, selectedWidget.type),
                                    metricKey: nextMetric,
                                    yMetrics:
                                      selectedWidget.type === "trend" || selectedWidget.type === "bar"
                                        ? [nextMetric]
                                        : selectedWidget.yMetrics,
                                    columns:
                                      selectedWidget.type === "table"
                                        ? getDefaultColumnsForPlatform(channel.id)
                                        : selectedWidget.columns,
                                  });
                                }}
                                className={`rounded-3xl border px-3 py-3 text-sm font-medium transition ${
                                  isSelected
                                    ? "border-blue-500 bg-blue-50 text-blue-700"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                }`}
                                aria-label={channel.label}
                                title={channel.label}
                              >
                                <div className="flex min-h-[76px] items-center justify-center">
                                  {channel.id === "all" ? (
                                    <PlatformLogoStack channels={["meta", "google"]} />
                                  ) : channelLogo ? (
                                    <Image src={channelLogo} alt={channel.label} width={22} height={22} className="h-[22px] w-[22px] object-contain" />
                                  ) : (
                                    <div className="flex h-7 w-7 items-center justify-center text-xs font-semibold text-slate-500">
                                      All
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4">
                        {platformSupportsAccountSelection(selectedWidgetChannel) &&
                        (selectedWidget.type === "metric" || selectedWidget.type === "table") ? (
                        <div className="mt-4">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Account
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPickerPlatform(selectedWidgetChannel === "google" ? "google" : "meta");
                              setDataSourcePickerOpen(true);
                            }}
                            className="flex w-full items-center justify-between rounded-3xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-900 shadow-sm"
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                                {getReportPlatformLogo(selectedWidgetChannel) ? (
                                  <Image
                                    src={getReportPlatformLogo(selectedWidgetChannel)!}
                                    alt={selectedWidgetChannel}
                                    width={18}
                                    height={18}
                                    className="h-[18px] w-[18px] object-contain"
                                  />
                                ) : null}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-slate-900">
                                  {selectedAccountName ?? "Select account"}
                                </span>
                                <span className="block truncate text-xs text-slate-500">
                                  {selectedAccountName ? selectedWidget?.accountId : "Choose a connected account"}
                                </span>
                              </span>
                            </span>
                            <span>⌄</span>
                          </button>
                        </div>
                        ) : null}

                      {selectedWidget.type === "table" ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Columns
                            </div>
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-white">
                              <button
                                type="button"
                                onClick={() => setColumnMenuOpen((current) => !current)}
                                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-900"
                              >
                                <span className="truncate">
                                  {(selectedWidget.columns ?? [])
                                    .map(
                                      (value) =>
                                        getColumnOptionsForPlatform(selectedWidgetChannel).find((column) => column.value === value)?.label ?? value
                                    )
                                    .join(", ") || "Select columns"}
                                </span>
                                <span>{columnMenuOpen ? "⌃" : "⌄"}</span>
                              </button>
                              {columnMenuOpen ? (
                                <div className="border-t px-3 py-3">
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <input
                                      value={columnSearch}
                                      onChange={(event) => setColumnSearch(event.target.value)}
                                      placeholder="Search columns"
                                      className="w-full bg-transparent text-sm outline-none"
                                    />
                                  </div>
                                  <div className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                                    {selectedColumnOptions.map((column) => {
                                      const isSelected = (selectedWidget.columns ?? []).includes(column.value);
                                      return (
                                        <button
                                          key={column.value}
                                          type="button"
                                          onClick={() => {
                                            const currentColumns = selectedWidget.columns ?? [];
                                            const nextColumns = isSelected
                                              ? currentColumns.filter((item) => item !== column.value)
                                              : [...currentColumns, column.value];
                                            updateWidget(selectedWidget.id, {
                                              columns: nextColumns.length ? nextColumns : [column.value],
                                            });
                                          }}
                                          className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${
                                            isSelected
                                              ? "bg-blue-50 text-blue-700"
                                              : "text-slate-800 hover:bg-slate-50"
                                          }`}
                                        >
                                          <span>{column.label}</span>
                                          <span
                                            className={`h-4 w-4 rounded border ${
                                              isSelected ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
                                            }`}
                                          />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                              <label className="text-xs text-slate-500">
                                <span className="mb-1 block font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  Row limit
                                </span>
                                <select
                                  value={selectedWidget.limit ?? 8}
                                  onChange={(event) => updateWidget(selectedWidget.id, { limit: Number(event.target.value) })}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
                                >
                                  <option value="5">5 rows</option>
                                  <option value="8">8 rows</option>
                                  <option value="10">10 rows</option>
                                  <option value="15">15 rows</option>
                                </select>
                              </label>
                            </div>
                          </div>
                        ) : selectedWidget.type === "trend" || selectedWidget.type === "bar" ? (
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                              Metrics
                            </div>
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <input
                                value={metricSearch}
                                onChange={(event) => setMetricSearch(event.target.value)}
                                placeholder="Search metric"
                                className="w-full bg-transparent text-sm outline-none"
                              />
                            </div>
                            <div className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                              {selectedMetricOptions.map((metric) => (
                                <button
                                  key={metric.value}
                                  type="button"
                                  onClick={() => {
                                    const currentMetrics = selectedWidget.yMetrics?.length
                                      ? selectedWidget.yMetrics
                                      : selectedWidget.metricKey
                                        ? [selectedWidget.metricKey]
                                        : [];
                                    const nextMetrics = currentMetrics.includes(metric.value)
                                      ? currentMetrics.filter((item) => item !== metric.value)
                                      : [...currentMetrics, metric.value];
                                    updateWidget(selectedWidget.id, {
                                      yMetrics: nextMetrics.length ? nextMetrics : [metric.value],
                                      metricKey: nextMetrics.length ? nextMetrics[0] : metric.value,
                                    });
                                  }}
                                  className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${
                                    (selectedWidget.yMetrics ?? []).includes(metric.value)
                                      ? "bg-blue-50 text-blue-700"
                                      : "text-slate-800 hover:bg-slate-50"
                                  }`}
                                >
                                  <span>{metric.label}</span>
                                  <span
                                    className={`h-4 w-4 rounded border ${
                                      (selectedWidget.yMetrics ?? []).includes(metric.value)
                                        ? "border-blue-500 bg-blue-500"
                                        : "border-slate-300 bg-white"
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-white">
                            <button
                              type="button"
                              onClick={() => setMetricMenuOpen((current) => !current)}
                              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-900"
                            >
                              <span>
                              {getMetricOptionsForWidget(selectedWidget).find(
                                    (metric) => metric.value === selectedWidget.metricKey
                                  )?.label ?? "Select metric"}
                              </span>
                              <span>{metricMenuOpen ? "⌃" : "⌄"}</span>
                            </button>
                            {metricMenuOpen ? (
                              <div className="border-t px-3 py-3">
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                <input
                                  value={metricSearch}
                                  onChange={(event) => setMetricSearch(event.target.value)}
                                  placeholder="Search metric"
                                  className="w-full bg-transparent text-sm outline-none"
                                />
                              </div>
                                <div className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                                  {selectedMetricOptions.map((metric) => (
                                    <button
                                      key={metric.value}
                                      type="button"
                                      onClick={() => {
                                        updateWidget(selectedWidget.id, { metricKey: metric.value });
                                        setMetricMenuOpen(false);
                                      }}
                                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${
                                        (selectedWidget.metricKey === metric.value)
                                          ? "bg-blue-50 text-blue-700"
                                          : "text-slate-800 hover:bg-slate-50"
                                      }`}
                                    >
                                      <span>{metric.label}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                      )}
                      {(selectedWidget.type === "trend" || selectedWidget.type === "bar") ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Breakdown
                          </div>
                          <select
                            value={selectedWidget.breakdown ?? "day"}
                            onChange={(event) =>
                              updateWidget(selectedWidget.id, {
                                breakdown: event.target.value as CustomReportWidgetDefinition["breakdown"],
                              })
                            }
                            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
                          >
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                          </select>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  ) : null}

                  {selectedWidget.type === "text" || selectedWidget.type === "section" ? (
                    <div className="rounded-[24px] border border-slate-200 p-4">
                      <h3 className="text-base font-semibold text-slate-950">Content</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Use this card for narrative context, section headers, or commentary.
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-[24px] border border-slate-200 p-4">
                    <h3 className="text-base font-semibold text-slate-950">Copy</h3>
                    <div className="mt-4 space-y-3">
                      <label className="block text-xs text-slate-500">
                        <span className="mb-1 block font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Title
                        </span>
                        <input
                          value={selectedWidget.title}
                          onChange={(event) => updateWidget(selectedWidget.id, { title: event.target.value })}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
                        />
                      </label>
                      <label className="block text-xs text-slate-500">
                        <span className="mb-1 block font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Subtitle
                        </span>
                        <input
                          value={selectedWidget.subtitle ?? ""}
                          onChange={(event) => updateWidget(selectedWidget.id, { subtitle: event.target.value || undefined })}
                          placeholder="Optional context line"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
                        />
                      </label>
                    </div>
                  </div>

                  {selectedWidget.type === "text" || selectedWidget.type === "section" ? (
                    <div className="rounded-[24px] border border-slate-200 p-4">
                      <h3 className="text-base font-semibold text-slate-950">Body</h3>
                      <textarea
                        value={selectedWidget.text ?? ""}
                        onChange={(event) => updateWidget(selectedWidget.id, { text: event.target.value })}
                        rows={6}
                        className="mt-4 w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-sm shadow-sm"
                      />
                    </div>
                  ) : null}

                </div>
            </section>
          ) : null}

          {!isBlankBuilder ? (
            <section className="rounded-3xl border bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Templates
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {templateCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setTemplateFilter(category)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      templateFilter === category
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className={`w-full rounded-[24px] border bg-gradient-to-br ${template.accent} px-3 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold">{template.name}</div>
                      <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        {template.category}
                      </span>
                    </div>
                    <TemplateMiniPreview definition={template.definition} className="mt-3" />
                    <div className="mt-2 text-xs text-muted-foreground">{template.description}</div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <section className="space-y-5">
          <div className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Canvas</h2>
                <p className="text-sm text-muted-foreground">
                    Drag a widget from the left palette and drop it onto any empty area.
                  </p>
                </div>
              {templateId ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  Template: {templateId}
                </span>
              ) : null}
            </div>
            {canvasWidgets.length === 0 ? (
              <div className="mb-4 rounded-[28px] border border-dashed border-blue-200 bg-[linear-gradient(135deg,#eff6ff,#ffffff)] px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">Start with your first widget</div>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">
                      Drag a metric, chart, table, or section from the left palette into the canvas. Once it lands,
                      click the widget to configure its source, account, and content.
                    </p>
                  </div>
                    <div className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-xs font-medium text-blue-700 shadow-sm">
                      Drag from left
                    </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Tip: select a widget and use <span className="font-semibold text-slate-700">Delete</span> to remove
                  , <span className="font-semibold text-slate-700">Cmd/Ctrl + D</span> to duplicate it, or{" "}
                  <span className="font-semibold text-slate-700">Shift + Arrow</span> to move it around the grid.
                </div>
              </div>
            ) : null}
            <div className="relative">
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridAutoRows: "120px" }}
              >
                {Array.from({ length: REPORT_GRID_SLOT_COUNT }).map((_, slot) => {
                  const widget = definition.widgets.find((item) => item.slot === slot) ?? null;
                  const slotCovered = occupiedSlots.has(slot);
                  const selected = selectedSlot === slot || selectedWidgetId === widget?.id;
                  return (
                    <div
                      key={slot}
                      onDragOver={(event) => {
                        event.preventDefault();
                        const incomingType =
                          event.dataTransfer.getData("text/report-widget-type") || draggedWidgetType;
                        event.dataTransfer.dropEffect = incomingType ? "copy" : "move";
                        setHoveredSlot(slot);
                      }}
                      onDragLeave={() => {
                        setHoveredSlot((current) => (current === slot ? null : current));
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const widgetType = (
                          event.dataTransfer.getData("text/report-widget-type") || draggedWidgetType || ""
                        ) as CustomReportWidgetType | "";
                        if (widgetType) {
                          addWidget(widgetType, slot);
                          setDraggedWidgetType(null);
                          setHoveredSlot(null);
                          return;
                        }
                        const movingId =
                          event.dataTransfer.getData("text/report-widget-id") || draggedWidgetId;
                        if (!movingId) return;
                        moveWidgetToSlot(movingId, slot);
                        setDraggedWidgetId(null);
                        setDraggedWidgetType(null);
                        setHoveredSlot(null);
                      }}
                      className={`relative rounded-3xl p-4 text-left transition ${
                        slotCovered
                          ? "border border-transparent bg-transparent"
                          : selected
                            ? "border-2 border-blue-500 border-dashed bg-blue-50/60"
                            : hoveredSlot === slot
                              ? "border-2 border-emerald-400 border-dashed bg-emerald-50/70 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]"
                              : "border-2 border-dashed border-slate-200 bg-slate-50/60"
                      }`}
                    >
                      {!slotCovered ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSlot(slot);
                              setSelectedWidgetId(widget?.id ?? null);
                            }}
                            className="absolute inset-0 rounded-3xl"
                            aria-label={widget ? `Select ${widget.title}` : `Target slot ${slot + 1}`}
                          />
                          <div className="relative z-10">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                              Slot {slot + 1}
                            </div>
                            <div className="mt-3 flex h-full min-h-[64px] flex-col justify-center rounded-2xl border border-transparent bg-white/50 px-4 py-3">
                              <div className="text-sm font-semibold text-slate-900">
                                {hoveredSlot === slot ? "Drop widget here" : "Empty slot"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {hoveredSlot === slot
                                  ? draggedWidgetType
                                    ? "Release to create the widget on this slot."
                                    : "Release to place the widget on this slot."
                                  : "Drag a widget here from the left panel."}
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div
                ref={canvasOverlayRef}
                className="pointer-events-none absolute inset-0 grid gap-3"
                style={{
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gridAutoRows: "120px",
                }}
              >
                {canvasWidgets.map((widget) => (
                  (() => {
                    const renderedWidget = renderedWidgetsById.get(widget.id);
                    const previewSummary = getWidgetPreviewSummary(renderedWidget);
                    const widgetChannel = resolveWidgetPlatform(widget);
                    const widgetAccountName = widget.accountId ? accountEntityMap.get(widget.accountId) ?? widget.accountId : null;
                    const widgetMetricLabel =
                      widget.type === "metric" || widget.type === "trend" || widget.type === "bar"
                        ? getMetricOptionsForPlatform(widgetChannel, widget.type).find((metric) => metric.value === widget.metricKey)?.label ?? null
                        : null;
                    return (
                      <div
                        key={widget.id}
                        draggable
                        onDragStart={(event) => {
                          setDraggedWidgetId(widget.id);
                          setDraggedWidgetType(null);
                          event.dataTransfer.setData("text/report-widget-id", widget.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggedWidgetId(null);
                          setHoveredSlot(null);
                        }}
                        onClick={() => {
                          setSelectedWidgetId(widget.id);
                          setSelectedSlot(widget.slot);
                        }}
                        style={getCanvasWidgetStyle(widget)}
                        className={`pointer-events-auto group relative rounded-[28px] border-2 bg-white/95 p-4 text-left shadow-sm transition ${
                          selectedWidgetId === widget.id
                            ? "border-blue-500 shadow-blue-100"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              {widget.type}
                            </div>
                            <div className="mt-2 truncate text-sm font-semibold text-slate-900">{widget.title}</div>
                            {widget.subtitle ? (
                              <div className="mt-1 truncate text-xs text-slate-500">{widget.subtitle}</div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                              {widget.colSpan}x{widget.rowSpan}
                            </span>
                          </div>
                        </div>
                        <div className="mt-4 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-4 py-3">
                          {(widget.type === "metric" || widget.type === "table" || widget.type === "trend" || widget.type === "bar") ? (
                            <div className="mb-3 flex flex-wrap gap-2">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">
                                {widgetChannel === "all" ? "All Channels" : widgetChannel === "meta" ? "Meta" : "Google Ads"}
                              </span>
                              {widgetAccountName ? (
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">
                                  {widgetAccountName}
                                </span>
                              ) : null}
                              {widgetMetricLabel ? (
                                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-blue-700">
                                  {widgetMetricLabel}
                                </span>
                              ) : null}
                              {widget.type === "table" && (widget.columns?.length ?? 0) > 0 ? (
                                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-blue-700">
                                  {widget.columns?.length} columns
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Preview
                          </div>
                          <div className="mt-2 text-base font-semibold text-slate-950">
                            {previewSummary?.primary ?? "Building preview..."}
                          </div>
                          {previewSummary?.secondary ? (
                            <div className="mt-1 line-clamp-2 text-xs text-slate-500">{previewSummary.secondary}</div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-400">
                              Drag to move. Resize from the widget edge.
                            </div>
                          )}
                        </div>
                        {renderedWidget?.warning ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            {renderedWidget.warning}
                          </div>
                        ) : null}
                        <div
                          className={`absolute right-3 top-3 flex items-center gap-1 rounded-full border bg-white/95 px-1.5 py-1 shadow-sm transition ${
                            selectedWidgetId === widget.id
                              ? "opacity-100"
                              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedWidgetId(widget.id);
                              setSelectedSlot(widget.slot);
                        }}
                            className="rounded-full px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                            title="Edit widget"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              duplicateWidget(widget.id);
                            }}
                            className="rounded-full px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                            title="Duplicate widget"
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeWidget(widget.id);
                            }}
                            className="rounded-full px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                            title="Remove widget"
                          >
                            Del
                          </button>
                        </div>
                        {selectedWidgetId === widget.id ? (
                          <button
                            type="button"
                            onMouseDown={(event) => {
                              event.stopPropagation();
                              event.preventDefault();
                              setActiveResize({
                                widgetId: widget.id,
                                mode: "both",
                                startX: event.clientX,
                                startY: event.clientY,
                                originColSpan: widget.colSpan,
                                originRowSpan: widget.rowSpan,
                              });
                            }}
                            className="absolute bottom-3 right-3 h-7 w-7 cursor-se-resize rounded-full border border-blue-300 bg-blue-50 text-[10px] font-bold text-blue-700 shadow-sm hover:bg-blue-100"
                            title="Drag to resize"
                          >
                            <span className="sr-only">Resize widget</span>
                            ↘
                          </button>
                        ) : null}
                        {selectedWidgetId === widget.id ? (
                          <>
                            <button
                              type="button"
                              onMouseDown={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                setActiveResize({
                                  widgetId: widget.id,
                                  mode: "col",
                                  startX: event.clientX,
                                  startY: event.clientY,
                                  originColSpan: widget.colSpan,
                                  originRowSpan: widget.rowSpan,
                                });
                              }}
                              className="absolute bottom-10 right-[-6px] top-10 w-3 cursor-ew-resize rounded-full bg-blue-200/70 opacity-0 transition hover:bg-blue-300 group-hover:opacity-100"
                              title="Resize width"
                            />
                            <button
                              type="button"
                              onMouseDown={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                setActiveResize({
                                  widgetId: widget.id,
                                  mode: "row",
                                  startX: event.clientX,
                                  startY: event.clientY,
                                  originColSpan: widget.colSpan,
                                  originRowSpan: widget.rowSpan,
                                });
                              }}
                              className="absolute bottom-[-6px] left-10 right-10 h-3 cursor-ns-resize rounded-full bg-blue-200/70 opacity-0 transition hover:bg-blue-300 group-hover:opacity-100"
                              title="Resize height"
                            />
                          </>
                        ) : null}
                      </div>
                    );
                  })()
                ))}
                {dragPreview ? (
                  <div
                    style={getCanvasWidgetStyle(dragPreview)}
                    className="rounded-[28px] border-2 border-dashed border-emerald-500 bg-emerald-100/70 p-4"
                  >
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {dragPreview.mode === "create"
                        ? dragPreview.snapped
                          ? "Create Preview"
                          : "Drop to Create"
                        : dragPreview.snapped
                          ? "Snap Preview"
                          : "Drop Preview"}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-emerald-900">
                      {dragPreview.title}
                    </div>
                    <div className="mt-2 text-xs text-emerald-700">
                      {dragPreview.snapped
                        ? `Nearest open slot: ${dragPreview.slot + 1}`
                        : `${dragPreview.mode === "create" ? "Create" : "Drop"} into slot ${dragPreview.slot + 1}`}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Live Preview</h2>
                <p className="text-sm text-muted-foreground">
                  The preview uses the same render engine as saved and shared reports.
                </p>
              </div>
            </div>
            {previewQuery.isLoading ? (
              <div className="rounded-3xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                Building report preview...
              </div>
            ) : previewQuery.error ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                {previewQuery.error instanceof Error ? previewQuery.error.message : "Preview failed."}
              </div>
            ) : previewQuery.data ? (
              <ReportCanvas report={previewQuery.data} />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
