"use client";

import { useEffect, useMemo, useState } from "react";
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
  type AiCreativeDecision,
  type AiCreativeHistoricalWindows,
  type CreativeRuleReportPayload,
} from "@/src/services";
import { getCreativeDisplayPills } from "@/lib/meta/creative-taxonomy";
import { getTranslations } from "@/lib/i18n";
import { usePreferencesStore } from "@/store/preferences-store";

interface CreativeDetailExperienceProps {
  businessId: string;
  row: MetaCreativeRow | null;
  allRows: MetaCreativeRow[];
  creativeHistoryById?: Map<string, AiCreativeHistoricalWindows>;
  open: boolean;
  notes: string;
  dateRange: CreativeDateRangeValue;
  defaultCurrency: string | null;
  onOpenChange: (open: boolean) => void;
  onNotesChange: (value: string) => void;
  onDateRangeChange: (next: CreativeDateRangeValue) => void;
}

type StageSource = "html" | "image";

export function CreativeDetailExperience({
  businessId,
  row,
  allRows,
  creativeHistoryById,
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
  const [source, setSource] = useState<StageSource>("image");
  const [aiInterpretationRequested, setAiInterpretationRequested] = useState(false);

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

  useEffect(() => {
    setSource(imageUrl ? "image" : "html");
    setAiInterpretationRequested(false);
  }, [imageUrl, row?.id]);

  const shouldFetchHtmlPreview =
    open &&
    Boolean(businessId) &&
    Boolean(row?.creativeId) &&
    (source === "html" || !imageUrl);

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
  const resolvedSource: StageSource = canShowHtml && source === "html" ? "html" : "image";
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

  const context = useMemo(() => (row ? buildCreativeDecisionContext(row, allRows) : null), [allRows, row]);
  const report = useMemo(
    () => (row && context ? buildCreativeRuleReport(row, context, creativeHistoryById?.get(row.id) ?? null) : null),
    [context, creativeHistoryById, row]
  );
  const decision = useMemo(() => (report ? buildDecisionFromRuleReport(report) : null), [report]);
  const scoreBreakdown = useMemo(() => (row && context ? buildScoreBreakdown(row, context) : []), [context, row]);
  const decisionTheme = getDecisionTheme(decision?.action ?? "watch");

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

  if (!open || !row || !report || !decision) return null;

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

        <main className="grid h-[calc(100%-64px)] grid-cols-1 lg:grid-cols-[1.35fr_minmax(360px,520px)]">
          <section className="min-h-0 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
            <div className="mx-auto max-w-[1100px]">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => setSource("html")}
                      disabled={!canShowHtml}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium",
                        resolvedSource === "html" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                        !canShowHtml && "cursor-not-allowed opacity-50"
                      )}
                    >
                      Live preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setSource("image")}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium",
                        resolvedSource === "image" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Creative media
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {taxonomyPills.primaryLabel ? <Pill value={taxonomyPills.primaryLabel} /> : null}
                    {taxonomyPills.secondaryLabel ? <Pill value={taxonomyPills.secondaryLabel} /> : null}
                    {row.launchDate ? <Pill value={`Launched ${row.launchDate}`} /> : null}
                  </div>
                </div>

                <div className="bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#eef3f8_72%,_#e7edf5_100%)] p-3 md:p-5">
                  <div className="flex min-h-[560px] items-center justify-center rounded-2xl border border-slate-200 bg-[#eef2f7] p-3">
                    {resolvedSource === "html" && detailPreviewHtml ? (
                      <iframe
                        title={`${row.name} live preview`}
                        srcDoc={detailPreviewHtml}
                        className="h-[78vh] w-full rounded-xl bg-white"
                        style={{ maxWidth: 860 }}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                      />
                    ) : resolvedSource === "html" && detailPreviewLoading ? (
                      <p className="text-sm text-slate-600">Loading live preview...</p>
                    ) : imageUrl ? (
                      <div className="relative flex max-h-[78vh] w-full max-w-[860px] items-center justify-center overflow-hidden rounded-2xl border border-slate-300 bg-[#0b1020] p-2 shadow-[0_28px_80px_rgba(2,6,23,0.38)]">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(148,163,184,0.22),rgba(15,23,42,0.08)_55%,rgba(2,6,23,0.9)_100%)]" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt={row.name} className="relative z-[1] block max-h-[74vh] w-auto max-w-full object-contain" />
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600">No preview available.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_20%,#ffffff_100%)] p-4 md:p-5">
            <div className="space-y-4">
              <section className={cn("rounded-2xl border p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]", decisionTheme.panelClass)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Decision + key metrics</p>
                    <h3 className="mt-0.5 text-[15px] font-semibold leading-5 text-slate-950">{decisionHeadline(decision.action)}</h3>
                  </div>
                  <DecisionBadge action={decision.action} />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-700">{decision.reasons[0] ?? report.summary}</p>

                <div className="mt-2.5 grid grid-cols-2 gap-1.5 md:grid-cols-3">
                  <CompactMetricCell label="Decision score" value={`${decision.score}/100`} />
                  <CompactMetricCell label="Confidence" value={`${Math.round(decision.confidence * 100)}%`} />
                  <CompactMetricCell label="Lifecycle" value={lifecycleLabel(report.lifecycleState ?? decision.lifecycleState)} />
                </div>

                {report.timeframeContext ? (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Decision model</p>
                    <div className="mt-2 space-y-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Core verdict</p>
                        <p className="mt-1 text-xs text-slate-700">{report.timeframeContext.coreVerdict}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Selected range note</p>
                        <p className="mt-1 text-xs text-slate-700">{report.timeframeContext.selectedRangeOverlay}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Historical support</p>
                        <p className="mt-1 text-xs text-slate-500">{report.timeframeContext.historicalSupport}</p>
                      </div>
                    </div>
                    {report.timeframeContext.note ? (
                      <p className="mt-1 text-xs text-amber-700">{report.timeframeContext.note}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-2 border-t border-slate-200/70 pt-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <CompactMetricCell label="Spend" value={formatMoney(row.spend, currency, defaultCurrency)} />
                    <CompactMetricCell label="Purchase value" value={formatMoney(row.purchaseValue, currency, defaultCurrency)} />
                    <CompactMetricCell label="ROAS" value={`${row.roas.toFixed(2)}x`} />
                    <CompactMetricCell label="CPA" value={formatMoney(row.cpa, currency, defaultCurrency)} />
                    <CompactMetricCell label="CTR" value={`${row.ctrAll.toFixed(2)}%`} />
                    <CompactMetricCell label="Purchases" value={formatInteger(row.purchases)} />
                    <CompactMetricCell label="Impressions" value={formatInteger(row.impressions)} />
                    <CompactMetricCell label="Link clicks" value={formatInteger(row.linkClicks)} />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sky-600" />
                    <h4 className="text-sm font-semibold text-slate-900">{creativeTranslations.aiInterpretation}</h4>
                  </div>
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
                </div>
                {!aiInterpretationRequested ? (
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
                ) : null}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <h4 className="text-sm font-semibold text-slate-900">Score breakdown</h4>
                <p className="mt-1 text-xs text-slate-500">Shows where the {decision.score}/100 score comes from.</p>
                <div className="mt-3 space-y-2.5">
                  {scoreBreakdown.map((item) => {
                    const width = item.maxPoints > 0 ? Math.max(6, Math.min(100, (item.points / item.maxPoints) * 100)) : 0;
                    return (
                      <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                          <p className="text-xs font-semibold text-slate-900">{item.points}/{item.maxPoints}</p>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                          <div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${width}%` }} />
                        </div>
                        <p className="mt-1.5 text-[11px] text-slate-600">{item.detail}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                <h4 className="text-sm font-semibold text-slate-900">Notes</h4>
                <textarea
                  value={notes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  placeholder="Write hypotheses and test notes..."
                  className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm outline-none focus:border-slate-400"
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

function decisionHeadline(action: AiCreativeDecision["action"]): string {
  if (action === "scale_hard") return "High-conviction scale candidate";
  if (action === "scale") return "Ready for controlled scale";
  if (action === "kill") return "Immediate stop recommended";
  if (action === "pause") return "Loss prevention recommended";
  if (action === "test_more") return "Collect stronger test evidence";
  return "Monitor before committing more budget";
}

function lifecycleLabel(state: NonNullable<AiCreativeDecision["lifecycleState"]> | undefined) {
  if (state === "stable_winner") return "Stable winner";
  if (state === "emerging_winner") return "Emerging winner";
  if (state === "fatigued_winner") return "Fatigued winner";
  if (state === "test_only") return "Test-only";
  if (state === "blocked") return "Blocked";
  return "Volatile";
}

function DecisionBadge({ action }: { action: AiCreativeDecision["action"] }) {
  const labels: Record<AiCreativeDecision["action"], string> = {
    scale_hard: "Scale hard",
    scale: "Scale",
    watch: "Watch",
    test_more: "Test more",
    pause: "Pause",
    kill: "Kill",
  };
  const classes: Record<AiCreativeDecision["action"], string> = {
    scale_hard: "bg-emerald-700 text-white",
    scale: "bg-emerald-500 text-white",
    watch: "bg-amber-500 text-white",
    test_more: "bg-sky-600 text-white",
    pause: "bg-orange-500 text-white",
    kill: "bg-red-600 text-white",
  };
  return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide", classes[action])}>{labels[action]}</span>;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/85 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
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

function getDecisionTheme(action: AiCreativeDecision["action"]) {
  if (action === "scale_hard") return { panelClass: "border-emerald-300 bg-[linear-gradient(180deg,rgba(209,250,229,0.96)_0%,rgba(255,255,255,0.98)_100%)]" };
  if (action === "scale") return { panelClass: "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.95)_0%,rgba(255,255,255,0.98)_100%)]" };
  if (action === "kill") return { panelClass: "border-red-300 bg-[linear-gradient(180deg,rgba(254,226,226,0.96)_0%,rgba(255,255,255,0.98)_100%)]" };
  if (action === "pause") return { panelClass: "border-orange-200 bg-[linear-gradient(180deg,rgba(255,247,237,0.96)_0%,rgba(255,255,255,0.98)_100%)]" };
  if (action === "test_more") return { panelClass: "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.96)_0%,rgba(255,255,255,0.98)_100%)]" };
  return { panelClass: "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.95)_0%,rgba(255,255,255,0.98)_100%)]" };
}

interface CreativeDecisionContext {
  roasAvg: number;
  cpaAvg: number;
  ctrAvg: number;
  cvrAvg: number;
  aovAvg: number;
  lpvToClickAvg: number;
  spendAvg: number;
  spendTopAvg: number;
  clickTopAvg: number;
  addToCartTopAvg: number;
  initiateCheckoutTopAvg: number;
  purchasesAvg: number;
  purchasesTopAvg: number;
  spendMedian: number;
  spendP20: number;
  spendP50: number;
  spendP80: number;
  hookAvg: number;
}

interface ScoreBreakdownItem {
  key: "efficiency" | "engagement" | "conversion" | "reliability" | "funnel";
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
}

function buildCreativeDecisionContext(row: MetaCreativeRow, allRows: MetaCreativeRow[]): CreativeDecisionContext {
  const sourceRows = allRows.length > 0 ? allRows : [row];
  const avg = (values: number[]) => {
    const valid = values.filter((value) => Number.isFinite(value));
    return valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
  };
  const totals = sourceRows.reduce(
    (acc, item) => {
      const spend = Number.isFinite(item.spend) ? item.spend : 0;
      const purchaseValue = Number.isFinite(item.purchaseValue) ? item.purchaseValue : 0;
      const purchases = Number.isFinite(item.purchases) ? item.purchases : 0;
      const impressions = Number.isFinite(item.impressions) ? item.impressions : 0;
      const linkClicks = Number.isFinite(item.linkClicks) ? item.linkClicks : 0;
      const landingPageViews = Number.isFinite(item.landingPageViews) ? item.landingPageViews : 0;
      const addToCart = Number.isFinite(item.addToCart) ? item.addToCart : 0;
      const initiateCheckout = Number.isFinite(item.initiateCheckout) ? item.initiateCheckout : 0;

      if (spend > 0) {
        acc.spend += spend;
        acc.purchaseValue += purchaseValue;
      }
      if (purchases > 0) {
        acc.purchases += purchases;
      }
      if (impressions > 0) {
        acc.impressions += impressions;
      }
      if (linkClicks > 0) {
        acc.linkClicks += linkClicks;
      }
      if (landingPageViews > 0) {
        acc.landingPageViews += landingPageViews;
      }
      if (addToCart > 0) {
        acc.addToCart += addToCart;
      }
      if (initiateCheckout > 0) {
        acc.initiateCheckout += initiateCheckout;
      }

      return acc;
    },
    { spend: 0, purchaseValue: 0, purchases: 0, impressions: 0, linkClicks: 0, landingPageViews: 0, addToCart: 0, initiateCheckout: 0 }
  );

  const roasAvg = totals.spend > 0 ? totals.purchaseValue / totals.spend : avg(sourceRows.map((item) => item.roas));
  const cpaAvg = totals.purchases > 0 ? totals.spend / totals.purchases : avg(sourceRows.map((item) => item.cpa));
  const ctrAvg = totals.impressions > 0 ? (totals.linkClicks / totals.impressions) * 100 : avg(sourceRows.map((item) => item.ctrAll));
  const cvrAvg = totals.linkClicks > 0 ? (totals.purchases / totals.linkClicks) * 100 : avg(sourceRows.map((item) => (item.linkClicks > 0 ? (item.purchases / item.linkClicks) * 100 : 0)));
  const aovAvg = totals.purchases > 0 ? totals.purchaseValue / totals.purchases : avg(sourceRows.map((item) => (item.purchases > 0 ? item.purchaseValue / item.purchases : 0)));
  const lpvToClickAvg = totals.linkClicks > 0 ? (totals.landingPageViews / totals.linkClicks) * 100 : avg(sourceRows.map((item) => (item.linkClicks > 0 ? (item.landingPageViews / item.linkClicks) * 100 : 0)));

  const count = sourceRows.length || 1;
  const spendValues = sourceRows.map((item) => (Number.isFinite(item.spend) ? item.spend : 0)).sort((a, b) => a - b);
  const topQuartileStart = Math.ceil(spendValues.length * 0.75);
  const topQuartileSpends = spendValues.slice(topQuartileStart);
  const spendTopAvg = topQuartileSpends.length > 0 ? topQuartileSpends.reduce((s, v) => s + v, 0) / topQuartileSpends.length : totals.spend / count;

  const clickValues = sourceRows.map((item) => (Number.isFinite(item.linkClicks) ? item.linkClicks : 0)).sort((a, b) => a - b);
  const topQuartileClicksStart = Math.ceil(clickValues.length * 0.75);
  const topQuartileClicks = clickValues.slice(topQuartileClicksStart);
  const clickTopAvg = topQuartileClicks.length > 0 ? topQuartileClicks.reduce((s, v) => s + v, 0) / topQuartileClicks.length : totals.linkClicks / count;

  const addToCartValues = sourceRows.map((item) => (Number.isFinite(item.addToCart) ? item.addToCart : 0)).sort((a, b) => a - b);
  const topQuartileAddToCartStart = Math.ceil(addToCartValues.length * 0.75);
  const topQuartileAddToCart = addToCartValues.slice(topQuartileAddToCartStart);
  const addToCartTopAvg = topQuartileAddToCart.length > 0 ? topQuartileAddToCart.reduce((s, v) => s + v, 0) / topQuartileAddToCart.length : totals.addToCart / count;

  const initiateCheckoutValues = sourceRows.map((item) => (Number.isFinite(item.initiateCheckout) ? item.initiateCheckout : 0)).sort((a, b) => a - b);
  const topQuartileInitiateCheckoutStart = Math.ceil(initiateCheckoutValues.length * 0.75);
  const topQuartileInitiateCheckout = initiateCheckoutValues.slice(topQuartileInitiateCheckoutStart);
  const initiateCheckoutTopAvg = topQuartileInitiateCheckout.length > 0 ? topQuartileInitiateCheckout.reduce((s, v) => s + v, 0) / topQuartileInitiateCheckout.length : totals.initiateCheckout / count;

  const purchasesValues = sourceRows.map((item) => (Number.isFinite(item.purchases) ? item.purchases : 0)).sort((a, b) => a - b);
  const topQuartilePurchasesStart = Math.ceil(purchasesValues.length * 0.75);
  const topQuartilePurchases = purchasesValues.slice(topQuartilePurchasesStart);
  const purchasesTopAvg = topQuartilePurchases.length > 0 ? topQuartilePurchases.reduce((s, v) => s + v, 0) / topQuartilePurchases.length : totals.purchases / count;

  return {
    roasAvg,
    cpaAvg,
    ctrAvg,
    cvrAvg,
    aovAvg,
    lpvToClickAvg,
    spendAvg: totals.spend / count,
    spendTopAvg,
    clickTopAvg,
    addToCartTopAvg,
    initiateCheckoutTopAvg,
    purchasesAvg: totals.purchases / count,
    purchasesTopAvg,
    spendMedian: percentile(sourceRows.map((item) => item.spend), 0.5),
    spendP20: percentile(sourceRows.map((item) => item.spend), 0.2),
    spendP50: percentile(sourceRows.map((item) => item.spend), 0.5),
    spendP80: percentile(sourceRows.map((item) => item.spend), 0.8),
    hookAvg: avg(sourceRows.map((item) => item.thumbstop)),
  };
}

function percentile(values: number[], ratio: number): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summarizeHistoricalWindows(history: AiCreativeHistoricalWindows | null | undefined) {
  type HistoryWindow = NonNullable<AiCreativeHistoricalWindows["last3"]>;
  const windows = [
    history?.last3,
    history?.last7,
    history?.last14,
    history?.last30,
    history?.last90,
    history?.allHistory,
  ].filter((window): window is HistoryWindow => Boolean(window));

  if (windows.length === 0) {
    return {
      total: 0,
      strongCount: 0,
      weakCount: 0,
      baselineRoas: 0,
      selectedVsBaselineDelta: 0,
      fatigueSignal: false,
      spikeSignal: false,
    };
  }

  const baselineRoas = windows.reduce((sum, window) => sum + window.roas, 0) / windows.length;
  const strongCount = windows.filter((window) => window.roas >= baselineRoas * 0.95 && window.purchases >= 2).length;
  const weakCount = windows.filter((window) => window.roas > 0 && window.roas <= baselineRoas * 0.75).length;
  return {
    total: windows.length,
    strongCount,
    weakCount,
    baselineRoas,
    selectedVsBaselineDelta: baselineRoas > 0 ? (windows[0]?.roas ?? 0 - baselineRoas) / baselineRoas : 0,
    fatigueSignal: baselineRoas > 0 && strongCount >= 2,
    spikeSignal: baselineRoas > 0 && weakCount === 0,
  };
}

function buildWeightedCreativeReference(row: MetaCreativeRow, history: AiCreativeHistoricalWindows | null) {
  const windows = [
    { weight: 0.18, value: { roas: row.roas, cpa: row.cpa, spend: row.spend, purchases: row.purchases, ctr: row.ctrAll } },
    history?.last3 ? { weight: 0.24, value: { roas: history.last3.roas, cpa: history.last3.cpa, spend: history.last3.spend, purchases: history.last3.purchases, ctr: history.last3.ctr } } : null,
    history?.last7 ? { weight: 0.22, value: { roas: history.last7.roas, cpa: history.last7.cpa, spend: history.last7.spend, purchases: history.last7.purchases, ctr: history.last7.ctr } } : null,
    history?.last14 ? { weight: 0.18, value: { roas: history.last14.roas, cpa: history.last14.cpa, spend: history.last14.spend, purchases: history.last14.purchases, ctr: history.last14.ctr } } : null,
    history?.last30 ? { weight: 0.1, value: { roas: history.last30.roas, cpa: history.last30.cpa, spend: history.last30.spend, purchases: history.last30.purchases, ctr: history.last30.ctr } } : null,
    history?.last90 ? { weight: 0.05, value: { roas: history.last90.roas, cpa: history.last90.cpa, spend: history.last90.spend, purchases: history.last90.purchases, ctr: history.last90.ctr } } : null,
    history?.allHistory ? { weight: 0.03, value: { roas: history.allHistory.roas, cpa: history.allHistory.cpa, spend: history.allHistory.spend, purchases: history.allHistory.purchases, ctr: history.allHistory.ctr } } : null,
  ].filter(Boolean) as Array<{ weight: number; value: { roas: number; cpa: number; spend: number; purchases: number; ctr: number } }>;

  const totalWeight = windows.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    return { roas: row.roas, cpa: row.cpa, spend: row.spend, purchases: row.purchases, ctr: row.ctrAll };
  }

  const weighted = <K extends keyof (typeof windows)[number]["value"]>(key: K) =>
    windows.reduce((sum, item) => sum + item.value[key] * item.weight, 0) / totalWeight;

  return {
    roas: weighted("roas"),
    cpa: weighted("cpa"),
    spend: weighted("spend"),
    purchases: weighted("purchases"),
    ctr: weighted("ctr"),
  };
}

function buildCreativeRuleReport(
  row: MetaCreativeRow,
  context: CreativeDecisionContext,
  history: AiCreativeHistoricalWindows | null
): CreativeRuleReportPayload {
  const lowReliability = row.spend < Math.max(1, context.spendP20) || row.purchases < 2;
  const safeLinkClicks = Number.isFinite(row.linkClicks) ? row.linkClicks : 0;
  const safeLandingPageViews = Number.isFinite(row.landingPageViews) ? row.landingPageViews : 0;
  const safeAddToCart = Number.isFinite(row.addToCart) ? row.addToCart : 0;
  const safeInitiateCheckout = Number.isFinite(row.initiateCheckout) ? row.initiateCheckout : 0;

  const core = buildWeightedCreativeReference(row, history);
  const roasRatio = context.roasAvg > 0 ? core.roas / context.roasAvg : 1;
  const cpaRatio = context.cpaAvg > 0 ? core.cpa / context.cpaAvg : 1;
  const ctrRatio = context.ctrAvg > 0 ? core.ctr / context.ctrAvg : 1;
  const spendReliability = context.spendTopAvg > 0 ? Math.min(1.0, row.spend / context.spendTopAvg) : 0.4;
  const purchaseRatio = context.purchasesTopAvg > 0 ? row.purchases / context.purchasesTopAvg : 0;
  const purchaseBonus = purchaseRatio >= 1 ? 3 : purchaseRatio >= 0.5 ? 1.5 : 0;
  const cvr = safeLinkClicks > 0 ? (row.purchases / safeLinkClicks) * 100 : 0;
  const aov = row.purchases > 0 ? row.purchaseValue / row.purchases : 0;
  const conversionQuality = cvr * aov;
  const avgConversionQuality = context.cvrAvg * context.aovAvg;
  const conversionQualityRatio = avgConversionQuality > 0 ? conversionQuality / avgConversionQuality : 0;
  const lpvToClick = safeLinkClicks > 0 ? (safeLandingPageViews / safeLinkClicks) * 100 : 0;
  const lpvToClickRatio = context.lpvToClickAvg > 0 ? lpvToClick / context.lpvToClickAvg : 1;
  const addToCartVolumeRatio = context.addToCartTopAvg > 0 ? safeAddToCart / context.addToCartTopAvg : 0;
  const initiateCheckoutVolumeRatio = context.initiateCheckoutTopAvg > 0 ? safeInitiateCheckout / context.initiateCheckoutTopAvg : 0;
  const lpvToClickScore = Math.max(0, Math.min(5, 2.5 + (lpvToClickRatio - 1) * 2.5));
  const addToCartVolumeScore = Math.max(0, Math.min(5, addToCartVolumeRatio * 5));
  const initiateCheckoutVolumeScore = Math.max(0, Math.min(5, initiateCheckoutVolumeRatio * 5));
  const funnelScore = Math.max(0, Math.min(15, lpvToClickScore + addToCartVolumeScore + initiateCheckoutVolumeScore));

  const thumbstopRatio = context.hookAvg > 0 ? row.thumbstop / context.hookAvg : 1;
  const ctrSignal = Math.max(-1, Math.min(1, (ctrRatio - 1) / (ctrRatio + 1)));
  const thumbstopSignal = Math.max(-1, Math.min(1, (thumbstopRatio - 1) / (thumbstopRatio + 1)));

  const efficiencyScore = Math.max(0, Math.min(40, 25 + (roasRatio - 1) * 28 - Math.max(0, cpaRatio - 1) * 8));
  const engagementScore = ((ctrSignal + 1) / 2) * 7.5 + ((thumbstopSignal + 1) / 2) * 7.5;
  const conversionScore = Math.max(0, Math.min(15, conversionQualityRatio * 15));
  const reliabilityScore = Math.max(0, Math.min(15, 5 + spendReliability * 7 + purchaseBonus));
  const score = Math.round(Math.max(0, Math.min(100, efficiencyScore + engagementScore + conversionScore + reliabilityScore + funnelScore)));
  const strongConversionQuality = conversionQualityRatio >= 1.05;
  const acceptableConversionQuality = conversionQualityRatio >= 0.9;
  const historical = summarizeHistoricalWindows(history);

  let action: AiCreativeDecision["action"] = "watch";
  if (reliabilityScore < 7) action = "test_more";
  else if (reliabilityScore < 10) action = "watch";
  else if (context.roasAvg > 0 && core.roas >= context.roasAvg * 1.45 && core.spend >= Math.max(1, context.spendP50) && core.purchases >= 3 && strongConversionQuality) action = "scale_hard";
  else if (context.roasAvg > 0 && core.roas >= context.roasAvg * 1.2 && acceptableConversionQuality) action = "scale";
  else if (context.roasAvg > 0 && core.roas < context.roasAvg * 0.55 && core.spend >= Math.max(1, context.spendP80) && core.purchases === 0) action = "kill";
  else if (context.roasAvg > 0 && core.roas < context.roasAvg * 0.8) action = "pause";

  if ((action === "scale_hard" || action === "scale") && historical.total > 0 && historical.strongCount === 0) {
    action = action === "scale_hard" ? "scale" : "watch";
  }
  if ((action === "pause" || action === "kill") && historical.strongCount >= 2) {
    action = "pause";
  }
  if (action === "test_more" && historical.strongCount >= 2) {
    action = "watch";
  }

  const confidenceBase = lowReliability ? 0.4 : row.spend >= context.spendP50 ? 0.72 : 0.58;
  const confidence = Math.max(
    0.3,
    Math.min(
      0.9,
      (action === "watch" || action === "test_more" ? confidenceBase - 0.06 : confidenceBase) +
        (historical.strongCount >= 3 ? 0.06 : 0)
      )
  );

  const lifecycleState: NonNullable<CreativeRuleReportPayload["lifecycleState"]> =
    action === "scale_hard"
      ? historical.strongCount >= 2
        ? "stable_winner"
        : "emerging_winner"
      : action === "scale"
        ? historical.strongCount >= 3 || confidence >= 0.74
          ? "stable_winner"
          : "emerging_winner"
        : action === "test_more"
          ? "test_only"
          : action === "kill"
            ? "blocked"
            : action === "pause"
              ? historical.fatigueSignal || historical.strongCount >= 2
                ? "fatigued_winner"
                : "blocked"
              : historical.fatigueSignal || (historical.strongCount >= 2 && row.roas < core.roas * 0.85)
                ? "fatigued_winner"
                : "volatile";

  const factors: CreativeRuleReportPayload["factors"] = [
    { label: "Efficiency", impact: roasRatio >= 1.15 ? "positive" : roasRatio <= 0.85 ? "negative" : "neutral", value: `Core ${core.roas.toFixed(2)}x vs avg ${context.roasAvg.toFixed(2)}x`, reason: roasRatio >= 1.15 ? "Core weighted ROAS is meaningfully above account baseline." : roasRatio <= 0.85 ? "Core weighted ROAS is below account baseline." : "Core weighted ROAS is near account baseline." },
    { label: "Cost control", impact: cpaRatio <= 0.9 ? "positive" : cpaRatio >= 1.15 ? "negative" : "neutral", value: `Core ${core.cpa.toFixed(2)} vs ${context.cpaAvg.toFixed(2)} avg`, reason: cpaRatio <= 0.9 ? "Core weighted CPA is healthier than baseline." : cpaRatio >= 1.15 ? "Core weighted CPA is materially higher than baseline." : "Core weighted CPA is close to baseline." },
    { label: "Signal depth", impact: lowReliability ? "negative" : row.purchases >= 3 ? "positive" : "neutral", value: `${row.purchases.toLocaleString()} purchases, ${row.spend.toFixed(2)} spend`, reason: lowReliability ? "Data volume is still limited for a high-conviction decision." : "Spend and conversion depth are sufficient for decisioning." },
    { label: "Engagement", impact: ctrRatio >= 1.1 ? "positive" : ctrRatio <= 0.85 ? "negative" : "neutral", value: `CTR ${row.ctrAll.toFixed(2)}% vs ${context.ctrAvg.toFixed(2)}% avg`, reason: ctrRatio >= 1.1 ? "Click intent is stronger than account average." : ctrRatio <= 0.85 ? "Click intent is weaker than account average." : "Click intent is near account average." },
    ...(historical.total > 0
      ? [(() => {
          const impact: "positive" | "negative" | "neutral" =
            historical.strongCount >= 2 ? "positive" : historical.weakCount >= 2 ? "negative" : "neutral";
          return {
          label: "Historical validation",
          impact,
          value: `${historical.strongCount}/${historical.total} strong windows · baseline ${historical.baselineRoas.toFixed(2)}x`,
          reason:
            historical.strongCount >= 2
              ? "This creative has supportive performance outside the selected range too."
              : historical.weakCount >= 2
                ? "Weakness is not limited to the selected range."
                : "Historical windows are mixed, so the selected range should not be over-interpreted.",
          };
        })()]
      : []),
  ];

  const summary = action === "scale_hard"
    ? "Analysis shows strong economics with enough signal depth for aggressive scaling."
    : action === "scale"
      ? "Analysis shows above-baseline economics that justify controlled budget expansion."
      : action === "pause"
        ? "Analysis flags downside risk relative to account baseline at meaningful spend."
        : action === "kill"
          ? "Analysis flags severe underperformance with strong stop evidence."
          : action === "test_more"
            ? "Analysis marks this as low-confidence due to insufficient signal depth."
            : "Analysis shows mixed signals and recommends monitoring before major action.";

  return {
    creativeId: row.id,
    creativeName: row.name,
    action,
    lifecycleState,
    score,
    confidence,
    coreVerdict:
      action === "scale_hard"
        ? "Weighted core windows mark this as a strong winner with enough depth to scale aggressively."
        : action === "scale"
          ? "Weighted core windows support controlled scaling."
          : action === "pause"
            ? historical.fatigueSignal
              ? "Weighted core windows read this as a fatigued former winner."
              : "Weighted core windows show downside meaningful enough to pause."
            : action === "kill"
              ? "Weighted core windows show persistent downside with little rescue signal."
              : action === "test_more"
                ? "Weighted core windows do not have enough evidence yet for a strong verdict."
                : "Weighted core windows keep this in the monitor bucket for now.",
    summary,
    accountContext: {
      roasAvg: Number(context.roasAvg.toFixed(4)),
      cpaAvg: Number(context.cpaAvg.toFixed(4)),
      ctrAvg: Number(context.ctrAvg.toFixed(4)),
      spendMedian: Number(context.spendMedian.toFixed(4)),
      spendP20: Number(context.spendP20.toFixed(4)),
      spendP80: Number(context.spendP80.toFixed(4)),
    },
    timeframeContext: {
      coreVerdict: `Core weighted performance is ${core.roas.toFixed(2)}x ROAS on ${core.purchases.toFixed(1)} purchases-equivalent, versus ${context.roasAvg.toFixed(2)}x account baseline.`,
      selectedRangeOverlay: `Selected range shows ${row.roas.toFixed(2)}x ROAS on ${row.purchases} purchases, while core weighted ROAS is ${core.roas.toFixed(2)}x.`,
      historicalSupport:
        historical.total > 0
          ? `${historical.strongCount}/${historical.total} historical windows support the current direction.`
          : "Historical validation is not available for this creative yet.",
      note:
        historical.total > 0 && action === "pause" && historical.strongCount >= 2
          ? "This looks closer to fatigue/decay than to a never-worked creative."
          : historical.total > 0 && (action === "scale" || action === "scale_hard") && historical.strongCount === 0
            ? "Selected range is strong, but historical confirmation is still weak."
            : null,
    },
    factors,
  };
}

function buildScoreBreakdown(row: MetaCreativeRow, context: CreativeDecisionContext): ScoreBreakdownItem[] {
  const roasRatio = context.roasAvg > 0 ? row.roas / context.roasAvg : 1;
  const cpaRatio = context.cpaAvg > 0 ? row.cpa / context.cpaAvg : 1;
  const ctrRatio = context.ctrAvg > 0 ? row.ctrAll / context.ctrAvg : 1;
  const safeLinkClicks = Number.isFinite(row.linkClicks) ? row.linkClicks : 0;
  const safeLandingPageViews = Number.isFinite(row.landingPageViews) ? row.landingPageViews : 0;
  const safeAddToCart = Number.isFinite(row.addToCart) ? row.addToCart : 0;
  const safeInitiateCheckout = Number.isFinite(row.initiateCheckout) ? row.initiateCheckout : 0;
  const spendReliability = context.spendTopAvg > 0 ? Math.min(1.0, row.spend / context.spendTopAvg) : 0.4;
  const purchaseRatio = context.purchasesTopAvg > 0 ? row.purchases / context.purchasesTopAvg : 0;
  const purchaseBonus = purchaseRatio >= 1 ? 3 : purchaseRatio >= 0.5 ? 1.5 : 0;
  const cvr = safeLinkClicks > 0 ? (row.purchases / safeLinkClicks) * 100 : 0;
  const aov = row.purchases > 0 ? row.purchaseValue / row.purchases : 0;
  const conversionQuality = cvr * aov;
  const avgConversionQuality = context.cvrAvg * context.aovAvg;
  const conversionQualityRatio = avgConversionQuality > 0 ? conversionQuality / avgConversionQuality : 0;
  const lpvToClick = safeLinkClicks > 0 ? (safeLandingPageViews / safeLinkClicks) * 100 : 0;
  const lpvToClickRatio = context.lpvToClickAvg > 0 ? lpvToClick / context.lpvToClickAvg : 1;
  const addToCartVolumeRatio = context.addToCartTopAvg > 0 ? safeAddToCart / context.addToCartTopAvg : 0;
  const initiateCheckoutVolumeRatio = context.initiateCheckoutTopAvg > 0 ? safeInitiateCheckout / context.initiateCheckoutTopAvg : 0;
  const lpvToClickScore = Math.max(0, Math.min(5, 2.5 + (lpvToClickRatio - 1) * 2.5));
  const addToCartVolumeScore = Math.max(0, Math.min(5, addToCartVolumeRatio * 5));
  const initiateCheckoutVolumeScore = Math.max(0, Math.min(5, initiateCheckoutVolumeRatio * 5));
  const funnelScore = Math.max(0, Math.min(15, lpvToClickScore + addToCartVolumeScore + initiateCheckoutVolumeScore));

  const thumbstopRatio = context.hookAvg > 0 ? row.thumbstop / context.hookAvg : 1;
  const ctrSignal = Math.max(-1, Math.min(1, (ctrRatio - 1) / (ctrRatio + 1)));
  const thumbstopSignal = Math.max(-1, Math.min(1, (thumbstopRatio - 1) / (thumbstopRatio + 1)));

  const efficiencyScore = Math.max(0, Math.min(40, 25 + (roasRatio - 1) * 28 - Math.max(0, cpaRatio - 1) * 8));
  const engagementScore = ((ctrSignal + 1) / 2) * 7.5 + ((thumbstopSignal + 1) / 2) * 7.5;
  const conversionScore = Math.max(0, Math.min(15, conversionQualityRatio * 15));
  const reliabilityScore = Math.max(0, Math.min(15, 5 + spendReliability * 7 + purchaseBonus));

  return [
    {
      key: "efficiency",
      label: "Efficiency",
      points: Math.round(efficiencyScore),
      maxPoints: 40,
      detail: `ROAS ${row.roas.toFixed(2)}x vs avg ${context.roasAvg.toFixed(2)}x, CPA ${row.cpa.toFixed(2)} vs avg ${context.cpaAvg.toFixed(2)}.`,
    },
    {
      key: "engagement",
      label: "Engagement",
      points: Math.round(engagementScore),
      maxPoints: 15,
      detail: `CTR ${row.ctrAll.toFixed(2)}% vs avg ${context.ctrAvg.toFixed(2)}%, Thumbstop ${row.thumbstop.toFixed(2)}% vs avg ${context.hookAvg.toFixed(2)}%.`,
    },
    {
      key: "conversion",
      label: "Conversion quality",
      points: Math.round(conversionScore),
      maxPoints: 15,
      detail: `CVR ${cvr.toFixed(2)}% vs avg ${context.cvrAvg.toFixed(2)}%, AOV ${aov.toFixed(2)} vs avg ${context.aovAvg.toFixed(2)}.`,
    },
    {
      key: "reliability",
      label: "Reliability",
      points: Math.round(reliabilityScore),
      maxPoints: 15,
      detail: `Spend ${row.spend.toFixed(2)} vs top-25% avg ${context.spendTopAvg.toFixed(2)} · Orders ${row.purchases} vs top-25% avg ${context.purchasesTopAvg.toFixed(1)}.`,
    },
    {
      key: "funnel",
      label: "Funnel depth",
      points: Math.round(funnelScore),
      maxPoints: 15,
      detail: `LPV/Click ${lpvToClick.toFixed(2)}% vs avg ${context.lpvToClickAvg.toFixed(2)}%, ATC ${formatInteger(safeAddToCart)} vs top-25% avg ${context.addToCartTopAvg.toFixed(1)}, IC ${formatInteger(safeInitiateCheckout)} vs top-25% avg ${context.initiateCheckoutTopAvg.toFixed(1)}.`,
    },
  ];
}

function buildDecisionFromRuleReport(report: CreativeRuleReportPayload): AiCreativeDecision {
  return {
    creativeId: report.creativeId,
    action: report.action,
    lifecycleState: report.lifecycleState,
    score: report.score,
    confidence: report.confidence,
    scoringFactors: report.factors.map((factor) => `${factor.label}: ${factor.value}`),
    reasons: report.factors.map((factor) => `${factor.label}: ${factor.reason}`).slice(0, 3),
    nextStep: report.summary,
  };
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
