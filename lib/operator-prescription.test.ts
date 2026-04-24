import { describe, expect, it } from "vitest";
import { buildOperatorInstruction } from "@/lib/operator-prescription";
import type { OperatorPolicyAssessment } from "@/src/types/operator-decision";

function policy(
  overrides: Partial<OperatorPolicyAssessment> = {},
): OperatorPolicyAssessment {
  return {
    contractVersion: "operator-policy.v1",
    state: "do_now",
    actionClass: "scale",
    pushReadiness: "safe_to_queue",
    queueEligible: true,
    canApply: false,
    reasons: ["Evidence floor is met."],
    blockers: [],
    missingEvidence: [],
    requiredEvidence: ["row_provenance", "commercial_truth"],
    explanation: "Deterministic policy allows this action.",
    ...overrides,
  };
}

describe("operator prescription adapter", () => {
  it("turns a scale-ready policy into an instruction without inventing an amount", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy(),
      targetScope: "creative",
      targetEntity: "Travel Hook Winner",
      actionLabel: "Scale",
      reason: "Creative evidence is material.",
      confidenceScore: 0.88,
      evidenceSource: "live",
      nextObservation: ["Keep CPA inside target after promotion."],
    });

    expect(instruction.instructionKind).toBe("do_now");
    expect(instruction.primaryMove).toContain("do not invent a budget or bid amount");
    expect(instruction.amountGuidance.status).toBe("unavailable");
    expect(instruction.invalidActions).toContain("Do not invent a budget, bid, or spend amount.");
    expect(instruction.pushReadiness).toBe("safe_to_queue");
  });

  it("names the preferred scale target in the primary move when target context is available", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy(),
      targetScope: "creative",
      targetEntity: "Travel Hook Winner",
      actionLabel: "Scale",
      reason: "Creative evidence is material.",
      confidenceScore: 0.88,
      evidenceSource: "live",
      targetContext: {
        status: "available",
        label: "Target ad set: Prospecting Scale",
        reason: "Deployment data names the target.",
        targetScope: "adset",
        targetEntity: "Prospecting Scale",
      },
    });

    expect(instruction.primaryMove).toContain("Travel Hook Winner");
    expect(instruction.primaryMove).toContain("Prospecting Scale");
    expect(instruction.primaryMove).toContain("do not invent a budget or bid amount");
  });

  it("does not duplicate the same ad set target in Meta amount-sensitive copy", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "meta",
      sourceLabel: "Meta Decision OS",
      policy: policy({ actionClass: "budget" }),
      targetScope: "adset",
      targetEntity: "Prospecting Scale",
      actionLabel: "Increase budget",
      reason: "Budget is the binding constraint.",
      confidenceScore: 0.88,
      evidenceSource: "live",
      targetContext: {
        status: "available",
        label: "Adset: Prospecting Scale",
        reason: "Target comes from the deterministic source row.",
        targetScope: "adset",
        targetEntity: "Prospecting Scale",
      },
    });

    expect(instruction.primaryMove).toBe(
      "Increase budget Prospecting Scale, but do not invent a budget or bid amount.",
    );
  });

  it("marks bid and cost-control moves as amount-sensitive when no deterministic amount exists", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "meta",
      sourceLabel: "Meta Decision OS",
      policy: policy({ actionClass: "bid" }),
      targetScope: "adset",
      targetEntity: "Cost Cap Prospecting",
      actionLabel: "Adjust bid cap",
      reason: "Delivery is constrained by the current control.",
      confidenceScore: 0.84,
      evidenceSource: "live",
    });

    expect(instruction.amountGuidance.status).toBe("unavailable");
    expect(instruction.primaryMove).toContain("do not invent a budget or bid amount");
    expect(instruction.invalidActions).toContain("Do not invent a budget, bid, or spend amount.");
  });

  it("does not show budget or bid amount warnings for pause-style actions", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({ actionClass: "pause" }),
      targetScope: "creative",
      targetEntity: "Spent Out Loser",
      actionLabel: "Pause",
      reason: "Evidence floor is met and performance is below target.",
      confidenceScore: 0.86,
      evidenceSource: "live",
    });

    expect(instruction.amountGuidance.status).toBe("not_applicable");
    expect(instruction.amountGuidance.label).toBe("No amount needed");
    expect(instruction.primaryMove).not.toContain("do not invent");
    expect(instruction.invalidActions.join(" ")).not.toContain("budget, bid, or spend amount");
  });

  it("does not show budget or bid amount warnings for refresh or variant instructions", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({ actionClass: "refresh" }),
      targetScope: "creative",
      targetEntity: "Fatigued Winner",
      actionLabel: "Request variant",
      reason: "Frequency pressure is visible but the winner is still protected.",
      confidenceScore: 0.78,
      evidenceSource: "live",
    });

    expect(instruction.amountGuidance.status).toBe("not_applicable");
    expect(instruction.primaryMove).toBe("Request variant Fatigued Winner.");
    expect(instruction.invalidActions.join(" ")).not.toContain("budget, bid, or spend amount");
  });

  it("does not show amount warnings for watch, investigate, or protect instructions", () => {
    const watchInstruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "watch",
        actionClass: "test",
        pushReadiness: "read_only_insight",
        queueEligible: false,
      }),
      targetScope: "creative",
      targetEntity: "Promising New Hook",
      actionLabel: "Collect signal",
      reason: "Evidence is promising but under-sampled.",
      confidenceScore: 0.64,
      evidenceSource: "live",
    });
    const investigateInstruction = buildOperatorInstruction({
      sourceSystem: "meta",
      sourceLabel: "Meta Decision OS",
      policy: policy({
        state: "investigate",
        actionClass: "diagnose",
        pushReadiness: "read_only_insight",
        queueEligible: false,
      }),
      targetScope: "campaign",
      targetEntity: "Delivery Limited Campaign",
      actionLabel: "Investigate delivery",
      reason: "Delivery constraint is not resolved.",
      confidenceScore: 0.66,
      evidenceSource: "live",
    });
    const protectInstruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "do_not_touch",
        actionClass: "protect",
        pushReadiness: "blocked_from_push",
        queueEligible: false,
      }),
      targetScope: "creative",
      targetEntity: "Protected Winner",
      actionLabel: "Protect",
      reason: "Short-term volatility is not a kill signal.",
      confidenceScore: 0.82,
      evidenceSource: "live",
    });

    for (const instruction of [
      watchInstruction,
      investigateInstruction,
      protectInstruction,
    ]) {
      expect(instruction.amountGuidance.status).toBe("not_applicable");
      expect(instruction.invalidActions.join(" ")).not.toContain("budget, bid, or spend amount");
    }
  });

  it("makes under-sampled watch reads observational instead of command-ready", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "watch",
        actionClass: "test",
        pushReadiness: "read_only_insight",
        queueEligible: false,
        missingEvidence: ["evidence_floor", "non_roas_evidence"],
        requiredEvidence: ["conversion_volume"],
      }),
      targetScope: "creative",
      targetEntity: "Two Dollar ROAS Spike",
      actionLabel: "Collect signal",
      reason: "ROAS is positive but spend and purchases are too low.",
      confidenceScore: 0.62,
      evidenceSource: "live",
    });

    expect(instruction.instructionKind).toBe("watch");
    expect(instruction.primaryMove).toContain("Keep watching");
    expect(instruction.invalidActions.join(" ")).toContain("Do not convert this watch read");
    expect(instruction.evidenceStrength).toBe("limited");
  });

  it("keeps Scale Review framed as a relative winner with manual validation still required", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "investigate",
        actionClass: "scale",
        pushReadiness: "operator_review_required",
        queueEligible: false,
        missingEvidence: ["commercial_truth"],
        requiredEvidence: ["commercial_truth", "relative_baseline"],
      }),
      targetScope: "creative",
      targetEntity: "Relative Winner",
      actionLabel: "Scale Review",
      reason: "Strong relative performer against the Account-wide benchmark. Business validation is still missing, so this stays review-only.",
      confidenceScore: 0.78,
      evidenceSource: "live",
    });

    expect(instruction.headline).toBe("Scale Review: Relative Winner");
    expect(instruction.primaryMove).toBe(
      "Scale Review Relative Winner as a relative winner before any scale move; business validation is still missing.",
    );
    expect(instruction.queueEligible).toBe(false);
    expect(instruction.canApply).toBe(false);
  });

  it("adds a fatigue caveat when Test More stays the main outcome", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "watch",
        actionClass: "test",
        pushReadiness: "read_only_insight",
        queueEligible: false,
        missingEvidence: ["evidence_floor"],
        requiredEvidence: ["conversion_volume"],
      }),
      targetScope: "creative",
      targetEntity: "Promising Hook",
      actionLabel: "Test More",
      reason: "Promising relative signal, but the sample is still light. Keep testing while watching fatigue pressure.",
      confidenceScore: 0.67,
      evidenceSource: "live",
      nextObservation: ["Watch fatigue pressure while the sample is still maturing."],
    });

    expect(instruction.instructionKind).toBe("watch");
    expect(instruction.primaryMove).toBe(
      "Keep testing Promising Hook, but watch fatigue pressure while the evidence matures.",
    );
    expect(instruction.queueEligible).toBe(false);
    expect(instruction.canApply).toBe(false);
  });

  it("does not treat missing frequency data as a fatigue caveat for Test More", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "watch",
        actionClass: "test",
        pushReadiness: "read_only_insight",
        queueEligible: false,
        missingEvidence: ["evidence_floor"],
        requiredEvidence: ["conversion_volume"],
      }),
      targetScope: "creative",
      targetEntity: "Promising Hook",
      actionLabel: "Test More",
      reason: "Promising relative signal, but the sample is still light. Keep testing until the evidence matures.",
      confidenceScore: 0.67,
      evidenceSource: "live",
      nextObservation: ["Frequency unavailable"],
    });

    expect(instruction.instructionKind).toBe("watch");
    expect(instruction.primaryMove).toContain("Keep testing Promising Hook;");
    expect(instruction.primaryMove).not.toContain("watch fatigue pressure");
  });

  it("keeps Test More clean when no fatigue-related observation exists", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "watch",
        actionClass: "test",
        pushReadiness: "read_only_insight",
        queueEligible: false,
        missingEvidence: ["evidence_floor"],
        requiredEvidence: ["conversion_volume"],
      }),
      targetScope: "creative",
      targetEntity: "Promising Hook",
      actionLabel: "Test More",
      reason: "Promising relative signal, but the sample is still light. Keep testing until the evidence matures.",
      confidenceScore: 0.67,
      evidenceSource: "live",
      nextObservation: ["Wait for one more conversion before changing the recommendation."],
    });

    expect(instruction.instructionKind).toBe("watch");
    expect(instruction.primaryMove).toContain("Keep testing Promising Hook;");
    expect(instruction.primaryMove).not.toContain("watch fatigue pressure");
  });

  it("keeps non-live evidence contextual and push blocked", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "contextual_only",
        pushReadiness: "blocked_from_push",
        queueEligible: false,
        blockers: ["snapshot evidence is contextual."],
      }),
      targetScope: "creative",
      targetEntity: "Snapshot Creative",
      actionLabel: "Context only",
      reason: "Snapshot evidence is contextual.",
      confidenceScore: 0.9,
      evidenceSource: "snapshot",
    });

    expect(instruction.instructionKind).toBe("contextual_only");
    expect(instruction.queueEligible).toBe(false);
    expect(instruction.evidenceStrength).toBe("blocked");
    expect(instruction.invalidActions.join(" ")).toContain("selected-range evidence");
  });

  it("turns blocked Meta policy into a clear do-not-act instruction", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "meta",
      sourceLabel: "Meta Decision OS",
      policy: policy({
        state: "blocked",
        actionClass: "scale",
        pushReadiness: "blocked_from_push",
        queueEligible: false,
        blockers: ["Budget is not the binding constraint."],
        missingEvidence: ["budget_binding_evidence"],
      }),
      targetScope: "adset",
      targetEntity: "Scale Ad Set",
      actionLabel: "Increase budget",
      reason: "Budget is not the binding constraint.",
      confidenceScore: 0.86,
      evidenceSource: "live",
    });

    expect(instruction.operatorVerb).toBe("Do not act");
    expect(instruction.primaryMove).toContain("Do not act on Scale Ad Set");
    expect(instruction.invalidActions).toContain("Do not act until the blocker is removed.");
    expect(instruction.pushReadiness).toBe("blocked_from_push");
  });

  it("keeps protected winners visibly protected instead of hiding them in hold", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "do_not_touch",
        actionClass: "protect",
        pushReadiness: "blocked_from_push",
        queueEligible: false,
        reasons: ["Protected winner should stay live."],
        blockers: [],
        missingEvidence: [],
      }),
      targetScope: "creative",
      targetEntity: "Evergreen Winner",
      actionLabel: "Protect",
      reason: "Protected winner should stay live.",
      confidenceScore: 0.84,
      evidenceSource: "live",
      nextObservation: ["Watch for sustained fatigue before reopening refresh work."],
    });

    expect(instruction.operatorVerb).toBe("Protect");
    expect(instruction.primaryMove).toContain("live and protected");
    expect(instruction.invalidActions.join(" ")).toContain("Do not cut, refresh, resize, or reset");
  });

  it("clamps queue and apply overrides so instructions cannot loosen policy", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "meta",
      sourceLabel: "Meta Decision OS",
      policy: policy({
        state: "blocked",
        pushReadiness: "blocked_from_push",
        queueEligible: false,
        canApply: false,
        blockers: ["Policy blocks this action."],
      }),
      targetScope: "adset",
      targetEntity: "Blocked Ad Set",
      actionLabel: "Increase budget",
      reason: "Policy blocks this action.",
      confidenceScore: 0.9,
      evidenceSource: "live",
      pushReadinessOverride: "eligible_for_push_when_enabled",
      queueEligibleOverride: true,
      canApplyOverride: true,
    });

    expect(instruction.pushReadiness).toBe("blocked_from_push");
    expect(instruction.queueEligible).toBe(false);
    expect(instruction.canApply).toBe(false);
    expect(instruction.telemetry.pushReadiness).toBe("blocked_from_push");
  });

  it("exposes target context, urgency basis, and sanitized telemetry", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "watch",
        actionClass: "test",
        pushReadiness: "read_only_insight",
        queueEligible: false,
        missingEvidence: ["conversion volume", "target CPA"],
      }),
      targetScope: "creative",
      targetEntity: "Hook Winner",
      parentEntity: "Prospecting Family",
      actionLabel: "Collect signal",
      reason: "Creative is promising but still under-sampled.",
      confidenceScore: 0.61,
      evidenceSource: "live",
      evidenceHash: "eh_123",
      actionFingerprint: "af_123",
    });

    expect(instruction.targetContext.label).toContain("Creative: Hook Winner");
    expect(instruction.targetContext.label).toContain("Prospecting Family");
    expect(instruction.urgency).toBe("watch");
    expect(instruction.urgencyReason).toContain("more observation");
    expect(instruction.telemetry).toMatchObject({
      contractVersion: "operator-decision-telemetry.v1",
      sourceSystem: "creative",
      instructionKind: "watch",
      pushReadiness: "read_only_insight",
      amountGuidanceStatus: "not_applicable",
      targetContextStatus: "available",
      actionFingerprint: "af_123",
      evidenceHash: "eh_123",
    });
    expect(instruction.telemetry.missingEvidence).toEqual([
      "conversion_volume",
      "target_cpa",
    ]);
    expect(JSON.stringify(instruction.telemetry)).not.toContain("Hook Winner");
  });

  it("does not make every do-now instruction high urgency when evidence is limited", () => {
    const instruction = buildOperatorInstruction({
      sourceSystem: "creative",
      sourceLabel: "Creative Decision OS",
      policy: policy({
        state: "do_now",
        actionClass: "refresh",
        pushReadiness: "operator_review_required",
        queueEligible: false,
      }),
      targetScope: "creative",
      targetEntity: "Fatigue Review",
      actionLabel: "Refresh",
      reason: "Frequency pressure is visible but review is required.",
      confidenceScore: 0.68,
      evidenceSource: "live",
    });

    expect(instruction.instructionKind).toBe("do_now");
    expect(instruction.urgency).toBe("medium");
    expect(instruction.urgencyReason).toContain("bounded");
  });
});
