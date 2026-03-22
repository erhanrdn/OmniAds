"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getLandingPageAiCommentary } from "@/src/services";
import type { LandingPagePerformanceRow } from "@/src/types/landing-pages";
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  toAiReport,
} from "@/components/landing-pages/support";

interface LandingPageDetailDrawerProps {
  businessId: string;
  row: LandingPagePerformanceRow | null;
  open: boolean;
  currency: string | null;
  onOpenChange: (open: boolean) => void;
}

const STEP_ROWS: Array<{
  key: keyof LandingPagePerformanceRow;
  label: string;
  rateKey?: keyof LandingPagePerformanceRow;
}> = [
  { key: "sessions", label: "Sessions" },
  { key: "viewItem", label: "View item", rateKey: "sessionToViewItemRate" },
  { key: "addToCarts", label: "Add to cart", rateKey: "viewItemToCartRate" },
  { key: "checkouts", label: "Begin checkout", rateKey: "cartToCheckoutRate" },
  { key: "addShippingInfo", label: "Add shipping info", rateKey: "checkoutToShippingRate" },
  { key: "addPaymentInfo", label: "Add payment info", rateKey: "shippingToPaymentRate" },
  { key: "purchases", label: "Purchase", rateKey: "paymentToPurchaseRate" },
];

export function LandingPageDetailDrawer({
  businessId,
  row,
  open,
  currency,
  onOpenChange,
}: LandingPageDetailDrawerProps) {
  const aiReport = row ? toAiReport(row) : null;
  const commentaryQuery = useQuery({
    queryKey: ["landing-page-ai-commentary", businessId, aiReport?.path ?? "", aiReport?.sessions ?? 0, aiReport?.purchases ?? 0],
    enabled: open && Boolean(aiReport),
    queryFn: () => {
      if (!aiReport) throw new Error("Missing landing page AI report.");
      return getLandingPageAiCommentary(businessId, aiReport);
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-[760px] overflow-y-auto border-l border-slate-200 bg-[#f7fafc] p-0 sm:max-w-[760px]">
        {row ? (
          <>
            <SheetHeader className="border-b border-slate-200 bg-white px-6 py-5">
              <SheetTitle className="text-xl text-slate-900">{row.title}</SheetTitle>
              <SheetDescription className="font-mono text-xs text-slate-500">
                {row.path}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-6">
              <section className="grid gap-3 md:grid-cols-2">
                <MetricCard label="Sessions" value={formatInteger(row.sessions)} />
                <MetricCard label="Revenue" value={formatCurrency(row.totalRevenue, currency)} />
                <MetricCard label="Engagement" value={formatPercent(row.engagementRate)} />
                <MetricCard label="Avg Order Value" value={formatCurrency(row.averagePurchaseRevenue, currency)} />
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Funnel Breakdown
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Step-by-step customer progression from entry to purchase.
                  </p>
                </div>

                <div className="space-y-3">
                  {STEP_ROWS.map((step) => {
                    const value = row[step.key];
                    const rate = step.rateKey ? row[step.rateKey] : null;
                    return (
                      <div key={step.label} className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                            <p className="text-xs text-slate-500">
                              {step.rateKey ? `Progression ${formatPercent(Number(rate ?? 0))}` : "Top of funnel"}
                            </p>
                          </div>
                          <p className="text-lg font-semibold text-slate-900">
                            {typeof value === "number" ? formatInteger(value) : "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-600" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                      AI Analysis
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Weak spots, opportunities, and execution risks for this landing page.
                    </p>
                  </div>
                </div>

                {commentaryQuery.isLoading ? (
                  <div className="space-y-2">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                    <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                    <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
                  </div>
                ) : commentaryQuery.isError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    AI analysis could not be loaded for this page.
                  </div>
                ) : commentaryQuery.data ? (
                  <div className="space-y-4">
                    <p className="text-sm leading-6 text-slate-700">
                      {commentaryQuery.data.commentary.summary}
                    </p>

                    {commentaryQuery.data.warning ? (
                      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{commentaryQuery.data.warning}</span>
                      </div>
                    ) : null}

                    <AiList title="Insights" items={commentaryQuery.data.commentary.insights} />
                    <AiList title="Recommendations" items={commentaryQuery.data.commentary.recommendations} />
                    <AiList title="Risks" items={commentaryQuery.data.commentary.risks} />
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function AiList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={`${title}-${item}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
