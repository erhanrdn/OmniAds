export type CreativeDecisionConfidenceLabel = "low" | "medium" | "high";

export interface CreativeDecisionConfidenceInput {
  evidenceMaturity: number;
  signalConsistency: number;
  calibrationFreshness: number;
  feedbackCount?: number;
  actionClassFeedbackCount?: number;
  priorAlpha?: number;
  priorBeta?: number;
}

export interface CreativeDecisionConfidence {
  value: number;
  deterministic: number;
  calibrationCap: number;
  evidence: number;
  signalConsistency: number;
  calibrationFreshness: number;
  label: CreativeDecisionConfidenceLabel;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function confidenceLabel(value: number, feedbackCount: number): CreativeDecisionConfidenceLabel {
  if (feedbackCount < 20 && value >= 0.72) return "medium";
  if (value >= 0.72) return "high";
  if (value >= 0.52) return "medium";
  return "low";
}

export function creativeCalibrationPersonalWeight(sampleSize: number, k: 50 | 75 = 50) {
  const n = Math.max(0, Number.isFinite(sampleSize) ? sampleSize : 0);
  return n / (n + k);
}

export function shrinkCreativeCalibrationValue(
  personalValue: number,
  segmentDefault: number,
  sampleSize: number,
  k: 50 | 75 = 50,
) {
  const weight = creativeCalibrationPersonalWeight(sampleSize, k);
  return segmentDefault * (1 - weight) + personalValue * weight;
}

export function capLowNPersonalizedConfidence(value: number, feedbackCount: number) {
  if (feedbackCount < 20) return Math.min(value, 0.58);
  return value;
}

export function calibrationCapForFeedbackCount(feedbackCount: number) {
  const n = Math.max(0, Math.round(Number.isFinite(feedbackCount) ? feedbackCount : 0));
  if (n < 20) return 0.72;
  if (n < 50) return 0.82;
  if (n < 100) return 0.9;
  return 0.95;
}

function weightedMean(
  entries: Array<[number | null | undefined, number]>,
  fallback: number,
) {
  let total = 0;
  let weight = 0;
  for (const [value, entryWeight] of entries) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    total += value * entryWeight;
    weight += entryWeight;
  }
  return weight > 0 ? total / weight : fallback;
}

export function calculateBayesianCreativeDecisionConfidence(
  input: CreativeDecisionConfidenceInput,
): CreativeDecisionConfidence {
  const priorAlpha = Math.max(0.1, input.priorAlpha ?? 2);
  const priorBeta = Math.max(0.1, input.priorBeta ?? 2);
  const evidenceMaturity = clamp01(input.evidenceMaturity);
  const signalConsistency = clamp01(input.signalConsistency);
  const calibrationFreshness = clamp01(input.calibrationFreshness);
  const feedbackCount = Math.max(0, Math.round(input.feedbackCount ?? 0));

  const virtualObservationWeight = 10;
  const alpha = priorAlpha + evidenceMaturity * virtualObservationWeight;
  const beta = priorBeta + (1 - evidenceMaturity) * virtualObservationWeight;
  const evidence = alpha / (alpha + beta);
  const deterministic = clamp01(
    weightedMean(
      [
        [evidenceMaturity, 0.45],
        [signalConsistency, 0.45],
        [calibrationFreshness, 0.1],
      ],
      0.5,
    ),
  );
  const calibrationCap = calibrationCapForFeedbackCount(feedbackCount);
  const value = Math.min(deterministic, calibrationCap);

  return {
    value: round(value),
    deterministic: round(deterministic),
    calibrationCap: round(calibrationCap),
    evidence: round(evidence),
    signalConsistency: round(signalConsistency),
    calibrationFreshness: round(calibrationFreshness),
    label: confidenceLabel(value, feedbackCount),
  };
}
