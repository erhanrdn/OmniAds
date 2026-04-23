import { describe, expect, it } from "vitest";
import {
  buildCreativeOperatorItem,
  buildCreativeOperatorSurfaceModel,
  buildCreativePreviewTruthSummary,
  buildCreativeQuickFilters,
  creativeAuthorityStateLabel,
  creativeOperatorSegmentLabel,
  creativeQuickFilterShortLabel,
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

    const hold = model?.buckets.find((bucket) => bucket.key === "needs_truth");

    expect(buildCreativeOperatorItem(fixture.creatives[0])).toMatchObject({
      primaryAction: "Scale",
      authorityState: "act_now",
      authorityLabel: "Scale",
    });
    expect(hold?.label).toBe("Hold: verify");
    expect(hold?.rows[0]).toMatchObject({
      id: "truth",
      primaryAction: "Validate",
      authorityState: "needs_truth",
    });
    expect(hold?.rows[1]).toMatchObject({
      id: "preview",
      primaryAction: "Needs preview",
      authorityState: "needs_truth",
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
    expect(resolveCreativeQuickFilterKey(fixture.creatives[2])).toBe("needs_truth");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[3])).toBe("watch");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[4])).toBe("blocked");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[5])).toBe("no_action");

    const filters = buildCreativeQuickFilters(fixture);

    expect(filters.map((filter) => [filter.key, filter.count])).toEqual([
      ["act_now", 1],
      ["watch", 1],
      ["blocked", 1],
      ["needs_truth", 2],
      ["no_action", 1],
    ]);
    expect(filters.find((filter) => filter.key === "blocked")?.summary).toContain("Fatigued winners");
  });

  it("adds operator instructions that distinguish watch from scale commands", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives[0].evidenceSource = "live";
    fixture.creatives[0].operatorPolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      state: "do_now",
      segment: "scale_ready",
      actionClass: "scale",
      evidenceSource: "live",
      pushReadiness: "safe_to_queue",
      queueEligible: true,
      canApply: false,
      reasons: ["Creative evidence is material."],
      blockers: [],
      missingEvidence: [],
      requiredEvidence: ["row_provenance", "commercial_truth"],
      explanation: "Deterministic Creative policy allows this as operator work.",
    };
    fixture.creatives[0].deployment.preferredAdSetNames = ["Scale Ad Set"];
    fixture.creatives[0].deployment.preferredCampaignNames = ["Prospecting Scale"];
    fixture.creatives[3].evidenceSource = "live";
    fixture.creatives[3].operatorPolicy = {
      ...fixture.creatives[0].operatorPolicy,
      state: "watch",
      segment: "promising_under_sampled",
      actionClass: "test",
      pushReadiness: "read_only_insight",
      queueEligible: false,
      missingEvidence: ["evidence_floor"],
      requiredEvidence: ["conversion_volume"],
      explanation: "Creative is promising but under-sampled.",
    };

    const scale = buildCreativeOperatorItem(fixture.creatives[0]);
    const watch = buildCreativeOperatorItem(fixture.creatives[3]);

    expect(scale.instruction?.headline).toContain("Scale");
    expect(scale.instruction?.primaryMove).toContain("Scale Ad Set");
    expect(scale.instruction?.amountGuidance.status).toBe("unavailable");
    expect(scale.instruction?.targetContext.status).toBe("available");
    expect(scale.instruction?.targetContext.label).toContain("Scale Ad Set");
    expect(watch.instruction?.instructionKind).toBe("watch");
    expect(watch.instruction?.primaryMove).toContain("Keep watching");
    expect(watch.instruction?.urgency).toBe("watch");
    expect(watch.instruction?.invalidActions.join(" ")).toContain("Do not convert this watch read");
  });

  it("marks Creative scale targets unavailable when deployment lacks a preferred ad set", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives[0].evidenceSource = "live";
    fixture.creatives[0].operatorPolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      state: "do_now",
      segment: "scale_ready",
      actionClass: "scale",
      evidenceSource: "live",
      pushReadiness: "safe_to_queue",
      queueEligible: true,
      canApply: false,
      reasons: ["Creative evidence is material."],
      blockers: [],
      missingEvidence: [],
      requiredEvidence: ["row_provenance", "commercial_truth"],
      explanation: "Deterministic Creative policy allows this as operator work.",
    };
    fixture.creatives[0].deployment.preferredAdSetNames = [];
    fixture.creatives[0].deployment.preferredCampaignNames = [];

    const scale = buildCreativeOperatorItem(fixture.creatives[0]);

    expect(scale.instruction?.targetContext.status).toBe("unavailable");
    expect(scale.instruction?.targetContext.label).toBe("Target ad set unavailable");
    expect(scale.instruction?.targetContext.reason).toContain("review deployment context");
    expect(scale.instruction?.primaryMove).toContain("target ad set unavailable");
  });

  it("labels hold-monitor rows as watch work instead of a generic hold bucket", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives[0].evidenceSource = "live";
    fixture.creatives[0].operatorPolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      state: "watch",
      segment: "hold_monitor",
      actionClass: "monitor",
      evidenceSource: "live",
      pushReadiness: "read_only_insight",
      queueEligible: false,
      canApply: false,
      reasons: ["Continue monitoring without creating a new command."],
      blockers: [],
      missingEvidence: [],
      requiredEvidence: ["stable_next_window"],
      explanation: "This is a monitor hold, not a stop or truth block.",
    };

    const hold = buildCreativeOperatorItem(fixture.creatives[0]);

    expect(hold.primaryAction).toBe("Watch");
    expect(hold.instruction?.primaryMove).toContain("Keep watching");
    expect(hold.instruction?.nextObservation.join(" ")).toContain("stable next window");
  });

  it("maps internal creative segments to media-buyer labels", () => {
    const fixture = creativeDecisionOsFixture();
    const basePolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      state: "investigate",
      actionClass: "scale",
      evidenceSource: "live",
      pushReadiness: "operator_review_required",
      queueEligible: false,
      canApply: false,
      reasons: ["Review manually."],
      blockers: [],
      missingEvidence: [],
      requiredEvidence: ["relative_baseline"],
      explanation: "Review manually.",
    };

    fixture.creatives[0].primaryAction = "promote_to_scaling";
    fixture.creatives[0].operatorPolicy = {
      ...basePolicy,
      segment: "scale_review",
    };
    fixture.creatives[1].primaryAction = "block_deploy";
    fixture.creatives[1].operatorPolicy = {
      ...basePolicy,
      state: "do_now",
      actionClass: "kill",
      pushReadiness: "operator_review_required",
      segment: "kill_candidate",
    };
    fixture.creatives[2].operatorPolicy = {
      ...basePolicy,
      state: "watch",
      actionClass: "test",
      pushReadiness: "read_only_insight",
      segment: "creative_learning_incomplete",
    };

    expect(creativeOperatorSegmentLabel(fixture.creatives[0])).toBe("Scale Review");
    expect(buildCreativeOperatorItem(fixture.creatives[0]).primaryAction).toBe("Scale Review");
    expect(creativeOperatorSegmentLabel(fixture.creatives[1])).toBe("Cut");
    expect(buildCreativeOperatorItem(fixture.creatives[1]).primaryAction).toBe("Cut");
    expect(creativeOperatorSegmentLabel(fixture.creatives[2])).toBe("Not Enough Data");
    expect(buildCreativeOperatorItem(fixture.creatives[2]).primaryAction).toBe("Not Enough Data");
  });

  it("keeps Campaign Check, Not Enough Data, and Protect out of the hold bucket", () => {
    const fixture = creativeDecisionOsFixture();
    const basePolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      actionClass: "monitor",
      evidenceSource: "live",
      pushReadiness: "blocked_from_push",
      queueEligible: false,
      canApply: false,
      reasons: ["Review before action."],
      blockers: ["Campaign or ad set context limits this creative interpretation."],
      missingEvidence: ["campaign_or_adset_context"],
      requiredEvidence: ["campaign_or_adset_context"],
      explanation: "Campaign or ad set context limits this creative interpretation.",
    };

    fixture.creatives[0].operatorPolicy = {
      ...basePolicy,
      state: "blocked",
      segment: "investigate",
    };
    fixture.creatives[1].operatorPolicy = {
      ...basePolicy,
      state: "watch",
      segment: "creative_learning_incomplete",
      blockers: [],
      missingEvidence: ["evidence_floor"],
      requiredEvidence: ["evidence_floor"],
    };
    fixture.creatives[2].operatorPolicy = {
      ...basePolicy,
      state: "do_not_touch",
      segment: "protected_winner",
      blockers: [],
      missingEvidence: [],
      requiredEvidence: ["stable_winner"],
    };

    const campaignCheck = buildCreativeOperatorItem(fixture.creatives[0]);
    const notEnoughData = buildCreativeOperatorItem(fixture.creatives[1]);
    const protect = buildCreativeOperatorItem(fixture.creatives[2]);

    expect(campaignCheck).toMatchObject({
      primaryAction: "Campaign Check",
      authorityState: "blocked",
    });
    expect(notEnoughData).toMatchObject({
      primaryAction: "Not Enough Data",
      authorityState: "watch",
    });
    expect(protect).toMatchObject({
      primaryAction: "Protect",
      authorityState: "no_action",
    });
    expect(campaignCheck.authorityState).not.toBe("needs_truth");
    expect(notEnoughData.authorityState).not.toBe("needs_truth");
    expect(protect.authorityState).not.toBe("needs_truth");
  });

  it("uses frequency pressure to raise fatigued winner urgency without changing safety gates", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives[0].primaryAction = "refresh_replace";
    fixture.creatives[0].lifecycleState = "fatigued_winner";
    fixture.creatives[0].fatigue = {
      status: "fatigued",
      confidence: 0.84,
      ctrDecay: null,
      clickToPurchaseDecay: null,
      roasDecay: null,
      spendConcentration: null,
      frequencyPressure: 3.4,
      winnerMemory: true,
      evidence: ["Frequency pressure is high."],
      missingContext: [],
    };
    fixture.creatives[0].operatorPolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      state: "do_now",
      segment: "fatigued_winner",
      actionClass: "refresh",
      evidenceSource: "live",
      pushReadiness: "operator_review_required",
      queueEligible: false,
      canApply: false,
      reasons: ["Frequency pressure is high."],
      blockers: [],
      missingEvidence: [],
      requiredEvidence: ["row_provenance"],
      explanation: "Request a creative refresh review.",
    };

    const refresh = buildCreativeOperatorItem(fixture.creatives[0]);

    expect(refresh.instruction?.urgency).toBe("high");
    expect(refresh.instruction?.urgencyReason).toContain("Frequency pressure");
    expect(refresh.instruction?.queueEligible).toBe(false);
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
    expect(creativeAuthorityStateLabel("watch")).toBe("Test");
    expect(creativeAuthorityStateLabel("no_action")).toBe("Evergreen");
    expect(creativeAuthorityStateLabel("needs_truth")).toBe("Hold: verify");
    expect(creativeAuthorityStateLabel("blocked")).toBe("Refresh");
  });

  it("exposes concise labels for performance quick filters in the top toolbar", () => {
    expect(creativeQuickFilterShortLabel("act_now")).toBe("Scale");
    expect(creativeQuickFilterShortLabel("watch")).toBe("Test");
    expect(creativeQuickFilterShortLabel("blocked")).toBe("Refresh");
    expect(creativeQuickFilterShortLabel("needs_truth")).toBe("Hold");
    expect(creativeQuickFilterShortLabel("no_action")).toBe("Evergreen");
  });
});
