"use client";

/**
 * components/meta/meta-campaign-list.tsx
 *
 * Left panel: compact vertical campaign list.
 * Click → right panel updates with campaign detail.
 */

import { cn } from "@/lib/utils";
import type { MetaCampaignTableRow } from "@/components/meta/meta-campaign-table";
import { usePreferencesStore } from "@/store/preferences-store";
import { useCurrencySymbol } from "@/hooks/use-currency";

function fmtSpend(n: number, sym: string): string {
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${sym}${(n / 1_000).toFixed(1)}k`;
  return `${sym}${n.toFixed(0)}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function roasColor(roas: number) {
  if (roas > 2.5) return "text-emerald-600";
  if (roas >= 1.5) return "text-amber-500";
  return "text-red-500";
}

function statusDot(status: string) {
  const lower = status.toLowerCase();
  if (lower === "active")
    return <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />;
  if (lower === "paused")
    return <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />;
  return <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />;
}

function laneDot(lane: MetaCampaignTableRow["laneLabel"]) {
  if (lane === "Scaling")
    return (
      <span className="shrink-0 rounded-sm bg-blue-500/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-blue-700">
        S
      </span>
    );
  if (lane === "Validation")
    return (
      <span className="shrink-0 rounded-sm bg-slate-400/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-600">
        V
      </span>
    );
  if (lane === "Test")
    return (
      <span className="shrink-0 rounded-sm bg-amber-500/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-700">
        T
      </span>
    );
  return null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MetaCampaignListProps {
  campaigns: MetaCampaignTableRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Map of campaign ID → decision state for campaigns with AI recommendations */
  campaignRecStates: Map<string, "act" | "test" | "watch">;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MetaCampaignList({
  campaigns,
  selectedId,
  onSelect,
  campaignRecStates,
}: MetaCampaignListProps) {
  const language = usePreferencesStore((s) => s.language);
  const sym = useCurrencySymbol();

  if (campaigns.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        {language === "tr"
          ? "Kampanya bulunamadı."
          : "No campaigns found."}
      </p>
    );
  }

  return (
    <div className="space-y-px">
      {campaigns.map((c) => {
        const isSelected = c.id === selectedId;
        const recState = campaignRecStates.get(c.id);

        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              "group flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
              isSelected
                ? "bg-foreground/[0.06] ring-1 ring-foreground/10"
                : "hover:bg-muted/60"
            )}
          >
            {/* Status dot */}
            {statusDot(c.status)}

            {/* Name + lane */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p
                  className={cn(
                    "truncate text-[12px] font-medium leading-snug",
                    isSelected ? "text-foreground" : "text-slate-700"
                  )}
                >
                  {c.name}
                </p>
                {recState && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide",
                      recState === "act"
                        ? "bg-foreground text-background"
                        : recState === "test"
                        ? "bg-violet-500/10 text-violet-700"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {recState}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                {laneDot(c.laneLabel ?? null)}
                <span className="text-[10px] text-muted-foreground">
                  {c.objective ?? "—"}
                </span>
              </div>
            </div>

            {/* ROAS + Spend */}
            <div className="shrink-0 text-right">
              <span
                className={cn(
                  "font-mono text-[12px] font-bold tabular-nums",
                  roasColor(c.roas)
                )}
              >
                {c.roas.toFixed(2)}
                <span className="text-[10px] font-normal opacity-60">×</span>
              </span>
              <p className="text-[10px] tabular-nums text-slate-400">
                {fmtSpend(c.spend, sym)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
