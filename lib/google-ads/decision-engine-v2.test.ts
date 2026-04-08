import { describe, expect, it } from "vitest";
import {
  buildGoogleDecisionSchema,
  deriveGoogleDecisionLane,
  mapGoogleRecommendationTypeToDecisionFamily,
} from "@/lib/google-ads/decision-engine-v2";
import type { GoogleRecommendation } from "@/lib/google-ads/growth-advisor-types";

function buildRecommendation(overrides: Partial<GoogleRecommendation> = {}): GoogleRecommendation {
  return {
    id: "rec_1",
    level: "campaign",
    type: "query_governance",
    strategyLayer: "Search Governance",
    decisionState: "act",
    decisionFamily: "waste_control",
    doBucket: "do_now",
    priority: "high",
    confidence: "high",
    dataTrust: "high",
    integrityState: "ready",
    supportStrength: "strong",
    actionability: "ready_now",
    reversibility: "medium",
    title: "Tighten wasted query coverage",
    summary: "Waste is concentrated in a stable query cluster.",
    why: "Repeated low-intent terms consumed spend without enough return.",
    evidence: [{ label: "Waste spend", value: "$120" }],
    decision: {
      decisionFamily: "waste_control",
      lane: "review",
      riskLevel: "medium",
      blastRadius: "campaign",
      confidence: 0.8,
      windowsUsed: {
        healthWindow: "alarm_7d",
        primaryWindow: "operational_28d",
        queryWindow: "query_governance_56d",
        baselineWindow: "baseline_84d",
        maturityCutoffDays: 84,
      },
      whyNow: "Waste remained visible in the selected range.",
      whyNot: [],
      blockers: [],
      validationPlan: ["Check wasted spend falls after exclusion."],
      rollbackPlan: ["Remove the negative keyword if conversion coverage drops."],
      evidenceSummary: "Waste is concentrated in a stable query cluster.",
      evidencePoints: [{ label: "Waste spend", value: "$120" }],
    },
    decisionNarrative: {
      whatHappened: "Waste is concentrated in a stable query cluster.",
      whyItHappened: "Repeated low-intent terms consumed spend without enough return.",
      whatToDo: "Add a negative keyword to stop the waste.",
      risk: "This changes live traffic routing.",
      howToValidate: ["Check wasted spend falls after exclusion."],
      howToRollBack: "Remove the negative keyword if conversion coverage drops.",
    },
    whyNow: "Waste remained visible in the selected range.",
    reasonCodes: ["waste_cluster_detected"],
    confidenceExplanation: "Signal depth is strong across weighted windows.",
    confidenceDegradationReasons: [],
    recommendedAction: "Add a negative keyword to stop the waste.",
    potentialContribution: {
      label: "Waste recovery",
      impact: "medium",
      summary: "Should reduce wasted spend.",
    },
    impactBand: "medium",
    effortScore: "low",
    rollbackGuidance: "Remove the negative keyword if conversion coverage drops.",
    validationChecklist: ["Check wasted spend falls after exclusion."],
    blockers: [],
    rankScore: 1,
    rankExplanation: "High priority waste control issue.",
    impactScore: 70,
    recommendationFingerprint: "fp_1",
    ...overrides,
  };
}

describe("Google Ads decision engine v2 helpers", () => {
  it("maps approved recommendation families into V2 decision families", () => {
    expect(mapGoogleRecommendationTypeToDecisionFamily("diagnostic_guardrail")).toBe("measurement_trust");
    expect(mapGoogleRecommendationTypeToDecisionFamily("query_governance")).toBe("waste_control");
    expect(mapGoogleRecommendationTypeToDecisionFamily("budget_reallocation")).toBe("budget_bidding");
    expect(mapGoogleRecommendationTypeToDecisionFamily("brand_leakage")).toBe("brand_governance");
  });

  it("derives lane policy behavior from readiness and integrity", () => {
    expect(
      deriveGoogleDecisionLane({
        decisionState: "act",
        doBucket: "do_now",
        integrityState: "ready",
        blockers: [],
        decisionEngineEnabled: true,
      })
    ).toBe("review");
    expect(
      deriveGoogleDecisionLane({
        decisionState: "test",
        doBucket: "do_next",
        integrityState: "ready",
        blockers: [],
        decisionEngineEnabled: true,
      })
    ).toBe("test");
    expect(
      deriveGoogleDecisionLane({
        decisionState: "watch",
        doBucket: "do_later",
        integrityState: "ready",
        blockers: [],
        decisionEngineEnabled: true,
      })
    ).toBe("watch");
    expect(
      deriveGoogleDecisionLane({
        decisionState: "act",
        doBucket: "do_now",
        integrityState: "suppressed",
        blockers: [],
        decisionEngineEnabled: true,
      })
    ).toBe("suppressed");
    expect(
      deriveGoogleDecisionLane({
        decisionState: "act",
        doBucket: "do_now",
        integrityState: "ready",
        blockers: [],
        decisionEngineEnabled: false,
      })
    ).toBe("auto_hidden");
  });

  it("builds the typed Decision Engine V2 schema with approved windows and evidence", () => {
    const schema = buildGoogleDecisionSchema({
      recommendation: buildRecommendation(),
      decisionEngineEnabled: true,
    });

    expect(schema).toMatchObject({
      decisionFamily: "waste_control",
      lane: "review",
      riskLevel: "medium",
      blastRadius: "campaign",
      windowsUsed: {
        healthWindow: "alarm_7d",
        primaryWindow: "operational_28d",
        queryWindow: "query_governance_56d",
        baselineWindow: "baseline_84d",
        maturityCutoffDays: 84,
      },
      whyNow: "Waste remained visible in the selected range.",
      whyNot: [],
      blockers: [],
      validationPlan: ["Check wasted spend falls after exclusion."],
      rollbackPlan: ["Remove the negative keyword if conversion coverage drops."],
      evidenceSummary: "Waste is concentrated in a stable query cluster.",
      evidencePoints: [{ label: "Waste spend", value: "$120" }],
    });
    expect(schema.confidence).toBeGreaterThanOrEqual(0);
    expect(schema.confidence).toBeLessThanOrEqual(1);
  });
});
