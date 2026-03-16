import { getOpenAI } from "@/lib/openai";

const AI_MODEL = "gpt-5-nano";
const CREATIVE_DECISION_BATCH_SIZE = 220;
const CREATIVE_DECISION_MAX_TOKENS = 9000;
const CREATIVE_DECISION_RETRY_BATCH_SIZE = 4;
const CREATIVE_DECISION_RETRY_MAX_TOKENS = 1800;
const CREATIVE_DECISION_REPAIR_BATCH_SIZE = 10;
const CREATIVE_DECISION_REPAIR_ATTEMPTS = 2;

export type CreativeDecisionAction = "scale_hard" | "scale" | "watch" | "test_more" | "pause" | "kill";

export interface CreativeDecisionInputRow {
  creativeId: string;
  name: string;
  creativeFormat?: "image" | "video" | "catalog";
  creativeAgeDays: number;
  spendVelocity: number;
  frequency: number;
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  cpc: number;
  purchases: number;
  impressions: number;
  linkClicks: number;
  hookRate: number;
  holdRate: number;
  video25Rate: number;
  watchRate: number;
  video75Rate: number;
  clickToPurchaseRate: number;
  atcToPurchaseRate: number;
}

export interface GenerateCreativeDecisionsInput {
  businessId: string;
  currency: string;
  creatives: CreativeDecisionInputRow[];
}

export interface CreativeDecisionResult {
  creativeId: string;
  action: CreativeDecisionAction;
  confidence: number;
  reasons: string[];
  nextStep: string;
}

interface ParsedAiDecisionPayload {
  decisions: Array<{
    creativeId?: string;
    action?: string;
    classification?: string;
    score?: number;
    confidence?: number;
    confidenceLevel?: string;
    reasons?: unknown;
    analysis?: string;
    nextStep?: string;
  }>;
}

const SYSTEM_PROMPT = `You are a senior ecommerce performance marketing media buyer responsible for evaluating advertising creatives.

Your task is to analyze advertising creative performance using marketing funnel metrics and classify each creative into one of the following operational states:

SCALE HARD
SCALE
WATCH
TEST MORE
PAUSE
KILL

These classifications represent real budget allocation decisions used by professional media buyers managing performance campaigns.

Your goal is to determine which creatives deserve aggressive scaling, which should continue testing, and which should be paused or completely stopped.

Never rely on a single metric. Always analyze creative performance holistically across the entire marketing funnel.

CREATIVE LIFECYCLE MODEL

Creatives move through a lifecycle in performance marketing:

TEST -> WATCH -> SCALE -> SCALE HARD -> FATIGUE -> PAUSE -> KILL

Your job is to identify where the creative currently sits in this lifecycle based on the provided performance metrics.

INPUT METRICS

You may receive metrics including:

creativeAgeDays
spendVelocity
frequency

impressions
spend
roas
cpa
purchaseValue
purchases

ctr
cpc
cpm
linkClicks

hookRate
holdRate
watchRate

video25Rate
video75Rate

clickToPurchaseRate
atcToPurchaseRate

creativeFormat

accountAverageRoas
accountAverageCpa
accountAverageCTR
accountAverageConversionRate

CREATIVE ANALYSIS FRAMEWORK

Evaluate creatives through five funnel layers:

1. Attention Layer
2. Engagement Layer
3. Click Intent Layer
4. Conversion Layer
5. Revenue Efficiency Layer

Strong creatives perform well across multiple funnel layers.

RELATIVE PERFORMANCE ANALYSIS

Always compare creative performance against account averages when available.

Important comparisons:

creative ROAS vs accountAverageRoas
creative CPA vs accountAverageCpa
creative CTR vs accountAverageCTR
creative conversion rate vs accountAverageConversionRate

Relative performance is often more important than absolute numbers.

CRITICAL DECISION CONSTRAINT

Never use fixed absolute ROAS thresholds (like "ROAS below 5") as a direct pause/kill rule.
Decisions must be relative to account context first.
If ROAS is above accountAverageRoas and CPA is not meaningfully worse than accountAverageCpa,
PAUSE/KILL is usually inconsistent unless another severe risk is clearly present.

CREATIVE FORMAT CONTEXT

If creativeFormat = video:

Engagement metrics become more important:
watchRate
holdRate
video completion

If creativeFormat = image:

CTR and conversion signals matter more.

DATA SUFFICIENCY RULES

Avoid aggressive decisions when data is insufficient.

Low impressions, low spend, or very few conversions should bias toward TEST MORE or WATCH.

Do not kill or scale aggressively when statistical confidence is low.

CREATIVE SCORING MODEL

Produce a creative performance score between 0 and 100.

Score interpretation:

90-100 exceptional
80-89 strong
65-79 good
50-64 moderate
35-49 weak
0-34 poor

The score should reflect funnel health, revenue efficiency, engagement strength, statistical confidence, and relative performance vs account averages.

IMPORTANT RULES

Do not hallucinate metrics.
Only analyze the data provided.
Do not invent numbers.
Always reference relevant metrics in your reasoning.

OUTPUT CONTRACT FOR THIS API

Return ONLY valid JSON in this exact structure:
{
  "decisions": [
    {
      "creativeId": "string",
      "classification": "SCALE HARD | SCALE | WATCH | TEST MORE | PAUSE | KILL",
      "score": 0,
      "confidence": "LOW | MEDIUM | HIGH",
      "analysis": "short explanation",
      "nextStep": "string"
    }
  ]
}

Each creativeId must appear exactly once.`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeReasonList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 2)
    .map((item) => item.trim());
}

function normalizeAction(action: string | undefined): CreativeDecisionAction | null {
  if (!action) return null;
  const normalized = action.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "scale_hard") return "scale_hard";
  if (normalized === "scale") return "scale";
  if (normalized === "watch") return "watch";
  if (normalized === "test_more") return "test_more";
  if (normalized === "pause") return "pause";
  if (normalized === "kill") return "kill";
  return null;
}

function mapConfidenceToNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(value, 0, 1);
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "low") return 0.42;
  if (normalized === "medium") return 0.64;
  if (normalized === "high") return 0.84;
  return null;
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  if (size <= 0) return [rows];
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function buildUserPrompt(input: GenerateCreativeDecisionsInput): string {
  const spendValues = input.creatives
    .map((row) => (Number.isFinite(row.spend) ? row.spend : 0))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
  const roasValues = input.creatives
    .map((row) => (Number.isFinite(row.roas) ? row.roas : 0))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b);
  const cpaValues = input.creatives
    .map((row) => (Number.isFinite(row.cpa) ? row.cpa : 0))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const totalSpend = input.creatives.reduce((sum, row) => sum + (Number.isFinite(row.spend) ? row.spend : 0), 0);
  const spendMedian = percentile(spendValues, 0.5);
  const spendP25 = percentile(spendValues, 0.25);
  const spendP75 = percentile(spendValues, 0.75);
  const roasMedian = percentile(roasValues, 0.5);
  const accountAverageRoas =
    roasValues.length > 0 ? roasValues.reduce((sum, value) => sum + value, 0) / roasValues.length : 0;
  const accountAverageCpa =
    cpaValues.length > 0 ? cpaValues.reduce((sum, value) => sum + value, 0) / cpaValues.length : 0;
  const ctrValues = input.creatives
    .map((row) => (Number.isFinite(row.ctr) ? row.ctr : 0))
    .filter((value) => value >= 0);
  const accountAverageCTR =
    ctrValues.length > 0 ? ctrValues.reduce((sum, value) => sum + value, 0) / ctrValues.length : 0;
  const totalImpressions = input.creatives.reduce(
    (sum, row) => sum + (Number.isFinite(row.impressions) ? row.impressions : 0),
    0
  );
  const totalPurchases = input.creatives.reduce(
    (sum, row) => sum + (Number.isFinite(row.purchases) ? row.purchases : 0),
    0
  );
  const accountAverageConversionRate =
    totalImpressions > 0 ? (totalPurchases / totalImpressions) * 100 : 0;

  const safePctDelta = (value: number, baseline: number, inverse = false): number => {
    if (!(baseline > 0)) return 0;
    const delta = ((value - baseline) / baseline) * 100;
    return Number((inverse ? -delta : delta).toFixed(3));
  };

  const rows = input.creatives.map((row) => ({
    creativeId: row.creativeId,
    name: row.name,
    creativeFormat: row.creativeFormat ?? "image",
    creativeAgeDays: Number(row.creativeAgeDays.toFixed(2)),
    spendVelocity: Number(row.spendVelocity.toFixed(4)),
    frequency: Number(row.frequency.toFixed(4)),
    spend: Number(row.spend.toFixed(2)),
    spendSharePct: totalSpend > 0 ? Number(((row.spend / totalSpend) * 100).toFixed(3)) : 0,
    spendVsMedian: spendMedian > 0 ? Number((row.spend / spendMedian).toFixed(3)) : 0,
    roasDeltaVsAccountPct: safePctDelta(row.roas, accountAverageRoas, false),
    cpaDeltaVsAccountPct: safePctDelta(row.cpa, accountAverageCpa, true),
    ctrDeltaVsAccountPct: safePctDelta(row.ctr, accountAverageCTR, false),
    conversionRatePct: row.impressions > 0 ? Number(((row.purchases / row.impressions) * 100).toFixed(6)) : 0,
    conversionDeltaVsAccountPct:
      row.impressions > 0
        ? safePctDelta((row.purchases / row.impressions) * 100, accountAverageConversionRate, false)
        : 0,
    purchaseValue: Number(row.purchaseValue.toFixed(2)),
    roas: Number(row.roas.toFixed(4)),
    cpa: Number(row.cpa.toFixed(4)),
    ctr: Number(row.ctr.toFixed(4)),
    cpm: Number(row.cpm.toFixed(4)),
    cpc: Number(row.cpc.toFixed(4)),
    purchases: row.purchases,
    impressions: row.impressions,
    linkClicks: row.linkClicks,
    hookRate: Number(row.hookRate.toFixed(4)),
    holdRate: Number(row.holdRate.toFixed(4)),
    video25Rate: Number(row.video25Rate.toFixed(4)),
    watchRate: Number(row.watchRate.toFixed(4)),
    video75Rate: Number(row.video75Rate.toFixed(4)),
    clickToPurchaseRate: Number(row.clickToPurchaseRate.toFixed(4)),
    atcToPurchaseRate: Number(row.atcToPurchaseRate.toFixed(4)),
  }));

  return JSON.stringify({
    businessId: input.businessId,
    currency: input.currency,
    accountContext: {
      creativeCount: input.creatives.length,
      totalSpend: Number(totalSpend.toFixed(2)),
      spendMedian: Number(spendMedian.toFixed(2)),
      spendP25: Number(spendP25.toFixed(2)),
      spendP75: Number(spendP75.toFixed(2)),
      accountAverageRoas: Number(accountAverageRoas.toFixed(4)),
      accountAverageCpa: Number(accountAverageCpa.toFixed(4)),
      accountAverageCTR: Number(accountAverageCTR.toFixed(4)),
      accountAverageConversionRate: Number(accountAverageConversionRate.toFixed(6)),
      roasMedian: Number(roasMedian.toFixed(4)),
    },
    creatives: rows,
    instructions:
      "Classify every creativeId exactly once. Base decisions on dataset-relative performance and account averages from this same dataset. Focus on commercial materiality: avoid aggressive pause decisions on tiny-spend rows unless downside evidence is strong and meaningful.",
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low];
  const weight = idx - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function sanitizeInputRows(rows: CreativeDecisionInputRow[]): CreativeDecisionInputRow[] {
  return rows.map((row) => ({
    ...row,
    creativeFormat: row.creativeFormat ?? "image",
    creativeAgeDays: Number.isFinite(row.creativeAgeDays) ? row.creativeAgeDays : 0,
    spendVelocity: Number.isFinite(row.spendVelocity) ? row.spendVelocity : 0,
    frequency: Number.isFinite(row.frequency) ? row.frequency : 0,
    spend: Number.isFinite(row.spend) ? row.spend : 0,
    purchaseValue: Number.isFinite(row.purchaseValue) ? row.purchaseValue : 0,
    roas: Number.isFinite(row.roas) ? row.roas : 0,
    cpa: Number.isFinite(row.cpa) ? row.cpa : 0,
    ctr: Number.isFinite(row.ctr) ? row.ctr : 0,
    cpm: Number.isFinite(row.cpm) ? row.cpm : 0,
    cpc: Number.isFinite(row.cpc) ? row.cpc : 0,
    purchases: Number.isFinite(row.purchases) ? row.purchases : 0,
    impressions: Number.isFinite(row.impressions) ? row.impressions : 0,
    linkClicks: Number.isFinite(row.linkClicks) ? row.linkClicks : 0,
    hookRate: Number.isFinite(row.hookRate) ? row.hookRate : 0,
    holdRate: Number.isFinite(row.holdRate) ? row.holdRate : 0,
    video25Rate: Number.isFinite(row.video25Rate) ? row.video25Rate : 0,
    watchRate: Number.isFinite(row.watchRate) ? row.watchRate : 0,
    video75Rate: Number.isFinite(row.video75Rate) ? row.video75Rate : 0,
    clickToPurchaseRate: Number.isFinite(row.clickToPurchaseRate) ? row.clickToPurchaseRate : 0,
    atcToPurchaseRate: Number.isFinite(row.atcToPurchaseRate) ? row.atcToPurchaseRate : 0,
  }));
}

export function buildHeuristicCreativeDecisions(
  rows: CreativeDecisionInputRow[]
): CreativeDecisionResult[] {
  if (rows.length === 0) return [];

  const safeRows = sanitizeInputRows(rows);
  const roasValues = safeRows.map((r) => r.roas).filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const spendValues = safeRows.map((r) => r.spend).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);

  const roasAvg = roasValues.length > 0 ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length : 0;
  const spendP20 = percentile(spendValues, 0.2);
  const spendP50 = percentile(spendValues, 0.5);
  const spendP80 = percentile(spendValues, 0.8);

  const base = safeRows.map((row) => {
    const lowReliability = row.spend < Math.max(1, spendP20) || row.purchases < 2;
    let action: CreativeDecisionAction = "watch";

    if (!lowReliability && roasAvg > 0 && row.roas >= roasAvg * 1.45 && row.spend >= spendP50 && row.purchases >= 3) {
      action = "scale_hard";
    } else if (!lowReliability && roasAvg > 0 && row.roas >= roasAvg * 1.2) {
      action = "scale";
    } else if (!lowReliability && roasAvg > 0 && row.roas < roasAvg * 0.55 && row.spend >= spendP80 && row.purchases === 0) {
      action = "kill";
    } else if (!lowReliability && roasAvg > 0 && row.roas < roasAvg * 0.8) {
      action = "pause";
    } else if (lowReliability) {
      action = "test_more";
    } else {
      action = "watch";
    }

    const confidenceBase =
      lowReliability
        ? 0.4
        : row.spend >= spendP50
          ? 0.72
          : 0.58;

    const confidence = clamp(
      action === "watch" || action === "test_more" ? confidenceBase - 0.06 : confidenceBase,
      0.3,
      0.88
    );

    const reasons =
      action === "scale_hard"
        ? [
            "ROAS and conversion reliability are top-tier for this account baseline.",
            "Commercial impact is high enough to accelerate budget confidently.",
          ]
        : action === "scale"
        ? [
            "ROAS is above account-relative baseline.",
            "Spend and conversion volume are reliable enough to scale.",
          ]
        : action === "kill"
          ? [
              "This creative is consuming meaningful spend with strongly negative economics.",
              "Downside evidence is strong enough to stop this variant immediately.",
            ]
        : action === "pause"
          ? [
              "ROAS is below account-relative baseline.",
              "Spend indicates meaningful downside risk.",
            ]
          : action === "test_more"
            ? [
                "Current data is too limited for a confident scale or stop decision.",
                "Run additional controlled tests to improve signal quality.",
              ]
          : [
              "Signals are mixed vs account baseline.",
              "Keep running and reassess with more data.",
            ];

    const nextStep =
      action === "scale_hard"
        ? "Scale aggressively in controlled steps and monitor efficiency daily."
        : action === "scale"
        ? "Increase budget gradually and monitor CPA/ROAS for 3 days."
        : action === "kill"
          ? "Stop this creative now and reallocate budget to stronger variants."
        : action === "pause"
          ? "Pause and replace with a new variant for this angle."
          : action === "test_more"
            ? "Keep low budget live and run focused tests to gather stronger data."
          : "Keep active and re-evaluate after additional spend.";

    return {
      creativeId: row.creativeId,
      action,
      confidence,
      reasons,
      nextStep,
    };
  });

  return applyDecisionGuardrails(safeRows, base);
}

function applyDecisionGuardrails(
  rows: CreativeDecisionInputRow[],
  decisions: CreativeDecisionResult[]
): CreativeDecisionResult[] {
  if (rows.length === 0 || decisions.length === 0) return decisions;

  const roasValues = rows
    .map((r) => r.roas)
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  const cpaValues = rows
    .map((r) => r.cpa)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const spendValues = rows
    .map((r) => r.spend)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const roasAvg = roasValues.length > 0 ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length : 0;
  const cpaAvg = cpaValues.length > 0 ? cpaValues.reduce((a, b) => a + b, 0) / cpaValues.length : 0;
  const spendP60 = percentile(spendValues, 0.6);
  const spendP75 = percentile(spendValues, 0.75);
  const spendP35 = percentile(spendValues, 0.35);

  const rowById = new Map(rows.map((row) => [row.creativeId, row]));

  return decisions.map((decision) => {
    const row = rowById.get(decision.creativeId);
    if (!row) return decision;

    const highSpend = row.spend >= Math.max(1, spendP60);
    const veryHighSpend = row.spend >= Math.max(1, spendP75);
    const weakRoas = roasAvg > 0 && row.roas <= roasAvg * 0.65;
    const weakCpa = cpaAvg > 0 && row.cpa >= cpaAvg * 1.45;
    const lowConv = row.purchases <= 1;

    // Guardrail: prevent high-spend underperformers from staying on WATCH.
    if ((decision.action === "watch" || decision.action === "test_more") && highSpend && weakRoas && (weakCpa || !lowConv)) {
      return {
        ...decision,
        action: "pause",
        confidence: Math.max(decision.confidence, veryHighSpend ? 0.82 : 0.74),
        reasons: [
          "Spend is high relative to this account while ROAS is significantly below average.",
          weakCpa
            ? "CPA is materially above account baseline, indicating inefficient spend."
            : "Conversion output is too weak for the current spend level.",
        ],
        nextStep: "Pause this creative and shift budget to stronger variants.",
      };
    }

    // Guardrail: avoid false SCALE when economics are clearly poor.
    if ((decision.action === "scale" || decision.action === "scale_hard") && weakRoas && weakCpa) {
      return {
        ...decision,
        action: "watch",
        confidence: Math.min(decision.confidence, 0.56),
        reasons: [
          "Efficiency signals are weaker than account baseline.",
          "Hold budget increase until ROAS/CPA stabilizes.",
        ],
        nextStep: "Keep budget flat and reassess after more reliable performance.",
      };
    }

    return decision;
  });
}

export async function generateCreativeDecisions(
  input: GenerateCreativeDecisionsInput
): Promise<CreativeDecisionResult[]> {
  const creatives = sanitizeInputRows(input.creatives).slice(0, 220);

  const openai = getOpenAI();
  const byCreativeId = new Map<string, CreativeDecisionResult>();
  const batchErrors: string[] = [];

  const requestBatch = async (
    batchRows: CreativeDecisionInputRow[],
    maxTokens: number
  ): Promise<{ decisions: CreativeDecisionResult[]; error: string | null }> => {
    try {
      const response = await openai.chat.completions.create({
        model: AI_MODEL,
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt({
              ...input,
              creatives: batchRows,
            }),
          },
        ],
      });

      const choice = response.choices[0];
      const content = choice?.message?.content ?? null;
      if (!content) {
        return { decisions: [], error: "empty response" };
      }

      let parsed: ParsedAiDecisionPayload;
      try {
        parsed = JSON.parse(content) as ParsedAiDecisionPayload;
      } catch {
        return { decisions: [], error: "invalid JSON" };
      }

      if (!parsed || !Array.isArray(parsed.decisions)) {
        return { decisions: [], error: "schema mismatch" };
      }

      const allowedIds = new Set(batchRows.map((row) => row.creativeId));
      const decisions: CreativeDecisionResult[] = [];
      for (const item of parsed.decisions) {
        const creativeId = typeof item.creativeId === "string" ? item.creativeId : "";
        const action = normalizeAction(item.action) ?? normalizeAction(item.classification);
        if (!creativeId || !action || !allowedIds.has(creativeId)) continue;

        const mappedConfidence =
          mapConfidenceToNumber(item.confidence) ??
          mapConfidenceToNumber(item.confidenceLevel) ??
          0.5;
        const analysisText = typeof item.analysis === "string" ? item.analysis.trim() : "";
        const reasonsFromAnalysis = analysisText.length > 0 ? [analysisText] : [];
        const reasons = sanitizeReasonList(item.reasons);

        decisions.push({
          creativeId,
          action,
          confidence: mappedConfidence,
          reasons: reasons.length > 0 ? reasons : reasonsFromAnalysis,
          nextStep:
            typeof item.nextStep === "string" && item.nextStep.trim().length > 0
              ? item.nextStep.trim()
              : "Monitor next 3 days before changing budget.",
        });
      }

      if (choice?.finish_reason === "length" && decisions.length < batchRows.length) {
        return { decisions, error: "response truncated by max tokens" };
      }

      return { decisions, error: null };
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : "request failed";
      return { decisions: [], error: message };
    }
  };

  for (let index = 0; index < creatives.length; index += CREATIVE_DECISION_BATCH_SIZE) {
    const batch = creatives.slice(index, index + CREATIVE_DECISION_BATCH_SIZE);
    const batchNumber = Math.floor(index / CREATIVE_DECISION_BATCH_SIZE) + 1;
    const initial = await requestBatch(batch, CREATIVE_DECISION_MAX_TOKENS);
    for (const decision of initial.decisions) {
      byCreativeId.set(decision.creativeId, decision);
    }

    const missingIds = batch
      .map((row) => row.creativeId)
      .filter((creativeId) => !byCreativeId.has(creativeId));

    if (initial.error) {
      batchErrors.push(`batch ${batchNumber}: ${initial.error}`);
    }

    if (missingIds.length > 0) {
      const missingRows = batch.filter((row) => missingIds.includes(row.creativeId));
      const retryChunks = chunkRows(missingRows, CREATIVE_DECISION_RETRY_BATCH_SIZE);
      for (let retryIndex = 0; retryIndex < retryChunks.length; retryIndex += 1) {
        const retryBatch = retryChunks[retryIndex];
        const retried = await requestBatch(retryBatch, CREATIVE_DECISION_RETRY_MAX_TOKENS);
        for (const decision of retried.decisions) {
          byCreativeId.set(decision.creativeId, decision);
        }

        const retryMissingCount = retryBatch.filter((row) => !byCreativeId.has(row.creativeId)).length;
        if (retried.error || retryMissingCount > 0) {
          batchErrors.push(
            `batch ${batchNumber} retry ${retryIndex + 1}: ${retried.error ?? `${retryMissingCount} missing decision(s)`}`
          );
        }
      }
    }
  }

  // Final repair pass: ask only for missing IDs before falling back to heuristics upstream.
  const missingAfterPass = creatives.filter((row) => !byCreativeId.has(row.creativeId));
  if (missingAfterPass.length > 0) {
    for (let attempt = 1; attempt <= CREATIVE_DECISION_REPAIR_ATTEMPTS; attempt += 1) {
      let remaining = creatives.filter((row) => !byCreativeId.has(row.creativeId));
      if (remaining.length === 0) break;
      const currentChunks = chunkRows(remaining, CREATIVE_DECISION_REPAIR_BATCH_SIZE);
      for (let chunkIndex = 0; chunkIndex < currentChunks.length; chunkIndex += 1) {
        const chunk = currentChunks[chunkIndex];
        const repaired = await requestBatch(chunk, CREATIVE_DECISION_RETRY_MAX_TOKENS);
        for (const decision of repaired.decisions) {
          byCreativeId.set(decision.creativeId, decision);
        }
        const stillMissing = chunk.filter((row) => !byCreativeId.has(row.creativeId)).length;
        if (repaired.error || stillMissing > 0) {
          batchErrors.push(
            `repair attempt ${attempt} chunk ${chunkIndex + 1}: ${repaired.error ?? `${stillMissing} missing decision(s)`}`
          );
        }
      }
      remaining = creatives.filter((row) => !byCreativeId.has(row.creativeId));
      if (remaining.length === 0) break;
    }
  }

  if (byCreativeId.size === 0) {
    const reason = batchErrors.length > 0 ? batchErrors.join(" | ") : "no usable decisions";
    throw new Error(`All creative decision batches failed: ${reason}`);
  }

  const raw = creatives
    .map((row) => byCreativeId.get(row.creativeId))
    .filter((item): item is CreativeDecisionResult => Boolean(item));

  return raw;
}
