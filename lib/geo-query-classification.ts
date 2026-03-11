/**
 * GEO Intelligence — Semantic Query Classification v3
 *
 * Weighted multi-signal classification. Each rule contributes weight to
 * intent and format buckets. The winning bucket determines the output.
 * Confidence is determined by how dominant the top signal is.
 */

// ── Types ────────────────────────────────────────────────────────────

export type QueryIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational"
  | "comparative"
  | "inspirational";

export type QueryFormat =
  | "how_to"
  | "definition"
  | "question"
  | "list"
  | "comparison"
  | "best_of"
  | "problem_solution"
  | "local_intent"
  | "buyer_intent"
  | "general";

export type ClassificationConfidence = "high" | "medium" | "low";

export interface QueryClassification {
  intent: QueryIntent;
  format: QueryFormat;
  confidence: ClassificationConfidence;
  /** Good candidate for AI answer engine citation */
  isAiStyle: boolean;
  /** Human-readable signals that drove the classification */
  signals: string[];
}

// ── Rule Definitions ─────────────────────────────────────────────────

interface Rule {
  test: RegExp | ((q: string) => boolean);
  intent: QueryIntent;
  format: QueryFormat;
  /** Higher = stronger signal */
  weight: number;
  signal: string;
}

const RULES: Rule[] = [
  // ── Navigational (highest priority — exit early) ──
  { test: /\b(login|sign in|sign up|my account|dashboard|\.com|\.net|\.org|\.io)\b/, intent: "navigational", format: "general", weight: 12, signal: "navigational keyword" },

  // ── How-to ──
  { test: /^how (to|do i|do you|can i|can you|should i|does one)\b/, intent: "informational", format: "how_to", weight: 12, signal: "how-to prefix" },
  { test: /\b(step by step|step-by-step|tutorial|walkthrough|get started|beginners? guide)\b/, intent: "informational", format: "how_to", weight: 9, signal: "tutorial signal" },
  { test: /^(guide to|guide for|ultimate guide|complete guide|beginner|introduction to)\b/, intent: "informational", format: "how_to", weight: 9, signal: "guide phrase" },

  // ── Definition / explanation ──
  { test: /^what (is|are|does|makes|means?)\b/, intent: "informational", format: "definition", weight: 11, signal: "what-is prefix" },
  { test: /^(define|definition of|meaning of|explain|explained|understanding)\b/, intent: "informational", format: "definition", weight: 10, signal: "definition prefix" },
  { test: /\b(what it means|means|meaning|defined as|explained)\b/, intent: "informational", format: "definition", weight: 6, signal: "definition inline" },

  // ── Question (general informational questions) ──
  { test: /^(why|when|where|who|which)\b/, intent: "informational", format: "question", weight: 8, signal: "wh-question prefix" },
  { test: /^(is it|are there|can you|should you|will it|could it|does it)\b/, intent: "informational", format: "question", weight: 7, signal: "yes-no question prefix" },
  { test: /\?$/, intent: "informational", format: "question", weight: 5, signal: "question mark" },

  // ── Comparison ──
  { test: /\bvs\.?\b|\bversus\b|\bcompared to\b|\bcompare\b/, intent: "comparative", format: "comparison", weight: 12, signal: "vs/versus signal" },
  { test: /^(difference between|compare|comparison|which is better|better:?)\b/, intent: "comparative", format: "comparison", weight: 11, signal: "comparison prefix" },
  { test: /\b(alternative|alternatives|instead of|similar to|like [a-z]+)\b/, intent: "comparative", format: "comparison", weight: 8, signal: "alternative signal" },
  { test: /\b(pros and cons|advantages and disadvantages|trade.?offs?)\b/, intent: "comparative", format: "comparison", weight: 9, signal: "pros-cons signal" },

  // ── Best-of / commercial research ──
  { test: /^(best|top \d*|top-rated|highest rated|recommended|most popular)\b/, intent: "commercial", format: "best_of", weight: 11, signal: "best-of prefix" },
  { test: /\b(best .+ for|best .+ in|best .+ 202[0-9]|top \d .+)\b/, intent: "commercial", format: "best_of", weight: 9, signal: "best-of phrase" },
  { test: /\b(review|reviews|honest review|detailed review|in depth review|worth it|worth buying)\b/, intent: "commercial", format: "best_of", weight: 8, signal: "review signal" },
  { test: /\b(ranked|ranking|top picks?|editor.s choice|award.winning)\b/, intent: "commercial", format: "best_of", weight: 7, signal: "ranking signal" },

  // ── List / ideas ──
  { test: /^(list of|types of|examples? of|ideas? for|ways to|tips (for|on)|tricks for|methods? (to|for))\b/, intent: "informational", format: "list", weight: 10, signal: "list prefix" },
  { test: /\b(\d+ (ways|tips|ideas|examples|types|methods|steps|reasons|mistakes|benefits))\b/, intent: "informational", format: "list", weight: 10, signal: "numbered list signal" },
  { test: /^(checklist|roadmap|plan for|cheat sheet|summary of)\b/, intent: "informational", format: "list", weight: 8, signal: "list format signal" },

  // ── Problem / solution ──
  { test: /\b(how to fix|how to solve|why (is|does|are|won.t|can.t)|troubleshoot|not working|error|issue|problem|broken|crash|fix)\b/, intent: "informational", format: "problem_solution", weight: 10, signal: "problem-solution signal" },
  { test: /\b(causes? of|reason (why|for)|symptoms?|diagnosis|diagnose)\b/, intent: "informational", format: "problem_solution", weight: 7, signal: "diagnostic signal" },

  // ── Inspirational ──
  { test: /\b(inspiration|inspirational|ideas|creative ideas|examples|mood board|aesthetic|inspo|beautiful|stunning)\b/, intent: "inspirational", format: "list", weight: 8, signal: "inspirational signal" },
  { test: /\b(design ideas?|room ideas?|outfit ideas?|gift ideas?|decor ideas?)\b/, intent: "inspirational", format: "list", weight: 9, signal: "ideas phrase" },

  // ── Transactional / buyer intent ──
  { test: /\b(buy|purchase|order|shop for|add to cart|checkout)\b/, intent: "transactional", format: "buyer_intent", weight: 12, signal: "buy signal" },
  { test: /\b(price|pricing|cost|how much (does|is|are)|cheap|affordable|discount|coupon|deal|offer|sale)\b/, intent: "transactional", format: "buyer_intent", weight: 10, signal: "pricing/deal signal" },
  { test: /\b(free trial|subscription|plan|license|download|get [a-z]+ free)\b/, intent: "transactional", format: "buyer_intent", weight: 9, signal: "purchase-funnel signal" },
  { test: /\b(near me|in my area|local|nearby|open now|hours|directions)\b/, intent: "transactional", format: "local_intent", weight: 11, signal: "local intent" },
  { test: /\b(delivery|shipping|same day|fast|overnight|next day)\b/, intent: "transactional", format: "buyer_intent", weight: 8, signal: "delivery signal" },
];

// ── Classifier ───────────────────────────────────────────────────────

export function classifyQuery(query: string): QueryClassification {
  const q = query.toLowerCase().trim().replace(/\s+/g, " ");
  const wordCount = q.split(" ").length;

  const intentScores: Partial<Record<QueryIntent, number>> = {};
  const formatScores: Partial<Record<QueryFormat, number>> = {};
  const matched: string[] = [];

  for (const rule of RULES) {
    const hit =
      typeof rule.test === "function" ? rule.test(q) : rule.test.test(q);
    if (hit) {
      intentScores[rule.intent] = (intentScores[rule.intent] ?? 0) + rule.weight;
      formatScores[rule.format] = (formatScores[rule.format] ?? 0) + rule.weight;
      matched.push(rule.signal);
    }
  }

  // Long-tail boost: 5+ word queries lean informational
  if (wordCount >= 5 && !intentScores["transactional"] && !intentScores["navigational"]) {
    intentScores["informational"] = (intentScores["informational"] ?? 0) + 4;
    matched.push("long-tail query");
  }

  // Default fallback: no patterns matched
  if (matched.length === 0) {
    return {
      intent: "informational",
      format: "general",
      confidence: "low",
      isAiStyle: wordCount >= 3,
      signals: ["no strong signals — defaulted to informational"],
    };
  }

  // Pick top intent + format
  const intent = topKey(intentScores) as QueryIntent ?? "informational";
  const format = topKey(formatScores) as QueryFormat ?? "general";

  // Confidence: how dominant is the top intent?
  const scores = Object.values(intentScores).sort((a, b) => b - a);
  const top = scores[0] ?? 0;
  const second = scores[1] ?? 0;
  let confidence: ClassificationConfidence;
  if (top >= 10 || top >= second * 2) confidence = "high";
  else if (top >= second * 1.4) confidence = "medium";
  else confidence = "low";

  // isAiStyle: informational, comparative, inspirational formats are AI-answer-engine relevant
  const aiStyleIntents: QueryIntent[] = ["informational", "comparative", "inspirational"];
  const aiStyleFormats: QueryFormat[] = ["how_to", "definition", "question", "list", "comparison", "best_of", "problem_solution"];
  const isAiStyle =
    aiStyleIntents.includes(intent) ||
    aiStyleFormats.includes(format) ||
    (intent === "commercial" && format === "best_of");

  return {
    intent,
    format,
    confidence,
    isAiStyle,
    signals: [...new Set(matched)].slice(0, 4),
  };
}

/** Pick the key with the highest numeric value. */
function topKey(scores: Partial<Record<string, number>>): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const [k, v] of Object.entries(scores)) {
    if ((v ?? 0) > bestScore) {
      bestScore = v ?? 0;
      best = k;
    }
  }
  return best;
}

// ── Format display helpers ────────────────────────────────────────────

export const FORMAT_LABELS: Record<QueryFormat, string> = {
  how_to: "How-to",
  definition: "Definition",
  question: "Question",
  list: "List/Ideas",
  comparison: "Comparison",
  best_of: "Best-of",
  problem_solution: "Problem/Fix",
  local_intent: "Local",
  buyer_intent: "Buyer Intent",
  general: "General",
};

export const INTENT_LABELS: Record<QueryIntent, string> = {
  informational: "Informational",
  commercial: "Commercial",
  transactional: "Transactional",
  navigational: "Navigational",
  comparative: "Comparative",
  inspirational: "Inspirational",
};

/**
 * Derive a GEO-specific recommendation label from classification.
 * This replaces the v2 heuristic opportunityLabel.
 */
export function deriveOpportunityLabel(cls: QueryClassification): string | null {
  if (cls.intent === "navigational") return null;
  if (cls.intent === "transactional" && cls.format !== "buyer_intent") return null;

  switch (cls.format) {
    case "how_to": return "Add how-to guide or tutorial";
    case "definition": return "Add definition / explainer section";
    case "question": return "Answer directly in opening paragraph";
    case "list": return "Add numbered list or FAQ format";
    case "comparison": return "Add comparison table or vs. section";
    case "best_of": return "Expand buying guide or ranked list";
    case "problem_solution": return "Add troubleshooting section";
    case "local_intent": return null;
    case "buyer_intent": return "Strengthen commercial CTA";
    default: return null;
  }
}
