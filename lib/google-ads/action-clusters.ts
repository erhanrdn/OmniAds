import type {
  GoogleActionCluster,
  GoogleActionClusterBucket,
  GoogleActionClusterStepCriticality,
  GoogleActionClusterStepFailureBoundary,
  GoogleActionClusterStep,
  GoogleActionClusterType,
  GoogleActionClusterStepValidationRole,
  GoogleClusterReadiness,
  GoogleClusterExecutionStatus,
  GoogleClusterMoveValidity,
  GoogleClusterOutcomeState,
  GoogleClusterRecoveryState,
  GoogleExecutionTrustBand,
  GoogleOutcomeConfidence,
  GooglePortfolioContaminationSource,
  GooglePortfolioContaminationSeverity,
  GooglePortfolioCouplingStrength,
  GooglePortfolioCascadeRiskBand,
  GooglePortfolioGovernanceStatus,
  GooglePortfolioStrategyStatus,
  GoogleRecommendation,
  GoogleSharedStateAwarenessStatus,
  GoogleSharedStateGovernanceType,
} from "@/lib/google-ads/growth-advisor-types";

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().trim();
}

function overlap(valuesA: string[] = [], valuesB: string[] = []) {
  const set = new Set(valuesA.filter(Boolean));
  return valuesB.some((value) => set.has(value));
}

function recommendationGroupKey(recommendation: GoogleRecommendation) {
  const affectedCampaignIds = unique((recommendation.affectedCampaignIds ?? []).filter(Boolean)).sort();
  const dependencyIds = unique((recommendation.dependsOnRecommendationIds ?? []).filter(Boolean)).sort();
  const overlapEntities = unique((recommendation.overlapEntities ?? []).filter(Boolean)).sort();
  const allocatorScope =
    recommendation.sharedBudgetResourceName
      ? [`shared-budget:${recommendation.sharedBudgetResourceName}`]
      : recommendation.allocatorCoupled && (recommendation.coupledCampaignIds?.length ?? 0) > 0
        ? unique((recommendation.coupledCampaignIds ?? []).filter(Boolean)).sort()
        : [];
  const baseEntitySet = affectedCampaignIds.length > 0
    ? allocatorScope.length > 0
      ? allocatorScope
      : affectedCampaignIds
    : overlapEntities.length > 0
      ? overlapEntities
      : recommendation.entityId
        ? [String(recommendation.entityId)]
        : [recommendation.type];
  const objectiveSeed =
    recommendation.type === "budget_reallocation"
      ? "reallocation"
      : recommendation.type === "pmax_scaling_fit" || recommendation.type === "geo_device_adjustment"
        ? "scale"
        : recommendation.type === "query_governance"
          ? "query_cleanup"
          : recommendation.type === "creative_asset_deployment"
            ? "asset_cleanup"
            : recommendation.type === "search_shopping_overlap" ||
                recommendation.type === "brand_leakage" ||
                recommendation.type === "orphaned_non_brand_demand"
              ? "overlap_resolution"
              : recommendation.decisionFamily;
  return `${objectiveSeed}|${baseEntitySet.join(",")}|deps:${dependencyIds.join(",")}`;
}

function entityScopeKey(recommendation: GoogleRecommendation) {
  if (recommendation.sharedBudgetResourceName) {
    return `shared-budget:${recommendation.sharedBudgetResourceName}`;
  }
  const affectedCampaignIds = unique((recommendation.affectedCampaignIds ?? []).filter(Boolean)).sort();
  const overlapEntities = unique((recommendation.overlapEntities ?? []).filter(Boolean)).sort();
  if (affectedCampaignIds.length > 0) return affectedCampaignIds.join(",");
  if (overlapEntities.length > 0) return overlapEntities.join(",");
  if (recommendation.entityId) return String(recommendation.entityId);
  return recommendation.type;
}

function aggregateSharedState(recommendations: GoogleRecommendation[]) {
  const governanceTypes = unique(
    recommendations
      .map((entry) => entry.sharedStateGovernanceType)
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
  );
  const sharedStateGovernanceType: GoogleSharedStateGovernanceType =
    governanceTypes.includes("shared_budget_and_portfolio")
      ? "shared_budget_and_portfolio"
      : governanceTypes.includes("shared_budget") && governanceTypes.includes("portfolio_bid_strategy")
        ? "shared_budget_and_portfolio"
        : governanceTypes.includes("shared_budget")
          ? "shared_budget"
          : governanceTypes.includes("portfolio_bid_strategy")
            ? "portfolio_bid_strategy"
            : governanceTypes.includes("standalone")
              ? "standalone"
              : "unknown";
  const sharedStateAwarenessStatus: GoogleSharedStateAwarenessStatus = recommendations.some(
    (entry) => entry.sharedStateAwarenessStatus === "not_ingested"
  )
    ? "not_ingested"
    : "known";
  const coupledCampaignIds = unique(recommendations.flatMap((entry) => entry.coupledCampaignIds ?? []).filter(Boolean));
  const coupledCampaignNames = unique(recommendations.flatMap((entry) => entry.coupledCampaignNames ?? []).filter(Boolean));
  const allocatorCoupled = recommendations.some((entry) => entry.allocatorCoupled === true);
  const sharedBudgetResourceNames = unique(
    recommendations.map((entry) => entry.sharedBudgetResourceName).filter((value): value is string => Boolean(value))
  );
  const portfolioResourceNames = unique(
    recommendations
      .map((entry) => entry.portfolioBidStrategyResourceName)
      .filter((value): value is string => Boolean(value))
  );
  const portfolioGovernanceStatuses = unique(
    recommendations
      .map((entry) => entry.portfolioGovernanceStatus)
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
  );
  const portfolioGovernanceStatus: GooglePortfolioGovernanceStatus =
    portfolioGovernanceStatuses.includes("dominant")
      ? "dominant"
      : portfolioGovernanceStatuses.includes("mixed_governance")
        ? "mixed_governance"
        : portfolioGovernanceStatuses.includes("present")
          ? "present"
          : portfolioGovernanceStatuses.includes("none")
            ? "none"
            : "unknown";
  const couplingStrengths = recommendations
    .map((entry) => entry.portfolioCouplingStrength)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  const portfolioCouplingStrength: GooglePortfolioCouplingStrength | null =
    couplingStrengths.includes("high")
      ? "high"
      : couplingStrengths.includes("medium")
        ? "medium"
        : couplingStrengths.includes("low")
          ? "low"
          : null;
  const strategyStatuses = unique(
    recommendations
      .map((entry) => entry.portfolioBidStrategyStatus)
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
  );
  const portfolioBidStrategyStatus: GooglePortfolioStrategyStatus | null =
    strategyStatuses.includes("learning")
      ? "learning"
      : strategyStatuses.includes("limited")
        ? "limited"
        : strategyStatuses.includes("misconfigured")
          ? "misconfigured"
          : strategyStatuses.includes("stable")
            ? "stable"
            : strategyStatuses.includes("unknown")
              ? "unknown"
              : null;
  const contaminationSources = unique(
    recommendations
      .map((entry) => entry.portfolioContaminationSource)
      .filter((value): value is NonNullable<typeof value> => Boolean(value) && value !== "none")
  );
  const portfolioContaminationSource: GooglePortfolioContaminationSource | null =
    contaminationSources.includes("mixed_allocator_contamination")
      ? "mixed_allocator_contamination"
      : contaminationSources.includes("portfolio_strategy_contamination")
        ? "portfolio_strategy_contamination"
        : contaminationSources.includes("shared_budget_contamination")
          ? "shared_budget_contamination"
          : null;
  const contaminationSeverities = recommendations
    .map((entry) => entry.portfolioContaminationSeverity)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  const portfolioContaminationSeverity: GooglePortfolioContaminationSeverity | null =
    contaminationSeverities.includes("critical")
      ? "critical"
      : contaminationSeverities.includes("high")
        ? "high"
        : contaminationSeverities.includes("medium")
          ? "medium"
          : contaminationSeverities.includes("low")
            ? "low"
            : null;
  const cascadeRiskBands = unique(
    recommendations
      .map((entry) => entry.portfolioCascadeRiskBand)
      .filter((value): value is NonNullable<typeof value> => Boolean(value) && value !== "unknown")
  );
  const portfolioCascadeRiskBand: GooglePortfolioCascadeRiskBand =
    cascadeRiskBands.includes("broad")
      ? "broad"
      : cascadeRiskBands.includes("moderate")
        ? "moderate"
        : cascadeRiskBands.includes("contained")
          ? "contained"
          : "unknown";
  const portfolioCampaignShareValues = recommendations
    .map((entry) => Number(entry.portfolioCampaignShare ?? NaN))
    .filter((value) => Number.isFinite(value));
  const portfolioCampaignShare =
    portfolioCampaignShareValues.length > 0 ? Math.max(...portfolioCampaignShareValues) : null;
  const portfolioDominance =
    portfolioCouplingStrength === "high"
      ? ("high" as const)
      : portfolioCouplingStrength === "medium"
        ? ("medium" as const)
        : portfolioCouplingStrength === "low"
          ? ("low" as const)
          : null;
  const portfolioAttributionWindowDays = recommendations
    .map((entry) => Number(entry.portfolioAttributionWindowDays ?? NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0] ?? null;
  return {
    sharedStateGovernanceType,
    sharedStateAwarenessStatus,
    allocatorCoupled,
    allocatorCouplingConfidence: allocatorCoupled ? ("high" as const) : sharedStateGovernanceType === "standalone" ? ("medium" as const) : null,
    governedEntityCount:
      coupledCampaignIds.length > 0
        ? coupledCampaignIds.length
        : recommendations
            .flatMap((entry) => entry.affectedCampaignIds ?? [])
            .filter(Boolean).length || null,
    sharedBudgetResourceName: sharedBudgetResourceNames.length === 1 ? sharedBudgetResourceNames[0] : null,
    portfolioBidStrategyResourceName: portfolioResourceNames.length === 1 ? portfolioResourceNames[0] : null,
    portfolioBidStrategyType:
      unique(
        recommendations
          .map((entry) => entry.portfolioBidStrategyType)
          .filter((value): value is string => Boolean(value))
      )[0] ?? null,
    portfolioBidStrategyStatus,
    portfolioTargetType:
      unique(
        recommendations
          .map((entry) => entry.portfolioTargetType)
          .filter((value): value is string => Boolean(value))
      )[0] ?? null,
    portfolioTargetValue:
      recommendations
        .map((entry) => Number(entry.portfolioTargetValue ?? NaN))
        .find((value) => Number.isFinite(value)) ?? null,
    portfolioGovernanceStatus,
    portfolioCouplingStrength,
    portfolioCampaignShare,
    portfolioDominance,
    portfolioContaminationSource,
    portfolioContaminationSeverity,
    portfolioCascadeRiskBand,
    portfolioAttributionWindowDays,
    portfolioBlockedReason: recommendations.map((entry) => entry.portfolioBlockedReason).find(Boolean) ?? null,
    portfolioCautionReason: recommendations.map((entry) => entry.portfolioCautionReason).find(Boolean) ?? null,
    portfolioUnlockGuidance: recommendations.map((entry) => entry.portfolioUnlockGuidance).find(Boolean) ?? null,
    coupledCampaignIds,
    coupledCampaignNames,
    sharedStateMutateBlockedReason:
      recommendations.map((entry) => entry.sharedStateMutateBlockedReason).find(Boolean) ?? null,
    sharedStateContaminationFlag: recommendations.some((entry) => entry.sharedStateContaminationFlag === true),
  };
}

function isCleanupRecommendation(recommendation: GoogleRecommendation) {
  return recommendation.type === "query_governance" || recommendation.type === "creative_asset_deployment";
}

function isBudgetExpansionRecommendation(recommendation: GoogleRecommendation) {
  return (
    recommendation.type === "pmax_scaling_fit" ||
    recommendation.type === "geo_device_adjustment" ||
    recommendation.type === "budget_reallocation"
  );
}

function recommendationMoveKey(
  recommendation: GoogleRecommendation,
  allRecommendations: GoogleRecommendation[]
) {
  const related = allRecommendations.filter((candidate) => {
    const directlyLinked =
      candidate.id === recommendation.id ||
      candidate.dependsOnRecommendationIds?.includes(recommendation.id) ||
      recommendation.dependsOnRecommendationIds?.includes(candidate.id);
    const sameScope = entityScopeKey(candidate) === entityScopeKey(recommendation);
    return directlyLinked || sameScope;
  });
  const hasCleanup = related.some(isCleanupRecommendation);
  const hasBudget = related.some(isBudgetExpansionRecommendation);
  if (!hasCleanup || !hasBudget) return null;
  const memberIds = unique(related.map((entry) => entry.id)).sort();
  return `move|${entityScopeKey(recommendation)}|members:${memberIds.join(",")}`;
}

function inferClusterType(recommendations: GoogleRecommendation[]): GoogleActionClusterType {
  const hasBudgetReallocation = recommendations.some((entry) => entry.type === "budget_reallocation");
  const hasBudgetIncrease = recommendations.some(
    (entry) => entry.type === "pmax_scaling_fit" || entry.type === "geo_device_adjustment"
  );
  const hasCleanup = recommendations.some(
    (entry) => entry.type === "query_governance" || entry.type === "creative_asset_deployment"
  );
  const hasOverlap = recommendations.some(
    (entry) =>
      entry.type === "search_shopping_overlap" ||
      entry.type === "brand_leakage" ||
      entry.type === "orphaned_non_brand_demand"
  );
  if (hasCleanup && hasBudgetReallocation) return "cleanup_then_reallocate";
  if (hasCleanup && hasBudgetIncrease) return "cleanup_then_scale";
  if (hasBudgetReallocation) return "pure_reallocation";
  if (hasOverlap) return "overlap_resolution";
  if (recommendations.every((entry) => entry.type === "creative_asset_deployment")) return "asset_cleanup";
  return "cleanup_only";
}

function inferClusterObjective(type: GoogleActionClusterType, recommendations: GoogleRecommendation[]) {
  switch (type) {
    case "cleanup_then_scale":
      return "Clean demand leakage first, then unlock safe budget scale.";
    case "cleanup_then_reallocate":
      return "Clean waste first, then shift saved spend into a better lane.";
    case "pure_reallocation":
      return "Reallocate budget from weaker lanes into stronger demand capture.";
    case "overlap_resolution":
      return "Resolve overlap and ownership conflicts before any further scaling.";
    case "asset_cleanup":
      return "Remove wasteful assets before further creative expansion.";
    default:
      return recommendations[0]?.recommendedAction ?? "Execute the highest-confidence cleanup move.";
  }
}

function clusterTrustBand(recommendations: GoogleRecommendation[]): GoogleExecutionTrustBand | null {
  const bands = recommendations
    .map((entry) => entry.executionTrustBand)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (bands.includes("low")) return "low";
  if (bands.includes("insufficient_data")) return "insufficient_data";
  if (bands.includes("medium")) return "medium";
  if (bands.includes("high")) return "high";
  return null;
}

function outcomeConfidenceFromRecommendations(recommendations: GoogleRecommendation[]): GoogleOutcomeConfidence | null {
  const confidences = recommendations
    .map((entry) => entry.outcomeConfidence)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (confidences.includes("low")) return "low";
  if (confidences.includes("medium")) return "medium";
  if (confidences.includes("high")) return "high";
  return null;
}

function clusterReadiness(recommendations: GoogleRecommendation[]): GoogleClusterReadiness {
  if (
    recommendations.some(
      (entry) =>
        entry.dependencyReadiness === "done_degraded" ||
        entry.outcomeVerdict === "degraded" ||
        entry.executionStatus === "failed"
    )
  ) {
    return "degraded";
  }
  const executable = recommendations.filter((entry) => entry.executionMode === "mutate_ready");
  const blocked = recommendations.filter(
    (entry) =>
      entry.dependencyReadiness === "not_ready" || entry.dependencyReadiness === "done_degraded"
  );
  const unverified = recommendations.some(
    (entry) =>
      entry.dependencyReadiness === "done_unverified" ||
      entry.executionTrustBand === "insufficient_data" ||
      (entry.stabilizationHoldUntil && Date.parse(entry.stabilizationHoldUntil) > Date.now())
  );
  if (blocked.length > 0 && executable.length > 0) return "partially_executable";
  if (blocked.length > 0) return "blocked";
  if (unverified) return executable.length > 0 ? "ready_unverified" : "staging";
  if (executable.length > 0) return "ready_trusted";
  return "staging";
}

function clusterBucket(readiness: GoogleClusterReadiness): GoogleActionClusterBucket {
  if (readiness === "ready_trusted" || readiness === "partially_executable") return "now";
  if (readiness === "ready_unverified" || readiness === "staging") return "next";
  return "blocked";
}

function clusterStatus(
  recommendations: GoogleRecommendation[],
  readiness: GoogleClusterReadiness
): GoogleActionCluster["clusterStatus"] {
  if (recommendations.some((entry) => entry.executionStatus === "pending")) return "executing";
  if (recommendations.some((entry) => entry.rollbackExecutedAt)) return "rolled_back";
  const appliedCount = recommendations.filter(
    (entry) => entry.executionStatus === "applied" || entry.executionStatus === "partially_applied"
  ).length;
  if (readiness === "degraded") return "degraded";
  if (readiness === "blocked") return "blocked";
  if (appliedCount === 0) return "new";
  if (appliedCount < recommendations.length) return "partially_completed";
  return "completed";
}

function outcomeState(recommendations: GoogleRecommendation[]): {
  verdict: GoogleClusterOutcomeState;
  confidence: GoogleActionCluster["outcomeState"]["confidence"];
  failReason: string | null;
  lastValidationCheckAt: string | null;
} {
  const outcomeVerdicts = recommendations.map((entry) => entry.outcomeVerdict).filter(Boolean);
  const lastValidationCheckAt = recommendations
    .map((entry) => entry.outcomeCheckAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .slice(-1)[0] ?? null;
  if (outcomeVerdicts.length === 0 || outcomeVerdicts.every((value) => value === "unknown")) {
    return { verdict: "unvalidated", confidence: null, failReason: null, lastValidationCheckAt };
  }
  if (outcomeVerdicts.includes("degraded")) {
    return {
      verdict: recommendations.some((entry) => entry.outcomeVerdict === "improved") ? "mixed" : "degraded",
      confidence:
        recommendations.some((entry) => entry.outcomeConfidence === "high")
          ? "high"
          : recommendations.some((entry) => entry.outcomeConfidence === "medium")
            ? "medium"
            : "low",
      failReason:
        recommendations.find((entry) => entry.outcomeVerdictFailReason)?.outcomeVerdictFailReason ?? null,
      lastValidationCheckAt,
    };
  }
  if (outcomeVerdicts.includes("improved")) {
    return {
      verdict: recommendations.some((entry) => entry.outcomeVerdict === "unknown") ? "stabilizing" : "resolved",
      confidence:
        recommendations.some((entry) => entry.outcomeConfidence === "high")
          ? "high"
          : recommendations.some((entry) => entry.outcomeConfidence === "medium")
            ? "medium"
            : "low",
      failReason: null,
      lastValidationCheckAt,
    };
  }
  return {
    verdict: "stabilizing",
    confidence:
      recommendations.some((entry) => entry.outcomeConfidence === "high")
        ? "high"
        : recommendations.some((entry) => entry.outcomeConfidence === "medium")
          ? "medium"
          : "low",
    failReason: null,
    lastValidationCheckAt,
  };
}

function stepOrderWeight(recommendation: GoogleRecommendation) {
  if (recommendation.type === "query_governance") return 10;
  if (recommendation.type === "creative_asset_deployment") return 20;
  if (
    recommendation.type === "search_shopping_overlap" ||
    recommendation.type === "brand_leakage" ||
    recommendation.type === "orphaned_non_brand_demand"
  ) {
    return 30;
  }
  if (recommendation.mutateActionType === "adjust_campaign_budget" || recommendation.mutateActionType === "adjust_shared_budget") return 40;
  return 50;
}

function stepCriticalityForRecommendation(
  recommendation: GoogleRecommendation,
  clusterType: GoogleActionClusterType
): GoogleActionClusterStepCriticality {
  if (
    recommendation.type === "query_governance" ||
    recommendation.type === "creative_asset_deployment"
  ) {
    return clusterType === "cleanup_then_scale" || clusterType === "cleanup_then_reallocate"
      ? "critical"
      : "supporting";
  }
  if (
    recommendation.type === "budget_reallocation" ||
    recommendation.mutateActionType === "adjust_campaign_budget" ||
    recommendation.mutateActionType === "adjust_shared_budget"
  ) {
    return "critical";
  }
  if (
    recommendation.type === "search_shopping_overlap" ||
    recommendation.type === "brand_leakage" ||
    recommendation.type === "orphaned_non_brand_demand"
  ) {
    return "validation";
  }
  if (recommendation.executionMode === "handoff") return "optional";
  return "supporting";
}

function failureBoundaryForCriticality(
  criticality: GoogleActionClusterStepCriticality
): GoogleActionClusterStepFailureBoundary {
  if (criticality === "critical") return "invalidate_move";
  if (criticality === "supporting" || criticality === "rollback_sensitive") return "degrade_move";
  return "continue_with_caution";
}

function validationRoleForRecommendation(
  recommendation: GoogleRecommendation,
  criticality: GoogleActionClusterStepCriticality
): GoogleActionClusterStepValidationRole {
  if (
    recommendation.mutateActionType === "adjust_campaign_budget" ||
    recommendation.mutateActionType === "adjust_shared_budget" ||
    recommendation.type === "budget_reallocation"
  ) {
    return "unlock_gate";
  }
  if (criticality === "validation") return "outcome_check";
  return "supporting_signal";
}

function buildSteps(recommendations: GoogleRecommendation[], clusterType: GoogleActionClusterType): GoogleActionClusterStep[] {
  const sorted = [...recommendations].sort(
    (a, b) => stepOrderWeight(a) - stepOrderWeight(b) || b.rankScore - a.rankScore
  );
  const steps: GoogleActionClusterStep[] = [];
  const consumedFingerprints = new Set<string>();

  for (const recommendation of sorted) {
    if (consumedFingerprints.has(recommendation.recommendationFingerprint)) continue;
    if (
      recommendation.executionMode === "mutate_ready" &&
      recommendation.batchEligible &&
      recommendation.batchGroupKey
    ) {
      const members = sorted.filter(
        (entry) =>
          entry.batchEligible &&
          entry.batchGroupKey === recommendation.batchGroupKey &&
          entry.mutateActionType === recommendation.mutateActionType
      );
      for (const member of members) consumedFingerprints.add(member.recommendationFingerprint);
      const stepCriticality = members.some((entry) => stepCriticalityForRecommendation(entry, clusterType) === "critical")
        ? "critical"
        : members.some((entry) => stepCriticalityForRecommendation(entry, clusterType) === "supporting")
          ? "supporting"
          : "validation";
      steps.push({
        stepId: `step-${steps.length + 1}-${recommendation.batchGroupKey}`,
        title: recommendation.mutateActionType === "pause_asset" ? "Pause wasteful assets" : "Apply negative keyword cleanup",
        stepType: "batch_mutate",
        required: true,
        stepCriticality,
        stepFailureBoundary: failureBoundaryForCriticality(stepCriticality),
        stepValidationRole: validationRoleForRecommendation(recommendation, stepCriticality),
        executionMode: "mutate_ready",
        mutateActionType: recommendation.mutateActionType,
        recommendationIds: members.map((entry) => entry.id),
        recommendationFingerprints: members.map((entry) => entry.recommendationFingerprint),
        batchGroupKey: recommendation.batchGroupKey,
        executionTrustBand: clusterTrustBand(members),
        dependencyReadiness: members[0]?.dependencyReadiness ?? null,
        stabilizationHoldUntil: members
          .map((entry) => entry.stabilizationHoldUntil)
          .filter((value): value is string => Boolean(value))
          .sort()
          .slice(-1)[0] ?? null,
        transactionIds: members.map((entry) => entry.transactionId ?? "").filter(Boolean),
        batchItems: members.map((entry) => ({
          recommendationFingerprint: entry.recommendationFingerprint,
          mutateActionType: entry.mutateActionType as "add_negative_keyword" | "pause_asset",
          mutatePayloadPreview: entry.mutatePayloadPreview ?? {},
          rollbackActionType: entry.rollbackActionType as "remove_negative_keyword" | "enable_asset" | null,
          rollbackPayloadPreview: entry.rollbackPayloadPreview ?? null,
          executionTrustBand: entry.executionTrustBand ?? null,
          batchGroupKey: entry.batchGroupKey ?? null,
        })),
        mutateItem: null,
      });
      continue;
    }

    consumedFingerprints.add(recommendation.recommendationFingerprint);
    const stepType = recommendation.executionMode === "mutate_ready" ? "mutate" : "handoff";
    const stepCriticality = stepCriticalityForRecommendation(recommendation, clusterType);
    steps.push({
      stepId: `step-${steps.length + 1}-${recommendation.id}`,
      title: recommendation.title,
      stepType,
      required: recommendation.executionMode !== "mutate_ready",
      stepCriticality,
      stepFailureBoundary: failureBoundaryForCriticality(stepCriticality),
      stepValidationRole: validationRoleForRecommendation(recommendation, stepCriticality),
      executionMode: recommendation.executionMode ?? "handoff",
      mutateActionType: recommendation.mutateActionType ?? null,
      recommendationIds: [recommendation.id],
      recommendationFingerprints: [recommendation.recommendationFingerprint],
      batchGroupKey: recommendation.batchGroupKey ?? null,
      executionTrustBand: recommendation.executionTrustBand ?? null,
      dependencyReadiness: recommendation.dependencyReadiness ?? null,
      stabilizationHoldUntil: recommendation.stabilizationHoldUntil ?? null,
      transactionIds: recommendation.transactionId ? [recommendation.transactionId] : [],
      batchItems: null,
      mutateItem:
        recommendation.executionMode === "mutate_ready" &&
        recommendation.mutateActionType &&
        recommendation.mutatePayloadPreview
          ? {
              recommendationFingerprint: recommendation.recommendationFingerprint,
              mutateActionType: recommendation.mutateActionType,
              mutatePayloadPreview: recommendation.mutatePayloadPreview,
              rollbackActionType: recommendation.rollbackActionType ?? null,
              rollbackPayloadPreview: recommendation.rollbackPayloadPreview ?? null,
              executionTrustBand: recommendation.executionTrustBand ?? null,
              dependencyReadiness: recommendation.dependencyReadiness ?? null,
              stabilizationHoldUntil: recommendation.stabilizationHoldUntil ?? null,
            }
          : null,
    });
  }

  return steps;
}

function transientExecutionError(message: string | null | undefined) {
  const normalized = normalize(message);
  return normalized.includes("timeout") || normalized.includes("temporar") || normalized.includes("unavailable") || normalized.includes("throttle");
}

function moveConfidenceFromState(input: {
  trustBand: GoogleExecutionTrustBand | null;
  outcomeConfidence: GoogleOutcomeConfidence | null;
  readiness: GoogleClusterReadiness;
  contaminationFlags: string[];
  portfolioCouplingStrength?: GooglePortfolioCouplingStrength | null;
}): GoogleOutcomeConfidence | null {
  if (input.contaminationFlags.length > 0) return "low";
  if (input.portfolioCouplingStrength === "high") return "low";
  if (input.portfolioCouplingStrength === "medium" && input.outcomeConfidence !== "high") return "low";
  if (input.readiness === "ready_unverified" || input.readiness === "partially_executable") return "low";
  if (input.outcomeConfidence) return input.outcomeConfidence;
  if (input.trustBand === "high") return "high";
  if (input.trustBand === "medium") return "medium";
  if (input.trustBand === "insufficient_data" || input.trustBand === "low") return "low";
  return null;
}

function deriveMoveValidity(input: {
  clusterType: GoogleActionClusterType;
  executionStatus: GoogleClusterExecutionStatus;
  outcomeVerdict: GoogleClusterOutcomeState;
  outcomeReason: string | null;
  steps: GoogleActionClusterStep[];
  completedChildStepIds: string[];
  failedChildStepIds: string[];
  contaminationFlags: string[];
}): { validity: GoogleClusterMoveValidity; reason: string } {
  if (input.executionStatus === "rolled_back") {
    return { validity: "reverted", reason: "All completed child transactions were rolled back." };
  }
  if (input.executionStatus === "partially_rolled_back" || input.executionStatus === "rollback_failed") {
    return { validity: "compromised", reason: "Rollback left residual child transactions that still need recovery." };
  }
  const failedCriticalStep = input.steps.some(
    (step) => input.failedChildStepIds.includes(step.stepId) && step.stepFailureBoundary === "invalidate_move"
  );
  if (failedCriticalStep || input.executionStatus === "failed") {
    return { validity: "failed", reason: "A critical child step failed, so the move never reached a valid end state." };
  }
  if (input.contaminationFlags.length > 0) {
    return {
      validity: "inconclusive",
      reason:
        input.contaminationFlags.includes("mixed_allocator_contamination")
          ? "Shared budget and portfolio governance overlap here, so allocator contamination keeps the move inconclusive."
          : input.contaminationFlags.includes("portfolio_strategy_contamination")
            ? "Portfolio-governed redistribution contaminated attribution, so the move remains inconclusive."
            : input.contaminationFlags.includes("shared_budget_contamination")
              ? "Shared-budget coupling contaminated attribution, so the move remains inconclusive."
              : "Concurrent changes or weak baseline conditions contaminated move attribution.",
    };
  }
  if (input.outcomeVerdict === "resolved") {
    return { validity: "valid", reason: input.outcomeReason ?? "The intended move objective validated cleanly." };
  }
  if (input.outcomeVerdict === "mixed" || input.outcomeVerdict === "degraded") {
    return {
      validity: input.completedChildStepIds.length > 0 ? "partially_effective" : "compromised",
      reason: input.outcomeReason ?? "Some child steps succeeded, but the move did not fully validate cleanly.",
    };
  }
  return {
    validity: "inconclusive",
    reason: input.outcomeReason ?? "Execution progressed, but the move still needs stronger validation before it can be trusted.",
  };
}

function recoveryModel(input: {
  executionStatus: GoogleClusterExecutionStatus;
  steps: GoogleActionClusterStep[];
  recommendations: GoogleRecommendation[];
  failedChildStepIds: string[];
}): {
  recoveryState: GoogleClusterRecoveryState | null;
  recoveryRecommendedAction: string | null;
  recoveryFailedChildStepIds: string[];
  rollbackRecoveryAvailable: boolean | null;
  retryEligibleFailedChildStepIds: string[];
  manualRecoveryInstructions: string[];
} {
  if (input.executionStatus !== "partially_rolled_back" && input.executionStatus !== "rollback_failed") {
    return {
      recoveryState: null,
      recoveryRecommendedAction: null,
      recoveryFailedChildStepIds: [],
      rollbackRecoveryAvailable: null,
      retryEligibleFailedChildStepIds: [],
      manualRecoveryInstructions: [],
    };
  }
  const retryEligibleFailedChildStepIds: string[] = [];
  const manualRecoveryInstructions: string[] = [];
  for (const stepId of input.failedChildStepIds) {
    const step = input.steps.find((entry) => entry.stepId === stepId);
    if (!step) continue;
    const relatedRecommendations = input.recommendations.filter((entry) =>
      step.recommendationFingerprints.includes(entry.recommendationFingerprint)
    );
    const retryable = relatedRecommendations.some((entry) => transientExecutionError(entry.executionError));
    if (retryable) retryEligibleFailedChildStepIds.push(stepId);
    const entityNames = unique(relatedRecommendations.map((entry) => entry.entityName ?? entry.title));
    manualRecoveryInstructions.push(
      `Review ${entityNames.join(", ")} and manually verify the ${step.title.toLowerCase()} reversal in Google Ads.`
    );
  }
  const recoveryState: GoogleClusterRecoveryState =
    retryEligibleFailedChildStepIds.length === input.failedChildStepIds.length
      ? "recoverable_retry"
      : retryEligibleFailedChildStepIds.length > 0
        ? "accepted_partial_revert"
        : "manual_recovery_required";
  return {
    recoveryState,
    recoveryRecommendedAction:
      recoveryState === "recoverable_retry"
        ? "Retry rollback for the failed child steps before accepting the move state."
        : recoveryState === "accepted_partial_revert"
          ? "Retry transient failures first, then accept the partial revert only if the remaining changes are stable."
          : "Use manual recovery for the remaining child steps before trusting this move again.",
    recoveryFailedChildStepIds: input.failedChildStepIds,
    rollbackRecoveryAvailable: input.failedChildStepIds.length > 0,
    retryEligibleFailedChildStepIds,
    manualRecoveryInstructions,
  };
}

export function buildActionClusters(input: {
  recommendations: GoogleRecommendation[];
}) {
  const groups = new Map<string, GoogleRecommendation[]>();

  for (const recommendation of input.recommendations) {
    const moveKey = recommendationMoveKey(recommendation, input.recommendations);
    let key = moveKey ?? recommendationGroupKey(recommendation);
    if (!moveKey && recommendation.dependsOnRecommendationIds?.length) {
      const dependencyGroup = input.recommendations.find((entry) =>
        recommendation.dependsOnRecommendationIds?.includes(entry.id)
      );
      if (dependencyGroup) {
        key = recommendationGroupKey(dependencyGroup);
      }
    } else if (!moveKey) {
      const linkedBudgetRecommendation = input.recommendations.find(
        (entry) =>
          (entry.type === "pmax_scaling_fit" || entry.type === "budget_reallocation") &&
          overlap(entry.affectedCampaignIds ?? [], recommendation.affectedCampaignIds ?? [])
      );
      if (
        linkedBudgetRecommendation &&
        (recommendation.type === "query_governance" || recommendation.type === "creative_asset_deployment")
      ) {
        key = recommendationGroupKey(linkedBudgetRecommendation);
      }
    }
    const existing = groups.get(key) ?? [];
    existing.push(recommendation);
    groups.set(key, existing);
  }

  const clusters: GoogleActionCluster[] = Array.from(groups.entries()).map(([groupKey, recommendations]) => {
    const type = inferClusterType(recommendations);
    const sharedState = aggregateSharedState(recommendations);
    const readiness = clusterReadiness(recommendations);
    const bucket = clusterBucket(readiness);
    const trustBand = clusterTrustBand(recommendations);
    const rankScore = Number(
      (
        recommendations.reduce((sum, entry) => sum + Number(entry.rankScore ?? 0), 0) /
        Math.max(recommendations.length, 1)
      ).toFixed(2)
    );
    const steps = buildSteps(recommendations, type);
    const dependsOnClusterIds = unique(
      recommendations
        .flatMap((entry) => entry.dependsOnRecommendationIds ?? [])
        .filter((dependencyId) => !recommendations.some((entry) => entry.id === dependencyId))
        .map((dependencyId) => {
          const dependency = input.recommendations.find((entry) => entry.id === dependencyId);
          return dependency ? `cluster-${recommendationGroupKey(dependency)}` : "";
        })
        .filter(Boolean)
    );
    const memberExecutionStatuses = recommendations.map((entry) => entry.executionStatus);
    const childTransactionIds = unique(
      steps.flatMap((step) => step.transactionIds ?? []).filter(Boolean)
    );
    const completedChildStepIds = steps
      .filter((step) =>
        step.recommendationFingerprints.every((fingerprint) => {
          const recommendation = recommendations.find((entry) => entry.recommendationFingerprint === fingerprint);
          return recommendation?.executionStatus === "applied" || recommendation?.executionStatus === "partially_applied";
        })
      )
      .map((step) => step.stepId);
    const failedChildStepIds = steps
      .filter((step) =>
        step.recommendationFingerprints.some((fingerprint) => {
          const recommendation = recommendations.find((entry) => entry.recommendationFingerprint === fingerprint);
          return recommendation?.executionStatus === "failed";
        })
      )
      .map((step) => step.stepId);
    const clusterExecutionStatus: GoogleClusterExecutionStatus =
      memberExecutionStatuses.some((value) => value === "pending")
        ? "pending"
        : failedChildStepIds.length > 0 && completedChildStepIds.length > 0
          ? "partially_applied"
          : failedChildStepIds.length > 0
            ? "failed"
            : completedChildStepIds.length === 0
              ? "not_started"
              : recommendations.every((entry) => entry.rollbackExecutedAt)
                ? "rolled_back"
                : completedChildStepIds.length < steps.filter((step) => step.executionMode !== "handoff").length
                  ? "partially_applied"
                  : "applied";
    const lastExecutedAt = recommendations
      .map((entry) => entry.executedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .slice(-1)[0] ?? null;
    const lastRolledBackAt = recommendations
      .map((entry) => entry.rollbackExecutedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .slice(-1)[0] ?? null;

    const contaminationFlags = unique(
      recommendations.flatMap((entry) => {
        const flags: string[] = [];
        if (entry.outcomeVerdictFailReason === "concurrent_changes") flags.push("concurrent_changes");
        if (entry.outcomeVerdictFailReason === "missing_baseline") flags.push("missing_baseline");
        if (entry.executionTrustBand === "insufficient_data") flags.push("insufficient_signal");
        if (
          entry.portfolioContaminationSource === "shared_budget_contamination" &&
          entry.portfolioContaminationSeverity &&
          entry.portfolioContaminationSeverity !== "low"
        ) {
          flags.push("shared_budget_contamination");
        }
        if (entry.portfolioContaminationSource === "portfolio_strategy_contamination") {
          flags.push("portfolio_strategy_contamination");
        }
        if (entry.portfolioContaminationSource === "mixed_allocator_contamination") {
          flags.push("mixed_allocator_contamination");
        }
        return flags;
      })
    );
    const reallocationRecommendations = recommendations.filter((entry) => entry.type === "budget_reallocation");
    const sharedBudgetMutateRecommendations = recommendations.filter(
      (entry) => entry.mutateActionType === "adjust_shared_budget"
    );
    const reallocationNetImpact =
      reallocationRecommendations.length > 0
        ? {
            sourceDelta: Number(
              reallocationRecommendations
                .filter((entry) => entry.outcomeDelta && entry.outcomeDelta > 0)
                .reduce((sum, entry) => sum + Number(entry.outcomeDelta ?? 0), 0)
                .toFixed(2)
            ) || 0,
            destinationDelta: Number(
              reallocationRecommendations
                .filter((entry) => entry.outcomeDelta && entry.outcomeDelta < 0)
                .reduce((sum, entry) => sum + Math.abs(Number(entry.outcomeDelta ?? 0)), 0)
                .toFixed(2)
            ) || 0,
            netDelta: Number(
              reallocationRecommendations
                .reduce((sum, entry) => sum + Number(entry.outcomeDelta ?? 0), 0)
                .toFixed(2)
            ),
          }
        : null;
    const outcome = outcomeState(recommendations);
    let outcomeReason: string | null =
      type === "cleanup_only"
        ? "Waste and overlap pressure must materially decline before this move is treated as valid."
        : type === "cleanup_then_scale"
          ? "Cleanup must stabilize and the downstream scale step must avoid degrading the cleaned lane."
          : type === "cleanup_then_reallocate"
            ? "Cleanup must stabilize before capital shift is credited as a valid unlock."
            : type === "pure_reallocation"
              ? "Destination improvement must outweigh source degradation on a net basis."
              : "The move still needs structured validation before it can be trusted.";
    let derivedOutcomeVerdict = outcome.verdict;
    if (sharedBudgetMutateRecommendations.length > 0) {
      const poolNetDelta = Number(
        sharedBudgetMutateRecommendations.reduce((sum, entry) => sum + Number(entry.outcomeDelta ?? 0), 0).toFixed(2)
      );
      outcomeReason =
        "Shared-budget mutate is judged at the governed-pool level, not only on the triggering campaign.";
      if (poolNetDelta < 0 && contaminationFlags.length === 0) {
        derivedOutcomeVerdict = "resolved";
      } else if (poolNetDelta > 0 && contaminationFlags.length === 0) {
        derivedOutcomeVerdict = "degraded";
        outcomeReason = "The governed shared-budget pool is net negative so far, so the move remains degraded.";
      } else {
        derivedOutcomeVerdict = "stabilizing";
      }
    } else if (type === "pure_reallocation" || type === "cleanup_then_reallocate") {
      if (!reallocationNetImpact || reallocationNetImpact.netDelta === null) {
        derivedOutcomeVerdict = "stabilizing";
        outcomeReason = "Attribution is still insufficient to judge the net effect of the reallocation move.";
      } else if (reallocationNetImpact.netDelta < 0) {
        derivedOutcomeVerdict = "resolved";
        outcomeReason = "Destination gains currently outweigh source degradation on a net basis.";
      } else if (reallocationNetImpact.netDelta > 0) {
        derivedOutcomeVerdict = "degraded";
        outcomeReason = "Source degradation currently outweighs destination gains, so the move is net negative.";
      }
    } else if (type === "cleanup_then_scale" && recommendations.some((entry) => entry.dependencyReadiness === "done_unverified")) {
      derivedOutcomeVerdict = "stabilizing";
      outcomeReason = "Cleanup has executed, but the downstream scale outcome remains unverified until stabilization completes.";
    } else if (contaminationFlags.length > 0) {
      derivedOutcomeVerdict = "stabilizing";
      outcomeReason = "Attribution is currently contaminated by concurrent changes or insufficient baseline strength.";
    }
    if (sharedState.portfolioContaminationSource === "shared_budget_contamination" && !contaminationFlags.includes("shared_budget_contamination")) {
      contaminationFlags.push("shared_budget_contamination");
    }
    if (sharedState.portfolioContaminationSource === "portfolio_strategy_contamination" && !contaminationFlags.includes("portfolio_strategy_contamination")) {
      contaminationFlags.push("portfolio_strategy_contamination");
    }
    if (sharedState.portfolioContaminationSource === "mixed_allocator_contamination" && !contaminationFlags.includes("mixed_allocator_contamination")) {
      contaminationFlags.push("mixed_allocator_contamination");
    }
    if (sharedState.portfolioGovernanceStatus === "dominant") {
      outcomeReason =
        "Portfolio-governed allocation is dominant here, so local move attribution remains strategy-coupled until a longer validation window completes.";
      derivedOutcomeVerdict = "stabilizing";
    } else if (sharedState.portfolioContaminationSource === "portfolio_strategy_contamination") {
      outcomeReason =
        "Attribution remains strategy-coupled because the governing portfolio can redistribute traffic across sibling campaigns.";
      derivedOutcomeVerdict = "stabilizing";
    } else if (sharedState.portfolioContaminationSource === "mixed_allocator_contamination") {
      outcomeReason =
        "Attribution remains mixed-state and allocator-coupled because shared budget and portfolio governance overlap here.";
      derivedOutcomeVerdict = "stabilizing";
    }
    const moveValidity = deriveMoveValidity({
      clusterType: type,
      executionStatus: clusterExecutionStatus,
      outcomeVerdict: derivedOutcomeVerdict,
      outcomeReason,
      steps,
      completedChildStepIds,
      failedChildStepIds,
      contaminationFlags,
    });
    const recovery = recoveryModel({
      executionStatus: clusterExecutionStatus,
      steps,
      recommendations,
      failedChildStepIds,
    });
    const clusterMoveConfidence = moveConfidenceFromState({
      trustBand,
      outcomeConfidence: outcomeConfidenceFromRecommendations(recommendations),
      readiness,
      contaminationFlags,
      portfolioCouplingStrength: sharedState.portfolioCouplingStrength,
    });
    const sourceSelectionReason =
      reallocationRecommendations
        .map((entry) => entry.executionPolicyReason)
        .find(Boolean) ?? null;

    return {
      clusterId: `cluster-${groupKey}`,
      clusterType: type,
      clusterObjective: inferClusterObjective(type, recommendations),
      clusterBucket: bucket,
      memberRecommendationIds: recommendations.map((entry) => entry.id),
      memberRecommendationFingerprints: recommendations.map((entry) => entry.recommendationFingerprint),
      clusterReadiness: readiness,
      clusterTrustBand: trustBand,
      clusterRankScore: rankScore,
      clusterRankReason:
        sharedState.sharedStateMutateBlockedReason
          ? `This move stays cautious because the budget surface is allocator-coupled: ${sharedState.sharedStateMutateBlockedReason}`
          : readiness === "blocked"
          ? "A required prerequisite or dependency still blocks this move."
          : readiness === "ready_unverified"
            ? "The move is nearly ready but still stabilizing or carrying unverified trust."
            : sourceSelectionReason && (type === "pure_reallocation" || type === "cleanup_then_reallocate")
              ? `This move ranks highly because the allocator rationale is explicit: ${sourceSelectionReason}`
              : "The grouped recommendations now form the highest-value operator move at this scope.",
      clusterStatus: clusterStatus(recommendations, readiness),
      clusterMoveValidity: moveValidity.validity,
      clusterMoveValidityReason: moveValidity.reason,
      clusterMoveConfidence,
      sharedStateGovernanceType: sharedState.sharedStateGovernanceType,
      sharedStateAwarenessStatus: sharedState.sharedStateAwarenessStatus,
      allocatorCoupled: sharedState.allocatorCoupled,
      allocatorCouplingConfidence: sharedState.allocatorCouplingConfidence,
      governedEntityCount: sharedState.governedEntityCount,
      sharedBudgetResourceName: sharedState.sharedBudgetResourceName,
      portfolioBidStrategyType: sharedState.portfolioBidStrategyType,
      portfolioBidStrategyResourceName: sharedState.portfolioBidStrategyResourceName,
      portfolioBidStrategyStatus: sharedState.portfolioBidStrategyStatus,
      portfolioTargetType: sharedState.portfolioTargetType,
      portfolioTargetValue: sharedState.portfolioTargetValue,
      portfolioGovernanceStatus: sharedState.portfolioGovernanceStatus,
      portfolioCouplingStrength: sharedState.portfolioCouplingStrength,
      portfolioCampaignShare: sharedState.portfolioCampaignShare,
      portfolioDominance: sharedState.portfolioDominance,
      portfolioContaminationSource: sharedState.portfolioContaminationSource,
      portfolioContaminationSeverity: sharedState.portfolioContaminationSeverity,
      portfolioCascadeRiskBand: sharedState.portfolioCascadeRiskBand,
      portfolioAttributionWindowDays: sharedState.portfolioAttributionWindowDays,
      portfolioBlockedReason: sharedState.portfolioBlockedReason,
      portfolioCautionReason: sharedState.portfolioCautionReason,
      portfolioUnlockGuidance: sharedState.portfolioUnlockGuidance,
      coupledCampaignIds: sharedState.coupledCampaignIds,
      coupledCampaignNames: sharedState.coupledCampaignNames,
      sharedStateMutateBlockedReason: sharedState.sharedStateMutateBlockedReason,
      sharedStateContaminationFlag: sharedState.sharedStateContaminationFlag,
      dependsOnClusterIds,
      unlocksClusterIds: [] as string[],
      conflictsWithClusterIds: [] as string[],
      recoveryState: recovery.recoveryState,
      recoveryRecommendedAction: recovery.recoveryRecommendedAction,
      recoveryFailedChildStepIds: recovery.recoveryFailedChildStepIds,
      rollbackRecoveryAvailable: recovery.rollbackRecoveryAvailable,
      executionSummary: {
        clusterExecutionId:
          recommendations
            .map((entry) => String(entry.clusterExecutionId ?? ""))
            .find(Boolean) ?? null,
        clusterExecutionStatus,
        childExecutionOrder: steps.map((step) => step.stepId),
        childTransactionIds,
        completedChildStepIds,
        failedChildStepIds,
        currentStepId:
          steps.find((step) =>
            step.recommendationFingerprints.some((fingerprint) => {
              const recommendation = recommendations.find((entry) => entry.recommendationFingerprint === fingerprint);
              return recommendation?.executionStatus === "pending";
            })
          )?.stepId ?? null,
        stopReason:
          failedChildStepIds.length > 0
            ? `A ${steps.find((step) => failedChildStepIds.includes(step.stepId))?.stepCriticality ?? "required"} child transaction failed before the move fully completed.`
            : sharedState.sharedStateMutateBlockedReason
              ? sharedState.sharedStateMutateBlockedReason
            : readiness === "blocked"
              ? "The move still depends on blocked prerequisite work."
              : null,
        retryEligibleFailedChildStepIds: recovery.retryEligibleFailedChildStepIds,
        manualRecoveryInstructions: recovery.manualRecoveryInstructions,
      },
      validationPlan: unique(recommendations.flatMap((entry) => entry.validationChecklist ?? [])).slice(0, 6),
      outcomeState: {
        ...outcome,
        verdict: derivedOutcomeVerdict,
        reason: outcomeReason,
        contaminationFlags,
        reallocationNetImpact,
      },
      steps,
      firstSeenAt:
        recommendations.map((entry) => entry.firstSeenAt).filter((value): value is string => Boolean(value)).sort()[0] ?? null,
      lastSeenAt:
        recommendations.map((entry) => entry.lastSeenAt).filter((value): value is string => Boolean(value)).sort().slice(-1)[0] ?? null,
      lastExecutedAt,
      lastRolledBackAt,
    } satisfies GoogleActionCluster;
  });

  const byId = new Map(clusters.map((cluster) => [cluster.clusterId, cluster]));
  for (const cluster of clusters) {
    for (const dependencyId of cluster.dependsOnClusterIds) {
      const dependency = byId.get(dependencyId);
      if (!dependency) continue;
      dependency.unlocksClusterIds = unique([...(dependency.unlocksClusterIds ?? ([] as string[])), cluster.clusterId]);
    }
  }

  for (const cluster of clusters) {
    const conflicts = clusters
      .filter(
        (other) =>
          other.clusterId !== cluster.clusterId &&
          overlap(
            cluster.memberRecommendationFingerprints,
            other.memberRecommendationFingerprints
          )
      )
      .map((other) => other.clusterId);
    cluster.conflictsWithClusterIds = unique(conflicts);
  }

  return clusters.sort((a, b) => {
    const bucketWeight = (value: GoogleActionClusterBucket) =>
      value === "now" ? 0 : value === "next" ? 1 : 2;
    return (
      bucketWeight(a.clusterBucket) - bucketWeight(b.clusterBucket) ||
      b.clusterRankScore - a.clusterRankScore ||
      a.clusterId.localeCompare(b.clusterId)
    );
  });
}

export async function executeActionCluster(input: {
  cluster: GoogleActionCluster;
  clusterExecutionId?: string;
  applyBatchStep: (step: GoogleActionClusterStep) => Promise<{ transactionId: string; ok: boolean }>;
  applyMutateStep: (step: GoogleActionClusterStep) => Promise<{ transactionId: string; ok: boolean }>;
}) {
  const clusterExecutionId = input.clusterExecutionId ?? `cluster-exec-${Date.now()}`;
  const completedChildStepIds: string[] = [];
  const failedChildStepIds: string[] = [];
  const childTransactionIds: string[] = [];
  let currentStepId: string | null = null;
  let stopReason: string | null = null;

  for (const step of input.cluster.steps) {
    if (step.executionMode === "handoff") {
      if (step.required) {
        stopReason = "A required handoff step is still manual and blocks parent execution.";
        break;
      }
      continue;
    }
    currentStepId = step.stepId;
    try {
      const result =
        step.stepType === "batch_mutate"
          ? await input.applyBatchStep(step)
          : await input.applyMutateStep(step);
      childTransactionIds.push(result.transactionId);
      if (!result.ok) {
        failedChildStepIds.push(step.stepId);
        stopReason = "A child step failed during execution.";
        break;
      }
      completedChildStepIds.push(step.stepId);
    } catch (error) {
      failedChildStepIds.push(step.stepId);
      stopReason = error instanceof Error ? error.message : "A child step failed during execution.";
      break;
    }
  }

  const clusterExecutionStatus: GoogleClusterExecutionStatus =
    failedChildStepIds.length > 0 && completedChildStepIds.length > 0
      ? "partially_applied"
      : failedChildStepIds.length > 0
        ? "failed"
        : completedChildStepIds.length === 0
          ? "failed"
          : "applied";

  return {
    clusterExecutionId,
    clusterExecutionStatus,
    childTransactionIds,
    completedChildStepIds,
    failedChildStepIds,
    currentStepId,
    stopReason,
  };
}

export async function rollbackActionCluster(input: {
  cluster: GoogleActionCluster;
  rollbackBatchStep: (step: GoogleActionClusterStep) => Promise<{ ok: boolean; errorMessage?: string | null; retryable?: boolean }>;
  rollbackMutateStep: (step: GoogleActionClusterStep) => Promise<{ ok: boolean; errorMessage?: string | null; retryable?: boolean }>;
}) {
  const completedChildStepIds: string[] = [];
  const failedChildStepIds: string[] = [];
  const retryEligibleFailedChildStepIds: string[] = [];
  const manualRecoveryInstructions: string[] = [];

  for (const step of [...input.cluster.steps].reverse()) {
    const canRollback =
      step.stepType === "batch_mutate"
        ? (step.batchItems ?? []).every((item) => item.rollbackActionType && item.rollbackPayloadPreview)
        : Boolean(step.mutateItem?.rollbackActionType && step.mutateItem?.rollbackPayloadPreview);
    if (!canRollback) continue;
    try {
      const result =
        step.stepType === "batch_mutate"
          ? await input.rollbackBatchStep(step)
          : await input.rollbackMutateStep(step);
      if (result.ok) completedChildStepIds.push(step.stepId);
      else {
        failedChildStepIds.push(step.stepId);
        if (result.retryable) retryEligibleFailedChildStepIds.push(step.stepId);
        manualRecoveryInstructions.push(
          result.errorMessage
            ? `${step.title}: ${result.errorMessage}`
            : `${step.title}: manually verify the rollback result in Google Ads.`
        );
      }
    } catch (error) {
      failedChildStepIds.push(step.stepId);
      const message = error instanceof Error ? error.message : "Rollback failed.";
      if (transientExecutionError(message)) retryEligibleFailedChildStepIds.push(step.stepId);
      manualRecoveryInstructions.push(`${step.title}: ${message}`);
    }
  }

  return {
    clusterExecutionStatus:
      failedChildStepIds.length === 0
        ? ("rolled_back" satisfies GoogleClusterExecutionStatus)
        : completedChildStepIds.length > 0
          ? ("partially_rolled_back" satisfies GoogleClusterExecutionStatus)
          : ("rollback_failed" satisfies GoogleClusterExecutionStatus),
    completedChildStepIds,
    failedChildStepIds,
    retryEligibleFailedChildStepIds,
    manualRecoveryInstructions,
  };
}
