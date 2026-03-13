"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  fmtCurrency, fmtNumber, fmtRoas,
  TabSkeleton, TabEmpty, SimpleTable, ColDef,
  SubTabNav, SectionLabel,
} from "./shared";

// ── Types ──────────────────────────────────────────────────────────────

interface AudienceRow {
  criterionId: string;
  type: string;
  adGroup: string;
  campaign: string;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  impressions: number;
  clicks: number;
}

interface AudienceSummary {
  type: string;
  conversions: number;
  spend: number;
  roas: number;
}

interface GeoRow {
  country: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  vsAvgCpa: number | null;
}

interface DeviceRow {
  device: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  convRate?: number;
  conversionRate?: number;
}

type SubTab = "devices" | "geo" | "audiences";

// ── Audience type colors ───────────────────────────────────────────────

const TYPE_CONFIG: Record<string, string> = {
  Remarketing: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "In-Market": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  Affinity: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Custom Intent": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Life Events": "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  "Similar Audiences": "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
};

// ── Device section ─────────────────────────────────────────────────────

const DEVICE_ICON: Record<string, string> = {
  Mobile: "📱",
  Desktop: "🖥",
  Tablet: "📲",
  "Connected TV": "📺",
};

function DeviceInsights({ devices }: { devices: DeviceRow[] }) {
  if (devices.length < 2) return null;
  const avgRoas = devices.reduce((s, d) => s + d.roas, 0) / devices.length;
  const insights: { msg: string; cls: string }[] = [];

  const mobile = devices.find((d) => d.device === "Mobile");
  const desktop = devices.find((d) => d.device === "Desktop");

  if (mobile && desktop && mobile.roas > 0 && desktop.roas > mobile.roas * 1.3) {
    insights.push({
      msg: `Desktop ROAS (${fmtRoas(desktop.roas)}) significantly outperforms mobile (${fmtRoas(mobile.roas)}) — consider bid adjustments to favor desktop.`,
      cls: "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100",
    });
  }

  const underperforming = devices.filter((d) => d.spend > 50 && d.roas < avgRoas * 0.6 && d.roas > 0);
  if (underperforming.length > 0) {
    insights.push({
      msg: `${underperforming.map((d) => d.device).join(", ")} underperforming vs account average — reduce bids for these device types.`,
      cls: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100",
    });
  }

  const noConv = devices.filter((d) => d.spend > 50 && d.conversions === 0);
  if (noConv.length > 0) {
    insights.push({
      msg: `${noConv.map((d) => d.device).join(", ")} has spend but zero conversions — consider excluding or adjusting bids.`,
      cls: "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100",
    });
  }

  if (insights.length === 0) return null;

  return (
    <div className="space-y-2">
      {insights.map((ins, i) => (
        <div key={i} className={cn("rounded-xl border px-4 py-3 text-xs", ins.cls)}>
          {ins.msg}
        </div>
      ))}
    </div>
  );
}

function DevicesSection({ devices, insights }: { devices: DeviceRow[]; insights?: string[] }) {
  const totalSpend = devices.reduce((s, d) => s + d.spend, 0);

  const cols: ColDef<DeviceRow>[] = [
    {
      key: "device", header: "Device", accessor: (r) => r.device,
      render: (r) => (
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {DEVICE_ICON[r.device] ?? ""}
          {r.device}
        </span>
      ),
    },
    {
      key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right",
      render: (r) => (
        <div className="text-right">
          <p className="text-xs tabular-nums">{fmtCurrency(r.spend)}</p>
          <p className="text-[10px] text-muted-foreground">{totalSpend > 0 ? ((r.spend / totalSpend) * 100).toFixed(0) : 0}%</p>
        </div>
      ),
    },
    { key: "conversions", header: "Conv.", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
    {
      key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right",
      render: (r) => (
        <span className={cn("font-semibold", r.roas >= 3 ? "text-emerald-600 dark:text-emerald-400" : r.roas < 1 ? "text-rose-600 dark:text-rose-400" : "")}>
          {r.roas === 0 ? "—" : fmtRoas(r.roas)}
        </span>
      ),
    },
    { key: "cpa", header: "CPA", accessor: (r) => r.cpa === 0 ? 99999 : r.cpa, align: "right", render: (r) => r.conversions === 0 ? "—" : fmtCurrency(r.cpa) },
    { key: "ctr", header: "CTR", accessor: (r) => r.ctr, align: "right", render: (r) => `${r.ctr.toFixed(1)}%` },
    {
      key: "convRate", header: "Conv. Rate", accessor: (r) => r.conversionRate ?? r.convRate ?? 0, align: "right",
      render: (r) => `${(r.conversionRate ?? r.convRate ?? 0).toFixed(1)}%`,
    },
    { key: "impressions", header: "Impr.", accessor: (r) => r.impressions, align: "right", render: (r) => fmtNumber(r.impressions) },
    { key: "clicks", header: "Clicks", accessor: (r) => r.clicks, align: "right", render: (r) => fmtNumber(r.clicks) },
  ];

  return (
    <div className="space-y-4">
      <DeviceInsights devices={devices} />

      {/* Device ROAS comparison */}
      {devices.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {devices.map((d) => {
            const maxRoas = Math.max(...devices.map((x) => x.roas), 0.01);
            const pct = (d.roas / maxRoas) * 100;
            return (
              <div key={d.device} className="rounded-xl border bg-card p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span>{DEVICE_ICON[d.device] ?? ""}</span>
                  <span className="text-xs font-medium">{d.device}</span>
                </div>
                <p className="text-xl font-bold">{d.roas === 0 ? "—" : fmtRoas(d.roas)}</p>
                <p className="text-[10px] text-muted-foreground mb-2">ROAS</p>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{fmtCurrency(d.spend)} spend</p>
              </div>
            );
          })}
        </div>
      )}

      {insights && insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div key={i} className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
              <p className="text-xs">△ {ins}</p>
            </div>
          ))}
        </div>
      )}

      <SimpleTable cols={cols} rows={devices} defaultSort="spend" />
    </div>
  );
}

// ── Geo section ────────────────────────────────────────────────────────

function GeoInsights({ geoData }: { geoData: GeoRow[] }) {
  if (geoData.length < 2) return null;
  const avgRoas = geoData.reduce((s, g) => s + g.roas, 0) / geoData.length;
  const insights: { msg: string; cls: string }[] = [];

  const topGeo = [...geoData].sort((a, b) => b.roas - a.roas)[0];
  const worstGeo = [...geoData].filter((g) => g.spend > 50 && g.roas > 0).sort((a, b) => a.roas - b.roas)[0];

  if (topGeo && topGeo.roas > avgRoas * 1.3) {
    insights.push({
      msg: `${topGeo.country} is your strongest market (${fmtRoas(topGeo.roas)} ROAS) — consider increasing bids or budget allocation for this region.`,
      cls: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100",
    });
  }

  if (worstGeo && worstGeo.roas < avgRoas * 0.6) {
    insights.push({
      msg: `${worstGeo.country} has weak ROAS (${fmtRoas(worstGeo.roas)}) despite meaningful spend (${fmtCurrency(worstGeo.spend)}) — reduce bids or exclude this region.`,
      cls: "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100",
    });
  }

  if (insights.length === 0) return null;
  return (
    <div className="space-y-2">
      {insights.map((ins, i) => (
        <div key={i} className={cn("rounded-xl border px-4 py-3 text-xs", ins.cls)}>{ins.msg}</div>
      ))}
    </div>
  );
}

function GeoSection({ geoData, insights }: { geoData: GeoRow[]; insights?: string[] }) {
  const cols: ColDef<GeoRow>[] = [
    { key: "country", header: "Country / Region", accessor: (r) => r.country, render: (r) => <span className="text-xs font-medium">{r.country}</span> },
    { key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right", render: (r) => fmtCurrency(r.spend) },
    { key: "conversions", header: "Conv.", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
    {
      key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right",
      render: (r) => (
        <span className={cn("font-semibold", r.roas >= 3 ? "text-emerald-600 dark:text-emerald-400" : r.roas < 1 ? "text-rose-600 dark:text-rose-400" : "")}>
          {r.roas === 0 ? "—" : fmtRoas(r.roas)}
        </span>
      ),
    },
    { key: "cpa", header: "CPA", accessor: (r) => r.cpa === 0 ? 99999 : r.cpa, align: "right", render: (r) => r.conversions === 0 ? "—" : fmtCurrency(r.cpa) },
    {
      key: "vsAvgCpa", header: "vs Avg CPA", accessor: (r) => r.vsAvgCpa ?? 0, align: "right",
      render: (r) => r.vsAvgCpa == null ? "—" : (
        <span className={cn(r.vsAvgCpa < -10 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : r.vsAvgCpa > 20 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
          {r.vsAvgCpa > 0 ? "+" : ""}{r.vsAvgCpa}%
        </span>
      ),
    },
    { key: "ctr", header: "CTR", accessor: (r) => r.ctr, align: "right", render: (r) => `${r.ctr.toFixed(1)}%` },
    { key: "clicks", header: "Clicks", accessor: (r) => r.clicks, align: "right", render: (r) => fmtNumber(r.clicks) },
    { key: "revenue", header: "Revenue", accessor: (r) => r.revenue, align: "right", render: (r) => fmtCurrency(r.revenue) },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        "vs Avg CPA" compares each region to account average. Green = more efficient. Red = above average cost.
      </p>
      <GeoInsights geoData={geoData} />
      {insights && insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div key={i} className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
              <p className="text-xs">◈ {ins}</p>
            </div>
          ))}
        </div>
      )}
      <SimpleTable cols={cols} rows={geoData} defaultSort="spend" />
    </div>
  );
}

// ── Audiences section ──────────────────────────────────────────────────

function AudiencesSection({
  audiences,
  insights,
  summary,
}: {
  audiences: AudienceRow[];
  insights?: string[];
  summary?: AudienceSummary[];
}) {
  const cols: ColDef<AudienceRow>[] = [
    {
      key: "type", header: "Audience Type", accessor: (r) => r.type,
      render: (r) => (
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TYPE_CONFIG[r.type] ?? "bg-muted text-muted-foreground")}>
          {r.type}
        </span>
      ),
    },
    { key: "campaign", header: "Campaign", accessor: (r) => r.campaign, render: (r) => <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{r.campaign}</span> },
    { key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right", render: (r) => fmtCurrency(r.spend) },
    { key: "conversions", header: "Conv.", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
    { key: "cpa", header: "CPA", accessor: (r) => r.cpa === 0 ? 99999 : r.cpa, align: "right", render: (r) => r.conversions === 0 ? "—" : fmtCurrency(r.cpa) },
    {
      key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right",
      render: (r) => (
        <span className={cn(r.roas >= 3 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "")}>
          {r.roas === 0 ? "—" : fmtRoas(r.roas)}
        </span>
      ),
    },
    { key: "ctr", header: "CTR", accessor: (r) => r.ctr, align: "right", render: (r) => `${r.ctr.toFixed(1)}%` },
    { key: "clicks", header: "Clicks", accessor: (r) => r.clicks, align: "right", render: (r) => fmtNumber(r.clicks) },
  ];

  return (
    <div className="space-y-4">
      {insights && insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div key={i} className="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50 dark:bg-violet-950/30 px-4 py-3">
              <p className="text-xs">◈ {ins}</p>
            </div>
          ))}
        </div>
      )}

      {summary && summary.length > 0 && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {summary.map((s) => (
            <div key={s.type} className="rounded-xl border bg-card p-3">
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TYPE_CONFIG[s.type] ?? "bg-muted text-muted-foreground")}>
                {s.type}
              </span>
              <p className="text-sm font-bold mt-2">{fmtRoas(s.roas)}</p>
              <p className="text-[10px] text-muted-foreground">ROAS · {fmtNumber(s.conversions)} conv</p>
              <p className="text-[10px] text-muted-foreground">{fmtCurrency(s.spend)} spend</p>
            </div>
          ))}
        </div>
      )}

      <SimpleTable cols={cols} rows={audiences} defaultSort="spend" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

interface AudienceTargetingTabProps {
  audiences?: AudienceRow[];
  audienceInsights?: string[];
  audienceSummary?: AudienceSummary[];
  geoData?: GeoRow[];
  geoInsights?: string[];
  devices?: DeviceRow[];
  deviceInsights?: string[];
  isLoadingAudiences: boolean;
  isLoadingGeo: boolean;
  isLoadingDevices: boolean;
}

export function AudienceTargetingTab({
  audiences,
  audienceInsights,
  audienceSummary,
  geoData,
  geoInsights,
  devices,
  deviceInsights,
  isLoadingAudiences,
  isLoadingGeo,
  isLoadingDevices,
}: AudienceTargetingTabProps) {
  const [subTab, setSubTab] = useState<SubTab>("devices");

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: "devices", label: "Devices" },
    { id: "geo", label: "Geo" },
    { id: "audiences", label: "Audiences" },
  ];

  const isLoading =
    subTab === "devices" ? isLoadingDevices
    : subTab === "geo" ? isLoadingGeo
    : isLoadingAudiences;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <SectionLabel>Audience & Targeting</SectionLabel>
          <p className="text-xs text-muted-foreground mt-0.5">
            Understand which devices, regions, and audiences drive the most efficient results.
          </p>
        </div>
        <SubTabNav tabs={SUB_TABS} active={subTab} onChange={setSubTab} />
      </div>

      {isLoading ? (
        <TabSkeleton rows={4} />
      ) : subTab === "devices" ? (
        !devices || devices.length === 0 ? (
          <TabEmpty message="No device performance data found." />
        ) : (
          <DevicesSection devices={devices} insights={deviceInsights} />
        )
      ) : subTab === "geo" ? (
        !geoData || geoData.length === 0 ? (
          <TabEmpty message="No geographic data found. Requires campaigns with geographic targeting." />
        ) : (
          <GeoSection geoData={geoData} insights={geoInsights} />
        )
      ) : (
        !audiences || audiences.length === 0 ? (
          <TabEmpty message="No audience data found. Requires campaigns with audience targeting or observation." />
        ) : (
          <AudiencesSection audiences={audiences} insights={audienceInsights} summary={audienceSummary} />
        )
      )}
    </div>
  );
}
