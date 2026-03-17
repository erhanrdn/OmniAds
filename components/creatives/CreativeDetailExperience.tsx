"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { formatMoney, resolveCreativeCurrency } from "@/components/creatives/money";
import { cn } from "@/lib/utils";
import {
  formatCreativeDateLabel,
  type CreativeDateRangeValue,
} from "@/components/creatives/CreativesTopSection";
import {
  getAiCreativeRuleCommentary,
  type AiCreativeDecision,
  type CreativeRuleReportPayload,
} from "@/src/services";

interface CreativeDetailExperienceProps {
  businessId: string;
  row: MetaCreativeRow | null;
  allRows: MetaCreativeRow[];
  open: boolean;
  notes: string;
  dateRange: CreativeDateRangeValue;
  defaultCurrency: string | null;
  onOpenChange: (open: boolean) => void;
  onNotesChange: (value: string) => void;
  onDateRangeChange: (next: CreativeDateRangeValue) => void;
}

type StageSource = "html" | "image";

const RANGE_PRESETS: Array<{ value: string; label: string; next: CreativeDateRangeValue }> = [
  { value: "today", label: "Today", next: { preset: "today", customStart: "", customEnd: "", lastDays: 1, sinceDate: "" } },
  { value: "last7Days", label: "Last 7 days", next: { preset: "last7Days", customStart: "", customEnd: "", lastDays: 7, sinceDate: "" } },
  { value: "last14Days", label: "Last 14 days", next: { preset: "last14Days", customStart: "", customEnd: "", lastDays: 14, sinceDate: "" } },
  { value: "last30Days", label: "Last 30 days", next: { preset: "last30Days", customStart: "", customEnd: "", lastDays: 30, sinceDate: "" } },
  { value: "thisMonth", label: "This month", next: { preset: "thisMonth", customStart: "", customEnd: "", lastDays: 30, sinceDate: "" } },
];

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
  const [source, setSource] = useState<StageSource>("html");
  const [detailPreviewHtml, setDetailPreviewHtml] = useState<string | null>(null);
  const [detailPreviewLoading, setDetailPreviewLoading] = useState(false);
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

  useEffect(() => {
    setDetailPreviewHtml(null);
    setDetailPreviewLoading(false);
    setSource("html");
    setAiInterpretationRequested(false);
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
        setDetailPreviewHtml(html);
      })
      .catch(() => {
        if (!cancelled) setDetailPreviewHtml(null);
      })
      .finally(() => {
        if (!cancelled) setDetailPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [businessId, open, row?.creativeId]);

  const currency = resolveCreativeCurrency(row?.currency ?? null, defaultCurrency);
  const imageUrl = row ? resolveDetailImageUrl(row) : null;
  const canShowHtml = Boolean(detailPreviewHtml);
  const resolvedSource: StageSource = canShowHtml && source === "html" ? "html" : "image";

  const context = useMemo(() => (row ? buildCreativeDecisionContext(row, allRows) : null), [allRows, row]);
  const report = useMemo(() => (row && context ? buildCreativeRuleReport(row, context) : null), [context, row]);
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
            <select
              value={RANGE_PRESETS.find((preset) => preset.next.preset === dateRange.preset)?.value ?? "custom"}
              onChange={(event) => {
                const next = RANGE_PRESETS.find((preset) => preset.value === event.target.value);
                if (next) onDateRangeChange(next.next);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700"
              aria-label="Date range"
            >
              {RANGE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
              <option value="custom" disabled>Custom range</option>
            </select>

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
                    <Pill value={row.creativeTypeLabel} />
                    <Pill value={row.format === "video" ? "Video" : row.format === "catalog" ? "Catalog" : "Image"} />
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

                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  <CompactMetricCell label="Decision score" value={`${decision.score}/100`} />
                  <CompactMetricCell label="Confidence" value={`${Math.round(decision.confidence * 100)}%`} />
                </div>

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
                    <h4 className="text-sm font-semibold text-slate-900">AI strategy interpretation</h4>
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
                      {commentaryQuery.data.source === "fallback" ? "Fallback" : "AI"}
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
                    Generate AI interpretation
                  </button>
                ) : commentaryQuery.isLoading || commentaryQuery.isFetching ? (
                  <p className="text-sm text-slate-600">Analyzing report...</p>
                ) : commentaryQuery.isError ? (
                  <div className="space-y-2">
                    <p className="text-sm text-rose-700">AI interpretation is temporarily unavailable.</p>
                    <button
                      type="button"
                      onClick={() => commentaryQuery.refetch()}
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Retry
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
                    <ListBlock title="Opportunities" items={commentaryQuery.data.commentary.opportunities} />
                    <ListBlock title="Risks" items={commentaryQuery.data.commentary.risks} />
                    <ListBlock title="Next actions" items={commentaryQuery.data.commentary.nextActions} ordered />
                    <button
                      type="button"
                      onClick={() => commentaryQuery.refetch()}
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Refresh interpretation
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
  return Math.round(value).toLocaleString();
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

function buildCreativeRuleReport(row: MetaCreativeRow, context: CreativeDecisionContext): CreativeRuleReportPayload {
  const lowReliability = row.spend < Math.max(1, context.spendP20) || row.purchases < 2;

  const roasRatio = context.roasAvg > 0 ? row.roas / context.roasAvg : 1;
  const cpaRatio = context.cpaAvg > 0 ? row.cpa / context.cpaAvg : 1;
  const ctrRatio = context.ctrAvg > 0 ? row.ctrAll / context.ctrAvg : 1;
  const spendReliability = context.spendTopAvg > 0 ? Math.min(1.0, row.spend / context.spendTopAvg) : 0.4;
  const purchaseRatio = context.purchasesTopAvg > 0 ? row.purchases / context.purchasesTopAvg : 0;
  const purchaseBonus = purchaseRatio >= 1 ? 3 : purchaseRatio >= 0.5 ? 1.5 : 0;
  const cvr = row.linkClicks > 0 ? (row.purchases / row.linkClicks) * 100 : 0;
  const cvrRatio = context.cvrAvg > 0 ? cvr / context.cvrAvg : 1;
  const aov = row.purchases > 0 ? row.purchaseValue / row.purchases : 0;
  const aovRatio = context.aovAvg > 0 ? aov / context.aovAvg : 1;
  const lpvToClick = row.linkClicks > 0 ? (row.landingPageViews / row.linkClicks) * 100 : 0;
  const lpvToClickRatio = context.lpvToClickAvg > 0 ? lpvToClick / context.lpvToClickAvg : 1;
  const addToCartVolumeRatio = context.addToCartTopAvg > 0 ? row.addToCart / context.addToCartTopAvg : 0;
  const initiateCheckoutVolumeRatio = context.initiateCheckoutTopAvg > 0 ? row.initiateCheckout / context.initiateCheckoutTopAvg : 0;
  const lpvToClickScore = Math.max(0, Math.min(5, 2.5 + (lpvToClickRatio - 1) * 2.5));
  const addToCartVolumeScore = Math.max(0, Math.min(5, addToCartVolumeRatio * 5));
  const initiateCheckoutVolumeScore = Math.max(0, Math.min(5, initiateCheckoutVolumeRatio * 5));
  const funnelScore = Math.max(0, Math.min(15, lpvToClickScore + addToCartVolumeScore + initiateCheckoutVolumeScore));

  const thumbstopRatio = context.hookAvg > 0 ? row.thumbstop / context.hookAvg : 1;
  const ctrSignal = Math.max(-1, Math.min(1, (ctrRatio - 1) / (ctrRatio + 1)));
  const thumbstopSignal = Math.max(-1, Math.min(1, (thumbstopRatio - 1) / (thumbstopRatio + 1)));

  const efficiencyScore = Math.max(0, Math.min(40, 25 + (roasRatio - 1) * 28 - Math.max(0, cpaRatio - 1) * 8));
  const engagementScore = ((ctrSignal + 1) / 2) * 7.5 + ((thumbstopSignal + 1) / 2) * 7.5;
  const conversionScore = Math.max(0, Math.min(15, 7 + (cvrRatio - 1) * 5 + (aovRatio - 1) * 3));
  const reliabilityScore = Math.max(0, Math.min(15, 5 + spendReliability * 7 + purchaseBonus));
  const score = Math.round(Math.max(0, Math.min(100, efficiencyScore + engagementScore + conversionScore + reliabilityScore + funnelScore)));

  let action: AiCreativeDecision["action"] = "watch";
  if (reliabilityScore < 7) action = "test_more";
  else if (reliabilityScore < 10) action = "watch";
  else if (context.roasAvg > 0 && row.roas >= context.roasAvg * 1.45 && row.spend >= Math.max(1, context.spendP50) && row.purchases >= 3) action = "scale_hard";
  else if (context.roasAvg > 0 && row.roas >= context.roasAvg * 1.2) action = "scale";
  else if (context.roasAvg > 0 && row.roas < context.roasAvg * 0.55 && row.spend >= Math.max(1, context.spendP80) && row.purchases === 0) action = "kill";
  else if (context.roasAvg > 0 && row.roas < context.roasAvg * 0.8) action = "pause";

  const confidenceBase = lowReliability ? 0.4 : row.spend >= context.spendP50 ? 0.72 : 0.58;
  const confidence = Math.max(0.3, Math.min(0.88, action === "watch" || action === "test_more" ? confidenceBase - 0.06 : confidenceBase));

  const factors: CreativeRuleReportPayload["factors"] = [
    { label: "Efficiency", impact: roasRatio >= 1.15 ? "positive" : roasRatio <= 0.85 ? "negative" : "neutral", value: `${row.roas.toFixed(2)}x vs ${context.roasAvg.toFixed(2)}x avg`, reason: roasRatio >= 1.15 ? "ROAS is meaningfully above account baseline." : roasRatio <= 0.85 ? "ROAS is below account baseline." : "ROAS is near account baseline." },
    { label: "Cost control", impact: cpaRatio <= 0.9 ? "positive" : cpaRatio >= 1.15 ? "negative" : "neutral", value: `${row.cpa.toFixed(2)} vs ${context.cpaAvg.toFixed(2)} avg`, reason: cpaRatio <= 0.9 ? "CPA is healthier than baseline." : cpaRatio >= 1.15 ? "CPA is materially higher than baseline." : "CPA is close to baseline." },
    { label: "Signal depth", impact: lowReliability ? "negative" : row.purchases >= 3 ? "positive" : "neutral", value: `${row.purchases.toLocaleString()} purchases, ${row.spend.toFixed(2)} spend`, reason: lowReliability ? "Data volume is still limited for a high-conviction decision." : "Spend and conversion depth are sufficient for decisioning." },
    { label: "Engagement", impact: ctrRatio >= 1.1 ? "positive" : ctrRatio <= 0.85 ? "negative" : "neutral", value: `CTR ${row.ctrAll.toFixed(2)}% vs ${context.ctrAvg.toFixed(2)}% avg`, reason: ctrRatio >= 1.1 ? "Click intent is stronger than account average." : ctrRatio <= 0.85 ? "Click intent is weaker than account average." : "Click intent is near account average." },
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
    score,
    confidence,
    summary,
    accountContext: {
      roasAvg: Number(context.roasAvg.toFixed(4)),
      cpaAvg: Number(context.cpaAvg.toFixed(4)),
      ctrAvg: Number(context.ctrAvg.toFixed(4)),
      spendMedian: Number(context.spendMedian.toFixed(4)),
      spendP20: Number(context.spendP20.toFixed(4)),
      spendP80: Number(context.spendP80.toFixed(4)),
    },
    factors,
  };
}

function buildScoreBreakdown(row: MetaCreativeRow, context: CreativeDecisionContext): ScoreBreakdownItem[] {
  const roasRatio = context.roasAvg > 0 ? row.roas / context.roasAvg : 1;
  const cpaRatio = context.cpaAvg > 0 ? row.cpa / context.cpaAvg : 1;
  const ctrRatio = context.ctrAvg > 0 ? row.ctrAll / context.ctrAvg : 1;
  const spendReliability = context.spendTopAvg > 0 ? Math.min(1.0, row.spend / context.spendTopAvg) : 0.4;
  const purchaseRatio = context.purchasesTopAvg > 0 ? row.purchases / context.purchasesTopAvg : 0;
  const purchaseBonus = purchaseRatio >= 1 ? 3 : purchaseRatio >= 0.5 ? 1.5 : 0;
  const cvr = row.linkClicks > 0 ? (row.purchases / row.linkClicks) * 100 : 0;
  const cvrRatio = context.cvrAvg > 0 ? cvr / context.cvrAvg : 1;
  const aov = row.purchases > 0 ? row.purchaseValue / row.purchases : 0;
  const aovRatio = context.aovAvg > 0 ? aov / context.aovAvg : 1;
  const lpvToClick = row.linkClicks > 0 ? (row.landingPageViews / row.linkClicks) * 100 : 0;
  const lpvToClickRatio = context.lpvToClickAvg > 0 ? lpvToClick / context.lpvToClickAvg : 1;
  const addToCartVolumeRatio = context.addToCartTopAvg > 0 ? row.addToCart / context.addToCartTopAvg : 0;
  const initiateCheckoutVolumeRatio = context.initiateCheckoutTopAvg > 0 ? row.initiateCheckout / context.initiateCheckoutTopAvg : 0;
  const lpvToClickScore = Math.max(0, Math.min(5, 2.5 + (lpvToClickRatio - 1) * 2.5));
  const addToCartVolumeScore = Math.max(0, Math.min(5, addToCartVolumeRatio * 5));
  const initiateCheckoutVolumeScore = Math.max(0, Math.min(5, initiateCheckoutVolumeRatio * 5));
  const funnelScore = Math.max(0, Math.min(15, lpvToClickScore + addToCartVolumeScore + initiateCheckoutVolumeScore));

  const thumbstopRatio = context.hookAvg > 0 ? row.thumbstop / context.hookAvg : 1;
  const ctrSignal = Math.max(-1, Math.min(1, (ctrRatio - 1) / (ctrRatio + 1)));
  const thumbstopSignal = Math.max(-1, Math.min(1, (thumbstopRatio - 1) / (thumbstopRatio + 1)));

  const efficiencyScore = Math.max(0, Math.min(40, 25 + (roasRatio - 1) * 28 - Math.max(0, cpaRatio - 1) * 8));
  const engagementScore = ((ctrSignal + 1) / 2) * 7.5 + ((thumbstopSignal + 1) / 2) * 7.5;
  const conversionScore = Math.max(0, Math.min(15, 7 + (cvrRatio - 1) * 5 + (aovRatio - 1) * 3));
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
      label: "Conversion depth",
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
      detail: `LPV/Click ${lpvToClick.toFixed(2)}% vs avg ${context.lpvToClickAvg.toFixed(2)}%, ATC ${formatInteger(row.addToCart)} vs top-25% avg ${context.addToCartTopAvg.toFixed(1)}, IC ${formatInteger(row.initiateCheckout)} vs top-25% avg ${context.initiateCheckoutTopAvg.toFixed(1)}.`,
    },
  ];
}

function buildDecisionFromRuleReport(report: CreativeRuleReportPayload): AiCreativeDecision {
  return {
    creativeId: report.creativeId,
    action: report.action,
    score: report.score,
    confidence: report.confidence,
    scoringFactors: report.factors.map((factor) => `${factor.label}: ${factor.value}`),
    reasons: report.factors.map((factor) => `${factor.label}: ${factor.reason}`).slice(0, 3),
    nextStep: report.summary,
  };
}

function resolveDetailImageUrl(row: MetaCreativeRow): string | null {
  const candidates = [
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
