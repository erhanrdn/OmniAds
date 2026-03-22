"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  buildLandingPageRuleReport,
  formatLandingPageActionLabel,
  formatLandingPageArchetypeLabel,
} from "@/lib/landing-pages/rule-engine";
import { getLandingPageAiCommentary } from "@/src/services";
import type { LandingPagePerformanceRow } from "@/src/types/landing-pages";
import {
  getDropOffLabel,
  resolveLandingPageAbsoluteUrl,
  toAiReport,
} from "@/components/landing-pages/support";

interface LandingPageDetailDrawerProps {
  businessId: string;
  row: LandingPagePerformanceRow | null;
  open: boolean;
  currency: string | null;
  siteBaseUrl: string | null;
  onOpenChange: (open: boolean) => void;
}

export function LandingPageDetailDrawer({
  businessId,
  row,
  open,
  currency,
  siteBaseUrl,
  onOpenChange,
}: LandingPageDetailDrawerProps) {
  const [aiAnalysisRequested, setAiAnalysisRequested] = useState(false);
  const aiReport = row
    ? {
        ...toAiReport(row),
        url: resolveLandingPageAbsoluteUrl(row.path, siteBaseUrl),
      }
    : null;
  const ruleReport = row ? buildLandingPageRuleReport(row) : null;

  useEffect(() => {
    if (!open) {
      setAiAnalysisRequested(false);
      return;
    }
    setAiAnalysisRequested(false);
  }, [open, row?.path]);

  const commentaryQuery = useQuery({
    queryKey: ["landing-page-ai-commentary", businessId, aiReport?.path ?? "", aiReport?.sessions ?? 0, aiReport?.purchases ?? 0],
    enabled: false,
    queryFn: () => {
      if (!aiReport || !ruleReport) throw new Error("Missing landing page AI report.");
      return getLandingPageAiCommentary(businessId, aiReport, ruleReport);
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[1140px] overflow-y-auto border-l border-slate-200 bg-[#f7fafc] p-0 sm:max-w-[1140px]">
        {row ? (
          <>
            <SheetHeader className="border-b border-slate-200 bg-white px-6 py-5">
              <SheetTitle className="text-xl text-slate-900">{row.title}</SheetTitle>
              <SheetDescription className="font-mono text-xs text-slate-500">
                {row.path}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-6">
              {ruleReport ? (
                <section className={`rounded-3xl border p-4 shadow-sm ${getDecisionTheme(ruleReport.action)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        AI Insight
                      </p>
                      <h3 className="mt-1 text-[17px] font-semibold text-slate-950">
                        {ruleHeadline(ruleReport.action)}
                      </h3>
                    </div>
                    <DecisionBadge action={ruleReport.action} />
                  </div>

                  <p className="mt-2.5 text-sm leading-6 text-slate-700">{ruleReport.summary}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                    <CompactMetricCell label="Decision score" value={`${ruleReport.score}/100`} />
                    <CompactMetricCell
                      label="Confidence"
                      value={`${Math.round(ruleReport.confidence * 100)}%`}
                    />
                    <CompactMetricCell
                      label="Page type"
                      value={formatLandingPageArchetypeLabel(ruleReport.archetype)}
                    />
                    <CompactMetricCell
                      label="Primary leak"
                      value={getDropOffLabel(ruleReport.primaryLeak)}
                    />
                  </div>

                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    <ListBlock title="Strengths" items={ruleReport.strengths} emptyText="No strong advantages stand out yet." />
                    <ListBlock title="Issues" items={ruleReport.issues} emptyText="No single issue dominates this page right now." />
                  </div>

                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    <ListBlock title="Priority actions" items={ruleReport.actions} ordered />
                    <ListBlock title="Risks" items={ruleReport.risks} emptyText="No unusual risks surfaced beyond normal optimization variance." />
                  </div>

                  <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                    <ScorePill
                      label="Traffic quality"
                      value={ruleReport.scoreBreakdown.trafficQuality}
                      description="Measures engagement depth and browsing quality."
                    />
                    <ScorePill
                      label="Discovery"
                      value={ruleReport.scoreBreakdown.discovery}
                      description="Shows how well sessions move into product exploration."
                    />
                    <ScorePill
                      label="Intent"
                      value={ruleReport.scoreBreakdown.intent}
                      description="Shows whether product views turn into add-to-cart intent."
                    />
                    <ScorePill
                      label="Checkout"
                      value={ruleReport.scoreBreakdown.checkout}
                      description="Captures momentum from cart into completed checkout."
                    />
                    <ScorePill
                      label="Revenue efficiency"
                      value={ruleReport.scoreBreakdown.revenueEfficiency}
                      description="Combines purchase efficiency with order value quality."
                    />
                  </div>
                </section>
              ) : null}

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-600" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                      UX Audit
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      UX findings, friction points, and improvement opportunities for this landing page.
                    </p>
                  </div>
                </div>

                {!aiAnalysisRequested ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                      Run AI when you want a focused UX audit for this landing page.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setAiAnalysisRequested(true);
                        commentaryQuery.refetch();
                      }}
                      className="border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800"
                    >
                      Run UX audit
                    </Button>
                  </div>
                ) : commentaryQuery.isLoading || commentaryQuery.isFetching ? (
                  <div className="space-y-2">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                    <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
                  </div>
                ) : commentaryQuery.isError ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      UX audit could not be loaded for this page.
                    </div>
                    <Button type="button" variant="outline" onClick={() => commentaryQuery.refetch()}>
                      Retry UX audit
                    </Button>
                  </div>
                ) : commentaryQuery.data ? (
                  <div className="space-y-4">
                    <p className="text-sm leading-6 text-slate-700">
                      {commentaryQuery.data.commentary.summary}
                    </p>

                    <AiList title="Critical findings" items={commentaryQuery.data.commentary.insights} />
                    <AiList title="Quick wins" items={commentaryQuery.data.commentary.recommendations} />
                    <AiList title="UX risks" items={commentaryQuery.data.commentary.risks} />
                    <Button type="button" variant="outline" onClick={() => commentaryQuery.refetch()}>
                      Re-run UX audit
                    </Button>
                  </div>
                ) : null}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ListBlock({
  title,
  items,
  ordered = false,
  emptyText,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
  emptyText?: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-2 text-sm text-slate-700">
          {items.map((item, index) => (
            <li
              key={`${title}-${item}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5"
            >
              {ordered ? `${index + 1}. ` : ""}{item}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
          {emptyText ?? "No items."}
        </div>
      )}
    </div>
  );
}

function AiList({ title, items }: { title: string; items: string[] }) {
  return <ListBlock title={title} items={items} />;
}

function CompactMetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/85 px-3 py-1.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ScorePill({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  const rounded = Math.round(value);
  const tone = scoreTone(rounded);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{tone.label}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-950">{rounded}</p>
          <p className="text-[11px] text-slate-500">out of 100</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${tone.barClass}`}
          style={{ width: `${rounded}%` }}
        />
      </div>
      <p className="mt-2.5 text-sm leading-5 text-slate-600">{description}</p>
    </div>
  );
}

function DecisionBadge({ action }: { action: ReturnType<typeof buildLandingPageRuleReport>["action"] }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${getDecisionBadgeClass(action)}`}
    >
      {formatLandingPageActionLabel(action)}
    </span>
  );
}

function ruleHeadline(action: ReturnType<typeof buildLandingPageRuleReport>["action"]): string {
  if (action === "scale") return "Ready for controlled scale";
  if (action === "fix_above_fold") return "Improve the first screen experience";
  if (action === "fix_product_discovery") return "Discovery is the main bottleneck";
  if (action === "fix_product_story") return "Product story needs stronger buying intent";
  if (action === "fix_checkout_intent") return "Cart-to-checkout momentum needs work";
  if (action === "fix_late_checkout") return "Late checkout friction is suppressing conversions";
  if (action === "tracking_audit") return "Validate analytics before deeper CRO changes";
  return "Monitor this page before broader changes";
}

function getDecisionTheme(action: ReturnType<typeof buildLandingPageRuleReport>["action"]): string {
  if (action === "scale") return "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.95)_0%,rgba(255,255,255,0.98)_100%)]";
  if (action === "tracking_audit") return "border-amber-300 bg-[linear-gradient(180deg,rgba(255,251,235,0.96)_0%,rgba(255,255,255,0.98)_100%)]";
  if (action === "watch") return "border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,0.98)_100%)]";
  return "border-orange-200 bg-[linear-gradient(180deg,rgba(255,247,237,0.96)_0%,rgba(255,255,255,0.98)_100%)]";
}

function getDecisionBadgeClass(action: ReturnType<typeof buildLandingPageRuleReport>["action"]): string {
  if (action === "scale") return "bg-emerald-600 text-white";
  if (action === "tracking_audit") return "bg-amber-500 text-white";
  if (action === "watch") return "bg-slate-700 text-white";
  return "bg-orange-500 text-white";
}

function scoreTone(value: number): { label: string; barClass: string } {
  if (value >= 80) return { label: "Strong", barClass: "bg-emerald-500" };
  if (value >= 60) return { label: "Healthy", barClass: "bg-sky-500" };
  if (value >= 40) return { label: "Mixed", barClass: "bg-amber-500" };
  return { label: "Weak", barClass: "bg-orange-500" };
}
