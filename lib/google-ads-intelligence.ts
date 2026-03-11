/**
 * Google Ads Intelligence — Rule-Based Insight Engine
 *
 * Produces actionable insights from Google Ads performance data.
 * All rules are deterministic — no AI API calls.
 */

// ── Types ────────────────────────────────────────────────────────────

export type InsightSeverity = "critical" | "warning" | "opportunity" | "positive";

export interface GadsInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  evidence?: string;
  recommendation?: string;
}

export interface GadsOpportunity {
  id: string;
  type:
    | "budget_shift"
    | "negative_keyword"
    | "new_keyword"
    | "ad_copy"
    | "audience_expansion"
    | "creative_test"
    | "bid_adjustment";
  title: string;
  whyItMatters: string;
  evidence: string;
  expectedImpact: string;
  effort: "low" | "medium" | "high";
  priority: "high" | "medium" | "low";
}

export interface GadsCampaignRow {
  id: string;
  name: string;
  status: string;
  channel: string;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  impressions: number;
  clicks: number;
  impressionShare?: number;
  lostIsBudget?: number;
  lostIsRank?: number;
  budget?: number;
}

export interface GadsKeywordRow {
  keyword: string;
  matchType: string;
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
  qualityScore?: number;
  impressionShare?: number;
}

export interface GadsSearchTermRow {
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
  isKeyword?: boolean;
}

export interface GadsAdRow {
  id: string;
  headline?: string;
  description?: string;
  campaign: string;
  adGroup: string;
  spend: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpa: number;
  impressions: number;
}

// ── Query Intent Classification ───────────────────────────────────────

export type SearchIntent = "transactional" | "commercial" | "informational" | "navigational";

const TRANSACTIONAL_SIGNALS = [
  "buy", "purchase", "order", "checkout", "deal", "discount", "sale", "cheap", "coupon",
  "promo", "free shipping", "get", "shop", "store",
];
const COMMERCIAL_SIGNALS = [
  "best", "top", "review", "compare", "vs", "versus", "alternative", "recommended",
  "rated", "ranking", "worth it", "price", "cost", "how much",
];
const INFORMATIONAL_SIGNALS = [
  "what is", "how to", "why", "when", "guide", "tutorial", "definition", "explain",
  "learn", "difference between",
];
const NAVIGATIONAL_SIGNALS = ["login", "sign in", "contact", "support", "website", "official"];

export function classifySearchIntent(term: string): SearchIntent {
  const lower = term.toLowerCase();
  if (NAVIGATIONAL_SIGNALS.some((s) => lower.includes(s))) return "navigational";
  if (TRANSACTIONAL_SIGNALS.some((s) => lower.includes(s))) return "transactional";
  if (COMMERCIAL_SIGNALS.some((s) => lower.includes(s))) return "commercial";
  if (INFORMATIONAL_SIGNALS.some((s) => lower.includes(s))) return "informational";
  return "commercial"; // default
}

// ── Insight Badges for Campaigns ─────────────────────────────────────

export type CampaignBadge = "budget_limited" | "low_roas" | "high_cpa" | "strong_performer" | "wasted_spend";

export function getCampaignBadges(
  campaign: GadsCampaignRow,
  accountAvgRoas: number,
  accountAvgCpa: number
): CampaignBadge[] {
  const badges: CampaignBadge[] = [];

  if ((campaign.lostIsBudget ?? 0) > 0.2) badges.push("budget_limited");
  if (campaign.spend > 100 && campaign.conversions === 0) badges.push("wasted_spend");
  else if (campaign.roas < accountAvgRoas * 0.5 && campaign.spend > 50) badges.push("low_roas");
  if (campaign.cpa > accountAvgCpa * 1.5 && campaign.conversions > 0) badges.push("high_cpa");
  if (campaign.roas > accountAvgRoas * 1.3 && campaign.conversions > 5) badges.push("strong_performer");

  return badges;
}

// ── Overview Insights ─────────────────────────────────────────────────

export function generateOverviewInsights(params: {
  campaigns: GadsCampaignRow[];
  totalSpend: number;
  totalConversions: number;
  totalRevenue: number;
  roas: number;
  cpa: number;
}): GadsInsight[] {
  const insights: GadsInsight[] = [];
  const { campaigns, totalSpend, totalConversions, roas, cpa } = params;

  if (campaigns.length === 0) return insights;

  // Brand vs non-brand ROAS
  const brandCampaigns = campaigns.filter((c) =>
    /brand|branded/i.test(c.name)
  );
  const nonBrandCampaigns = campaigns.filter(
    (c) => !/brand|branded/i.test(c.name)
  );
  if (brandCampaigns.length > 0 && nonBrandCampaigns.length > 0) {
    const brandRoas =
      brandCampaigns.reduce((s, c) => s + c.revenue, 0) /
      (brandCampaigns.reduce((s, c) => s + c.spend, 0) || 1);
    const nonBrandRoas =
      nonBrandCampaigns.reduce((s, c) => s + c.revenue, 0) /
      (nonBrandCampaigns.reduce((s, c) => s + c.spend, 0) || 1);
    if (brandRoas > nonBrandRoas * 1.5) {
      insights.push({
        id: "brand_roas_gap",
        severity: "opportunity",
        title: "Brand campaigns outperform non-brand",
        description: `Brand ROAS is ${brandRoas.toFixed(1)}x vs ${nonBrandRoas.toFixed(1)}x for non-brand.`,
        evidence: `${brandCampaigns.length} brand campaigns, ${nonBrandCampaigns.length} non-brand`,
        recommendation: "Consider protecting brand terms with exact-match bidding while expanding non-brand coverage.",
      });
    }
  }

  // Shopping revenue share
  const shoppingCampaigns = campaigns.filter((c) =>
    c.channel === "Shopping" || c.channel === "Performance Max"
  );
  if (shoppingCampaigns.length > 0 && params.totalRevenue > 0) {
    const shoppingRevenue = shoppingCampaigns.reduce((s, c) => s + c.revenue, 0);
    const pct = Math.round((shoppingRevenue / params.totalRevenue) * 100);
    if (pct >= 40) {
      insights.push({
        id: "shopping_dominance",
        severity: "positive",
        title: `Shopping campaigns drive ${pct}% of revenue`,
        description: "Shopping / Performance Max is your primary revenue channel.",
        recommendation: "Ensure product feeds are optimised with accurate prices, titles, and availability.",
      });
    }
  }

  // Campaigns losing IS due to budget
  const budgetLimited = campaigns.filter((c) => (c.lostIsBudget ?? 0) > 0.2);
  if (budgetLimited.length > 0) {
    insights.push({
      id: "budget_limited_is",
      severity: "warning",
      title: `${budgetLimited.length} campaign${budgetLimited.length > 1 ? "s" : ""} losing impression share due to budget`,
      description: "These campaigns are eligible for more impressions but are constrained by daily budget.",
      evidence: budgetLimited
        .slice(0, 3)
        .map((c) => `${c.name} (${Math.round((c.lostIsBudget ?? 0) * 100)}% lost)`)
        .join(", "),
      recommendation: "Increase budgets on high-ROAS budget-limited campaigns.",
    });
  }

  // Zero-conversion waste
  const wasteCampaigns = campaigns.filter(
    (c) => c.spend > 200 && c.conversions === 0
  );
  if (wasteCampaigns.length > 0) {
    const wastedSpend = wasteCampaigns.reduce((s, c) => s + c.spend, 0);
    insights.push({
      id: "zero_conversion_waste",
      severity: "critical",
      title: `$${wastedSpend.toFixed(0)} spent with zero conversions`,
      description: `${wasteCampaigns.length} campaign${wasteCampaigns.length > 1 ? "s have" : " has"} generated spend but no conversions.`,
      evidence: wasteCampaigns
        .slice(0, 3)
        .map((c) => `${c.name}: $${c.spend.toFixed(0)}`)
        .join(", "),
      recommendation: "Pause underperforming campaigns or revise targeting and landing pages.",
    });
  }

  return insights;
}

// ── Search Term Insights ──────────────────────────────────────────────

export function classifySearchTerms(terms: GadsSearchTermRow[]): {
  wasteful: GadsSearchTermRow[];
  negativeKeywordCandidates: GadsSearchTermRow[];
  highPerforming: GadsSearchTermRow[];
  keywordOpportunities: GadsSearchTermRow[];
} {
  const wasteful = terms.filter(
    (t) => t.clicks >= 50 && t.conversions === 0 && t.spend > 20
  );
  const negativeKeywordCandidates = terms.filter(
    (t) => t.clicks >= 20 && t.conversions === 0 && t.spend > 10 && !t.isKeyword
  );
  const highPerforming = terms.filter(
    (t) => t.conversions >= 3 && (t.roas > 3 || t.cpa < 50)
  );
  const keywordOpportunities = terms.filter(
    (t) => t.conversions >= 2 && !t.isKeyword
  );

  return { wasteful, negativeKeywordCandidates, highPerforming, keywordOpportunities };
}

// ── Opportunities Engine ──────────────────────────────────────────────

export function generateOpportunities(params: {
  campaigns: GadsCampaignRow[];
  keywords: GadsKeywordRow[];
  searchTerms: GadsSearchTermRow[];
  ads: GadsAdRow[];
  accountAvgRoas: number;
  accountAvgCpa: number;
}): GadsOpportunity[] {
  const opps: GadsOpportunity[] = [];
  const { campaigns, keywords, searchTerms, ads, accountAvgRoas, accountAvgCpa } = params;

  // 1. Budget shift opportunities
  const highRoasLowBudgetLimited = campaigns.filter(
    (c) => c.roas > accountAvgRoas * 1.2 && (c.lostIsBudget ?? 0) > 0.15
  );
  if (highRoasLowBudgetLimited.length > 0) {
    const lowRoasHighSpend = campaigns.filter(
      (c) => c.roas < accountAvgRoas * 0.6 && c.spend > 100
    );
    if (lowRoasHighSpend.length > 0) {
      const budgetToShift = Math.min(
        lowRoasHighSpend.reduce((s, c) => s + c.spend * 0.2, 0),
        5000
      );
      opps.push({
        id: "budget_shift",
        type: "budget_shift",
        title: "Reallocate budget from low-ROAS to high-ROAS campaigns",
        whyItMatters:
          "High-performing campaigns are constrained while low-performers consume budget.",
        evidence: `${highRoasLowBudgetLimited.map((c) => c.name).slice(0, 2).join(", ")} limited by budget; ${lowRoasHighSpend.map((c) => c.name).slice(0, 2).join(", ")} underperforming.`,
        expectedImpact: `+15–30% revenue with ~$${budgetToShift.toFixed(0)} shifted`,
        effort: "low",
        priority: "high",
      });
    }
  }

  // 2. Negative keyword opportunities
  const wasteTerms = searchTerms.filter(
    (t) => t.clicks >= 30 && t.conversions === 0 && t.spend > 15
  );
  if (wasteTerms.length >= 5) {
    const totalWaste = wasteTerms.reduce((s, t) => s + t.spend, 0);
    opps.push({
      id: "negative_keywords",
      type: "negative_keyword",
      title: `Add ${wasteTerms.length} negative keywords to stop $${totalWaste.toFixed(0)} in wasted spend`,
      whyItMatters: "These search terms consume budget without converting.",
      evidence: wasteTerms
        .slice(0, 4)
        .map((t) => `"${t.searchTerm}" (${t.clicks} clicks, $${t.spend.toFixed(0)})`)
        .join("; "),
      expectedImpact: `Recover $${totalWaste.toFixed(0)}/period + improved Quality Scores`,
      effort: "low",
      priority: "high",
    });
  }

  // 3. New keyword opportunities from search terms
  const keywordOpps = searchTerms.filter(
    (t) => t.conversions >= 2 && !t.isKeyword
  );
  if (keywordOpps.length > 0) {
    opps.push({
      id: "new_keywords",
      type: "new_keyword",
      title: `${keywordOpps.length} converting search term${keywordOpps.length > 1 ? "s" : ""} not yet a keyword`,
      whyItMatters:
        "Adding these as exact-match keywords gives you bid control and prevents budget bleeding.",
      evidence: keywordOpps
        .slice(0, 4)
        .map((t) => `"${t.searchTerm}" (${t.conversions} conv, ROAS ${t.roas.toFixed(1)}x)`)
        .join("; "),
      expectedImpact: "+10–25% conversion efficiency on these terms",
      effort: "low",
      priority: "high",
    });
  }

  // 4. Ad copy improvement
  if (ads.length >= 4) {
    const sortedByConv = [...ads].sort((a, b) => b.conversions - a.conversions);
    const topAds = sortedByConv.slice(0, Math.ceil(ads.length * 0.25));
    const bottomAds = sortedByConv.slice(Math.floor(ads.length * 0.75));
    const topCtr = topAds.reduce((s, a) => s + a.ctr, 0) / (topAds.length || 1);
    const bottomCtr = bottomAds.reduce((s, a) => s + a.ctr, 0) / (bottomAds.length || 1);
    if (topCtr > bottomCtr * 1.5) {
      opps.push({
        id: "ad_copy_improvement",
        type: "ad_copy",
        title: "Top ads significantly outperform bottom ads — pause and learn",
        whyItMatters: "Removing weak ads forces budget toward high-performers and raises Quality Score.",
        evidence: `Top-quartile CTR: ${topCtr.toFixed(1)}% vs bottom-quartile: ${bottomCtr.toFixed(1)}%`,
        expectedImpact: "+10–20% CTR improvement across ad groups",
        effort: "low",
        priority: "medium",
      });
    }
  }

  // 5. Keywords with high QS but low impression share
  const highQsLowIs = keywords.filter(
    (k) => (k.qualityScore ?? 0) >= 8 && (k.impressionShare ?? 1) < 0.4 && k.conversions > 0
  );
  if (highQsLowIs.length > 0) {
    opps.push({
      id: "high_qs_low_is",
      type: "bid_adjustment",
      title: `${highQsLowIs.length} high Quality Score keyword${highQsLowIs.length > 1 ? "s" : ""} have low impression share`,
      whyItMatters:
        "High QS keywords are underserved — increasing bids or budgets would yield efficient growth.",
      evidence: highQsLowIs
        .slice(0, 3)
        .map((k) => `"${k.keyword}" (QS ${k.qualityScore}, IS ${Math.round((k.impressionShare ?? 0) * 100)}%)`)
        .join("; "),
      expectedImpact: "+20–40% impression volume with low CPC increase",
      effort: "low",
      priority: "medium",
    });
  }

  // 6. Zero-conversion keywords (high spend)
  const wastedKeywords = keywords.filter(
    (k) => k.spend > 50 && k.conversions === 0 && k.clicks >= 20
  );
  if (wastedKeywords.length > 0) {
    const totalWaste = wastedKeywords.reduce((s, k) => s + k.spend, 0);
    opps.push({
      id: "keyword_waste",
      type: "negative_keyword",
      title: `${wastedKeywords.length} keyword${wastedKeywords.length > 1 ? "s" : ""} spending $${totalWaste.toFixed(0)} with zero conversions`,
      whyItMatters: "These keywords drain budget without contributing to goals.",
      evidence: wastedKeywords
        .slice(0, 3)
        .map((k) => `"${k.keyword}" ($${k.spend.toFixed(0)}, ${k.clicks} clicks)`)
        .join("; "),
      expectedImpact: `Recover $${totalWaste.toFixed(0)}/period`,
      effort: "low",
      priority: "high",
    });
  }

  // Sort: high → medium → low
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  return opps.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

// ── Budget Intelligence ───────────────────────────────────────────────

export interface BudgetRecommendation {
  campaign: string;
  currentSpend: number;
  suggestedBudgetChange: number;
  direction: "increase" | "decrease";
  reason: string;
}

export function generateBudgetRecommendations(
  campaigns: GadsCampaignRow[],
  accountAvgRoas: number
): BudgetRecommendation[] {
  const recs: BudgetRecommendation[] = [];

  for (const c of campaigns) {
    if (c.roas > accountAvgRoas * 1.3 && (c.lostIsBudget ?? 0) > 0.15) {
      const suggested = Math.min(c.spend * 0.3, 2000);
      recs.push({
        campaign: c.name,
        currentSpend: c.spend,
        suggestedBudgetChange: suggested,
        direction: "increase",
        reason: `ROAS ${c.roas.toFixed(1)}x (above avg) but losing ${Math.round((c.lostIsBudget ?? 0) * 100)}% IS to budget`,
      });
    } else if (c.spend > 100 && c.roas < accountAvgRoas * 0.4 && c.conversions < 2) {
      const suggested = c.spend * 0.5;
      recs.push({
        campaign: c.name,
        currentSpend: c.spend,
        suggestedBudgetChange: -suggested,
        direction: "decrease",
        reason: `Low ROAS ${c.roas.toFixed(1)}x with only ${c.conversions} conversion${c.conversions !== 1 ? "s" : ""}`,
      });
    }
  }

  return recs.sort((a, b) => Math.abs(b.suggestedBudgetChange) - Math.abs(a.suggestedBudgetChange));
}

// ── Formatting helpers ────────────────────────────────────────────────

export function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function fmtPercent(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

export function fmtRoas(n: number): string {
  return `${n.toFixed(2)}x`;
}
