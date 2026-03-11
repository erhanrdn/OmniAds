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
 * Cluster Search Console queries into topic groups using heuristic
 * extraction of leading 1-2 word stems.
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

/**
 * Extract a 1-2 word topic stem from a query.
 * Removes common stopwords and informational prefixes.
 */
function extractTopic(query: string): string | null {
  const STOPWORDS = new Set([
    "a", "an", "the", "is", "are", "of", "in", "on", "at", "to", "for",
    "and", "or", "but", "with", "my", "your", "our", "its", "how", "what",
    "why", "where", "when", "which", "who", "i", "do", "you", "be", "can",
    "will", "that", "this", "it", "get", "make", "use", "best",
  ]);

  const q = query.toLowerCase().trim();

  // Strip informational prefixes
  const stripped = q
    .replace(
      /^(best |how to |how do i |what is |what are |guide to |guide for |ideas for |examples of |top |list of |types of |ways to |tips for |review of |difference between |when to |where to )/,
      ""
    )
    .trim();

  // Split and filter stopwords
  const words = stripped
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 2);

  if (words.length === 0) return null;
  return words.join(" ");
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
}): GeoInsight[] {
  const insights: GeoInsight[] = [];

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
          text: `${bestSource.engine} visitors convert ${multiplier.toFixed(1)}× better than site average — a high-value AI discovery channel.`,
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
        text: `${(aiShare * 100).toFixed(1)}% of your sessions originate from AI discovery engines — GEO is already generating real traffic.`,
      });
    } else if (data.totalAiSessions > 0) {
      insights.push({
        type: "neutral",
        text: `AI engine traffic is small but present. Improving content structure and answer-readiness can accelerate GEO growth.`,
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
        text: `${Math.round(pct * 100)}% of your ranking queries have informational intent — strong foundation for AI answer-engine visibility.`,
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
      text: `${data.topAiPage.path} attracts AI-source visitors but converts weakly. Add commercial pathways to monetize GEO traffic.`,
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
        text: `AI-source visitors engage ${(avgAiEngagement * 100).toFixed(0)}% of the time vs ${(data.siteAvgEngagementRate * 100).toFixed(0)}% site average — content may not match AI-driven discovery intent.`,
      });
    }
  }

  return insights.slice(0, 5);
}
