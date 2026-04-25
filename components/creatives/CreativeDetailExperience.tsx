"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { formatMoney, resolveCreativeCurrency } from "@/components/creatives/money";
import { DateRangePicker } from "@/components/date-range/DateRangePicker";
import { cn } from "@/lib/utils";
import {
  formatCreativeDateLabel,
  type CreativeDateRangeValue,
} from "@/components/creatives/CreativesTopSection";
import { fetchMetaCreativeDetailPreview } from "@/app/(dashboard)/creatives/page-support";
import {
  creativeDateRangeToStandard,
  standardDateRangeToCreative,
} from "@/components/creatives/creatives-top-section-support";
import {
  getAiCreativeRuleCommentary,
  getCommandCenter,
  type CreativeDecision,
  type CreativeDecisionOs,
  type CreativeHistoricalWindows,
} from "@/src/services";
import type { CommandCenterAction, CommandCenterResponse } from "@/lib/command-center";
import { getCreativeDisplayPills } from "@/lib/meta/creative-taxonomy";
import { getTranslations } from "@/lib/i18n";
import { usePreferencesStore } from "@/store/preferences-store";
import { CreativeCommercialContextCard } from "@/components/creatives/creative-commercial-context-card";
import {
  buildCreativeOperatorItem,
  creativeBenchmarkReliabilityLabel,
  creativeBusinessValidationNote,
} from "@/lib/creative-operator-surface";

interface CreativeDetailExperienceProps {
  businessId: string;
  row: MetaCreativeRow | null;
  allRows: MetaCreativeRow[];
  creativeHistoryById?: Map<string, CreativeHistoricalWindows>;
  decisionOs?: CreativeDecisionOs | null;
  open: boolean;
  notes: string;
  dateRange: CreativeDateRangeValue;
  defaultCurrency: string | null;
  onOpenChange: (open: boolean) => void;
  onNotesChange: (value: string) => void;
  onDateRangeChange: (next: CreativeDateRangeValue) => void;
}

const LIVE_PREVIEW_MIN_WIDTH = 420;
const LIVE_PREVIEW_MIN_HEIGHT = 720;
const LIVE_PREVIEW_DEFAULT_WIDTH = 680;
const LIVE_PREVIEW_DEFAULT_HEIGHT = 1200;
const LIVE_PREVIEW_STAGE_MAX_WIDTH = 980;

function buildLivePreviewSrcDoc(html: string | null): string | null {
  if (!html) return null;
  const injectedStyles = `
    <style>
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: transparent !important;
        width: max-content !important;
        height: max-content !important;
      }
      body {
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }
      body > * {
        flex-shrink: 0;
      }
      * {
        scrollbar-width: none !important;
      }
      *::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }
      iframe, video, img, canvas, svg {
        max-width: 100% !important;
      }
      [style*="overflow: scroll"],
      [style*="overflow:scroll"],
      [style*="overflow-y: scroll"],
      [style*="overflow-y:scroll"],
      [style*="overflow: auto"],
      [style*="overflow:auto"],
      [style*="overflow-y: auto"],
      [style*="overflow-y:auto"] {
        overflow: visible !important;
        overflow-y: visible !important;
        max-height: none !important;
        height: auto !important;
      }
    </style>
    <script>
      (() => {
        let processed = new WeakSet();

        const forceStyle = (node, property, value) => {
          if (!(node instanceof HTMLElement)) return;
          node.style.setProperty(property, value, "important");
        };

        const expandNode = (node) => {
          if (!(node instanceof HTMLElement)) return;
          processed.add(node);

          forceStyle(node, "scrollbar-width", "none");
          forceStyle(node, "overflow", "visible");
          forceStyle(node, "overflow-y", "visible");
          forceStyle(node, "overflow-x", "visible");
          forceStyle(node, "max-height", "none");
          forceStyle(node, "height", "auto");
          forceStyle(node, "max-width", "none");
          forceStyle(node, "width", "auto");
          if (node.scrollHeight > node.clientHeight + 4) {
            forceStyle(node, "min-height", node.scrollHeight + "px");
          }
          if (node.scrollWidth > node.clientWidth + 4) {
            forceStyle(node, "min-width", node.scrollWidth + "px");
          }
        };

        const normalize = () => {
          const root = document.documentElement;
          const body = document.body;
          if (!root || !body) return;

          forceStyle(root, "overflow", "visible");
          forceStyle(root, "overflow-y", "visible");
          forceStyle(root, "overflow-x", "visible");
          forceStyle(root, "max-height", "none");
          forceStyle(root, "scrollbar-width", "none");
          forceStyle(body, "overflow", "visible");
          forceStyle(body, "overflow-y", "visible");
          forceStyle(body, "overflow-x", "visible");
          forceStyle(body, "max-height", "none");
          forceStyle(body, "scrollbar-width", "none");

          const nodes = body.querySelectorAll("*");
          for (const node of nodes) {
            if (!(node instanceof HTMLElement)) continue;
            const computed = window.getComputedStyle(node);
            const isScrollableY =
              (computed.overflowY === "auto" || computed.overflowY === "scroll" || computed.overflow === "auto" || computed.overflow === "scroll") &&
              node.scrollHeight > node.clientHeight + 4;
            const isScrollableX =
              (computed.overflowX === "auto" || computed.overflowX === "scroll" || computed.overflow === "auto" || computed.overflow === "scroll") &&
              node.scrollWidth > node.clientWidth + 4;

            if (isScrollableY || isScrollableX || processed.has(node)) {
              expandNode(node);
            }
          }
        };

        const run = () => {
          normalize();
          requestAnimationFrame(normalize);
          window.setTimeout(normalize, 60);
          window.setTimeout(normalize, 220);
          window.setTimeout(normalize, 600);
        };

        const observer = new MutationObserver(() => {
          processed = new WeakSet();
          run();
        });

        const intervalId = window.setInterval(() => {
          run();
        }, 800);

        if (document.readyState === "complete") {
          run();
        } else {
          window.addEventListener("load", run, { once: true });
        }

        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["style", "class"],
        });

        window.addEventListener("beforeunload", () => {
          observer.disconnect();
          window.clearInterval(intervalId);
        });
      })();
    </script>
  `;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${injectedStyles}</head>`);
  }

  return `${injectedStyles}${html}`;
}

export function CreativeDetailExperience({
  businessId,
  row,
  allRows,
  creativeHistoryById,
  decisionOs,
  open,
  notes,
  dateRange,
  defaultCurrency,
  onOpenChange,
  onNotesChange,
  onDateRangeChange,
}: CreativeDetailExperienceProps) {
  const language = usePreferencesStore((state) => state.language);
  const creativeTranslations = getTranslations(language).creativeDetail;
  const [aiInterpretationRequested, setAiInterpretationRequested] = useState(false);
  const livePreviewStageRef = useRef<HTMLDivElement | null>(null);
  const livePreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [livePreviewScale, setLivePreviewScale] = useState(1);
  const [livePreviewContentSize, setLivePreviewContentSize] = useState({
    width: LIVE_PREVIEW_DEFAULT_WIDTH,
    height: LIVE_PREVIEW_DEFAULT_HEIGHT,
  });

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

  const imageUrl = row ? resolveDetailImageUrl(row) : null;
  const canRequestHtml = Boolean(
    row?.creativeId && (row.previewManifest?.live_html_available ?? true)
  );

  useEffect(() => {
    setAiInterpretationRequested(false);
  }, [row?.id]);

  const shouldFetchHtmlPreview =
    open &&
    Boolean(businessId) &&
    Boolean(row?.creativeId) &&
    canRequestHtml;

  const detailPreviewQuery = useQuery({
    queryKey: ["creative-detail-preview", businessId, row?.creativeId ?? ""],
    enabled: shouldFetchHtmlPreview,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      if (!row?.creativeId) return null;
      const payload = await fetchMetaCreativeDetailPreview({
        businessId,
        creativeId: row.creativeId,
      });
      const detail = payload.detail_preview;
      return typeof detail?.html === "string" && detail.html.trim().length > 0 ? detail.html : null;
    },
  });

  const currency = resolveCreativeCurrency(row?.currency ?? null, defaultCurrency);
  const detailPreviewHtml = detailPreviewQuery.data ?? null;
  const detailPreviewLoading = detailPreviewQuery.isFetching;
  const canShowHtml = Boolean(detailPreviewHtml);
  const livePreviewSrcDoc = useMemo(
    () => buildLivePreviewSrcDoc(detailPreviewHtml),
    [detailPreviewHtml]
  );
  const taxonomyPills = row
      ? getCreativeDisplayPills({
          creative_delivery_type: row.creativeDeliveryType,
          creative_visual_format: row.creativeVisualFormat,
          creative_primary_type: row.creativePrimaryType,
          creative_primary_label: row.creativePrimaryLabel,
          creative_secondary_type: row.creativeSecondaryType,
          creative_secondary_label: row.creativeSecondaryLabel,
          taxonomy_source: row.taxonomySource ?? null,
        })
    : { primaryLabel: null, secondaryLabel: null };

  const decisionOsCreative = useMemo(
    () => (row ? decisionOs?.creatives.find((creative) => creative.creativeId === row.id) ?? null : null),
    [decisionOs, row]
  );
  const operatorItem = useMemo(
    () => (decisionOsCreative ? buildCreativeOperatorItem(decisionOsCreative) : null),
    [decisionOsCreative],
  );
  const businessValidationNote = useMemo(
    () => (decisionOsCreative ? creativeBusinessValidationNote(decisionOsCreative) : null),
    [decisionOsCreative],
  );
  const standardRange = useMemo(
    () => creativeDateRangeToStandard(dateRange),
    [dateRange],
  );
  const commandCenterQuery = useQuery<CommandCenterResponse>({
    queryKey: [
      "command-center-creative-overlay",
      businessId,
      standardRange.customStart,
      standardRange.customEnd,
    ],
    enabled: Boolean(open && businessId && standardRange.customStart && standardRange.customEnd),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      getCommandCenter(
        businessId,
        standardRange.customStart,
        standardRange.customEnd,
      ),
  });
  const report = useMemo(
    () => decisionOsCreative?.report ?? null,
    [decisionOsCreative]
  );
  const commandCenterAction = useMemo<CommandCenterAction | null>(
    () =>
      row
        ? commandCenterQuery.data?.actions.find(
            (action) =>
              action.sourceSystem === "creative" &&
              action.relatedEntities.some(
                (entity) => entity.type === "creative" && entity.id === row.id,
              ),
          ) ?? null
        : null,
    [commandCenterQuery.data, row],
  );
  const decision = useMemo(() => {
    if (!report) return null;
    return {
      creativeId: report.creativeId,
      action: report.action,
      lifecycleState: report.lifecycleState,
      score: report.score,
      confidence: report.confidence,
      scoringFactors: report.factors.map((factor) => `${factor.label}: ${factor.value}`),
      reasons: report.factors.map((factor) => `${factor.label}: ${factor.reason}`).slice(0, 4),
      nextStep: report.summary,
    } satisfies CreativeDecision;
  }, [report]);
  const previewTruth = decisionOsCreative?.previewStatus ?? null;
  const canGenerateAiInterpretation =
    decisionOsCreative?.trust.truthState === "live_confident" &&
    previewTruth?.liveDecisionWindow === "ready";
  const previewTruthGate = useMemo(() => {
    if (previewTruth?.liveDecisionWindow === "ready") {
      return {
        panelClass: "border-emerald-200 bg-emerald-50/80",
        badgeClass: "border-emerald-200 bg-emerald-100 text-emerald-800",
        badgeLabel: "Preview ready",
        headline: "Preview truth is ready for decisive review.",
        summary:
          "Live decision-window preview is ready, so authoritative action wording can stay active for this creative.",
      };
    }

    if (previewTruth?.liveDecisionWindow === "metrics_only_degraded") {
      return {
        panelClass: "border-amber-200 bg-amber-50/80",
        badgeClass: "border-amber-200 bg-amber-100 text-amber-800",
        badgeLabel: "Preview degraded",
        headline: "Preview truth is degraded, so this review stays softened.",
        summary:
          "The deterministic decision remains visible, but review is metrics-only until Meta returns reliable live preview HTML.",
      };
    }

    return {
      panelClass: "border-rose-200 bg-rose-50/80",
      badgeClass: "border-rose-200 bg-rose-100 text-rose-800",
      badgeLabel: "Preview missing",
      headline: "Preview truth is missing, so authoritative action is blocked.",
      summary:
        "Do not treat this row as clean execute-now work until preview media becomes available for the live decision window.",
    };
  }, [previewTruth?.liveDecisionWindow]);
  const aiSupportMessage = useMemo(() => {
    if (canGenerateAiInterpretation) {
      return "Support only. AI commentary does not change the deterministic decision.";
    }
    if (previewTruth?.liveDecisionWindow === "metrics_only_degraded") {
      return "AI interpretation stays disabled because preview truth is degraded and this review is metrics-only.";
    }
    if (previewTruth?.liveDecisionWindow === "missing") {
      return "AI interpretation stays disabled because preview truth is missing.";
    }
    return "AI interpretation stays disabled until live preview truth and shared authority are both ready.";
  }, [canGenerateAiInterpretation, previewTruth?.liveDecisionWindow]);

  const commentaryQuery = useQuery({
    queryKey: [
      "creative-detail-ai-commentary",
      businessId,
      report?.creativeId ?? "",
      report?.action ?? "",
      report?.score ?? 0,
      report?.confidence ?? 0,
      (report?.factors ?? []).map((item) => `${item.label}:${item.impact}:${item.value}`).join("|"),
    ],
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: () => {
      if (!report) {
        throw new Error("Missing creative rule report");
      }
      return getAiCreativeRuleCommentary(businessId, currency ?? defaultCurrency ?? "USD", report);
    },
  });

  useEffect(() => {
    const node = livePreviewStageRef.current;
    if (!node) return;

    const updateScale = () => {
      const bounds = node.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        setLivePreviewScale(1);
        return;
      }

      const widthScale = bounds.width / livePreviewContentSize.width;
      const heightScale = bounds.height / livePreviewContentSize.height;
      const nextScale = Math.min(widthScale, heightScale, 1);
      setLivePreviewScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => updateScale());
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    canShowHtml,
    detailPreviewLoading,
    imageUrl,
    livePreviewContentSize.height,
    livePreviewContentSize.width,
    open,
    row?.id,
  ]);

  useEffect(() => {
    if (!canShowHtml) {
      setLivePreviewContentSize({
        width: LIVE_PREVIEW_DEFAULT_WIDTH,
        height: LIVE_PREVIEW_DEFAULT_HEIGHT,
      });
      return;
    }

    const iframe = livePreviewFrameRef.current;
    if (!iframe) return;

    let frameObserver: ResizeObserver | null = null;
    let animationFrameId = 0;

    const updateFromFrame = () => {
      const frameDocument = iframe.contentDocument;
      const html = frameDocument?.documentElement ?? null;
      const body = frameDocument?.body ?? null;
      if (!html || !body) return;

      const nextWidth = Math.max(
        LIVE_PREVIEW_MIN_WIDTH,
        html.scrollWidth,
        body.scrollWidth,
        html.offsetWidth,
        body.offsetWidth
      );
      const nextHeight = Math.max(
        LIVE_PREVIEW_MIN_HEIGHT,
        html.scrollHeight,
        body.scrollHeight,
        html.offsetHeight,
        body.offsetHeight
      );

      html.style.width = `${nextWidth}px`;
      html.style.height = `${nextHeight}px`;
      html.style.overflow = "hidden";
      html.style.overflowY = "hidden";
      body.style.width = `${nextWidth}px`;
      body.style.height = `${nextHeight}px`;
      body.style.overflow = "hidden";
      body.style.overflowY = "hidden";

      setLivePreviewContentSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateFromFrame);
    };

    const handleLoad = () => {
      scheduleUpdate();
      const frameDocument = iframe.contentDocument;
      const html = frameDocument?.documentElement ?? null;
      const body = frameDocument?.body ?? null;
      if (typeof ResizeObserver === "undefined" || !html || !body) return;
      frameObserver?.disconnect();
      frameObserver = new ResizeObserver(() => scheduleUpdate());
      frameObserver.observe(html);
      frameObserver.observe(body);
    };

    if (iframe.contentDocument?.readyState === "complete") {
      handleLoad();
    }

    iframe.addEventListener("load", handleLoad);
    return () => {
      iframe.removeEventListener("load", handleLoad);
      frameObserver?.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
  }, [canShowHtml, livePreviewSrcDoc]);

  if (!open || !row) return null;

  if (!report || !decision || !decisionOsCreative) {
    return (
      <div className="fixed inset-0 z-[90]">
        <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />

        <div className="absolute inset-2 overflow-hidden rounded-2xl border border-white/20 bg-[#f3f6fa] shadow-2xl md:inset-4">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
              <p className="truncate text-xs text-slate-500">{formatCreativeDateLabel(dateRange)}</p>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close creative detail"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <main className="flex h-[calc(100%-64px)] items-center justify-center px-6 py-8">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white/90 p-6 text-center shadow-sm">
              <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" aria-hidden="true" />
              <h2 className="text-base font-semibold text-slate-900">Creative detail is loading</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The creative opened successfully, but the decision support payload for this row is still loading.
                Preview, decision, and evidence panels will appear as soon as the supporting data is ready.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />

      <div className="absolute inset-2 overflow-hidden rounded-2xl border border-white/20 bg-[#f3f6fa] shadow-2xl md:inset-4">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
            <p className="truncate text-xs text-slate-500">{formatCreativeDateLabel(dateRange)}</p>
          </div>

          <div className="flex items-center gap-2">
            <DateRangePicker
              value={creativeDateRangeToStandard(dateRange)}
              onChange={(next) => onDateRangeChange(standardDateRangeToCreative(next))}
              showComparisonTrigger={false}
              rangePresets={["today", "yesterday", "7d", "14d", "30d", "365d", "lastMonth", "custom"]}
              className="shrink-0"
            />

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main
          className="grid h-[calc(100%-64px)] grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(340px,460px)]"
        >
          <section className="min-h-0 overflow-hidden px-3 py-3 md:px-4 md:py-4">
            <div className="mx-auto flex h-full w-full max-w-[1320px] flex-col">
              <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {taxonomyPills.primaryLabel ? <Pill value={taxonomyPills.primaryLabel} /> : null}
                    {taxonomyPills.secondaryLabel ? <Pill value={taxonomyPills.secondaryLabel} /> : null}
                    {row.launchDate ? <Pill value={`Launched ${row.launchDate}`} /> : null}
                  </div>
                  {previewTruth ? (
                    <div className="flex flex-wrap gap-1.5">
                      <Pill value={`Selected window: ${previewTruth.selectedWindow.replaceAll("_", " ")}`} />
                      <Pill value={`Live decision window: ${previewTruth.liveDecisionWindow.replaceAll("_", " ")}`} />
                    </div>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#eef3f8_72%,_#e7edf5_100%)] px-2 py-2 md:px-3 md:py-3">
                  <div className="flex h-full min-h-[560px] items-center justify-center px-2 py-4 md:min-h-[640px] md:px-4">
                    <div
                      ref={livePreviewStageRef}
                      className="relative flex h-full max-h-full min-h-0 w-full items-center justify-center overflow-hidden"
                      style={{ maxWidth: LIVE_PREVIEW_STAGE_MAX_WIDTH }}
                    >
                    {canShowHtml ? (
                      <div
                        className="shrink-0"
                        style={{
                          width: livePreviewContentSize.width,
                          height: livePreviewContentSize.height,
                          transform: `scale(${livePreviewScale})`,
                          transformOrigin: "center center",
                        }}
                      >
                        <iframe
                          ref={livePreviewFrameRef}
                          title={`${row.name} live preview`}
                          srcDoc={livePreviewSrcDoc ?? undefined}
                          scrolling="no"
                          className="h-full w-full bg-transparent"
                          style={{ border: 0 }}
                          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        />
                      </div>
                    ) : canRequestHtml && detailPreviewLoading ? (
                      <div className="flex flex-col items-center justify-center gap-3 text-slate-500">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" aria-hidden="true" />
                        <p className="text-sm font-medium">Attempting live decision-window preview...</p>
                      </div>
                    ) : imageUrl ? (
                      <div className="space-y-3">
                        <div className="relative flex max-h-[78vh] w-full max-w-[860px] items-center justify-center overflow-hidden p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imageUrl} alt={row.name} className="relative z-[1] block max-h-[74vh] w-auto max-w-full object-contain" />
                        </div>
                        {previewTruth?.liveDecisionWindow === "metrics_only_degraded" ? (
                          <p className="text-center text-sm text-slate-600">
                            Live decision-window preview is degraded. Operator output stays metrics-only until Meta returns reliable HTML.
                          </p>
                        ) : null}
                      </div>
                    ) : previewTruth?.liveDecisionWindow === "metrics_only_degraded" ? (
                      <p className="text-sm text-slate-600">
                        Live decision-window preview is degraded, so this review stays metrics-only.
                      </p>
                    ) : canRequestHtml ? (
                      <p className="text-sm text-slate-600">Live decision-window preview is unavailable.</p>
                    ) : (
                      <p className="text-sm text-slate-600">No renderable preview is available for this creative.</p>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-[#f8fafc] p-4 md:p-4">
            <div className="flex flex-col gap-3">

              {/* Block 1: Verdict */}
              {(() => {
                const vt = operatorItem
                  ? getPrimaryDecisionVerdictTheme(
                      operatorItem.primaryAction,
                      operatorItem.authorityLabel,
                    )
                  : getVerdictTheme(decision.action, report.lifecycleState ?? decision.lifecycleState);
                return (
                  <div className="flex flex-col gap-2.5" data-testid="creative-detail-verdict">
                    <div className={cn("flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5", vt.band)} style={{ minHeight: 64 }}>
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className={cn("text-[22px] font-semibold leading-none tracking-tight", vt.titleClass)}>
                          {vt.label}
                        </div>
                        <div className={cn("text-[12px] leading-snug", vt.bodyClass)}>{vt.tagline}</div>
                      </div>
                      <div className={cn("shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em]", vt.pill)}>
                        {vt.label}
                      </div>
                    </div>
                    <p className="px-1 text-[13px] leading-relaxed text-slate-600">{decisionOsCreative.summary}</p>
                    {previewTruth?.liveDecisionWindow !== "ready" ? (
                      <p className="px-1 text-[11px] text-amber-700">
                        Preview {(previewTruth?.liveDecisionWindow ?? "missing").replaceAll("_", " ")} — analysis is metrics-only.
                      </p>
                    ) : null}
                  </div>
                );
              })()}

              {/* Block 2: Next Action */}
              {operatorItem?.instruction ? (
                <div
                  className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                  data-testid="creative-detail-next-action"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">What to do</p>
                    <span className="text-[11px] text-slate-400">Why now</span>
                  </div>
                  <p className="text-[14px] font-semibold leading-snug tracking-tight text-slate-900">
                    {operatorItem.instruction.primaryMove}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {operatorItem.instruction.evidenceStrength ? (
                      <EvidenceChip value={operatorItem.instruction.evidenceStrength} />
                    ) : null}
                    {operatorItem.instruction.urgency ? (
                      <UrgencyChip value={operatorItem.instruction.urgency} />
                    ) : null}
                    {operatorItem.instruction.amountGuidance?.label ? (
                      <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-600">
                        {operatorItem.instruction.amountGuidance.label}
                      </span>
                    ) : null}
                  </div>
                  {operatorItem.instruction.nextObservation?.[0] ? (
                    <p className="text-[12px] leading-relaxed text-slate-500">
                      {operatorItem.instruction.nextObservation[0]}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Block 3: Performance */}
              <div
                className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                data-testid="creative-detail-performance"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Performance</p>
                <div
                  className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200"
                  style={{ gap: 1, background: "#e2e8f0" }}
                >
                  <PrimaryMetricTile label="Spend" value={formatMoney(row.spend, currency, defaultCurrency)} />
                  <PrimaryMetricTile
                    label="ROAS"
                    value={`${row.roas.toFixed(2)}x`}
                    delta={(() => {
                      const br = decisionOsCreative.benchmark.metrics.roas.current;
                      return br && br > 0 ? Math.round(((row.roas - br) / br) * 100) : null;
                    })()}
                  />
                  <PrimaryMetricTile label="Purchases" value={formatInteger(row.purchases)} />
                  <PrimaryMetricTile label="CTR" value={`${row.ctrAll.toFixed(2)}%`} />
                </div>
                <div className="h-px bg-slate-100" />
                <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-[12px] tabular-nums">
                  <SecondaryMetricRow label="Purchase value" value={formatMoney(row.purchaseValue, currency, defaultCurrency)} />
                  <SecondaryMetricRow label="CPA" value={formatMoney(row.cpa, currency, defaultCurrency)} />
                  <SecondaryMetricRow label="Impressions" value={formatInteger(row.impressions)} />
                  <SecondaryMetricRow label="Link clicks" value={formatInteger(row.linkClicks)} />
                </div>
              </div>

              {/* Block 4: Commercial Fit */}
              {(() => {
                const breakEven = decisionOsCreative.economics.roasFloor;
                const benchRoas = decisionOsCreative.benchmark.metrics.roas.current;
                const current = row.roas;
                const aboveBreakEven = breakEven != null && current > breakEven;
                const currentColor = breakEven == null ? undefined
                  : current > breakEven ? "#047857"
                  : current >= breakEven * 0.8 ? "#b45309"
                  : "#be123c";
                const currentMark = breakEven == null ? undefined
                  : current > breakEven ? "✓"
                  : current >= breakEven * 0.8 ? "~"
                  : "⚠";
                return (
                  <div
                    className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    data-testid="creative-detail-commercial-fit"
                  >
                    <div className="grid items-center px-4 py-3" style={{ gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 12 }}>
                      <FitStat label="Break-even" value={breakEven != null ? `${breakEven.toFixed(1)}x` : "n/a"} />
                      <div className="h-6 w-px bg-slate-100" />
                      <FitStat label="Current ROAS" value={`${current.toFixed(2)}x`} valueColor={currentColor} mark={currentMark} />
                      <div className="h-6 w-px bg-slate-100" />
                      <FitStat label="Benchmark" value={benchRoas != null ? `${benchRoas.toFixed(2)}x` : "n/a"} />
                    </div>
                    {decisionOsCreative.economics.cpaCeiling != null || businessValidationNote ? (
                      <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
                        {decisionOsCreative.economics.cpaCeiling != null ? (
                          <span>CPA ceiling {formatMoney(decisionOsCreative.economics.cpaCeiling, currency, defaultCurrency)}</span>
                        ) : null}
                        {businessValidationNote ? (
                          <span className="ml-2 text-amber-700">{businessValidationNote}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              <CreativeCommercialContextCard
                businessId={businessId}
                startDate={standardRange.customStart}
                endDate={standardRange.customEnd}
              />

              {/* Block 5: AI Commentary */}
              <section
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                data-testid="creative-detail-ai-commentary"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sky-600" />
                    <h4 className="text-sm font-semibold text-slate-900">{creativeTranslations.aiInterpretation}</h4>
                  </div>
                  {aiInterpretationRequested && commentaryQuery.data ? (
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      commentaryQuery.data.source === "fallback" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-sky-300 bg-sky-50 text-sky-700"
                    )}>
                      {commentaryQuery.data.source === "fallback" ? getTranslations(language).common.fallback : getTranslations(language).common.ai}
                    </span>
                  ) : null}
                </div>
                <p className="mb-3 text-xs text-slate-500">Support only — does not change the decision above.</p>
                {!canGenerateAiInterpretation ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    {aiSupportMessage}
                  </div>
                ) : !aiInterpretationRequested ? (
                  <button
                    type="button"
                    onClick={() => { setAiInterpretationRequested(true); commentaryQuery.refetch(); }}
                    className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-[12px] font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    <span className="text-[13px]">✦</span>
                    {creativeTranslations.generateInterpretation}
                  </button>
                ) : commentaryQuery.isLoading || commentaryQuery.isFetching ? (
                  <p className="text-sm text-slate-600">{creativeTranslations.analyzing}</p>
                ) : commentaryQuery.isError ? (
                  <div className="space-y-2">
                    <p className="text-sm text-rose-700">{creativeTranslations.unavailable}</p>
                    <button type="button" onClick={() => commentaryQuery.refetch()} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      {getTranslations(language).common.retry}
                    </button>
                  </div>
                ) : commentaryQuery.data?.commentary ? (
                  <div className="space-y-3">
                    {commentaryQuery.data.warning ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">{commentaryQuery.data.warning}</p>
                    ) : null}
                    <p className="text-sm font-semibold text-slate-900">{commentaryQuery.data.commentary.headline}</p>
                    <p className="text-[13px] leading-relaxed text-slate-600">{commentaryQuery.data.commentary.summary}</p>
                    <ListBlock title={creativeTranslations.opportunities} items={commentaryQuery.data.commentary.opportunities} />
                    <ListBlock title={creativeTranslations.risks} items={commentaryQuery.data.commentary.risks} />
                    <ListBlock title={creativeTranslations.nextActions} items={commentaryQuery.data.commentary.nextActions} ordered />
                    <button type="button" onClick={() => commentaryQuery.refetch()} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      {creativeTranslations.refreshInterpretation}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-rose-700">{creativeTranslations.unavailable}</p>
                    <button type="button" onClick={() => commentaryQuery.refetch()} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      {getTranslations(language).common.retry}
                    </button>
                  </div>
                )}
              </section>

              {/* Block 6: Workflow */}
              <div className="flex items-center justify-between px-1 pb-1 text-[12px]">
                <span className="text-slate-500">
                  Command Center:{" "}
                  <span className="font-medium text-slate-700">
                    {commandCenterAction ? commandCenterAction.status.replaceAll("_", " ") : "pending"}
                  </span>
                </span>
                <a
                  href={`/command-center${commandCenterAction ? `?action=${encodeURIComponent(commandCenterAction.actionFingerprint)}` : ""}`}
                  className="flex items-center gap-1 font-medium text-sky-600 hover:text-sky-700"
                >
                  Open in Command Center <span>→</span>
                </a>
              </div>

              {/* Notes */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <h4 className="text-sm font-semibold text-slate-900">Notes</h4>
                <textarea
                  value={notes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  placeholder="Write hypotheses and test notes..."
                  className="mt-2 min-h-[100px] w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
              </section>

            </div>
          </aside>

        </main>
      </div>
    </div>
  );
}

function ListBlock({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-slate-700">
        {items.map((item, index) => (
          <li key={`${title}-${item}`}>{ordered ? `${index + 1}. ` : "• "}{item}</li>
        ))}
      </ul>
    </div>
  );
}

function decisionHeadline(action: CreativeDecision["action"]): string {
  if (action === "scale_hard") return "High-conviction scale candidate";
  if (action === "scale") return "Ready for controlled scale";
  if (action === "kill") return "Cut recommended";
  if (action === "pause") return "Cut review recommended";
  if (action === "test_more") return "Collect stronger Test More evidence";
  return "Monitor before committing more budget";
}

function lifecycleLabel(state: NonNullable<CreativeDecision["lifecycleState"]> | undefined) {
  if (state === "stable_winner") return "Protect";
  if (state === "emerging_winner") return "Test More";
  if (state === "fatigued_winner") return "Refresh";
  if (state === "test_only") return "Test More";
  if (state === "blocked") return "Diagnose";
  return "Diagnose";
}

function DecisionBadge({ action, label }: { action: CreativeDecision["action"]; label?: string | null }) {
  const labels: Record<CreativeDecision["action"], string> = {
    scale_hard: "Scale",
    scale: "Scale",
    watch: "Diagnose",
    test_more: "Test More",
    pause: "Cut",
    kill: "Cut",
  };
  const classes: Record<CreativeDecision["action"], string> = {
    scale_hard: "bg-emerald-700 text-white",
    scale: "bg-emerald-500 text-white",
    watch: "bg-amber-500 text-white",
    test_more: "bg-sky-600 text-white",
    pause: "bg-orange-500 text-white",
    kill: "bg-red-600 text-white",
  };
  return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide", classes[action])}>{label ?? labels[action]}</span>;
}

function CompactMetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/85 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold leading-4 text-slate-900">{value}</p>
    </div>
  );
}

function Pill({ value }: { value: string }) {
  return <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600">{value}</span>;
}

function formatInteger(value: number): string {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString();
}

function getDecisionTheme(action: CreativeDecision["action"]) {
  if (action === "scale_hard") return { panelClass: "border-emerald-300 bg-[linear-gradient(180deg,rgba(209,250,229,0.96)_0%,rgba(255,255,255,0.98)_100%)]" };
  if (action === "scale") return { panelClass: "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.95)_0%,rgba(255,255,255,0.98)_100%)]" };
  if (action === "kill") return { panelClass: "border-red-300 bg-[linear-gradient(180deg,rgba(254,226,226,0.96)_0%,rgba(255,255,255,0.98)_100%)]" };
  if (action === "pause") return { panelClass: "border-orange-200 bg-[linear-gradient(180deg,rgba(255,247,237,0.96)_0%,rgba(255,255,255,0.98)_100%)]" };
  if (action === "test_more") return { panelClass: "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.96)_0%,rgba(255,255,255,0.98)_100%)]" };
  return { panelClass: "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.95)_0%,rgba(255,255,255,0.98)_100%)]" };
}

function resolveDetailImageUrl(row: MetaCreativeRow): string | null {
  const candidates = [
    row.previewManifest?.detail_image_src ?? null,
    row.previewManifest?.card_src ?? null,
    row.imageUrl,
    row.preview?.image_url,
    row.preview?.poster_url,
    row.thumbnailUrl,
    row.cardPreviewUrl,
    row.tableThumbnailUrl,
    row.cachedThumbnailUrl,
    row.previewUrl,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

type VerdictTheme = {
  band: string;
  titleClass: string;
  bodyClass: string;
  pill: string;
  label: string;
  tagline: string;
};

function getVerdictTheme(
  action: CreativeDecision["action"],
  lifecycleState: CreativeDecision["lifecycleState"] | undefined,
): VerdictTheme {
  if (lifecycleState === "stable_winner") {
    return {
      band: "bg-[#eff6ff] border-l-4 border-[#3b82f6]",
      titleClass: "text-[#1e3a8a]",
      bodyClass: "text-[#1d4ed8]",
      pill: "bg-[#2563eb] text-white",
      label: "Protect",
      tagline: "Stable winner — do not change",
    };
  }
  if (action === "scale_hard" || action === "scale") {
    return {
      band: "bg-[#ecfdf5] border-l-4 border-[#10b981]",
      titleClass: "text-[#047857]",
      bodyClass: "text-[#059669]",
      pill: "bg-[#059669] text-white",
      label: "Scale",
      tagline: "Ready to scale — above benchmark",
    };
  }
  if (lifecycleState === "fatigued_winner" || action === "pause") {
    return {
      band: "bg-[#fffbeb] border-l-4 border-[#f59e0b]",
      titleClass: "text-[#92400e]",
      bodyClass: "text-[#b45309]",
      pill: "bg-[#d97706] text-white",
      label: "Refresh",
      tagline: "Fatigue detected — plan a new variant",
    };
  }
  if (action === "kill") {
    return {
      band: "bg-[#fff1f2] border-l-4 border-[#f43f5e]",
      titleClass: "text-[#9f1239]",
      bodyClass: "text-[#be123c]",
      pill: "bg-[#e11d48] text-white",
      label: "Cut",
      tagline: "Below break-even — pause recommended",
    };
  }
  if (action === "test_more") {
    return {
      band: "bg-[#f0f9ff] border-l-4 border-[#0ea5e9]",
      titleClass: "text-[#0c4a6e]",
      bodyClass: "text-[#0284c7]",
      pill: "bg-[#0284c7] text-white",
      label: "Test More",
      tagline: "Not enough data — keep testing",
    };
  }
  return {
    band: "bg-[#eff6ff] border-l-4 border-[#3b82f6]",
    titleClass: "text-[#1e40af]",
    bodyClass: "text-[#3b82f6]",
    pill: "bg-[#0284c7] text-white",
    label: "Diagnose",
    tagline: "Context or evidence needs review",
  };
}

function getPrimaryDecisionVerdictTheme(
  primaryAction: string,
  authorityLabel?: string | null,
): VerdictTheme {
  if (primaryAction === "Scale") {
    return {
      band: "bg-[#ecfdf5] border-l-4 border-[#10b981]",
      titleClass: "text-[#047857]",
      bodyClass: "text-[#059669]",
      pill: "bg-[#059669] text-white",
      label: "Scale",
      tagline:
        authorityLabel === "Review only"
          ? "Review only — business target missing"
          : "Ready to scale — above benchmark",
    };
  }
  if (primaryAction === "Test More") {
    return {
      band: "bg-[#f0f9ff] border-l-4 border-[#0ea5e9]",
      titleClass: "text-[#0c4a6e]",
      bodyClass: "text-[#0284c7]",
      pill: "bg-[#0284c7] text-white",
      label: "Test More",
      tagline: "Promising — collect more evidence",
    };
  }
  if (primaryAction === "Protect") {
    return {
      band: "bg-[#eff6ff] border-l-4 border-[#3b82f6]",
      titleClass: "text-[#1e3a8a]",
      bodyClass: "text-[#1d4ed8]",
      pill: "bg-[#2563eb] text-white",
      label: "Protect",
      tagline: "Stable winner — do not change",
    };
  }
  if (primaryAction === "Refresh") {
    return {
      band: "bg-[#fffbeb] border-l-4 border-[#f59e0b]",
      titleClass: "text-[#92400e]",
      bodyClass: "text-[#b45309]",
      pill: "bg-[#d97706] text-white",
      label: "Refresh",
      tagline:
        authorityLabel === "Revive"
          ? "Comeback candidate — review reactivation"
          : "Plan a new variant or refresh",
    };
  }
  if (primaryAction === "Cut") {
    return {
      band: "bg-[#fff1f2] border-l-4 border-[#f43f5e]",
      titleClass: "text-[#9f1239]",
      bodyClass: "text-[#be123c]",
      pill: "bg-[#e11d48] text-white",
      label: "Cut",
      tagline: "Below benchmark — operator review",
    };
  }
  return {
    band: "bg-[#f8fafc] border-l-4 border-[#64748b]",
    titleClass: "text-[#334155]",
    bodyClass: "text-[#475569]",
    pill: "bg-[#475569] text-white",
    label: "Diagnose",
    tagline: "Context or evidence needs review",
  };
}

function PrimaryMetricTile({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="flex flex-col gap-1 bg-white px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[18px] font-semibold leading-none tracking-tight text-slate-900">{value}</span>
        {delta != null ? (
          <span className={cn("text-[11px] font-semibold", delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
            {delta >= 0 ? "▲" : "▼"}{Math.abs(delta)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SecondaryMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </>
  );
}

function EvidenceChip({ value }: { value: string }) {
  const color =
    value === "Strong" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value === "Moderate" ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={cn("inline-flex h-[22px] items-center rounded-full border px-2 text-[11px]", color)}>
      Evidence: {value}
    </span>
  );
}

function UrgencyChip({ value }: { value: string }) {
  const color =
    value === "High" ? "border-rose-200 bg-rose-50 text-rose-700"
    : value === "Medium" ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={cn("inline-flex h-[22px] items-center rounded-full border px-2 text-[11px]", color)}>
      Urgency: {value}
    </span>
  );
}

function FitStat({ label, value, valueColor, mark }: { label: string; value: string; valueColor?: string; mark?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-[14px] font-semibold leading-none text-slate-900" style={valueColor ? { color: valueColor } : undefined}>
        {mark ? `${mark} ` : null}{value}
      </span>
    </div>
  );
}
