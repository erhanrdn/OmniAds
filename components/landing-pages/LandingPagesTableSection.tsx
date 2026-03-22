"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingPagePerformanceRow } from "@/src/types/landing-pages";
import {
  type LandingPageSortState,
  type LandingPageSortableMetric,
  formatCurrency,
  formatInteger,
  formatPercent,
  getDropOffLabel,
} from "@/components/landing-pages/support";

interface LandingPagesTableSectionProps {
  rows: LandingPagePerformanceRow[];
  currency: string | null;
  sort: LandingPageSortState;
  onSortChange: (next: LandingPageSortState) => void;
  onRowClick: (row: LandingPagePerformanceRow) => void;
  selectedPath?: string | null;
}

const COLUMNS: Array<{
  key: LandingPageSortableMetric;
  label: string;
  render: (row: LandingPagePerformanceRow, currency: string | null) => string;
}> = [
  { key: "sessions", label: "Sessions", render: (row) => formatInteger(row.sessions) },
  { key: "engagementRate", label: "Engagement", render: (row) => formatPercent(row.engagementRate) },
  { key: "scrollRate", label: "Scroll", render: (row) => formatPercent(row.scrollRate) },
  { key: "viewItem", label: "View Item", render: (row) => formatInteger(row.viewItem) },
  { key: "addToCarts", label: "Add to Cart", render: (row) => formatInteger(row.addToCarts) },
  { key: "checkouts", label: "Checkout", render: (row) => formatInteger(row.checkouts) },
  { key: "addShippingInfo", label: "Shipping", render: (row) => formatInteger(row.addShippingInfo) },
  { key: "purchases", label: "Purchases", render: (row) => formatInteger(row.purchases) },
  { key: "totalRevenue", label: "Revenue", render: (row, currency) => formatCurrency(row.totalRevenue, currency) },
  { key: "averagePurchaseRevenue", label: "AOV", render: (row, currency) => formatCurrency(row.averagePurchaseRevenue, currency) },
];

export function LandingPagesTableSection({
  rows,
  currency,
  sort,
  onSortChange,
  onRowClick,
  selectedPath,
}: LandingPagesTableSectionProps) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f5f9ff_100%)] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Funnel Table
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Click any landing page to inspect drop-offs, conversion rates, and AI commentary.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1500px] w-full text-sm">
          <thead className="bg-slate-50/90 text-slate-600">
            <tr>
              <th className="sticky left-0 z-[1] min-w-[320px] border-r border-slate-200 bg-slate-50 px-5 py-3 text-left font-semibold">
                Landing Page
              </th>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th key={column.key} className="px-3 py-3 text-right font-semibold">
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange({
                          key: column.key,
                          direction:
                            active && sort.direction === "desc" ? "asc" : "desc",
                        })
                      }
                      className="inline-flex items-center gap-1 text-slate-600 transition hover:text-slate-900"
                    >
                      {column.label}
                      {active ? (
                        sort.direction === "desc" ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUp className="h-3.5 w-3.5" />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedPath === row.path;
              return (
                <tr
                  key={row.path}
                  className={cn(
                    "cursor-pointer border-t border-slate-100 transition-colors hover:bg-sky-50/50",
                    selected && "bg-sky-50/70"
                  )}
                  onClick={() => onRowClick(row)}
                >
                  <td className="sticky left-0 z-[1] border-r border-slate-100 bg-inherit px-5 py-4 align-top">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">{row.title}</p>
                      <p className="font-mono text-xs text-slate-500">{row.path}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                          Session CVR {formatPercent(row.sessionToPurchaseRate)}
                        </span>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                          Leak {getDropOffLabel(row.largestDropOffStep)}
                        </span>
                      </div>
                    </div>
                  </td>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className="px-3 py-4 text-right text-slate-700">
                      {column.render(row, currency)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
