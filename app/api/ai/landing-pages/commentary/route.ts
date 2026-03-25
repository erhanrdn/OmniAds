import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getOpenAI } from "@/lib/openai";
import {
  buildLandingPageAiFallback,
  LANDING_PAGE_FUNNEL_LABELS,
} from "@/lib/landing-pages/performance";
import { getAiNarrativeLanguage, getNonTranslatableTermsInstruction, type AppLanguage } from "@/lib/i18n";
import { resolveRequestLanguage } from "@/lib/request-language";
import type {
  LandingPageAiCommentary,
  LandingPageAiReport,
  LandingPageRuleReport,
} from "@/src/types/landing-pages";

const MODEL = "gpt-5-nano";

interface RequestPayload {
  businessId?: string;
  report?: LandingPageAiReport;
  ruleReport?: LandingPageRuleReport;
}

interface OpenAiLikeError {
  status?: number;
  code?: string;
  type?: string;
  message?: string;
  error?: {
    code?: string;
    type?: string;
    message?: string;
  };
}

interface FetchedPageSnapshot {
  fetched: boolean;
  finalUrl: string | null;
  title: string | null;
  metaDescription: string | null;
  headings: string[];
  bodyExcerpt: string | null;
  warning: string | null;
}

function getSystemPrompt(language: AppLanguage) {
  return `Act as a Senior UX Auditor with strong expertise in Baymard Institute ecommerce guidance, Jakob Nielsen's usability heuristics, Laws of UX, and WCAG 2.1 basics.

You will receive:
1. a compact funnel report
2. a deterministic rule-engine diagnosis
3. a fetched landing page snapshot when available

Your job is to produce a concise operator-facing UX audit for this landing page.

Rules:
- Stay grounded in the provided payload only.
- Treat the rule engine as supporting diagnostic context, not as the main copy source.
- Use funnel metrics to explain likely UX or handoff issues, not to restate the performance diagnosis.
- Use the fetched page snapshot when it is available to ground comments about messaging, structure, category intent, CTA placement, navigation clarity, or conversion friction.
- Pay attention to page archetype before giving advice.
- For homepage, listing, content, or campaign pages, do not blame downstream add-to-cart or checkout loss on the current page when the rule engine frames it as a downstream handoff issue.
- Apply Baymard-style reasoning for ecommerce navigation, category browsing, search-to-product discovery, and checkout friction when relevant.
- Apply NN/g heuristics such as visibility of system status, match with real-world language, recognition over recall, consistency, and error prevention when relevant.
- Apply Laws of UX when useful, especially Hick's Law, Fitts's Law, and cognitive load.
- Mention WCAG or accessibility only when there is enough evidence from the snapshot; otherwise frame accessibility points carefully as likely or worth validating.
- Do not restate the rule engine summary, issues, actions, or risks verbatim. Add complementary interpretation instead.
- If a fetched page snapshot is available, at least two findings or recommendations should clearly reflect visible page content, headings, framing, category cues, CTA structure, or IA signals.
- If confidence is low or the rule engine flags tracking issues, say so clearly.
- Do not invent hidden causes, benchmarks, tracking completeness, or performance thresholds.
- Avoid generic CRO filler. Recommendations should map to the reported weak point.
- Keep the tone concise, professional, and useful for ecommerce operators and stakeholders.
- Write all narrative strings in ${getAiNarrativeLanguage(language)}.
- ${getNonTranslatableTermsInstruction(language)}
- Return ONLY valid JSON matching the requested schema.`;
}

function isValidReport(report: unknown): report is LandingPageAiReport {
  if (!report || typeof report !== "object") return false;
  const source = report as Partial<LandingPageAiReport>;
  return (
    typeof source.url === "string" &&
    typeof source.path === "string" &&
    typeof source.title === "string" &&
    typeof source.sessions === "number" &&
    typeof source.purchases === "number" &&
    typeof source.totalRevenue === "number" &&
    typeof source.engagementRate === "number" &&
    typeof source.scrollRate === "number" &&
    typeof source.conversionRate === "number" &&
    Array.isArray(source.strengths) &&
    Array.isArray(source.concerns)
  );
}

function isValidRuleReport(report: unknown): report is LandingPageRuleReport {
  if (!report || typeof report !== "object") return false;
  const source = report as Partial<LandingPageRuleReport>;
  return (
    typeof source.path === "string" &&
    typeof source.title === "string" &&
    typeof source.archetype === "string" &&
    typeof source.action === "string" &&
    typeof source.score === "number" &&
    typeof source.confidence === "number" &&
    Array.isArray(source.causeTags) &&
    Array.isArray(source.strengths) &&
    Array.isArray(source.issues) &&
    Array.isArray(source.actions) &&
    Array.isArray(source.risks) &&
    typeof source.summary === "string" &&
    !!source.scoreBreakdown &&
    typeof source.scoreBreakdown === "object"
  );
}

function isUnsupportedParameterError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const source = error as OpenAiLikeError;
  const code = source.code ?? source.error?.code ?? "";
  const message =
    typeof source.message === "string"
      ? source.message
      : typeof source.error?.message === "string"
        ? source.error.message
        : "";
  const normalizedMessage = message.toLowerCase();
  return code === "unsupported_parameter" || normalizedMessage.includes("unsupported_parameter");
}

function parseJson(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

function sanitizeErrorMessage(input: string, language: AppLanguage): string {
  const normalized = input.toLowerCase();
  if (normalized.includes("api key") && normalized.includes("not set")) {
    return language === "tr" ? "AI servisi yapilandirilmamis." : "AI service is not configured.";
  }
  if (normalized.includes("invalid_api_key") || normalized.includes("incorrect api key")) {
    return language === "tr" ? "AI servis kimlik bilgileri gecersiz." : "AI service credentials are invalid.";
  }
  if (normalized.includes("rate limit") || normalized.includes("quota")) {
    return language === "tr" ? "AI servisi gecici olarak oran sinirina takildi." : "AI service is temporarily rate limited.";
  }
  return language === "tr"
    ? "AI yorum uretimi basarisiz oldu. Kural tabanli analiz gosteriliyor."
    : "AI commentary generation failed. Showing rule-based analysis.";
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTagContent(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]).slice(0, 240) : null;
}

function extractMetaDescription(html: string): string | null {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  return match ? stripHtml(match[1]).slice(0, 280) : null;
}

function extractHeadings(html: string): string[] {
  const matches = Array.from(html.matchAll(/<(h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi));
  return matches
    .map((match) => stripHtml(match[2]))
    .filter(Boolean)
    .slice(0, 6);
}

async function fetchLandingPageSnapshot(url: string): Promise<FetchedPageSnapshot> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AdsecuteLandingPageAnalyzer/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      return {
        fetched: false,
        finalUrl: response.url || url,
        title: null,
        metaDescription: null,
        headings: [],
        bodyExcerpt: null,
        warning: "Page fetch was unavailable or returned non-HTML content.",
      };
    }

    const html = await response.text();
    const plainText = stripHtml(html).slice(0, 2400);

    return {
      fetched: true,
      finalUrl: response.url || url,
      title: extractTagContent(html, "title"),
      metaDescription: extractMetaDescription(html),
      headings: extractHeadings(html),
      bodyExcerpt: plainText || null,
      warning: null,
    };
  } catch (error) {
    return {
      fetched: false,
      finalUrl: url,
      title: null,
      metaDescription: null,
      headings: [],
      bodyExcerpt: null,
      warning: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}

function buildUserPrompt(
  report: LandingPageAiReport,
  ruleReport: LandingPageRuleReport,
  pageSnapshot: FetchedPageSnapshot,
  language: AppLanguage,
): string {
  return JSON.stringify({
    task: "Generate a compact UX audit for this landing page. The output should complement the deterministic performance diagnosis rather than repeat it.",
    focusAreas: [
      "Use the landing page URL and fetched page snapshot to infer page purpose, IA, messaging, and CTA structure.",
      "Translate performance weakness into likely UX, IA, messaging, or handoff causes.",
      "Use Baymard, Nielsen heuristics, Laws of UX, and basic WCAG thinking where relevant.",
      "For listing, homepage, content, and campaign pages, treat product-page and cart leakage as downstream handoff issues unless the rule report explicitly says the current page is the bottleneck.",
      "If page snapshot content is present, anchor observations in visible messaging, headings, structure, commerce cues, and category framing from that snapshot.",
      "Do not simply paraphrase the deterministic rule report; add net-new UX interpretation and practical audit findings.",
      "Recommendations should be framed as UX fixes, IA fixes, clarity improvements, or handoff improvements.",
      "Call out when tracking confidence is weak or when analytics may be misleading.",
      `Write all narrative content in ${getAiNarrativeLanguage(language)}.`,
      getNonTranslatableTermsInstruction(language),
    ],
    outputSchema: {
      summary: `string, 2-4 sentences written like an executive summary in ${getAiNarrativeLanguage(language)}`,
      insights: "string[3] containing critical UX findings or violations",
      recommendations: "string[3] containing actionable UX recommendations or quick wins",
      risks: "string[3] containing cognitive load, accessibility, or conversion-risk observations",
    },
    report: {
      ...report,
      biggestLeakLabel: report.biggestLeak
        ? `${LANDING_PAGE_FUNNEL_LABELS[language][report.biggestLeak.from]} -> ${LANDING_PAGE_FUNNEL_LABELS[language][report.biggestLeak.to]}`
        : null,
    },
    ruleReport,
    pageSnapshot,
  });
}

function normalizeCommentary(payload: unknown, fallback: LandingPageAiCommentary): LandingPageAiCommentary {
  if (!payload || typeof payload !== "object") return fallback;
  const source = payload as Partial<LandingPageAiCommentary>;
  const normalizeList = (value: unknown, backup: string[]) => {
    if (!Array.isArray(value)) return backup;
    const normalized = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3);
    return normalized.length === 3 ? normalized : backup;
  };

  return {
    summary:
      typeof source.summary === "string" && source.summary.trim().length > 0
        ? source.summary.trim()
        : fallback.summary,
    insights: normalizeList(source.insights, fallback.insights),
    recommendations: normalizeList(source.recommendations, fallback.recommendations),
    risks: normalizeList(source.risks, fallback.risks),
  };
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as RequestPayload | null;
  const businessId = payload?.businessId ?? null;

  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;
  const language = await resolveRequestLanguage(request);

  const report = payload?.report;
  const ruleReport = payload?.ruleReport;
  if (!isValidReport(report) || !isValidRuleReport(ruleReport)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_report",
        message: "A valid landing page AI and rule report payload is required.",
      },
      { status: 400 }
    );
  }

  const pageSnapshot = await fetchLandingPageSnapshot(report.url);
  const fallback = buildLandingPageAiFallback(report, ruleReport, language, pageSnapshot);
  const messages = [
    { role: "system" as const, content: getSystemPrompt(language) },
    { role: "user" as const, content: buildUserPrompt(report, ruleReport, pageSnapshot, language) },
  ];

  try {
    const openai = getOpenAI();
    let content = "";
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages,
      });
      content = response.choices[0]?.message?.content ?? "";
    } catch (errorWithFormat) {
      if (!isUnsupportedParameterError(errorWithFormat)) throw errorWithFormat;
      const fallbackResponse = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 700,
        messages,
      });
      content = fallbackResponse.choices[0]?.message?.content ?? "";
    }

    return NextResponse.json({
      ok: true,
      source: "ai",
      commentary: normalizeCommentary(parseJson(content), fallback),
      warning: null,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      ok: true,
      source: "fallback",
      commentary: fallback,
      warning: sanitizeErrorMessage(raw, language),
    });
  }
}
