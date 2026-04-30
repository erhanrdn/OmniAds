/**
 * NON-PRODUCTION SPIKE SCRIPT.
 *
 * Purpose:
 * - Exercise a fixture-backed Creative Decision Center V2.1 shadow adapter.
 * - Measure planned buyer-action data readiness.
 * - Produce before/after, aggregate, config sensitivity, golden-case, and perf artifacts.
 *
 * Safety:
 * - Does not import route handlers.
 * - Does not call DB/API writes.
 * - Does not mutate production data.
 * - Uses fixture rows unless a future read-only loader is explicitly added.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  resolveCreativeDecisionOsV2,
  type CreativeDecisionOsV2Actionability,
  type CreativeDecisionOsV2Output,
  type CreativeDecisionOsV2PrimaryDecision,
  type CreativeDecisionOsV2ProblemClass,
} from "@/lib/creative-decision-os-v2";

type BuyerAction =
  | "scale"
  | "cut"
  | "refresh"
  | "protect"
  | "test_more"
  | "watch_launch"
  | "fix_delivery"
  | "fix_policy"
  | "diagnose_data";

type ProblemClassV21 =
  | "performance"
  | "creative"
  | "fatigue"
  | "delivery"
  | "policy"
  | "data_quality"
  | "campaign_context"
  | "insufficient_signal"
  | "launch_monitoring";

type PriorityBand = "critical" | "high" | "medium" | "low";
type ConfidenceBand = "high" | "medium" | "low";
type Maturity = "too_early" | "learning" | "actionable" | "mature";
type ChangeType =
  | "same_meaning"
  | "safer_more_specific"
  | "more_aggressive"
  | "less_aggressive"
  | "fallback_due_to_missing_data"
  | "conflict"
  | "unknown";

interface SpikeConfig {
  launchWindowHours: number;
  noSpendWindowHours: number;
  minSpendForMaturityMultiplier: number;
  minPurchasesForScale: number;
  minImpressionsForCtrReliability: number;
  fatigueCtrDropPct: number;
  fatigueCpmIncreasePct: number;
  fatigueFrequencyIncreasePct: number;
  maxCpaOverTargetForCut: number;
  minRoasOverTargetForScale: number;
  winnerGapDays: number;
  fatigueClusterTopN: number;
  benchmarkReliabilityMinimum: "strong" | "medium" | "weak";
  staleDataHours: number;
  minConfidenceForScale: number;
  minConfidenceForCut: number;
}

interface SpikeCreativeRow {
  creativeId: string;
  creativeName: string;
  familyId?: string | null;
  beforePrimaryDecision: string;
  beforeOperatorBucket: string;
  beforeUserLabel: string;
  activeStatus?: boolean | null;
  campaignStatus?: string | null;
  adsetStatus?: string | null;
  adStatus?: string | null;
  spend?: number | null;
  purchases?: number | null;
  impressions?: number | null;
  roas?: number | null;
  cpa?: number | null;
  recentRoas?: number | null;
  recentPurchases?: number | null;
  recentImpressions?: number | null;
  long90Roas?: number | null;
  activeBenchmarkRoas?: number | null;
  activeBenchmarkCpa?: number | null;
  peerMedianSpend?: number | null;
  trustState?: string | null;
  baselineReliability?: string | null;
  sourceTrustFlags?: string[] | null;
  campaignContextBlockerFlags?: string[] | null;
  spend24h?: number | null;
  impressions24h?: number | null;
  firstSeenAt?: string | null;
  firstSpendAt?: string | null;
  launchAgeHours?: number | null;
  reviewStatus?: string | null;
  effectiveStatus?: string | null;
  disapprovalReason?: string | null;
  limitedReason?: string | null;
  ctr7d?: number | null;
  ctr14d?: number | null;
  cpm7d?: number | null;
  cpm14d?: number | null;
  frequency7d?: number | null;
  frequency14d?: number | null;
  targetCpa?: number | null;
  targetRoas?: number | null;
  benchmarkReliability?: "strong" | "medium" | "weak" | "none" | null;
  dataFreshnessHours?: number | null;
  attributionTruth?: "ready" | "degraded" | "missing" | null;
  approvedButUnused?: boolean;
  hasBackupVariant?: boolean;
  isTopCreative?: boolean;
}

interface AdapterResult {
  buyerAction: BuyerAction;
  buyerLabel: string;
  problemClass: ProblemClassV21;
  actionability: CreativeDecisionOsV2Actionability;
  priorityBand: PriorityBand;
  confidenceBand: ConfidenceBand;
  maturity: Maturity;
  topReasonTag: string;
  nextStep: string;
  uiBucket: string;
  missingData: string[];
}

interface GoldenCase {
  id: string;
  inputSummary: string;
  fixture: SpikeCreativeRow;
  expectedPrimaryDecision: CreativeDecisionOsV2PrimaryDecision;
  expectedBuyerAction: BuyerAction;
  expectedActionability: CreativeDecisionOsV2Actionability;
  expectedProblemClass: ProblemClassV21;
  expectedPriorityBand: PriorityBand;
  expectedConfidenceBand: ConfidenceBand;
  expectedTopReasonTag: string;
  expectedMaturity: Maturity;
  expectedSafeFallbackIfDataMissing: BuyerAction | "disable_aggregate";
}

const outputDir = "docs/creative-decision-center/generated";

const defaultConfig: SpikeConfig = {
  launchWindowHours: 72,
  noSpendWindowHours: 24,
  minSpendForMaturityMultiplier: 2,
  minPurchasesForScale: 5,
  minImpressionsForCtrReliability: 5000,
  fatigueCtrDropPct: 25,
  fatigueCpmIncreasePct: 20,
  fatigueFrequencyIncreasePct: 25,
  maxCpaOverTargetForCut: 1.8,
  minRoasOverTargetForScale: 1.25,
  winnerGapDays: 7,
  fatigueClusterTopN: 3,
  benchmarkReliabilityMinimum: "medium",
  staleDataHours: 36,
  minConfidenceForScale: 70,
  minConfidenceForCut: 70,
};

const conservativeConfig: SpikeConfig = {
  ...defaultConfig,
  launchWindowHours: 96,
  minSpendForMaturityMultiplier: 3,
  minPurchasesForScale: 8,
  fatigueCtrDropPct: 35,
  fatigueCpmIncreasePct: 30,
  fatigueFrequencyIncreasePct: 35,
  maxCpaOverTargetForCut: 2.2,
  minRoasOverTargetForScale: 1.45,
  benchmarkReliabilityMinimum: "strong",
  minConfidenceForScale: 80,
  minConfidenceForCut: 80,
};

const aggressiveConfig: SpikeConfig = {
  ...defaultConfig,
  launchWindowHours: 48,
  minSpendForMaturityMultiplier: 1.25,
  minPurchasesForScale: 3,
  fatigueCtrDropPct: 15,
  fatigueCpmIncreasePct: 12,
  fatigueFrequencyIncreasePct: 15,
  maxCpaOverTargetForCut: 1.4,
  minRoasOverTargetForScale: 1.1,
  benchmarkReliabilityMinimum: "weak",
  minConfidenceForScale: 60,
  minConfidenceForCut: 60,
};

function baseFixture(id: string, inputSummary: string, overrides: Partial<SpikeCreativeRow>): SpikeCreativeRow {
  return {
    creativeId: id,
    creativeName: inputSummary,
    familyId: overrides.familyId ?? `family-${id.slice(0, 2)}`,
    beforePrimaryDecision: overrides.beforePrimaryDecision ?? "keep_in_test",
    beforeOperatorBucket: overrides.beforeOperatorBucket ?? "test_more",
    beforeUserLabel: overrides.beforeUserLabel ?? "Test More",
    activeStatus: true,
    campaignStatus: "ACTIVE",
    adsetStatus: "ACTIVE",
    adStatus: "ACTIVE",
    spend: 80,
    purchases: 1,
    impressions: 4000,
    roas: 1.1,
    cpa: 80,
    recentRoas: 1.0,
    recentPurchases: 1,
    recentImpressions: 1500,
    long90Roas: 1.0,
    activeBenchmarkRoas: 1.2,
    activeBenchmarkCpa: 75,
    peerMedianSpend: 120,
    trustState: "live_confident",
    baselineReliability: "medium",
    sourceTrustFlags: [],
    campaignContextBlockerFlags: [],
    spend24h: 15,
    impressions24h: 700,
    firstSeenAt: "2026-04-28T00:00:00.000Z",
    firstSpendAt: "2026-04-28T03:00:00.000Z",
    launchAgeHours: 54,
    reviewStatus: "APPROVED",
    effectiveStatus: "ACTIVE",
    ctr7d: 1.2,
    ctr14d: 1.3,
    cpm7d: 12,
    cpm14d: 11,
    frequency7d: 1.4,
    frequency14d: 1.2,
    targetCpa: 70,
    targetRoas: 1.2,
    benchmarkReliability: "medium",
    dataFreshnessHours: 12,
    attributionTruth: "ready",
    approvedButUnused: false,
    hasBackupVariant: true,
    isTopCreative: false,
    ...overrides,
  };
}

const goldenCases: GoldenCase[] = [
  {
    id: "01",
    inputSummary: "active ad + active campaign/adset + 24h spend 0 + impressions 0",
    fixture: baseFixture("gc-01", "active no spend", { spend24h: 0, impressions24h: 0 }),
    expectedPrimaryDecision: "Diagnose",
    expectedBuyerAction: "fix_delivery",
    expectedActionability: "diagnose",
    expectedProblemClass: "delivery",
    expectedPriorityBand: "high",
    expectedConfidenceBand: "medium",
    expectedTopReasonTag: "active_no_spend_24h",
    expectedMaturity: "learning",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "02",
    inputSummary: "no spend but campaign paused",
    fixture: baseFixture("gc-02", "paused campaign no spend", { campaignStatus: "PAUSED", spend24h: 0, impressions24h: 0, campaignContextBlockerFlags: ["campaign_paused"] }),
    expectedPrimaryDecision: "Diagnose",
    expectedBuyerAction: "diagnose_data",
    expectedActionability: "diagnose",
    expectedProblemClass: "campaign_context",
    expectedPriorityBand: "medium",
    expectedConfidenceBand: "medium",
    expectedTopReasonTag: "campaign_or_adset_context_requires_review",
    expectedMaturity: "learning",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "03",
    inputSummary: "adset paused",
    fixture: baseFixture("gc-03", "paused adset", { adsetStatus: "PAUSED", campaignContextBlockerFlags: ["adset_paused"] }),
    expectedPrimaryDecision: "Diagnose",
    expectedBuyerAction: "diagnose_data",
    expectedActionability: "diagnose",
    expectedProblemClass: "campaign_context",
    expectedPriorityBand: "medium",
    expectedConfidenceBand: "medium",
    expectedTopReasonTag: "campaign_or_adset_context_requires_review",
    expectedMaturity: "learning",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "04",
    inputSummary: "disapproved creative",
    fixture: baseFixture("gc-04", "disapproved", { reviewStatus: "DISAPPROVED", effectiveStatus: "DISAPPROVED", disapprovalReason: "policy" }),
    expectedPrimaryDecision: "Diagnose",
    expectedBuyerAction: "fix_policy",
    expectedActionability: "diagnose",
    expectedProblemClass: "policy",
    expectedPriorityBand: "high",
    expectedConfidenceBand: "high",
    expectedTopReasonTag: "disapproved_or_limited",
    expectedMaturity: "learning",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "05",
    inputSummary: "limited delivery with reason",
    fixture: baseFixture("gc-05", "limited delivery", { effectiveStatus: "LIMITED", limitedReason: "text policy" }),
    expectedPrimaryDecision: "Diagnose",
    expectedBuyerAction: "fix_policy",
    expectedActionability: "diagnose",
    expectedProblemClass: "policy",
    expectedPriorityBand: "high",
    expectedConfidenceBand: "high",
    expectedTopReasonTag: "disapproved_or_limited",
    expectedMaturity: "learning",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "06",
    inputSummary: "policy status unknown",
    fixture: baseFixture("gc-06", "policy unknown", { reviewStatus: null, effectiveStatus: null }),
    expectedPrimaryDecision: "Diagnose",
    expectedBuyerAction: "diagnose_data",
    expectedActionability: "diagnose",
    expectedProblemClass: "data_quality",
    expectedPriorityBand: "medium",
    expectedConfidenceBand: "low",
    expectedTopReasonTag: "missing_policy_status",
    expectedMaturity: "learning",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "07",
    inputSummary: "new launch under 48h with low spend",
    fixture: baseFixture("gc-07", "new launch low spend", { launchAgeHours: 36, spend: 30, purchases: 0, impressions: 1500, recentPurchases: 0 }),
    expectedPrimaryDecision: "Test More",
    expectedBuyerAction: "watch_launch",
    expectedActionability: "review_only",
    expectedProblemClass: "launch_monitoring",
    expectedPriorityBand: "medium",
    expectedConfidenceBand: "medium",
    expectedTopReasonTag: "new_launch_window",
    expectedMaturity: "too_early",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "08",
    inputSummary: "new launch under 72h with enough spend but no purchase",
    fixture: baseFixture("gc-08", "new launch enough spend no purchase", { launchAgeHours: 60, spend: 180, purchases: 0, recentPurchases: 0, impressions: 9000 }),
    expectedPrimaryDecision: "Test More",
    expectedBuyerAction: "watch_launch",
    expectedActionability: "review_only",
    expectedProblemClass: "launch_monitoring",
    expectedPriorityBand: "high",
    expectedConfidenceBand: "medium",
    expectedTopReasonTag: "new_launch_window",
    expectedMaturity: "learning",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "09",
    inputSummary: "new launch with severe overspend and no purchases",
    fixture: baseFixture("gc-09", "new launch severe overspend", { launchAgeHours: 55, spend: 320, purchases: 0, cpa: 0, recentPurchases: 0, impressions: 15000 }),
    expectedPrimaryDecision: "Test More",
    expectedBuyerAction: "watch_launch",
    expectedActionability: "review_only",
    expectedProblemClass: "launch_monitoring",
    expectedPriorityBand: "high",
    expectedConfidenceBand: "medium",
    expectedTopReasonTag: "new_launch_severe_spend_no_purchase",
    expectedMaturity: "learning",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "10",
    inputSummary: "mature high-spend loser",
    fixture: baseFixture("gc-10", "mature high spend loser", { launchAgeHours: 240, spend: 700, purchases: 1, roas: 0.25, recentRoas: 0.2, long90Roas: 0.35, impressions: 50000 }),
    expectedPrimaryDecision: "Cut",
    expectedBuyerAction: "cut",
    expectedActionability: "review_only",
    expectedProblemClass: "performance",
    expectedPriorityBand: "high",
    expectedConfidenceBand: "high",
    expectedTopReasonTag: "severe_sustained_loser",
    expectedMaturity: "mature",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "11",
    inputSummary: "mature high-confidence winner",
    fixture: baseFixture("gc-11", "mature winner", { beforePrimaryDecision: "promote_to_scaling", beforeOperatorBucket: "scale", beforeUserLabel: "Scale", launchAgeHours: 220, spend: 700, purchases: 12, roas: 2.2, recentRoas: 2.1, long90Roas: 2.0, impressions: 60000 }),
    expectedPrimaryDecision: "Scale",
    expectedBuyerAction: "scale",
    expectedActionability: "review_only",
    expectedProblemClass: "performance",
    expectedPriorityBand: "high",
    expectedConfidenceBand: "high",
    expectedTopReasonTag: "strong_relative_winner",
    expectedMaturity: "mature",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
  {
    id: "12",
    inputSummary: "winner entering fatigue",
    fixture: baseFixture("gc-12", "winner fatigue", { beforePrimaryDecision: "refresh_replace", beforeOperatorBucket: "refresh", beforeUserLabel: "Refresh", launchAgeHours: 300, spend: 900, purchases: 9, roas: 1.3, recentRoas: 0.85, long90Roas: 2.0, ctr7d: 0.8, ctr14d: 1.3, cpm7d: 18, cpm14d: 13, frequency7d: 2.8, frequency14d: 1.6 }),
    expectedPrimaryDecision: "Refresh",
    expectedBuyerAction: "refresh",
    expectedActionability: "review_only",
    expectedProblemClass: "fatigue",
    expectedPriorityBand: "high",
    expectedConfidenceBand: "high",
    expectedTopReasonTag: "fatigue_composite",
    expectedMaturity: "mature",
    expectedSafeFallbackIfDataMissing: "diagnose_data",
  },
];

const extraCases: GoldenCase[] = [
  ["13", "CTR down but frequency flat and CPM flat", { ctr7d: 0.8, ctr14d: 1.3, cpm7d: 12, cpm14d: 12, frequency7d: 1.3, frequency14d: 1.3 }, "Test More", "test_more", "insufficient_signal", "medium", "medium", "partial_fatigue_signal", "actionable"],
  ["14", "frequency up but CTR stable", { frequency7d: 2.2, frequency14d: 1.4, ctr7d: 1.2, ctr14d: 1.2 }, "Test More", "test_more", "insufficient_signal", "medium", "medium", "partial_fatigue_signal", "actionable"],
  ["15", "CPM up but CPA/ROAS stable", { cpm7d: 18, cpm14d: 12, roas: 1.4, recentRoas: 1.4 }, "Test More", "test_more", "insufficient_signal", "medium", "medium", "partial_fatigue_signal", "actionable"],
  ["16", "benchmark missing", { activeBenchmarkRoas: null, activeBenchmarkCpa: null, baselineReliability: "unavailable", benchmarkReliability: "none" }, "Diagnose", "diagnose_data", "data_quality", "medium", "low", "benchmark_context_not_strong", "learning"],
  ["17", "benchmark weak", { baselineReliability: "weak", benchmarkReliability: "weak" }, "Diagnose", "diagnose_data", "data_quality", "medium", "low", "benchmark_context_not_strong", "learning"],
  ["18", "stale data", { dataFreshnessHours: 72 }, "Diagnose", "diagnose_data", "data_quality", "high", "low", "stale_data", "learning"],
  ["19", "attribution/truth missing", { attributionTruth: "missing", trustState: "degraded_missing_truth", sourceTrustFlags: ["missing_truth"] }, "Diagnose", "diagnose_data", "data_quality", "high", "low", "truth_missing", "learning"],
  ["20", "tracking drop suspected", { attributionTruth: "degraded", sourceTrustFlags: ["tracking_drop_suspected"] }, "Diagnose", "diagnose_data", "data_quality", "high", "low", "truth_degraded", "learning"],
  ["21", "high priority but low confidence delivery issue", { spend24h: 0, impressions24h: null, campaignStatus: null, adsetStatus: null }, "Diagnose", "diagnose_data", "data_quality", "high", "low", "missing_delivery_proof", "learning"],
  ["22", "low maturity but high priority policy issue", { spend: 10, purchases: 0, reviewStatus: "DISAPPROVED", effectiveStatus: "DISAPPROVED", disapprovalReason: "policy" }, "Diagnose", "fix_policy", "policy", "high", "high", "disapproved_or_limited", "too_early"],
  ["23", "mature data but low confidence due to attribution degradation", { launchAgeHours: 300, spend: 800, purchases: 8, attributionTruth: "degraded", trustState: "degraded_missing_truth", sourceTrustFlags: ["degraded_truth"] }, "Diagnose", "diagnose_data", "data_quality", "high", "low", "truth_degraded", "mature"],
  ["24", "active creative with spend but zero impressions anomaly", { spend24h: 20, impressions24h: 0 }, "Diagnose", "diagnose_data", "data_quality", "high", "low", "spend_without_impressions", "learning"],
  ["25", "high CTR but poor CVR / landing issue", { ctr7d: 2.5, ctr14d: 2.2, spend: 400, purchases: 0, roas: 0, impressions: 20000 }, "Diagnose", "diagnose_data", "performance", "medium", "medium", "landing_or_cvr_issue", "actionable"],
  ["26", "strong ROAS but tiny spend, not mature", { spend: 25, purchases: 1, roas: 4, recentRoas: 4, impressions: 1000 }, "Test More", "test_more", "insufficient_signal", "medium", "medium", "tiny_spend_winner", "too_early"],
  ["27", "strong CPA but low purchase count, not scalable yet", { spend: 120, purchases: 2, cpa: 45, roas: 2.1, recentRoas: 2.0 }, "Test More", "test_more", "insufficient_signal", "medium", "medium", "low_purchase_count", "learning"],
  ["28", "top 3 fatigue cluster", { isTopCreative: true, ctr7d: 0.7, ctr14d: 1.2, cpm7d: 20, cpm14d: 12, frequency7d: 2.8, frequency14d: 1.4 }, "Refresh", "refresh", "fatigue", "high", "high", "fatigue_composite", "mature"],
  ["29", "no new winner in 7 days", {}, "Protect", "protect", "performance", "medium", "medium", "winner_gap_aggregate_only", "mature"],
  ["30", "approved but unused creative exists", { activeStatus: false, effectiveStatus: "ACTIVE", approvedButUnused: true, spend: 0, purchases: 0, impressions: 0 }, "Diagnose", "diagnose_data", "campaign_context", "medium", "medium", "unused_approved_aggregate_only", "too_early"],
  ["31", "family winner aging with no backup variants", { hasBackupVariant: false, launchAgeHours: 500, spend: 1000, purchases: 10, roas: 1.8 }, "Protect", "protect", "performance", "medium", "medium", "backup_variant_aggregate_only", "mature"],
  ["32", "old challenger says scale_hard but V2 says Test More", { beforePrimaryDecision: "scale_hard", beforeOperatorBucket: "scale", beforeUserLabel: "Scale Hard", spend: 80, purchases: 2, roas: 3.5, impressions: 2000 }, "Test More", "test_more", "insufficient_signal", "medium", "medium", "low_evidence", "learning"],
  ["33", "operator surface says act_now but V2 says Diagnose", { beforePrimaryDecision: "promote_to_scaling", beforeOperatorBucket: "act_now", beforeUserLabel: "Scale", sourceTrustFlags: ["missing"], trustState: "degraded_missing_truth" }, "Diagnose", "diagnose_data", "data_quality", "high", "low", "truth_degraded", "learning"],
  ["34", "old V1 stable_winner maps to V2 Protect", { beforePrimaryDecision: "hold_no_touch", beforeOperatorBucket: "protect", beforeUserLabel: "Protect", launchAgeHours: 300, spend: 700, purchases: 8, roas: 1.5, recentRoas: 1.4, long90Roas: 1.5 }, "Protect", "protect", "performance", "medium", "high", "stable_winner", "mature"],
  ["35", "old V1 fatigued_winner maps to V2 Refresh", { beforePrimaryDecision: "refresh_replace", beforeOperatorBucket: "refresh", beforeUserLabel: "Refresh", ctr7d: 0.7, ctr14d: 1.2, cpm7d: 20, cpm14d: 12, frequency7d: 2.8, frequency14d: 1.4 }, "Refresh", "refresh", "fatigue", "high", "high", "fatigue_composite", "mature"],
].map(([id, summary, overrides, primary, action, problemClass, priority, confidence, tag, maturity]) => ({
  id: String(id),
  inputSummary: String(summary),
  fixture: baseFixture(`gc-${id}`, String(summary), overrides as Partial<SpikeCreativeRow>),
  expectedPrimaryDecision: primary as CreativeDecisionOsV2PrimaryDecision,
  expectedBuyerAction: action as BuyerAction,
  expectedActionability: primary === "Diagnose" ? "diagnose" : "review_only",
  expectedProblemClass: problemClass as ProblemClassV21,
  expectedPriorityBand: priority as PriorityBand,
  expectedConfidenceBand: confidence as ConfidenceBand,
  expectedTopReasonTag: String(tag),
  expectedMaturity: maturity as Maturity,
  expectedSafeFallbackIfDataMissing: problemClass === "fatigue" ? "diagnose_data" : "diagnose_data",
}));

const allGoldenCases = [...goldenCases, ...extraCases];
const sampleRows = allGoldenCases.map((entry) => entry.fixture);

function reliabilityRank(value: string | null | undefined) {
  if (value === "strong") return 3;
  if (value === "medium") return 2;
  if (value === "weak") return 1;
  return 0;
}

function isMissing(value: unknown) {
  return value === null || value === undefined || value === "";
}

function confidenceBand(value: number): ConfidenceBand {
  if (value >= 78) return "high";
  if (value >= 62) return "medium";
  return "low";
}

function maturity(row: SpikeCreativeRow, config: SpikeConfig): Maturity {
  if ((row.launchAgeHours ?? 9999) < 48) return "too_early";
  const targetCpa = row.targetCpa ?? row.activeBenchmarkCpa ?? 75;
  const spendMature = (row.spend ?? 0) >= targetCpa * config.minSpendForMaturityMultiplier;
  const purchaseMature = (row.purchases ?? 0) >= config.minPurchasesForScale;
  const impressionMature = (row.impressions ?? 0) >= config.minImpressionsForCtrReliability;
  if (spendMature && (purchaseMature || impressionMature)) return "mature";
  if (spendMature || (row.purchases ?? 0) >= 2) return "actionable";
  return "learning";
}

function missingCoreData(row: SpikeCreativeRow) {
  const missing: string[] = [];
  if (isMissing(row.dataFreshnessHours)) missing.push("dataFreshnessHours");
  if (isMissing(row.attributionTruth)) missing.push("attributionTruth");
  if (isMissing(row.benchmarkReliability) && isMissing(row.baselineReliability)) missing.push("benchmarkReliability");
  return missing;
}

function hasPolicyProof(row: SpikeCreativeRow) {
  const status = `${row.reviewStatus ?? ""} ${row.effectiveStatus ?? ""}`.toUpperCase();
  return status.includes("DISAPPROVED") || status.includes("REJECTED") || status.includes("LIMITED") || Boolean(row.disapprovalReason || row.limitedReason);
}

function hasPolicyFields(row: SpikeCreativeRow) {
  return !isMissing(row.reviewStatus) || !isMissing(row.effectiveStatus) || !isMissing(row.disapprovalReason) || !isMissing(row.limitedReason);
}

function hasDeliveryProof(row: SpikeCreativeRow) {
  return row.activeStatus === true &&
    String(row.campaignStatus).toUpperCase() === "ACTIVE" &&
    String(row.adsetStatus).toUpperCase() === "ACTIVE" &&
    String(row.adStatus).toUpperCase() === "ACTIVE" &&
    row.spend24h === 0 &&
    row.impressions24h === 0;
}

function hasDeliveryFields(row: SpikeCreativeRow) {
  return !isMissing(row.activeStatus) &&
    !isMissing(row.campaignStatus) &&
    !isMissing(row.adsetStatus) &&
    !isMissing(row.adStatus) &&
    !isMissing(row.spend24h) &&
    !isMissing(row.impressions24h);
}

function hasLaunchFields(row: SpikeCreativeRow) {
  return !isMissing(row.launchAgeHours) || !isMissing(row.firstSeenAt) || !isMissing(row.firstSpendAt);
}

function fatigueComposite(row: SpikeCreativeRow, config: SpikeConfig) {
  if ([row.ctr7d, row.ctr14d, row.cpm7d, row.cpm14d, row.frequency7d, row.frequency14d].some(isMissing)) {
    return false;
  }
  const ctrDrop = ((row.ctr14d! - row.ctr7d!) / Math.max(row.ctr14d!, 0.01)) * 100;
  const cpmIncrease = ((row.cpm7d! - row.cpm14d!) / Math.max(row.cpm14d!, 0.01)) * 100;
  const frequencyIncrease = ((row.frequency7d! - row.frequency14d!) / Math.max(row.frequency14d!, 0.01)) * 100;
  return ctrDrop >= config.fatigueCtrDropPct &&
    cpmIncrease >= config.fatigueCpmIncreasePct &&
    frequencyIncrease >= config.fatigueFrequencyIncreasePct;
}

function simulateV21Primary(row: SpikeCreativeRow, currentV2: CreativeDecisionOsV2Output, config: SpikeConfig): CreativeDecisionOsV2Output {
  const stale = (row.dataFreshnessHours ?? 0) > config.staleDataHours;
  const coreMissing = missingCoreData(row);
  if (stale || row.attributionTruth === "missing" || row.attributionTruth === "degraded" || coreMissing.length > 0) {
    return { ...currentV2, primaryDecision: "Diagnose", actionability: "diagnose", problemClass: "data-quality", reasonTags: [stale ? "stale_data" : row.attributionTruth === "missing" ? "truth_missing" : row.attributionTruth === "degraded" ? "truth_degraded" : "missing_core_data"], confidence: Math.min(currentV2.confidence, 58), riskLevel: "high" };
  }
  if (hasPolicyProof(row)) {
    return { ...currentV2, primaryDecision: "Diagnose", actionability: "diagnose", problemClass: "data-quality", reasonTags: ["disapproved_or_limited"], confidence: 86, riskLevel: "high" };
  }
  if (hasDeliveryProof(row)) {
    return { ...currentV2, primaryDecision: "Diagnose", actionability: "diagnose", problemClass: "campaign-context", reasonTags: ["active_no_spend_24h"], confidence: 74, riskLevel: "high" };
  }
  if (String(row.campaignStatus).toUpperCase() !== "ACTIVE" || String(row.adsetStatus).toUpperCase() !== "ACTIVE") {
    return { ...currentV2, primaryDecision: "Diagnose", actionability: "diagnose", problemClass: "campaign-context", reasonTags: ["campaign_or_adset_context_requires_review"], confidence: 72, riskLevel: "medium" };
  }
  if ((row.launchAgeHours ?? 9999) <= config.launchWindowHours) {
    return { ...currentV2, primaryDecision: "Test More", actionability: "review_only", problemClass: "insufficient-signal", reasonTags: [(row.spend ?? 0) > (row.targetCpa ?? 70) * 4 && (row.purchases ?? 0) === 0 ? "new_launch_severe_spend_no_purchase" : "new_launch_window"], confidence: 68, riskLevel: "medium" };
  }
  if (fatigueComposite(row, config)) {
    return { ...currentV2, primaryDecision: "Refresh", actionability: "review_only", problemClass: "creative", reasonTags: ["fatigue_composite"], confidence: 82, riskLevel: "high" };
  }
  const rowMaturity = maturity(row, config);
  if (rowMaturity !== "mature" && ((row.roas ?? 0) > (row.targetRoas ?? 1.2) || (row.cpa ?? 9999) < (row.targetCpa ?? 70))) {
    return { ...currentV2, primaryDecision: "Test More", actionability: "review_only", problemClass: "insufficient-signal", reasonTags: [(row.spend ?? 0) < 50 ? "tiny_spend_winner" : "low_purchase_count"], confidence: 66, riskLevel: "medium" };
  }
  if (rowMaturity === "mature" && (row.roas ?? 0) >= (row.targetRoas ?? 1.2) * config.minRoasOverTargetForScale && (row.purchases ?? 0) >= config.minPurchasesForScale) {
    return { ...currentV2, primaryDecision: "Scale", actionability: "review_only", problemClass: "creative", reasonTags: ["strong_relative_winner"], confidence: 84, riskLevel: "medium" };
  }
  if (rowMaturity === "mature" && ((row.cpa ?? 0) >= (row.targetCpa ?? 70) * config.maxCpaOverTargetForCut || (row.roas ?? 999) < (row.targetRoas ?? 1.2) * 0.5)) {
    return { ...currentV2, primaryDecision: "Cut", actionability: "review_only", problemClass: "creative", reasonTags: ["severe_sustained_loser"], confidence: 80, riskLevel: "high" };
  }
  if (row.beforePrimaryDecision === "hold_no_touch") {
    return { ...currentV2, primaryDecision: "Protect", actionability: "review_only", problemClass: "creative", reasonTags: ["stable_winner"], confidence: 80, riskLevel: "low" };
  }
  return currentV2;
}

function adapt(row: SpikeCreativeRow, v2: CreativeDecisionOsV2Output, config: SpikeConfig): AdapterResult {
  const missing = missingCoreData(row);
  const rowMaturity = maturity(row, config);
  let buyerAction: BuyerAction;
  let problemClass: ProblemClassV21 =
    v2.problemClass === "campaign-context" ? "campaign_context" :
    v2.problemClass === "data-quality" ? "data_quality" :
    v2.problemClass === "insufficient-signal" ? "insufficient_signal" :
    "performance";
  let topReasonTag = v2.reasonTags[0] ?? "unknown";
  let priorityBand: PriorityBand = v2.riskLevel === "critical" ? "critical" : v2.riskLevel === "high" ? "high" : "medium";

  if ((row.dataFreshnessHours ?? 0) > config.staleDataHours) {
    buyerAction = "diagnose_data";
    problemClass = "data_quality";
    topReasonTag = "stale_data";
    priorityBand = "high";
    missing.push("fresh_data");
  } else if (row.attributionTruth === "missing" || row.attributionTruth === "degraded") {
    buyerAction = "diagnose_data";
    problemClass = "data_quality";
    topReasonTag = row.attributionTruth === "missing" ? "truth_missing" : "truth_degraded";
    priorityBand = "high";
  } else if (hasPolicyProof(row)) {
    buyerAction = "fix_policy";
    problemClass = "policy";
    topReasonTag = "disapproved_or_limited";
    priorityBand = "high";
  } else if (!hasPolicyFields(row)) {
    buyerAction = "diagnose_data";
    problemClass = "data_quality";
    topReasonTag = "missing_policy_status";
    priorityBand = "medium";
    missing.push("reviewStatus", "effectiveStatus");
  } else if (hasDeliveryProof(row)) {
    buyerAction = "fix_delivery";
    problemClass = "delivery";
    topReasonTag = "active_no_spend_24h";
    priorityBand = "high";
  } else if (!hasDeliveryFields(row)) {
    buyerAction = "diagnose_data";
    problemClass = "data_quality";
    topReasonTag = "missing_delivery_proof";
    priorityBand = "high";
    missing.push("adStatus/campaignStatus/adsetStatus/spend24h/impressions24h");
  } else if (!hasLaunchFields(row)) {
    buyerAction = "diagnose_data";
    problemClass = "data_quality";
    topReasonTag = "missing_launch_date";
    missing.push("firstSeenAt/firstSpendAt/launchAgeHours");
  } else if ((row.launchAgeHours ?? 9999) <= config.launchWindowHours && v2.primaryDecision !== "Diagnose") {
    buyerAction = "watch_launch";
    problemClass = "launch_monitoring";
    topReasonTag = v2.reasonTags[0] ?? "new_launch_window";
  } else if (fatigueComposite(row, config)) {
    buyerAction = "refresh";
    problemClass = "fatigue";
    topReasonTag = "fatigue_composite";
  } else if (v2.primaryDecision === "Scale") {
    buyerAction = "scale";
    problemClass = "performance";
  } else if (v2.primaryDecision === "Cut") {
    buyerAction = "cut";
    problemClass = "performance";
  } else if (v2.primaryDecision === "Refresh") {
    buyerAction = "refresh";
    problemClass = "fatigue";
  } else if (v2.primaryDecision === "Protect") {
    buyerAction = "protect";
    problemClass = "performance";
  } else if (v2.primaryDecision === "Test More") {
    buyerAction = "test_more";
    problemClass = rowMaturity === "too_early" || rowMaturity === "learning" ? "insufficient_signal" : problemClass;
  } else {
    buyerAction = "diagnose_data";
    problemClass = problemClass === "campaign_context" ? "campaign_context" : "data_quality";
  }

  const band = confidenceBand(v2.confidence);
  const label = {
    scale: "Scale",
    cut: "Cut",
    refresh: "Refresh",
    protect: "Protect",
    test_more: "Test More",
    watch_launch: "Watch Launch",
    fix_delivery: "Fix Delivery",
    fix_policy: "Fix Policy",
    diagnose_data: "Diagnose Data",
  }[buyerAction];
  return {
    buyerAction,
    buyerLabel: label,
    problemClass,
    actionability: v2.actionability,
    priorityBand,
    confidenceBand: missing.length > 0 || row.attributionTruth !== "ready" ? "low" : band,
    maturity: rowMaturity,
    topReasonTag,
    nextStep: `Review ${label.toLowerCase()} evidence before taking action.`,
    uiBucket: buyerAction,
    missingData: Array.from(new Set(missing)),
  };
}

function toV2Input(row: SpikeCreativeRow) {
  return {
    rowId: row.creativeId,
    activeStatus: row.activeStatus,
    campaignStatus: row.campaignStatus,
    adsetStatus: row.adsetStatus,
    spend: row.spend,
    purchases: row.purchases,
    impressions: row.impressions,
    roas: row.roas,
    cpa: row.cpa,
    recentRoas: row.recentRoas,
    recentPurchases: row.recentPurchases,
    recentImpressions: row.recentImpressions,
    long90Roas: row.long90Roas,
    activeBenchmarkRoas: row.activeBenchmarkRoas,
    activeBenchmarkCpa: row.activeBenchmarkCpa,
    peerMedianSpend: row.peerMedianSpend,
    trustState: row.trustState,
    baselineReliability: row.baselineReliability,
    sourceTrustFlags: row.sourceTrustFlags,
    campaignContextBlockerFlags: row.campaignContextBlockerFlags,
  };
}

function shadowRows(config: SpikeConfig) {
  return sampleRows.map((row) => {
    const currentV2 = resolveCreativeDecisionOsV2(toV2Input(row));
    const v21 = simulateV21Primary(row, currentV2, config);
    const after = adapt(row, v21, config);
    const beforeAggressive = ["scale", "act_now", "protect"].includes(row.beforeOperatorBucket);
    const afterAggressive = ["scale", "cut"].includes(after.buyerAction);
    const conflict =
      (["scale", "protect", "act_now"].includes(row.beforeOperatorBucket) && after.buyerAction === "cut") ||
      (["cut", "kill"].includes(row.beforeOperatorBucket) && after.buyerAction === "scale");
    const changeType: ChangeType = conflict
      ? "conflict"
      : after.missingData.length > 0
        ? "fallback_due_to_missing_data"
        : row.beforeOperatorBucket === after.buyerAction || row.beforeUserLabel.toLowerCase().includes(after.buyerAction.replace("_", " "))
          ? "same_meaning"
          : !beforeAggressive && afterAggressive
            ? "more_aggressive"
            : beforeAggressive && !afterAggressive
              ? "less_aggressive"
              : ["fix_delivery", "fix_policy", "watch_launch", "diagnose_data"].includes(after.buyerAction)
                ? "safer_more_specific"
                : "unknown";
    return {
      creativeId: row.creativeId,
      creativeName: row.creativeName,
      familyId: row.familyId,
      beforePrimaryDecision: row.beforePrimaryDecision,
      beforeOperatorBucket: row.beforeOperatorBucket,
      beforeUserLabel: row.beforeUserLabel,
      v2PrimaryDecision: v21.primaryDecision,
      afterBuyerAction: after.buyerAction,
      afterProblemClass: after.problemClass,
      afterActionability: after.actionability,
      afterPriorityBand: after.priorityBand,
      afterConfidenceBand: after.confidenceBand,
      topReasonTag: after.topReasonTag,
      missingData: after.missingData,
      decisionChanged: row.beforeOperatorBucket !== after.buyerAction,
      changeType,
      riskLevel: conflict || (afterAggressive && after.confidenceBand !== "high") ? "high" : after.missingData.length > 0 ? "medium" : "low",
      notes: "Fixture-backed V2.1 simulation; not production behavior.",
    };
  });
}

function dataCoverage(rows: SpikeCreativeRow[]) {
  const fields: Array<keyof SpikeCreativeRow> = [
    "spend24h", "impressions24h", "firstSeenAt", "firstSpendAt", "launchAgeHours", "reviewStatus", "effectiveStatus",
    "disapprovalReason", "limitedReason", "ctr7d", "ctr14d", "cpm7d", "cpm14d", "frequency7d", "frequency14d",
    "targetCpa", "targetRoas", "benchmarkReliability", "campaignStatus", "adsetStatus", "adStatus", "familyId",
    "approvedButUnused", "hasBackupVariant", "attributionTruth", "dataFreshnessHours",
  ];
  return fields.map((field) => {
    const covered = rows.filter((row) => !isMissing(row[field])).length;
    return {
      field,
      coveragePercent: Math.round((covered / rows.length) * 10000) / 100,
      sampleCount: rows.length,
      source: "fixture",
      missingReason: covered === rows.length ? null : "Field is not guaranteed by current V1/V2 row contracts; fixture simulates target V2.1 data.",
      blocksWhichBuyerActions: blockersForField(String(field)),
    };
  });
}

function blockersForField(field: string) {
  const map: Record<string, string[]> = {
    spend24h: ["fix_delivery"],
    impressions24h: ["fix_delivery"],
    firstSeenAt: ["watch_launch"],
    firstSpendAt: ["watch_launch"],
    launchAgeHours: ["watch_launch"],
    reviewStatus: ["fix_policy"],
    effectiveStatus: ["fix_policy", "unused_approved_creatives"],
    disapprovalReason: ["fix_policy"],
    limitedReason: ["fix_policy"],
    ctr7d: ["refresh", "fatigue_cluster"],
    ctr14d: ["refresh", "fatigue_cluster"],
    cpm7d: ["refresh", "fatigue_cluster"],
    cpm14d: ["refresh", "fatigue_cluster"],
    frequency7d: ["refresh", "fatigue_cluster"],
    frequency14d: ["refresh", "fatigue_cluster"],
    familyId: ["brief_variation", "creative_supply_warning"],
    approvedButUnused: ["unused_approved_creatives"],
    hasBackupVariant: ["brief_variation", "creative_supply_warning"],
    attributionTruth: ["scale", "cut", "refresh", "protect"],
    dataFreshnessHours: ["all_hard_actions"],
  };
  return map[field] ?? [];
}

function eligibility(rows: SpikeCreativeRow[], config: SpikeConfig) {
  const adapted = shadowRows(config);
  const count = (predicate: (row: ReturnType<typeof shadowRows>[number]) => boolean) => adapted.filter(predicate).length;
  return {
    totalCreatives: rows.length,
    scaleOrCutEligiblePercent: Math.round((count((row) => row.afterBuyerAction === "scale" || row.afterBuyerAction === "cut") / rows.length) * 10000) / 100,
    fixDeliveryEligiblePercent: Math.round((count((row) => row.afterBuyerAction === "fix_delivery") / rows.length) * 10000) / 100,
    fixPolicyEligiblePercent: Math.round((count((row) => row.afterBuyerAction === "fix_policy") / rows.length) * 10000) / 100,
    watchLaunchEligiblePercent: Math.round((count((row) => row.afterBuyerAction === "watch_launch") / rows.length) * 10000) / 100,
    fatigueRefreshEligiblePercent: Math.round((count((row) => row.afterBuyerAction === "refresh") / rows.length) * 10000) / 100,
    diagnoseDataPercent: Math.round((count((row) => row.afterBuyerAction === "diagnose_data") / rows.length) * 10000) / 100,
  };
}

function aggregateTest(rows: SpikeCreativeRow[], config: SpikeConfig) {
  const byFamily = new Map<string, SpikeCreativeRow[]>();
  rows.forEach((row) => {
    byFamily.set(row.familyId ?? "unknown", [...(byFamily.get(row.familyId ?? "unknown") ?? []), row]);
  });
  const fatigueRows = rows.filter((row) => fatigueComposite(row, config));
  return {
    source: "fixture",
    aggregates: [
      {
        action: "fatigue_cluster",
        canEmitNow: fatigueRows.filter((row) => row.isTopCreative).length >= config.fatigueClusterTopN ? "conditional" : "no",
        count: fatigueRows.filter((row) => row.isTopCreative).length >= config.fatigueClusterTopN ? 1 : 0,
        blockedBy: fatigueRows.length < config.fatigueClusterTopN ? ["topN fatigue proof insufficient in fixture/current contracts"] : [],
        oneLine: "Top creative cluster shows composite fatigue pressure.",
      },
      {
        action: "winner_gap",
        canEmitNow: "no",
        count: 0,
        blockedBy: ["no current explicit last winner date field"],
        oneLine: "No new winner in configured window.",
      },
      {
        action: "unused_approved_creatives",
        canEmitNow: rows.some((row) => row.approvedButUnused) ? "conditional" : "no",
        count: rows.filter((row) => row.approvedButUnused).length,
        blockedBy: ["current MetaCreativeRow lacks reliable effectiveStatus + zero-delivery unused-approved distinction"],
        oneLine: "Approved creatives exist but have no delivery.",
      },
      {
        action: "brief_variation",
        canEmitNow: "conditional",
        count: Array.from(byFamily.values()).filter((family) => family.some((row) => fatigueComposite(row, config)) && family.every((row) => row.hasBackupVariant === false)).length,
        blockedBy: ["backlog/production status unavailable"],
        oneLine: "Winner family needs backup variation.",
      },
      {
        action: "creative_supply_warning",
        canEmitNow: "no",
        count: 0,
        blockedBy: ["backlog/brief/production status unavailable"],
        oneLine: "Creative supply is below required buffer.",
      },
    ],
  };
}

function configSensitivity() {
  const defaultRows = shadowRows(defaultConfig);
  const conservativeRows = shadowRows(conservativeConfig);
  const aggressiveRows = shadowRows(aggressiveConfig);
  const compare = (label: string, rows: ReturnType<typeof shadowRows>) => {
    const changed = rows.filter((row, index) => row.afterBuyerAction !== defaultRows[index]?.afterBuyerAction);
    return {
      config: label,
      decisionsChanged: changed.length,
      changedActions: changed.map((row) => ({ creativeId: row.creativeId, action: row.afterBuyerAction, defaultAction: defaultRows.find((base) => base.creativeId === row.creativeId)?.afterBuyerAction })),
      unsafeScaleCut: rows.filter((row) => ["scale", "cut"].includes(row.afterBuyerAction) && row.afterConfidenceBand !== "high").length,
    };
  };
  return [compare("conservative", conservativeRows), compare("aggressive", aggressiveRows)];
}

function performanceSmoke() {
  const sizes = [100, 1000, 5000];
  return sizes.map((size) => {
    const rows = Array.from({ length: size }, (_, index) => ({
      ...sampleRows[index % sampleRows.length]!,
      creativeId: `perf-${index}`,
      creativeName: `Generated fixture ${index}`,
    }));
    const before = performance.now();
    const results = rows.map((row) => {
      const v2 = resolveCreativeDecisionOsV2(toV2Input(row));
      const v21 = simulateV21Primary(row, v2, defaultConfig);
      return adapt(row, v21, defaultConfig);
    });
    const after = performance.now();
    return {
      creativeCount: size,
      runtimeMs: Math.round((after - before) * 100) / 100,
      approxPayloadBytes: Buffer.byteLength(JSON.stringify(results), "utf8"),
      note: "Generated fixture rows; excludes DB/API and React render cost.",
    };
  });
}

function summarizeShadow(rows: ReturnType<typeof shadowRows>) {
  const count = (predicate: (row: ReturnType<typeof shadowRows>[number]) => boolean) => rows.filter(predicate).length;
  return {
    totalCreativesCompared: rows.length,
    unchangedDecisions: count((row) => !row.decisionChanged),
    saferMoreSpecific: count((row) => row.changeType === "safer_more_specific"),
    aggressiveChanges: count((row) => row.changeType === "more_aggressive"),
    fallbackDueToMissingData: count((row) => row.changeType === "fallback_due_to_missing_data"),
    conflictCount: count((row) => row.changeType === "conflict"),
    diagnoseDataRate: Math.round((count((row) => row.afterBuyerAction === "diagnose_data") / rows.length) * 10000) / 100,
    highConfidenceRate: Math.round((count((row) => row.afterConfidenceBand === "high") / rows.length) * 10000) / 100,
    top10Disagreements: rows.filter((row) => row.decisionChanged).slice(0, 10),
  };
}

function writeJson(name: string, value: unknown) {
  writeFileSync(`${outputDir}/${name}.json`, `${JSON.stringify(value, null, 2)}\n`);
}

mkdirSync(outputDir, { recursive: true });

const liveStatus = {
  attempted: false,
  reason: process.env.DATABASE_URL
    ? "DATABASE_URL is present, but this spike intentionally uses fixtures only until a read-only snapshot loader is reviewed."
    : "DATABASE_URL is not set; no live DB/snapshot read was attempted.",
  missingEnv: process.env.DATABASE_URL ? [] : ["DATABASE_URL"],
};

const shadow = shadowRows(defaultConfig);
const reports = {
  liveStatus,
  dataCoverage: dataCoverage(sampleRows),
  eligibility: eligibility(sampleRows, defaultConfig),
  shadow: {
    summary: summarizeShadow(shadow),
    rows: shadow,
  },
  goldenCases: allGoldenCases.map(({ fixture, ...entry }) => ({
    ...entry,
    fixtureId: fixture.creativeId,
  })),
  configSensitivity: configSensitivity(),
  aggregate: aggregateTest(sampleRows, defaultConfig),
  performance: performanceSmoke(),
};

writeJson("live-status", reports.liveStatus);
writeJson("data-readiness-coverage", { fields: reports.dataCoverage, eligibility: reports.eligibility });
writeJson("before-after-shadow", reports.shadow);
writeJson("golden-cases", reports.goldenCases);
writeJson("config-sensitivity", reports.configSensitivity);
writeJson("aggregate-test", reports.aggregate);
writeJson("performance-smoke", reports.performance);

console.log(JSON.stringify({
  spike: "creative-decision-center-v21",
  outputDir,
  liveStatus,
  shadowSummary: reports.shadow.summary,
  eligibility: reports.eligibility,
  performance: reports.performance,
}, null, 2));
