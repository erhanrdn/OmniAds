import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireBusinessAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import {
  buildHeuristicCreativeDecisions,
  generateCreativeDecisions,
  type CreativeDecisionResult,
  type CreativeDecisionInputRow,
} from "@/lib/ai/generate-creative-decisions";

interface RequestPayload {
  businessId?: string;
  currency?: string;
  creatives?: CreativeDecisionInputRow[];
  forceRefresh?: boolean;
}

interface CachedCreativeDecisionRow {
  decisions: unknown;
  source: "ai" | "fallback";
  warning: string | null;
  updated_at: string;
}

function sanitizeAiErrorMessage(input: string): string {
  const normalized = input.toLowerCase();
  if (normalized.includes("incorrect api key") || normalized.includes("invalid_api_key")) {
    return "AI service is not configured correctly (invalid API key).";
  }
  if (normalized.includes("api key") && normalized.includes("not set")) {
    return "AI service is not configured (missing API key).";
  }
  if (normalized.includes("rate limit") || normalized.includes("quota")) {
    return "AI service is temporarily rate limited. Please try again shortly.";
  }
  if (normalized.includes("empty response")) {
    return "AI returned an empty response for creative decisions.";
  }
  if (normalized.includes("json") && normalized.includes("schema")) {
    return "AI returned a response that did not match the expected decision schema.";
  }
  if (normalized.includes("unexpected token") || normalized.includes("json") && normalized.includes("position")) {
    return "AI returned invalid JSON for creative decisions.";
  }
  if (normalized.includes("timed out")) {
    return "AI creative decision request timed out.";
  }
  if (normalized.includes("response_format") || normalized.includes("json_object")) {
    return "AI model response format is not compatible with structured JSON mode for this request.";
  }
  if (normalized.includes("context length") || normalized.includes("maximum context length")) {
    return "AI request exceeded model context limits. Try a smaller selection or rerun analysis.";
  }
  if (normalized.includes("all creative decision batches failed")) {
    const short = input.slice(0, 220);
    return `AI decision generation failed (${short}).`;
  }
  return "AI decision generation failed. Please try again.";
}

function toFinite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeRows(rows: unknown): CreativeDecisionInputRow[] {
  if (!Array.isArray(rows)) return [];
  const normalized = rows
    .slice(0, 400)
    .map((row): CreativeDecisionInputRow | null => {
      if (!row || typeof row !== "object") return null;
      const source = row as Record<string, unknown>;
      const creativeId = typeof source.creativeId === "string" ? source.creativeId : "";
      if (!creativeId) return null;
      const creativeFormat: CreativeDecisionInputRow["creativeFormat"] =
        source.creativeFormat === "video" ||
        source.creativeFormat === "catalog" ||
        source.creativeFormat === "image"
          ? source.creativeFormat
          : "image";
      return {
        creativeId,
        name: typeof source.name === "string" ? source.name : "Creative",
        creativeFormat,
        creativeAgeDays: toFinite(source.creativeAgeDays),
        spendVelocity: toFinite(source.spendVelocity),
        frequency: toFinite(source.frequency),
        spend: toFinite(source.spend),
        purchaseValue: toFinite(source.purchaseValue),
        roas: toFinite(source.roas),
        cpa: toFinite(source.cpa),
        ctr: toFinite(source.ctr),
        cpm: toFinite(source.cpm),
        cpc: toFinite(source.cpc),
        purchases: toFinite(source.purchases),
        impressions: toFinite(source.impressions),
        linkClicks: toFinite(source.linkClicks),
        hookRate: toFinite(source.hookRate),
        holdRate: toFinite(source.holdRate),
        video25Rate: toFinite(source.video25Rate),
        watchRate: toFinite(source.watchRate),
        video75Rate: toFinite(source.video75Rate),
        clickToPurchaseRate: toFinite(source.clickToPurchaseRate),
        atcToPurchaseRate: toFinite(source.atcToPurchaseRate),
      };
    });
  return normalized.filter((row): row is CreativeDecisionInputRow => Boolean(row));
}

function buildAnalysisKey(currency: string, creatives: CreativeDecisionInputRow[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        currency,
        creatives,
      })
    )
    .digest("hex");
}

function normalizeDecisionArray(value: unknown): CreativeDecisionResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const action =
        source.action === "scale_hard" ||
        source.action === "scale" ||
        source.action === "watch" ||
        source.action === "test_more" ||
        source.action === "pause" ||
        source.action === "kill"
          ? source.action
          : null;
      if (typeof source.creativeId !== "string" || !action) return null;
      return {
        creativeId: source.creativeId,
        action,
        confidence:
          typeof source.confidence === "number" && Number.isFinite(source.confidence)
            ? source.confidence
            : 0.5,
        reasons: Array.isArray(source.reasons)
          ? source.reasons.filter((reason): reason is string => typeof reason === "string")
          : [],
        nextStep: typeof source.nextStep === "string" ? source.nextStep : "",
      };
    })
    .filter((item): item is CreativeDecisionResult => Boolean(item));
}

async function getCachedCreativeDecisions(params: {
  businessId: string;
  analysisKey: string;
}): Promise<CachedCreativeDecisionRow | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT decisions, source, warning, updated_at
    FROM ai_creative_decisions_cache
    WHERE business_id = ${params.businessId}
      AND analysis_key = ${params.analysisKey}
    LIMIT 1
  `) as CachedCreativeDecisionRow[];
  return rows[0] ?? null;
}

async function saveCreativeDecisions(params: {
  businessId: string;
  analysisKey: string;
  currency: string;
  creativeCount: number;
  decisions: CreativeDecisionResult[];
  source: "ai" | "fallback";
  warning?: string | null;
}): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO ai_creative_decisions_cache (
      business_id,
      analysis_key,
      currency,
      creative_count,
      decisions,
      source,
      warning,
      updated_at
    ) VALUES (
      ${params.businessId},
      ${params.analysisKey},
      ${params.currency},
      ${params.creativeCount},
      ${JSON.stringify(params.decisions)}::jsonb,
      ${params.source},
      ${params.warning ?? null},
      now()
    )
    ON CONFLICT (business_id, analysis_key)
    DO UPDATE SET
      currency = EXCLUDED.currency,
      creative_count = EXCLUDED.creative_count,
      decisions = EXCLUDED.decisions,
      source = EXCLUDED.source,
      warning = EXCLUDED.warning,
      updated_at = now()
  `;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as RequestPayload | null;
  const businessId = payload?.businessId ?? null;

  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;

  const creatives = normalizeRows(payload?.creatives);
  const currency = payload?.currency ?? "USD";
  const forceRefresh = payload?.forceRefresh === true;
  if (creatives.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_creatives",
        message: "At least one creative row is required.",
      },
      { status: 400 }
    );
  }

  const analysisKey = buildAnalysisKey(currency, creatives);

  if (!forceRefresh) {
    const cached = await getCachedCreativeDecisions({
      businessId: access.membership.businessId,
      analysisKey,
    });
    if (cached) {
      return NextResponse.json({
        ok: true,
        source: "cache",
        warning: cached.warning,
        lastSyncedAt: cached.updated_at,
        decisions: normalizeDecisionArray(cached.decisions),
      });
    }
  }

  try {
    const decisions = await generateCreativeDecisions({
      businessId: access.membership.businessId,
      currency,
      creatives,
    });

    const byId = new Map(decisions.map((item) => [item.creativeId, item]));
    const heuristicById = new Map(
      buildHeuristicCreativeDecisions(creatives).map((item) => [item.creativeId, item])
    );
    const completeDecisions = creatives.map((row) => {
      const matched = byId.get(row.creativeId);
      if (matched) return matched;
      return (
        heuristicById.get(row.creativeId) ?? {
          creativeId: row.creativeId,
          action: "watch" as const,
          confidence: 0.35,
          reasons: ["AI did not return a decision for this creative."],
          nextStep: "Keep active and re-evaluate after more spend.",
        }
      );
    });
    const matchedCount = decisions.length;
    const partialWarning =
      matchedCount < creatives.length
        ? `AI returned decisions for ${matchedCount}/${creatives.length} creatives. Remaining creatives used rule-based fallback.`
        : null;

    await saveCreativeDecisions({
      businessId: access.membership.businessId,
      analysisKey,
      currency,
      creativeCount: creatives.length,
      decisions: completeDecisions,
      source: "ai",
      warning: partialWarning,
    });

    return NextResponse.json({
      ok: true,
      source: "ai",
      warning: partialWarning,
      lastSyncedAt: new Date().toISOString(),
      decisions: completeDecisions,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai/creatives/decisions] generation failed", rawMessage);
    const message = sanitizeAiErrorMessage(rawMessage);
    const fallbackDecisions = buildHeuristicCreativeDecisions(creatives);
    await saveCreativeDecisions({
      businessId: access.membership.businessId,
      analysisKey,
      currency,
      creativeCount: creatives.length,
      decisions: fallbackDecisions,
      source: "fallback",
      warning: message,
    });
    return NextResponse.json({
      ok: true,
      source: "fallback",
      warning: message,
      lastSyncedAt: new Date().toISOString(),
      decisions: fallbackDecisions,
    });
  }
}
