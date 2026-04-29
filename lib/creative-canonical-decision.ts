import {
  calculateBayesianCreativeDecisionConfidence,
  type CreativeDecisionConfidence,
} from "@/lib/creative-decision-confidence";
import {
  calculateCreativeFunnelSubScores,
  type CreativeScoreFormulaInput,
} from "@/lib/creative-score-formulas";

export const CREATIVE_CANONICAL_DECISION_RESOLVER_VERSION = "canonical-v0.5";
export const CREATIVE_CANONICAL_DECISION_CALIBRATION_VERSION = "global-default-v0.5";

export const CREATIVE_CANONICAL_ACTIONS = [
  "scale",
  "test_more",
  "protect",
  "refresh",
  "cut",
  "diagnose",
] as const;

export type CreativeCanonicalAction = (typeof CREATIVE_CANONICAL_ACTIONS)[number];
export type CreativeCanonicalActionReadiness = "ready" | "needs_review" | "blocked";
export type CreativeCanonicalResolverVersion = "canonical-v0.5" | "canonical-v1";
export type CreativeCanonicalPersona = "balanced" | "growth" | "efficiency" | "funnel";

export interface CreativeCanonicalSubScores {
  hook?: number;
  watch?: number;
  click?: number;
  cta?: number;
  offer?: number;
  convert?: number;
}

export interface CreativeCanonicalDecision {
  action: CreativeCanonicalAction;
  actionReadiness: CreativeCanonicalActionReadiness;
  confidence: CreativeDecisionConfidence;
  primaryReason: string;
  reasonChips: string[];
  secondarySuggestion?: CreativeCanonicalAction;
  debug: {
    score: number;
    subScores: CreativeCanonicalSubScores;
    lifecycle?: string;
    fatigueSeverity?: number;
    evidenceMaturity?: number;
    peerRatio?: number | null;
    economicsRatio?: number | null;
    readinessReasons: string[];
    diagnosticFlags: string[];
    calibrationVersion: string;
    resolverVersion: CreativeCanonicalResolverVersion;
  };
}

export interface CreativeCanonicalThresholds {
  minSpendForDecision: number;
  minPurchasesForScale: number;
  minPurchasesForCut: number;
  scaleScore: number;
  protectScore: number;
  refreshFatigue: number;
  hardCutEconomicsRatio: number;
  softCutEconomicsRatio: number;
  strongPeerRatio: number;
  weakPeerRatio: number;
  persona: CreativeCanonicalPersona;
  version: string;
  staleAfterDays: number;
  lastCalibratedAt?: string | null;
  feedbackCount?: number;
  calibrationStaleReasons?: string[];
}

export interface CreativeCanonicalDecisionInput {
  rowId?: string | null;
  creativeId?: string | null;
  creativeName?: string | null;
  creativeFormat?: "image" | "video" | "catalog" | "unknown" | string | null;
  creativeAgeDays?: number | null;
  spend?: number | null;
  purchases?: number | null;
  purchaseValue?: number | null;
  impressions?: number | null;
  linkClicks?: number | null;
  roas?: number | null;
  cpa?: number | null;
  ctr?: number | null;
  hookRate?: number | null;
  video25Rate?: number | null;
  watchRate?: number | null;
  video75Rate?: number | null;
  clickToPurchaseRate?: number | null;
  atcToPurchaseRate?: number | null;
  attentionCurrent?: number | null;
  attentionBenchmark?: number | null;
  benchmarkRoas?: number | null;
  benchmarkCpa?: number | null;
  benchmarkCtr?: number | null;
  benchmarkClickToPurchase?: number | null;
  baselineMedianRoas?: number | null;
  baselineMedianCpa?: number | null;
  baselineMedianSpend?: number | null;
  baselineReliability?: string | null;
  baselineSampleSize?: number | null;
  targetRoas?: number | null;
  breakEvenRoas?: number | null;
  roasFloor?: number | null;
  targetCpa?: number | null;
  breakEvenCpa?: number | null;
  trustState?: string | null;
  activeStatus?: boolean | null;
  activeDelivery?: boolean | null;
  pausedDelivery?: boolean | null;
  campaignStatus?: string | null;
  adSetStatus?: string | null;
  campaignIsTestLike?: boolean | null;
  score?: number | null;
  lifecycle?: string | null;
  primaryAction?: string | null;
  operatorSegment?: string | null;
  operatorReasons?: string[] | null;
  fatigueStatus?: string | null;
  roasDecay?: number | null;
  ctrDecay?: number | null;
  clickToPurchaseDecay?: number | null;
  fatigueConfidence?: number | null;
  winnerMemory?: boolean | null;
  frequencyPressure?: number | null;
  commercialTruthConfigured?: boolean | null;
  missingCommercialInputs?: string[] | null;
  copyText?: string | null;
  headlineVariants?: string[] | null;
  aiTags?: Partial<Record<string, string[]>> | null;
}

interface NormalizedCanonicalSignals {
  spend: number;
  purchases: number;
  purchaseValue: number;
  impressions: number;
  linkClicks: number;
  roas: number | null;
  cpa: number | null;
  ctr: number | null;
  score: number;
  subScores: CreativeCanonicalSubScores;
  evidenceMaturity: number;
  economicsRatio: number | null;
  peerRatio: number | null;
  cpaRatio: number | null;
  attentionHealth: number;
  clickOrPurchaseHealth: number;
  funnelHealth: number;
  fatigueSeverity: number;
  hasTrustWarning: boolean;
  measurementInvalid: boolean;
  zeroPurchaseLeak: boolean;
  isHistoricalWinner: boolean;
  trustState: string;
  lifecycle: string | null;
  activeDelivery: boolean | null;
  pausedDelivery: boolean | null;
  readinessReasons: string[];
  diagnosticFlags: string[];
  calibrationFreshness: number;
}

export const DEFAULT_CREATIVE_CANONICAL_THRESHOLDS: CreativeCanonicalThresholds = {
  minSpendForDecision: 180,
  minPurchasesForScale: 4,
  minPurchasesForCut: 2,
  scaleScore: 78,
  protectScore: 68,
  refreshFatigue: 0.5,
  hardCutEconomicsRatio: 0.65,
  softCutEconomicsRatio: 0.85,
  strongPeerRatio: 1.25,
  weakPeerRatio: 0.75,
  persona: "balanced",
  version: CREATIVE_CANONICAL_DECISION_CALIBRATION_VERSION,
  staleAfterDays: 60,
  lastCalibratedAt: null,
};

const ACTION_LABELS: Record<CreativeCanonicalAction, string> = {
  scale: "Scale",
  test_more: "Test More",
  protect: "Protect",
  refresh: "Refresh",
  cut: "Cut",
  diagnose: "Diagnose",
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function n(value: number | null | undefined, fallback = 0) {
  return finite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function ratio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
) {
  if (!finite(numerator) || !finite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function inverseRatio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
) {
  const direct = ratio(numerator, denominator);
  if (direct === null || direct <= 0) return null;
  return 1 / direct;
}

function scoreToHealth(value: number | null | undefined, target: number) {
  if (!finite(value) || target <= 0) return 0;
  return clamp(value / target, 0, 1.5) / 1.5;
}

function weightedMean(
  entries: Array<[number | null | undefined, number]>,
  fallback: number,
) {
  let total = 0;
  let weight = 0;
  for (const [value, entryWeight] of entries) {
    if (!finite(value)) continue;
    total += value * entryWeight;
    weight += entryWeight;
  }
  if (weight <= 0) return fallback;
  return total / weight;
}

function maxSignal(values: Array<number | null | undefined>, fallback = 0) {
  const finiteValues = values.filter(finite);
  return finiteValues.length > 0 ? Math.max(...finiteValues) : fallback;
}

function includesNormalized(value: string | null | undefined, needle: string) {
  return value?.toLowerCase().includes(needle.toLowerCase()) ?? false;
}

function computeSubScores(input: CreativeCanonicalDecisionInput): CreativeCanonicalSubScores {
  const linkCtr = ratio(input.linkClicks, input.impressions);
  const linkCtrPct = linkCtr === null ? null : linkCtr * 100;
  const clickToPurchaseRate =
    finite(input.clickToPurchaseRate)
      ? input.clickToPurchaseRate
      : input.linkClicks && input.linkClicks > 0
        ? (n(input.purchases) / input.linkClicks) * 100
        : null;
  const atcToPurchaseRate =
    finite(input.atcToPurchaseRate) && input.atcToPurchaseRate <= 1
      ? input.atcToPurchaseRate * 100
      : input.atcToPurchaseRate;
  const ctr = finite(input.ctr) && input.ctr <= 1 ? input.ctr * 100 : input.ctr;
  const hookSource = finite(input.attentionCurrent) ? input.attentionCurrent : input.hookRate;
  const formulaInput: CreativeScoreFormulaInput = {
    format: input.creativeFormat,
    thumbstop: hookSource,
    video25: input.video25Rate,
    video50: input.watchRate,
    video100: input.video75Rate,
    ctrAll: ctr,
    seeMoreRate: null,
    linkCtr: linkCtrPct,
    clickToAddToCartRate: null,
    clickToPurchaseRate,
    atcToPurchaseRatio: atcToPurchaseRate,
    roas: input.roas,
    aiTags: input.aiTags,
  };
  const scores = calculateCreativeFunnelSubScores(formulaInput);
  return {
    hook: round(scores.hook),
    watch: round(scores.watch),
    click: round(scores.click),
    cta: round(scores.cta),
    offer: round(scores.offer),
    convert: round(scores.convert),
  };
}

function computeScoreFallback(input: CreativeCanonicalDecisionInput, subScores: CreativeCanonicalSubScores) {
  if (finite(input.score)) return clamp(Math.round(input.score), 0, 100);
  const baseScore = weightedMean(
    [
      [subScores.offer, 0.26],
      [subScores.convert, 0.26],
      [subScores.cta, 0.18],
      [subScores.click, 0.14],
      [subScores.hook, 0.1],
      [subScores.watch, 0.06],
    ],
    55,
  );
  const purchaseBonus = n(input.purchases) >= 4 ? 5 : 0;
  const spendBonus = n(input.spend) >= 200 ? 4 : 0;
  return clamp(Math.round(baseScore + purchaseBonus + spendBonus), 0, 100);
}

function calibrationFreshness(thresholds: CreativeCanonicalThresholds) {
  if (!thresholds.lastCalibratedAt) return 0.8;
  const parsed = Date.parse(thresholds.lastCalibratedAt);
  if (!Number.isFinite(parsed)) return 0.75;
  const ageDays = Math.max(0, (Date.now() - parsed) / (1000 * 60 * 60 * 24));
  return clamp01(1 - ageDays / Math.max(1, thresholds.staleAfterDays));
}

function normalizeCanonicalSignals(
  input: CreativeCanonicalDecisionInput,
  thresholds: CreativeCanonicalThresholds,
): NormalizedCanonicalSignals {
  const spend = n(input.spend);
  const purchases = n(input.purchases);
  const purchaseValue = n(input.purchaseValue);
  const impressions = n(input.impressions);
  const linkClicks = n(input.linkClicks);
  const roas = finite(input.roas) ? input.roas : spend > 0 ? purchaseValue / spend : null;
  const cpa = finite(input.cpa) ? input.cpa : purchases > 0 ? spend / purchases : null;
  const ctr = finite(input.ctr) ? input.ctr : impressions > 0 ? (linkClicks / impressions) * 100 : null;
  const subScores = computeSubScores({ ...input, roas, cpa, ctr });
  const score = computeScoreFallback({ ...input, roas, cpa, ctr }, subScores);
  const fallbackBreakEven =
    input.breakEvenRoas ??
    input.targetRoas ??
    input.roasFloor ??
    (finite(input.baselineMedianRoas) ? input.baselineMedianRoas * 0.7 : null) ??
    2;
  const economicsRatio = roas === null ? null : roas / Math.max(0.01, fallbackBreakEven);
  const peerRoas = input.baselineMedianRoas ?? input.benchmarkRoas ?? null;
  const peerRatio = roas === null || !finite(peerRoas) || peerRoas <= 0
    ? null
    : roas / peerRoas;
  const cpaRatio = inverseRatio(cpa, input.baselineMedianCpa ?? input.benchmarkCpa);
  const attentionRatio =
    ratio(input.attentionCurrent ?? input.hookRate ?? ctr, input.attentionBenchmark ?? input.benchmarkCtr) ??
    scoreToHealth(subScores.hook, 80);
  const clickToPurchaseRatio =
    ratio(input.clickToPurchaseRate, input.benchmarkClickToPurchase) ??
    scoreToHealth(subScores.convert, 80);
  const ctrRatio = ratio(ctr, input.benchmarkCtr) ?? scoreToHealth(subScores.click, 80);
  const attentionHealth = clamp01(weightedMean([[attentionRatio, 0.55], [ctrRatio, 0.45]], 0.6));
  const clickOrPurchaseHealth = clamp01(
    weightedMean([[clickToPurchaseRatio, 0.6], [cpaRatio, 0.4]], 0.55),
  );
  const funnelHealth = clamp01(
    weightedMean([[attentionHealth, 0.45], [clickOrPurchaseHealth, 0.55]], 0.55),
  );
  const spendMaturity = clamp01(spend / Math.max(thresholds.minSpendForDecision, 1));
  const purchaseMaturity = clamp01(purchases / Math.max(thresholds.minPurchasesForScale, 1));
  const impressionMaturity = clamp01(impressions / 5000);
  const evidenceMaturity = clamp01(
    weightedMean([[spendMaturity, 0.35], [purchaseMaturity, 0.45], [impressionMaturity, 0.2]], 0),
  );
  const fatigueSeverity = clamp01(
    maxSignal(
      [
        input.roasDecay,
        input.ctrDecay,
        input.clickToPurchaseDecay,
        includesNormalized(input.fatigueStatus, "fatigued") ? 0.6 : null,
        includesNormalized(input.fatigueStatus, "watch") ? 0.35 : null,
      ],
      0,
    ),
  );
  const trustState = input.trustState ?? "unknown";
  const commercialTruthMissing =
    input.commercialTruthConfigured === false ||
    (input.missingCommercialInputs?.length ?? 0) > 0 ||
    trustState === "degraded_missing_truth";
  const readinessReasons: string[] = [];
  const diagnosticFlags: string[] = [];
  if (commercialTruthMissing) {
    readinessReasons.push("commercial_truth_missing");
    diagnosticFlags.push("commercial_truth_missing");
  }
  if (trustState === "degraded_missing_truth") diagnosticFlags.push("degraded_missing_truth");
  if (trustState === "measurement_suspect") diagnosticFlags.push("measurement_suspect");
  const activeDelivery = input.activeDelivery ?? input.activeStatus ?? null;
  if (activeDelivery === false || input.pausedDelivery === true) {
    readinessReasons.push("delivery_inactive_or_paused");
    diagnosticFlags.push("delivery_inactive_or_paused");
  }
  if (input.campaignStatus && includesNormalized(input.campaignStatus, "paused")) {
    diagnosticFlags.push("campaign_paused");
  }
  if (input.adSetStatus && includesNormalized(input.adSetStatus, "paused")) {
    diagnosticFlags.push("adset_paused");
  }
  for (const staleReason of thresholds.calibrationStaleReasons ?? []) {
    readinessReasons.push(`calibration_stale:${staleReason}`);
    diagnosticFlags.push("calibration_stale");
  }
  const measurementInvalid =
    trustState === "measurement_suspect" &&
    spend >= thresholds.minSpendForDecision &&
    impressions >= 3000;
  const zeroPurchaseLeak =
    purchases === 0 &&
    spend >= thresholds.minSpendForDecision &&
    impressions >= 3000;
  const isHistoricalWinner =
    input.winnerMemory === true ||
    input.lifecycle === "stable_winner" ||
    input.lifecycle === "scale_ready" ||
    (evidenceMaturity >= 0.6 &&
      (economicsRatio ?? 0) >= 1.2 &&
      purchases >= thresholds.minPurchasesForScale);

  return {
    spend,
    purchases,
    purchaseValue,
    impressions,
    linkClicks,
    roas,
    cpa,
    ctr,
    score,
    subScores,
    evidenceMaturity,
    economicsRatio,
    peerRatio,
    cpaRatio,
    attentionHealth,
    clickOrPurchaseHealth,
    funnelHealth,
    fatigueSeverity,
    hasTrustWarning: readinessReasons.length > 0,
    measurementInvalid,
    zeroPurchaseLeak,
    isHistoricalWinner,
    trustState,
    lifecycle: input.lifecycle ?? null,
    activeDelivery,
    pausedDelivery: input.pausedDelivery ?? null,
    readinessReasons: Array.from(new Set(readinessReasons)),
    diagnosticFlags: Array.from(new Set(diagnosticFlags)),
    calibrationFreshness: calibrationFreshness(thresholds),
  };
}

function signalConsistency(action: CreativeCanonicalAction, signal: NormalizedCanonicalSignals) {
  const scoreFit =
    action === "scale"
      ? signal.score >= 78 ? 1 : signal.score >= 68 ? 0.75 : 0.45
      : action === "protect"
        ? signal.score >= 68 ? 0.9 : signal.score >= 58 ? 0.65 : 0.45
        : action === "refresh"
          ? signal.fatigueSeverity >= 0.45 ? 0.92 : 0.58
          : action === "cut"
            ? signal.score <= 48 || (signal.economicsRatio ?? 1) <= 0.8 ? 0.9 : 0.5
            : action === "diagnose"
              ? signal.diagnosticFlags.length > 0 ? 0.8 : 0.5
              : signal.evidenceMaturity < 0.7 ? 0.82 : 0.62;
  const economicsFit =
    action === "scale" || action === "protect"
      ? clamp01((signal.economicsRatio ?? signal.peerRatio ?? 1) / 1.4)
      : action === "cut"
        ? clamp01(1 - (signal.economicsRatio ?? signal.peerRatio ?? 1) / 1.2)
        : 0.75;
  const funnelFit =
    action === "diagnose"
      ? signal.attentionHealth >= 0.75 && signal.clickOrPurchaseHealth < 0.5 ? 0.9 : 0.65
      : action === "scale" || action === "protect"
        ? signal.funnelHealth
        : 0.75;
  return clamp01(weightedMean([[scoreFit, 0.4], [economicsFit, 0.25], [funnelFit, 0.25], [signal.evidenceMaturity, 0.1]], 0.6));
}

function readinessFor(
  action: CreativeCanonicalAction,
  signal: NormalizedCanonicalSignals,
): CreativeCanonicalActionReadiness {
  if (action === "diagnose" && signal.measurementInvalid) return "blocked";
  if (signal.hasTrustWarning) return "needs_review";
  if ((action === "scale" || action === "cut") && signal.activeDelivery === false) return "needs_review";
  return "ready";
}

function buildDecision(
  input: CreativeCanonicalDecisionInput,
  thresholds: CreativeCanonicalThresholds,
  signal: NormalizedCanonicalSignals,
  action: CreativeCanonicalAction,
  primaryReason: string,
  reasonChips: string[],
  secondarySuggestion?: CreativeCanonicalAction,
): CreativeCanonicalDecision {
  const consistency = signalConsistency(action, signal);
  const confidence = calculateBayesianCreativeDecisionConfidence({
    evidenceMaturity: signal.evidenceMaturity,
    signalConsistency: consistency,
    calibrationFreshness: signal.calibrationFreshness,
    feedbackCount: thresholds.feedbackCount ?? 0,
  });
  const readiness = readinessFor(action, signal);
  const readinessReasons =
    readiness === "ready"
      ? []
      : signal.readinessReasons.length > 0
        ? signal.readinessReasons
        : ["buyer_review_required"];

  return {
    action,
    actionReadiness: readiness,
    confidence,
    primaryReason,
    reasonChips: Array.from(new Set(reasonChips)),
    ...(secondarySuggestion ? { secondarySuggestion } : {}),
    debug: {
      score: signal.score,
      subScores: signal.subScores,
      lifecycle: input.lifecycle ?? undefined,
      fatigueSeverity: round(signal.fatigueSeverity),
      evidenceMaturity: round(signal.evidenceMaturity),
      peerRatio: signal.peerRatio === null ? null : round(signal.peerRatio),
      economicsRatio: signal.economicsRatio === null ? null : round(signal.economicsRatio),
      readinessReasons,
      diagnosticFlags: signal.diagnosticFlags,
      calibrationVersion: thresholds.version,
      resolverVersion: CREATIVE_CANONICAL_DECISION_RESOLVER_VERSION,
    },
  };
}

export function creativeCanonicalActionLabel(action: CreativeCanonicalAction) {
  return ACTION_LABELS[action];
}

export function resolveCreativeCanonicalDecision(
  input: CreativeCanonicalDecisionInput,
  thresholds: CreativeCanonicalThresholds = DEFAULT_CREATIVE_CANONICAL_THRESHOLDS,
): CreativeCanonicalDecision {
  const signal = normalizeCanonicalSignals(input, thresholds);
  const roasText = signal.roas === null ? "unknown ROAS" : `${signal.roas.toFixed(2)}x ROAS`;
  const evidenceText = `$${Math.round(signal.spend).toLocaleString()} spend / ${signal.purchases.toLocaleString()} purchases`;

  if (signal.measurementInvalid) {
    return buildDecision(
      input,
      thresholds,
      signal,
      "diagnose",
      "Measurement quality is not reliable enough for a spend action. Fix tracking or source trust before scaling, cutting, or refreshing.",
      ["measurement_blocked", "do_not_optimize_blindly"],
    );
  }

  if (
    signal.zeroPurchaseLeak &&
    signal.spend >= thresholds.minSpendForDecision &&
    signal.impressions >= 3000 &&
    signal.funnelHealth < 0.55 &&
    signal.activeDelivery !== false
  ) {
    return buildDecision(
      input,
      thresholds,
      signal,
      "cut",
      `Spend is already mature (${evidenceText}), but the creative has no purchases and weak funnel signals. Stop leakage unless attribution lag explains it.`,
      ["zero_purchase_leak", "mature_spend_no_conversion", "weak_funnel"],
    );
  }

  if (signal.evidenceMaturity < 0.25) {
    return buildDecision(
      input,
      thresholds,
      signal,
      "test_more",
      `Evidence is still thin (${evidenceText}). Keep the creative in test until the result is less fragile.`,
      ["low_evidence", "avoid_premature_action"],
    );
  }

  if (
    signal.isHistoricalWinner &&
    signal.fatigueSeverity >= thresholds.refreshFatigue &&
    (includesNormalized(input.fatigueStatus, "fatigued") ||
    signal.spend >= thresholds.minSpendForDecision * 5)
  ) {
    return buildDecision(
      input,
      thresholds,
      signal,
      "refresh",
      `This looks like a proven winner with fatigue decay. Refresh the angle or asset instead of treating it as a fresh scale candidate.`,
      ["winner_memory", "fatigue_decay", "refresh_not_cut"],
      "protect",
    );
  }

  if (
    signal.evidenceMaturity >= 0.6 &&
    (signal.economicsRatio ?? 0) >= 1.75 &&
    (signal.peerRatio === null || signal.peerRatio >= 1.35) &&
    signal.purchases >= thresholds.minPurchasesForScale &&
    signal.fatigueSeverity < 0.95 &&
    signal.score >= 50
  ) {
    const alreadyLargeWinner =
      signal.fatigueSeverity >= 0.55 ||
      signal.spend >= Math.max(thresholds.minSpendForDecision * 4, n(input.baselineMedianSpend) * 4);
    return buildDecision(
      input,
      thresholds,
      signal,
      alreadyLargeWinner ? "protect" : "scale",
      alreadyLargeWinner
        ? `The creative has strong economics and enough evidence, but it already carries winner risk (${roasText}, ${evidenceText}). Protect it and use controlled budget steps.`
        : `The creative has strong relative economics and enough evidence (${roasText}, ${evidenceText}). Move it into a controlled scale test.`,
      alreadyLargeWinner
        ? ["strong_relative_winner", "protect_budget_efficiency"]
        : ["scale_candidate", "strong_relative_winner"],
      alreadyLargeWinner ? "scale" : undefined,
    );
  }

  if (
    signal.evidenceMaturity >= 0.6 &&
    (signal.economicsRatio ?? 0) >= 1.35 &&
    (signal.peerRatio === null || signal.peerRatio >= 1.1) &&
    signal.funnelHealth >= 0.6 &&
    signal.purchases >= thresholds.minPurchasesForScale &&
    signal.fatigueSeverity < 0.35 &&
    signal.score >= thresholds.scaleScore
  ) {
    const alreadyLargeWinner =
      signal.isHistoricalWinner ||
      signal.spend >= Math.max(thresholds.minSpendForDecision * 3, n(input.baselineMedianSpend) * 3);
    if (alreadyLargeWinner) {
      return buildDecision(
        input,
        thresholds,
        signal,
        "protect",
        `Performance is strong and mature (${roasText}, ${evidenceText}). Protect the winner and scale only with controlled budget steps.`,
        ["strong_winner", "protect_budget_efficiency"],
        "scale",
      );
    }
    return buildDecision(
      input,
      thresholds,
      signal,
      "scale",
      `The creative has enough evidence, strong economics, and healthy funnel signals (${roasText}, ${evidenceText}). Increase budget in controlled steps.`,
      ["scale_candidate", "strong_roas", "healthy_funnel"],
    );
  }

  if (
    signal.evidenceMaturity >= 0.55 &&
    signal.score >= thresholds.protectScore &&
    (signal.economicsRatio ?? 0) >= 1.1 &&
    (signal.peerRatio === null || signal.peerRatio >= 0.95) &&
    signal.funnelHealth >= 0.5 &&
    signal.fatigueSeverity < 0.45
  ) {
    return buildDecision(
      input,
      thresholds,
      signal,
      "protect",
      `The creative is economically healthy but not clearly under-scaled (${roasText}, ${evidenceText}). Keep it stable and avoid unnecessary edits.`,
      ["stable_winner", "do_not_touch"],
    );
  }

  if (
    signal.evidenceMaturity >= 0.55 &&
    (signal.purchases >= thresholds.minPurchasesForCut ||
      (signal.purchases === 0 &&
        signal.spend >= thresholds.minSpendForDecision * 2 &&
        signal.funnelHealth < 0.55 &&
        signal.activeDelivery !== false)) &&
    ((signal.economicsRatio ?? 1) <= thresholds.hardCutEconomicsRatio ||
      (signal.peerRatio !== null && signal.peerRatio <= thresholds.weakPeerRatio) ||
      signal.score <= 48) &&
    signal.funnelHealth < 0.65
  ) {
    return buildDecision(
      input,
      thresholds,
      signal,
      "cut",
      `The creative has mature spend and is materially below economic or peer benchmarks (${roasText}, ${evidenceText}). Cut it rather than extending the test.`,
      ["mature_loser", "below_benchmark", "budget_leak"],
    );
  }

  if (
    signal.evidenceMaturity >= 0.45 &&
    signal.attentionHealth >= 0.75 &&
    signal.clickOrPurchaseHealth < 0.5
  ) {
    return buildDecision(
      input,
      thresholds,
      signal,
      "diagnose",
      "Top-of-funnel attention is acceptable, but conversion flow is weak. Diagnose offer, landing page, price, or checkout before judging the creative alone.",
      ["funnel_break", "attention_ok_conversion_weak"],
      "test_more",
    );
  }

  if (signal.fatigueSeverity >= 0.55 && signal.evidenceMaturity >= 0.45) {
    return buildDecision(
      input,
      thresholds,
      signal,
      "refresh",
      "The creative shows fatigue-like decay, but the winner signal is not strong enough to protect. Refresh or rotate variants before adding budget.",
      ["fatigue_watch", "refresh_candidate"],
    );
  }

  return buildDecision(
    input,
    thresholds,
    signal,
    "test_more",
    `Signals are mixed (${roasText}, ${evidenceText}). Keep testing with a defined spend or purchase threshold before scaling, cutting, or refreshing.`,
    ["mixed_signals", "continue_test"],
  );
}

export function mapLegacyPrimaryActionToCanonical(action: string | null | undefined): CreativeCanonicalAction {
  if (action === "promote_to_scaling") return "scale";
  if (action === "hold_no_touch") return "protect";
  if (action === "refresh_replace" || action === "retest_comeback") return "refresh";
  if (action === "block_deploy") return "cut";
  return "test_more";
}

export function resolveCreativeCanonicalDecisionForCreative(
  creative: {
    creativeId: string;
    name: string;
    creativeFormat?: string | null;
    creativeAgeDays?: number | null;
    spend?: number | null;
    purchases?: number | null;
    purchaseValue?: number | null;
    impressions?: number | null;
    linkClicks?: number | null;
    roas?: number | null;
    cpa?: number | null;
    ctr?: number | null;
    score?: number | null;
    lifecycleState?: string | null;
    primaryAction?: string | null;
    benchmark?: {
      metrics?: {
        roas?: { benchmark?: number | null; current?: number | null };
        cpa?: { benchmark?: number | null; current?: number | null };
        ctr?: { benchmark?: number | null; current?: number | null };
        clickToPurchase?: { benchmark?: number | null; current?: number | null };
      };
      sampleSize?: number | null;
    } | null;
    relativeBaseline?: {
      medianRoas?: number | null;
      medianCpa?: number | null;
      medianSpend?: number | null;
      reliability?: string | null;
      sampleSize?: number | null;
    } | null;
    fatigue?: {
      status?: string | null;
      confidence?: number | null;
      evidence?: string[] | null;
    } | null;
    economics?: {
      roasFloor?: number | null;
      cpaCeiling?: number | null;
    } | null;
    trust?: { truthState?: string | null } | null;
    deliveryContext?: {
      activeDelivery?: boolean | null;
      pausedDelivery?: boolean | null;
      campaignStatus?: string | null;
      adSetStatus?: string | null;
      campaignIsTestLike?: boolean | null;
    } | null;
    operatorPolicy?: {
      segment?: string | null;
      reasons?: string[] | null;
      missingEvidence?: string[] | null;
    } | null;
    pattern?: { format?: string | null } | null;
  },
  thresholds?: CreativeCanonicalThresholds,
) {
  const fatigueEvidence = creative.fatigue?.evidence?.join(" ").toLowerCase() ?? "";
  const decayMatch = fatigueEvidence.match(/(?:decay|drop|down)[^\d]*(0?\.\d+|\d{1,3})/);
  const parsedDecay = decayMatch
    ? Number(decayMatch[1]) > 1
      ? Number(decayMatch[1]) / 100
      : Number(decayMatch[1])
    : null;
  return resolveCreativeCanonicalDecision(
    {
      creativeId: creative.creativeId,
      creativeName: creative.name,
      creativeFormat: creative.creativeFormat ?? creative.pattern?.format ?? "unknown",
      creativeAgeDays: creative.creativeAgeDays,
      spend: creative.spend,
      purchases: creative.purchases,
      purchaseValue: creative.purchaseValue,
      impressions: creative.impressions,
      linkClicks: creative.linkClicks,
      roas: creative.roas,
      cpa: creative.cpa,
      ctr: creative.ctr,
      score: creative.score,
      lifecycle: creative.lifecycleState,
      primaryAction: creative.primaryAction,
      benchmarkRoas: creative.benchmark?.metrics?.roas?.benchmark ?? null,
      benchmarkCpa: creative.benchmark?.metrics?.cpa?.benchmark ?? null,
      benchmarkCtr: creative.benchmark?.metrics?.ctr?.benchmark ?? null,
      benchmarkClickToPurchase: creative.benchmark?.metrics?.clickToPurchase?.benchmark ?? null,
      clickToPurchaseRate: creative.benchmark?.metrics?.clickToPurchase?.current ?? null,
      baselineMedianRoas: creative.relativeBaseline?.medianRoas ?? null,
      baselineMedianCpa: creative.relativeBaseline?.medianCpa ?? null,
      baselineMedianSpend: creative.relativeBaseline?.medianSpend ?? null,
      baselineReliability: creative.relativeBaseline?.reliability ?? null,
      baselineSampleSize: creative.relativeBaseline?.sampleSize ?? creative.benchmark?.sampleSize ?? null,
      roasFloor: creative.economics?.roasFloor ?? null,
      targetCpa: creative.economics?.cpaCeiling ?? null,
      trustState: creative.trust?.truthState ?? null,
      activeDelivery: creative.deliveryContext?.activeDelivery ?? null,
      pausedDelivery: creative.deliveryContext?.pausedDelivery ?? null,
      campaignStatus: creative.deliveryContext?.campaignStatus ?? null,
      adSetStatus: creative.deliveryContext?.adSetStatus ?? null,
      campaignIsTestLike: creative.deliveryContext?.campaignIsTestLike ?? null,
      fatigueStatus: creative.fatigue?.status ?? null,
      roasDecay: parsedDecay,
      ctrDecay: null,
      clickToPurchaseDecay: null,
      fatigueConfidence: creative.fatigue?.confidence ?? null,
      winnerMemory:
        creative.lifecycleState === "stable_winner" ||
        creative.lifecycleState === "fatigued_winner" ||
        creative.operatorPolicy?.segment === "protected_winner",
      commercialTruthConfigured:
        !(creative.operatorPolicy?.missingEvidence ?? []).some((item) =>
          item.toLowerCase().includes("commercial"),
        ),
      missingCommercialInputs: creative.operatorPolicy?.missingEvidence ?? [],
      operatorSegment: creative.operatorPolicy?.segment ?? null,
      operatorReasons: creative.operatorPolicy?.reasons ?? [],
    },
    thresholds,
  );
}

export function resolveCreativeCanonicalDecisionForAuditRow(
  row: Record<string, unknown>,
  thresholds?: CreativeCanonicalThresholds,
) {
  const get = (key: string) => row[key] as number | string | boolean | null | undefined;
  return resolveCreativeCanonicalDecision(
    {
      rowId: String(get("rowId") ?? ""),
      creativeId: String(get("creativeId") ?? ""),
      creativeName: String(get("creativeName") ?? ""),
      creativeFormat: String(get("creativeFormat") ?? get("formatPattern") ?? "unknown"),
      creativeAgeDays: get("creativeAgeDays") as number | null | undefined,
      spend: get("spend") as number | null | undefined,
      purchases: get("purchases") as number | null | undefined,
      purchaseValue: get("purchaseValue") as number | null | undefined,
      impressions: get("impressions") as number | null | undefined,
      linkClicks: get("linkClicks") as number | null | undefined,
      roas: get("roas") as number | null | undefined,
      cpa: get("cpa") as number | null | undefined,
      ctr: get("ctr") as number | null | undefined,
      benchmarkRoas: get("benchmarkRoas") as number | null | undefined,
      benchmarkCpa: get("benchmarkCpa") as number | null | undefined,
      benchmarkCtr: get("benchmarkCtr") as number | null | undefined,
      attentionCurrent: get("attentionCurrent") as number | null | undefined,
      attentionBenchmark: get("attentionBenchmark") as number | null | undefined,
      clickToPurchaseRate: get("clickToPurchaseCurrent") as number | null | undefined,
      benchmarkClickToPurchase: get("clickToPurchaseBenchmark") as number | null | undefined,
      baselineMedianRoas: get("baselineMedianRoas") as number | null | undefined,
      baselineMedianCpa: get("baselineMedianCpa") as number | null | undefined,
      baselineMedianSpend: get("baselineMedianSpend") as number | null | undefined,
      baselineReliability: get("baselineReliability") as string | null | undefined,
      baselineSampleSize: get("baselineSampleSize") as number | null | undefined,
      targetRoas: get("targetRoas") as number | null | undefined,
      breakEvenRoas: get("breakEvenRoas") as number | null | undefined,
      roasFloor: get("roasFloor") as number | null | undefined,
      targetCpa: get("targetCpa") as number | null | undefined,
      breakEvenCpa: get("breakEvenCpa") as number | null | undefined,
      trustState: get("trustState") as string | null | undefined,
      activeDelivery: get("activeDelivery") as boolean | null | undefined,
      pausedDelivery: get("pausedDelivery") as boolean | null | undefined,
      campaignStatus: get("campaignStatus") as string | null | undefined,
      adSetStatus: get("adSetStatus") as string | null | undefined,
      campaignIsTestLike: get("campaignIsTestLike") as boolean | null | undefined,
      fatigueStatus: get("fatigueStatus") as string | null | undefined,
      roasDecay: get("roasDecay") as number | null | undefined,
      ctrDecay: get("ctrDecay") as number | null | undefined,
      clickToPurchaseDecay: get("clickToPurchaseDecay") as number | null | undefined,
      fatigueConfidence: get("fatigueConfidence") as number | null | undefined,
      winnerMemory: get("winnerMemory") as boolean | null | undefined,
      commercialTruthConfigured: get("targetRoas") != null || get("breakEvenRoas") != null || get("targetCpa") != null,
    },
    thresholds,
  );
}

export function creativeCanonicalActionDistance(
  left: CreativeCanonicalAction,
  right: CreativeCanonicalAction,
) {
  const rank: Record<CreativeCanonicalAction, number> = {
    cut: 0,
    diagnose: 1,
    refresh: 2,
    test_more: 3,
    protect: 4,
    scale: 5,
  };
  return Math.abs(rank[left] - rank[right]);
}

export interface CreativeCanonicalReasonEnrichment {
  primaryReason?: string;
  reasonChips?: string[];
  action?: never;
  actionReadiness?: never;
  confidence?: never;
}

export function applyCreativeCanonicalReasonEnrichment(
  decision: CreativeCanonicalDecision,
  enrichment: CreativeCanonicalReasonEnrichment & Record<string, unknown>,
): CreativeCanonicalDecision {
  const forbiddenKeys = ["action", "actionReadiness", "confidence"];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(enrichment, key)) {
      throw new Error(`LLM enrichment cannot set canonical ${key}`);
    }
  }
  return {
    ...decision,
    primaryReason:
      typeof enrichment.primaryReason === "string" && enrichment.primaryReason.trim()
        ? enrichment.primaryReason.trim()
        : decision.primaryReason,
    reasonChips: Array.from(
      new Set([
        ...decision.reasonChips,
        ...((Array.isArray(enrichment.reasonChips) ? enrichment.reasonChips : []) as string[])
          .map((chip) => chip.trim())
          .filter(Boolean),
      ]),
    ),
  };
}
