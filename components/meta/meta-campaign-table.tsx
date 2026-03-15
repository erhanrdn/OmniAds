"use client";

/**
 * components/meta/meta-campaign-table.tsx
 *
 * Props:
 *  campaigns     MetaCampaignData[]   — server-serialized, no client fetch
 *  businessId / since / until         — passed to lazy ad-set query
 *  showMicroBars  boolean (default false)
 *    When true, renders a 3 px relative-spend bar under Spend and Revenue.
 *  columns  "full" | "compact" (default "full")
 *    "full"    — 9 cols: Campaign · Status · Spend · Conv · Revenue · ROAS · CPA · CTR · CPM
 *    "compact" — 6 cols: Campaign · Status · Spend · Revenue · ROAS · CPA
 *    Conv, CTR, CPM are still visible in the expanded ad-set sub-table.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MetaCampaignData, MetaAdSetData } from "@/lib/api/meta";
import type { MetaAdSetsResponse } from "@/app/api/meta/adsets/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type ColumnMode = "full" | "compact";

interface MetaCampaignTableProps {
  campaigns: MetaCampaignData[];
  businessId: string;
  since: string;
  until: string;
  showMicroBars?: boolean;
  columns?: ColumnMode;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtBudget(daily: number | null, lifetime: number | null): string {
  if (daily != null) return `${fmt$(daily / 100)}/day`;
  if (lifetime != null) return `${fmt$(lifetime / 100)} lifetime`;
  return "—";
}

// ── Micro-bar ─────────────────────────────────────────────────────────────────

function MicroBar({
  value,
  max,
  color = "bg-blue-500/50",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${pct.toFixed(2)}%` }}
      />
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower === "active")
    return (
      <Badge className="border-0 bg-emerald-500/15 font-medium text-emerald-600 hover:bg-emerald-500/20">
        Active
      </Badge>
    );
  if (lower === "paused")
    return (
      <Badge className="border-0 bg-slate-400/15 text-slate-500 hover:bg-slate-400/20">
        Paused
      </Badge>
    );
  if (lower === "archived")
    return (
      <Badge className="border-0 bg-zinc-400/10 text-zinc-400">Archived</Badge>
    );
  if (lower === "in_process")
    return (
      <Badge className="border-0 bg-blue-500/15 text-blue-600">
        In Process
      </Badge>
    );
  if (lower === "with_issues")
    return (
      <Badge className="border-0 bg-amber-500/15 text-amber-600">Issues</Badge>
    );
  return (
    <Badge variant="outline" className="text-xs">
      {status.toLowerCase()}
    </Badge>
  );
}

// ── ROAS cell ─────────────────────────────────────────────────────────────────

export function RoasCell({ roas }: { roas: number }) {
  if (roas > 2.5)
    return (
      <span className="font-semibold tabular-nums text-emerald-600">
        {roas.toFixed(2)}
      </span>
    );
  if (roas >= 1.5)
    return (
      <span className="font-semibold tabular-nums text-amber-500">
        {roas.toFixed(2)}
      </span>
    );
  return (
    <span className="font-semibold tabular-nums text-red-500">
      {roas.toFixed(2)}
    </span>
  );
}

// ── Ad set sub-table (always shows all columns) ───────────────────────────────

function AdSetSubTable({ rows }: { rows: MetaAdSetData[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">
        No ad set data for the selected date range.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-t bg-indigo-500/[0.03]">
      <table className="min-w-full text-xs">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="px-4 py-2 pl-10 font-medium">Ad Set</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Budget</th>
            <th className="px-3 py-2 font-medium">Spend</th>
            <th className="px-3 py-2 font-medium">Conv.</th>
            <th className="px-3 py-2 font-medium">Revenue</th>
            <th className="px-3 py-2 font-medium">ROAS</th>
            <th className="px-3 py-2 font-medium">CPA</th>
            <th className="px-3 py-2 font-medium">CTR</th>
            <th className="px-3 py-2 font-medium">CPM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((adset) => (
            <tr
              key={adset.id}
              className="border-t transition-colors hover:bg-indigo-500/[0.07]"
            >
              <td className="border-l-2 border-l-indigo-400/40 px-4 py-2 pl-8 font-medium">
                {adset.name}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={adset.status} />
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {fmtBudget(adset.dailyBudget, adset.lifetimeBudget)}
              </td>
              <td className="px-3 py-2 tabular-nums">{fmt$(adset.spend)}</td>
              <td className="px-3 py-2 tabular-nums">
                {adset.purchases.toLocaleString()}
              </td>
              <td className="px-3 py-2 tabular-nums">{fmt$(adset.revenue)}</td>
              <td className="px-3 py-2">
                <RoasCell roas={adset.roas} />
              </td>
              <td className="px-3 py-2 tabular-nums">{fmt$(adset.cpa)}</td>
              <td className="px-3 py-2 tabular-nums">
                {adset.ctr.toFixed(2)}%
              </td>
              <td className="px-3 py-2 tabular-nums">{fmt$(adset.cpm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Campaign row ──────────────────────────────────────────────────────────────

interface CampaignRowProps {
  campaign: MetaCampaignData;
  isExpanded: boolean;
  onToggle: () => void;
  businessId: string;
  since: string;
  until: string;
  maxSpend: number;
  maxRevenue: number;
  showMicroBars: boolean;
  columns: ColumnMode;
}

function CampaignRow({
  campaign,
  isExpanded,
  onToggle,
  businessId,
  since,
  until,
  maxSpend,
  maxRevenue,
  showMicroBars,
  columns,
}: CampaignRowProps) {
  const colSpan = columns === "compact" ? 6 : 9;

  const adSetsQuery = useQuery<MetaAdSetsResponse>({
    queryKey: ["meta-adsets", businessId, campaign.id, since, until],
    enabled: isExpanded,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({
        businessId,
        campaignId: campaign.id,
        startDate: since,
        endDate: until,
      });
      const res = await fetch(`/api/meta/adsets?${params.toString()}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.message ?? `Request failed (${res.status})`);
      }
      return res.json() as Promise<MetaAdSetsResponse>;
    },
  });

  return (
    <>
      <tr
        className="cursor-pointer border-t transition-colors hover:bg-muted/25"
        onClick={onToggle}
      >
        {/* Campaign name */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-muted-foreground">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
            <span className="truncate font-medium" title={campaign.name}>
              {campaign.name}
            </span>
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-2.5">
          <StatusBadge status={campaign.status} />
        </td>

        {/* Spend + micro-bar */}
        <td className="px-3 py-2.5">
          <span className="tabular-nums">{fmt$(campaign.spend)}</span>
          {showMicroBars && (
            <MicroBar
              value={campaign.spend}
              max={maxSpend}
              color="bg-blue-500/50"
            />
          )}
        </td>

        {/* Conv. — full mode only */}
        {columns === "full" && (
          <td className="px-3 py-2.5 tabular-nums">
            {campaign.purchases.toLocaleString()}
          </td>
        )}

        {/* Revenue + micro-bar */}
        <td className="px-3 py-2.5">
          <span className="tabular-nums">{fmt$(campaign.revenue)}</span>
          {showMicroBars && (
            <MicroBar
              value={campaign.revenue}
              max={maxRevenue}
              color="bg-emerald-500/40"
            />
          )}
        </td>

        {/* ROAS */}
        <td className="px-3 py-2.5">
          <RoasCell roas={campaign.roas} />
        </td>

        {/* CPA */}
        <td className="px-3 py-2.5 tabular-nums">{fmt$(campaign.cpa)}</td>

        {/* CTR — full mode only */}
        {columns === "full" && (
          <td className="px-3 py-2.5 tabular-nums">
            {campaign.ctr.toFixed(2)}%
          </td>
        )}

        {/* CPM — full mode only */}
        {columns === "full" && (
          <td className="px-3 py-2.5 tabular-nums">{fmt$(campaign.cpm)}</td>
        )}
      </tr>

      {/* Lazy ad set child tree */}
      {isExpanded && (
        <tr>
          <td colSpan={colSpan} className="p-0">
            {adSetsQuery.isLoading && (
              <div className="flex items-center gap-2 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading ad sets…
              </div>
            )}
            {adSetsQuery.isError && (
              <div className="flex items-center gap-2 border-t bg-destructive/5 px-4 py-3 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                {adSetsQuery.error instanceof Error
                  ? adSetsQuery.error.message
                  : "Could not load ad sets."}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    adSetsQuery.refetch();
                  }}
                >
                  Retry
                </Button>
              </div>
            )}
            {adSetsQuery.isSuccess && (
              <AdSetSubTable rows={adSetsQuery.data.rows} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function MetaCampaignTable({
  campaigns,
  businessId,
  since,
  until,
  showMicroBars = false,
  columns = "full",
}: MetaCampaignTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const maxSpend = campaigns.reduce((m, c) => Math.max(m, c.spend), 0);
  const maxRevenue = campaigns.reduce((m, c) => Math.max(m, c.revenue), 0);

  // Minimum table width so columns never squish below readable size.
  // compact (6 cols): 560 px · full (9 cols): 820 px
  const minW = columns === "compact" ? "min-w-[560px]" : "min-w-[820px]";

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No campaigns found for the selected date range.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      {/* overflow-x-auto: table scrolls horizontally if viewport < minW */}
      <div className="overflow-x-auto">
        <table className={`${minW} w-full text-sm`}>
          <thead className="sticky top-0 z-10 bg-card text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b">
            <tr>
              <th className="px-3 py-2.5">Campaign</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Spend</th>
              {columns === "full" && (
                <th className="px-3 py-2.5">Conv.</th>
              )}
              <th className="px-3 py-2.5">Revenue</th>
              <th className="px-3 py-2.5">ROAS</th>
              <th className="px-3 py-2.5">CPA</th>
              {columns === "full" && (
                <>
                  <th className="px-3 py-2.5">CTR</th>
                  <th className="px-3 py-2.5">CPM</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                isExpanded={expandedId === campaign.id}
                onToggle={() =>
                  setExpandedId((prev) =>
                    prev === campaign.id ? null : campaign.id
                  )
                }
                businessId={businessId}
                since={since}
                until={until}
                maxSpend={maxSpend}
                maxRevenue={maxRevenue}
                showMicroBars={showMicroBars}
                columns={columns}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} — click
        a row to expand ad sets
      </div>
    </div>
  );
}
