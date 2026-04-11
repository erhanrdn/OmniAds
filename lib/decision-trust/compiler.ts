import {
  buildDecisionEvidenceEnvelope,
  buildDecisionFreshness,
  buildDecisionTrust,
  deriveDecisionEvidenceCompleteness,
  normalizeDecisionReasons,
} from "@/lib/decision-trust/kernel";
import type {
  DecisionEntityState,
  DecisionFreshnessMetadata,
  DecisionMaterialityState,
  DecisionOperatorDisposition,
  DecisionSurfaceLane,
  DecisionTrustMetadata,
  DecisionTruthState,
} from "@/src/types/decision-trust";

export function compileDecisionTrust(input: {
  surfaceLane: DecisionSurfaceLane;
  truthState: DecisionTruthState;
  operatorDisposition: DecisionOperatorDisposition;
  reasons: Array<string | null | undefined>;
  entityState?: DecisionEntityState;
  materiality?: DecisionMaterialityState;
  freshness?: DecisionFreshnessMetadata;
  missingInputs?: Array<string | null | undefined>;
  suppressionReasons?: Array<string | null | undefined>;
  aggressiveActionBlocked?: boolean;
  aggressiveActionBlockReasons?: Array<string | null | undefined>;
}): DecisionTrustMetadata {
  const entityState = input.entityState ?? "active";
  const materiality = input.materiality ?? "material";
  const freshness = input.freshness ?? buildDecisionFreshness();
  const missingInputs = normalizeDecisionReasons(input.missingInputs ?? []);
  const forcedArchive =
    entityState !== "active" || materiality === "immaterial";
  const surfaceLane = forcedArchive ? "archive_context" : input.surfaceLane;
  const truthState = forcedArchive
    ? "inactive_or_immaterial"
    : input.truthState;
  const operatorDisposition = forcedArchive
    ? "archive_only"
    : input.operatorDisposition;
  const suppressed =
    surfaceLane === "watchlist" ||
    surfaceLane === "archive_context" ||
    surfaceLane === "opportunity_board";
  const aggressiveActionBlocked =
    input.aggressiveActionBlocked ??
    (truthState !== "live_confident" || surfaceLane !== "action_core");
  const completeness = deriveDecisionEvidenceCompleteness({
    missingInputs,
  });

  return buildDecisionTrust({
    surfaceLane,
    truthState,
    operatorDisposition,
    reasons: input.reasons,
    evidence: buildDecisionEvidenceEnvelope({
      entityState,
      materiality,
      completeness,
      freshness,
      suppressed,
      suppressionReasons: suppressed
        ? (input.suppressionReasons ?? input.reasons)
        : input.suppressionReasons,
      aggressiveActionBlocked,
      aggressiveActionBlockReasons: aggressiveActionBlocked
        ? (input.aggressiveActionBlockReasons ?? input.reasons)
        : input.aggressiveActionBlockReasons,
    }),
  });
}
