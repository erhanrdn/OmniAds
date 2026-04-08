import { GOOGLE_ADS_DECISION_WINDOW_POLICY } from "@/lib/google-ads/decision-window-policy";
import type {
  GoogleDecisionBlastRadius,
  GoogleDecisionLane,
  GoogleDecisionRiskLevel,
  GoogleDecisionSchema,
  GoogleDecisionV2Family,
  GoogleRecommendation,
} from "@/lib/google-ads/growth-advisor-types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mapGoogleRecommendationTypeToDecisionFamily(type: GoogleRecommendation["type"]): GoogleDecisionV2Family {
  switch (type) {
    case "diagnostic_guardrail":
      return "measurement_trust";
    case "query_governance":
      return "waste_control";
    case "brand_capture_control":
    case "brand_leakage":
      return "brand_governance";
    case "budget_reallocation":
      return "budget_bidding";
    case "creative_asset_deployment":
      return "creative_feed";
    case "asset_group_structure":
    case "operating_model_gap":
      return "structure_governance";
    default:
      return "demand_capture";
  }
}

export function deriveGoogleDecisionLane(input: {
  decisionState: GoogleRecommendation["decisionState"];
  doBucket: GoogleRecommendation["doBucket"];
  integrityState: GoogleRecommendation["integrityState"];
  blockers: string[];
  decisionEngineEnabled: boolean;
}): GoogleDecisionLane {
  if (!input.decisionEngineEnabled) return "auto_hidden";
  if (input.integrityState === "suppressed") return "suppressed";
  if (input.decisionState === "watch" || input.doBucket === "do_later") return "watch";
  if (input.decisionState === "test" || input.doBucket === "do_next") return "test";
  return "review";
}

export function deriveGoogleDecisionBlastRadius(recommendation: Pick<
  GoogleRecommendation,
  "level" | "sharedStateGovernanceType" | "affectedCampaignIds"
>): GoogleDecisionBlastRadius {
  if (recommendation.level === "account" || recommendation.sharedStateGovernanceType === "shared_budget" || recommendation.sharedStateGovernanceType === "shared_budget_and_portfolio") {
    return "account";
  }
  if (recommendation.level === "campaign" || (recommendation.affectedCampaignIds?.length ?? 0) > 0) {
    return "campaign";
  }
  return "entity";
}

export function deriveGoogleDecisionRiskLevel(input: {
  recommendation: Pick<GoogleRecommendation, "reversibility" | "sharedStateGovernanceType">;
  blockers: string[];
  blastRadius: GoogleDecisionBlastRadius;
}): GoogleDecisionRiskLevel {
  if (
    input.blastRadius === "account" ||
    input.blockers.length > 0 ||
    input.recommendation.reversibility === "low" ||
    (input.recommendation.sharedStateGovernanceType ?? "standalone") !== "standalone"
  ) {
    return "high";
  }
  if (input.blastRadius === "campaign" || input.recommendation.reversibility === "medium") {
    return "medium";
  }
  return "low";
}

export function deriveGoogleDecisionConfidence(input: {
  confidence: GoogleRecommendation["confidence"];
  dataTrust: GoogleRecommendation["dataTrust"];
}) {
  const base = input.confidence === "high" ? 0.85 : input.confidence === "medium" ? 0.65 : 0.4;
  const adjusted =
    input.dataTrust === "high" ? base + 0.05 : input.dataTrust === "low" ? base - 0.1 : base;
  return Number(clamp(adjusted, 0, 1).toFixed(2));
}

export function buildGoogleDecisionSchema(input: {
  recommendation: GoogleRecommendation;
  decisionEngineEnabled: boolean;
}): GoogleDecisionSchema {
  const decisionFamily = mapGoogleRecommendationTypeToDecisionFamily(input.recommendation.type);
  const lane = deriveGoogleDecisionLane({
    decisionState: input.recommendation.decisionState,
    doBucket: input.recommendation.doBucket,
    integrityState: input.recommendation.integrityState,
    blockers: input.recommendation.blockers,
    decisionEngineEnabled: input.decisionEngineEnabled,
  });
  const blastRadius = deriveGoogleDecisionBlastRadius(input.recommendation);
  const riskLevel = deriveGoogleDecisionRiskLevel({
    recommendation: input.recommendation,
    blockers: input.recommendation.blockers,
    blastRadius,
  });
  const queryWindow =
    decisionFamily === "waste_control" ||
    decisionFamily === "brand_governance" ||
    decisionFamily === "demand_capture"
      ? "query_governance_56d"
      : undefined;

  return {
    decisionFamily,
    lane,
    riskLevel,
    blastRadius,
    confidence: deriveGoogleDecisionConfidence({
      confidence: input.recommendation.confidence,
      dataTrust: input.recommendation.dataTrust,
    }),
    windowsUsed: {
      healthWindow: "alarm_7d",
      primaryWindow: "operational_28d",
      queryWindow,
      baselineWindow: "baseline_84d",
      maturityCutoffDays: GOOGLE_ADS_DECISION_WINDOW_POLICY.maturityCutoffDays,
    },
    whyNow: input.recommendation.whyNow,
    whyNot: input.recommendation.blockers,
    blockers: input.recommendation.blockers,
    validationPlan: input.recommendation.validationChecklist,
    rollbackPlan: [
      input.recommendation.rollbackGuidance ??
        "No verified Adsecute rollback is exposed in V1. Reverse manually in Google Ads if this plan is executed.",
    ],
    evidenceSummary: input.recommendation.summary,
    evidencePoints: input.recommendation.evidence,
  };
}

