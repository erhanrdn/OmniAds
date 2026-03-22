import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getOpenAI } from "@/lib/openai";
import {
  buildLandingPageAiFallback,
  LANDING_PAGE_FUNNEL_LABELS,
} from "@/lib/landing-pages/performance";
import type {
  LandingPageAiCommentary,
  LandingPageAiReport,
} from "@/src/types/landing-pages";

const MODEL = "gpt-5-nano";

interface RequestPayload {
  businessId?: string;
  report?: LandingPageAiReport;
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

const SYSTEM_PROMPT = `You are a senior CRO and ecommerce funnel strategist.

You will receive a deterministic landing page funnel diagnosis report.
Your job is to interpret the report for an operator.

Rules:
- Stay grounded in the provided report only.
- Do not invent missing tracking, hidden causes, or performance thresholds.
- Keep the tone concise and practical.
- Return ONLY valid JSON matching the requested schema.`;

function isValidReport(report: unknown): report is LandingPageAiReport {
  if (!report || typeof report !== "object") return false;
  const source = report as Partial<LandingPageAiReport>;
  return (
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

function sanitizeErrorMessage(input: string): string {
  const normalized = input.toLowerCase();
  if (normalized.includes("api key") && normalized.includes("not set")) {
    return "AI service is not configured.";
  }
  if (normalized.includes("invalid_api_key") || normalized.includes("incorrect api key")) {
    return "AI service credentials are invalid.";
  }
  if (normalized.includes("rate limit") || normalized.includes("quota")) {
    return "AI service is temporarily rate limited.";
  }
  return "AI commentary generation failed. Showing rule-based analysis.";
}

function buildUserPrompt(report: LandingPageAiReport): string {
  return JSON.stringify({
    task: "Interpret this landing page funnel diagnosis for a growth operator.",
    outputSchema: {
      summary: "string, 1-2 sentences",
      insights: "string[3]",
      recommendations: "string[3]",
      risks: "string[3]",
    },
    report: {
      ...report,
      biggestLeakLabel: report.biggestLeak
        ? `${LANDING_PAGE_FUNNEL_LABELS[report.biggestLeak.from]} -> ${LANDING_PAGE_FUNNEL_LABELS[report.biggestLeak.to]}`
        : null,
    },
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

  const report = payload?.report;
  if (!isValidReport(report)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_report",
        message: "A valid landing page report payload is required.",
      },
      { status: 400 }
    );
  }

  const fallback = buildLandingPageAiFallback(report);
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(report) },
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
      warning: sanitizeErrorMessage(raw),
    });
  }
}
