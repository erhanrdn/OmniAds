import { describe, expect, it } from "vitest";
import { compileDecisionTrust } from "@/lib/decision-trust/compiler";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";
import { buildOperatorDecisionProvenance } from "@/lib/operator-decision-provenance";
import {
  assessMetaOperatorPolicy,
  inferMetaBudgetConstraint,
  type MetaOperatorPolicyInput,
} from "@/lib/meta/operator-policy";

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
    sourceWindow: metadata.decisionWindows.primary30d,
    sourceRowScope: {
      system: "meta",
      entityType: "adset",
      entityId: "adset_1",
    },
    sourceDecisionId: "adset_1:scale_budget",
    recommendedAction: "scale_budget",
    evidence: ["fixture"],
  });
}

function liveTrust(overrides: Partial<Parameters<typeof compileDecisionTrust>[0]> = {}) {
  return compileDecisionTrust({
    surfaceLane: "action_core",
    truthState: "live_confident",
    operatorDisposition: "standard",
    reasons: ["Fixture trust is live and command-ready."],
    ...overrides,
  });
}

function baseInput(overrides: Partial<MetaOperatorPolicyInput> = {}): MetaOperatorPolicyInput {
  return {
    entityType: "adset",
    action: "scale_budget",
    trust: liveTrust(),
    provenance: provenance(),
    commercialTruthMode: "configured_targets",
    commercialMissingInputs: [],
    budgetOwner: "adset",
    budgetConstraint: "binding",
    supportingMetrics: {
      spend: 900,
      purchases: 24,
      impressions: 60_000,
      dailyBudget: 90,
      lifetimeBudget: null,
      bidStrategyLabel: "Lowest Cost",
      optimizationGoal: "PURCHASE",
    },
    ...overrides,
  };
}

describe("assessMetaOperatorPolicy", () => {
  it("allows a sufficiently evidenced ad set scale candidate to become push eligible when enabled", () => {
    const result = assessMetaOperatorPolicy(baseInput());

    expect(result).toMatchObject({
      state: "do_now",
      actionClass: "scale",
      pushReadiness: "eligible_for_push_when_enabled",
      queueEligible: true,
      canApply: true,
      blockers: [],
    });
  });

  it("blocks budget increase when budget is not the binding constraint", () => {
    const result = assessMetaOperatorPolicy(
      baseInput({ budgetConstraint: "not_binding" }),
    );

    expect(result.state).toBe("blocked");
    expect(result.pushReadiness).toBe("blocked_from_push");
    expect(result.blockers.join(" ")).toContain("not the binding constraint");
  });

  it("blocks ad set budget increase when campaign budget ownership controls allocation", () => {
    const result = assessMetaOperatorPolicy(baseInput({ budgetOwner: "campaign" }));

    expect(result.state).toBe("blocked");
    expect(result.pushReadiness).toBe("blocked_from_push");
    expect(result.blockers.join(" ")).toContain("campaign-owned");
  });

  it("blocks low-evidence false winners from primary scale", () => {
    const result = assessMetaOperatorPolicy(
      baseInput({
        supportingMetrics: {
          spend: 90,
          purchases: 1,
          impressions: 4_000,
          dailyBudget: 90,
          lifetimeBudget: null,
        },
      }),
    );

    expect(result.state).toBe("blocked");
    expect(result.missingEvidence).toContain("evidence_floor");
    expect(result.blockers.join(" ")).toContain("Evidence floor");
  });

  it("blocks low-evidence poor performers from hard pause", () => {
    const result = assessMetaOperatorPolicy(
      baseInput({
        action: "pause",
        supportingMetrics: {
          spend: 120,
          purchases: 1,
          impressions: 5_000,
          dailyBudget: 90,
          lifetimeBudget: null,
        },
      }),
    );

    expect(result.state).toBe("blocked");
    expect(result.pushReadiness).toBe("blocked_from_push");
    expect(result.missingEvidence).toContain("evidence_floor");
  });

  it("keeps sufficient-evidence poor performers eligible for guarded pause", () => {
    const result = assessMetaOperatorPolicy(
      baseInput({
        action: "pause",
        supportingMetrics: {
          spend: 850,
          purchases: 18,
          impressions: 70_000,
          dailyBudget: 90,
          lifetimeBudget: null,
        },
      }),
    );

    expect(result.state).toBe("do_now");
    expect(result.pushReadiness).toBe("eligible_for_push_when_enabled");
  });

  it("blocks aggressive action when commercial truth is missing", () => {
    const result = assessMetaOperatorPolicy(
      baseInput({
        commercialTruthMode: "conservative_fallback",
        commercialMissingInputs: ["target_pack"],
        trust: liveTrust({
          truthState: "degraded_missing_truth",
          operatorDisposition: "profitable_truth_capped",
          missingInputs: ["target_pack"],
        }),
      }),
    );

    expect(result.state).toBe("blocked");
    expect(result.pushReadiness).toBe("blocked_from_push");
    expect(result.missingEvidence).toContain("commercial_truth");
  });

  it("marks no-touch protected entities as non-push protective context", () => {
    const result = assessMetaOperatorPolicy(
      baseInput({
        action: "hold",
        noTouch: true,
        trust: liveTrust({
          surfaceLane: "watchlist",
          operatorDisposition: "protected_watchlist",
        }),
      }),
    );

    expect(result.state).toBe("do_not_touch");
    expect(result.pushReadiness).toBe("blocked_from_push");
    expect(result.blockers.join(" ")).toContain("no-touch");
  });

  it("blocks missing provenance from queue and push eligibility", () => {
    const result = assessMetaOperatorPolicy(baseInput({ provenance: null }));

    expect(result.state).toBe("blocked");
    expect(result.pushReadiness).toBe("blocked_from_push");
    expect(result.queueEligible).toBe(false);
    expect(result.missingEvidence).toContain("row_provenance");
  });

  it("keeps demo, snapshot, and fallback evidence contextual only", () => {
    for (const evidenceSource of ["demo", "snapshot", "fallback"] as const) {
      const result = assessMetaOperatorPolicy(baseInput({ evidenceSource }));

      expect(result.state).toBe("contextual_only");
      expect(result.pushReadiness).toBe("blocked_from_push");
      expect(result.blockers.join(" ")).toContain("contextual");
    }
  });

  it("keeps bid-control constrained delivery as queueable review, not provider apply", () => {
    const result = assessMetaOperatorPolicy(
      baseInput({
        action: "tighten_bid",
        supportingMetrics: {
          spend: 600,
          purchases: 14,
          impressions: 50_000,
          dailyBudget: 90,
          lifetimeBudget: null,
          bidStrategyLabel: "Cost Cap",
          optimizationGoal: "PURCHASE",
        },
      }),
    );

    expect(result.state).toBe("do_now");
    expect(result.actionClass).toBe("bid_control");
    expect(result.pushReadiness).toBe("safe_to_queue");
    expect(result.canApply).toBe(false);
  });

  it("infers budget binding from stable-window spend and budget utilization", () => {
    expect(
      inferMetaBudgetConstraint({ spend: 900, dailyBudget: 30, windowDays: 30 }),
    ).toBe("binding");
    expect(
      inferMetaBudgetConstraint({ spend: 120, dailyBudget: 30, windowDays: 30 }),
    ).toBe("not_binding");
  });
});
