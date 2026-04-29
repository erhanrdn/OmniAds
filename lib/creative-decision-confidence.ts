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

function confidenceLabel(value: number): CreativeDecisionConfidenceLabel {
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

export function calculateBayesianCreativeDecisionConfidence(
  input: CreativeDecisionConfidenceInput,
): CreativeDecisionConfidence {
  const priorAlpha = Math.max(0.1, input.priorAlpha ?? 2);
  const priorBeta = Math.max(0.1, input.priorBeta ?? 2);
  const evidenceMaturity = clamp01(input.evidenceMaturity);
  const signalConsistency = clamp01(input.signalConsistency);
  const calibrationFreshness = clamp01(input.calibrationFreshness);
  const feedbackCount = Math.max(0, Math.round(input.feedbackCount ?? 0));
  const actionClassFeedbackCount = Math.max(0, Math.round(input.actionClassFeedbackCount ?? feedbackCount));

  const virtualObservationWeight = 10;
  const alpha = priorAlpha + evidenceMaturity * virtualObservationWeight;
  const beta = priorBeta + (1 - evidenceMaturity) * virtualObservationWeight;
  const posteriorEvidence = alpha / (alpha + beta);
  const evidence = shrinkCreativeCalibrationValue(posteriorEvidence, 0.5, feedbackCount, 50);
  const consistency = shrinkCreativeCalibrationValue(signalConsistency, 0.5, actionClassFeedbackCount, 75);
  const value = capLowNPersonalizedConfidence(
    clamp01(evidence * consistency * calibrationFreshness),
    feedbackCount,
  );

  return {
    value: round(value),
    evidence: round(evidence),
    signalConsistency: round(consistency),
    calibrationFreshness: round(calibrationFreshness),
    label: confidenceLabel(value),
  };
}
