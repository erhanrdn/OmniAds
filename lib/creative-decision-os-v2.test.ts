import { describe, expect, it } from "vitest";
import {
  resolveCreativeDecisionOsV2,
  type CreativeDecisionOsV2Input,
} from "@/lib/creative-decision-os-v2";
import {
  evaluateCreativeDecisionOsV2Gold,
  readGoldLabelsV0,
  mapGoldRowToV2Input,
} from "@/lib/creative-decision-os-v2-evaluation";

function row(overrides: Partial<CreativeDecisionOsV2Input> = {}): CreativeDecisionOsV2Input {
  return {
    activeStatus: true,
    campaignStatus: "ACTIVE",
    adsetStatus: "ACTIVE",
    spend: 500,
    roas: 2.5,
    recentRoas: 2.5,
    recentPurchases: 4,
    long90Roas: 2.5,
    activeBenchmarkRoas: 2,
    peerMedianSpend: 250,
    trustState: "live_confident",
    baselineReliability: "strong",
    ...overrides,
  };
}

describe("resolveCreativeDecisionOsV2", () => {
  it("emits review-only Scale for textbook active winners while keeping queue/apply blocked", () => {
    const result = resolveCreativeDecisionOsV2(row({
      spend: 10_445,
      roas: 10.85,
      recentRoas: 12.75,
      recentPurchases: 6,
      long90Roas: 8.72,
      activeBenchmarkRoas: 2.8,
      peerMedianSpend: 8_749,
    }));

    expect(result.primaryDecision).toBe("Scale");
    expect(result.actionability).toBe("review_only");
    expect(result.queueEligible).toBe(false);
    expect(result.applyEligible).toBe(false);
    expect(result.reasonTags).toContain("textbook_scale_shape");
  });

  it("cuts huge-spend severe losers with no recovery", () => {
    const result = resolveCreativeDecisionOsV2(row({
      spend: 10_022,
      roas: 0.8,
      recentRoas: 0.8,
      recentPurchases: 1,
      long90Roas: 0.72,
      activeBenchmarkRoas: 2.98,
      peerMedianSpend: 8_749,
      trustState: "live_confident",
    }));

    expect(result.primaryDecision).toBe("Cut");
    expect(result.actionability).toBe("direct");
    expect(result.queueEligible).toBe(false);
    expect(result.applyEligible).toBe(false);
    expect(result.reasonTags).toContain("huge_spend_severe_loser");
  });

  it("refreshes active converting underperformers before cutting", () => {
    const result = resolveCreativeDecisionOsV2(row({
      spend: 3_760,
      roas: 1.37,
      recentRoas: 1.13,
      recentPurchases: 16,
      long90Roas: 1.37,
      activeBenchmarkRoas: 1.84,
      peerMedianSpend: 381,
      trustState: "degraded_missing_truth",
    }));

    expect(result.primaryDecision).toBe("Refresh");
    expect(result.actionability).toBe("review_only");
    expect(result.reasonTags).toContain("active_conversions_below_benchmark");
  });

  it("protects stable above-benchmark winners instead of scaling without enough scalable evidence", () => {
    const result = resolveCreativeDecisionOsV2(row({
      spend: 844,
      roas: 2.46,
      recentRoas: 2.07,
      recentPurchases: 5,
      long90Roas: 2.46,
      activeBenchmarkRoas: 1.74,
      peerMedianSpend: 381,
    }));

    expect(result.primaryDecision).toBe("Protect");
    expect(result.actionability).toBe("direct");
    expect(result.queueEligible).toBe(false);
    expect(result.applyEligible).toBe(false);
  });

  it("uses Test More for thin or rebound signals instead of Watch", () => {
    const result = resolveCreativeDecisionOsV2(row({
      spend: 44,
      roas: 1.38,
      recentRoas: 1.38,
      recentPurchases: 1,
      long90Roas: 1.38,
      activeBenchmarkRoas: 6.14,
      peerMedianSpend: 32.96,
      trustState: "degraded_missing_truth",
    }));

    expect(result.primaryDecision).toBe("Test More");
    expect(result.actionability).toBe("direct");
    expect(result.primaryDecision).not.toBe("Watch" as never);
  });

  it("diagnoses thin or source-blocked reads while preserving queue/apply safety", () => {
    const result = resolveCreativeDecisionOsV2(row({
      spend: 28,
      roas: 0,
      recentRoas: 0,
      recentPurchases: 0,
      long90Roas: 0,
      activeBenchmarkRoas: 1.04,
      peerMedianSpend: 124,
      trustState: "inactive_or_immaterial",
    }));

    expect(result.primaryDecision).toBe("Diagnose");
    expect(result.actionability).toBe("diagnose");
    expect(result.queueEligible).toBe(false);
    expect(result.applyEligible).toBe(false);
  });

  it("never emits direct Scale for inactive creatives", () => {
    const result = resolveCreativeDecisionOsV2(row({
      activeStatus: false,
      campaignStatus: "PAUSED",
      adsetStatus: "CAMPAIGN_PAUSED",
      spend: 998,
      roas: 9.08,
      recentRoas: 6.5,
      recentPurchases: 6,
      long90Roas: 9.17,
      activeBenchmarkRoas: 3.24,
      peerMedianSpend: 163,
    }));

    expect(result.primaryDecision).not.toBe("Scale");
    expect(result.actionability).not.toBe("direct");
    expect(result.queueEligible).toBe(false);
    expect(result.applyEligible).toBe(false);
  });
});

describe("Creative Decision OS v2 gold-label evaluation", () => {
  const artifact = readGoldLabelsV0();
  const evaluation = evaluateCreativeDecisionOsV2Gold(artifact);

  it("scores the 78-row gold v0 fixture without severe Scale/Cut mismatches", () => {
    expect(evaluation.rowCount).toBe(78);
    expect(evaluation.mismatchCounts.severe).toBe(0);
    expect(evaluation.macroF1).toBeGreaterThanOrEqual(90);
    expect(evaluation.perDecision.find((row) => row.decision === "Scale")?.precision).toBe(100);
    expect(evaluation.perDecision.find((row) => row.decision === "Cut")?.precision).toBeGreaterThanOrEqual(80);
  });

  it("proves Watch and Scale Review are not v2 primary outputs on the gold fixture", () => {
    for (const goldRow of artifact.rows) {
      const result = resolveCreativeDecisionOsV2(mapGoldRowToV2Input(goldRow));
      expect(result.primaryDecision).not.toBe("Watch" as never);
      expect(result.primaryDecision).not.toBe("Scale Review" as never);
    }
    expect(evaluation.queueApplySafety.watchPrimaryCount).toBe(0);
    expect(evaluation.queueApplySafety.scaleReviewPrimaryCount).toBe(0);
  });

  it("keeps queue/apply at least as conservative as main for the v2 fixture pass", () => {
    expect(evaluation.queueApplySafety.queueEligibleCount).toBe(0);
    expect(evaluation.queueApplySafety.applyEligibleCount).toBe(0);
    expect(evaluation.queueApplySafety.directScaleCount).toBe(0);
    expect(evaluation.queueApplySafety.inactiveDirectScaleCount).toBe(0);
  });
});
