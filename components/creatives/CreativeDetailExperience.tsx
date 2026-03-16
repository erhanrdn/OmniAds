"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Clipboard, Copy, Download, FileText, MessageCircle, Sparkles, X } from "lucide-react";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { formatMoney, resolveCreativeCurrency } from "@/components/creatives/money";
import { cn } from "@/lib/utils";
import { formatMotionDateLabel, type MotionDateRangeValue } from "@/components/creatives/MotionTopSection";
import { getAiCreativeDecisions, type AiCreativeDecision, type AiCreativeDecisionInputRow } from "@/src/services";

interface CreativeDetailExperienceProps {
  businessId: string;
  row: MetaCreativeRow | null;
  allRows: MetaCreativeRow[];
  open: boolean;
  notes: string;
  dateRange: MotionDateRangeValue;
  defaultCurrency: string | null;
  onOpenChange: (open: boolean) => void;
  onNotesChange: (value: string) => void;
  onDateRangeChange: (next: MotionDateRangeValue) => void;
}

type DetailTab = "overview" | "performance" | "comments" | "transcript" | "notes";
type StageSource = "html" | "image";

const TAB_ITEMS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "comments", label: "Ad comments" },
  { id: "transcript", label: "Transcript" },
  { id: "notes", label: "Notes" },
];

const RANGE_PRESETS: Array<{ value: string; label: string; next: MotionDateRangeValue }> = [
  {
    value: "today",
    label: "Today",
    next: { preset: "today", customStart: "", customEnd: "", lastDays: 1, sinceDate: "" },
  },
  {
    value: "last7Days",
    label: "Last 7 days",
    next: { preset: "last7Days", customStart: "", customEnd: "", lastDays: 7, sinceDate: "" },
  },
  {
    value: "last14Days",
    label: "Last 14 days",
    next: { preset: "last14Days", customStart: "", customEnd: "", lastDays: 14, sinceDate: "" },
  },
  {
    value: "last30Days",
    label: "Last 30 days",
    next: { preset: "last30Days", customStart: "", customEnd: "", lastDays: 30, sinceDate: "" },
  },
  {
    value: "thisMonth",
    label: "This month",
    next: { preset: "thisMonth", customStart: "", customEnd: "", lastDays: 30, sinceDate: "" },
  },
];

const DETAIL_LAYOUT = {
  desktopRailWidthLg: 344,
  desktopRailWidthXl: 376,
  stageRegionMaxWidth: 1240,
  stageCardMaxWidth: 1020,
  stageMinHeightBase: 520,
  stageMinHeightXl: 700,
} as const;

type PreviewShape = "portrait" | "feed" | "square" | "landscape";

const HTML_VIEWPORT_RULES: Record<
  PreviewShape,
  { maxWidth: number; maxHeightRatio: number; minScale: number; maxScale: number; chromeHeight: number }
> = {
  portrait: { maxWidth: 720, maxHeightRatio: 0.98, minScale: 0.9, maxScale: 2.2, chromeHeight: 180 },
  feed: { maxWidth: 980, maxHeightRatio: 0.96, minScale: 0.9, maxScale: 2.1, chromeHeight: 260 },
  square: { maxWidth: 920, maxHeightRatio: 0.95, minScale: 0.88, maxScale: 2.0, chromeHeight: 180 },
  landscape: { maxWidth: 1180, maxHeightRatio: 0.92, minScale: 0.84, maxScale: 1.95, chromeHeight: 140 },
};

export function CreativeDetailExperience({
  businessId,
  row,
  allRows,
  open,
  notes,
  dateRange,
  defaultCurrency,
  onOpenChange,
  onNotesChange,
  onDateRangeChange,
}: CreativeDetailExperienceProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [stageSource, setStageSource] = useState<StageSource>("html");
  const [selectedPlacement, setSelectedPlacement] = useState("default");
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPostId, setCopiedPostId] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [detailPreviewHtml, setDetailPreviewHtml] = useState<string | null>(null);
  const [detailPreviewSource, setDetailPreviewSource] = useState<string | null>(null);
  const [detailPreviewLoading, setDetailPreviewLoading] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    setActiveTab("overview");
    setStageSource("html");
    setSelectedPlacement("default");
    setVideoDuration(0);
    setVideoCurrentTime(0);
    setCopiedLink(false);
    setCopiedPostId(false);
    setDetailPreviewHtml(null);
    setDetailPreviewSource(null);
    setDetailPreviewLoading(false);
  }, [row?.id]);

  useEffect(() => {
    if (!open || !row?.creativeId || !businessId) return;
    let cancelled = false;
    const controller = new AbortController();
    setDetailPreviewLoading(true);
    const query = new URLSearchParams({
      businessId,
      detailPreviewCreativeId: row.creativeId,
    });

    fetch(`/api/meta/creatives?${query.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json().catch(() => null))
      .then((payload: unknown) => {
        if (cancelled || !payload || typeof payload !== "object") return;
        const detail = "detail_preview" in payload
          ? (payload as { detail_preview?: Record<string, unknown> }).detail_preview
          : null;
        const html = typeof detail?.html === "string" && detail.html.trim().length > 0 ? detail.html : null;
        const source = typeof detail?.source === "string" ? detail.source : null;
        setDetailPreviewHtml(html);
        setDetailPreviewSource(source);
      })
      .catch(() => {
        if (cancelled) return;
        setDetailPreviewHtml(null);
        setDetailPreviewSource(null);
      })
      .finally(() => {
        if (cancelled) return;
        setDetailPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [businessId, open, row?.creativeId]);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [downloadMenuOpen]);

  useEffect(() => {
    if (detailPreviewLoading) return;
    if (stageSource === "html" && !detailPreviewHtml) {
      setStageSource("image");
    }
  }, [detailPreviewHtml, detailPreviewLoading, stageSource]);

  if (!open || !row) return null;

  const currency = resolveCreativeCurrency(row.currency, defaultCurrency);
  const stageImageSrc = resolveDetailImageUrl(row);
  const hasHtmlPreview = Boolean(detailPreviewHtml);
  const sourceOptions = buildSourceOptions({ hasImage: Boolean(stageImageSrc), hasHtmlPreview });
  const placementOptions = buildPlacementOptions(row.tags);
  const resolvedSource: StageSource = hasHtmlPreview && stageSource === "html" ? "html" : "image";
  const activeMediaUrl = resolvedSource === "image" ? stageImageSrc : null;
  const metaPreviewLink = resolveMetaPreviewLink(row, detailPreviewHtml);
  const postId = resolvePostId(row, detailPreviewHtml);

  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={() => onOpenChange(false)} />
      <div className="absolute inset-2 overflow-hidden rounded-2xl border border-white/20 bg-[#F4F5F7] shadow-2xl md:inset-4">
        <CreativeTopBar
          dateRange={dateRange}
          copiedLink={copiedLink}
          copiedPostId={copiedPostId}
          canCopyLink={Boolean(metaPreviewLink)}
          canCopyPostId={Boolean(postId)}
          onDateRangeChange={onDateRangeChange}
          onCopyLink={async () => {
            if (!metaPreviewLink) return;
            const success = await copyText(metaPreviewLink);
            setCopiedLink(success);
            window.setTimeout(() => setCopiedLink(false), 1600);
          }}
          onCopyPostId={async () => {
            if (!postId) return;
            const success = await copyText(postId);
            setCopiedPostId(success);
            window.setTimeout(() => setCopiedPostId(false), 1200);
          }}
          onClose={() => onOpenChange(false)}
        />

        <div
          className="grid h-[calc(100%-64px)] grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_var(--detail-rail-lg)] xl:grid-cols-[minmax(0,1fr)_var(--detail-rail-xl)]"
          style={
            {
              ["--detail-rail-lg" as string]: `${DETAIL_LAYOUT.desktopRailWidthLg}px`,
              ["--detail-rail-xl" as string]: `${DETAIL_LAYOUT.desktopRailWidthXl}px`,
            } as React.CSSProperties
          }
        >
          <div className="min-h-0 overflow-y-auto bg-[#F2F5F8] px-4 py-4 md:px-6 md:py-6 xl:px-8">
            <div
              className="mx-auto w-full"
              style={{ maxWidth: `${DETAIL_LAYOUT.stageRegionMaxWidth}px` }}
            >
              <div
                className="mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFC] shadow-[0_14px_36px_rgba(15,23,42,0.10)]"
                style={{ maxWidth: `${DETAIL_LAYOUT.stageCardMaxWidth}px` }}
              >
              <CreativeStage
                row={row}
                source={resolvedSource}
                imageSrc={stageImageSrc}
                htmlDoc={detailPreviewHtml}
                htmlSource={detailPreviewSource}
                htmlLoading={detailPreviewLoading}
                onVideoTimeChange={setVideoCurrentTime}
                onVideoDuration={setVideoDuration}
              />

              <CreativePlacementControls
                source={resolvedSource}
                sourceOptions={sourceOptions}
                placement={selectedPlacement}
                placementOptions={placementOptions}
                downloadMenuOpen={downloadMenuOpen}
                downloadMenuRef={menuRef}
                onSourceChange={setStageSource}
                onPlacementChange={setSelectedPlacement}
                onDownloadToggle={() => setDownloadMenuOpen((prev) => !prev)}
                onCopyMediaLink={async () => {
                  if (!activeMediaUrl) return;
                  await copyText(activeMediaUrl);
                  setDownloadMenuOpen(false);
                }}
                onCopyThumbnail={async () => {
                  if (!stageImageSrc) return;
                  await copyText(stageImageSrc);
                  setDownloadMenuOpen(false);
                }}
                onDownloadCreative={() => {
                  if (!activeMediaUrl) return;
                  const a = document.createElement("a");
                  a.href = activeMediaUrl;
                  a.target = "_blank";
                  a.rel = "noopener noreferrer";
                  a.download = "";
                  a.click();
                  setDownloadMenuOpen(false);
                }}
                hasMedia={Boolean(activeMediaUrl)}
                hasImage={Boolean(stageImageSrc)}
              />
              </div>
            </div>
          </div>

          <CreativeAnalysisRail
            row={row}
            allRows={allRows}
            businessId={businessId}
            tab={activeTab}
            currency={currency}
            defaultCurrency={defaultCurrency}
            notes={notes}
            videoDuration={videoDuration}
            videoCurrentTime={videoCurrentTime}
            onTabChange={setActiveTab}
            onNotesChange={onNotesChange}
          />
        </div>
      </div>
    </div>
  );
}

function CreativeTopBar({
  dateRange,
  copiedLink,
  copiedPostId,
  canCopyLink,
  canCopyPostId,
  onDateRangeChange,
  onCopyLink,
  onCopyPostId,
  onClose,
}: {
  dateRange: MotionDateRangeValue;
  copiedLink: boolean;
  copiedPostId: boolean;
  canCopyLink: boolean;
  canCopyPostId: boolean;
  onDateRangeChange: (next: MotionDateRangeValue) => void;
  onCopyLink: () => void;
  onCopyPostId: () => void;
  onClose: () => void;
}) {
  const selectedPreset = RANGE_PRESETS.find((preset) => preset.next.preset === dateRange.preset)?.value ?? "custom";

  return (
    <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/92 px-4 backdrop-blur md:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">Creative Detail</p>
        <p className="truncate text-xs text-slate-500">{formatMotionDateLabel(dateRange)}</p>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedPreset}
          onChange={(event) => {
            const next = RANGE_PRESETS.find((preset) => preset.value === event.target.value);
            if (!next) return;
            onDateRangeChange(next.next);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400"
          aria-label="Date range"
        >
          {RANGE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
          <option value="custom" disabled>
            Custom range
          </option>
        </select>
        <button
          type="button"
          onClick={onCopyLink}
          disabled={!canCopyLink}
          title={canCopyLink ? "Copy Meta preview link" : "Meta preview link unavailable"}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition",
            canCopyLink
              ? "border-slate-200 text-slate-700 hover:bg-slate-50"
              : "cursor-not-allowed border-slate-200 text-slate-400"
          )}
        >
          {copiedLink ? <Clipboard className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedLink ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={onCopyPostId}
          disabled={!canCopyPostId}
          title={canCopyPostId ? "Copy Meta Post ID" : "Post ID unavailable for this creative"}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition",
            canCopyPostId
              ? "border-slate-200 text-slate-700 hover:bg-slate-50"
              : "cursor-not-allowed border-slate-200 text-slate-400"
          )}
        >
          {copiedPostId ? <Clipboard className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedPostId ? "Copied ID" : "Copy Post ID"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50"
          aria-label="Close creative detail"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CreativeStage({
  row,
  source,
  imageSrc,
  htmlDoc,
  htmlSource,
  htmlLoading,
  onVideoDuration,
  onVideoTimeChange,
}: {
  row: MetaCreativeRow;
  source: StageSource;
  imageSrc: string | null;
  htmlDoc: string | null;
  htmlSource: string | null;
  htmlLoading: boolean;
  onVideoDuration: (duration: number) => void;
  onVideoTimeChange: (time: number) => void;
}) {
  const stageTitle = `${row.name} preview`;
  void onVideoDuration;
  void onVideoTimeChange;

  return (
    <section className="bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#eff3f8_68%,_#e8edf5_100%)] px-3 py-4 md:px-6 md:py-6 xl:px-8">
      <div
        className="mx-auto flex w-full items-center justify-center rounded-[22px] border border-slate-200 bg-[#EEF2F7] p-2 md:p-3 xl:p-4"
        style={{
          minHeight: `clamp(${DETAIL_LAYOUT.stageMinHeightBase}px, 64vh, ${DETAIL_LAYOUT.stageMinHeightXl}px)`,
        }}
      >
        {source === "html" && htmlDoc ? (
          <div className="mx-auto flex w-full max-w-[920px] items-center justify-center">
            <HtmlPreviewStage htmlDoc={htmlDoc} htmlSource={htmlSource} title={stageTitle} />
          </div>
        ) : source === "html" && htmlLoading ? (
          <StageLoadingState />
        ) : source === "image" && imageSrc ? (
          <MediaHeroFrame>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt={stageTitle} className="block max-h-[74vh] w-auto max-w-full object-contain" />
          </MediaHeroFrame>
        ) : (
          <StageEmptyState />
        )}
      </div>
    </section>
  );
}

function HtmlPreviewStage({ htmlDoc, htmlSource, title }: { htmlDoc: string; htmlSource: string | null; title: string }) {
  const parsed = useMemo(() => parsePreviewIframeSnippet(htmlDoc), [htmlDoc]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () => {
      setViewportSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const intrinsicWidth = parsed?.width ?? 540;
  const intrinsicHeight = parsed?.height ?? 690;
  const shape = classifyPreviewShape(intrinsicWidth, intrinsicHeight);
  const sizingRule = HTML_VIEWPORT_RULES[shape];
  const effectiveIntrinsicHeight = intrinsicHeight + sizingRule.chromeHeight;
  const horizontalPadding = viewportSize.width >= 1280 ? 24 : viewportSize.width >= 768 ? 20 : 12;
  const verticalPadding = viewportSize.height >= 900 ? 24 : viewportSize.height >= 700 ? 20 : 12;
  const boundedWidth = Math.min(
    Math.max(0, viewportSize.width - horizontalPadding),
    sizingRule.maxWidth
  );
  const boundedHeight = Math.min(
    Math.max(0, viewportSize.height - verticalPadding),
    Math.max(420, Math.floor(viewportSize.height * sizingRule.maxHeightRatio))
  );
  const rawScale =
    boundedWidth > 0 && boundedHeight > 0
      ? Math.min(boundedWidth / intrinsicWidth, boundedHeight / effectiveIntrinsicHeight)
      : 1;
  const scale = clamp(rawScale, sizingRule.minScale, sizingRule.maxScale);
  const scaledWidth = Math.max(1, Math.floor(intrinsicWidth * scale));
  const scaledHeight = Math.max(1, Math.floor(effectiveIntrinsicHeight * scale));
  const viewportFrameWidth = Math.min(scaledWidth, boundedWidth > 0 ? boundedWidth : scaledWidth);
  const viewportFrameHeight = Math.min(scaledHeight, boundedHeight > 0 ? boundedHeight : scaledHeight);

  return (
    <div
      ref={viewportRef}
      className="flex w-full items-center justify-center"
      style={{
        minHeight: "620px",
      }}
    >
      {parsed?.src ? (
        <iframe
          title={title}
          src={parsed.src}
          width={intrinsicWidth}
          height={effectiveIntrinsicHeight}
          style={{
            border: "none",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      ) : (
        <iframe
          title={title}
          srcDoc={buildScaledPreviewDoc(htmlDoc)}
          style={{
            width: viewportFrameWidth,
            height: viewportFrameHeight,
            border: "none",
          }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      )}
    </div>
  );
}

function StageLoadingState() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">Loading ad preview</p>
      <p className="mt-1 text-xs text-slate-500">Fetching HTML ad preview for this creative.</p>
    </div>
  );
}

function CreativePlacementControls({
  source,
  sourceOptions,
  placement,
  placementOptions,
  downloadMenuOpen,
  downloadMenuRef,
  onSourceChange,
  onPlacementChange,
  onDownloadToggle,
  onCopyMediaLink,
  onCopyThumbnail,
  onDownloadCreative,
  hasMedia,
  hasImage,
}: {
  source: StageSource;
  sourceOptions: Array<{ value: StageSource; label: string }>;
  placement: string;
  placementOptions: Array<{ value: string; label: string }>;
  downloadMenuOpen: boolean;
  downloadMenuRef: React.RefObject<HTMLDivElement | null>;
  onSourceChange: (value: StageSource) => void;
  onPlacementChange: (value: string) => void;
  onDownloadToggle: () => void;
  onCopyMediaLink: () => Promise<void>;
  onCopyThumbnail: () => Promise<void>;
  onDownloadCreative: () => void;
  hasMedia: boolean;
  hasImage: boolean;
}) {
  return (
    <section className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/90 px-4 py-3 md:px-5">
      <select
        value={placement}
        onChange={(event) => onPlacementChange(event.target.value)}
        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-slate-400"
        aria-label="Placement selector"
      >
        {placementOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        value={source}
        onChange={(event) => onSourceChange(event.target.value as StageSource)}
        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-slate-400"
        aria-label="Source selector"
      >
        {sourceOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="relative" ref={downloadMenuRef}>
        <button
          type="button"
          onClick={onDownloadToggle}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>

        {downloadMenuOpen && (
          <div className="absolute left-0 top-11 z-20 min-w-[210px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
            <DownloadItem label="Copy thumbnail" onClick={onCopyThumbnail} disabled={!hasImage} />
            <DownloadItem label="Download creative" onClick={onDownloadCreative} disabled={!hasMedia} />
            <DownloadItem label="Download as GIF" onClick={() => undefined} disabled />
            <DownloadItem label="Copy media link" onClick={onCopyMediaLink} disabled={!hasMedia} />
          </div>
        )}
      </div>
    </section>
  );
}

function MediaHeroFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex w-full items-center justify-center overflow-hidden rounded-[20px] border border-slate-300 bg-[#0b0f17] p-1.5 shadow-[0_30px_90px_rgba(2,6,23,0.38)]"
      style={{
        maxWidth: "min(860px, 100%)",
        maxHeight: "min(78vh, 760px)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(148,163,184,0.25),rgba(15,23,42,0.08)_55%,rgba(2,6,23,0.85)_100%)]" />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

function DownloadItem({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "block w-full rounded-md px-2.5 py-2 text-left text-xs",
        disabled ? "cursor-not-allowed text-slate-400" : "text-slate-700 hover:bg-slate-100"
      )}
    >
      {label}
    </button>
  );
}

function CreativeAnalysisRail({
  row,
  allRows,
  businessId,
  tab,
  currency,
  defaultCurrency,
  notes,
  videoDuration,
  videoCurrentTime,
  onTabChange,
  onNotesChange,
}: {
  row: MetaCreativeRow;
  allRows: MetaCreativeRow[];
  businessId: string;
  tab: DetailTab;
  currency: string | null;
  defaultCurrency: string | null;
  notes: string;
  videoDuration: number;
  videoCurrentTime: number;
  onTabChange: (tab: DetailTab) => void;
  onNotesChange: (value: string) => void;
}) {
  const railBadges = [
    row.creativeTypeLabel,
    row.format === "video" ? "Video" : row.format === "catalog" ? "Catalog" : "Image",
    row.launchDate ? `Launched ${row.launchDate}` : null,
  ].filter(Boolean) as string[];

  return (
    <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_16%,#ffffff_100%)]">
      <div className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/92 px-4 pt-4 backdrop-blur">
        <div className="rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="space-y-2.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Creative workspace</p>
              <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{row.name}</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {railBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-medium transition",
                tab === item.id
                  ? "bg-slate-950 text-white shadow-[0_8px_20px_rgba(15,23,42,0.18)]"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              {item.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {tab === "overview" && (
          <CreativeOverviewTab
            row={row}
            allRows={allRows}
            businessId={businessId}
            currency={currency}
            defaultCurrency={defaultCurrency}
          />
        )}
        {tab === "performance" && (
          <CreativePerformanceTab
            row={row}
            currency={currency}
            defaultCurrency={defaultCurrency}
            videoDuration={videoDuration}
            videoCurrentTime={videoCurrentTime}
          />
        )}
        {tab === "comments" && <CreativeCommentsTab />}
        {tab === "transcript" && <CreativeTranscriptTab row={row} videoDuration={videoDuration} />}
        {tab === "notes" && <CreativeNotesTab notes={notes} onNotesChange={onNotesChange} />}
      </div>
    </aside>
  );
}

function CreativeOverviewTab({
  row,
  allRows,
  businessId,
  currency,
  defaultCurrency,
}: {
  row: MetaCreativeRow;
  allRows: MetaCreativeRow[];
  businessId: string;
  currency: string | null;
  defaultCurrency: string | null;
}) {
  const insight = summarizePerformance(row);
  const aiDecisionInputRows = useMemo<AiCreativeDecisionInputRow[]>(
    () =>
      allRows.map((item) => {
        const creativeAgeDays = calculateCreativeAgeDays(item.launchDate);
        const frequency = Number((item as MetaCreativeRow & { frequency?: number }).frequency ?? 0);
        return {
          creativeId: item.id,
          name: item.name,
          creativeFormat: item.format,
          creativeAgeDays,
          spendVelocity: item.spend / Math.max(1, creativeAgeDays),
          frequency,
          spend: item.spend,
          purchaseValue: item.purchaseValue,
          roas: item.roas,
          cpa: item.cpa,
          ctr: item.ctrAll,
          cpm: item.cpm,
          cpc: item.cpcLink,
          purchases: item.purchases,
          impressions: item.impressions,
          linkClicks: item.linkClicks,
          hookRate: item.thumbstop,
          holdRate: item.video100,
          video25Rate: item.video25,
          watchRate: item.video50,
          video75Rate: item.video75,
          clickToPurchaseRate: item.clickToPurchase,
          atcToPurchaseRate: item.atcToPurchaseRatio,
        };
      }),
    [allRows]
  );
  const aiDecisionSignature = useMemo(
    () => aiDecisionInputRows.map((item) => `${item.creativeId}:${item.spend.toFixed(2)}:${item.roas.toFixed(3)}`).join("|"),
    [aiDecisionInputRows]
  );
  const aiDecisionQuery = useQuery({
    queryKey: ["creative-detail-ai-decisions", businessId, aiDecisionSignature],
    enabled: Boolean(businessId) && aiDecisionInputRows.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: () => getAiCreativeDecisions(businessId, currency ?? defaultCurrency ?? "USD", aiDecisionInputRows, false),
  });
  const aiDecision = useMemo(
    () => aiDecisionQuery.data?.decisions.find((item) => item.creativeId === row.id) ?? null,
    [aiDecisionQuery.data?.decisions, row.id]
  );
  const decisionContext = useMemo(() => buildCreativeDecisionContext(row, allRows), [allRows, row]);
  const whyBullets = useMemo(() => buildWhyBullets(row, aiDecision, decisionContext), [aiDecision, decisionContext, row]);
  const signalBullets = useMemo(() => buildSignalBullets(row, decisionContext), [decisionContext, row]);
  const nextMoveBullets = useMemo(() => buildNextMoveBullets(row, aiDecision, decisionContext), [aiDecision, decisionContext, row]);
  const lastSyncLabel = useMemo(() => {
    const value = aiDecisionQuery.data?.lastSyncedAt;
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }, [aiDecisionQuery.data?.lastSyncedAt]);
  const decisionTheme = getDecisionTheme(aiDecision?.action ?? null);
  const decisionHeadline = aiDecision
    ? aiDecision.action === "scale_hard"
      ? "High-conviction scale candidate"
      : aiDecision.action === "scale"
      ? "Ready for controlled scale"
      : aiDecision.action === "kill"
        ? "Immediate stop recommended"
      : aiDecision.action === "pause"
        ? "Loss prevention recommended"
        : aiDecision.action === "test_more"
          ? "Collect stronger test evidence"
        : "Monitor before committing more budget"
    : "Decision pending";
  const decisionSummary = aiDecision?.reasons?.[0] ?? insight;
  const supportingSummary = aiDecision?.nextStep?.trim() || insight;
  const quickStats = [
    { label: "Spend", value: formatMoney(row.spend, currency, defaultCurrency) },
    { label: "ROAS", value: `${row.roas.toFixed(2)}x` },
    { label: "CPA", value: formatMoney(row.cpa, currency, defaultCurrency) },
    { label: "Purchases", value: row.purchases.toLocaleString() },
  ];
  const promptStarters = buildThoughtStarters(aiDecision?.action ?? null);

  return (
    <>
      <section className={cn("rounded-[24px] border p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]", decisionTheme.panelClass)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Decision snapshot</p>
            <h3 className="mt-1 text-base font-semibold leading-6 text-slate-950">{decisionHeadline}</h3>
          </div>
          {aiDecision ? <DecisionBadge action={aiDecision.action} /> : null}
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-700">{decisionSummary}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{supportingSummary}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {quickStats.map((item) => (
            <DecisionStatCard key={item.label} label={item.label} value={item.value} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <InfoBadge label={aiDecision ? `Confidence ${Math.round(aiDecision.confidence * 100)}%` : "Awaiting analysis"} />
          {lastSyncLabel ? <InfoBadge label={`Last sync ${lastSyncLabel}`} subtle /> : null}
          {aiDecisionQuery.data?.source ? <InfoBadge label={aiDecisionQuery.data.source === "ai" ? "AI-backed" : "Fallback logic"} subtle /> : null}
        </div>

        {aiDecisionQuery.data?.warning ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs leading-5 text-amber-800">
            {aiDecisionQuery.data.warning}
          </div>
        ) : null}
      </section>

      <MetricCardGrid
        title="Commercial snapshot"
        items={[
          { label: "Spend", value: formatMoney(row.spend, currency, defaultCurrency) },
          { label: "ROAS", value: `${row.roas.toFixed(2)}x` },
          { label: "Purchase value", value: formatMoney(row.purchaseValue, currency, defaultCurrency) },
          { label: "Purchases", value: row.purchases.toLocaleString() },
        ]}
      />

      <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Executive readout</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">{insight}</p>
      </section>

      <BulletSection title="Why this decision" items={whyBullets} tone={decisionTheme.sectionTone} />

      <BulletSection title="Signals considered" items={signalBullets} tone="neutral" />

      <BulletSection title="What to do next" items={nextMoveBullets} tone="positive" ordered />

      <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          <Sparkles className="h-3.5 w-3.5" />
          Ask better follow-ups
        </div>
        <div className="space-y-2">
          {promptStarters.map((item) => (
            <button
              key={item.title}
              type="button"
              className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white"
            >
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
                <Bot className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-slate-800">{item.title}</span>
                <span className="mt-1 block text-[11px] leading-5 text-slate-500">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Metadata</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MetadataField label="Launch date" value={row.launchDate || "Unknown"} />
              <MetadataField label="Status" value="Active" />
              <MetadataField label="Active ads" value={String(row.associatedAdsCount || 0)} />
              <MetadataField label="Creative type" value={row.creativeTypeLabel} />
              <MetadataField label="Platform" value="Meta" />
              <MetadataField label="Format" value={row.format === "video" ? "Video" : row.format === "catalog" ? "Catalog" : "Image"} />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Tags & messaging</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {row.tags.length > 0 ? row.tags.map((tag) => <TagPill key={tag} value={tag} />) : <p className="text-xs text-slate-500">No tags available.</p>}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function CreativePerformanceTab({
  row,
  currency,
  defaultCurrency,
  videoDuration,
  videoCurrentTime,
}: {
  row: MetaCreativeRow;
  currency: string | null;
  defaultCurrency: string | null;
  videoDuration: number;
  videoCurrentTime: number;
}) {
  const [placementMetric, setPlacementMetric] = useState<"spend" | "impressions" | "roas">("spend");
  const [demographicMetric, setDemographicMetric] = useState<"spend" | "impressions" | "purchases">("spend");

  const placementBars = useMemo(() => {
    const baseValue = placementMetric === "spend" ? row.spend : placementMetric === "impressions" ? row.impressions : row.roas;
    return [{ label: "All placements", value: baseValue, available: true }];
  }, [placementMetric, row.impressions, row.roas, row.spend]);

  const metricItems = buildPerformanceMetrics(row, currency, defaultCurrency);

  return (
    <>
      <CreativeVideoAnalysis
        row={row}
        videoDuration={videoDuration}
        videoCurrentTime={videoCurrentTime}
      />

      <ChartBlock
        title="Placement breakdown"
        metric={placementMetric}
        onMetricChange={(value) => setPlacementMetric(value as "spend" | "impressions" | "roas")}
        metricOptions={[
          { value: "spend", label: "Spend" },
          { value: "impressions", label: "Impressions" },
          { value: "roas", label: "ROAS" },
        ]}
        bars={placementBars}
        emptyNote="Placement-level breakdown is not available in the current payload yet."
      />

      <ChartBlock
        title="Demographic breakdown"
        metric={demographicMetric}
        onMetricChange={(value) => setDemographicMetric(value as "spend" | "impressions" | "purchases")}
        metricOptions={[
          { value: "spend", label: "Spend" },
          { value: "impressions", label: "Impressions" },
          { value: "purchases", label: "Purchases" },
        ]}
        bars={[]}
        emptyNote="Gender/age breakdown will appear when audience slices are available."
      />

      <MetricCardGrid title="Performance metrics" items={metricItems} />
    </>
  );
}

function CreativeVideoAnalysis({
  row,
  videoDuration,
  videoCurrentTime,
}: {
  row: MetaCreativeRow;
  videoDuration: number;
  videoCurrentTime: number;
}) {
  const hasVideoStats = row.format === "video" || row.video25 > 0 || row.video50 > 0 || row.video75 > 0 || row.video100 > 0;
  if (!hasVideoStats) {
    return (
      <section className="rounded-xl border border-slate-200 p-3.5">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Video analysis</h3>
        <p className="text-xs text-slate-500">No video retention data for this creative.</p>
      </section>
    );
  }

  const points = [100, row.thumbstop, row.video25, row.video50, row.video75, row.video100].map((value) => clamp(value, 0, 100));
  const marker = videoDuration > 0 ? clamp((videoCurrentTime / videoDuration) * 100, 0, 100) : null;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - value;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <section className="rounded-xl border border-slate-200 p-3.5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Video analysis</h3>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-32 w-full">
          <polyline fill="none" stroke="#0f172a" strokeWidth="2.2" points={path} />
          {marker !== null ? <line x1={marker} x2={marker} y1={0} y2={100} stroke="#2563eb" strokeDasharray="3 3" strokeWidth="1.2" /> : null}
        </svg>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
          <span>25%: {row.video25.toFixed(2)}%</span>
          <span>50%: {row.video50.toFixed(2)}%</span>
          <span>100%: {row.video100.toFixed(2)}%</span>
        </div>
      </div>
    </section>
  );
}

function ChartBlock({
  title,
  metric,
  metricOptions,
  bars,
  emptyNote,
  onMetricChange,
}: {
  title: string;
  metric: string;
  metricOptions: Array<{ value: string; label: string }>;
  bars: Array<{ label: string; value: number; available?: boolean }>;
  emptyNote: string;
  onMetricChange: (metric: string) => void;
}) {
  const max = Math.max(...bars.map((bar) => bar.value), 0);
  return (
    <section className="rounded-xl border border-slate-200 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <select
          value={metric}
          onChange={(event) => onMetricChange(event.target.value)}
          className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600"
        >
          {metricOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {bars.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">{emptyNote}</p>
      ) : (
        <div className="space-y-2">
          {bars.map((bar) => (
            <div key={bar.label} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">{bar.label}</span>
                <span className="font-medium tabular-nums text-slate-700">{bar.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-slate-900" style={{ width: `${max > 0 ? (bar.value / max) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CreativeCommentsTab() {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="mb-2 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-800">Comments integration</h3>
      </div>
      <p className="text-xs leading-5 text-slate-600">
        Connect ad comments to analyze sentiment, surface objections, and turn feedback into iteration ideas.
      </p>
      <button type="button" className="mt-3 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500">
        Connect comments (coming soon)
      </button>
      <p className="mt-2 text-[11px] text-slate-500">This unlocks comment threads, summaries, and response insights.</p>
    </section>
  );
}

function CreativeTranscriptTab({ row, videoDuration }: { row: MetaCreativeRow; videoDuration: number }) {
  if (row.format !== "video") {
    return (
      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Transcript</h3>
        <p className="mt-2 text-xs text-slate-600">Transcript is available for video creatives only.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-800">Transcript</h3>
      </div>
      <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
        <p>Language: Unknown</p>
        <p>Duration: {videoDuration > 0 ? formatDuration(videoDuration) : "Unknown"}</p>
      </div>
      <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">No transcript available yet.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500">
          Generate transcript
        </button>
        <button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500">
          Copy transcript
        </button>
      </div>
    </section>
  );
}

function CreativeNotesTab({ notes, onNotesChange }: { notes: string; onNotesChange: (value: string) => void }) {
  const [draft, setDraft] = useState(notes);
  useEffect(() => setDraft(notes), [notes]);

  const rows = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const save = () => onNotesChange(draft.trim());

  return (
    <section className="flex min-h-[460px] flex-col rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Operator notes</h3>
      <p className="mt-1 text-xs text-slate-500">Capture learnings and next actions for this creative.</p>

      <div className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">No notes yet. Add key observations, testing ideas, and next steps.</p>
        ) : (
          rows.map((line, index) => (
            <p key={`${line}_${index}`} className="rounded-md bg-white px-2.5 py-2 text-xs text-slate-700 shadow-sm">
              {line}
            </p>
          ))
        )}
      </div>

      <div className="mt-3 rounded-md border border-slate-200 bg-white p-2">
        <textarea
          value={draft}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
          placeholder="Add note..."
          className="min-h-24 w-full resize-y rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-400"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">Optional: connect Slack sync later.</p>
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Save note
          </button>
        </div>
      </div>
    </section>
  );
}

function MetricCardGrid({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-3">
            <p className="text-[11px] text-slate-500">{item.label}</p>
            <p className="mt-1.5 text-sm font-semibold tabular-nums text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetadataField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function TagPill({ value }: { value: string }) {
  return <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">{value}</span>;
}

function BulletSection({
  title,
  items,
  tone = "neutral",
  ordered = false,
}: {
  title: string;
  items: string[];
  tone?: "neutral" | "positive" | "warning";
  ordered?: boolean;
}) {
  const toneClasses =
    tone === "positive"
      ? "border-emerald-200 bg-emerald-50/50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/55"
        : "border-slate-200 bg-white";

  return (
    <section className={cn("rounded-[22px] border p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]", toneClasses)}>
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</h3>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item} className="flex gap-3 text-xs leading-5 text-slate-700">
            <span className={cn(
              "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
              ordered ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
            )}>
              {ordered ? index + 1 : "•"}
            </span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DecisionBadge({ action }: { action: AiCreativeDecision["action"] }) {
  const label =
    action === "scale_hard"
      ? "SCALE HARD"
      : action === "test_more"
        ? "TEST MORE"
        : action.toUpperCase();

  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase",
        action === "scale_hard"
          ? "bg-emerald-700 text-white"
          : action === "scale"
          ? "bg-emerald-100 text-emerald-700"
          : action === "test_more"
            ? "bg-sky-100 text-sky-700"
            : action === "kill"
              ? "bg-red-200 text-red-800"
          : action === "pause"
            ? "bg-orange-100 text-orange-700"
            : "bg-amber-100 text-amber-700"
      )}
    >
      {label}
    </span>
  );
}

function DecisionStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function InfoBadge({ label, subtle = false }: { label: string; subtle?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium",
        subtle ? "border border-slate-200 bg-white/85 text-slate-600" : "bg-slate-900 text-white"
      )}
    >
      {label}
    </span>
  );
}

function StageEmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">No detail preview available</p>
      <p className="mt-1 text-xs text-slate-500">This creative has no HTML ad preview and no usable image fallback in the current payload.</p>
    </div>
  );
}

function buildSourceOptions({
  hasImage,
  hasHtmlPreview,
}: {
  hasImage: boolean;
  hasHtmlPreview: boolean;
}): Array<{ value: StageSource; label: string }> {
  const options: Array<{ value: StageSource; label: string }> = [];
  if (hasHtmlPreview) {
    options.push({ value: "html", label: "Ad preview (HTML)" });
  }
  if (hasImage) {
    options.push({ value: "image", label: "Media image" });
  }
  return options.length > 0 ? options : [{ value: "image", label: "Media image" }];
}

function buildPlacementOptions(tags: string[]): Array<{ value: string; label: string }> {
  const placements = tags.filter((tag) => /(feed|reels|stories|story|explore|search|video|creative)/i.test(tag));
  const mapped = placements.map((placement) => ({
    value: placement.toLowerCase(),
    label: placement,
  }));
  if (mapped.length === 0) {
    return [{ value: "default", label: "Creative default" }];
  }
  return [{ value: "default", label: "Creative default" }, ...mapped];
}

function buildPerformanceMetrics(
  row: MetaCreativeRow,
  currency: string | null,
  defaultCurrency: string | null
): Array<{ label: string; value: string }> {
  const averageOrderValue = row.purchases > 0 ? row.purchaseValue / row.purchases : 0;
  const cpcAll = row.cpcLink;

  return [
    { label: "Spend", value: formatMoney(row.spend, currency, defaultCurrency) },
    { label: "Purchase value", value: formatMoney(row.purchaseValue, currency, defaultCurrency) },
    { label: "ROAS", value: `${row.roas.toFixed(2)}x` },
    { label: "CPA", value: formatMoney(row.cpa, currency, defaultCurrency) },
    { label: "CPC (link)", value: formatMoney(row.cpcLink, currency, defaultCurrency) },
    { label: "CPM", value: formatMoney(row.cpm, currency, defaultCurrency) },
    { label: "CPC (all)", value: formatMoney(cpcAll, currency, defaultCurrency) },
    { label: "AOV", value: formatMoney(averageOrderValue, currency, defaultCurrency) },
    { label: "Click to ATC ratio", value: `${row.clickToPurchase.toFixed(2)}%` },
    { label: "ATC to purchase ratio", value: `${row.atcToPurchaseRatio.toFixed(2)}%` },
    { label: "Purchases", value: row.purchases.toLocaleString() },
    { label: "First frame retention", value: `${row.thumbstop.toFixed(2)}%` },
    { label: "Thumbstop ratio", value: `${row.thumbstop.toFixed(2)}%` },
    { label: "CTR (outbound)", value: `${row.ctrAll.toFixed(2)}%` },
    { label: "Click to purchase ratio", value: `${row.clickToPurchase.toFixed(2)}%` },
    { label: "CTR (all)", value: `${row.ctrAll.toFixed(2)}%` },
    { label: "25% video plays", value: `${row.video25.toFixed(2)}%` },
    { label: "50% video plays", value: `${row.video50.toFixed(2)}%` },
    { label: "75% video plays", value: `${row.video75.toFixed(2)}%` },
    { label: "100% video plays", value: `${row.video100.toFixed(2)}%` },
    { label: "Hold rate", value: `${row.video100.toFixed(2)}%` },
  ];
}

function summarizePerformance(row: MetaCreativeRow): string {
  if (row.roas >= 2 && row.spend > 100) {
    return "This creative is commercially strong. ROAS is sustaining above target with enough spend to justify scaling tests across additional budgets and placements.";
  }
  if (row.roas >= 1) {
    return "This creative is stable but not dominant. Prioritize hook/copy variants and test against stronger controls before broader scale.";
  }
  return "This creative is currently underperforming on return. Treat it as an iteration candidate: test new hooks, creative framing, and audience alignment before adding spend.";
}

function calculateCreativeAgeDays(launchDate: string): number {
  const parsed = Date.parse(launchDate);
  if (!Number.isFinite(parsed)) return 0;
  const ageMs = Date.now() - parsed;
  if (ageMs <= 0) return 0;
  return Math.floor(ageMs / (1000 * 60 * 60 * 24));
}

interface CreativeDecisionContext {
  roasAvg: number;
  cpaAvg: number;
  ctrAvg: number;
  spendAvg: number;
  spendMedian: number;
  hookAvg: number;
  holdAvg: number;
}

function buildCreativeDecisionContext(row: MetaCreativeRow, allRows: MetaCreativeRow[]): CreativeDecisionContext {
  const sourceRows = allRows.length > 0 ? allRows : [row];
  const avg = (values: number[]) => {
    const valid = values.filter((value) => Number.isFinite(value));
    return valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
  };
  const median = (values: number[]) => {
    const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (valid.length === 0) return 0;
    const mid = Math.floor(valid.length / 2);
    return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
  };
  return {
    roasAvg: avg(sourceRows.map((item) => item.roas)),
    cpaAvg: avg(sourceRows.map((item) => item.cpa)),
    ctrAvg: avg(sourceRows.map((item) => item.ctrAll)),
    spendAvg: avg(sourceRows.map((item) => item.spend)),
    spendMedian: median(sourceRows.map((item) => item.spend)),
    hookAvg: avg(sourceRows.map((item) => item.thumbstop)),
    holdAvg: avg(sourceRows.map((item) => item.video100)),
  };
}

function pctDelta(value: number, avg: number, inverse = false): string {
  if (!(avg > 0)) return "in line with baseline";
  const delta = ((value - avg) / avg) * 100;
  const effective = inverse ? -delta : delta;
  if (Math.abs(effective) < 5) return "roughly in line with baseline";
  return effective > 0 ? `${Math.abs(effective).toFixed(0)}% better than baseline` : `${Math.abs(effective).toFixed(0)}% worse than baseline`;
}

function buildWhyBullets(
  row: MetaCreativeRow,
  decision: AiCreativeDecision | null,
  context: CreativeDecisionContext
): string[] {
  const items = [...(decision?.reasons ?? [])];
  if (decision?.action === "scale_hard") {
    items.push("This creative has both strong efficiency and commercially meaningful signal depth.");
  }
  if (decision?.action === "watch") {
    items.push(`ROAS is ${pctDelta(row.roas, context.roasAvg)} and spend is ${row.spend >= context.spendMedian ? "already meaningful" : "still below the account median"}.`);
  }
  if (decision?.action === "test_more") {
    items.push("Current evidence is too thin for a confident scale or stop decision.");
  }
  if (decision?.action === "pause") {
    items.push(`CPA is ${pctDelta(row.cpa, context.cpaAvg, true)} while spend is high enough to treat this as a reliable warning signal.`);
  }
  if (decision?.action === "kill") {
    items.push("Downside risk is strong enough to stop this variant and reallocate budget immediately.");
  }
  if (decision?.action === "scale") {
    items.push(`This creative combines healthy efficiency with enough spend to justify a scale test.`);
  }
  if (items.length === 0) {
    items.push("No AI decision details are available yet for this creative.");
  }
  return items.slice(0, 4);
}

function buildSignalBullets(row: MetaCreativeRow, context: CreativeDecisionContext): string[] {
  const items = [
    `ROAS is ${row.roas.toFixed(2)}x vs account average ${context.roasAvg.toFixed(2)}x.` ,
    `CPA is ${row.cpa.toFixed(2)} vs account average ${context.cpaAvg.toFixed(2)}.` ,
    `CTR is ${row.ctrAll.toFixed(2)}% vs account average ${context.ctrAvg.toFixed(2)}%.`,
    `Spend is ${formatCompactCurrency(row.spend)} vs median creative spend ${formatCompactCurrency(context.spendMedian)}.`,
  ];
  if (row.format === "video" || row.video50 > 0 || row.video100 > 0) {
    items.push(`Hook rate is ${row.thumbstop.toFixed(2)}% vs average ${context.hookAvg.toFixed(2)}%; hold rate is ${row.video100.toFixed(2)}% vs average ${context.holdAvg.toFixed(2)}%.`);
  }
  return items;
}

function buildNextMoveBullets(
  row: MetaCreativeRow,
  decision: AiCreativeDecision | null,
  context: CreativeDecisionContext
): string[] {
  if (decision?.action === "scale_hard") {
    return [
      "Increase budget in larger controlled steps while monitoring intraday efficiency.",
      "Replicate this winner into adjacent audiences and placements quickly.",
      "Protect performance with fail-fast guardrails on CPA/ROAS drift.",
    ];
  }
  if (decision?.action === "scale") {
    return [
      "Increase budget gradually instead of all at once.",
      "Watch CPA and ROAS for the next 3 days to confirm stability.",
      row.format === "video"
        ? "Duplicate the hook/opening and test 2-3 new message angles."
        : "Keep the winning visual but test stronger copy and CTA variants.",
    ];
  }
  if (decision?.action === "pause") {
    return [
      "Stop allocating more budget to this variant.",
      "Replace it with a new hook, offer framing, or angle rather than small cosmetic edits.",
      context.cpaAvg > 0 && row.cpa > context.cpaAvg ? "Use the current CPA gap as the minimum improvement target for the next test." : "Use a stronger control creative for the next test iteration.",
    ];
  }
  if (decision?.action === "kill") {
    return [
      "Stop this creative immediately and move budget to stronger variants.",
      "Document the failure pattern (hook, angle, offer, or audience mismatch).",
      "Launch a replacement test with a clearly different concept, not minor cosmetic edits.",
    ];
  }
  if (decision?.action === "test_more") {
    return [
      "Keep spend minimal while collecting clearer signal.",
      "Run one focused variable test (hook, angle, or CTA) instead of broad changes.",
      "Re-evaluate once data reaches meaningful volume.",
    ];
  }
  return [
    "Keep spend controlled until the signal becomes clearer.",
    row.roas < context.roasAvg
      ? "Test a stronger hook or clearer offer before trying to scale."
      : "Let this run longer to confirm whether the efficiency can hold at higher spend.",
    "Re-evaluate after additional spend or a clearer conversion signal.",
  ];
}

function getDecisionTheme(action: AiCreativeDecision["action"] | null): {
  panelClass: string;
  sectionTone: "neutral" | "positive" | "warning";
} {
  if (action === "scale_hard") {
    return {
      panelClass: "border-emerald-300 bg-[linear-gradient(180deg,rgba(209,250,229,0.96)_0%,rgba(255,255,255,0.98)_100%)]",
      sectionTone: "positive",
    };
  }
  if (action === "scale") {
    return {
      panelClass: "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.95)_0%,rgba(255,255,255,0.98)_100%)]",
      sectionTone: "positive",
    };
  }
  if (action === "kill") {
    return {
      panelClass: "border-red-300 bg-[linear-gradient(180deg,rgba(254,226,226,0.96)_0%,rgba(255,255,255,0.98)_100%)]",
      sectionTone: "warning",
    };
  }
  if (action === "pause") {
    return {
      panelClass: "border-orange-200 bg-[linear-gradient(180deg,rgba(255,247,237,0.96)_0%,rgba(255,255,255,0.98)_100%)]",
      sectionTone: "warning",
    };
  }
  if (action === "test_more") {
    return {
      panelClass: "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.96)_0%,rgba(255,255,255,0.98)_100%)]",
      sectionTone: "neutral",
    };
  }
  return {
    panelClass: "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.95)_0%,rgba(255,255,255,0.98)_100%)]",
    sectionTone: "neutral",
  };
}

function buildThoughtStarters(action: AiCreativeDecision["action"] | null): Array<{ title: string; description: string }> {
  if (action === "scale_hard") {
    return [
      {
        title: "How fast can I scale this safely?",
        description: "Design an aggressive scaling ladder with risk thresholds and rollback rules.",
      },
      {
        title: "Where should I duplicate this first?",
        description: "Prioritize audience, placement, and geo expansions with the highest expected carryover.",
      },
      {
        title: "What protects this from performance decay?",
        description: "Define monitoring triggers and creative refresh cadence before scaling fatigue appears.",
      },
    ];
  }
  if (action === "scale") {
    return [
      {
        title: "How do I scale this without breaking efficiency?",
        description: "Use the current winning signals to plan gradual budget expansion and monitoring rules.",
      },
      {
        title: "Which variants should I test next?",
        description: "Generate adjacent hooks, copy angles, or landing page changes without losing the core winner.",
      },
      {
        title: "What could make this fall out of Scale?",
        description: "Review the failure conditions that would justify pulling this back to Watch.",
      },
    ];
  }
  if (action === "pause") {
    return [
      {
        title: "What is the likely root cause here?",
        description: "Break down whether the issue is hook weakness, offer mismatch, CTR, or conversion efficiency.",
      },
      {
        title: "What should replace this creative?",
        description: "Turn the failed signals into a better test brief for the next creative iteration.",
      },
      {
        title: "Which part is worth salvaging?",
        description: "Identify whether any element of the visual, hook, or angle is still worth keeping.",
      },
    ];
  }
  if (action === "kill") {
    return [
      {
        title: "Why is this a hard stop?",
        description: "Summarize the strongest downside signals that justify immediate budget cut.",
      },
      {
        title: "What should replace this now?",
        description: "Generate a replacement concept focused on fixing the likely root failure.",
      },
      {
        title: "What is salvageable from this creative?",
        description: "Identify any reusable elements worth carrying into the next iteration.",
      },
    ];
  }
  if (action === "test_more") {
    return [
      {
        title: "Which test should I run next?",
        description: "Pick the single highest-impact variable to test with minimal spend.",
      },
      {
        title: "What evidence is missing?",
        description: "Clarify what spend/conversion/engagement signal is needed before a stronger action.",
      },
      {
        title: "How do I avoid overreacting early?",
        description: "Set a short learning plan with checkpoints before deciding pause or scale.",
      },
    ];
  }
  return [
    {
      title: "Why is this still Watch?",
      description: "Explain which signals are mixed and what extra spend or data would resolve the uncertainty.",
    },
    {
      title: "How can this become Scale?",
      description: "Translate the current gaps into specific creative or offer tests that improve the decision.",
    },
    {
      title: "What should I monitor next?",
      description: "Focus on the few metrics that matter most before changing budget or pausing.",
    },
  ];
}

function formatCompactCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function resolveDetailImageUrl(row: MetaCreativeRow): string | null {
  const candidates = uniqueUrls([
    row.cardPreviewUrl,
    row.preview.image_url,
    row.preview.poster_url,
    row.imageUrl,
    row.thumbnailUrl,
    row.previewUrl,
  ]);

  const explicitImage = candidates.filter((candidate) => isLikelyImageUrl(candidate));
  const highQualityImage = explicitImage.find((candidate) => !isLikelyLowResPreviewUrl(candidate));
  if (highQualityImage) return highQualityImage;
  if (explicitImage.length > 0) return explicitImage[0] ?? null;
  return candidates.find((candidate) => !isLikelyLowResPreviewUrl(candidate)) ?? candidates[0] ?? null;
}

function uniqueUrls(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const normalized = normalizeUrl(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }
  return urls;
}

function isLikelyImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|$)/i.test(url);
}

function isLikelyLowResPreviewUrl(url: string): boolean {
  const match = url.match(/_p(\d+)x(\d+)/i) ?? url.match(/p(\d+)x(\d+)/i);
  if (!match) return /thumbnail|thumb|\/t39\.2147-6\//i.test(url);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  return Math.max(width, height) <= 220;
}

function classifyPreviewShape(width: number, height: number): PreviewShape {
  if (!(width > 0 && height > 0)) return "feed";
  const ratio = width / height;
  if (ratio <= 0.7) return "portrait";
  if (ratio <= 0.92) return "feed";
  if (ratio <= 1.18) return "square";
  return "landscape";
}

function parsePreviewIframeSnippet(html: string): { src: string; width: number; height: number } | null {
  const iframeMatch = html.match(/<iframe[^>]*>/i);
  if (!iframeMatch) return null;
  const tag = iframeMatch[0];
  const srcMatch = tag.match(/\ssrc=["']([^"']+)["']/i);
  if (!srcMatch?.[1]) return null;
  const widthMatch = tag.match(/\swidth=["'](\d+)["']/i);
  const heightMatch = tag.match(/\sheight=["'](\d+)["']/i);
  const width = widthMatch?.[1] ? Number(widthMatch[1]) : 540;
  const height = heightMatch?.[1] ? Number(heightMatch[1]) : 690;
  const decodedSrc = decodeHtmlEntities(srcMatch[1]);
  const normalizedSrc = normalizeUrl(decodedSrc);
  if (!normalizedSrc) return null;
  return {
    src: normalizedSrc,
    width: Number.isFinite(width) && width > 0 ? width : 540,
    height: Number.isFinite(height) && height > 0 ? height : 690,
  };
}

function resolveMetaPreviewLink(row: MetaCreativeRow, detailPreviewHtml: string | null): string | null {
  const htmlSrc = detailPreviewHtml ? parsePreviewIframeSnippet(detailPreviewHtml)?.src ?? null : null;
  const candidates = uniqueUrls([
    htmlSrc,
    row.previewUrl,
    row.cardPreviewUrl,
  ]);
  return candidates[0] ?? null;
}

function resolvePostId(row: MetaCreativeRow, detailPreviewHtml: string | null): string | null {
  const looseRow = row as unknown as Record<string, unknown>;
  const rowCandidates = [
    row.postId,
    row.objectStoryId,
    row.effectiveObjectStoryId,
    looseRow.post_id,
    looseRow.object_story_id,
    looseRow.effective_object_story_id,
    looseRow.debug_creative_effective_object_story_id,
    looseRow.debug_creative_object_story_id,
  ];

  for (const candidate of rowCandidates) {
    const parsed =
      extractPostIdFromObjectStoryId(candidate) ??
      extractNumericId(candidate);
    if (parsed) return parsed;
  }

  const urlFallbackCandidates = uniqueUrls([
    resolveMetaPreviewLink(row, detailPreviewHtml),
    row.previewUrl,
    row.cardPreviewUrl,
    row.imageUrl,
  ]);
  for (const urlCandidate of urlFallbackCandidates) {
    const parsed = extractPostIdFromUrl(urlCandidate);
    if (parsed) return parsed;
  }
  return null;
}

function extractPostIdFromUrl(urlValue: string): string | null {
  const normalizedUrl = normalizeUrl(urlValue);
  if (!normalizedUrl) return null;
  try {
    const url = new URL(normalizedUrl);
    const keys = ["story_fbid", "fbid", "post_id", "story_id"];
    for (const key of keys) {
      const allValues = url.searchParams.getAll(key);
      for (const value of allValues) {
        const parsed = extractNumericId(value);
        if (parsed) return parsed;
      }
    }
    return extractNumericId(url.pathname);
  } catch {
    return extractNumericId(normalizedUrl);
  }
}

function extractPostIdFromObjectStoryId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const underscoreMatch = trimmed.match(/^\d+_(\d{6,})$/);
  if (underscoreMatch?.[1]) return underscoreMatch[1];
  return null;
}

function extractNumericId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{6,}$/.test(text)) return text;
  const matches = text.match(/\d{6,}/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1] ?? null;
}

function buildScaledPreviewDoc(htmlDoc: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:auto;background:#fff;}iframe{max-width:100%;max-height:100%;}</style></head><body>${htmlDoc}</body></html>`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${minutes}:${String(rem).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
