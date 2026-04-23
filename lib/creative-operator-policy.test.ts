import { describe, expect, it } from "vitest";
import { assessCreativeOperatorPolicy } from "@/lib/creative-operator-policy";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";
import { buildOperatorDecisionProvenance } from "@/lib/operator-decision-provenance";
import type { DecisionTrustMetadata } from "@/src/types/decision-trust";

function provenance() {
  const metadata = buildOperatorDecisionMetadata({
    analyticsStartDate: "2026-04-01",
    analyticsEndDate: "2026-04-10",
    decisionAsOf: "2026-04-10",
  });
  return buildOperatorDecisionProvenance({
    businessId: "biz",
    decisionAsOf: metadata.decisionAsOf,
    analyticsWindow: metadata.analyticsWindow,
    reportingRange: {
      startDate: "2026-04-01",
      endDate: "2026-04-10",
    },
    sourceWindow: metadata.decisionWindows.primary30d,
    sourceRowScope: {
      system: "creative",
      entityType: "creative",
      entityId: "creative-1",
    },
    sourceDecisionId: "creative:creative-1",
    recommendedAction: "promote_to_scaling",
    evidence: {
      lifecycleState: "scale_ready",
      primaryAction: "promote_to_scaling",
      spend: 500,
      purchases: 12,
    },
  });
}

function trust(overrides: Partial<DecisionTrustMetadata> = {}): DecisionTrustMetadata {
  return {
    surfaceLane: "action_core",
    truthState: "live_confident",
    operatorDisposition: "standard",
    reasons: ["Creative evidence is material."],
    evidence: {
      materiality: "material",
      entityState: "active",
      completeness: "complete",
      freshness: {
        status: "fresh",
        updatedAt: "2026-04-10T00:00:00.000Z",
        reason: null,
      },
      suppressed: false,
      suppressionReasons: [],
      aggressiveActionBlocked: false,
      aggressiveActionBlockReasons: [],
    },
    ...overrides,
  };
}

function baseInput() {
  return {
    lifecycleState: "scale_ready" as const,
    primaryAction: "promote_to_scaling" as const,
    trust: trust(),
    provenance: provenance(),
    evidenceSource: "live" as const,
    commercialTruthConfigured: true,
    commercialMissingInputs: [],
    benchmark: {
      sampleSize: 4,
      missingContext: [],
    },
    fatigue: {
      status: "none" as const,
      confidence: 0.72,
      evidence: [],
    },
    economics: {
      status: "eligible" as const,
      reasons: [],
    },
    deployment: {
      targetLane: "Scaling",
      queueVerdict: "queue_ready" as const,
      constraints: [],
      compatibility: {
        status: "compatible" as const,
        reasons: [],
      },
    },
    previewStatus: {
      liveDecisionWindow: "ready" as const,
      selectedWindow: "ready" as const,
      reason: null,
    },
    supportingMetrics: {
      spend: 500,
      purchases: 12,
      impressions: 22_000,
      roas: 3.4,
      cpa: 22,
      frequency: 1.8,
      creativeAgeDays: 24,
    },
  };
}

describe("assessCreativeOperatorPolicy", () => {
  it("allows only high-evidence live scale candidates into safe queue", () => {
    const policy = assessCreativeOperatorPolicy(baseInput());

    expect(policy).toMatchObject({
      segment: "scale_ready",
      state: "do_now",
      actionClass: "scale",
      pushReadiness: "safe_to_queue",
      queueEligible: true,
      canApply: false,
    });
  });

  it("downgrades tiny-spend ROAS spikes instead of marking them scale-ready", () => {
    const policy = assessCreativeOperatorPolicy({
      ...baseInput(),
      supportingMetrics: {
        spend: 2,
        purchases: 1,
        impressions: 300,
        roas: 24,
        cpa: 2,
        creativeAgeDays: 2,
      },
    });

    expect(policy.segment).toBe("false_winner_low_evidence");
    expect(policy.state).toBe("watch");
    expect(policy.pushReadiness).not.toBe("safe_to_queue");
    expect(policy.missingEvidence).toContain("evidence_floor");
  });

  it("requires sufficient evidence and commercial truth before kill candidates become primary work", () => {
    const policy = assessCreativeOperatorPolicy({
      ...baseInput(),
      lifecycleState: "blocked",
      primaryAction: "block_deploy",
      economics: {
        status: "blocked",
        reasons: ["CPA is above ceiling."],
      },
      supportingMetrics: {
        spend: 520,
        purchases: 5,
        impressions: 34_000,
        roas: 0.6,
        cpa: 104,
        creativeAgeDays: 31,
      },
    });

    expect(policy.segment).toBe("kill_candidate");
    expect(policy.state).toBe("do_now");
    expect(policy.pushReadiness).toBe("operator_review_required");
    expect(policy.canApply).toBe(false);
  });

  it("keeps low-spend no-conversion losers in learning instead of kill", () => {
    const policy = assessCreativeOperatorPolicy({
      ...baseInput(),
      lifecycleState: "blocked",
      primaryAction: "block_deploy",
      supportingMetrics: {
        spend: 42,
        purchases: 0,
        impressions: 2_400,
        roas: 0,
        cpa: 0,
        creativeAgeDays: 4,
      },
    });

    expect(policy.segment).toBe("creative_learning_incomplete");
    expect(policy.state).toBe("watch");
    expect(policy.pushReadiness).toBe("blocked_from_push");
  });

  it("protects winners instead of turning short-term volatility into kill work", () => {
    const policy = assessCreativeOperatorPolicy({
      ...baseInput(),
      lifecycleState: "stable_winner",
      primaryAction: "hold_no_touch",
      trust: trust({
        surfaceLane: "watchlist",
        operatorDisposition: "protected_watchlist",
      }),
    });

    expect(policy.segment).toBe("protected_winner");
    expect(policy.state).toBe("do_not_touch");
    expect(policy.pushReadiness).toBe("blocked_from_push");
  });

  it("blocks aggressive creative action when commercial truth is missing", () => {
    const policy = assessCreativeOperatorPolicy({
      ...baseInput(),
      commercialTruthConfigured: false,
      commercialMissingInputs: ["target_pack"],
    });

    expect(policy.state).toBe("blocked");
    expect(policy.pushReadiness).toBe("blocked_from_push");
    expect(policy.missingEvidence).toContain("commercial_truth");
  });

  it("surfaces relative scale review when explicit baseline exists but commercial truth is missing", () => {
    const policy = assessCreativeOperatorPolicy({
      ...baseInput(),
      commercialTruthConfigured: false,
      commercialMissingInputs: ["target_pack"],
      relativeBaseline: {
        scope: "account",
        sampleSize: 8,
        medianRoas: 1.8,
        medianCpa: 30,
        medianSpend: 180,
      },
      supportingMetrics: {
        spend: 260,
        purchases: 4,
        impressions: 18_000,
        roas: 3.1,
        cpa: 28,
        frequency: 1.6,
        creativeAgeDays: 22,
      },
    });

    expect(policy.segment).toBe("scale_review");
    expect(policy.state).toBe("investigate");
    expect(policy.pushReadiness).toBe("operator_review_required");
    expect(policy.queueEligible).toBe(false);
    expect(policy.canApply).toBe(false);
    expect(policy.missingEvidence).toContain("commercial_truth");
    expect(policy.reasons.join(" ")).toContain("Missing commercial input");
  });

  it("does not invent scale review when commercial truth and baseline are both missing", () => {
    const policy = assessCreativeOperatorPolicy({
      ...baseInput(),
      commercialTruthConfigured: false,
      commercialMissingInputs: ["target_pack"],
      relativeBaseline: null,
    });

    expect(policy.segment).toBe("blocked");
    expect(policy.state).toBe("blocked");
    expect(policy.pushReadiness).toBe("blocked_from_push");
    expect(policy.queueEligible).toBe(false);
    expect(policy.missingEvidence).toContain("relative_baseline");
  });

  it("keeps full Scale stricter than Scale Review", () => {
    const scale = assessCreativeOperatorPolicy(baseInput());
    const scaleReview = assessCreativeOperatorPolicy({
      ...baseInput(),
      commercialTruthConfigured: false,
      commercialMissingInputs: ["target_pack"],
      relativeBaseline: {
        scope: "campaign",
        sampleSize: 6,
        medianRoas: 1.7,
        medianCpa: 32,
        medianSpend: 160,
      },
      supportingMetrics: {
        spend: 300,
        purchases: 5,
        impressions: 22_000,
        roas: 3.2,
        cpa: 27,
        frequency: 1.8,
        creativeAgeDays: 24,
      },
    });

    expect(scale.segment).toBe("scale_ready");
    expect(scale.pushReadiness).toBe("safe_to_queue");
    expect(scale.queueEligible).toBe(true);
    expect(scaleReview.segment).toBe("scale_review");
    expect(scaleReview.pushReadiness).toBe("operator_review_required");
    expect(scaleReview.queueEligible).toBe(false);
  });

  it("keeps cut recognition available without commercial truth while preserving manual safety", () => {
    const policy = assessCreativeOperatorPolicy({
      ...baseInput(),
      lifecycleState: "blocked",
      primaryAction: "block_deploy",
      commercialTruthConfigured: false,
      commercialMissingInputs: ["target_pack"],
      economics: {
        status: "blocked",
        reasons: ["ROAS is materially weak versus peers."],
      },
      supportingMetrics: {
        spend: 520,
        purchases: 5,
        impressions: 34_000,
        roas: 0.6,
        cpa: 104,
        creativeAgeDays: 31,
      },
    });

    expect(policy.segment).toBe("kill_candidate");
    expect(policy.state).toBe("do_now");
    expect(policy.pushReadiness).toBe("operator_review_required");
    expect(policy.queueEligible).toBe(false);
    expect(policy.canApply).toBe(false);
    expect(policy.missingEvidence).not.toContain("commercial_truth");
  });

  it("treats demo and snapshot evidence as contextual only", () => {
    for (const evidenceSource of ["demo", "snapshot", "fallback"] as const) {
      const policy = assessCreativeOperatorPolicy({
        ...baseInput(),
        evidenceSource,
      });

      expect(policy.evidenceSource).toBe(evidenceSource);
      expect(policy.state).toBe("contextual_only");
      expect(policy.segment).toBe("contextual_only");
      expect(policy.pushReadiness).toBe("blocked_from_push");
      expect(policy.queueEligible).toBe(false);
    }
  });

  it("fails closed when provenance or evidence source is missing", () => {
    const missingProvenance = assessCreativeOperatorPolicy({
      ...baseInput(),
      provenance: null,
    });
    const missingSource = assessCreativeOperatorPolicy({
      ...baseInput(),
      evidenceSource: "unknown",
    });

    expect(missingProvenance.state).toBe("blocked");
    expect(missingProvenance.pushReadiness).toBe("blocked_from_push");
    expect(missingSource.state).toBe("contextual_only");
    expect(missingSource.pushReadiness).toBe("blocked_from_push");
  });

  it("does not blame strong creative when campaign or ad set context is weak", () => {
    const policy = assessCreativeOperatorPolicy({
      ...baseInput(),
      deployment: {
        targetLane: "Scaling",
        queueVerdict: "board_only",
        constraints: ["Campaign context is bid-limited."],
        compatibility: {
          status: "limited",
          reasons: ["Campaign context is bid-limited."],
        },
      },
    });

    expect(policy.segment).toBe("investigate");
    expect(policy.state).toBe("blocked");
    expect(policy.pushReadiness).toBe("blocked_from_push");
    expect(policy.missingEvidence).toContain("campaign_or_adset_context");
  });
});
