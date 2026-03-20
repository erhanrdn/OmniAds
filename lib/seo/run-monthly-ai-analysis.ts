import { computePreviousPeriod } from "@/lib/geo-momentum";
import { getDb } from "@/lib/db";
import { getAnalyticsOverviewData } from "@/lib/analytics-overview";
import type { SeoTechnicalFindingsPayload } from "@/lib/seo/findings";
import { buildSeoTechnicalFindings } from "@/lib/seo/findings";
import {
  buildAiAnalysis,
  buildAiContextBlocks,
  buildAiDataLayers,
  buildAiRequestedOutputs,
  buildSeoOverviewPayload,
  fetchSearchConsoleAnalyticsRows,
  type SeoAiAnalysis,
  type SeoOverviewPayload,
} from "@/lib/seo/intelligence";
import {
  buildCrawlDataString,
  buildGa4DataString,
  buildGscDataString,
  type SeoPromptSiteContext,
} from "@/lib/seo/seo-prompts";
import { resolveSearchConsoleContext } from "@/lib/search-console";
import {
  getSeoMonthlyAiAnalysis,
  saveSeoMonthlyAiAnalysisFailure,
  saveSeoMonthlyAiAnalysisSuccess,
} from "@/lib/seo/monthly-ai-analysis-store";

export interface SeoMonthlyAiAnalysisResponse {
  monthKey: string;
  monthLabel?: string;
  generatedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: "available" | "not_generated" | "failed";
  canGenerate: boolean;
  unavailableReason?: string;
  overviewData: SeoOverviewPayload["aiWorkspace"] | null;
  analysis: SeoAiAnalysis | null;
}

function toAnalysisMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function toMonthLabel(analysisMonth: string) {
  const date = new Date(`${analysisMonth}T00:00:00.000Z`);
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

async function resolveSeoPromptSiteContext(params: {
  businessId: string;
  siteUrl: string;
  allPages: SeoOverviewPayload["leaders"]["pages"];
  allMoverPages: SeoOverviewPayload["movers"]["decliningPages"];
}) {
  const sql = getDb();
  const rows = (await sql`
    SELECT industry, metadata
    FROM businesses
    WHERE id = ${params.businessId}::uuid
    LIMIT 1
  `) as Array<{ industry?: string | null; metadata?: Record<string, unknown> | null }>;
  const row = rows[0];
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : null;
  const domain = params.siteUrl.replace(/^sc-domain:/, "");
  const categoryCount = params.allPages.filter((page) => page.classificationTone === "category").length;
  const productCount = params.allPages.filter((page) => page.classificationTone === "product").length;
  const editorialCount = params.allPages.filter((page) => page.classificationTone === "editorial").length;

  return {
    domain: domain || null,
    sector: row?.industry ?? null,
    scale: `${productCount} product pages, ${categoryCount} category pages, ${editorialCount} editorial pages in the visible search footprint`,
    constraints:
      metadata && typeof metadata.team_constraints === "string"
        ? metadata.team_constraints
        : null,
    recentChanges:
      metadata && typeof metadata.recent_changes === "string"
        ? metadata.recent_changes
        : null,
  } satisfies SeoPromptSiteContext;
}

export async function getSeoMonthlyAiAnalysisForPeriod(params: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<SeoMonthlyAiAnalysisResponse> {
  const analysisMonth = toAnalysisMonth(params.endDate);
  const record = await getSeoMonthlyAiAnalysis({
    businessId: params.businessId,
    analysisMonth,
  });

  if (!record) {
    return {
      monthKey: analysisMonth,
      generatedAt: null,
      periodStart: params.startDate,
      periodEnd: params.endDate,
      status: "not_generated" as const,
      canGenerate: Boolean(process.env.OPENAI_API_KEY),
      unavailableReason: process.env.OPENAI_API_KEY
        ? undefined
        : "OpenAI is not configured on this environment.",
      overviewData: null,
      analysis: null,
    };
  }

  return {
    monthKey: analysisMonth,
    generatedAt: record.updated_at,
    periodStart: record.period_start,
    periodEnd: record.period_end,
    status: record.status === "success" && record.analysis ? "available" : "failed",
    canGenerate:
      record.status !== "success" &&
      Boolean(process.env.OPENAI_API_KEY),
    unavailableReason: record.status === "failed" ? record.error_message ?? "Generation failed." : undefined,
    overviewData:
      record.analysis && typeof record.analysis === "object" && "ecommerceContext" in record.analysis
        ? null
        : null,
    analysis: record.analysis,
  } satisfies SeoMonthlyAiAnalysisResponse;
}

export async function generateSeoMonthlyAiAnalysis(params: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<{
  alreadyGenerated: boolean;
  payload: SeoMonthlyAiAnalysisResponse;
}> {
  const analysisMonth = toAnalysisMonth(params.endDate);
  const existing = await getSeoMonthlyAiAnalysis({
    businessId: params.businessId,
    analysisMonth,
  });

  if (existing?.status === "success" && existing.analysis) {
    return {
      alreadyGenerated: true,
      payload: {
        monthKey: analysisMonth,
        generatedAt: existing.updated_at,
        periodStart: existing.period_start,
        periodEnd: existing.period_end,
        status: "available" as const,
        canGenerate: false,
        overviewData: null,
        analysis: existing.analysis,
      },
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      alreadyGenerated: false,
      payload: {
        monthKey: analysisMonth,
        generatedAt: null,
        periodStart: params.startDate,
        periodEnd: params.endDate,
        status: "failed" as const,
        canGenerate: false,
        unavailableReason: "OpenAI is not configured on this environment.",
        overviewData: null,
        analysis: null,
      },
    };
  }

  const context = await resolveSearchConsoleContext({
    businessId: params.businessId,
    requireSite: true,
  });

  const { prevStart, prevEnd } = computePreviousPeriod(params.startDate, params.endDate);
  const [currentRows, previousRows] = await Promise.all([
    fetchSearchConsoleAnalyticsRows({
      accessToken: context.accessToken,
      siteUrl: context.siteUrl ?? "",
      startDate: params.startDate,
      endDate: params.endDate,
      rowLimit: 500,
    }),
    fetchSearchConsoleAnalyticsRows({
      accessToken: context.accessToken,
      siteUrl: context.siteUrl ?? "",
      startDate: prevStart,
      endDate: prevEnd,
      rowLimit: 500,
    }),
  ]);

  const overview = await buildSeoOverviewPayload({
    siteUrl: context.siteUrl ?? "",
    startDate: params.startDate,
    endDate: params.endDate,
    currentRows,
    previousRows,
  });

  const technicalFindings = await buildSeoTechnicalFindings({
    siteUrl: context.siteUrl ?? "",
    accessToken: context.accessToken,
    currentRows,
    previousRows,
  });

  const siteContext = await resolveSeoPromptSiteContext({
    businessId: params.businessId,
    siteUrl: context.siteUrl ?? "",
    allPages: overview.leaders.pages,
    allMoverPages: overview.movers.decliningPages,
  });

  let ga4Data: string | null = null;
  try {
    const ga4Overview = await getAnalyticsOverviewData({
      businessId: params.businessId,
      startDate: params.startDate,
      endDate: params.endDate,
    });
    ga4Data = buildGa4DataString({
      overview: ga4Overview,
      landingPages: null,
    });
  } catch {
    ga4Data = null;
  }

  try {
    const analysis = await buildAiAnalysis({
      siteUrl: context.siteUrl ?? "",
      siteContext,
      gscData: buildGscDataString({
        siteUrl: context.siteUrl ?? "",
        summary: overview.summary,
        leaders: overview.leaders,
        movers: overview.movers,
        causes: overview.causes,
        recommendations: overview.recommendations,
      }),
      crawlData: buildCrawlDataString(technicalFindings),
      ga4Data,
      summary: overview.summary,
      allPages: [...overview.leaders.pages, ...overview.movers.decliningPages, ...overview.movers.improvingPages],
      causes: [
        ...overview.causes,
        ...buildTechnicalCauseCandidates(technicalFindings),
      ].slice(0, 6),
      recommendations: overview.recommendations,
      decliningQueries: overview.movers.decliningQueries,
      decliningPages: overview.movers.decliningPages,
    });

    if (analysis.source !== "ai") {
      throw new Error(analysis.unavailableReason ?? "AI analysis was not generated.");
    }

    const stored = await saveSeoMonthlyAiAnalysisSuccess({
      businessId: params.businessId,
      analysisMonth,
      periodStart: params.startDate,
      periodEnd: params.endDate,
      analysis,
      rawResponse: {
        technicalSummary: technicalFindings.summary,
        excludedCount: technicalFindings.confirmedExcludedPages.length,
      },
    });

    return {
      alreadyGenerated: false,
      payload: {
        monthKey: analysisMonth,
        generatedAt: stored.updated_at,
        periodStart: stored.period_start,
        periodEnd: stored.period_end,
        status: "available" as const,
        canGenerate: false,
        overviewData: {
          dataLayers: buildAiDataLayers(),
          contextBlocks: buildAiContextBlocks({
            siteUrl: context.siteUrl ?? "",
            summary: overview.summary,
            allPages: [...overview.leaders.pages, ...overview.movers.decliningPages, ...overview.movers.improvingPages],
            decliningPages: overview.movers.decliningPages,
          }),
          requestedOutputs: buildAiRequestedOutputs(),
        },
        analysis,
      } satisfies SeoMonthlyAiAnalysisResponse,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SEO AI analysis failed.";
    const stored = await saveSeoMonthlyAiAnalysisFailure({
      businessId: params.businessId,
      analysisMonth,
      periodStart: params.startDate,
      periodEnd: params.endDate,
      errorMessage: message,
    });

    return {
      alreadyGenerated: false,
      payload: {
        monthKey: analysisMonth,
        generatedAt: stored.updated_at,
        periodStart: stored.period_start,
        periodEnd: stored.period_end,
        status: "failed" as const,
        canGenerate: false,
        unavailableReason: message,
        overviewData: null,
        analysis: null,
      } satisfies SeoMonthlyAiAnalysisResponse,
    };
  }
}

function buildTechnicalCauseCandidates(findings: SeoTechnicalFindingsPayload) {
  if (!findings.summary.critical && !findings.summary.warning) return [];

  const candidates = [];
  if (findings.confirmedExcludedPages.length) {
    candidates.push({
      key: "inspection-exclusion",
      title: "Confirmed indexation exclusions are affecting priority URLs",
      explanation:
        "Search Console URL Inspection is already confirming excluded or blocked URLs, which is a stronger root-cause signal than generic visibility loss.",
      confidence: "high" as const,
      severity: "high" as const,
    });
  }

  if (findings.summary.critical > 0) {
    candidates.push({
      key: "technical-criticals",
      title: "Critical technical issues are likely amplifying the drop",
      explanation:
        "Critical crawl or indexation findings suggest the site is losing visibility due to technical blockers, not only ranking pressure.",
      confidence: "high" as const,
      severity: "high" as const,
    });
  }

  if (findings.summary.warning > 0) {
    candidates.push({
      key: "technical-warnings",
      title: "Template-level technical quality is weakening performance",
      explanation:
        "Warnings across metadata, canonical, or content structure can reduce organic efficiency even when pages remain indexed.",
      confidence: "medium" as const,
      severity: "medium" as const,
    });
  }

  return candidates;
}

export function getSeoMonthlyLabel(monthKey: string) {
  return toMonthLabel(monthKey);
}
