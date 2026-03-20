import type { SeoTechnicalFindingsPayload } from "@/lib/seo/findings";
import type { SeoCauseCandidate, SeoEntityChange, SeoMetricSummary, SeoRecommendation } from "@/lib/seo/intelligence";

export interface SeoPromptSiteContext {
  domain: string | null;
  sector: string | null;
  scale: string | null;
  constraints: string | null;
  recentChanges: string | null;
}

export interface SeoStructuredAnalysis {
  meta: {
    analysisDate: string;
    dataSources: Array<"gsc" | "crawl" | "ga4">;
    siteContext: {
      domain: string | null;
      sector: string | null;
    };
  };
  executiveSummary: {
    overallHealthScore: number | null;
    healthLabel: "critical" | "poor" | "fair" | "good" | "excellent" | null;
    topFindings: string[];
    immediateAction: string | null;
  };
  trafficAnalysis: {
    trend: "increasing" | "declining" | "stable" | "unclear" | null;
    trendPercent: number | null;
    affectedPageTypes: Array<{
      type: "category" | "product" | "blog" | "other";
      impact: "high" | "medium" | "low";
    }>;
    topOrganicPages: Array<{
      url: string;
      clicks: number;
      impressions: number;
      ctr: number;
      avgPosition: number;
    }>;
    confidence: "high" | "medium" | "low" | null;
  };
  rootCauseAnalysis: Array<{
    title: string;
    detail: string;
    confidence: "high" | "medium" | "low";
    affectedArea: "category" | "product" | "editorial" | "mixed";
  }>;
  ctrOpportunities: Array<{
    url: string;
    currentPosition: number;
    currentCtr: number;
    impressions: number;
    estimatedCtrGain: number;
    currentTitle: string | null;
    suggestedTitle: string | null;
    suggestedMetaDescription: string | null;
    priority: "high" | "medium" | "low";
  }>;
  technicalIssues: Array<{
    issueType: string;
    severity: "critical" | "high" | "medium" | "low";
    affectedUrlCount: number | null;
    seoImpact: string | null;
    recommendation: string | null;
    estimatedEffortDays: number | null;
    confidence: "high" | "medium" | "low";
  }>;
  conversionInsights: {
    organicConversionRate: number | null;
    organicRevenue: number | null;
    topConvertingPages: Array<{
      url: string;
      sessions: number;
      conversionRate: number;
    }>;
    lowCvrHighTrafficPages: Array<{
      url: string;
      sessions: number;
      conversionRate: number;
      issue: string;
    }>;
    confidence: "high" | "medium" | "low" | null;
  };
  priorityMatrix: Array<{
    title: string;
    detail: string;
    impact: "high" | "medium" | "low";
    effort: "low" | "medium" | "high";
    owner: "developer" | "content" | "seo" | "management";
    relatedIssueType: string | null;
  }>;
  actionPlan: {
    quickWins: Array<{
      action: string;
      expectedImpact: string;
      effortDays: number;
      owner: "developer" | "content" | "seo" | "management";
      relatedIssueType: string | null;
    }>;
    midTerm: Array<{
      action: string;
      expectedImpact: string;
      effortDays: number;
      owner: "developer" | "content" | "seo" | "management";
      timelineWeeks: number;
    }>;
  };
  dataGaps: string[];
}

export const systemPrompt = `
You are an e-commerce SEO analysis engine. You will receive data from up to three sources:
- GSC (Google Search Console) performance data
- Technical crawl report (Screaming Frog-style technical findings)
- GA4 organic segment conversion data

Your job is to synthesize these inputs into a comprehensive, actionable SEO analysis.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown fences, no explanatory text, nothing else.
2. The JSON schema is defined below — all fields are required; never omit them.
3. If data is insufficient for a field, set it to null. Never fabricate or guess.
4. confidence values: "high" = finding derived directly from data, "medium" = requires inference, "low" = limited data, tentative conclusion.
5. Write all string values in English.
6. Use an e-commerce SEO lens explicitly: category pages should capture broad commercial demand, product pages should capture narrower high-conversion demand, and editorial pages should support discovery and authority.
7. If the inputs do not prove a claim, surface that uncertainty in the relevant confidence field or via dataGaps.
8. Keep the JSON compact. Prefer short, direct sentences over long explanations.
9. Follow all array limits exactly. Do not exceed requested maximum item counts.
10. Keep topFindings to a maximum of 3 items. Keep rootCauseAnalysis to a maximum of 4 items. Keep ctrOpportunities, technicalIssues, priorityMatrix, quickWins, and midTerm to a maximum of 4 items each.
11. Keep string fields concise. Avoid long paragraphs, repetition, or filler.

OUTPUT JSON SCHEMA:
{
  "meta": {
    "analysisDate": "ISO 8601 date string",
    "dataSources": ["gsc" | "crawl" | "ga4"],
    "siteContext": { "domain": string | null, "sector": string | null }
  },

  "executiveSummary": {
    "overallHealthScore": 0-100,
    "healthLabel": "critical" | "poor" | "fair" | "good" | "excellent",
    "topFindings": [string],
    "immediateAction": string
  },

  "trafficAnalysis": {
    "trend": "increasing" | "declining" | "stable" | "unclear",
    "trendPercent": number | null,
    "affectedPageTypes": [
      { "type": "category" | "product" | "blog" | "other", "impact": "high" | "medium" | "low" }
    ],
    "topOrganicPages": [
      { "url": string, "clicks": number, "impressions": number, "ctr": number, "avgPosition": number }
    ],
    "confidence": "high" | "medium" | "low"
  },

  "rootCauseAnalysis": [
    {
      "title": string,
      "detail": string,
      "confidence": "high" | "medium" | "low",
      "affectedArea": "category" | "product" | "editorial" | "mixed"
    }
  ],

  "ctrOpportunities": [
    {
      "url": string,
      "currentPosition": number,
      "currentCtr": number,
      "impressions": number,
      "estimatedCtrGain": number,
      "currentTitle": string | null,
      "suggestedTitle": string | null,
      "suggestedMetaDescription": string | null,
      "priority": "high" | "medium" | "low"
    }
  ],

  "technicalIssues": [
    {
      "issueType": string,
      "severity": "critical" | "high" | "medium" | "low",
      "affectedUrlCount": number | null,
      "seoImpact": string,
      "recommendation": string,
      "estimatedEffortDays": number | null,
      "confidence": "high" | "medium" | "low"
    }
  ],

  "conversionInsights": {
    "organicConversionRate": number | null,
    "organicRevenue": number | null,
    "topConvertingPages": [
      { "url": string, "sessions": number, "conversionRate": number }
    ],
    "lowCvrHighTrafficPages": [
      { "url": string, "sessions": number, "conversionRate": number, "issue": string }
    ],
    "confidence": "high" | "medium" | "low"
  },

  "priorityMatrix": [
    {
      "title": string,
      "detail": string,
      "impact": "high" | "medium" | "low",
      "effort": "low" | "medium" | "high",
      "owner": "developer" | "content" | "seo" | "management",
      "relatedIssueType": string | null
    }
  ],

  "actionPlan": {
    "quickWins": [
      {
        "action": string,
        "expectedImpact": string,
        "effortDays": number,
        "owner": "developer" | "content" | "seo" | "management",
        "relatedIssueType": string | null
      }
    ],
    "midTerm": [
      {
        "action": string,
        "expectedImpact": string,
        "effortDays": number,
        "owner": "developer" | "content" | "seo" | "management",
        "timelineWeeks": number
      }
    ]
  },

  "dataGaps": [string]
}
`.trim();

export function buildUserPrompt(params: {
  siteContext: SeoPromptSiteContext;
  gscData: string | null;
  crawlData: string | null;
  ga4Data: string | null;
}) {
  const { domain, sector, scale, constraints, recentChanges } = params.siteContext;

  const siteBlock = `
## SITE CONTEXT
- Domain: ${domain ?? "not provided"}
- Sector: ${sector ?? "not provided"}
- Scale: ${scale ?? "not provided"}
- Team constraints: ${constraints ?? "not provided"}
- Recent structural changes: ${recentChanges ?? "none"}
`.trim();

  const gscBlock = params.gscData
    ? `## DATA 1 — GOOGLE SEARCH CONSOLE\n${params.gscData.trim()}`
    : `## DATA 1 — GOOGLE SEARCH CONSOLE\n[DATA NOT PROVIDED]`;

  const crawlBlock = params.crawlData
    ? `## DATA 2 — TECHNICAL CRAWL REPORT\n${params.crawlData.trim()}`
    : `## DATA 2 — TECHNICAL CRAWL REPORT\n[DATA NOT PROVIDED]`;

  const ga4Block = params.ga4Data
    ? `## DATA 3 — GA4 ORGANIC SEGMENT\n${params.ga4Data.trim()}`
    : `## DATA 3 — GA4 ORGANIC SEGMENT\n[DATA NOT PROVIDED]`;

  return `
${siteBlock}

${gscBlock}

${crawlBlock}

${ga4Block}

## INSTRUCTION
Analyze the data above and return a response using the JSON schema defined in the system prompt.
Focus on root causes of organic traffic loss, prioritize high-impact / low-effort work clearly, and translate the findings into an actionable 30-day plan.
Return JSON only. Nothing else.
`.trim();
}

function limitText<T>(value: T, maxChars = 6000): string | null {
  if (value == null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n... [TRUNCATED]` : text;
}

export function buildGscDataString(input: {
  siteUrl: string;
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
}) {
  return limitText({
    siteUrl: input.siteUrl,
    summary: input.summary,
    leaders: {
      queries: input.leaders.queries.slice(0, 6),
      pages: input.leaders.pages.slice(0, 6),
    },
    movers: {
      decliningQueries: input.movers.decliningQueries.slice(0, 6),
      decliningPages: input.movers.decliningPages.slice(0, 6),
      improvingQueries: input.movers.improvingQueries.slice(0, 6),
      improvingPages: input.movers.improvingPages.slice(0, 6),
    },
    precomputedSignals: {
      causes: input.causes,
      recommendations: input.recommendations,
    },
  });
}

export function buildCrawlDataString(findings: SeoTechnicalFindingsPayload) {
  return limitText({
    meta: findings.meta,
    summary: findings.summary,
    confirmedExcludedPages: findings.confirmedExcludedPages.slice(0, 20),
    findings: findings.findings.map((finding) => ({
      ...finding,
      affectedPages: finding.affectedPages.slice(0, 10),
    })).slice(0, 10),
  });
}

export function buildGa4DataString(input:
  | {
      overview?: {
        propertyName?: string;
        kpis?: {
          sessions?: number;
          purchases?: number;
          purchaseCvr?: number;
          revenue?: number;
        };
        newVsReturning?: unknown;
      } | null;
      landingPages?: {
        pages: Array<{
          path: string;
          sessions: number;
          purchases: number;
          purchaseCvr: number;
        }>;
      } | null;
    }
  | null) {
  if (!input?.overview && !input?.landingPages) return null;
  return limitText({
      overview: input.overview ?? null,
      landingPages: input.landingPages
      ? { pages: input.landingPages.pages.slice(0, 12) }
      : null,
  });
}
