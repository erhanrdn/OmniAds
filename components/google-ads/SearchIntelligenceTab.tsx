"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  fmtCurrency, fmtNumber, fmtRoas,
  TabSkeleton, TabEmpty, SimpleTable, ColDef,
  SubTabNav, SectionLabel, IntentBadge,
} from "./shared";

// ── Types ──────────────────────────────────────────────────────────────

interface SearchTerm {
  searchTerm: string;
  campaign: string;
  adGroup: string;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  impressions: number;
  clicks: number;
  intent: string;
  isKeyword: boolean;
}

interface SearchTermSummary {
  wastefulCount: number;
  negativeKeywordCandidates: number;
  highPerformingCount: number;
  keywordOpportunities: number;
  wastefulSpend: number;
}

interface Keyword {
  keyword: string;
  matchType: string;
  status: string;
  qualityScore: number | null;
  expectedCtr?: string | null;
  adRelevance?: string | null;
  landingPageExperience?: string | null;
  adGroup: string;
  campaign: string;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
  impressions: number;
  clicks: number;
  impressionShare: number | null;
}

interface KeywordInsights {
  highCtrLowConvCount: number;
  highConvLowBudgetCount: number;
  deserveOwnAdGroupCount: number;
}

type SubTab = "search-terms" | "keywords";
type TermFilter = "all" | "wasteful" | "opportunity" | "high_performing" | "negative_candidates";

// ── Search Terms Section ───────────────────────────────────────────────

const MATCH_TYPE_CONFIG: Record<string, string> = {
  Exact: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  Phrase: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Broad: "bg-muted text-muted-foreground",
};

function QsIndicator({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground">—</span>;
  const cls =
    score >= 8 ? "text-emerald-600 dark:text-emerald-400 font-semibold"
    : score >= 5 ? "text-foreground"
    : "text-rose-600 dark:text-rose-400 font-semibold";
  return <span className={cls}>{score}/10</span>;
}

function IntentDistribution({ terms }: { terms: SearchTerm[] }) {
  if (terms.length === 0) return null;
  const totalSpend = terms.reduce((s, t) => s + t.spend, 0);
  const totalConv = terms.reduce((s, t) => s + t.conversions, 0);
  const grouped = terms.reduce<Record<string, { spend: number; conversions: number }>>((acc, t) => {
    if (!acc[t.intent]) acc[t.intent] = { spend: 0, conversions: 0 };
    acc[t.intent].spend += t.spend;
    acc[t.intent].conversions += t.conversions;
    return acc;
  }, {});

  const entries = Object.entries(grouped).sort((a, b) => b[1].spend - a[1].spend);

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold mb-3">Search Intent Distribution</p>
      <div className="space-y-2">
        {entries.map(([intent, data]) => {
          const spendPct = totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0;
          const convPct = totalConv > 0 ? (data.conversions / totalConv) * 100 : 0;
          return (
            <div key={intent} className="flex items-center gap-3">
              <IntentBadge intent={intent} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{ width: `${spendPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground w-12 text-right shrink-0">
                    {fmtCurrency(data.spend)}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right">
                {convPct.toFixed(0)}% conv
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PromotionOpportunities({ terms }: { terms: SearchTerm[] }) {
  const opps = terms.filter((t) => t.conversions >= 2 && !t.isKeyword);
  if (opps.length === 0) return null;

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50 dark:bg-violet-950/30 p-4">
      <p className="text-xs font-semibold text-violet-900 dark:text-violet-100">
        {opps.length} converting search term{opps.length > 1 ? "s" : ""} ready for promotion
      </p>
      <p className="text-[10px] text-violet-700 dark:text-violet-300 mt-0.5 mb-3">
        Adding these as exact-match keywords gives you bid control and improves efficiency.
      </p>
      <div className="space-y-1">
        {opps.slice(0, 6).map((t, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="font-mono text-violet-900 dark:text-violet-100 truncate max-w-[200px]">
              "{t.searchTerm}"
            </span>
            <span className="text-violet-700 dark:text-violet-300 shrink-0 ml-3">
              {fmtNumber(t.conversions)} conv · {t.roas > 0 ? fmtRoas(t.roas) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NegativeKeywordSuggestions({ terms }: { terms: SearchTerm[] }) {
  const candidates = terms.filter((t) => t.clicks >= 20 && t.conversions === 0 && t.spend > 10);
  if (candidates.length === 0) return null;
  const totalWaste = candidates.reduce((s, t) => s + t.spend, 0);

  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-4">
      <p className="text-xs font-semibold text-rose-900 dark:text-rose-100">
        {candidates.length} negative keyword candidate{candidates.length > 1 ? "s" : ""} — {fmtCurrency(totalWaste)} recoverable
      </p>
      <p className="text-[10px] text-rose-700 dark:text-rose-300 mt-0.5 mb-3">
        High clicks, zero conversions — add these as negatives to stop wasted spend.
      </p>
      <div className="space-y-1">
        {candidates.slice(0, 6).map((t, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="font-mono text-rose-900 dark:text-rose-100 truncate max-w-[200px]">
              "{t.searchTerm}"
            </span>
            <span className="text-rose-700 dark:text-rose-300 shrink-0 ml-3">
              {t.clicks} clicks · {fmtCurrency(t.spend)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchTermsSection({
  terms,
  summary,
}: {
  terms: SearchTerm[];
  summary?: SearchTermSummary;
}) {
  const [filter, setFilter] = useState<TermFilter>("all");

  const FILTERS: { id: TermFilter; label: string }[] = [
    { id: "all", label: "All Terms" },
    { id: "wasteful", label: "Wasteful" },
    { id: "opportunity", label: "KW Opportunity" },
    { id: "high_performing", label: "High Performing" },
    { id: "negative_candidates", label: "Negative Candidates" },
  ];

  const filtered = terms.filter((t) => {
    if (filter === "wasteful") return t.clicks >= 30 && t.conversions === 0 && t.spend > 10;
    if (filter === "opportunity") return t.conversions >= 2 && !t.isKeyword;
    if (filter === "high_performing") return t.conversions >= 3 && t.roas > 3;
    if (filter === "negative_candidates") return t.clicks >= 20 && t.conversions === 0 && t.spend > 10;
    return true;
  });

  const cols: ColDef<SearchTerm>[] = [
    {
      key: "searchTerm", header: "Search Term", accessor: (r) => r.searchTerm,
      render: (r) => (
        <div className="max-w-[200px]">
          <p className="text-xs font-medium truncate" title={r.searchTerm}>{r.searchTerm}</p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <IntentBadge intent={r.intent} />
            {!r.isKeyword && r.conversions >= 2 && (
              <span className="rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 px-1.5 py-0.5 text-[9px] font-semibold">
                + KW opp
              </span>
            )}
            {r.clicks >= 20 && r.conversions === 0 && r.spend > 10 && (
              <span className="rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 px-1.5 py-0.5 text-[9px] font-semibold">
                neg candidate
              </span>
            )}
          </div>
        </div>
      ),
    },
    { key: "campaign", header: "Campaign", accessor: (r) => r.campaign, render: (r) => <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{r.campaign}</span> },
    { key: "clicks", header: "Clicks", accessor: (r) => r.clicks, align: "right", render: (r) => fmtNumber(r.clicks) },
    { key: "conversions", header: "Conv.", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
    {
      key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right",
      render: (r) => r.roas === 0 ? "—" : (
        <span className={cn(r.roas >= 3 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "")}>{fmtRoas(r.roas)}</span>
      ),
    },
    {
      key: "cpa", header: "CPA", accessor: (r) => r.cpa === 0 ? 99999 : r.cpa, align: "right",
      render: (r) => r.conversions === 0 ? <span className="text-rose-600 dark:text-rose-400">—</span> : fmtCurrency(r.cpa),
    },
    { key: "revenue", header: "Conv. Value", accessor: (r) => r.revenue, align: "right", render: (r) => fmtCurrency(r.revenue) },
    { key: "ctr", header: "CTR", accessor: (r) => r.ctr, align: "right", render: (r) => `${r.ctr.toFixed(1)}%` },
    {
      key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right",
      render: (r) => (
        <span className={cn(r.spend > 50 && r.conversions === 0 ? "text-rose-600 dark:text-rose-400 font-semibold" : "")}>
          {fmtCurrency(r.spend)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {summary && (
        <div className="flex flex-wrap gap-3 rounded-xl border bg-muted/30 px-4 py-3">
          {summary.wastefulSpend > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{fmtCurrency(summary.wastefulSpend)}</span> wasted on zero-conv terms
              </span>
            </div>
          )}
          {summary.keywordOpportunities > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{summary.keywordOpportunities}</span> converting terms not yet keywords
              </span>
            </div>
          )}
          {summary.highPerformingCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{summary.highPerformingCount}</span> high-performing terms
              </span>
            </div>
          )}
        </div>
      )}

      {/* Callout cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <PromotionOpportunities terms={terms} />
        <NegativeKeywordSuggestions terms={terms} />
      </div>

      {/* Intent distribution */}
      <IntentDistribution terms={terms} />

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground/50 hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <SimpleTable cols={cols} rows={filtered} defaultSort="spend" emptyText="No search terms match this filter." />
    </div>
  );
}

// ── Keywords Section ───────────────────────────────────────────────────

type KwFilter = "all" | "wasting" | "high_qs" | "low_conv";

function KeywordsSection({
  keywords,
  insights,
}: {
  keywords: Keyword[];
  insights?: KeywordInsights;
}) {
  const [kwFilter, setKwFilter] = useState<KwFilter>("all");

  const KW_FILTERS: { id: KwFilter; label: string }[] = [
    { id: "all", label: "All Keywords" },
    { id: "wasting", label: "Wasting Spend" },
    { id: "high_qs", label: "High QS" },
    { id: "low_conv", label: "High CTR, Low Conv." },
  ];

  const filtered = keywords.filter((k) => {
    if (kwFilter === "wasting") return k.spend > 50 && k.conversions === 0 && k.clicks >= 20;
    if (kwFilter === "high_qs") return (k.qualityScore ?? 0) >= 8;
    if (kwFilter === "low_conv") return k.ctr > 3 && k.conversions === 0 && k.clicks >= 30;
    return true;
  });

  const cols: ColDef<Keyword>[] = [
    {
      key: "keyword", header: "Keyword", accessor: (r) => r.keyword,
      render: (r) => (
        <div className="max-w-[180px]">
          <p className="text-xs font-medium truncate" title={r.keyword}>{r.keyword}</p>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", MATCH_TYPE_CONFIG[r.matchType] ?? "bg-muted text-muted-foreground")}>
            {r.matchType}
          </span>
          {(r.expectedCtr || r.adRelevance || r.landingPageExperience) && (
            <p className="mt-1 text-[9px] text-muted-foreground">
              {r.expectedCtr ?? "n/a"} CTR · {r.adRelevance ?? "n/a"} rel · {r.landingPageExperience ?? "n/a"} LP
            </p>
          )}
        </div>
      ),
    },
    { key: "campaign", header: "Campaign", accessor: (r) => r.campaign, render: (r) => <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{r.campaign}</span> },
    { key: "spend", header: "Spend", accessor: (r) => r.spend, align: "right", render: (r) => (
      <span className={cn(r.spend > 50 && r.conversions === 0 ? "text-rose-600 dark:text-rose-400 font-semibold" : "")}>
        {fmtCurrency(r.spend)}
      </span>
    )},
    { key: "conversions", header: "Conv.", accessor: (r) => r.conversions, align: "right", render: (r) => fmtNumber(r.conversions) },
    { key: "cpa", header: "CPA", accessor: (r) => r.cpa === 0 ? 99999 : r.cpa, align: "right", render: (r) => r.conversions === 0 ? "—" : fmtCurrency(r.cpa) },
    {
      key: "roas", header: "ROAS", accessor: (r) => r.roas, align: "right",
      render: (r) => r.roas === 0 ? "—" : (
        <span className={cn(r.roas >= 3 ? "text-emerald-600 dark:text-emerald-400" : "")}>{fmtRoas(r.roas)}</span>
      ),
    },
    {
      key: "qualityScore", header: "QS", accessor: (r) => r.qualityScore ?? 0, align: "right",
      render: (r) => <QsIndicator score={r.qualityScore} />,
    },
    {
      key: "impressionShare", header: "IS", accessor: (r) => r.impressionShare ?? 0, align: "right",
      render: (r) => r.impressionShare != null ? `${(r.impressionShare * 100).toFixed(0)}%` : "—",
    },
    { key: "ctr", header: "CTR", accessor: (r) => r.ctr, align: "right", render: (r) => `${r.ctr.toFixed(1)}%` },
    { key: "clicks", header: "Clicks", accessor: (r) => r.clicks, align: "right", render: (r) => fmtNumber(r.clicks) },
  ];

  return (
    <div className="space-y-4">
      {insights && (
        <div className="flex flex-wrap gap-3 rounded-xl border bg-muted/30 px-4 py-3">
          {insights.highCtrLowConvCount > 0 && (
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-amber-600 dark:text-amber-400">{insights.highCtrLowConvCount}</span> keywords: high CTR, zero conversions
            </span>
          )}
          {insights.highConvLowBudgetCount > 0 && (
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-blue-600 dark:text-blue-400">{insights.highConvLowBudgetCount}</span> keywords with conversions but low impression share
            </span>
          )}
          {insights.deserveOwnAdGroupCount > 0 && (
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-violet-600 dark:text-violet-400">{insights.deserveOwnAdGroupCount}</span> keywords may deserve their own ad group
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {KW_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setKwFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              kwFilter === f.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground/50 hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <SimpleTable cols={cols} rows={filtered} defaultSort="spend" emptyText="No keywords match this filter." />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

interface SearchIntelligenceTabProps {
  terms?: SearchTerm[];
  termsSummary?: SearchTermSummary;
  keywords?: Keyword[];
  keywordInsights?: KeywordInsights;
  isLoadingTerms: boolean;
  isLoadingKeywords: boolean;
}

export function SearchIntelligenceTab({
  terms,
  termsSummary,
  keywords,
  keywordInsights,
  isLoadingTerms,
  isLoadingKeywords,
}: SearchIntelligenceTabProps) {
  const [subTab, setSubTab] = useState<SubTab>("search-terms");

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: "search-terms", label: "Search Terms" },
    { id: "keywords", label: "Keywords" },
  ];

  const isLoading = subTab === "search-terms" ? isLoadingTerms : isLoadingKeywords;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <SectionLabel>Search Intelligence</SectionLabel>
          <p className="text-xs text-muted-foreground mt-0.5">
            Understand where your search budget is working, where it is wasted, and which terms deserve promotion.
          </p>
        </div>
        <SubTabNav tabs={SUB_TABS} active={subTab} onChange={setSubTab} />
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : subTab === "search-terms" ? (
        !terms || terms.length === 0 ? (
          <TabEmpty message="No search term data found. Requires Search campaigns with search term reporting enabled." />
        ) : (
          <SearchTermsSection terms={terms} summary={termsSummary} />
        )
      ) : (
        !keywords || keywords.length === 0 ? (
          <TabEmpty message="No keyword data found for this period." />
        ) : (
          <KeywordsSection keywords={keywords} insights={keywordInsights} />
        )
      )}
    </div>
  );
}
