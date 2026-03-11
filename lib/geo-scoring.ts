/**
 * GEO Intelligence Scoring Engine — v2
 *
 * Deterministic, component-based 0–100 scores for pages, queries, and topics.
 * Each score is fully explainable: the component breakdown is returned alongside
 * the total so callers can surface "why this score" to users.
 */

// ── Types ────────────────────────────────────────────────────────────

export type Priority = "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high";
export type Confidence = "high" | "medium" | "low";

export interface ScoreBreakdown {
  total: number; // 0–100
  components: Record<string, number>; // component name → points
}

// ── Page GEO Score ───────────────────────────────────────────────────

export interface PageGeoSignals {
  /** GA4: sessions originating from known AI engines */
  aiSessions: number;
  /** GA4: total sessions to this page */
  totalSessions: number;
  /** GA4: engaged sessions / total sessions for AI traffic subset */
  aiEngagementRate: number;
  /** GA4: purchase events / sessions for AI traffic subset */
  aiPurchaseCvr: number;
  /** Number of distinct SC queries ranking for this page */
  queryBreadth: number;
  /** Average SC position across all queries for this page */
  avgPosition: number;
  /** Total SC impressions for this page */
  impressions: number;
}

/**
 * Score a landing page for GEO readiness.
 *
 * Components:
 *   visibility      0–25 pts — SC impressions × position quality
 *   engagement      0–25 pts — AI-source engagement rate
 *   conversion      0–25 pts — AI-source purchase CVR
 *   queryOpportunity 0–25 pts — query breadth (how many queries rank for this page)
 */
export function scorePageGeo(signals: Partial<PageGeoSignals>): ScoreBreakdown {
  // Visibility: impressions + position quality
  let visibility = 0;
  if (signals.impressions !== undefined && signals.impressions > 0) {
    // Up to 15 pts for impressions (log-scaled: 10K impressions → ~15 pts)
    visibility += Math.min(15, Math.log10(signals.impressions + 1) * 5);
  }
  if (signals.avgPosition !== undefined && signals.avgPosition > 0) {
    // Up to 10 pts for position: position 1 → 10, position 10 → 5, position 20+ → 0
    const posScore = Math.max(0, 10 - (signals.avgPosition - 1) * 0.5);
    visibility += posScore;
  }
  visibility = Math.min(25, Math.round(visibility));

  // Engagement: AI-source engaged session ratio
  let engagement = 0;
  if (signals.aiEngagementRate !== undefined) {
    // 0.7 engagement rate → 25 pts; linear scale
    engagement = Math.min(25, Math.round(signals.aiEngagementRate * 35.7));
  }

  // Conversion: AI-source purchase CVR
  let conversion = 0;
  if (signals.aiPurchaseCvr !== undefined && signals.aiPurchaseCvr > 0) {
    // 5% CVR → 25 pts; CVR of 0.01 (1%) → 5 pts
    conversion = Math.min(25, Math.round(signals.aiPurchaseCvr * 500));
  } else if (signals.aiSessions !== undefined && signals.aiSessions > 0 && signals.aiPurchaseCvr === 0) {
    // Gets small credit for having AI traffic even with no conversions
    conversion = 0;
  }

  // Query opportunity: how many distinct queries send traffic here
  let queryOpportunity = 0;
  if (signals.queryBreadth !== undefined) {
    // 1 query → ~3 pts, 5 → ~13 pts, 10 → ~25 pts; log-scaled
    queryOpportunity = Math.min(25, Math.round(Math.log2(signals.queryBreadth + 1) * 9));
  }

  const total = Math.min(100, visibility + engagement + conversion + queryOpportunity);

  return {
    total,
    components: { visibility, engagement, conversion, queryOpportunity },
  };
}

// ── Query GEO Score ──────────────────────────────────────────────────

export interface QueryGeoSignals {
  /** SC total impressions for this query */
  impressions: number;
  /** SC average position */
  position: number;
  /** SC click-through rate (0–1) */
  ctr: number;
  /** Is the query classified as AI-style / informational? */
  isAiStyle: boolean;
  /** Word count (proxy for specificity) */
  wordCount: number;
}

/**
 * Score a Search Console query for GEO relevance.
 *
 * Components:
 *   impressions    0–30 pts — raw discovery reach
 *   positionQuality 0–25 pts — how well-ranked the query is
 *   ctrGap         0–25 pts — CTR vs position-expected CTR (opportunity if below expected)
 *   intent         0–20 pts — AI-style bonus + long-tail bonus
 */
export function scoreQueryGeo(signals: Partial<QueryGeoSignals>): ScoreBreakdown {
  // Impressions: log-scaled so large numbers don't dominate
  let impressions = 0;
  if (signals.impressions !== undefined && signals.impressions > 0) {
    // 1K impressions → ~15 pts, 10K → ~22 pts, 100K → 30 pts
    impressions = Math.min(30, Math.round(Math.log10(signals.impressions) * 10));
  }

  // Position quality: position 1 → 25, 10 → 12, 20 → 0
  let positionQuality = 0;
  if (signals.position !== undefined && signals.position > 0) {
    positionQuality = Math.max(0, Math.min(25, Math.round(25 - (signals.position - 1) * 1.3)));
  }

  // CTR gap opportunity: expected CTR based on position vs actual CTR
  // Low actual CTR for a decent position = big opportunity
  let ctrGap = 0;
  if (signals.position !== undefined && signals.ctr !== undefined) {
    const expectedCtr = expectedCtrForPosition(signals.position);
    const gap = expectedCtr - signals.ctr;
    if (gap > 0 && signals.impressions && signals.impressions > 50) {
      // Bigger gap = more opportunity, up to 25 pts
      ctrGap = Math.min(25, Math.round((gap / Math.max(expectedCtr, 0.01)) * 25));
    }
  }

  // Intent bonus
  let intent = 0;
  if (signals.isAiStyle) {
    intent += 12; // AI-style queries are high-value GEO opportunities
  }
  if (signals.wordCount !== undefined && signals.wordCount >= 5) {
    intent += 8; // Long-tail specificity bonus
  } else if (signals.wordCount !== undefined && signals.wordCount >= 3) {
    intent += 4;
  }
  intent = Math.min(20, intent);

  const total = Math.min(100, impressions + positionQuality + ctrGap + intent);

  return {
    total,
    components: { impressions, positionQuality, ctrGap, intent },
  };
}

/**
 * Expected CTR by average position (industry curve approximation).
 */
function expectedCtrForPosition(position: number): number {
  // Based on typical organic CTR curves
  if (position <= 1) return 0.28;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.11;
  if (position <= 5) return 0.07;
  if (position <= 10) return 0.03;
  if (position <= 20) return 0.01;
  return 0.003;
}

// ── Topic GEO Score ──────────────────────────────────────────────────

export interface TopicGeoSignals {
  /** Total SC impressions across all queries in this cluster */
  impressions: number;
  /** Average SC position across queries in the cluster */
  avgPosition: number;
  /** Number of distinct queries in this cluster */
  queryCount: number;
  /** Fraction of queries that are AI-style informational */
  informationalDensity: number; // 0–1
  /** Average CTR across queries */
  avgCtr: number;
}

/**
 * Score a topic cluster for GEO authority.
 *
 * Components:
 *   impressions            0–30 pts — cluster search demand
 *   positionAuthority      0–20 pts — average ranking quality
 *   queryBreadth           0–25 pts — how many queries cluster has
 *   informationalDensity   0–25 pts — fraction of AI-style queries
 */
export function scoreTopicGeo(signals: Partial<TopicGeoSignals>): ScoreBreakdown {
  // Impressions: log-scaled
  let impressions = 0;
  if (signals.impressions !== undefined && signals.impressions > 0) {
    impressions = Math.min(30, Math.round(Math.log10(signals.impressions + 1) * 10));
  }

  // Position authority
  let positionAuthority = 0;
  if (signals.avgPosition !== undefined && signals.avgPosition > 0) {
    // Position 1 → 20 pts, position 10 → 11 pts, position 20+ → 0
    positionAuthority = Math.max(0, Math.min(20, Math.round(20 - (signals.avgPosition - 1) * 1.0)));
  }

  // Query breadth: more queries = richer topic coverage
  let queryBreadth = 0;
  if (signals.queryCount !== undefined && signals.queryCount > 0) {
    // 1 query → 5 pts, 5 → 15 pts, 10 → 22 pts, 20+ → 25 pts
    queryBreadth = Math.min(25, Math.round(Math.log2(signals.queryCount + 1) * 8));
  }

  // Informational density
  let informationalDensity = 0;
  if (signals.informationalDensity !== undefined) {
    informationalDensity = Math.min(25, Math.round(signals.informationalDensity * 25));
  }

  const total = Math.min(100, impressions + positionAuthority + queryBreadth + informationalDensity);

  return {
    total,
    components: { impressions, positionAuthority, queryBreadth, informationalDensity },
  };
}

// ── Priority Assignment ───────────────────────────────────────────────

/**
 * Assign a priority tier from a composite score + magnitude signals.
 *
 * @param score         0–100 geo score
 * @param magnitude     raw traffic/impression number (how big is the opportunity?)
 * @param conversionDelta  difference between AI CVR and site avg CVR (can be negative = problem)
 */
export function assignPriority(
  score: number,
  magnitude: number = 0,
  conversionDelta: number = 0
): Priority {
  // Boost score if magnitude is large (big opportunity) or CVR gap is meaningful
  let adjusted = score;
  if (magnitude > 1000) adjusted += 8;
  else if (magnitude > 200) adjusted += 4;
  if (conversionDelta < -0.02) adjusted += 5; // Underperforming = urgent
  if (conversionDelta > 0.03) adjusted -= 5;  // Already converting well = less urgent

  if (adjusted >= 65) return "high";
  if (adjusted >= 35) return "medium";
  return "low";
}

// ── Effort / Confidence ───────────────────────────────────────────────

export type RecommendationType =
  | "rewrite_title"
  | "add_faq"
  | "expand_guide"
  | "build_cluster"
  | "add_structured_data"
  | "improve_meta"
  | "add_comparison_table"
  | "build_hub_page"
  | "improve_internal_links"
  | "add_author_bio"
  | "refresh_outdated"
  | "add_data_visuals";

const EFFORT_MAP: Record<RecommendationType, Effort> = {
  rewrite_title: "low",
  add_faq: "low",
  improve_meta: "low",
  add_structured_data: "medium",
  add_comparison_table: "medium",
  add_author_bio: "low",
  expand_guide: "medium",
  refresh_outdated: "medium",
  improve_internal_links: "medium",
  add_data_visuals: "medium",
  build_cluster: "high",
  build_hub_page: "high",
};

export function assignEffort(type: RecommendationType): Effort {
  return EFFORT_MAP[type] ?? "medium";
}

/**
 * Confidence in the recommendation based on signal availability.
 */
export function assignConfidence(
  hasGA4: boolean,
  hasSC: boolean,
  signalCount: number
): Confidence {
  const dataScore = (hasGA4 ? 2 : 0) + (hasSC ? 2 : 0) + Math.min(2, Math.floor(signalCount / 5));
  if (dataScore >= 5) return "high";
  if (dataScore >= 3) return "medium";
  return "low";
}
