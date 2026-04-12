import { describe, expect, it } from "vitest";
import {
  buildCreativeOperatorItem,
  buildCreativeOperatorSurfaceModel,
  buildCreativePreviewTruthSummary,
  buildCreativeQuickFilters,
  creativeAuthorityStateLabel,
  resolveCreativeQuickFilterKey,
} from "@/lib/creative-operator-surface";

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
      primaryAction: "Promote now",
      authorityState: "act_now",
      authorityLabel: "Act now",
    });
    expect(needsTruth?.rows[0]).toMatchObject({
      id: "truth",
      primaryAction: "Needs truth",
      authorityState: "needs_truth",
    });
    expect(blocked?.rows[0]).toMatchObject({
      id: "preview",
      primaryAction: "Preview missing",
      authorityState: "blocked",
    });
    expect(model?.hiddenSummary).toContain("thin-signal");
  });

  it("builds quick filters from the unified Creative authority model", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives.push({
      creativeId: "pause",
      name: "Fatigued Winner",
      familyLabel: "Refresh Family",
      confidence: 0.79,
      lifecycleState: "fatigued_winner",
      primaryAction: "refresh_replace",
      summary: "Fatigue is visible and replacement is safer.",
      spend: 360,
      roas: 1.8,
      purchases: 7,
      ctr: 1.4,
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
        targetLane: "Testing",
        constraints: [],
        compatibility: { reasons: [] },
      },
      economics: {
        reasons: [],
      },
    });
    fixture.creatives.push({
      creativeId: "protected",
      name: "Protected Winner",
      familyLabel: "Protected Family",
      confidence: 0.84,
      lifecycleState: "stable_winner",
      primaryAction: "hold_no_touch",
      summary: "Keep this winner protected.",
      spend: 600,
      roas: 3.9,
      purchases: 22,
      ctr: 2.7,
      previewStatus: {
        liveDecisionWindow: "ready",
        reason: null,
      },
      trust: {
        surfaceLane: "watchlist",
        truthState: "live_confident",
        operatorDisposition: "protected_watchlist",
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
    });

    expect(resolveCreativeQuickFilterKey(fixture.creatives[0])).toBe("act_now");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[1])).toBe("needs_truth");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[2])).toBe("blocked");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[3])).toBe("watch");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[4])).toBe("act_now");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[5])).toBe("no_action");

    const filters = buildCreativeQuickFilters(fixture);

    expect(filters.map((filter) => [filter.key, filter.count])).toEqual([
      ["act_now", 2],
      ["needs_truth", 1],
      ["watch", 1],
      ["blocked", 1],
      ["no_action", 1],
    ]);
    expect(filters.find((filter) => filter.key === "blocked")?.summary).toContain("Preview");
  });

  it("builds explicit preview truth summaries for the current review scope", () => {
    const fixture = creativeDecisionOsFixture();

    const overall = buildCreativePreviewTruthSummary(fixture);
    const scoped = buildCreativePreviewTruthSummary(fixture, {
      creativeIds: ["preview"],
    });

    expect(overall).toMatchObject({
      state: "degraded",
      readyCount: 3,
      missingCount: 1,
    });
    expect(scoped).toMatchObject({
      state: "missing",
      headline: "Preview truth is missing across this review scope.",
    });
    expect(creativeAuthorityStateLabel("watch")).toBe("Keep testing");
    expect(creativeAuthorityStateLabel("no_action")).toBe("Protected");
  });
});
