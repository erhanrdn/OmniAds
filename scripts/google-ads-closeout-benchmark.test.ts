import { describe, expect, it } from "vitest";
import {
  classifyGoogleAdsBenchmarkScenario,
  isAcceptedGoogleAdsValidityNote,
  measureGoogleAdsBenchmarkOperation,
} from "@/scripts/google-ads-closeout-benchmark";

describe("google ads closeout benchmark", () => {
  it("accepts valid and valid:* notes only", () => {
    expect(isAcceptedGoogleAdsValidityNote("valid")).toBe(true);
    expect(isAcceptedGoogleAdsValidityNote("valid:warehouse")).toBe(true);
    expect(isAcceptedGoogleAdsValidityNote("valid|valid:live")).toBe(true);
    expect(isAcceptedGoogleAdsValidityNote("valid|sample_cardinality_changed")).toBe(false);
    expect(isAcceptedGoogleAdsValidityNote("status:ok")).toBe(false);
  });

  it("creates missing-baseline blockers when no accepted baseline exists", () => {
    const blockers = classifyGoogleAdsBenchmarkScenario({
      result: {
        name: "google_ads_search_intelligence_90d",
        iterations: 2,
        averageMs: 1000,
        minMs: 900,
        maxMs: 1100,
        p50Ms: 1000,
        p95Ms: 1100,
        sampleCardinality: 42,
        validityNote: "valid",
        businessId: "biz-1",
        baselineAverageMs: null,
        baselineP95Ms: null,
      },
    });

    expect(blockers).toEqual([
      {
        scenario: "google_ads_search_intelligence_90d",
        reason: "missing_baseline",
        detail: "Google closeout benchmark baseline is missing for this scenario.",
      },
    ]);
  });

  it("flags large p95 regressions when a p95 baseline exists", () => {
    const blockers = classifyGoogleAdsBenchmarkScenario({
      result: {
        name: "google_ads_products_30d",
        iterations: 2,
        averageMs: 1500,
        minMs: 1400,
        maxMs: 1600,
        p50Ms: 1500,
        p95Ms: 1900,
        sampleCardinality: 12,
        validityNote: "valid",
        businessId: "biz-1",
        baselineAverageMs: 1200,
        baselineP95Ms: 1200,
      },
    });

    expect(blockers).toEqual([
      {
        scenario: "google_ads_products_30d",
        reason: "latency_regression",
        detail: "p95 regressed by 700.00ms (58.33%).",
        currentValue: 1900,
        baselineValue: 1200,
      },
    ]);
  });

  it("times out a benchmark scenario operation instead of hanging indefinitely", async () => {
    await expect(
      measureGoogleAdsBenchmarkOperation({
        timeoutMs: 5,
        operation: async () => new Promise(() => undefined),
      }),
    ).rejects.toThrow("Timed out after 5ms");
  });
});
