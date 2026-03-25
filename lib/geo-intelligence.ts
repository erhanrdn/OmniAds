// ── AI Source Classification ────────────────────────────────────────

export type GeoEngine =
  | "ChatGPT"
  | "Perplexity"
  | "Gemini"
  | "Copilot"
  | "Claude"
  | "You.com"
  | "Phind"
  | "Other AI";

/**
 * Known AI engine referral source domains → human-readable name.
 * Keys are lowercase and matched against GA4 `sessionSource` values.
 */
export const AI_SOURCE_MAP: Record<string, GeoEngine> = {
  "chat.openai.com": "ChatGPT",
  "chatgpt.com": "ChatGPT",
  "perplexity.ai": "Perplexity",
  "gemini.google.com": "Gemini",
  "bard.google.com": "Gemini",
  "copilot.microsoft.com": "Copilot",
  "bing.com": "Copilot", // Bing Copilot referral
  "claude.ai": "Claude",
  "you.com": "You.com",
  "phind.com": "Phind",
  "poe.com": "Other AI",
  "character.ai": "Other AI",
  "kagi.com": "Other AI",
};

export const AI_SOURCE_DOMAINS = Object.keys(AI_SOURCE_MAP);

/**
 * Classify a GA4 sessionSource value into a GeoEngine or null.
 */
export function classifyAiSource(source: string): GeoEngine | null {
  const normalized = source.toLowerCase().trim();
  // Exact match
  if (AI_SOURCE_MAP[normalized]) return AI_SOURCE_MAP[normalized];
  // Partial match (e.g. "perplexity.ai / referral")
  for (const [domain, engine] of Object.entries(AI_SOURCE_MAP)) {
    if (normalized.includes(domain)) return engine;
  }
  return null;
}

/**
 * GA4 dimension filter for AI sources (inListFilter).
 * Pass this as `dimensionFilter` to runGA4Report.
 */
export const GA4_AI_SOURCE_FILTER = {
  filter: {
    fieldName: "sessionSource",
    inListFilter: {
      values: AI_SOURCE_DOMAINS,
    },
  },
};

// ── Query Intent Scoring ────────────────────────────────────────────

export type QueryIntent =
  | "Informational"
  | "Navigational"
  | "Transactional"
  | "Commercial";

export interface QueryIntentResult {
  intent: QueryIntent;
  isAiStyle: boolean; // likely to surface in AI answer engines
  opportunityLabel: string | null;
}

const INFORMATIONAL_PREFIXES = [
  "best ",
  "how to ",
  "how do i ",
  "what is ",
  "what are ",
  "why is ",
  "why do ",
  "guide to ",
  "guide for ",
  "ideas for ",
  "examples of ",
  "top ",
  "list of ",
  "types of ",
  "ways to ",
  "tips for ",
  "tips on ",
  "review of ",
  "history of ",
  "difference between ",
  "when to ",
  "where to ",
];

const COMMERCIAL_SIGNALS = [
  " buy",
  " price",
  " cheap",
  " affordable",
  " deal",
  " discount",
  " shop",
  " order",
  " purchase",
  " sale",
];

const COMPARISON_SIGNALS = [" vs ", " versus ", " compared to ", " vs. "];

const NAVIGATIONAL_SIGNALS = [".com", ".net", "login", "sign in", "account"];

export function scoreQueryIntent(query: string): QueryIntentResult {
  const q = query.toLowerCase().trim();

  // Navigational
  if (NAVIGATIONAL_SIGNALS.some((s) => q.includes(s))) {
    return { intent: "Navigational", isAiStyle: false, opportunityLabel: null };
  }

  // Transactional / commercial
  const isCommercial = COMMERCIAL_SIGNALS.some((s) => q.includes(s));
  if (isCommercial) {
    return {
      intent: "Transactional",
      isAiStyle: false,
      opportunityLabel: "Strong commercial intent",
    };
  }

  // Comparison
  const isComparison = COMPARISON_SIGNALS.some((s) => q.includes(s));
  if (isComparison) {
    return {
      intent: "Commercial",
      isAiStyle: true,
      opportunityLabel: "Good candidate for comparison content",
    };
  }

  // Informational / AI-style
  const isInformational = INFORMATIONAL_PREFIXES.some((p) => q.startsWith(p));
  if (isInformational) {
    return {
      intent: "Informational",
      isAiStyle: true,
      opportunityLabel: deriveInformationalLabel(q),
    };
  }

  // Long-tail with 5+ words is likely informational
  if (q.split(" ").length >= 5) {
    return {
      intent: "Informational",
      isAiStyle: true,
      opportunityLabel: "Long-tail — good candidate for guide content",
    };
  }

  return { intent: "Informational", isAiStyle: false, opportunityLabel: null };
}

function deriveInformationalLabel(query: string): string {
  if (query.startsWith("best ")) return "Good candidate for buying guide";
  if (query.startsWith("how to ") || query.startsWith("how do i "))
    return "Good candidate for tutorial / how-to";
  if (query.startsWith("what is ") || query.startsWith("what are "))
    return "Good candidate for FAQ expansion";
  if (query.startsWith("ideas for ") || query.startsWith("examples of "))
    return "Good candidate for listicle / ideas content";
  if (query.startsWith("guide to ") || query.startsWith("guide for "))
    return "Expand into full guide";
  return "High informational intent";
}

// ── GEO Score Calculation ───────────────────────────────────────────

/**
 * Compute a 0–100 GEO opportunity score for a page or topic.
 * Combines AI-source traffic, engagement, and query breadth signals.
 */
export function calculateGeoScore(signals: {
  aiSessions?: number;
  totalSessions?: number;
  aiEngagementRate?: number;
  aiPurchaseCvr?: number;
  queryCount?: number;
  avgPosition?: number;
  impressions?: number;
}): number {
  let score = 0;

  // AI traffic share (0–30 pts)
  if (
    signals.aiSessions !== undefined &&
    signals.totalSessions !== undefined &&
    signals.totalSessions > 0
  ) {
    const aiShare = signals.aiSessions / signals.totalSessions;
    score += Math.min(30, aiShare * 300);
  } else if (signals.aiSessions !== undefined && signals.aiSessions > 0) {
    score += Math.min(30, signals.aiSessions * 2);
  }

  // AI engagement quality (0–20 pts)
  if (signals.aiEngagementRate !== undefined) {
    score += Math.min(20, signals.aiEngagementRate * 20);
  }

  // AI purchase CVR signal (0–20 pts)
  if (signals.aiPurchaseCvr !== undefined && signals.aiPurchaseCvr > 0) {
    score += Math.min(20, signals.aiPurchaseCvr * 400);
  }

  // Query breadth (0–15 pts)
  if (signals.queryCount !== undefined) {
    score += Math.min(15, signals.queryCount * 0.5);
  }

  // SC visibility (0–15 pts): impressions + position
  if (signals.impressions !== undefined) {
    score += Math.min(10, signals.impressions / 100);
  }
  if (signals.avgPosition !== undefined && signals.avgPosition > 0) {
    // Lower position = better (closer to 1)
    const posScore = Math.max(0, 5 - (signals.avgPosition - 1) * 0.5);
    score += posScore;
  }

  return Math.min(100, Math.round(score));
}

// ── Topic Clustering ────────────────────────────────────────────────

export interface TopicCluster {
  topic: string;
  queryCount: number;
  impressions: number;
  clicks: number;
  avgPosition: number;
  geoScore: number;
  coverageStrength: "Strong" | "Moderate" | "Weak";
  queries: string[];
}

/**
 * Cluster Search Console queries into topic groups using improved heuristic
 * noun-phrase extraction: normalizes plurals, strips modifiers, 1–3 word stems.
 */
export function clusterQueryTopics(
  queries: Array<{
    query: string;
    impressions: number;
    clicks: number;
    position: number;
  }>
): TopicCluster[] {
  const clusterMap = new Map<
    string,
    {
      impressions: number;
      clicks: number;
      positionSum: number;
      queryCount: number;
      queries: string[];
    }
  >();

  for (const q of queries) {
    const topic = extractTopic(q.query);
    if (!topic) continue;

    const existing = clusterMap.get(topic);
    if (existing) {
      existing.impressions += q.impressions;
      existing.clicks += q.clicks;
      existing.positionSum += q.position;
      existing.queryCount += 1;
      existing.queries.push(q.query);
    } else {
      clusterMap.set(topic, {
        impressions: q.impressions,
        clicks: q.clicks,
        positionSum: q.position,
        queryCount: 1,
        queries: [q.query],
      });
    }
  }

  const clusters: TopicCluster[] = [];
  for (const [topic, data] of clusterMap.entries()) {
    if (data.queryCount < 1) continue;
    const avgPosition = data.positionSum / data.queryCount;
    const geoScore = calculateGeoScore({
      queryCount: data.queryCount,
      impressions: data.impressions,
      avgPosition,
    });
    clusters.push({
      topic,
      queryCount: data.queryCount,
      impressions: data.impressions,
      clicks: data.clicks,
      avgPosition: Math.round(avgPosition * 10) / 10,
      geoScore,
      coverageStrength:
        data.queryCount >= 10
          ? "Strong"
          : data.queryCount >= 4
          ? "Moderate"
          : "Weak",
      queries: data.queries.slice(0, 5),
    });
  }

  // Sort by impressions desc
  return clusters.sort((a, b) => b.impressions - a.impressions).slice(0, 30);
}

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "of", "in", "on", "at", "to", "for", "with", "by", "from", "as",
  "and", "or", "but", "not", "so", "if",
  "my", "your", "our", "its", "their", "his", "her",
  "how", "what", "why", "where", "when", "which", "who", "whom",
  "i", "do", "you", "can", "will", "that", "this", "it",
  "get", "make", "use", "best", "good", "great",
  "very", "more", "most", "some", "any", "all",
]);

const INFORMATIONAL_PREFIXES_RE =
  /^(best |how to |how do i |what is |what are |what's |guide to |guide for |ideas for |examples of |top \d* ?|list of |types of |ways to |tips for |tips on |review of |history of |difference between |when to |where to |why is |why do |why does |can you |should i |is it |are there |does |do |will )/;

const MODIFIER_WORDS = new Set([
  "easy", "simple", "quick", "fast", "cheap", "free", "online", "new",
  "old", "big", "small", "large", "little", "different", "various",
  "common", "popular", "famous", "important", "useful", "effective",
  "complete", "full", "whole", "every", "each", "many", "few",
]);

/**
 * Extract a 1–3 word canonical topic noun phrase from a query.
 * - Strips informational prefixes
 * - Normalises plural → singular for clustering (e.g. "shoes" → "shoe")
 * - Strips leading modifier adjectives
 * - Returns null if the result is too short to be meaningful
 */
function extractTopic(query: string): string | null {
  let q = query.toLowerCase().trim();

  // Iteratively strip prefixes (some queries have stacked prefixes)
  let prev = "";
  while (prev !== q) {
    prev = q;
    q = q.replace(INFORMATIONAL_PREFIXES_RE, "").trim();
  }

  // Strip trailing noise
  q = q
    .replace(/\?$/, "")
    .replace(/\s+(2024|2025|2026|this year|today|now|online|near me|for me|for beginners|for free)$/, "")
    .trim();

  // Tokenise, remove stopwords, strip modifier adjectives
  const words = q
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9'-]/g, ""))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  // Remove leading modifier adjectives (but keep them if it's only 1 word left)
  const filtered =
    words.length > 1
      ? words.filter((w, i) => i > 0 || !MODIFIER_WORDS.has(w))
      : words;

  if (filtered.length === 0) return null;

  // Take first 1–3 meaningful words
  const stem = filtered.slice(0, 3);

  // Normalise plurals for the last content word (simple -s / -es / -ies stripping)
  const last = stem[stem.length - 1];
  stem[stem.length - 1] = normalizePlural(last);

  const topic = stem.join(" ");

  // Discard topics that are a single character or purely numeric
  if (topic.length < 2 || /^\d+$/.test(topic)) return null;

  return topic;
}

/**
 * Basic plural → singular normalisation for English nouns.
 * Only handles common patterns to avoid over-stemming.
 */
function normalizePlural(word: string): string {
  if (word.length < 4) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("ves") && word.length > 4) return word.slice(0, -3) + "f";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes") || word.endsWith("ches") || word.endsWith("shes")) {
    return word.slice(0, -2); // boxes → box, watches → watch
  }
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 4) {
    return word.slice(0, -1);
  }
  return word;
}

// ── Insight Engine ──────────────────────────────────────────────────

export interface GeoInsight {
  type: "positive" | "warning" | "neutral";
  text: string;
}

export function generateGeoInsights(data: {
  aiSources?: Array<{
    engine: GeoEngine;
    sessions: number;
    purchaseCvr: number;
    engagementRate: number;
  }>;
  siteAvgPurchaseCvr?: number;
  siteAvgEngagementRate?: number;
  aiStyleQueryCount?: number;
  totalQueryCount?: number;
  topAiPage?: { path: string; aiSessions: number; purchaseCvr: number };
  totalAiSessions?: number;
  totalSessions?: number;
  language?: "en" | "tr";
}): GeoInsight[] {
  const insights: GeoInsight[] = [];
  const language = data.language ?? "en";

  // AI source outperforming site average
  if (data.aiSources && data.siteAvgPurchaseCvr !== undefined) {
    const bestSource = [...data.aiSources]
      .filter((s) => s.purchaseCvr > 0)
      .sort((a, b) => b.purchaseCvr - a.purchaseCvr)[0];
    if (bestSource) {
      const multiplier =
        data.siteAvgPurchaseCvr > 0
          ? bestSource.purchaseCvr / data.siteAvgPurchaseCvr
          : 0;
      if (multiplier >= 1.5) {
        insights.push({
          type: "positive",
          text: language === "tr"
            ? `${bestSource.engine} ziyaretçileri site ortalamasindan ${multiplier.toFixed(1)}x daha iyi dönüşuyor; bu yüksek degerli bir AI keşif kanali.`
            : `${bestSource.engine} visitors convert ${multiplier.toFixed(1)}x better than site average - a high-value AI discovery channel.`,
        });
      }
    }
  }

  // AI traffic share growing signal
  if (
    data.totalAiSessions !== undefined &&
    data.totalSessions !== undefined &&
    data.totalSessions > 0
  ) {
    const aiShare = data.totalAiSessions / data.totalSessions;
    if (aiShare >= 0.02) {
        insights.push({
          type: "positive",
          text: language === "tr"
            ? `Oturumlarinizin %${(aiShare * 100).toFixed(1)} kadari AI keşif motorlarindan geliyor; GEO zaten gerçek trafik uretiyor.`
            : `${(aiShare * 100).toFixed(1)}% of your sessions originate from AI discovery engines - GEO is already generating real traffic.`,
        });
      } else if (data.totalAiSessions > 0) {
        insights.push({
          type: "neutral",
          text: language === "tr"
            ? "AI motoru trafiği henüz küçük ama mevcut. İçerik yapısını ve cevap hazırlığını iyileştirmek GEO büyümesini hızlandırabilir."
            : "AI engine traffic is small but present. Improving content structure and answer-readiness can accelerate GEO growth.",
        });
    }
  }

  // Informational query coverage
  if (
    data.aiStyleQueryCount !== undefined &&
    data.totalQueryCount !== undefined &&
    data.totalQueryCount > 0
  ) {
    const pct = data.aiStyleQueryCount / data.totalQueryCount;
    if (pct >= 0.3) {
        insights.push({
          type: "positive",
          text: language === "tr"
            ? `Siraladiginiz sorgularin %${Math.round(pct * 100)} kadari bilgilendirici niyet tasiyor; bu AI yanit motoru gorunurlugu için güçlü bir temel.`
            : `${Math.round(pct * 100)}% of your ranking queries have informational intent - strong foundation for AI answer-engine visibility.`,
        });
    }
  }

  // Top AI page with weak conversion
  if (
    data.topAiPage &&
    data.topAiPage.aiSessions > 20 &&
    data.topAiPage.purchaseCvr < 0.01
  ) {
    insights.push({
      type: "warning",
      text: language === "tr"
        ? `${data.topAiPage.path} AI kaynakli ziyaretçi cekiyor ancak zayıf dönüşuyor. GEO trafiğini paraya cevirmek için ticari yollar ekleyin.`
        : `${data.topAiPage.path} attracts AI-source visitors but converts weakly. Add commercial pathways to monetize GEO traffic.`,
    });
  }

  // Low engagement from AI sources
  if (
    data.aiSources &&
    data.siteAvgEngagementRate !== undefined
  ) {
    const avgAiEngagement =
      data.aiSources.reduce((s, r) => s + r.engagementRate, 0) /
      Math.max(1, data.aiSources.length);
    if (
      avgAiEngagement < data.siteAvgEngagementRate * 0.7 &&
      data.aiSources.length > 0
    ) {
      insights.push({
        type: "warning",
        text: language === "tr"
          ? `AI kaynakli ziyaretçiler %${(avgAiEngagement * 100).toFixed(0)} oraninda etkilesiyor; site ortalamasi %${(data.siteAvgEngagementRate * 100).toFixed(0)}. İçerik AI kaynakli keşif niyetiyle eslesmiyor olabilir.`
          : `AI-source visitors engage ${(avgAiEngagement * 100).toFixed(0)}% of the time vs ${(data.siteAvgEngagementRate * 100).toFixed(0)}% site average - content may not match AI-driven discovery intent.`,
      });
    }
  }

  return insights.slice(0, 5);
}
