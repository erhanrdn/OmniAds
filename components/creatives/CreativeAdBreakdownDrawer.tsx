"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, resolveCreativeCurrency } from "@/components/creatives/money";
import { MetaCreativeRow } from "@/components/creatives/metricConfig";

type CreativeAdBreakdownDrawerProps = {
  open: boolean;
  creative: MetaCreativeRow | null;
  rows: MetaCreativeRow[];
  loading?: boolean;
  defaultCurrency: string | null;
  onOpenChange: (open: boolean) => void;
};

function fmtPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function fmtDecimal(value: number): string {
  return value.toFixed(2);
}

export function CreativeAdBreakdownDrawer({
  open,
  creative,
  rows,
  loading = false,
  defaultCurrency,
  onOpenChange,
}: CreativeAdBreakdownDrawerProps) {
  const [width, setWidth] = useState(760);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseMove = (event: MouseEvent) => {
      const active = resizeStateRef.current;
      if (!active) return;
      const delta = active.startX - event.clientX;
      const viewportMax = typeof window !== "undefined" ? Math.max(640, window.innerWidth - 180) : 1280;
      const next = Math.max(560, Math.min(viewportMax, active.startWidth + delta));
      setWidth(next);
    };
    const onMouseUp = () => {
      resizeStateRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.spend - a.spend),
    [rows]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/25" onClick={() => onOpenChange(false)} />
      <aside
        className="absolute right-0 top-0 h-full border-l bg-background shadow-xl"
        style={{ width }}
      >
        <button
          type="button"
          aria-label="Resize drawer"
          className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/20"
          onMouseDown={(event) => {
            event.preventDefault();
            resizeStateRef.current = { startX: event.clientX, startWidth: width };
          }}
        />

        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between border-b px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Ad breakdown</p>
              <h3 className="truncate text-sm font-semibold">{creative?.name ?? "Creative"}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {creative?.associatedAdsCount ?? rows.length} ads using this creative
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label="Close breakdown drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 overflow-auto">
            <table className="min-w-[1460px] border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  {[
                    "Ad Name",
                    "Campaign Name",
                    "Ad Set Name",
                    "Launch Date",
                    "Spend",
                    "Purchase value",
                    "ROAS",
                    "Cost per purchase",
                    "Cost per link click",
                    "Cost per mille",
                    "Cost per click (all)",
                    "Average order value",
                    "Click to add-to-cart ratio",
                    "Add-to-cart to purchase ratio",
                    "Purchases",
                    "First frame retention",
                    "Thumbstop ratio",
                    "Click through rate (outbound)",
                    "Click to purchase ratio",
                    "Click through rate (all)",
                    "25% video plays (rate)",
                    "50% video plays (rate)",
                    "75% video plays (rate)",
                    "100% video plays (rate)",
                    "Hold rate",
                  ].map((label) => (
                    <th key={label} className="border-b px-2.5 py-2 text-left font-medium text-muted-foreground">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!loading && sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={25} className="px-3 py-6 text-center text-muted-foreground">
                      No ad-level rows found for this creative.
                    </td>
                  </tr>
                ) : null}
                {loading ? (
                  <tr>
                    <td colSpan={25} className="px-3 py-6 text-center text-muted-foreground">
                      Loading ad breakdown...
                    </td>
                  </tr>
                ) : null}
                {!loading &&
                  sortedRows.map((row) => {
                    const currency = resolveCreativeCurrency(row.currency, defaultCurrency);
                    const aov = row.purchases > 0 ? row.purchaseValue / row.purchases : 0;
                    return (
                      <tr key={row.id} className="hover:bg-muted/30">
                        <td className={cellTextClass}>{row.name}</td>
                        <td className={cellTextClass}>{row.campaignName ?? "-"}</td>
                        <td className={cellTextClass}>{row.adSetName ?? "-"}</td>
                        <td className={cellTextClass}>{row.launchDate || "-"}</td>
                        <td className={cellNumClass}>{formatMoney(row.spend, currency, defaultCurrency)}</td>
                        <td className={cellNumClass}>{formatMoney(row.purchaseValue, currency, defaultCurrency)}</td>
                        <td className={cellNumClass}>{fmtDecimal(row.roas)}</td>
                        <td className={cellNumClass}>{formatMoney(row.cpa, currency, defaultCurrency)}</td>
                        <td className={cellNumClass}>{formatMoney(row.cpcLink, currency, defaultCurrency)}</td>
                        <td className={cellNumClass}>{formatMoney(row.cpm, currency, defaultCurrency)}</td>
                        <td className={cellNumClass}>{formatMoney(row.cpcLink, currency, defaultCurrency)}</td>
                        <td className={cellNumClass}>{formatMoney(aov, currency, defaultCurrency)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.clickToPurchase)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.atcToPurchaseRatio)}</td>
                        <td className={cellNumClass}>{Math.round(row.purchases).toLocaleString()}</td>
                        <td className={cellNumClass}>{fmtPercent(row.thumbstop)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.thumbstop)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.ctrAll)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.clickToPurchase)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.ctrAll)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.video25)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.video50)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.video75)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.video100)}</td>
                        <td className={cellNumClass}>{fmtPercent(row.video100)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </aside>
    </div>
  );
}

const cellTextClass = cn("border-b px-2.5 py-2 font-medium text-foreground whitespace-nowrap");
const cellNumClass = cn("border-b px-2.5 py-2 text-right font-medium tabular-nums whitespace-nowrap");
