import { describe, expect, it } from "vitest";
import {
  creativeDecisionOverrideSeverity,
  shouldQueueRealtimeOverride,
} from "@/lib/creative-calibration-store";

describe("creative calibration override severity", () => {
  it("uses an explicit action/readiness matrix instead of enum distance", () => {
    expect(
      creativeDecisionOverrideSeverity({
        modelAction: "scale",
        modelReadiness: "ready",
        userAction: "cut",
      }),
    ).toBe("critical");
    expect(
      creativeDecisionOverrideSeverity({
        modelAction: "diagnose",
        modelReadiness: "blocked",
        userAction: "protect",
      }),
    ).toBe("critical");
    expect(
      creativeDecisionOverrideSeverity({
        modelAction: "cut",
        modelReadiness: "ready",
        userAction: "protect",
      }),
    ).toBe("high");
    expect(
      creativeDecisionOverrideSeverity({
        modelAction: "refresh",
        modelReadiness: "ready",
        userAction: "protect",
      }),
    ).toBe("medium");
    expect(
      creativeDecisionOverrideSeverity({
        modelAction: "test_more",
        modelReadiness: "ready",
        userAction: "diagnose",
        userReadiness: "needs_review",
      }),
    ).toBe("low");
  });

  it("queues critical mature-spend override even when calibration feedback count is zero", () => {
    const severity = creativeDecisionOverrideSeverity({
      modelAction: "scale",
      modelReadiness: "ready",
      userAction: "cut",
    });

    const result = shouldQueueRealtimeOverride({
      severity,
      confidence: 0.52,
      spend: 2400,
      purchases: 8,
      userStrength: "strong",
    });

    expect(result).toBe(true);
  });

  it("scales severe-queue spend floor with calibrated minSpendForDecision", () => {
    const severity = creativeDecisionOverrideSeverity({
      modelAction: "scale",
      modelReadiness: "ready",
      userAction: "cut",
    });

    expect(
      shouldQueueRealtimeOverride({
        severity,
        confidence: 0.5,
        spend: 1500,
        purchases: 6,
        userStrength: "minor",
        minSpendForDecision: 500,
      }),
    ).toBe(false);

    expect(
      shouldQueueRealtimeOverride({
        severity,
        confidence: 0.5,
        spend: 2600,
        purchases: 6,
        userStrength: "minor",
        minSpendForDecision: 500,
      }),
    ).toBe(true);
  });

  it("does not queue low-AOV severe override below business-relative floor", () => {
    const severity = creativeDecisionOverrideSeverity({
      modelAction: "scale",
      modelReadiness: "ready",
      userAction: "cut",
    });

    expect(
      shouldQueueRealtimeOverride({
        severity,
        confidence: 0.52,
        spend: 900,
        purchases: 6,
        userStrength: "minor",
        minSpendForDecision: 180,
      }),
    ).toBe(false);
  });

  it("queues low-AOV severe override at business-relative floor", () => {
    const severity = creativeDecisionOverrideSeverity({
      modelAction: "scale",
      modelReadiness: "ready",
      userAction: "cut",
    });

    expect(
      shouldQueueRealtimeOverride({
        severity,
        confidence: 0.52,
        spend: 1000,
        purchases: 6,
        userStrength: "minor",
        minSpendForDecision: 180,
      }),
    ).toBe(true);
  });
});
