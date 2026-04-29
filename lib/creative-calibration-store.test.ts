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
});
