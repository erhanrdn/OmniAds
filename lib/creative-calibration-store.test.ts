import { describe, expect, it } from "vitest";
import { creativeDecisionOverrideSeverity } from "@/lib/creative-calibration-store";

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
});
