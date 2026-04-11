"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { fetchBusinessOperatingMode, getOperatingModeTone } from "@/lib/business-operating-mode-client";

export function CreativeCommercialContextCard({
  businessId,
  startDate,
  endDate,
}: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const query = useQuery({
    queryKey: ["business-operating-mode", businessId, startDate, endDate],
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchBusinessOperatingMode({ businessId, startDate, endDate }),
  });

  if (query.isLoading) {
    return (
      <section
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
        data-testid="creative-detail-commercial-context"
      >
        <p className="text-sm text-slate-500">Loading commercial context...</p>
      </section>
    );
  }

  if (query.isError || !query.data) {
    return (
      <section
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
        data-testid="creative-detail-commercial-context"
      >
        <p className="text-sm text-slate-500">
          Commercial context is unavailable for the live decision windows.
        </p>
      </section>
    );
  }

  const tone = getOperatingModeTone(query.data.recommendedMode);

  return (
    <section
      className={cn(
        "rounded-2xl border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]",
        tone.panel,
      )}
      data-testid="creative-detail-commercial-context"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Commercial Context
          </p>
          <h4 className="mt-1 text-sm font-semibold text-slate-950">
            {query.data.recommendedMode}
          </h4>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
            tone.badge,
          )}
        >
          Operating Mode
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-700">
        {query.data.why[0] ??
          "Decisions use live windows. Selected period affects analysis only."}
      </p>
      <p className="mt-2 text-[11px] text-slate-500">
        Decisions use live windows. Selected period affects analysis only.
      </p>
      <p className="mt-2 text-[11px] text-slate-500">
        Decision as of {query.data.decisionAsOf} · primary window {query.data.decisionWindows.primary30d.startDate} to {query.data.decisionWindows.primary30d.endDate}
      </p>
      {query.data.activeCommercialInputs.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {query.data.activeCommercialInputs.slice(0, 3).map((row) => (
            <div
              key={`${row.label}-${row.detail}`}
              className="rounded-xl border border-slate-200 bg-white/85 px-3 py-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {row.label}
              </p>
              <p className="mt-1 text-sm text-slate-800">{row.detail}</p>
            </div>
          ))}
        </div>
      ) : null}
      {query.data.guardrails[0] ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white/85 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Guardrail
          </p>
          <p className="mt-1 text-sm text-slate-800">{query.data.guardrails[0]}</p>
        </div>
      ) : null}
      {query.data.missingInputs.length > 0 ? (
        <p className="mt-3 text-xs text-amber-800">
          Missing inputs: {query.data.missingInputs.join(" ")}
        </p>
      ) : null}
    </section>
  );
}
