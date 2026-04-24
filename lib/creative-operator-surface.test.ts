import { describe, expect, it } from "vitest";
import {
  buildCreativeOperatorItem,
  buildCreativeOperatorSurfaceModel,
  buildCreativePreviewTruthSummary,
  buildCreativeQuickFilters,
  buildCreativeTaxonomyCounts,
  creativeAuthorityStateLabel,
  creativeBenchmarkReliabilityLabel,
  creativeBusinessValidationNote,
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
    expect(hold?.label).toBe("Not eligible for evaluation");
    expect(hold?.rows[0]).toMatchObject({
      id: "truth",
      primaryAction: "Scale Review",
      authorityState: "needs_truth",
    });
    expect(hold?.rows[1]).toMatchObject({
      id: "preview",
      primaryAction: "Not eligible for evaluation",
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
      reasons: [],
      blockers: [],
      missingEvidence: [],
      requiredEvidence: [],
      explanation: "Scale.",
    };
    fixture.creatives[1].operatorPolicy = {
      ...fixture.creatives[0].operatorPolicy,
      state: "investigate",
      segment: "scale_review",
      pushReadiness: "operator_review_required",
      queueEligible: false,
      explanation: "Review.",
    };
    fixture.creatives[2].operatorPolicy = {
      ...fixture.creatives[0].operatorPolicy,
      state: "blocked",
      segment: "blocked",
      actionClass: "contextual",
      pushReadiness: "blocked_from_push",
      queueEligible: false,
      explanation: "Not eligible.",
    };
    fixture.creatives[3].operatorPolicy = {
      ...fixture.creatives[0].operatorPolicy,
      state: "watch",
      segment: "creative_learning_incomplete",
      actionClass: "test",
      pushReadiness: "read_only_insight",
      queueEligible: false,
      explanation: "Thin.",
    };
    fixture.creatives[4].operatorPolicy = {
      ...fixture.creatives[0].operatorPolicy,
      state: "investigate",
      segment: "fatigued_winner",
      actionClass: "refresh",
      pushReadiness: "operator_review_required",
      queueEligible: false,
      explanation: "Refresh.",
    };
    fixture.creatives[5].operatorPolicy = {
      ...fixture.creatives[0].operatorPolicy,
      state: "do_not_touch",
      segment: "protected_winner",
      actionClass: "protect",
      pushReadiness: "blocked_from_push",
      queueEligible: false,
      explanation: "Protect.",
    };

    expect(resolveCreativeQuickFilterKey(fixture.creatives[0])).toBe("scale");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[1])).toBe("scale_review");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[2])).toBeNull();
    expect(resolveCreativeQuickFilterKey(fixture.creatives[3])).toBe("not_enough_data");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[4])).toBe("refresh");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[5])).toBe("protect");

    const filters = buildCreativeQuickFilters(fixture);

    expect(filters.map((filter) => [filter.key, filter.count])).toEqual([
      ["scale", 1],
      ["scale_review", 1],
      ["protect", 1],
      ["refresh", 1],
      ["not_enough_data", 1],
    ]);
    expect(filters.find((filter) => filter.key === "refresh")?.summary).toContain("new angle");

    const visibleFilters = buildCreativeQuickFilters(fixture, {
      visibleIds: new Set(["promote", "thin"]),
      includeZeroCounts: true,
    });
    const visibleCounts = Object.fromEntries(
      visibleFilters.map((filter) => [filter.key, filter.count]),
    );

    expect(visibleCounts).toMatchObject({
      scale: 1,
      scale_review: 0,
      test_more: 0,
      protect: 0,
      refresh: 0,
      not_enough_data: 1,
    });
    expect(visibleFilters.find((filter) => filter.key === "scale")?.creativeIds).toEqual(["promote"]);
    expect(visibleFilters.find((filter) => filter.key === "not_enough_data")?.creativeIds).toEqual(["thin"]);
    expect(creativeOperatorSegmentLabel(fixture.creatives[1])).toBe("Scale Review");

    fixture.summary.keepTestingCount = 99;
    fixture.summary.blockedCount = 88;
    const taxonomyCounts = buildCreativeTaxonomyCounts(fixture, {
      quickFilters: visibleFilters,
    });

    expect(taxonomyCounts.map((filter) => [filter.key, filter.count])).toEqual([
      ["scale", 1],
      ["scale_review", 0],
      ["test_more", 0],
      ["protect", 0],
      ["watch", 0],
      ["refresh", 0],
      ["retest", 0],
      ["cut", 0],
      ["campaign_check", 0],
      ["not_enough_data", 1],
    ]);
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
    expect(scale.reason).toContain("Business validation supports a controlled scale move.");
    expect(scale.instruction?.primaryMove).toContain("Scale Ad Set");
    expect(scale.instruction?.amountGuidance.status).toBe("unavailable");
    expect(scale.instruction?.targetContext.status).toBe("available");
    expect(scale.instruction?.targetContext.label).toContain("Scale Ad Set");
    expect(watch.instruction?.instructionKind).toBe("watch");
    expect(watch.instruction?.primaryMove).toContain("Keep testing");
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

  it("keeps relative winners in Watch when business validation does not support direct scale", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives[0].evidenceSource = "live";
    fixture.creatives[0].relativeBaseline = {
      scope: "account",
      benchmarkKey: "account:all",
      scopeId: null,
      scopeLabel: "Account-wide",
      source: "account_default",
      reliability: "strong",
      sampleSize: 6,
      creativeCount: 6,
      eligibleCreativeCount: 6,
      spendBasis: 960,
      purchaseBasis: 30,
      weightedRoas: 1.75,
      weightedCpa: 32,
      medianRoas: 1.7,
      medianCpa: 24,
      medianSpend: 160,
      missingContext: [],
    };
    fixture.creatives[0].benchmarkScope = "account";
    fixture.creatives[0].benchmarkScopeLabel = "Account-wide";
    fixture.creatives[0].benchmarkReliability = "strong";
    fixture.creatives[0].operatorPolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      state: "watch",
      segment: "hold_monitor",
      actionClass: "monitor",
      evidenceSource: "live",
      pushReadiness: "blocked_from_push",
      queueEligible: false,
      canApply: false,
      reasons: ["Business targets are not cleared yet."],
      blockers: ["Business validation does not yet support a direct scale move."],
      missingEvidence: ["business_validation"],
      requiredEvidence: ["business_validation", "relative_baseline"],
      explanation: "Business validation does not yet support direct scale.",
    };

    const watch = buildCreativeOperatorItem(fixture.creatives[0]);

    expect(watch.primaryAction).toBe("Watch");
    expect(watch.authorityState).toBe("watch");
    expect(watch.reason).toContain("Promising relative performer against the Account-wide benchmark.");
    expect(watch.reason).toContain("Business validation does not support a direct scale move yet.");
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

  it("keeps Scale Review rows review-only until business evidence clears", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives[0].operatorPolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      state: "investigate",
      segment: "scale_review",
      actionClass: "scale",
      evidenceSource: "live",
      pushReadiness: "operator_review_required",
      queueEligible: false,
      canApply: false,
      reasons: ["Missing commercial input: target_pack"],
      blockers: [],
      missingEvidence: ["commercial_truth"],
      requiredEvidence: ["commercial_truth", "relative_baseline"],
      explanation: "Review manually before any scale move.",
    };
    fixture.creatives[0].benchmarkScope = "account";
    fixture.creatives[0].benchmarkScopeLabel = "Account-wide";
    fixture.creatives[0].benchmarkReliability = "strong";
    fixture.creatives[0].trust.truthState = "degraded_missing_truth";
    fixture.creatives[0].trust.operatorDisposition = "profitable_truth_capped";

    const review = buildCreativeOperatorItem(fixture.creatives[0]);

    expect(review.primaryAction).toBe("Scale Review");
    expect(review.authorityState).toBe("watch");
    expect(review.authorityLabel).toBe("Scale Review");
    expect(review.reason).toContain("Strong relative performer against the Account-wide benchmark.");
    expect(review.reason).toContain("Business validation is still missing");
    expect(review.instruction?.queueEligible).toBe(false);
    expect(review.instruction?.canApply).toBe(false);
    expect(review.instruction?.headline).toBe("Scale Review: Promote Winner");
    expect(review.instruction?.primaryMove).toContain("relative winner before any scale move");
    expect(resolveCreativeQuickFilterKey(fixture.creatives[0])).toBe("scale_review");
  });

  it("formats benchmark reliability and business-validation messaging without hiding relative strength", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives[0].operatorPolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      state: "investigate",
      segment: "scale_review",
      actionClass: "scale",
      evidenceSource: "live",
      pushReadiness: "operator_review_required",
      queueEligible: false,
      canApply: false,
      reasons: ["Missing commercial input: target_pack"],
      blockers: [],
      missingEvidence: ["commercial_truth"],
      requiredEvidence: ["commercial_truth", "relative_baseline"],
      explanation: "Review manually before any scale move.",
    };
    fixture.creatives[0].benchmarkScope = "campaign";
    fixture.creatives[0].benchmarkScopeLabel = "Spring Prospecting";
    fixture.creatives[0].benchmarkReliability = "medium";
    fixture.creatives[0].trust.truthState = "degraded_missing_truth";
    fixture.creatives[0].trust.operatorDisposition = "profitable_truth_capped";

    expect(creativeBenchmarkReliabilityLabel("strong")).toBe("Strong");
    expect(creativeBenchmarkReliabilityLabel("medium")).toBe("Medium");
    expect(creativeBenchmarkReliabilityLabel("weak")).toBe("Thin");
    expect(creativeBusinessValidationNote(fixture.creatives[0])).toBe(
      "Business validation is still missing, so this stays review-only.",
    );
    expect(buildCreativeOperatorItem(fixture.creatives[0]).reason).toContain(
      "Spring Prospecting benchmark",
    );
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
      authorityLabel: "Campaign Check",
    });
    expect(notEnoughData).toMatchObject({
      primaryAction: "Not Enough Data",
      authorityState: "watch",
    });
    expect(protect).toMatchObject({
      primaryAction: "Protect",
      authorityState: "no_action",
      authorityLabel: "Protect",
    });
    expect(campaignCheck.authorityState).not.toBe("needs_truth");
    expect(notEnoughData.authorityState).not.toBe("needs_truth");
    expect(protect.authorityState).not.toBe("needs_truth");
  });

  it("aligns row labels with explicit operator segment buckets", () => {
    const fixture = creativeDecisionOsFixture();
    const basePolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      evidenceSource: "live",
      queueEligible: false,
      canApply: false,
      reasons: ["Review before action."],
      blockers: [],
      missingEvidence: [],
      requiredEvidence: ["row_provenance"],
      explanation: "Review before action.",
    };

    fixture.creatives[0].operatorPolicy = {
      ...basePolicy,
      state: "blocked",
      segment: "investigate",
      actionClass: "monitor",
      pushReadiness: "blocked_from_push",
      blockers: ["Campaign or ad set context limits this creative interpretation."],
      missingEvidence: ["campaign_or_adset_context"],
      requiredEvidence: ["campaign_or_adset_context"],
    };
    fixture.creatives[1].operatorPolicy = {
      ...basePolicy,
      state: "watch",
      segment: "promising_under_sampled",
      actionClass: "test",
      pushReadiness: "blocked_from_push",
      missingEvidence: ["evidence_floor"],
      requiredEvidence: ["evidence_floor"],
      explanation: "Promising but still under-sampled.",
    };
    fixture.creatives[2].operatorPolicy = {
      ...basePolicy,
      state: "watch",
      segment: "creative_learning_incomplete",
      actionClass: "test",
      pushReadiness: "blocked_from_push",
      missingEvidence: ["evidence_floor"],
      requiredEvidence: ["evidence_floor"],
      explanation: "Signal is still too thin.",
    };
    fixture.creatives[3].operatorPolicy = {
      ...basePolicy,
      state: "watch",
      segment: "hold_monitor",
      actionClass: "monitor",
      pushReadiness: "blocked_from_push",
      missingEvidence: ["commercial_truth"],
      requiredEvidence: ["commercial_truth"],
      explanation: "Relative strength exists, but absolute proof is incomplete.",
    };
    fixture.creatives.push({
      ...fixture.creatives[0],
      creativeId: "refresh",
      name: "Fatigued Winner",
      lifecycleState: "fatigued_winner",
      primaryAction: "refresh_replace",
      operatorPolicy: {
        ...basePolicy,
        state: "investigate",
        segment: "fatigued_winner",
        actionClass: "refresh",
        pushReadiness: "operator_review_required",
        explanation: "Refresh the fatigued winner.",
      },
    });
    fixture.creatives.push({
      ...fixture.creatives[0],
      creativeId: "protect",
      name: "Stable Winner",
      lifecycleState: "stable_winner",
      primaryAction: "hold_no_touch",
      operatorPolicy: {
        ...basePolicy,
        state: "do_not_touch",
        segment: "protected_winner",
        actionClass: "protect",
        pushReadiness: "blocked_from_push",
        explanation: "Keep the winner protected.",
      },
    });
    fixture.creatives.push({
      ...fixture.creatives[0],
      creativeId: "retest",
      name: "Comeback Candidate",
      lifecycleState: "comeback_candidate",
      primaryAction: "retest_comeback",
      operatorPolicy: {
        ...basePolicy,
        state: "investigate",
        segment: "needs_new_variant",
        actionClass: "refresh",
        pushReadiness: "operator_review_required",
        explanation: "Retest the comeback candidate.",
      },
    });
    fixture.creatives.push({
      ...fixture.creatives[0],
      creativeId: "ineligible",
      name: "Policy Blocked",
      operatorPolicy: {
        ...basePolicy,
        state: "blocked",
        segment: "blocked",
        actionClass: "contextual",
        pushReadiness: "blocked_from_push",
        blockers: ["Missing decision provenance."],
        missingEvidence: ["row_provenance"],
        requiredEvidence: ["row_provenance"],
        explanation: "Missing decision provenance.",
      },
    });

    const campaignCheck = buildCreativeOperatorItem(fixture.creatives[0]);
    const testMore = buildCreativeOperatorItem(fixture.creatives[1]);
    const notEnoughData = buildCreativeOperatorItem(fixture.creatives[2]);
    const watch = buildCreativeOperatorItem(fixture.creatives[3]);
    const refresh = buildCreativeOperatorItem(fixture.creatives[4]);
    const protect = buildCreativeOperatorItem(fixture.creatives[5]);
    const retest = buildCreativeOperatorItem(fixture.creatives[6]);
    const blocked = buildCreativeOperatorItem(fixture.creatives[7]);
    const model = buildCreativeOperatorSurfaceModel(fixture);

    expect(campaignCheck).toMatchObject({
      primaryAction: "Campaign Check",
      authorityState: "blocked",
      authorityLabel: "Campaign Check",
    });
    expect(testMore).toMatchObject({
      primaryAction: "Test More",
      authorityState: "watch",
      authorityLabel: "Test More",
    });
    expect(notEnoughData).toMatchObject({
      primaryAction: "Not Enough Data",
      authorityState: "watch",
      authorityLabel: "Not Enough Data",
    });
    expect(watch).toMatchObject({
      primaryAction: "Watch",
      authorityState: "watch",
      authorityLabel: "Watch",
    });
    expect(refresh).toMatchObject({
      primaryAction: "Refresh",
      authorityState: "blocked",
      authorityLabel: "Refresh",
    });
    expect(protect).toMatchObject({
      primaryAction: "Protect",
      authorityState: "no_action",
      authorityLabel: "Protect",
    });
    expect(retest).toMatchObject({
      primaryAction: "Retest",
      authorityState: "blocked",
      authorityLabel: "Retest",
    });
    expect(blocked).toMatchObject({
      primaryAction: "Not eligible for evaluation",
      authorityState: "needs_truth",
      authorityLabel: "Not eligible for evaluation",
    });
    expect(model?.buckets.map((bucket) => bucket.label)).toEqual([
      "Scale Review / Test More / Watch / Not Enough Data",
      "Refresh / Retest / Cut / Campaign Check",
      "Not eligible for evaluation",
      "Protect",
    ]);
  });

  it("explains mature zero-purchase weak rows as Watch instead of early learning", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives = fixture.creatives.slice(0, 1);
    fixture.creatives[0] = {
      ...fixture.creatives[0],
      primaryAction: "keep_in_test",
      lifecycleState: "validating",
      spend: 360,
      roas: 0,
      purchases: 0,
      impressions: 18_000,
      creativeAgeDays: 18,
      summary: "Still under observation.",
      operatorPolicy: {
        contractVersion: "operator-policy.v1",
        policyVersion: "creative-operator-policy.v1",
        state: "watch",
        segment: "hold_monitor",
        actionClass: "monitor",
        evidenceSource: "live",
        pushReadiness: "read_only_insight",
        queueEligible: false,
        canApply: false,
        reasons: ["Conversion proof is still missing."],
        blockers: [],
        missingEvidence: [],
        requiredEvidence: ["row_provenance"],
        explanation: "Watch this mature weak case.",
      },
    };

    const watch = buildCreativeOperatorItem(fixture.creatives[0]);

    expect(watch.primaryAction).toBe("Watch");
    expect(watch.authorityState).toBe("watch");
    expect(watch.reason).toContain("move past early learning");
    expect(watch.reason).toContain("no purchase proof");
    expect(watch.instruction?.primaryMove).toContain("Confirm purchase evidence before extending this test.");
  });

  it("adds a fatigue caveat to Test More without changing the main outcome", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives = fixture.creatives.slice(0, 1);
    fixture.creatives[0] = {
      ...fixture.creatives[0],
      primaryAction: "keep_in_test",
      lifecycleState: "validating",
      spend: 110,
      roas: 2.4,
      purchases: 2,
      impressions: 5_800,
      creativeAgeDays: 12,
      summary: "Promising but still light.",
      fatigue: {
        status: "watch",
        confidence: 0.64,
        ctrDecay: null,
        clickToPurchaseDecay: null,
        roasDecay: null,
        spendConcentration: null,
        frequencyPressure: 2.4,
        winnerMemory: false,
        evidence: ["Frequency pressure is rising."],
        missingContext: [],
      },
      operatorPolicy: {
        contractVersion: "operator-policy.v1",
        policyVersion: "creative-operator-policy.v1",
        state: "watch",
        segment: "promising_under_sampled",
        actionClass: "test",
        evidenceSource: "live",
        pushReadiness: "read_only_insight",
        queueEligible: false,
        canApply: false,
        reasons: ["Promising but still under-sampled."],
        blockers: [],
        missingEvidence: ["evidence_floor"],
        requiredEvidence: ["evidence_floor"],
        explanation: "Keep testing while evidence matures.",
      },
    };

    const testMore = buildCreativeOperatorItem(fixture.creatives[0]);

    expect(testMore.primaryAction).toBe("Test More");
    expect(testMore.authorityState).toBe("watch");
    expect(testMore.reason).toContain("watching fatigue pressure");
    expect(testMore.instruction?.primaryMove).toContain("watch fatigue pressure");
    expect(testMore.instruction?.queueEligible).toBe(false);
  });

  it("does not attach a fatigue caveat to Test More when frequency is only unavailable", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives = fixture.creatives.slice(0, 1);
    fixture.creatives[0] = {
      ...fixture.creatives[0],
      primaryAction: "keep_in_test",
      lifecycleState: "validating",
      spend: 110,
      roas: 2.4,
      purchases: 2,
      impressions: 5_800,
      creativeAgeDays: 12,
      summary: "Promising but still light.",
      fatigue: {
        status: "none",
        confidence: 0.18,
        ctrDecay: null,
        clickToPurchaseDecay: null,
        roasDecay: null,
        spendConcentration: null,
        frequencyPressure: null,
        winnerMemory: false,
        evidence: [],
        missingContext: ["Frequency unavailable"],
      },
      operatorPolicy: {
        contractVersion: "operator-policy.v1",
        policyVersion: "creative-operator-policy.v1",
        state: "watch",
        segment: "promising_under_sampled",
        actionClass: "test",
        evidenceSource: "live",
        pushReadiness: "read_only_insight",
        queueEligible: false,
        canApply: false,
        reasons: ["Promising but still under-sampled."],
        blockers: [],
        missingEvidence: ["evidence_floor"],
        requiredEvidence: ["evidence_floor"],
        explanation: "Keep testing while evidence matures.",
      },
    };

    const testMore = buildCreativeOperatorItem(fixture.creatives[0]);

    expect(testMore.primaryAction).toBe("Test More");
    expect(testMore.authorityState).toBe("watch");
    expect(testMore.reason).not.toContain("watching fatigue pressure");
    expect(testMore.instruction?.primaryMove).not.toContain("watch fatigue pressure");
    expect(testMore.instruction?.nextObservation.join(" ")).toContain("Frequency unavailable");
  });

  it("does not label policy or contextual ineligible rows as Not Enough Data", () => {
    const fixture = creativeDecisionOsFixture();
    const basePolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      actionClass: "contextual",
      evidenceSource: "live",
      pushReadiness: "blocked_from_push",
      queueEligible: false,
      canApply: false,
      reasons: ["Missing decision provenance."],
      blockers: ["Missing decision provenance."],
      missingEvidence: ["row_provenance"],
      requiredEvidence: ["row_provenance"],
      explanation: "Missing decision provenance.",
    };

    fixture.creatives[0].operatorPolicy = {
      ...basePolicy,
      state: "blocked",
      segment: "blocked",
    };
    fixture.creatives[1].operatorPolicy = {
      ...basePolicy,
      state: "contextual_only",
      segment: "contextual_only",
      evidenceSource: "snapshot",
      blockers: ["snapshot evidence is contextual and cannot authorize primary Creative action."],
    };
    fixture.creatives[2].operatorPolicy = {
      ...basePolicy,
      state: "watch",
      segment: "creative_learning_incomplete",
      actionClass: "test",
      evidenceSource: "live",
      blockers: [],
      missingEvidence: ["evidence_floor"],
      requiredEvidence: ["evidence_floor"],
      explanation: "Creative evidence is thin.",
    };

    const blocked = buildCreativeOperatorItem(fixture.creatives[0]);
    const contextual = buildCreativeOperatorItem(fixture.creatives[1]);
    const thin = buildCreativeOperatorItem(fixture.creatives[2]);

    expect(blocked.primaryAction).toBe("Not eligible for evaluation");
    expect(contextual.primaryAction).toBe("Not eligible for evaluation");
    expect(thin.primaryAction).toBe("Not Enough Data");
    expect(blocked.secondaryLabels).toContain("Not eligible for evaluation");
    expect(contextual.secondaryLabels).toContain("Not eligible for evaluation");
    expect(thin.secondaryLabels).toContain("Not Enough Data");
  });

  it("uses explicit operator language when blocked rows are context checks or refresh reviews", () => {
    const fixture = creativeDecisionOsFixture();
    fixture.creatives = fixture.creatives.slice(0, 1);
    fixture.creatives[0].operatorPolicy = {
      contractVersion: "operator-policy.v1",
      policyVersion: "creative-operator-policy.v1",
      state: "blocked",
      segment: "investigate",
      actionClass: "monitor",
      evidenceSource: "live",
      pushReadiness: "blocked_from_push",
      queueEligible: false,
      canApply: false,
      reasons: ["Campaign context is missing."],
      blockers: ["Campaign or ad set context limits this creative interpretation."],
      missingEvidence: ["campaign_or_adset_context"],
      requiredEvidence: ["campaign_or_adset_context"],
      explanation: "Campaign context is missing.",
    };

    const model = buildCreativeOperatorSurfaceModel(fixture);

    expect(model?.headline).toBe("1 creative needs refresh, cut, retest, or campaign-context work.");
    expect(model?.buckets[0]).toMatchObject({
      key: "blocked",
      label: "Refresh / Retest / Cut / Campaign Check",
    });
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
    expect(creativeAuthorityStateLabel("watch")).toBe("Scale Review / Test More / Watch / Not Enough Data");
    expect(creativeAuthorityStateLabel("no_action")).toBe("Protect");
    expect(creativeAuthorityStateLabel("needs_truth")).toBe("Not eligible");
    expect(creativeAuthorityStateLabel("blocked")).toBe("Refresh / Retest / Cut / Campaign Check");
  });

  it("exposes agreed operator taxonomy labels for performance quick filters", () => {
    const labels = [
      "scale",
      "scale_review",
      "test_more",
      "protect",
      "watch",
      "refresh",
      "retest",
      "cut",
      "campaign_check",
      "not_enough_data",
    ].map((key) => creativeQuickFilterShortLabel(key as any));

    expect(labels).toEqual([
      "Scale",
      "Scale Review",
      "Test More",
      "Protect",
      "Watch",
      "Refresh",
      "Retest",
      "Cut",
      "Campaign Check",
      "Not Enough Data",
    ]);
    expect(labels).not.toEqual(expect.arrayContaining(["Review", "Check", "Hold", "Evergreen"]));
  });
});
