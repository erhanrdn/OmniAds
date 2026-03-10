"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Bot, Clipboard, Copy, Download, ExternalLink, FileText, MessageCircle, Sparkles, X } from "lucide-react";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { formatMoney, resolveCreativeCurrency } from "@/components/creatives/money";
import { cn } from "@/lib/utils";
import { formatMotionDateLabel, type MotionDateRangeValue } from "@/components/creatives/MotionTopSection";

interface CreativeDetailExperienceProps {
  row: MetaCreativeRow | null;
  open: boolean;
  notes: string;
  dateRange: MotionDateRangeValue;
  defaultCurrency: string | null;
  onOpenChange: (open: boolean) => void;
  onNotesChange: (value: string) => void;
  onDateRangeChange: (next: MotionDateRangeValue) => void;
}

type DetailTab = "overview" | "performance" | "comments" | "transcript" | "notes";
type StageSource = "media" | "image" | "html";

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

export function CreativeDetailExperience({
  row,
  open,
  notes,
  dateRange,
  defaultCurrency,
  onOpenChange,
  onNotesChange,
  onDateRangeChange,
}: CreativeDetailExperienceProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [stageSource, setStageSource] = useState<StageSource>("media");
  const [selectedPlacement, setSelectedPlacement] = useState("default");
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);

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
    setStageSource("media");
    setSelectedPlacement("default");
    setVideoDuration(0);
    setVideoCurrentTime(0);
  }, [row?.id]);

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

  if (!open || !row) return null;

  const currency = resolveCreativeCurrency(row.currency, defaultCurrency);
  const stageVideoSrc = resolveDetailVideoUrl(row);
  const stageImageSrc = resolveDetailImageUrl(row, stageVideoSrc);
  const hasVideo = Boolean(stageVideoSrc);
  const htmlPreviewSrc = resolveDetailHtmlPreviewUrl(row.previewUrl, stageImageSrc, stageVideoSrc);
  const hasHtmlPreview = Boolean(htmlPreviewSrc);
  const sourceOptions = buildSourceOptions({ hasVideo, hasImage: Boolean(stageImageSrc), hasHtmlPreview });
  const placementOptions = buildPlacementOptions(row.tags);
  const activeMediaUrl =
    stageSource === "html"
      ? htmlPreviewSrc
      : stageSource === "image"
        ? stageImageSrc
        : hasVideo
          ? stageVideoSrc
          : stageImageSrc;

  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={() => onOpenChange(false)} />
      <div className="absolute inset-2 overflow-hidden rounded-2xl border border-white/20 bg-[#F4F5F7] shadow-2xl md:inset-4">
        <CreativeTopBar
          dateRange={dateRange}
          copiedLink={copiedLink}
          onDateRangeChange={onDateRangeChange}
          onCopyLink={async () => {
            const success = await copyRowLink(row.id);
            setCopiedLink(success);
            window.setTimeout(() => setCopiedLink(false), 1600);
          }}
          onClose={() => onOpenChange(false)}
        />

        <div className="grid h-[calc(100%-64px)] grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-h-0 flex-col overflow-y-auto p-5 md:p-7">
            <div className="mx-auto w-full max-w-[1120px] overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFC] shadow-[0_12px_38px_rgba(15,23,42,0.09)]">
              <CreativeStage
                row={row}
                source={stageSource}
                imageSrc={stageImageSrc}
                videoSrc={stageVideoSrc}
                htmlSrc={htmlPreviewSrc}
                onVideoTimeChange={setVideoCurrentTime}
                onVideoDuration={setVideoDuration}
              />

              <CreativePlacementControls
                source={stageSource}
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

          <CreativeAnalysisRail
            row={row}
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
  onDateRangeChange,
  onCopyLink,
  onClose,
}: {
  dateRange: MotionDateRangeValue;
  copiedLink: boolean;
  onDateRangeChange: (next: MotionDateRangeValue) => void;
  onCopyLink: () => void;
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
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {copiedLink ? <Clipboard className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedLink ? "Copied" : "Copy link"}
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
  videoSrc,
  htmlSrc,
  onVideoDuration,
  onVideoTimeChange,
}: {
  row: MetaCreativeRow;
  source: StageSource;
  imageSrc: string | null;
  videoSrc: string | null;
  htmlSrc: string | null;
  onVideoDuration: (duration: number) => void;
  onVideoTimeChange: (time: number) => void;
}) {
  const stageTitle = `${row.name} preview`;

  return (
    <section className="bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#eff3f8_65%,_#e8edf5_100%)] px-4 py-5 md:px-8 md:py-7">
      <div className="mx-auto flex min-h-[480px] w-full max-w-[1040px] items-center justify-center rounded-[22px] border border-slate-200 bg-[#EEF2F7] p-5 md:min-h-[620px] md:p-8">
        {source === "html" && htmlSrc ? (
          <HtmlPreviewStage src={htmlSrc} title={stageTitle} />
        ) : source === "image" && imageSrc ? (
          <MediaHeroFrame>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt={stageTitle} className="block max-h-[74vh] w-auto max-w-full object-contain" />
          </MediaHeroFrame>
        ) : (videoSrc || imageSrc) ? (
          <MediaHeroFrame>
            {videoSrc ? (
              <video
                src={videoSrc}
                poster={imageSrc ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="block max-h-[74vh] w-auto max-w-full object-contain"
                onLoadedMetadata={(event) => {
                  onVideoDuration(event.currentTarget.duration || 0);
                }}
                onTimeUpdate={(event) => {
                  onVideoTimeChange(event.currentTarget.currentTime || 0);
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageSrc ?? undefined} alt={stageTitle} className="block max-h-[74vh] w-auto max-w-full object-contain" />
            )}
          </MediaHeroFrame>
        ) : (
          <StageEmptyState />
        )}
      </div>
    </section>
  );
}

function HtmlPreviewStage({ src, title }: { src: string; title: string }) {
  return (
    <div className="flex h-full min-h-[420px] w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
        <span>HTML preview mode</span>
        <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">
          Open source
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <iframe title={title} src={src} className="h-full w-full bg-white" sandbox="allow-scripts allow-same-origin allow-popups" />
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
    <div className="relative flex max-h-[76vh] w-auto max-w-full items-center justify-center overflow-hidden rounded-[20px] border border-slate-300 bg-[#0b0f17] p-1.5 shadow-[0_30px_90px_rgba(2,6,23,0.38)]">
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
  tab: DetailTab;
  currency: string | null;
  defaultCurrency: string | null;
  notes: string;
  videoDuration: number;
  videoCurrentTime: number;
  onTabChange: (tab: DetailTab) => void;
  onNotesChange: (value: string) => void;
}) {
  return (
    <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 pt-4">
        <div className="flex flex-wrap gap-1 pb-3">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                tab === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {tab === "overview" && <CreativeOverviewTab row={row} currency={currency} defaultCurrency={defaultCurrency} />}
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
  currency,
  defaultCurrency,
}: {
  row: MetaCreativeRow;
  currency: string | null;
  defaultCurrency: string | null;
}) {
  const insight = summarizePerformance(row);
  return (
    <>
      <MetricCardGrid
        title="Summary"
        items={[
          { label: "Spend", value: formatMoney(row.spend, currency, defaultCurrency) },
          { label: "ROAS", value: `${row.roas.toFixed(2)}x` },
          { label: "Purchase value", value: formatMoney(row.purchaseValue, currency, defaultCurrency) },
          { label: "Purchases", value: row.purchases.toLocaleString() },
        ]}
      />

      <section className="rounded-xl border border-slate-200 p-3.5">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Metadata</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <MetadataField label="Launch date" value={row.launchDate || "Unknown"} />
          <MetadataField label="Status" value="Active" />
          <MetadataField label="Active ads" value={String(row.associatedAdsCount || 0)} />
          <MetadataField label="Creative type" value={row.creativeTypeLabel} />
          <MetadataField label="Platform" value="Meta" />
          <MetadataField label="Format" value={row.format === "video" ? "Video" : row.format === "catalog" ? "Catalog" : "Image"} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 p-3.5">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tags & messaging</h3>
        <div className="flex flex-wrap gap-1.5">
          {row.tags.length > 0 ? row.tags.map((tag) => <TagPill key={tag} value={tag} />) : <p className="text-xs text-slate-500">No tags available.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 p-3.5">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Operator interpretation</h3>
        <p className="text-xs leading-5 text-slate-700">{insight}</p>
      </section>

      <section className="rounded-xl border border-slate-200 p-3.5">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <Sparkles className="h-3.5 w-3.5" />
          Thought starters
        </h3>
        <div className="space-y-1.5">
          {["Analyze this ad", "Give new hook ideas based on this ad", "Ask me anything"].map((item) => (
            <button key={item} type="button" className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-2.5 py-2 text-left text-xs hover:bg-slate-50">
              <Bot className="h-3.5 w-3.5 text-slate-500" />
              <span>{item}</span>
            </button>
          ))}
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
    <section className="rounded-xl border border-slate-200 p-3.5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-500">{item.label}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetadataField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function TagPill({ value }: { value: string }) {
  return <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{value}</span>;
}

function StageEmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-200">No media available</p>
      <p className="mt-1 text-xs text-slate-400">This creative has no playable video, image, or HTML preview in the current payload.</p>
    </div>
  );
}

function buildSourceOptions({
  hasVideo,
  hasImage,
  hasHtmlPreview,
}: {
  hasVideo: boolean;
  hasImage: boolean;
  hasHtmlPreview: boolean;
}): Array<{ value: StageSource; label: string }> {
  const options: Array<{ value: StageSource; label: string }> = [];
  if (hasVideo || hasImage) {
    options.push({ value: "media", label: hasVideo ? "Media (video)" : "Media (image)" });
  }
  if (hasImage) {
    options.push({ value: "image", label: "Image" });
  }
  if (hasHtmlPreview) {
    options.push({ value: "html", label: "Full ad preview (HTML)" });
  }
  return options.length > 0 ? options : [{ value: "media", label: "Media" }];
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

async function copyRowLink(rowId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  url.searchParams.set("creative", rowId);
  return copyText(url.toString());
}

function resolveDetailHtmlPreviewUrl(
  previewUrl: string | null | undefined,
  imageUrl: string | null | undefined,
  videoUrl: string | null | undefined
): string | null {
  const normalizedPreview = normalizeUrl(previewUrl);
  if (!normalizedPreview) return null;
  const normalizedImage = normalizeUrl(imageUrl);
  const normalizedVideo = normalizeUrl(videoUrl);
  if (normalizedPreview === normalizedImage || normalizedPreview === normalizedVideo) return null;
  if (isLikelyImageUrl(normalizedPreview) || isLikelyVideoUrl(normalizedPreview)) return null;
  if (!isLikelyHtmlUrl(normalizedPreview)) return null;
  return normalizedPreview;
}

function resolveDetailVideoUrl(row: MetaCreativeRow): string | null {
  const candidates = uniqueUrls([
    row.preview.video_url,
    row.previewUrl,
    row.imageUrl,
    row.cardPreviewUrl,
    row.preview.image_url,
    row.preview.poster_url,
    row.thumbnailUrl,
  ]);
  const explicitVideo = candidates.find((candidate) => isLikelyVideoUrl(candidate));
  if (explicitVideo) return explicitVideo;

  const shouldForceVideoScan = row.format === "video" || row.preview.render_mode === "video";
  if (!shouldForceVideoScan) return null;

  // Some CDN links are extensionless. For video creatives, prefer non-image URLs as playable candidates.
  const extensionlessPlayable = candidates.find((candidate) => !isLikelyImageUrl(candidate) && !isLikelyHtmlUrl(candidate));
  return extensionlessPlayable ?? null;
}

function resolveDetailImageUrl(row: MetaCreativeRow, chosenVideoUrl: string | null): string | null {
  const candidates = uniqueUrls([
    row.preview.image_url,
    row.preview.poster_url,
    row.imageUrl,
    row.cardPreviewUrl,
    row.thumbnailUrl,
    row.previewUrl,
  ]);

  const filtered = candidates.filter((candidate) => candidate !== chosenVideoUrl);
  const explicitImage = filtered.find((candidate) => isLikelyImageUrl(candidate));
  if (explicitImage) return explicitImage;
  return filtered[0] ?? null;
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

function isLikelyVideoUrl(url: string): boolean {
  if (/\.(mp4|mov|m4v|webm|ogg|ogv|m3u8)(\?|$)/i.test(url)) return true;
  if (/[?&](video|format)=/i.test(url)) return true;
  return /\/video\//i.test(url) && !isLikelyImageUrl(url);
}

function isLikelyHtmlUrl(url: string): boolean {
  if (/\.(html?)(\?|$)/i.test(url)) return true;
  if (/\/(adpreview|preview|render|canvas)\b/i.test(url) && !isLikelyImageUrl(url) && !isLikelyVideoUrl(url)) return true;
  return false;
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
