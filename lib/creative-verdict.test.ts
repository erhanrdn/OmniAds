import { describe, expect, it } from "vitest";
import {
  deriveCreativePhase,
  resolveCreativeBreakEvenRoas,
  resolveCreativeVerdict,
  type CreativeVerdictInput,
} from "@/lib/creative-verdict";

const NOW = "2026-04-29T00:00:00.000Z";

function row(overrides: Partial<CreativeVerdictInput> = {}): CreativeVerdictInput {
  const base: CreativeVerdictInput = {
    metrics: {
      spend30d: 400,
      purchases30d: 6,
      roas30d: 3,
      cpa30d: 55,
      recent7d: { spend: 90, roas: 3, purchases: 2 },
      mid30d: { spend: 400, roas: 3, purchases: 6 },
      long90d: { spend: 1_000, roas: 3, purchases: 12 },
      relative: {
        roasToBenchmark: 1.5,
        cpaToBenchmark: 0.8,
        spendToMedian: 2,
        recent7ToLong90Roas: 1,
      },
    },
    delivery: {
      activeStatus: true,
      campaignStatus: "ACTIVE",
      adSetStatus: "ACTIVE",
    },
    baseline: {
      reliability: "strong",
      selected: {
        medianRoas: 2,
        medianCpa: 60,
        medianSpend: 200,
      },
    },
    commercialTruth: {
      targetPackConfigured: true,
      targetRoas: 2,
      businessValidationStatus: "favorable",
    },
    context: {
      trustState: "live_confident",
      deploymentCompatibility: "compatible",
      campaignIsTestLike: false,
    },
    now: NOW,
  };
  return {
    ...base,
    ...overrides,
    metrics: { ...base.metrics, ...overrides.metrics },
    delivery: { ...base.delivery, ...overrides.delivery },
    baseline: {
      ...base.baseline,
      ...overrides.baseline,
      selected: { ...base.baseline.selected, ...overrides.baseline?.selected },
    },
    commercialTruth: { ...base.commercialTruth, ...overrides.commercialTruth },
    context: { ...base.context, ...overrides.context },
  };
}

describe("resolveCreativeVerdict fatigue policy", () => {
  it("forces Scale Fatiguing when recent ROAS collapses below long-window winner memory", () => {
    const result = resolveCreativeVerdict(row({
      metrics: {
        recent7d: { spend: 80, roas: 0.8, purchases: 1 },
        long90d: { spend: 900, roas: 3, purchases: 20 },
        relative: { recent7ToLong90Roas: 0.266 },
      },
    }));

    expect(result.phase).toBe("post-scale");
    expect(result.headline).toBe("Scale Fatiguing");
    expect(result.action).toBe("refresh");
    expect(result.evidence).toContainEqual({ tag: "fatigue_recent_collapse", weight: "primary" });
  });

  it("forces fatigue on sub-0.4 recent/long ratio with meaningful recent spend", () => {
    const result = resolveCreativeVerdict(row({
      metrics: {
        recent7d: { spend: 31, roas: 0.9, purchases: 1 },
        long90d: { spend: 600, roas: 2.4, purchases: 9 },
      },
    }));

    expect(result.headline).toBe("Scale Fatiguing");
    expect(result.action).toBe("refresh");
  });

  it("does not mark fatigue when long-window ROAS is absent", () => {
    const result = resolveCreativeVerdict(row({
      metrics: {
        recent7d: { spend: 90, roas: 0.1, purchases: 0 },
        long90d: { spend: 0, roas: null, purchases: 0 },
        relative: { recent7ToLong90Roas: null },
      },
    }));

    expect(result.headline).not.toBe("Scale Fatiguing");
  });
});

describe("resolveCreativeVerdict spend-tier phase exit", () => {
  it("forces scale phase at 5000 spend", () => {
    const result = resolveCreativeVerdict(row({ metrics: { spend30d: 5_000, purchases30d: 4 } }));

    expect(result.phase).toBe("scale");
  });

  it("forces scale phase at 5x peer median spend", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 950, relative: { spendToMedian: 5 } },
    }));

    expect(result.phase).toBe("scale");
  });

  it("does not keep large test-campaign spend in test phase", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 12_000, purchases30d: 2 },
      context: { campaignIsTestLike: true },
    }));

    expect(result.phase).toBe("scale");
  });
});

describe("resolveCreativeVerdict blocker semantics", () => {
  it("treats degraded truth alone as needs review, not a hard blocker", () => {
    const result = resolveCreativeVerdict(row({
      commercialTruth: { businessValidationStatus: "favorable" },
      context: { trustState: "degraded_missing_truth" },
    }));

    expect(result.action).not.toBe("diagnose");
    expect(result.actionReadiness).toBe("needs_review");
  });

  it("treats missing business validation alone as needs review", () => {
    const result = resolveCreativeVerdict(row({
      context: { trustState: "live_confident" },
      commercialTruth: { businessValidationStatus: "missing" },
    }));

    expect(result.action).not.toBe("diagnose");
    expect(result.actionReadiness).toBe("needs_review");
  });

  it("treats unfavorable validation alone as needs review while still in test phase", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 100, purchases30d: 2, roas30d: 2 },
      commercialTruth: { businessValidationStatus: "unfavorable" },
    }));

    expect(result.phase).toBe("test");
    expect(result.actionReadiness).toBe("needs_review");
  });

  it("co-occurring degraded truth and missing validation becomes blocked diagnosis", () => {
    const result = resolveCreativeVerdict(row({
      commercialTruth: { targetPackConfigured: false, targetRoas: null, businessValidationStatus: "missing" },
      context: { trustState: "degraded_missing_truth" },
    }));

    expect(result.headline).toBe("Needs Diagnosis");
    expect(result.action).toBe("diagnose");
    expect(result.actionReadiness).toBe("blocked");
    expect(result.blockers).toContain("hard_truth_blocker");
  });

  it("cuts scale-phase unfavorable validation as a reviewable business blocker", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 8_000, purchases30d: 12, roas30d: 3 },
      commercialTruth: { businessValidationStatus: "unfavorable" },
    }));

    expect(result.headline).toBe("Scale Underperformer");
    expect(result.action).toBe("cut");
    expect(result.actionReadiness).toBe("ready");
  });

  it("keeps inactive scale rows review-only without changing action", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 6_000, purchases30d: 20, roas30d: 3 },
      delivery: { activeStatus: false, campaignStatus: "PAUSED" },
    }));

    expect(result.phase).toBe("scale");
    expect(result.action).toBe("protect");
    expect(result.actionReadiness).toBe("needs_review");
    expect(result.blockers).toContain("inactive_scale_delivery");
  });

  it("routes inactive test winners to scale reactivation review", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 100, purchases30d: 3, roas30d: 3, relative: { spendToMedian: 0.5 } },
      delivery: { activeStatus: false, campaignStatus: "PAUSED" },
    }));

    expect(result.phase).toBe("test");
    expect(result.headline).toBe("Test Winner");
    expect(result.action).toBe("scale");
    expect(result.actionReadiness).toBe("needs_review");
  });

  it("makes limited deployment a soft review blocker", () => {
    const result = resolveCreativeVerdict(row({
      context: { deploymentCompatibility: "limited" },
    }));

    expect(result.blockers).toContain("deployment_lane_limited");
    expect(result.actionReadiness).toBe("needs_review");
  });
});

describe("resolveCreativeVerdict break-even source", () => {
  it("uses target ROAS when target pack is configured", () => {
    expect(resolveCreativeBreakEvenRoas(row({
      commercialTruth: { targetPackConfigured: true, targetRoas: 3.4 },
      baseline: { selected: { medianRoas: 2 } },
    }))).toBe(3.4);
  });

  it("falls back to median ROAS when target pack is missing", () => {
    expect(resolveCreativeBreakEvenRoas(row({
      commercialTruth: { targetPackConfigured: false, targetRoas: 4 },
      baseline: { selected: { medianRoas: 2.2 } },
    }))).toBe(2.2);
  });

  it("falls back to 1.0 when target and median are absent", () => {
    expect(resolveCreativeBreakEvenRoas(row({
      commercialTruth: { targetPackConfigured: false, targetRoas: null },
      baseline: { selected: { medianRoas: null } },
    }))).toBe(1);
  });

  it("does not use target ROAS when target pack is not configured", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { roas30d: 2.5 },
      commercialTruth: { targetPackConfigured: false, targetRoas: 10, businessValidationStatus: "favorable" },
      baseline: { selected: { medianRoas: 2 } },
    }));

    expect(result.headline).toBe("Test Winner");
  });
});

describe("resolveCreativeVerdict action readiness", () => {
  it("marks active favorable live-confident target-backed actions ready", () => {
    const result = resolveCreativeVerdict(row());

    expect(result.action).toBe("scale");
    expect(result.actionReadiness).toBe("ready");
  });

  it("blocks diagnose actions", () => {
    const result = resolveCreativeVerdict(row({
      commercialTruth: { targetPackConfigured: false, businessValidationStatus: "missing" },
      context: { trustState: "degraded_missing_truth" },
    }));

    expect(result.action).toBe("diagnose");
    expect(result.actionReadiness).toBe("blocked");
  });

  it("allows confident cut when validation is unfavorable and trust is live", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 9_000, purchases30d: 10, roas30d: 0.8 },
      commercialTruth: { businessValidationStatus: "unfavorable" },
      context: { trustState: "live_confident" },
    }));

    expect(result.action).toBe("cut");
    expect(result.actionReadiness).toBe("ready");
    expect(result.evidence).toContainEqual({ tag: "confident_cut", weight: "supporting" });
  });

  it("keeps otherwise good rows in review when target pack is missing", () => {
    const result = resolveCreativeVerdict(row({
      commercialTruth: { targetPackConfigured: false, targetRoas: null, businessValidationStatus: "favorable" },
    }));

    expect(result.actionReadiness).toBe("needs_review");
  });

  it("keeps live favorable rows in review when deployment is limited", () => {
    const result = resolveCreativeVerdict(row({
      context: { deploymentCompatibility: "limited" },
    }));

    expect(result.actionReadiness).toBe("needs_review");
  });
});

describe("deriveCreativePhase", () => {
  it("derives scale for mature active rows above two median spends and eight purchases", () => {
    expect(deriveCreativePhase({
      spend30d: 450,
      purchases30d: 8,
      activeStatus: true,
      baseline: { medianSpend: 200 },
      breakEvenRoas: 2,
    })).toBe("scale");
  });

  it("derives post-scale for fatigue before regular test fallback", () => {
    expect(deriveCreativePhase({
      spend30d: 120,
      purchases30d: 2,
      activeStatus: true,
      recent7d: { roas: 0.4 },
      long90d: { roas: 2 },
      baseline: { medianSpend: 200 },
      breakEvenRoas: 1.5,
    })).toBe("post-scale");
  });

  it("derives test for low-spend non-fatigued reads", () => {
    expect(deriveCreativePhase({
      spend30d: 100,
      purchases30d: 2,
      activeStatus: true,
      baseline: { medianSpend: 200 },
      breakEvenRoas: 2,
    })).toBe("test");
  });

  it("keeps hard-blocked large spend context as scale while overriding action to diagnosis", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 5_500, purchases30d: 10 },
      commercialTruth: { targetPackConfigured: false, targetRoas: null, businessValidationStatus: "missing" },
      context: { trustState: "degraded_missing_truth" },
    }));

    expect(result.phase).toBe("scale");
    expect(result.action).toBe("diagnose");
  });
});

describe("resolveCreativeVerdict confidence", () => {
  it("produces a high but clamped confidence for mature strong live signals", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 900, purchases30d: 12, roas30d: 4 },
    }));

    expect(result.confidence).toBe(0.95);
  });

  it("caps diagnose confidence at 0.7", () => {
    const result = resolveCreativeVerdict(row({
      metrics: { spend30d: 8_000, purchases30d: 20, roas30d: 5 },
      commercialTruth: { targetPackConfigured: false, targetRoas: null, businessValidationStatus: "missing" },
      context: { trustState: "degraded_missing_truth" },
    }));

    expect(result.confidence).toBeLessThanOrEqual(0.7);
  });

  it("uses medium baseline as a smaller confidence lift than strong baseline", () => {
    const strong = resolveCreativeVerdict(row({
      metrics: { spend30d: 150, purchases30d: 3, roas30d: 2.4 },
      baseline: { reliability: "strong" },
    }));
    const medium = resolveCreativeVerdict(row({
      metrics: { spend30d: 150, purchases30d: 3, roas30d: 2.4 },
      baseline: { reliability: "medium" },
    }));

    expect(strong.confidence).toBeGreaterThan(medium.confidence);
  });
});
