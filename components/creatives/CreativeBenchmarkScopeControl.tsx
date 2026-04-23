"use client";

import { cn } from "@/lib/utils";
import type {
  CreativeBenchmarkCampaignContext,
  CreativeBenchmarkScopeMode,
} from "@/components/creatives/creatives-top-section-support";

export function CreativeBenchmarkScopeControl({
  value,
  campaignContext,
  onChange,
  className,
}: {
  value: CreativeBenchmarkScopeMode;
  campaignContext: CreativeBenchmarkCampaignContext | null;
  onChange: (next: CreativeBenchmarkScopeMode) => void;
  className?: string;
}) {
  const activeLabel =
    value === "campaign" && campaignContext
      ? campaignContext.campaignName
      : "Account-wide";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1.5",
        className,
      )}
      data-testid="creative-benchmark-scope-control"
    >
      <span className="pl-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
        Benchmark
      </span>
      <div className="inline-flex items-center rounded-full bg-slate-100 p-0.5">
        <button
          type="button"
          aria-pressed={value === "account"}
          data-testid="creative-benchmark-scope-account"
          onClick={() => onChange("account")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === "account"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          Account-wide
        </button>
        {campaignContext ? (
          <button
            type="button"
            aria-pressed={value === "campaign"}
            data-testid="creative-benchmark-scope-campaign"
            onClick={() => onChange("campaign")}
            title={campaignContext.campaignName}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              value === "campaign"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Within campaign
          </button>
        ) : null}
      </div>
      <span
        className="inline-flex max-w-[180px] items-center truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700"
        data-testid="creative-benchmark-scope-active"
        title={activeLabel}
      >
        {activeLabel}
      </span>
    </div>
  );
}
