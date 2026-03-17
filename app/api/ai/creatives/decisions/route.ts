import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireBusinessAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import {
  buildHeuristicCreativeDecisions,
  CREATIVE_DECISION_ENGINE_VERSION,
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
        decisionEngineVersion: CREATIVE_DECISION_ENGINE_VERSION,
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
        score:
          typeof source.score === "number" && Number.isFinite(source.score)
            ? Math.max(0, Math.min(100, Math.round(source.score)))
            : 50,
        confidence:
          typeof source.confidence === "number" && Number.isFinite(source.confidence)
            ? source.confidence
            : 0.5,
        scoringFactors: Array.isArray(source.scoringFactors)
          ? source.scoringFactors.filter((factor): factor is string => typeof factor === "string")
          : [],
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

  const decisions = buildHeuristicCreativeDecisions(creatives);

  await saveCreativeDecisions({
    businessId: access.membership.businessId,
    analysisKey,
    currency,
    creativeCount: creatives.length,
    decisions,
    source: "ai",
    warning: null,
  });

  return NextResponse.json({
    ok: true,
    source: "ai",
    warning: null,
    lastSyncedAt: new Date().toISOString(),
    decisions,
  });
}
