import { computePreviousPeriod } from "@/lib/geo-momentum";
import {
  classifyQuery,
  INTENT_LABELS,
} from "@/lib/geo-query-classification";
import { getOpenAI } from "@/lib/openai";
import {
  buildUserPrompt,
  systemPrompt,
  type SeoPromptSiteContext,
  type SeoStructuredAnalysis,
} from "@/lib/seo/seo-prompts";
import { getSeoMonthlyAiAnalysis } from "@/lib/seo/monthly-ai-analysis-store";

const SEO_AI_MODEL = "gpt-5-nano";

export interface SearchConsoleAnalyticsRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface AggregateBucket {
  key: string;
  clicks: number;
  impressions: number;
  weightedPosition: number;
}

export interface SeoMetricSummary {
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
}

export interface SeoEntityChange {
  key: string;
  label: string;
  classificationLabel: string | null;
  classificationTone: "informational" | "commercial" | "transactional" | "navigational" | "comparative" | "inspirational" | "product" | "category" | "editorial" | "utility" | "home" | "general";
  clicks: number;
  previousClicks: number;
  clicksDelta: number;
  clicksDeltaPercent: number | null;
  impressions: number;
  previousImpressions: number;
  impressionsDelta: number;
  impressionsDeltaPercent: number | null;
  ctr: number;
  previousCtr: number;
  ctrDelta: number;
  position: number;
  previousPosition: number;
  positionDelta: number;
}

export interface SeoCauseCandidate {
  key: string;
  title: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
  severity: "high" | "medium" | "low";
}

export interface SeoRecommendation {
  title: string;
  rationale: string;
  effort: "low" | "medium" | "high";
  impact: "high" | "medium" | "low";
}

export interface SeoAiBrief {
  source: "ai" | "rules";
  summary: string;
  likelyCause: string;
  nextStep: string;
}

export interface SeoAiDataLayer {
  id: string;
  title: string;
  subtitle: string;
  group: "technical" | "keyword" | "authority" | "context";
  status: "available" | "partial" | "missing";
}

export interface SeoAiContextBlock {
  title: string;
  detail: string;
}

export interface SeoAiOutputCard {
  title: string;
  detail: string;
}

export interface SeoAiRootCause {
  title: string;
  detail: string;
  confidence: "high" | "medium" | "low";
  affectedArea: "category" | "product" | "editorial" | "mixed";
}

export interface SeoAiPriorityItem {
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  owner: string;
}

export interface SeoAiActionStep {
  window: string;
  focus: string;
  tasks: string[];
  successMetric: string;
}

export interface SeoAiAnalysis {
  source: "ai" | "unavailable";
  summary: string;
  ecommerceContext: string;
  rootCauses: SeoAiRootCause[];
  priorities: SeoAiPriorityItem[];
  actionPlan: SeoAiActionStep[];
  structured?: SeoStructuredAnalysis;
  unavailableReason?: string;
}

function coerceAiString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  if ("text" in value && typeof value.text === "string") return value.text.trim();
  if ("summary" in value && typeof value.summary === "string") return value.summary.trim();
  if ("detail" in value && typeof value.detail === "string") return value.detail.trim();
  return JSON.stringify(value).slice(0, 400);
}

function extractJsonObject(value: string): string | null {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return value.slice(start, end + 1);
}

function parseStructuredAnalysis(value: string): Partial<SeoStructuredAnalysis> {
  try {
    return JSON.parse(value) as Partial<SeoStructuredAnalysis>;
  } catch {
    const extracted = extractJsonObject(value);
    if (!extracted) {
      throw new Error("The model returned invalid JSON.");
    }
    return JSON.parse(extracted) as Partial<SeoStructuredAnalysis>;
  }
}

function normalizeAffectedArea(value: unknown): SeoAiRootCause["affectedArea"] {
  if (value === "category" || value === "product" || value === "editorial" || value === "mixed") {
    return value;
  }
  if (typeof value !== "string") return "mixed";
  const lower = value.toLowerCase();
  if (lower.includes("category")) return "category";
  if (lower.includes("product")) return "product";
  if (lower.includes("editorial") || lower.includes("blog") || lower.includes("content")) {
    return "editorial";
  }
  return "mixed";
}

function normalizeOwner(value: unknown): SeoAiPriorityItem["owner"] {
  if (typeof value !== "string") return "SEO";
  const lower = value.toLowerCase();
  if (lower === "developer") return "Developer";
  if (lower === "content") return "Content";
  if (lower === "management") return "Management";
  return "SEO";
}

export interface SeoOverviewPayload {
  meta: {
    siteUrl: string;
    startDate: string;
    endDate: string;
    previousStartDate: string;
    previousEndDate: string;
    rowCount: number;
  };
  summary: {
    clicks: SeoMetricSummary;
    impressions: SeoMetricSummary;
    ctr: SeoMetricSummary;
    position: SeoMetricSummary;
  };
  leaders: {
    queries: SeoEntityChange[];
    pages: SeoEntityChange[];
  };
  movers: {
    decliningQueries: SeoEntityChange[];
    decliningPages: SeoEntityChange[];
    improvingQueries: SeoEntityChange[];
    improvingPages: SeoEntityChange[];
  };
  causes: SeoCauseCandidate[];
  recommendations: SeoRecommendation[];
  aiBrief: SeoAiBrief;
  aiWorkspace: {
    dataLayers: SeoAiDataLayer[];
    contextBlocks: SeoAiContextBlock[];
    requestedOutputs: SeoAiOutputCard[];
  };
}

export async function fetchSearchConsoleAnalyticsRows(params: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  rowLimit?: number;
}): Promise<SearchConsoleAnalyticsRow[]> {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(params.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions: ["query", "page"],
        rowLimit: params.rowLimit ?? 400,
      }),
      cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | {
        rows?: Array<{
          keys?: string[];
          clicks?: number;
          impressions?: number;
          ctr?: number;
          position?: number;
        }>;
      }
    | null;

  if (!response.ok) {
    throw new Error("Could not fetch Search Console analytics.");
  }

  return (payload?.rows ?? []).map((row) => ({
    query: typeof row.keys?.[0] === "string" ? row.keys[0] : "",
    page: typeof row.keys?.[1] === "string" ? row.keys[1] : "",
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    ctr: Number(row.ctr ?? 0),
    position: Number(row.position ?? 0),
  }));
}

export function buildDemoPreviousRows(
  rows: SearchConsoleAnalyticsRow[],
): SearchConsoleAnalyticsRow[] {
  return rows.map((row, index) => {
    const impressionMultiplier = 0.88 + (index % 4) * 0.04;
    const clickMultiplier = 0.84 + (index % 5) * 0.05;
    const previousImpressions = Math.max(1, Math.round(row.impressions * impressionMultiplier));
    const previousClicks = Math.max(1, Math.round(row.clicks * clickMultiplier));
    return {
      ...row,
      clicks: previousClicks,
      impressions: previousImpressions,
      ctr: previousClicks / Math.max(previousImpressions, 1),
      position: Number((row.position - 0.6 + (index % 3) * 0.3).toFixed(1)),
    };
  });
}

function buildMetricSummary(current: number, previous: number): SeoMetricSummary {
  return {
    current,
    previous,
    delta: current - previous,
    deltaPercent: computePercentDelta(current, previous),
  };
}

function aggregateRowsBy(
  rows: SearchConsoleAnalyticsRow[],
  keySelector: (row: SearchConsoleAnalyticsRow) => string,
): Map<string, AggregateBucket> {
  const buckets = new Map<string, AggregateBucket>();
  for (const row of rows) {
    const key = keySelector(row);
    const current = buckets.get(key) ?? {
      key,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
    };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.weightedPosition += row.position * row.impressions;
    buckets.set(key, current);
  }
  return buckets;
}

function buildEntityChanges(
  currentRows: SearchConsoleAnalyticsRow[],
  previousRows: SearchConsoleAnalyticsRow[],
  dimension: "query" | "page",
  siteUrl?: string,
): SeoEntityChange[] {
  const currentBuckets = aggregateRowsBy(currentRows, (row) => row[dimension]);
  const previousBuckets = aggregateRowsBy(previousRows, (row) => row[dimension]);
  const keys = new Set<string>([...currentBuckets.keys(), ...previousBuckets.keys()]);

  return Array.from(keys)
    .filter(Boolean)
    .map((key) => {
      const current = currentBuckets.get(key);
      const previous = previousBuckets.get(key);
      const clicks = current?.clicks ?? 0;
      const previousClicks = previous?.clicks ?? 0;
      const impressions = current?.impressions ?? 0;
      const previousImpressions = previous?.impressions ?? 0;
      const position =
        current && current.impressions > 0 ? current.weightedPosition / current.impressions : 0;
      const previousPosition =
        previous && previous.impressions > 0 ? previous.weightedPosition / previous.impressions : 0;
      const ctr = clicks / Math.max(impressions, 1);
      const previousCtr = previousClicks / Math.max(previousImpressions, 1);

      return {
        key,
        label: key,
        classificationLabel:
          dimension === "query"
            ? getQueryIntentLabel(key, siteUrl)
            : getPageTypeLabel(key),
        classificationTone:
          dimension === "query"
            ? getQueryIntentTone(key, siteUrl)
            : getPageTypeTone(key),
        clicks,
        previousClicks,
        clicksDelta: clicks - previousClicks,
        clicksDeltaPercent: computePercentDelta(clicks, previousClicks),
        impressions,
        previousImpressions,
        impressionsDelta: impressions - previousImpressions,
        impressionsDeltaPercent: computePercentDelta(impressions, previousImpressions),
        ctr,
        previousCtr,
        ctrDelta: ctr - previousCtr,
        position,
        previousPosition,
        positionDelta: position - previousPosition,
      };
    });
}

function getQueryIntentLabel(query: string, siteUrl?: string): string {
  return INTENT_LABELS[classifyQuery(query, { siteUrl }).intent];
}

function getQueryIntentTone(
  query: string,
  siteUrl?: string,
): SeoEntityChange["classificationTone"] {
  return classifyQuery(query, { siteUrl }).intent;
}

function getPageTypeLabel(path: string): string {
  if (path === "/" || path === "") return "Homepage";
  if (path.startsWith("/products/")) return "Product";
  if (path.startsWith("/collections/") || path.startsWith("/category/")) return "Category";
  if (path.startsWith("/blog/") || path.startsWith("/guides/")) return "Editorial";
  if (path.startsWith("/pages/")) return "Utility";
  return "General";
}

function getPageTypeTone(path: string): SeoEntityChange["classificationTone"] {
  if (path === "/" || path === "") return "home";
  if (path.startsWith("/products/")) return "product";
  if (path.startsWith("/collections/") || path.startsWith("/category/")) return "category";
  if (path.startsWith("/blog/") || path.startsWith("/guides/")) return "editorial";
  if (path.startsWith("/pages/")) return "utility";
  return "general";
}

export function classifySeoQueryIntent(query: string, siteUrl?: string) {
  return classifyQuery(query, { siteUrl }).intent;
}

function computeTotals(rows: SearchConsoleAnalyticsRow[]) {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const ctr = clicks / Math.max(impressions, 1);
  const position =
    impressions > 0
      ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions
      : 0;
  return { clicks, impressions, ctr, position };
}

function buildCauseCandidates(input: {
  summary: SeoOverviewPayload["summary"];
  decliningQueries: SeoEntityChange[];
  decliningPages: SeoEntityChange[];
}): SeoCauseCandidate[] {
  const causes: SeoCauseCandidate[] = [];
  const { summary, decliningQueries, decliningPages } = input;

  if (
    (summary.clicks.deltaPercent ?? 0) <= -0.12 &&
    summary.position.delta >= 0.5
  ) {
    causes.push({
      key: "ranking-loss",
      title: "Ranking loss on key queries",
      explanation:
        "Clicks are down while average position moved down materially. This usually points to ranking pressure, not just seasonality.",
      confidence: "high",
      severity: "high",
    });
  }

  if (
    (summary.impressions.deltaPercent ?? 0) <= -0.12 &&
    Math.abs(summary.position.delta) < 0.35
  ) {
    causes.push({
      key: "visibility-loss",
      title: "Visibility softened before ranking changed",
      explanation:
        "Impressions dropped without a matching position collapse. That can signal indexation, coverage, or shifting search demand.",
      confidence: "medium",
      severity: "medium",
    });
  }

  if (
    summary.ctr.delta <= -0.008 &&
    (summary.impressions.deltaPercent ?? 0) > -0.08
  ) {
    causes.push({
      key: "ctr-loss",
      title: "CTR deterioration on existing visibility",
      explanation:
        "You are still showing up, but fewer people are clicking. Snippet competitiveness, titles, and SERP context are likely involved.",
      confidence: "high",
      severity: "medium",
    });
  }

  if (decliningPages[0] && Math.abs(decliningPages[0].clicksDelta) >= 25) {
    causes.push({
      key: "page-concentration",
      title: "A small set of pages is driving the drop",
      explanation: `The steepest drop is concentrated on ${decliningPages[0].label}, which suggests a page-level issue rather than a sitewide one.`,
      confidence: "medium",
      severity: "medium",
    });
  }

  if (decliningQueries[0] && decliningQueries[0].positionDelta >= 0.7) {
    causes.push({
      key: "query-fragility",
      title: "Top query cluster became more fragile",
      explanation: `The sharpest decline is tied to "${decliningQueries[0].label}", where position worsened and traffic followed.`,
      confidence: "medium",
      severity: "medium",
    });
  }

  if (causes.length === 0) {
    causes.push({
      key: "mixed-signals",
      title: "Mixed movement across queries and pages",
      explanation:
        "The period does not show a single dominant failure mode. Treat this as a cluster-level optimization pass rather than a single fix.",
      confidence: "low",
      severity: "low",
    });
  }

  return causes.slice(0, 4);
}

function buildRecommendations(input: {
  causes: SeoCauseCandidate[];
  decliningQueries: SeoEntityChange[];
  decliningPages: SeoEntityChange[];
}): SeoRecommendation[] {
  const recommendations: SeoRecommendation[] = [];

  for (const cause of input.causes) {
    if (cause.key === "ranking-loss") {
      recommendations.push({
        title: "Refresh priority pages tied to dropping queries",
        rationale:
          "Update on-page depth, internal links, and supporting sections for pages attached to the biggest ranking losses.",
        effort: "medium",
        impact: "high",
      });
    } else if (cause.key === "ctr-loss") {
      recommendations.push({
        title: "Rewrite titles and meta descriptions for high-impression pages",
        rationale:
          "CTR dropped while visibility held, so the fastest lever is snippet competitiveness on pages already earning impressions.",
        effort: "low",
        impact: "high",
      });
    } else if (cause.key === "visibility-loss") {
      recommendations.push({
        title: "Audit indexing and crawl signals on affected templates",
        rationale:
          "Falling impressions without a strong position change can indicate coverage, canonical, sitemap, or crawl consistency issues.",
        effort: "medium",
        impact: "medium",
      });
    } else if (cause.key === "page-concentration") {
      recommendations.push({
        title: "Run a page-level technical audit on the worst-hit URLs",
        rationale:
          "When decline is concentrated, investigating those specific pages usually surfaces the fastest root cause.",
        effort: "low",
        impact: "medium",
      });
    }
  }

  if (input.decliningQueries[0]) {
    recommendations.push({
      title: "Protect high-value query clusters first",
      rationale: `Prioritize the query cluster around "${input.decliningQueries[0].label}" before broader cleanup work.`,
      effort: "low",
      impact: "high",
    });
  }

  if (input.decliningPages[0]) {
    recommendations.push({
      title: "Review template or content regression on the worst page",
      rationale: `Start with ${input.decliningPages[0].label} and compare it with the last known strong version or sibling pages.`,
      effort: "medium",
      impact: "medium",
    });
  }

  return dedupeRecommendations(recommendations).slice(0, 4);
}

function dedupeRecommendations(
  recommendations: SeoRecommendation[],
): SeoRecommendation[] {
  const seen = new Set<string>();
  return recommendations.filter((item) => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });
}

function buildFallbackAiBrief(input: {
  causes: SeoCauseCandidate[];
  recommendations: SeoRecommendation[];
  summary: SeoOverviewPayload["summary"];
}): SeoAiBrief {
  const topCause = input.causes[0];
  const topRecommendation = input.recommendations[0];
  const clicksDeltaPct = input.summary.clicks.deltaPercent;
  const summary =
    clicksDeltaPct !== null && clicksDeltaPct <= -0.1
      ? `Organic clicks are down ${formatSignedPercent(clicksDeltaPct)} versus the prior period, so this needs investigation rather than passive monitoring.`
      : "Organic performance is mixed, with enough signal to prioritize focused SEO cleanup on the biggest movers.";

  return {
    source: "rules",
    summary,
    likelyCause: topCause?.title ?? "Performance moved without one dominant cause.",
    nextStep:
      topRecommendation?.title ??
      "Review the worst declining pages and queries first, then validate technical and snippet changes.",
  };
}

function summarizePageTypeCoverage(allPages: SeoEntityChange[]) {
  const counts = {
    category: 0,
    product: 0,
    editorial: 0,
    utility: 0,
    home: 0,
    general: 0,
  };

  for (const row of allPages) {
    if (row.classificationTone === "category") counts.category += 1;
    else if (row.classificationTone === "product") counts.product += 1;
    else if (row.classificationTone === "editorial") counts.editorial += 1;
    else if (row.classificationTone === "utility") counts.utility += 1;
    else if (row.classificationTone === "home") counts.home += 1;
    else counts.general += 1;
  }

  return counts;
}

function getDominantAffectedArea(pages: SeoEntityChange[]): SeoAiRootCause["affectedArea"] {
  const counts = {
    category: 0,
    product: 0,
    editorial: 0,
    mixed: 0,
  };

  for (const page of pages.slice(0, 8)) {
    if (page.classificationTone === "category") counts.category += 1;
    else if (page.classificationTone === "product") counts.product += 1;
    else if (page.classificationTone === "editorial") counts.editorial += 1;
    else counts.mixed += 1;
  }

  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] === 0) return "mixed";
  return top[0] as SeoAiRootCause["affectedArea"];
}

export function buildAiDataLayers(): SeoAiDataLayer[] {
  return [
    {
      id: "technical-audit",
      title: "Technical SEO data",
      subtitle: "Targeted audits, canonical, metadata, indexation",
      group: "technical",
      status: "partial",
    },
    {
      id: "crawl-report",
      title: "Crawl report",
      subtitle: "HTTP status, redirects, page fetch, inspection",
      group: "technical",
      status: "partial",
    },
    {
      id: "site-structure",
      title: "Site structure",
      subtitle: "URL patterns, category vs product vs editorial mapping",
      group: "technical",
      status: "partial",
    },
    {
      id: "query-data",
      title: "Keyword data",
      subtitle: "Intent, query clusters, CTR, ranking changes",
      group: "keyword",
      status: "available",
    },
    {
      id: "gsc-data",
      title: "GSC data",
      subtitle: "Clicks, impressions, CTR, position",
      group: "keyword",
      status: "available",
    },
    {
      id: "content-performance",
      title: "Content performance",
      subtitle: "Page-level organic winners and losers",
      group: "keyword",
      status: "available",
    },
    {
      id: "authority-data",
      title: "Authority data",
      subtitle: "Backlinks, referring domains, link gaps",
      group: "authority",
      status: "missing",
    },
    {
      id: "competitor-gap",
      title: "Competitor keyword gap",
      subtitle: "Missing competitor visibility inputs",
      group: "authority",
      status: "missing",
    },
  ];
}

export function buildAiContextBlocks(input: {
  siteUrl: string;
  summary: SeoOverviewPayload["summary"];
  allPages: SeoEntityChange[];
  decliningPages: SeoEntityChange[];
}): SeoAiContextBlock[] {
  const coverage = summarizePageTypeCoverage(input.allPages);
  const affectedArea = getDominantAffectedArea(input.decliningPages);

  return [
    {
      title: "Site context",
      detail: `E-commerce perspective. Visible search footprint in the selected period includes ${coverage.product} product pages, ${coverage.category} category pages, and ${coverage.editorial} editorial pages.`,
    },
    {
      title: "Intent mapping rule",
      detail:
        "Category pages should win broader commercial demand, while product pages should absorb narrower high-conversion long-tail demand.",
    },
    {
      title: "Current pressure",
      detail: `Primary traffic pressure is strongest on ${affectedArea} pages. Clicks moved ${formatSignedPercent(input.summary.clicks.deltaPercent ?? 0)} and impressions moved ${formatSignedPercent(input.summary.impressions.deltaPercent ?? 0)} versus the previous period.`,
    },
    {
      title: "Missing inputs",
      detail:
        "Authority, backlink, and competitor datasets are not connected yet, so analysis should prioritize search-console-backed root causes and on-site fixes.",
    },
  ];
}

export function buildAiRequestedOutputs(): SeoAiOutputCard[] {
  return [
    {
      title: "Root causes",
      detail: "List the most likely traffic-loss drivers from an e-commerce SEO perspective.",
    },
    {
      title: "Priority matrix",
      detail: "Rank high-impact / low-effort quick wins before slower structural projects.",
    },
    {
      title: "30-day plan",
      detail: "Translate recommendations into weekly execution steps and success metrics.",
    },
    {
      title: "Category vs product lens",
      detail: "Judge whether the right page type is matching the search intent and revenue opportunity.",
    },
  ];
}

function buildUnavailableAiAnalysis(input: {
  siteUrl: string;
  summary: SeoOverviewPayload["summary"];
  allPages: SeoEntityChange[];
  causes: SeoCauseCandidate[];
  recommendations: SeoRecommendation[];
  decliningQueries: SeoEntityChange[];
  decliningPages: SeoEntityChange[];
}, reason?: string): SeoAiAnalysis {
  const coverage = summarizePageTypeCoverage(input.allPages);
  const unavailableReason =
    reason ??
    "Set OPENAI_API_KEY on the server to enable the ecommerce SEO analysis, root-cause ranking, priority matrix, and 30-day plan.";
  const summary = reason
    ? "Integrated AI analysis could not be generated for this monthly run."
    : "AI analysis is currently unavailable because the OpenAI integration is not configured on this environment.";
  return {
    source: "unavailable",
    summary,
    ecommerceContext: `${coverage.product} product pages, ${coverage.category} category pages, and ${coverage.editorial} editorial pages are visible in the current search footprint. Category pages should capture broad commercial demand; product pages should absorb long-tail transactional demand.`,
    rootCauses: [],
    priorities: [],
    actionPlan: [],
    unavailableReason,
  };
}

async function buildAiBrief(input: {
  siteUrl: string;
  summary: SeoOverviewPayload["summary"];
  causes: SeoCauseCandidate[];
  recommendations: SeoRecommendation[];
  decliningQueries: SeoEntityChange[];
  decliningPages: SeoEntityChange[];
}): Promise<SeoAiBrief> {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackAiBrief(input);
  }

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: SEO_AI_MODEL,
      max_completion_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an SEO intelligence assistant. Return concise JSON with keys summary, likelyCause, nextStep. Ground everything in the provided metrics only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            siteUrl: input.siteUrl,
            summary: input.summary,
            topCauses: input.causes.slice(0, 3),
            topRecommendations: input.recommendations.slice(0, 3),
            decliningQueries: input.decliningQueries.slice(0, 3).map((row) => ({
              label: row.label,
              clicksDelta: row.clicksDelta,
              positionDelta: row.positionDelta,
              ctrDelta: row.ctrDelta,
            })),
            decliningPages: input.decliningPages.slice(0, 3).map((row) => ({
              label: row.label,
              clicksDelta: row.clicksDelta,
              positionDelta: row.positionDelta,
              ctrDelta: row.ctrDelta,
            })),
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return buildFallbackAiBrief(input);
    }

    const parsed = JSON.parse(content) as {
      summary?: unknown;
      likelyCause?: unknown;
      nextStep?: unknown;
    };

    if (
      typeof parsed.summary !== "string" ||
      typeof parsed.likelyCause !== "string" ||
      typeof parsed.nextStep !== "string"
    ) {
      return buildFallbackAiBrief(input);
    }

    return {
      source: "ai",
      summary: parsed.summary,
      likelyCause: parsed.likelyCause,
      nextStep: parsed.nextStep,
    };
  } catch {
    return buildFallbackAiBrief(input);
  }
}

export async function buildAiAnalysis(input: {
  siteUrl: string;
  siteContext: SeoPromptSiteContext;
  gscData: string | null;
  crawlData: string | null;
  ga4Data: string | null;
  summary: SeoOverviewPayload["summary"];
  allPages: SeoEntityChange[];
  causes: SeoCauseCandidate[];
  recommendations: SeoRecommendation[];
  decliningQueries: SeoEntityChange[];
  decliningPages: SeoEntityChange[];
}): Promise<SeoAiAnalysis> {
  if (!process.env.OPENAI_API_KEY) {
    return buildUnavailableAiAnalysis(
      input,
      "OPENAI_API_KEY is missing on this environment.",
    );
  }

  try {
    const openai = getOpenAI();
    const userPrompt = buildUserPrompt({
      siteContext: input.siteContext,
      gscData: input.gscData,
      crawlData: input.crawlData,
      ga4Data: input.ga4Data,
    });
    let parsed: Partial<SeoStructuredAnalysis> | null = null;
    let lastError: string | null = null;

    const attempts = [
      {
        max_output_tokens: 5000,
        systemContent: `${systemPrompt}\nKeep every string concise. Keep arrays short. Follow all stated limits strictly.`,
      },
      {
        max_output_tokens: 5000,
        systemContent: `${systemPrompt}\nYour previous response was incomplete or invalid. Return a shorter, compact JSON object that still satisfies the schema. Do not include any extra keys or commentary.`,
      },
    ] as const;

    for (const attempt of attempts) {
      const response = await openai.responses.create({
        model: SEO_AI_MODEL,
        max_output_tokens: attempt.max_output_tokens,
        reasoning: { effort: "minimal" },
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content: attempt.systemContent,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      const content = response.output_text;
      if (!content) {
        lastError = "The model returned an empty response. Please retry the monthly analysis.";
        continue;
      }

      try {
        parsed = parseStructuredAnalysis(content);
        break;
      } catch (error) {
        lastError =
          error instanceof Error
            ? error.message
            : "The model returned invalid JSON. Please retry the monthly analysis.";
      }
    }

    if (!parsed) {
      return buildUnavailableAiAnalysis(
        input,
        lastError ?? "The model response could not be parsed into valid JSON. Please retry the monthly analysis.",
      );
    }

    if (
      !parsed.executiveSummary ||
      !parsed.trafficAnalysis ||
      !Array.isArray(parsed.rootCauseAnalysis) ||
      !Array.isArray(parsed.priorityMatrix) ||
      !parsed.actionPlan
    ) {
      return buildUnavailableAiAnalysis(
        input,
        "The model response did not match the expected SEO analysis format. Please retry the monthly analysis.",
      );
    }

    const executiveSummary = parsed.executiveSummary;
    const trafficAnalysis = parsed.trafficAnalysis;
    const rootCauseAnalysis = parsed.rootCauseAnalysis;
    const priorityMatrix = parsed.priorityMatrix;
    const structuredActionPlan = parsed.actionPlan;
    const ecommerceContext = [
      parsed.meta?.siteContext?.domain ? `Domain: ${parsed.meta.siteContext.domain}.` : null,
      parsed.meta?.siteContext?.sector ? `Sector: ${parsed.meta.siteContext.sector}.` : null,
      executiveSummary.immediateAction ? `Immediate action: ${executiveSummary.immediateAction}` : null,
      Array.isArray(parsed.dataGaps) && parsed.dataGaps.length
        ? `Data gaps: ${parsed.dataGaps.join("; ")}`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    const summary = [
      Array.isArray(executiveSummary.topFindings) ? executiveSummary.topFindings.slice(0, 3).join(" ") : "",
      executiveSummary.immediateAction ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const actionPlan: SeoAiActionStep[] = [
      {
        window: "Days 1-7",
        focus: "Quick wins",
        tasks: (structuredActionPlan.quickWins ?? []).slice(0, 3).map((item) => item.action).filter(Boolean),
        successMetric: (structuredActionPlan.quickWins ?? []).slice(0, 2).map((item) => item.expectedImpact).filter(Boolean).join(" | ") || "Quick wins completed",
      },
      {
        window: "Days 8-15",
        focus: "Quick win rollout",
        tasks: (structuredActionPlan.quickWins ?? []).slice(3, 6).map((item) => item.action).filter(Boolean),
        successMetric: "Top quick wins deployed and validated",
      },
      {
        window: "Days 16-23",
        focus: "Mid-term implementation",
        tasks: (structuredActionPlan.midTerm ?? []).slice(0, 3).map((item) => item.action).filter(Boolean),
        successMetric: (structuredActionPlan.midTerm ?? []).slice(0, 2).map((item) => item.expectedImpact).filter(Boolean).join(" | ") || "Mid-term work started",
      },
      {
        window: "Days 24-30",
        focus: "Scale and validate",
        tasks: (structuredActionPlan.midTerm ?? []).slice(3, 6).map((item) => item.action).filter(Boolean),
        successMetric: "Implementation progress reviewed and next sprint queued",
      },
    ].filter((item) => item.tasks.length > 0);

    const analysis: SeoAiAnalysis = {
      source: "ai",
      summary: summary || "The model completed the monthly SEO review.",
      ecommerceContext:
        ecommerceContext ||
        "The model reviewed the site through an ecommerce SEO lens with GSC, technical crawl, and available conversion context.",
      rootCauses: rootCauseAnalysis
        .filter((item) => Boolean(item) && typeof item === "object")
        .map((item): SeoAiRootCause => ({
          title: coerceAiString(item.title),
          detail: coerceAiString(item.detail),
          confidence:
            item.confidence === "high" || item.confidence === "medium" || item.confidence === "low"
              ? item.confidence
              : "medium",
          affectedArea: normalizeAffectedArea(item.affectedArea),
        }))
        .filter((item) => item.title && item.detail)
        .slice(0, 4),
      priorities: priorityMatrix
        .filter((item) => Boolean(item) && typeof item === "object")
        .map((item): SeoAiPriorityItem => ({
          title: coerceAiString(item.title),
          detail: coerceAiString(item.detail),
          impact:
            item.impact === "high" || item.impact === "medium" || item.impact === "low"
              ? item.impact
              : "medium",
          effort:
            item.effort === "high" || item.effort === "medium" || item.effort === "low"
              ? item.effort
              : "medium",
          owner: normalizeOwner(item.owner),
        }))
        .filter((item) => item.title && item.detail)
        .slice(0, 8),
      actionPlan,
      structured: parsed as SeoStructuredAnalysis,
    };

    if (
      !analysis.rootCauses.length ||
      !analysis.priorities.length ||
      !analysis.actionPlan.length
    ) {
      return buildUnavailableAiAnalysis(
        input,
        "The model response was incomplete, so the monthly analysis was not saved. Please retry.",
      );
    }

    return analysis;
  } catch (error) {
    return buildUnavailableAiAnalysis(
      input,
      error instanceof Error ? error.message : "The monthly AI analysis failed unexpectedly.",
    );
  }
}

export async function buildSeoOverviewPayload(params: {
  siteUrl: string;
  startDate: string;
  endDate: string;
  currentRows: SearchConsoleAnalyticsRow[];
  previousRows: SearchConsoleAnalyticsRow[];
  businessId?: string;
  preferRuleBasedBrief?: boolean;
}): Promise<SeoOverviewPayload> {
  const { prevStart, prevEnd } = computePreviousPeriod(params.startDate, params.endDate);
  const currentTotals = computeTotals(params.currentRows);
  const previousTotals = computeTotals(params.previousRows);

  const allQueries = buildEntityChanges(
    params.currentRows,
    params.previousRows,
    "query",
    params.siteUrl,
  );
  const allPages = buildEntityChanges(
    params.currentRows,
    params.previousRows,
    "page",
    params.siteUrl,
  );

  const leaders = {
    queries: [...allQueries].sort((a, b) => b.clicks - a.clicks).slice(0, 12),
    pages: [...allPages].sort((a, b) => b.clicks - a.clicks).slice(0, 12),
  };

  const movers = {
    decliningQueries: [...allQueries]
      .sort((a, b) => a.clicksDelta - b.clicksDelta)
      .filter((row) => row.clicksDelta < 0)
      .slice(0, 10),
    decliningPages: [...allPages]
      .sort((a, b) => a.clicksDelta - b.clicksDelta)
      .filter((row) => row.clicksDelta < 0)
      .slice(0, 10),
    improvingQueries: [...allQueries]
      .sort((a, b) => b.clicksDelta - a.clicksDelta)
      .filter((row) => row.clicksDelta > 0)
      .slice(0, 10),
    improvingPages: [...allPages]
      .sort((a, b) => b.clicksDelta - a.clicksDelta)
      .filter((row) => row.clicksDelta > 0)
      .slice(0, 10),
  };

  const summary = {
    clicks: buildMetricSummary(currentTotals.clicks, previousTotals.clicks),
    impressions: buildMetricSummary(currentTotals.impressions, previousTotals.impressions),
    ctr: buildMetricSummary(currentTotals.ctr, previousTotals.ctr),
    position: buildMetricSummary(currentTotals.position, previousTotals.position),
  };

  const causes = buildCauseCandidates({
    summary,
    decliningQueries: movers.decliningQueries,
    decliningPages: movers.decliningPages,
  });

  const recommendations = buildRecommendations({
    causes,
    decliningQueries: movers.decliningQueries,
    decliningPages: movers.decliningPages,
  });

  let aiBrief: SeoAiBrief;
  if (params.businessId) {
    const analysisMonth = new Date().toISOString().slice(0, 7) + "-01";
    const monthlyAnalysis = await getSeoMonthlyAiAnalysis({
      businessId: params.businessId,
      analysisMonth,
    });
    if (monthlyAnalysis?.status === "success" && monthlyAnalysis.analysis) {
      const a = monthlyAnalysis.analysis;
      aiBrief = {
        source: "ai",
        summary: a.summary,
        likelyCause: a.rootCauses[0]?.title ?? a.ecommerceContext,
        nextStep: a.priorities[0]?.title ?? "",
      };
    } else if (params.preferRuleBasedBrief) {
      aiBrief = buildFallbackAiBrief({
        summary,
        causes,
        recommendations,
      });
    } else {
      aiBrief = await buildAiBrief({
        siteUrl: params.siteUrl,
        summary,
        causes,
        recommendations,
        decliningQueries: movers.decliningQueries,
        decliningPages: movers.decliningPages,
      });
    }
  } else if (params.preferRuleBasedBrief) {
    aiBrief = buildFallbackAiBrief({
      summary,
      causes,
      recommendations,
    });
  } else {
    aiBrief = await buildAiBrief({
      siteUrl: params.siteUrl,
      summary,
      causes,
      recommendations,
      decliningQueries: movers.decliningQueries,
      decliningPages: movers.decliningPages,
    });
  }

  return {
    meta: {
      siteUrl: params.siteUrl,
      startDate: params.startDate,
      endDate: params.endDate,
      previousStartDate: prevStart,
      previousEndDate: prevEnd,
      rowCount: params.currentRows.length,
    },
    summary,
    leaders,
    movers,
    causes,
    recommendations,
    aiBrief,
    aiWorkspace: {
      dataLayers: buildAiDataLayers(),
      contextBlocks: buildAiContextBlocks({
        siteUrl: params.siteUrl,
        summary,
        allPages,
        decliningPages: movers.decliningPages,
      }),
      requestedOutputs: buildAiRequestedOutputs(),
    },
  };
}

function computePercentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;
}
