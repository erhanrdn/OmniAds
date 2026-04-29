import { describe, expect, it, vi } from "vitest";
import {
  computeActionDistributionDelta,
  computeCanonicalObservabilitySummary,
  computeConfidenceHistogram,
  computeCriticalQueueVolume,
  computeFallbackBadgeRate,
  computeLLMUsage,
  computeOverrideRate,
  computeReadinessDistribution,
  recordCreativeCanonicalDecisionEvent,
} from "@/lib/creative-canonical-observability";
import type { DbClient } from "@/lib/db";

function clientWithResponses(responses: Array<Array<Record<string, unknown>>>) {
  const query = vi.fn(async () => responses.shift() ?? []);
  return Object.assign(vi.fn(async () => []), { query }) as unknown as DbClient;
}

describe("creative canonical observability", () => {
  it("computes critical high-confidence override hard stops with minimum denominator", async () => {
    const insufficient = await computeOverrideRate("biz_1", "critical", 7, {
      client: clientWithResponses([[{ count: 1 }], [{ count: 10 }]]),
      modelConfidenceMin: 0.72,
      hardStopThreshold: 0.01,
    });
    expect(insufficient.status).toBe("insufficient_data");

    const metric = await computeOverrideRate("biz_1", "critical", 7, {
      client: clientWithResponses([[{ count: 2 }], [{ count: 100 }]]),
      modelConfidenceMin: 0.72,
      hardStopThreshold: 0.01,
    });
    expect(metric.value).toBe(0.02);
    expect(metric.denominator).toBe(100);
    expect(metric.status).toBe("hard_stop");
  });

  it("computes high plus critical and all severe warning rates", async () => {
    const highPlus = await computeOverrideRate("biz_1", ["critical", "high"], 7, {
      client: clientWithResponses([[{ count: 4 }], [{ count: 100 }]]),
      warningThreshold: 0.03,
    });
    expect(highPlus.status).toBe("warning");

    const allSevere = await computeOverrideRate("biz_1", ["critical", "high", "medium"], 7, {
      client: clientWithResponses([[{ count: 6 }], [{ count: 100 }]]),
      warningThreshold: 0.05,
    });
    expect(allSevere.status).toBe("warning");
  });

  it("computes overdiagnose warning and hard stop thresholds", async () => {
    const warning = await computeOverrideRate("biz_1", ["low", "medium", "high", "critical"], 7, {
      client: clientWithResponses([[{ count: 12 }], [{ count: 100 }]]),
      fromAction: "diagnose",
      toNonAction: "diagnose",
      warningThreshold: 0.1,
      hardStopThreshold: 0.25,
    });
    expect(warning.status).toBe("warning");

    const hardStop = await computeOverrideRate("biz_1", ["low", "medium", "high", "critical"], 7, {
      client: clientWithResponses([[{ count: 26 }], [{ count: 100 }]]),
      fromAction: "diagnose",
      toNonAction: "diagnose",
      warningThreshold: 0.1,
      hardStopThreshold: 0.25,
    });
    expect(hardStop.status).toBe("hard_stop");
  });

  it("computes action distribution delta", async () => {
    const metric = await computeActionDistributionDelta("biz_1", "canonical-v1", 7, {
      client: clientWithResponses([[{ delta_count: 9, total_count: 90 }]]),
    });
    expect(metric.value).toBe(0.1);
    expect(metric.status).toBe("ok");
  });

  it("computes readiness distribution and confidence histogram", async () => {
    const readiness = await computeReadinessDistribution("biz_1", 24, {
      client: clientWithResponses([[{ action_readiness: "ready", count: 20 }, { action_readiness: "needs_review", count: 10 }]]),
    });
    expect(readiness.value).toEqual({ ready: 20, needs_review: 10 });
    expect(readiness.denominator).toBe(30);

    const histogram = await computeConfidenceHistogram("biz_1", 24, {
      client: clientWithResponses([[{ bucket_0_05: 1, bucket_05_065: 2, bucket_065_08: 3, bucket_08_095: 4, total_count: 10 }]]),
    });
    expect(histogram.value).toEqual({
      "0-0.5": 1,
      "0.5-0.65": 2,
      "0.65-0.8": 3,
      "0.8-0.95": 4,
    });
  });

  it("computes fallback badge rate, critical queue volume, and LLM usage", async () => {
    const fallback = await computeFallbackBadgeRate("biz_1", 24, {
      client: clientWithResponses([[{ fallback_count: 12, total_count: 100 }]]),
    });
    expect(fallback.status).toBe("hard_stop");

    const queue = await computeCriticalQueueVolume("biz_1", 24, {
      client: clientWithResponses([[{ count: 2 }]]),
    });
    expect(queue.status).toBe("warning");

    const llm = await computeLLMUsage("biz_1", 24, {
      client: clientWithResponses([[{ call_count: 20, error_count: 2, cost_usd: 0.42 }]]),
    });
    expect(llm.value).toEqual({ calls: 20, errors: 2, costUsd: 0.42, errorRate: 0.1 });
    expect(llm.status).toBe("warning");
  });

  it("builds a full summary from live metric computations", async () => {
    const summary = await computeCanonicalObservabilitySummary("biz_1", {
      client: clientWithResponses([
        [{ count: 0 }], [{ count: 100 }],
        [{ count: 0 }], [{ count: 100 }],
        [{ count: 0 }], [{ count: 100 }],
        [{ count: 0 }], [{ count: 100 }],
        [{ delta_count: 10, total_count: 100 }],
        [{ action_readiness: "ready", count: 100 }],
        [{ bucket_0_05: 0, bucket_05_065: 10, bucket_065_08: 80, bucket_08_095: 10, total_count: 100 }],
        [{ fallback_count: 0, total_count: 100 }],
        [{ count: 0 }],
        [{ call_count: 0, error_count: 0, cost_usd: 0 }],
      ]),
    });

    expect(summary.criticalHighConfidenceOverrideRate.status).toBe("ok");
    expect(summary.overdiagnoseOverrideRate.status).toBe("ok");
    expect(summary.confidenceHistogram.denominator).toBe(100);
  });

  it("records canonical decision events for live metric denominators", async () => {
    const client = clientWithResponses([[{ id: "event_1" }]]);
    const id = await recordCreativeCanonicalDecisionEvent(
      {
        businessId: "biz_1",
        creativeId: "creative_1",
        cohort: "canonical-v1",
        canonicalAction: "scale",
        legacyAction: "protect",
        actionReadiness: "ready",
        confidenceValue: 0.82,
      },
      client,
    );

    expect(id).toBe("event_1");
  });
});
