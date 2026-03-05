"use client";

import { Badge } from "@/components/ui/badge";
import type { OverviewData } from "@/src/types/models";

interface PlatformEfficiencyTableProps {
  rows: OverviewData["platformEfficiency"];
  currencySymbol: string;
}

export function PlatformEfficiencyTable({ rows, currencySymbol }: PlatformEfficiencyTableProps) {
  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight">Platform Efficiency</h2>
        <p className="text-sm text-muted-foreground">
          Spend distribution, efficiency signal, and immediate action hints.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b">
              <th className="px-2 py-3 font-medium">Platform</th>
              <th className="px-2 py-3 font-medium">Spend</th>
              <th className="px-2 py-3 font-medium">Revenue</th>
              <th className="px-2 py-3 font-medium">ROAS</th>
              <th className="px-2 py-3 font-medium">Purchases</th>
              <th className="px-2 py-3 font-medium">CPA</th>
              <th className="px-2 py-3 font-medium">Share of spend</th>
              <th className="px-2 py-3 font-medium">Insight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const spendShare = totalSpend > 0 ? (row.spend / totalSpend) * 100 : 0;
              const insight = getInsight(row.roas, spendShare);

              return (
                <tr key={row.platform} className="border-b last:border-0">
                  <td className="px-2 py-3">
                    <Badge variant="secondary" className="capitalize">
                      {row.platform}
                    </Badge>
                  </td>
                  <td className="px-2 py-3">{formatCurrency(row.spend, currencySymbol)}</td>
                  <td className="px-2 py-3">{formatCurrency(row.revenue, currencySymbol)}</td>
                  <td className="px-2 py-3">{row.roas.toFixed(2)}</td>
                  <td className="px-2 py-3">{row.purchases.toLocaleString()}</td>
                  <td className="px-2 py-3">{formatCurrency(row.cpa, currencySymbol)}</td>
                  <td className="px-2 py-3">
                    <div className="w-28">
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-slate-700/70"
                          style={{ width: `${Math.max(6, Math.min(spendShare, 100))}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{spendShare.toFixed(1)}%</p>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <Badge className={insight.className}>{insight.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getInsight(roas: number, spendShare: number) {
  if (roas >= 3.2 && spendShare < 20) {
    return {
      label: "Scaling opportunity",
      className: "bg-emerald-600 text-white",
    };
  }

  if (roas < 2.8 && spendShare > 22) {
    return {
      label: "Efficiency issue",
      className: "bg-rose-600 text-white",
    };
  }

  return {
    label: "Stable",
    className: "bg-slate-600 text-white",
  };
}

function formatCurrency(value: number, symbol: string) {
  return `${symbol}${value.toLocaleString()}`;
}
