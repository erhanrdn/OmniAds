"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  fmtCurrency, fmtNumber, fmtRoas,
  TabSkeleton, TabEmpty, SimpleTable, ColDef,
  SubTabNav, SectionLabel, StatusBadge,
} from "./shared";

// ── Types ──────────────────────────────────────────────────────────────

interface Ad {
  id: string;
  headline: string;
  description: string;
  type: string;
  adStrength?: string | null;
  status: string;
  adGroup: string;
  campaign: string;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  convRate?: number;
  conversionRate?: number;
  impressions: number;
  clicks: number;
}

interface AdsInsights {
  topPerformerCtr: number;
  bottomPerformerCtr: number;
  bestAd: Ad | null;
  worstAd: Ad | null;
}

interface Creative {
  id: string;
  name: string;
  type: string;
  status: string;
  adStrength?: "Best" | "Good" | "Low" | "Learning" | "Unknown" | null;
  campaign: string;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  impressions: number;
  clicks: number;
  assetCount?: number;
  assetMix?: Record<string, number>;
}

type SubTab = "ads" | "asset-groups";

// ── Ad tier classification ─────────────────────────────────────────────

type AdTier = "top" | "mid" | "bottom";

function classifyAdTier(ads: Ad[]): Map<string, AdTier> {
  const sorted = [...ads].sort((a, b) => b.conversions - a.conversions);
  const topN = Math.max(1, Math.ceil(sorted.length * 0.2));
  const bottomN = Math.max(1, Math.ceil(sorted.length * 0.2));
  const tierMap = new Map<string, AdTier>();
  sorted.forEach((ad, i) => {
    if (i < topN) tierMap.set(ad.id, "top");
    else if (i >= sorted.length - bottomN) tierMap.set(ad.id, "bottom");
    else tierMap.set(ad.id, "mid");
  });
  return tierMap;
}

const TIER_CONFIG: Record<AdTier, { label: string; cls: string }> = {
  top: { label: "Top 20%", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  mid: { label: "Mid 60%", cls: "bg-muted text-muted-foreground" },
  bottom: { label: "Bottom 20%", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
};

// ── Performance distribution ───────────────────────────────────────────

function AdDistributionSummary({ ads }: { ads: Ad[] }) {
  const tierMap = classifyAdTier(ads);
  const tiers = { top: { count: 0, spend: 0, conversions: 0, ctr: 0, n: 0 }, mid: { count: 0, spend: 0, conversions: 0, ctr: 0, n: 0 }, bottom: { count: 0, spend: 0, conversions: 0, ctr: 0, n: 0 } };
  ads.forEach((ad) => {
    const tier = (tierMap.get(ad.id) ?? "mid") as AdTier;
    tiers[tier].count++;
    tiers[tier].spend += ad.spend;
    tiers[tier].conversions += ad.conversions;
    tiers[tier].ctr += ad.ctr;
    tiers[tier].n++;
  });

  return (
    <div className="grid grid-cols-3 gap-3">
      {(["top", "mid", "bottom"] as AdTier[]).map((tier) => {
        const t = tiers[tier];
        const avgCtr = t.n > 0 ? t.ctr / t.n : 0;
        return (
          <div key={tier} className={cn("rounded-xl border p-3", tier === "top" ? "border-emerald-200 dark:border-emerald-900/50" : tier === "bottom" ? "border-rose-200 dark:border-rose-900/50" : "")}>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", TIER_CONFIG[tier].cls)}>
              {TIER_CONFIG[tier].label}
            </span>
            <p className="text-lg font-bold mt-2">{t.count}</p>
            <p className="text-[10px] text-muted-foreground">ads</p>
            <div className="mt-2 space-y-0.5">
              <p className="text-xs text-muted-foreground">{fmtCurrency(t.spend)} spend</p>
              <p className="text-xs text-muted-foreground">{fmtNumber(t.conversions)} conv.</p>
              <p className="text-xs text-muted-foreground">{avgCtr.toFixed(1)}% avg CTR</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Decay detection ────────────────────────────────────────────────────

function DecayDetection({ ads }: { ads: Ad[] }) {
  const avgCtr = ads.length > 0 ? ads.reduce((s, a) => s + a.ctr, 0) / ads.length : 0;
  // Ads with meaningful spend, high impressions, but CTR below half the average
  const decaying = ads.filter((a) => a.impressions > 500 && a.ctr < avgCtr * 0.5 && a.spend > 20);

  if (decaying.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4">
      <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
        {decaying.length} ad{decaying.length > 1 ? "s" : ""} showing decay signals
      </p>
      <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5 mb-3">
        CTR significantly below account average ({avgCtr.toFixed(1)}%) with meaningful spend — consider refreshing these ads.
      </p>
      <div className="space-y-1">
        {decaying.slice(0, 4).map((a, i) => (
          <div key={i} className="flex items-center justify-between text-xs gap-2">
            <span className="truncate text-amber-900 dark:text-amber-100 max-w-[200px]" title={a.headline}>
              {a.headline || a.id || "—"}
            </span>
            <span className="text-amber-700 dark:text-amber-300 shrink-0">
              {a.ctr.toFixed(1)}% CTR · {fmtCurrency(a.spend)} spent
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top/worst spotlights ───────────────────────────────────────────────

function AdSpotlights({ ads }: { ads: Ad[] }) {
  if (ads.length < 2) return null;

  const bySpend = [...ads].filter((a) => a.spend > 0);
  const topCtr = [...bySpend].sort((a, b) => b.ctr - a.ctr).slice(0, 3);
  const topRoas = [...bySpend].filter((a) => a.roas > 0).sort((a, b) => b.roas - a.roas).slice(0, 3);
  const worstWaste = [...bySpend].filter((a) => a.conversions === 0).sort((a, b) => b.spend - a.spend).slice(0, 3);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {/* Top by CTR */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold mb-3">Top CTR</p>
        <div className="space-y-2">
          {topCtr.map((ad, i) => (
            <div key={i}>
              <p className="text-xs font-medium truncate" title={ad.headline}>{ad.headline || "—"}</p>
              <p className="text-[10px] text-muted-foreground">{ad.ctr.toFixed(1)}% CTR · {fmtNumber(ad.impressions)} impr.</p>
            </div>
          ))}
          {topCtr.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
        </div>
      </div>

      {/* Top by ROAS */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold mb-3">Top ROAS</p>
        <div className="space-y-2">
          {topRoas.map((ad, i) => (
            <div key={i}>
              <p className="text-xs font-medium truncate" title={ad.headline}>{ad.headline || "—"}</p>
              <p className="text-[10px] text-muted-foreground">{fmtRoas(ad.roas)} · {fmtNumber(ad.conversions)} conv.</p>
            </div>
          ))}
          {topRoas.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
        </div>
      </div>

      {/* Worst waste */}
      <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-card p-4">
        <p className="text-xs font-semibold mb-3 text-rose-600 dark:text-rose-400">Spending Without Converting</p>
        <div className="space-y-2">
          {worstWaste.map((ad, i) => (
            <div key={i}>
              <p className="text-xs font-medium truncate" title={ad.headline}>{ad.headline || "—"}</p>
              <p className="text-[10px] text-muted-foreground">{fmtCurrency(ad.spend)} spent · 0 conv.</p>
            </div>
          ))}
          {worstWaste.length === 0 && <p className="text-xs text-emerald-600 dark:text-emerald-400 text-xs">All active ads converting</p>}
        </div>
      </div>
    </div>
  );
}

// ── Ads section ────────────────────────────────────────────────────────

function AdsSection({ ads, insights }: { ads: Ad[]; insights?: AdsInsights }) {
  const tierMap = classifyAdTier(ads);

  const cols: ColDef<Ad>[] = [
    {
      key: "headline", header: "Ad", accessor: (r) => r.headline,
      render: (r) => {
        const tier = tierMap.get(r.id) as AdTier | undefined;
        return (
          <div className="max-w-[220px]">
            <p className="text-xs font-medium truncate" title={r.headline || r.id}>{r.headline || r.id || "—"}</p>
            {r.description && <p className="text-[10px] text-muted-foreground truncate">{r.description}</p>}
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <StatusBadge status={r.status} />
              <span className="text-[9px] text-muted-foreground">{r.type?.replace(/_/g, " ")}</span>
              {tier && <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", TIER_CONFIG[tier].cls)}>{TIER_CONFIG[tier].label}</span>}
            </div>
          </div>
        );
      },
    },
    { key: "campaign", header: "Campaign", accessor: (r) => r.campaign, render: (r) => <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{r.campaign}</span> },
    { key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right", render: (r) => fmtCurrency(r.spend) },
    {
      key: "ctr", header: "CTR", accessor: (r) => r.ctr, align: "right",
      render: (r) => <span className={cn(r.ctr >= 5 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "")}>{r.ctr.toFixed(1)}%</span>,
    },
    { key: "conversions", header: "Conv.", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
    { key: "convRate", header: "Conv. Rate", accessor: (r) => r.conversionRate ?? r.convRate ?? 0, align: "right", render: (r) => `${(r.conversionRate ?? r.convRate ?? 0).toFixed(1)}%` },
    { key: "cpa", header: "CPA", accessor: (r) => r.cpa === 0 ? 99999 : r.cpa, align: "right", render: (r) => r.conversions === 0 ? "—" : fmtCurrency(r.cpa) },
    { key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right", render: (r) => r.roas === 0 ? "—" : fmtRoas(r.roas) },
  ];

  return (
    <div className="space-y-5">
      {insights && insights.topPerformerCtr > insights.bottomPerformerCtr * 1.3 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
            Top ads CTR ({insights.topPerformerCtr.toFixed(1)}%) vs bottom ({insights.bottomPerformerCtr.toFixed(1)}%)
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            Significant gap detected — pause bottom-quartile ads and test copy inspired by your best performers.
          </p>
        </div>
      )}

      <AdDistributionSummary ads={ads} />
      <AdSpotlights ads={ads} />
      <DecayDetection ads={ads} />
      <SimpleTable cols={cols} rows={ads} defaultSort="spend" />
    </div>
  );
}

// ── Asset groups section ───────────────────────────────────────────────

const STRENGTH_CONFIG: Record<string, string> = {
  Best: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Good: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  Low: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  Learning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Unknown: "bg-muted text-muted-foreground",
};

function AssetGroupsSection({ creatives, insights }: { creatives: Creative[]; insights?: string[] }) {
  const cols: ColDef<Creative>[] = [
    {
      key: "name", header: "Asset Group", accessor: (r) => r.name,
      render: (r) => (
        <div className="max-w-[180px]">
          <p className="text-xs font-medium truncate" title={r.name}>{r.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", STRENGTH_CONFIG[r.adStrength ?? "Unknown"])}>
              {r.adStrength ?? "Unknown"}
            </span>
            <span className="text-[9px] text-muted-foreground">{r.type}</span>
            {typeof r.assetCount === "number" && <span className="text-[9px] text-muted-foreground">· {r.assetCount} assets</span>}
          </div>
        </div>
      ),
    },
    { key: "campaign", header: "Campaign", accessor: (r) => r.campaign, render: (r) => <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{r.campaign}</span> },
    { key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right", render: (r) => fmtCurrency(r.spend) },
    { key: "conversions", header: "Conv.", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
    { key: "cpa", header: "CPA", accessor: (r) => r.cpa === 0 ? 99999 : r.cpa, align: "right", render: (r) => r.conversions === 0 ? "—" : fmtCurrency(r.cpa) },
    {
      key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right",
      render: (r) => <span className={cn(r.roas >= 3 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "")}>{r.roas === 0 ? "—" : fmtRoas(r.roas)}</span>,
    },
    { key: "ctr", header: "CTR", accessor: (r) => r.ctr, align: "right", render: (r) => `${r.ctr.toFixed(1)}%` },
    { key: "impressions", header: "Impr.", accessor: (r) => r.impressions, align: "right", render: (r) => fmtNumber(r.impressions) },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/30 px-4 py-3">
        <p className="text-xs text-slate-700 dark:text-slate-300">
          Asset group reporting is the richest view available for Performance Max campaigns. Individual asset-level spend and conversion attribution is not exposed uniformly by the Google Ads API.
        </p>
      </div>
      {insights && insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div key={i} className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
              <p className="text-xs text-foreground">△ {ins}</p>
            </div>
          ))}
        </div>
      )}
      <SimpleTable cols={cols} rows={creatives} defaultSort="spend" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

interface CreativeIntelligenceTabProps {
  ads?: Ad[];
  adsInsights?: AdsInsights;
  creatives?: Creative[];
  creativesInsights?: string[];
  isLoadingAds: boolean;
  isLoadingCreatives: boolean;
}

export function CreativeIntelligenceTab({
  ads,
  adsInsights,
  creatives,
  creativesInsights,
  isLoadingAds,
  isLoadingCreatives,
}: CreativeIntelligenceTabProps) {
  const [subTab, setSubTab] = useState<SubTab>("ads");

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: "ads", label: "Ads" },
    { id: "asset-groups", label: "Asset Groups (PMax)" },
  ];

  const isLoading = subTab === "ads" ? isLoadingAds : isLoadingCreatives;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <SectionLabel>Creative Intelligence</SectionLabel>
          <p className="text-xs text-muted-foreground mt-0.5">
            Identify which ads drive results, which are decaying, and where to focus creative effort.
          </p>
        </div>
        <SubTabNav tabs={SUB_TABS} active={subTab} onChange={setSubTab} />
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : subTab === "ads" ? (
        !ads || ads.length === 0 ? (
          <TabEmpty message="No ad performance data found for this period." />
        ) : (
          <AdsSection ads={ads} insights={adsInsights} />
        )
      ) : (
        !creatives || creatives.length === 0 ? (
          <TabEmpty message="No asset group data found. Requires Performance Max campaigns." />
        ) : (
          <AssetGroupsSection creatives={creatives} insights={creativesInsights} />
        )
      )}
    </div>
  );
}
