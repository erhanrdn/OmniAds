import type { AiDailyInsightSnapshot } from "@/src/types";
import {
  buildApiUrl,
  getApiErrorMessage,
  readJsonResponse,
} from "@/src/services/data-service-support";

export async function getLatestAiInsight(
  businessId: string
): Promise<AiDailyInsightSnapshot | null> {
  const url = buildApiUrl("/api/ai/insights/latest");
  url.searchParams.set("businessId", businessId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(payload, `AI insight request failed with status ${response.status}`)
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("AI insight API returned an invalid payload.");
  }

  const insight = "insight" in payload ? (payload as { insight: unknown }).insight : null;
  if (!insight) return null;

  return insight as AiDailyInsightSnapshot;
}

export async function generateAiInsight(businessId: string): Promise<void> {
  const url = buildApiUrl("/api/ai/insights/generate");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ businessId }),
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        payload,
        `AI insight generation failed with status ${response.status}`
      )
    );
  }
}

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
  historicalWindows?: CreativeHistoricalWindows | null;
}

export interface CreativeHistoricalWindow {
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  ctr: number;
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

export interface CreativeHistoricalWindows {
  last3?: CreativeHistoricalWindow | null;
  last7?: CreativeHistoricalWindow | null;
  last14?: CreativeHistoricalWindow | null;
  last30?: CreativeHistoricalWindow | null;
  last90?: CreativeHistoricalWindow | null;
  allHistory?: CreativeHistoricalWindow | null;
}

export interface CreativeDecision {
  creativeId: string;
  action: "scale_hard" | "scale" | "watch" | "test_more" | "pause" | "kill";
  lifecycleState?:
    | "stable_winner"
    | "emerging_winner"
    | "volatile"
    | "fatigued_winner"
    | "test_only"
    | "blocked";
  score: number;
  confidence: number;
  scoringFactors: string[];
  reasons: string[];
  nextStep: string;
}

export type CreativeDecisionSource = "cache" | "deterministic";

export interface CreativeDecisionResponse {
  decisions: CreativeDecision[];
  source: CreativeDecisionSource;
  lastSyncedAt: string;
  warning?: string | null;
}

export type AiCreativeDecisionInputRow = CreativeDecisionInputRow;
export type AiCreativeHistoricalWindow = CreativeHistoricalWindow;
export type AiCreativeHistoricalWindows = CreativeHistoricalWindows;
export type AiCreativeDecision = CreativeDecision;
export type AiCreativeDecisionResponse = CreativeDecisionResponse;

export interface CreativeRuleReportFactor {
  label: string;
  impact: "positive" | "negative" | "neutral";
  value: string;
  reason: string;
}

export interface CreativeRuleReportPayload {
  creativeId: string;
  creativeName: string;
  action: CreativeDecision["action"];
  lifecycleState?: NonNullable<CreativeDecision["lifecycleState"]>;
  score: number;
  confidence: number;
  summary: string;
  coreVerdict?: string;
  accountContext: {
    roasAvg: number;
    cpaAvg: number;
    ctrAvg: number;
    spendMedian: number;
    spendP20: number;
    spendP80: number;
  };
  timeframeContext?: {
    coreVerdict: string;
    selectedRangeOverlay: string;
    historicalSupport: string;
    note?: string | null;
  };
  factors: CreativeRuleReportFactor[];
}

export interface AiCreativeRuleCommentary {
  headline: string;
  summary: string;
  opportunities: string[];
  risks: string[];
  nextActions: string[];
}

export interface AiCreativeRuleCommentaryResponse {
  source: "ai" | "fallback";
  warning?: string | null;
  commentary: AiCreativeRuleCommentary;
}

function getClientApiUrl(path: string) {
  return new URL(
    path,
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  );
}

export async function getCreativeDecisions(
  businessId: string,
  currency: string,
  creatives: CreativeDecisionInputRow[],
  forceRefresh = false
): Promise<CreativeDecisionResponse> {
  const url = getClientApiUrl("/api/creatives/decisions");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ businessId, currency, creatives, forceRefresh }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: string }).message ?? "Could not generate creative decisions.")
        : `Creative decisions request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { decisions?: unknown }).decisions)) {
    throw new Error("Creative decisions API returned an invalid payload.");
  }

  return {
    decisions: (payload as { decisions: CreativeDecision[] }).decisions,
    source:
      payload && typeof payload === "object" && "source" in payload
        ? ((payload as { source?: CreativeDecisionSource }).source ?? "deterministic")
        : "deterministic",
    lastSyncedAt:
      payload && typeof payload === "object" && "lastSyncedAt" in payload
        ? String((payload as { lastSyncedAt?: string }).lastSyncedAt ?? "")
        : "",
    warning:
      payload && typeof payload === "object" && "warning" in payload
        ? ((payload as { warning?: string | null }).warning ?? null)
        : null,
  };
}

export const getAiCreativeDecisions = getCreativeDecisions;

export async function getAiCreativeRuleCommentary(
  businessId: string,
  currency: string,
  report: CreativeRuleReportPayload
): Promise<AiCreativeRuleCommentaryResponse> {
  const url = getClientApiUrl("/api/creatives/commentary");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ businessId, currency, report }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: string }).message ?? "Could not generate AI rule commentary.")
        : `AI rule commentary request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object" || !("commentary" in payload)) {
    throw new Error("AI rule commentary API returned an invalid payload.");
  }

  return {
    source:
      payload && typeof payload === "object" && "source" in payload
        ? ((payload as { source?: "ai" | "fallback" }).source ?? "ai")
        : "ai",
    warning:
      payload && typeof payload === "object" && "warning" in payload
        ? ((payload as { warning?: string | null }).warning ?? null)
        : null,
    commentary: (payload as { commentary: AiCreativeRuleCommentary }).commentary,
  };
}
