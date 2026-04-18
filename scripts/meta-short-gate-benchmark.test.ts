import { describe, expect, it } from "vitest";
import {
  classifyMetaBenchmarkScenario,
  isAcceptedMetaValidityNote,
} from "@/scripts/meta-short-gate-benchmark";

describe("meta short gate benchmark", () => {
  it("accepts valid and valid:* notes only", () => {
    expect(isAcceptedMetaValidityNote("valid")).toBe(true);
    expect(isAcceptedMetaValidityNote("valid:fresh")).toBe(true);
    expect(isAcceptedMetaValidityNote("valid:fresh|valid")).toBe(true);
    expect(isAcceptedMetaValidityNote("valid|sample_cardinality_changed")).toBe(false);
    expect(isAcceptedMetaValidityNote("status:ok")).toBe(false);
  });

  it("creates missing-baseline blockers for non-creative scenarios when not writing baseline", () => {
    const blockers = classifyMetaBenchmarkScenario({
      result: {
        name: "meta_campaigns_30d",
        iterations: 2,
        averageMs: 1000,
        minMs: 900,
        maxMs: 1100,
        p50Ms: 1000,
        p95Ms: 1100,
        sampleCardinality: 42,
        validityNote: "valid",
        businessId: "biz-1",
        businessLabel: "TheSwaf",
        baselineAverageMs: null,
        baselineP95Ms: null,
      },
      parityBlockingDiffCount: 0,
      writeBaseline: false,
    });

    expect(blockers).toEqual([
      {
        scenario: "meta_campaigns_30d",
        reason: "missing_baseline",
        detail: "Meta short-gate baseline is missing for this scenario.",
      },
    ]);
  });

  it("flags only large unexplained p95 regressions", () => {
    const blockers = classifyMetaBenchmarkScenario({
      result: {
        name: "meta_creatives_30d",
        iterations: 2,
        averageMs: 1800,
        minMs: 1700,
        maxMs: 1900,
        p50Ms: 1800,
        p95Ms: 1900,
        sampleCardinality: 8,
        validityNote: "valid:fresh",
        businessId: "biz-1",
        businessLabel: "TheSwaf",
        baselineAverageMs: 1200,
        baselineP95Ms: 1200,
      },
      parityBlockingDiffCount: 0,
      writeBaseline: false,
    });

    expect(blockers).toEqual([
      {
        scenario: "meta_creatives_30d",
        reason: "p95_regression",
        detail: "p95 regressed by 700.00ms (58.33%).",
        currentValue: 1900,
        baselineValue: 1200,
      },
    ]);
  });
});
