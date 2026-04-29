import { describe, expect, it } from "vitest";
import {
  calculateBayesianCreativeDecisionConfidence,
  calibrationCapForFeedbackCount,
  calibrationStatusForFeedbackCount,
} from "@/lib/creative-decision-confidence";

describe("creative decision confidence", () => {
  it("does not collapse uncalibrated clear signal confidence to 0.20", () => {
    const confidence = calculateBayesianCreativeDecisionConfidence({
      evidenceMaturity: 1,
      signalConsistency: 0.9,
      calibrationFreshness: 0.8,
      feedbackCount: 0,
    });

    expect(confidence.value).toBeGreaterThanOrEqual(0.55);
    expect(confidence.deterministic).toBeGreaterThanOrEqual(0.65);
    expect(confidence.value).toBe(0.72);
  });

  it("does not label zero-feedback capped confidence as fully calibrated high", () => {
    const confidence = calculateBayesianCreativeDecisionConfidence({
      evidenceMaturity: 1,
      signalConsistency: 0.9,
      calibrationFreshness: 0.8,
      feedbackCount: 0,
    });

    expect(confidence.value).toBe(0.72);
    expect(confidence.calibrationCap).toBe(0.72);
    expect(confidence.label).not.toBe("high");
    expect(confidence.calibrationStatus).toBe("uncalibrated");
  });

  it("separates thin calibration status from high signal label", () => {
    const confidence = calculateBayesianCreativeDecisionConfidence({
      evidenceMaturity: 1,
      signalConsistency: 0.9,
      calibrationFreshness: 0.8,
      feedbackCount: 35,
    });

    expect(confidence.value).toBeGreaterThanOrEqual(0.72);
    expect(confidence.label).toBe("high");
    expect(confidence.calibrationStatus).toBe("thin_calibration");
  });

  it("calibration cap rises with feedback count", () => {
    expect(calibrationCapForFeedbackCount(10)).toBe(0.72);
    expect(calibrationCapForFeedbackCount(35)).toBe(0.82);
    expect(calibrationCapForFeedbackCount(75)).toBe(0.9);
    expect(calibrationCapForFeedbackCount(150)).toBe(0.95);
    expect(calibrationStatusForFeedbackCount(10)).toBe("uncalibrated");
    expect(calibrationStatusForFeedbackCount(35)).toBe("thin_calibration");
    expect(calibrationStatusForFeedbackCount(75)).toBe("calibrated");
  });
});
