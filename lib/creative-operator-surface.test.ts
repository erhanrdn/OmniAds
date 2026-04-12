import { describe, expect, it } from "vitest";
import { buildCreativeOperatorItem, buildCreativeOperatorSurfaceModel } from "@/lib/creative-operator-surface";

function creativeDecisionOsFixture() {
  return {
    summary: {
      message: "Creative summary message.",
    },
    creatives: [
      {
        creativeId: "promote",
        name: "Promote Winner",
        familyLabel: "Winner Family",
        confidence: 0.88,
        lifecycleState: "scale_ready",
        primaryAction: "promote_to_scaling",
        summary: "Ready for controlled promotion.",
        spend: 520,
        roas: 3.4,
        purchases: 18,
        ctr: 2.4,
        previewStatus: {
          liveDecisionWindow: "ready",
          reason: null,
        },
        trust: {
          surfaceLane: "action_core",
          truthState: "live_confident",
          operatorDisposition: "standard",
          evidence: { materiality: "material" },
        },
        deployment: {
          targetLane: "Scaling",
          constraints: [],
          compatibility: { reasons: [] },
        },
        economics: {
          reasons: [],
        },
      },
      {
        creativeId: "truth",
        name: "Truth Capped",
        familyLabel: "Truth Family",
        confidence: 0.8,
        lifecycleState: "scale_ready",
        primaryAction: "promote_to_scaling",
        summary: "Looks promotable.",
        spend: 410,
        roas: 3.1,
        purchases: 12,
        ctr: 2.1,
        previewStatus: {
          liveDecisionWindow: "ready",
          reason: null,
        },
        trust: {
          surfaceLane: "watchlist",
          truthState: "degraded_missing_truth",
          operatorDisposition: "profitable_truth_capped",
          reasons: ["Commercial truth is incomplete."],
          evidence: {
            materiality: "material",
            aggressiveActionBlockReasons: ["Commercial truth is incomplete."],
          },
        },
        deployment: {
          targetLane: "Scaling",
          constraints: [],
          compatibility: { reasons: [] },
        },
        economics: {
          reasons: [],
        },
      },
      {
        creativeId: "preview",
        name: "Preview Missing",
        familyLabel: "Preview Family",
        confidence: 0.73,
        lifecycleState: "blocked",
        primaryAction: "block_deploy",
        summary: "Cannot review safely.",
        spend: 260,
        roas: 2.2,
        purchases: 6,
        ctr: 1.8,
        previewStatus: {
          liveDecisionWindow: "missing",
          reason: "No trustworthy preview media is available.",
        },
        trust: {
          surfaceLane: "watchlist",
          truthState: "live_confident",
          operatorDisposition: "review_hold",
          evidence: { materiality: "material" },
        },
        deployment: {
          targetLane: null,
          constraints: ["Preview missing."],
          compatibility: { reasons: ["Preview missing."] },
        },
        economics: {
          reasons: [],
        },
      },
      {
        creativeId: "thin",
        name: "Thin Signal",
        familyLabel: "Thin Family",
        confidence: 0.55,
        lifecycleState: "validating",
        primaryAction: "keep_in_test",
        summary: "Still validating.",
        spend: 42,
        roas: 1.5,
        purchases: 1,
        ctr: 0.9,
        previewStatus: {
          liveDecisionWindow: "ready",
          reason: null,
        },
        trust: {
          surfaceLane: "watchlist",
          truthState: "live_confident",
          operatorDisposition: "review_hold",
          evidence: { materiality: "thin_signal" },
        },
        deployment: {
          targetLane: "Testing",
          constraints: [],
          compatibility: { reasons: [] },
        },
        economics: {
          reasons: [],
        },
      },
    ],
  } as any;
}

describe("creative operator surface", () => {
  it("maps preview-blocked and truth-capped creatives into explicit operator states", () => {
    const fixture = creativeDecisionOsFixture();
    const model = buildCreativeOperatorSurfaceModel(fixture);
    expect(model).not.toBeNull();

    const needsTruth = model?.buckets.find((bucket) => bucket.key === "needs_truth");
    const blocked = model?.buckets.find((bucket) => bucket.key === "blocked");

    expect(buildCreativeOperatorItem(fixture.creatives[0])).toMatchObject({
      primaryAction: "Promote",
      authorityState: "act_now",
    });
    expect(needsTruth?.rows[0]).toMatchObject({
      id: "truth",
      primaryAction: "Needs truth",
      authorityState: "needs_truth",
    });
    expect(blocked?.rows[0]).toMatchObject({
      id: "preview",
      primaryAction: "Needs preview",
      authorityState: "blocked",
    });
    expect(model?.hiddenSummary).toContain("thin-signal");
  });
});
