/**
 * Google Ads Intelligence — Rule-Based Insight Engine
 *
 * Produces actionable insights from Google Ads performance data.
 * All rules are deterministic — no AI API calls.
 */
import type { AppLanguage } from "@/lib/i18n";

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
    | "bid_adjüstment"
    | "asset_refresh"
    | "asset_group_fix"
    | "product_scale"
    | "product_reduce"
    | "search_theme_alignment";
  title: string;
  whyItMatters: string;
  evidence: string;
  expectedImpact: string;
  impact: string;
  confidence: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  priority: "high" | "medium" | "low";
  recommendedAction: string;
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
  language?: AppLanguage;
}): GadsInsight[] {
  const insights: GadsInsight[] = [];
  const { campaigns, totalSpend, totalConversions, roas, cpa, language = "en" } = params;
  const tr = (english: string, turkish: string) => (language === "tr" ? turkish : english);

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
        title: tr("Brand campaigns outperform non-brand", "Brand kampanyalari genel aramaya göre daha güçlü"),
        description: tr(
          `Brand ROAS is ${brandRoas.toFixed(1)}x vs ${nonBrandRoas.toFixed(1)}x for non-brand.`,
          `Brand ROAS ${brandRoas.toFixed(1)}x seviyesinde; genel arama tarafinda ise ${nonBrandRoas.toFixed(1)}x.`
        ),
        evidence: `${brandCampaigns.length} brand campaigns, ${nonBrandCampaigns.length} non-brand`,
        recommendation: tr("Consider protecting brand terms with exact-match bidding while expanding non-brand coverage.", "Brand terimlerini exact-match tarafta korurken genel arama kapsamını kontrollü biçimde genişletin."),
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
        title: tr(`Shopping campaigns drive ${pct}% of revenue`, `Gelirin %${pct}'i Shopping tarafindan geliyor`),
        description: tr("Shopping / Performance Max is your primary revenue channel.", "Shopping / PMax tarafi su anda ana gelir kanalini tasiyor."),
        recommendation: tr("Ensure product feeds are optimised with accurate prices, titles, and availability.", "Product feed tarafinda fiyat, title ve stok bilgisinin temiz ve güncel kaldigindan emin olun."),
      });
    }
  }

  // Campaigns losing IS due to budget
  const budgetLimited = campaigns.filter((c) => (c.lostIsBudget ?? 0) > 0.2);
  if (budgetLimited.length > 0) {
    insights.push({
      id: "budget_limited_is",
      severity: "warning",
      title: tr(`${budgetLimited.length} campaign${budgetLimited.length > 1 ? "s" : ""} losing impression share due to budget`, `${budgetLimited.length} kampanya bütçeye takildigi için impression share kaybediyor`),
      description: tr("These campaigns are eligible for more impressions but are constrained by daily budget.", "Bu kampanyalar daha fazla impression alma potansiyeline sahip ama gunluk bütçe tarafinda erken kisiliyor."),
      evidence: budgetLimited
        .slice(0, 3)
        .map((c) => `${c.name} (${Math.round((c.lostIsBudget ?? 0) * 100)}% lost)`)
        .join(", "),
      recommendation: tr("Increase budgets on high-ROAS budget-limited campaigns.", "ROAS'i güçlü olup bütçeye takilan kampanyalarda bütçeyi kontrollu bicimde artırın."),
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
      title: tr(`$${wastedSpend.toFixed(0)} spent with zero conversions`, `$${wastedSpend.toFixed(0)} harcamaya ragmen conversion yok`),
      description: tr(
        `${wasteCampaigns.length} campaign${wasteCampaigns.length > 1 ? "s have" : " has"} generated spend but no conversions.`,
        `${wasteCampaigns.length} kampanya spend urettigi halde hic conversion getirmedi.`
      ),
      evidence: wasteCampaigns
        .slice(0, 3)
        .map((c) => `${c.name}: $${c.spend.toFixed(0)}`)
        .join(", "),
      recommendation: tr("Pause underperforming campaigns or revise targeting and landing pages.", "Zayıf kampanyalari durdürün; targeting ve landing page tarafini yeniden degerlendirin."),
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
  language?: AppLanguage;
}): GadsOpportunity[] {
  const opps: GadsOpportunity[] = [];
  const { campaigns, keywords, searchTerms, ads, accountAvgRoas, accountAvgCpa, language = "en" } = params;
  const tr = (english: string, turkish: string) => (language === "tr" ? turkish : english);

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
        title: tr("Reallocate budget from low-ROAS to high-ROAS campaigns", "Butceyi düşük ROAS kampanyalardan güçlü kampanyalara kaydır"),
        whyItMatters:
          tr("High-performing campaigns are constrained while low-performers consume budget.", "Güçlü kampanyalar kısıtli kalirken zayıf kampanyalar bütçe yemeye devam ediyor."),
        evidence: `${highRoasLowBudgetLimited.map((c) => c.name).slice(0, 2).join(", ")} limited by budget; ${lowRoasHighSpend.map((c) => c.name).slice(0, 2).join(", ")} underperforming.`,
        expectedImpact: `+15–30% revenue with ~$${budgetToShift.toFixed(0)} shifted`,
        impact: tr("Revenue growth", "Gelir artisi"),
        confidence: "high",
        effort: "low",
        priority: "high",
        recommendedAction:
          tr("Move incremental budget away from weak campaigns and into high-ROAS campaigns that are losing impression share to budget.", "Ek bütçeyi zayıf kampanyalardan cekip bütçe nedeniyle kisilan güçlü kampanyalara aktarın."),
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
      title: tr(`Add ${wasteTerms.length} negative keywords to stop $${totalWaste.toFixed(0)} in wasted spend`, `$${totalWaste.toFixed(0)} boş harcamayı kesmek için ${wasteTerms.length} negative keyword ekle`),
      whyItMatters: tr("These search terms consume budget without converting.", "Bu search term'ler bütçe harciyor ama conversion getirmiyor."),
      evidence: wasteTerms
        .slice(0, 4)
        .map((t) => `"${t.searchTerm}" (${t.clicks} clicks, $${t.spend.toFixed(0)})`)
        .join("; "),
      expectedImpact: tr(
        `Recover $${totalWaste.toFixed(0)}/period + improved Quality Scores`,
        `Dönem başına yaklaşık $${totalWaste.toFixed(0)} boş harcamayı geri kazanma ve Quality Score tarafinda iyileşme`
      ),
      impact: tr("Waste reduction", "Boş harcamayı azaltma"),
      confidence: "high",
      effort: "low",
      priority: "high",
      recommendedAction:
        tr("Add the worst terms as negatives at the campaign or shared-list level, then review the query mix after one reporting window.", "En zayıf term'leri campaign veya ortak negative liste seviyesinde ekleyin; bir raporlama periyodu sonra query karmasini yeniden inceleyin."),
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
      title: tr(`${keywordOpps.length} converting search term${keywordOpps.length > 1 ? "s" : ""} not yet a keyword`, `${keywordOpps.length} conversion getiren search term hala keyword olarak yok`),
      whyItMatters:
        tr(
          "Adding these as exact-match keywords gives you bid control and prevents budget bleeding.",
          "Bu query'leri exact-match keyword olarak ayirmak hem bid kontrolü verir hem de bütçenin genis trafikte dagilmasini azaltir."
        ),
      evidence: keywordOpps
        .slice(0, 4)
        .map((t) => `"${t.searchTerm}" (${t.conversions} conv, ROAS ${t.roas.toFixed(1)}x)`)
        .join("; "),
      expectedImpact: "+10–25% conversion efficiency on these terms",
      impact: tr("Efficiency gain", "Verimlilik artisi"),
      confidence: "high",
      effort: "low",
      priority: "high",
      recommendedAction:
        tr("Promote the best converting queries into exact-match keywords and separate them from broader exploratory traffic.", "En iyi conversion getiren query'leri exact-match keyword olarak ayirin ve daha genis keşif trafiğinden bağımsız yonetin."),
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
        title: tr("Top ads significantly outperform bottom ads — pause and learn", "En iyi reklamlar ile zayıf reklamlar arasinda net fark var"),
        whyItMatters: tr(
          "Removing weak ads forces budget toward high-performers and raises Quality Score.",
          "Zayıf reklamlar açık kaldikca bütçe gereksiz yere dagiliyor. Güçlü acilara daha fazla gösterim vermek Quality Score tarafini da destekler."
        ),
        evidence: `Top-quartile CTR: ${topCtr.toFixed(1)}% vs bottom-quartile: ${bottomCtr.toFixed(1)}%`,
        expectedImpact: "+10–20% CTR improvement across ad groups",
        impact: tr("Creative lift", "Creative performans artisi"),
        confidence: "medium",
        effort: "low",
        priority: "medium",
        recommendedAction:
          tr("Pause the weakest ads, copy the strongest angles into new variants, and keep one challenger running per ad group.", "En zayıf reklamları kapatin, en güçlü açıları yeni varyantlara taşıyın ve her ad group'ta bir alternatif test açık bırakın."),
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
      type: "bid_adjüstment",
      title: tr(`${highQsLowIs.length} high Quality Score keyword${highQsLowIs.length > 1 ? "s" : ""} have low impression share`, `${highQsLowIs.length} yüksek Quality Score keyword yeterince gösterim alamiyor`),
      whyItMatters:
        tr(
          "High QS keywords are underserved — increasing bids or budgets would yield efficient growth.",
          "Quality Score'u yüksek bu keyword'ler yeterince teslimat almiyor. Dogru destekle verimli büyüme alanina donebilirler."
        ),
      evidence: highQsLowIs
        .slice(0, 3)
        .map((k) => `"${k.keyword}" (QS ${k.qualityScore}, IS ${Math.round((k.impressionShare ?? 0) * 100)}%)`)
        .join("; "),
      expectedImpact: "+20–40% impression volume with low CPC increase",
      impact: tr("Scale headroom", "Ölçekleme alani"),
      confidence: "medium",
      effort: "low",
      priority: "medium",
      recommendedAction:
        tr("Increase bids or budget support on these high-QS keywords before broadening to lower-quality inventory.", "Daha düşük kaliteli envantere açılmadan önce bu yüksek Quality Score keyword'lerde bid veya bütçe desteğini artırın."),
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
      title: tr(`${wastedKeywords.length} keyword${wastedKeywords.length > 1 ? "s" : ""} spending $${totalWaste.toFixed(0)} with zero conversions`, `${wastedKeywords.length} keyword $${totalWaste.toFixed(0)} harciyor ama conversion getirmiyor`),
      whyItMatters: tr("These keywords drain budget without contributing to goals.", "Bu keyword'ler hedefe katkı vermeden bütçeyi eritiyor."),
      evidence: wastedKeywords
        .slice(0, 3)
        .map((k) => `"${k.keyword}" ($${k.spend.toFixed(0)}, ${k.clicks} clicks)`)
        .join("; "),
      expectedImpact: `Recover $${totalWaste.toFixed(0)}/period`,
      impact: tr("Waste reduction", "Boş harcamayı azaltma"),
      confidence: "high",
      effort: "low",
      priority: "high",
      recommendedAction:
        tr("Reduce bids, pause the weakest keywords, or move the spend into better-converting query coverage.", "Bid'leri geri cekin, en zayıf keyword'leri kapatin veya bütçeyi daha iyi conversion getiren query alanlarina kaydırin."),
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
  accountAvgRoas: number,
  language: AppLanguage = "en"
): BudgetRecommendation[] {
  const recs: BudgetRecommendation[] = [];
  const tr = (english: string, turkish: string) => (language === "tr" ? turkish : english);

  for (const c of campaigns) {
    if (c.roas > accountAvgRoas * 1.3 && (c.lostIsBudget ?? 0) > 0.15) {
      const suggested = Math.min(c.spend * 0.3, 2000);
      recs.push({
        campaign: c.name,
        currentSpend: c.spend,
        suggestedBudgetChange: suggested,
        direction: "increase",
        reason: tr(`ROAS ${c.roas.toFixed(1)}x (above avg) but losing ${Math.round((c.lostIsBudget ?? 0) * 100)}% IS to budget`, `ROAS ${c.roas.toFixed(1)}x ile ortalamanin üstunde; buna ragmen bütçe nedeniyle IS kaybi %${Math.round((c.lostIsBudget ?? 0) * 100)}`),
      });
    } else if (c.spend > 100 && c.roas < accountAvgRoas * 0.4 && c.conversions < 2) {
      const suggested = c.spend * 0.5;
      recs.push({
        campaign: c.name,
        currentSpend: c.spend,
        suggestedBudgetChange: -suggested,
        direction: "decrease",
        reason: tr(`Low ROAS ${c.roas.toFixed(1)}x with only ${c.conversions} conversion${c.conversions !== 1 ? "s" : ""}`, `ROAS ${c.roas.toFixed(1)}x seviyesinde ve yalnızca ${c.conversions} conversion üretiyor`),
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
