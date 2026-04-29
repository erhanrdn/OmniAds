import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CREATIVE_CANONICAL_THRESHOLDS,
  resolveCreativeCanonicalDecision,
} from "@/lib/creative-canonical-decision";
import { recordCreativeDecisionOverrideEvent } from "@/lib/creative-calibration-store";
import type { DbClient } from "@/lib/db";

function mockDbClient() {
  return Object.assign(
    vi.fn(async () => []),
    {
      query: vi.fn(async () => [{ id: "override_1" }]),
    },
  ) as unknown as DbClient;
}

describe("resolver to override event pipeline", () => {
  it("threads minSpendForDecision from resolver thresholds through override recording", async () => {
    const thresholds = {
      ...DEFAULT_CREATIVE_CANONICAL_THRESHOLDS,
      minSpendForDecision: 500,
      feedbackCount: 75,
    };
    const decision = resolveCreativeCanonicalDecision(
      {
        creativeId: "pipeline-scale",
        creativeName: "Pipeline scale candidate",
        spend: 1500,
        purchases: 8,
        purchaseValue: 9000,
        impressions: 30000,
        linkClicks: 1300,
        roas: 6,
        baselineMedianRoas: 2.5,
        trustState: "live_confident",
        commercialTruthConfigured: true,
      },
      thresholds,
    );
    const client = mockDbClient();

    const result = await recordCreativeDecisionOverrideEvent(
      {
        businessId: "biz_pipeline",
        creativeId: "pipeline-scale",
        modelDecision: {
          ...decision,
          action: "scale",
          confidence: {
            ...decision.confidence,
            value: 0.52,
          },
        },
        userAction: "cut",
        userStrength: "minor",
        spend: 1500,
        purchases: 8,
        minSpendForDecision: thresholds.minSpendForDecision,
      },
      client,
    );

    expect(result.severity).toBe("critical");
    expect(result.batch).toBe("weekly");
    expect(client.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["biz_pipeline", "pipeline-scale", "scale", "cut", null]),
    );
  });
});
