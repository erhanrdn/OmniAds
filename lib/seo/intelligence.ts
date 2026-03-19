import { computePreviousPeriod } from "@/lib/geo-momentum";
import { getOpenAI } from "@/lib/openai";

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
      temperature: 0.2,
      max_tokens: 300,
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

export async function buildSeoOverviewPayload(params: {
  siteUrl: string;
  startDate: string;
  endDate: string;
  currentRows: SearchConsoleAnalyticsRow[];
  previousRows: SearchConsoleAnalyticsRow[];
}): Promise<SeoOverviewPayload> {
  const { prevStart, prevEnd } = computePreviousPeriod(params.startDate, params.endDate);
  const currentTotals = computeTotals(params.currentRows);
  const previousTotals = computeTotals(params.previousRows);

  const allQueries = buildEntityChanges(params.currentRows, params.previousRows, "query");
  const allPages = buildEntityChanges(params.currentRows, params.previousRows, "page");

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

  const aiBrief = await buildAiBrief({
    siteUrl: params.siteUrl,
    summary,
    causes,
    recommendations,
    decliningQueries: movers.decliningQueries,
    decliningPages: movers.decliningPages,
  });

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
  };
}

function computePercentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)}%`;
}
