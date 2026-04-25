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
  creativeOperatorSegmentLabel,
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
  const decisionTheme = getDecisionTheme(decision?.action ?? "watch");
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

          <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_20%,#ffffff_100%)] p-4 md:p-5">
            <div className="space-y-3">

              {/* Verdict */}
              <section
                className={cn("rounded-2xl border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)]", decisionTheme.panelClass)}
                data-testid="creative-detail-verdict"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {lifecycleLabel(report.lifecycleState ?? decision.lifecycleState)}
                    </span>
                    {decisionOsCreative.familyLabel ? (
                      <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {decisionOsCreative.familyLabel}
                      </span>
                    ) : null}
                    {previewTruth?.liveDecisionWindow !== "ready" ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        Preview {(previewTruth?.liveDecisionWindow ?? "missing").replaceAll("_", " ")}
                      </span>
                    ) : null}
                  </div>
                  <DecisionBadge action={decision.action} label={operatorItem?.primaryAction} />
                </div>
                <h3 className="mt-2 text-[15px] font-semibold leading-5 text-slate-950">
                  {operatorItem?.primaryAction ?? decisionHeadline(decision.action)}
                </h3>
                <p className="mt-1.5 text-xs leading-5 text-slate-700">{decisionOsCreative.summary}</p>
                <p className="mt-2 text-[11px] text-slate-500">
                  Score {decision.score}/100 · Confidence {Math.round(decision.confidence * 100)}%
                </p>
              </section>

              {/* Next Action */}
              {operatorItem?.instruction ? (
                <section
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                  data-testid="creative-detail-next-action"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next action</p>
                  <p className="mt-1.5 text-sm font-semibold leading-5 text-slate-900">
                    {operatorItem.instruction.primaryMove}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{operatorItem.instruction.reasonSummary}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {operatorItem.instruction.urgency ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                        Urgency: {operatorItem.instruction.urgency}
                      </span>
                    ) : null}
                    {operatorItem.instruction.evidenceStrength ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                        Evidence: {operatorItem.instruction.evidenceStrength}
                      </span>
                    ) : null}
                    {operatorItem.instruction.amountGuidance?.label ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                        {operatorItem.instruction.amountGuidance.label}
                      </span>
                    ) : null}
                  </div>
                  {operatorItem.instruction.nextObservation?.[0] ? (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Watch: {operatorItem.instruction.nextObservation[0]}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {/* Performance */}
              <section
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                data-testid="creative-detail-performance"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Performance</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <MetricCell
                    label="ROAS"
                    value={`${row.roas.toFixed(2)}x`}
                    benchmarkStatus={decisionOsCreative.benchmark.metrics.roas.status}
                  />
                  <MetricCell label="Spend" value={formatMoney(row.spend, currency, defaultCurrency)} />
                  <MetricCell
                    label="CPA"
                    value={formatMoney(row.cpa, currency, defaultCurrency)}
                    benchmarkStatus={decisionOsCreative.benchmark.metrics.cpa.status}
                  />
                  <MetricCell
                    label="CTR"
                    value={`${row.ctrAll.toFixed(2)}%`}
                    benchmarkStatus={decisionOsCreative.benchmark.metrics.ctr.status}
                  />
                  <MetricCell label="Purchases" value={formatInteger(row.purchases)} />
                  <MetricCell label="Purchase value" value={formatMoney(row.purchaseValue, currency, defaultCurrency)} />
                </div>
              </section>

              {/* Commercial Fit */}
              <section
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                data-testid="creative-detail-commercial-fit"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Commercial fit</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  vs {decisionOsCreative.benchmark.selectedCohortLabel} · {decisionOsCreative.benchmark.sampleSize} peers
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <BenchmarkCell
                    label="ROAS"
                    value={`${decisionOsCreative.benchmark.metrics.roas.current?.toFixed(2) ?? "n/a"}x`}
                    status={decisionOsCreative.benchmark.metrics.roas.status}
                  />
                  <BenchmarkCell
                    label="CPA"
                    value={decisionOsCreative.benchmark.metrics.cpa.current != null ? formatMoney(decisionOsCreative.benchmark.metrics.cpa.current, currency, defaultCurrency) : "n/a"}
                    status={decisionOsCreative.benchmark.metrics.cpa.status}
                  />
                  <BenchmarkCell
                    label="CTR"
                    value={`${decisionOsCreative.benchmark.metrics.ctr.current?.toFixed(2) ?? "n/a"}%`}
                    status={decisionOsCreative.benchmark.metrics.ctr.status}
                  />
                </div>
                {(decisionOsCreative.economics.absoluteSpendFloor || decisionOsCreative.economics.roasFloor != null || decisionOsCreative.economics.cpaCeiling != null) ? (
                  <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Minimums</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                      {decisionOsCreative.economics.absoluteSpendFloor ? (
                        <span>Spend floor ${decisionOsCreative.economics.absoluteSpendFloor}</span>
                      ) : null}
                      {decisionOsCreative.economics.roasFloor != null ? (
                        <span>ROAS floor {decisionOsCreative.economics.roasFloor.toFixed(2)}x</span>
                      ) : null}
                      {decisionOsCreative.economics.cpaCeiling != null ? (
                        <span>CPA ceiling {formatMoney(decisionOsCreative.economics.cpaCeiling, currency, defaultCurrency)}</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {businessValidationNote ? (
                  <p className="mt-2 text-[11px] text-amber-700">{businessValidationNote}</p>
                ) : null}
                {decisionOsCreative.benchmark.missingContext.length > 0 ? (
                  <p className="mt-1.5 text-[11px] text-amber-700">
                    Missing: {decisionOsCreative.benchmark.missingContext.join(" · ")}
                  </p>
                ) : null}
              </section>

              <CreativeCommercialContextCard
                businessId={businessId}
                startDate={standardRange.customStart}
                endDate={standardRange.customEnd}
              />

              {/* AI Commentary */}
              <section
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                data-testid="creative-detail-ai-commentary"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sky-600" />
                    <h4 className="text-sm font-semibold text-slate-900">{creativeTranslations.aiInterpretation}</h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {aiInterpretationRequested && commentaryQuery.data ? (
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          commentaryQuery.data.source === "fallback"
                            ? "border-amber-300 bg-amber-50 text-amber-700"
                            : "border-sky-300 bg-sky-50 text-sky-700"
                        )}
                      >
                        {commentaryQuery.data.source === "fallback" ? getTranslations(language).common.fallback : getTranslations(language).common.ai}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                      Support only
                    </span>
                  </div>
                </div>
                <p className="mb-3 text-xs text-slate-600">{aiSupportMessage}</p>
                {!canGenerateAiInterpretation ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {aiSupportMessage}
                  </div>
                ) : !aiInterpretationRequested ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAiInterpretationRequested(true);
                      commentaryQuery.refetch();
                    }}
                    className="inline-flex items-center rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    {creativeTranslations.generateInterpretation}
                  </button>
                ) : commentaryQuery.isLoading || commentaryQuery.isFetching ? (
                  <p className="text-sm text-slate-600">{creativeTranslations.analyzing}</p>
                ) : commentaryQuery.isError ? (
                  <div className="space-y-2">
                    <p className="text-sm text-rose-700">{creativeTranslations.unavailable}</p>
                    <button
                      type="button"
                      onClick={() => commentaryQuery.refetch()}
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {getTranslations(language).common.retry}
                    </button>
                  </div>
                ) : commentaryQuery.data?.commentary ? (
                  <div className="space-y-3">
                    {commentaryQuery.data.warning ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        {commentaryQuery.data.warning}
                      </p>
                    ) : null}
                    <p className="text-sm font-semibold text-slate-900">{commentaryQuery.data.commentary.headline}</p>
                    <p className="text-sm leading-6 text-slate-700">{commentaryQuery.data.commentary.summary}</p>
                    <ListBlock title={creativeTranslations.opportunities} items={commentaryQuery.data.commentary.opportunities} />
                    <ListBlock title={creativeTranslations.risks} items={commentaryQuery.data.commentary.risks} />
                    <ListBlock title={creativeTranslations.nextActions} items={commentaryQuery.data.commentary.nextActions} ordered />
                    <button
                      type="button"
                      onClick={() => commentaryQuery.refetch()}
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {creativeTranslations.refreshInterpretation}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-rose-700">{creativeTranslations.unavailable}</p>
                    <button
                      type="button"
                      onClick={() => commentaryQuery.refetch()}
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {getTranslations(language).common.retry}
                    </button>
                  </div>
                )}
              </section>

              {/* Technical Details — collapsed */}
              <details className="group rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 select-none">
                  <span className="text-sm font-medium text-slate-700">Technical details</span>
                  <span className="text-[11px] text-slate-400">Fatigue · Deployment · Family</span>
                </summary>
                <div className="space-y-3 px-4 pb-4">
                  {report.timeframeContext ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Decision model</p>
                      <div className="mt-2 space-y-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Core verdict</p>
                          <p className="mt-0.5 text-xs text-slate-700">{report.timeframeContext.coreVerdict}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Range note</p>
                          <p className="mt-0.5 text-xs text-slate-700">{report.timeframeContext.selectedRangeOverlay}</p>
                        </div>
                      </div>
                      {report.timeframeContext.note ? (
                        <p className="mt-1 text-xs text-amber-700">{report.timeframeContext.note}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2" data-testid="creative-detail-fatigue-evidence">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Fatigue engine</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <CompactMetricCell label="Status" value={decisionOsCreative.fatigue.status} />
                      <CompactMetricCell label="Confidence" value={`${Math.round(decisionOsCreative.fatigue.confidence * 100)}%`} />
                      <CompactMetricCell
                        label="ROAS decay"
                        value={decisionOsCreative.fatigue.roasDecay === null ? "Unknown" : `${Math.round(decisionOsCreative.fatigue.roasDecay * 100)}%`}
                      />
                      <CompactMetricCell
                        label="CTR decay"
                        value={decisionOsCreative.fatigue.ctrDecay === null ? "Unknown" : `${Math.round(decisionOsCreative.fatigue.ctrDecay * 100)}%`}
                      />
                    </div>
                    {decisionOsCreative.fatigue.evidence.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {decisionOsCreative.fatigue.evidence.slice(0, 3).map((item) => (
                          <p key={item} className="text-[11px] text-slate-600">{item}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2" data-testid="creative-detail-deployment-matrix">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Deployment matrix</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <CompactMetricCell label="Lane" value={decisionOsCreative.deployment.targetLane ?? "None"} />
                      <CompactMetricCell label="Compatibility" value={decisionOsCreative.deployment.compatibility.status} />
                      <CompactMetricCell label="GEO context" value={decisionOsCreative.deployment.geoContext} />
                      <CompactMetricCell label="Ad set role" value={decisionOsCreative.deployment.targetAdSetRole ?? "None"} />
                    </div>
                    {decisionOsCreative.deployment.queueSummary ? (
                      <p className="mt-2 text-[11px] text-slate-600">{decisionOsCreative.deployment.queueSummary}</p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2" data-testid="creative-detail-preview-truth">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Preview truth</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <CompactMetricCell label="Live window" value={(previewTruth?.liveDecisionWindow ?? "missing").replaceAll("_", " ")} />
                      <CompactMetricCell label="Selected window" value={(previewTruth?.selectedWindow ?? "missing").replaceAll("_", " ")} />
                    </div>
                    {previewTruth?.reason ? (
                      <p className="mt-2 text-[11px] text-slate-600">{previewTruth.reason}</p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Family provenance</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <CompactMetricCell label="Confidence" value={decisionOsCreative.familyProvenance.confidence} />
                      <CompactMetricCell label="Over-grouping risk" value={decisionOsCreative.familyProvenance.overGroupingRisk} />
                    </div>
                    {decisionOsCreative.familyProvenance.evidence.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {decisionOsCreative.familyProvenance.evidence.slice(0, 2).map((item) => (
                          <p key={item} className="text-[11px] text-slate-600">{item}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2" data-testid="creative-detail-benchmark-evidence">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Benchmark evidence</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {decisionOsCreative.benchmark.selectedCohortLabel} · {decisionOsCreative.benchmark.sampleSize} peers
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <CompactMetricCell label="Scope" value={decisionOsCreative.benchmarkScopeLabel} />
                      <CompactMetricCell label="Reliability" value={creativeBenchmarkReliabilityLabel(decisionOsCreative.benchmarkReliability)} />
                      <CompactMetricCell
                        label="ROAS"
                        value={`${decisionOsCreative.benchmark.metrics.roas.current?.toFixed(2) ?? "n/a"}x / ${decisionOsCreative.benchmark.metrics.roas.status}`}
                      />
                      <CompactMetricCell
                        label="CPA"
                        value={`${decisionOsCreative.benchmark.metrics.cpa.current?.toFixed(2) ?? "n/a"} / ${decisionOsCreative.benchmark.metrics.cpa.status}`}
                      />
                      <CompactMetricCell
                        label="CTR"
                        value={`${decisionOsCreative.benchmark.metrics.ctr.current?.toFixed(2) ?? "n/a"}% / ${decisionOsCreative.benchmark.metrics.ctr.status}`}
                      />
                      <CompactMetricCell
                        label={decisionOsCreative.benchmark.metrics.attention.label}
                        value={`${decisionOsCreative.benchmark.metrics.attention.current?.toFixed(2) ?? "n/a"} / ${decisionOsCreative.benchmark.metrics.attention.status}`}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Economics floor</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <CompactMetricCell label="Status" value={decisionOsCreative.economics.status} />
                      <CompactMetricCell label="Spend floor" value={`$${decisionOsCreative.economics.absoluteSpendFloor}`} />
                      <CompactMetricCell label="Purchase floor" value={String(decisionOsCreative.economics.absolutePurchaseFloor)} />
                      <CompactMetricCell
                        label="ROAS floor"
                        value={decisionOsCreative.economics.roasFloor === null ? "Unknown" : `${decisionOsCreative.economics.roasFloor.toFixed(2)}x`}
                      />
                      <CompactMetricCell
                        label="CPA ceiling"
                        value={decisionOsCreative.economics.cpaCeiling === null ? "None" : formatMoney(decisionOsCreative.economics.cpaCeiling, currency, defaultCurrency)}
                      />
                    </div>
                    {decisionOsCreative.economics.reasons.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {decisionOsCreative.economics.reasons.slice(0, 3).map((item) => (
                          <p key={item} className="text-[11px] text-slate-600">{item}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2" data-testid="creative-detail-command-center">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Command Center</p>
                      <a
                        href={`/command-center${commandCenterAction ? `?action=${encodeURIComponent(commandCenterAction.actionFingerprint)}` : ""}`}
                        className="text-[11px] text-slate-500 underline-offset-2 hover:underline"
                      >
                        Open →
                      </a>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                        {commandCenterAction ? commandCenterAction.status.replaceAll("_", " ") : "pending"}
                      </span>
                      {commandCenterAction?.assigneeName ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
                          {commandCenterAction.assigneeName}
                        </span>
                      ) : null}
                      {commandCenterAction?.snoozeUntil ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                          Snoozed
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </details>

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
  if (state === "blocked") return "Campaign Check";
  return "Watch";
}

function DecisionBadge({ action, label }: { action: CreativeDecision["action"]; label?: string | null }) {
  const labels: Record<CreativeDecision["action"], string> = {
    scale_hard: "Scale",
    scale: "Scale",
    watch: "Watch",
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

function MetricCell({ label, value, benchmarkStatus }: { label: string; value: string; benchmarkStatus?: string }) {
  const isAbove = benchmarkStatus === "above_benchmark" || benchmarkStatus === "meets_benchmark";
  const isBelow = benchmarkStatus === "below_benchmark" || benchmarkStatus === "at_risk";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1">
        <p className="text-[15px] font-semibold leading-5 text-slate-900">{value}</p>
        {isAbove ? <span className="text-[10px] font-medium text-emerald-600">↑</span> : null}
        {isBelow ? <span className="text-[10px] font-medium text-rose-600">↓</span> : null}
      </div>
    </div>
  );
}

function BenchmarkCell({ label, value, status }: { label: string; value: string; status: string }) {
  const isAbove = status === "above_benchmark" || status === "meets_benchmark";
  const isBelow = status === "below_benchmark" || status === "at_risk";
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        isAbove ? "border-emerald-200 bg-emerald-50/70" : isBelow ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-slate-50/70",
      )}
    >
      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={cn("mt-0.5 text-[13px] font-semibold leading-4", isAbove ? "text-emerald-700" : isBelow ? "text-rose-700" : "text-slate-700")}>
        {value}
      </p>
      <p className={cn("text-[9px]", isAbove ? "text-emerald-500" : isBelow ? "text-rose-500" : "text-slate-400")}>
        {status.replaceAll("_", " ")}
      </p>
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
