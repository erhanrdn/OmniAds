"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CreativeQuickFilter,
  CreativeQuickFilterKey,
} from "@/lib/creative-operator-surface";
import type { CreativeDecisionOsV1Response } from "@/lib/creative-decision-os";
import { CreativeDecisionOsOverview } from "@/components/creatives/CreativeDecisionOsOverview";

const CREATIVE_DECISION_OS_DRAWER_STORAGE_KEY = "creative-decision-os-drawer-width-v1";
export const CREATIVE_DECISION_OS_DRAWER_DEFAULT_WIDTH = 1240;
export const CREATIVE_DECISION_OS_DRAWER_MIN_WIDTH = 920;

export function clampCreativeDecisionOsDrawerWidth(width: number, viewportWidth: number) {
  const safeViewport = Math.max(360, viewportWidth);
  const maxWidth = Math.max(360, safeViewport - 48);
  const minWidth = Math.min(CREATIVE_DECISION_OS_DRAWER_MIN_WIDTH, maxWidth);
  return Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
}

type CreativeDecisionOsDrawerProps = {
  decisionOs: CreativeDecisionOsV1Response | null;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quickFilters: CreativeQuickFilter[];
  activeFamilyId: string | null;
  activeQuickFilterKey: CreativeQuickFilterKey | null;
  onSelectFamily: (familyId: string | null) => void;
  onSelectQuickFilter: (key: CreativeQuickFilterKey) => void;
  onClearFilters: () => void;
};

export function CreativeDecisionOsDrawer({
  decisionOs,
  isLoading,
  open,
  onOpenChange,
  quickFilters,
  activeFamilyId,
  activeQuickFilterKey,
  onSelectFamily,
  onSelectQuickFilter,
  onClearFilters,
}: CreativeDecisionOsDrawerProps) {
  const [width, setWidth] = useState(CREATIVE_DECISION_OS_DRAWER_DEFAULT_WIDTH);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    document.body.style.overflow = "hidden";
    const raw = window.localStorage.getItem(CREATIVE_DECISION_OS_DRAWER_STORAGE_KEY);
    const storedWidth = raw ? Number(raw) : CREATIVE_DECISION_OS_DRAWER_DEFAULT_WIDTH;
    setWidth(
      clampCreativeDecisionOsDrawerWidth(
        Number.isFinite(storedWidth) ? storedWidth : CREATIVE_DECISION_OS_DRAWER_DEFAULT_WIDTH,
        window.innerWidth,
      ),
    );
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const handleMouseMove = (event: MouseEvent) => {
      const active = resizeStateRef.current;
      if (!active) return;
      const delta = active.startX - event.clientX;
      setWidth(clampCreativeDecisionOsDrawerWidth(active.startWidth + delta, window.innerWidth));
    };
    const handleMouseUp = () => {
      resizeStateRef.current = null;
    };
    const handleResize = () => {
      setWidth((current) => clampCreativeDecisionOsDrawerWidth(current, window.innerWidth));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CREATIVE_DECISION_OS_DRAWER_STORAGE_KEY, String(width));
    } catch {
      // ignore persistence failures
    }
  }, [open, width]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[88]" data-testid="creative-decision-os-drawer">
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />

      <aside
        className="absolute right-0 top-0 flex h-full flex-col border-l border-slate-200 bg-[#f7f9fc] shadow-2xl"
        style={{ width }}
      >
        <button
          type="button"
          aria-label="Resize Creative Decision OS drawer"
          data-testid="creative-decision-os-drawer-resize"
          className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-sky-200/70"
          onMouseDown={(event) => {
            event.preventDefault();
            resizeStateRef.current = { startX: event.clientX, startWidth: width };
          }}
        />

        <header className="border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Operator Review
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Creative Operator Console</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                {decisionOs?.summary.message ?? "Loading the live decision surface for the current creative window."}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Decisions use live windows. Selected period affects analysis only.
              </p>
              {decisionOs ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Decision as of {decisionOs.decisionAsOf} · primary window {decisionOs.decisionWindows.primary30d.startDate} to {decisionOs.decisionWindows.primary30d.endDate}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {decisionOs?.summary.operatingMode ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700">
                  Operating Mode <span className="font-semibold text-slate-950">{decisionOs.summary.operatingMode}</span>
                </span>
              ) : null}
              <button
                type="button"
                data-testid="creative-decision-os-drawer-reset-width"
                onClick={() => {
                  if (typeof window === "undefined") {
                    setWidth(CREATIVE_DECISION_OS_DRAWER_DEFAULT_WIDTH);
                    return;
                  }
                  setWidth(
                    clampCreativeDecisionOsDrawerWidth(
                      CREATIVE_DECISION_OS_DRAWER_DEFAULT_WIDTH,
                      window.innerWidth,
                    ),
                  );
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset width
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                aria-label="Close Creative Decision OS"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className={cn("flex-1 overflow-y-auto px-5 py-5 md:px-6")}>
          <CreativeDecisionOsOverview
            decisionOs={decisionOs}
            quickFilters={quickFilters}
            isLoading={isLoading}
            activeFamilyId={activeFamilyId}
            activeQuickFilterKey={activeQuickFilterKey}
            onSelectFamily={onSelectFamily}
            onSelectQuickFilter={onSelectQuickFilter}
            onClearFilters={onClearFilters}
            showHeader={false}
            className="border-0 bg-transparent p-0 shadow-none"
          />
        </div>
      </aside>
    </div>
  );
}
