import type {
  AssetPerformanceRow,
  CampaignPerformanceRow,
  ProductPerformanceRow,
  SearchTermPerformanceRow,
} from "@/lib/google-ads/intelligence-model";
import type {
  GoogleRecommendation,
  GoogleSharedStateAwarenessStatus,
  GoogleSharedStateGovernanceType,
} from "@/lib/google-ads/growth-advisor-types";

function advisorBucketWeight(bucket: "do_now" | "do_next" | "do_later") {
  return bucket === "do_now" ? 0 : bucket === "do_next" ? 1 : 2;
}

function memoryStatusWeight(status?: string | null) {
  return status === "escalated" ? 2 : status === "new" ? 1 : 0;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

export function buildGoogleAdsCampaignDeepLink(accountId: string, campaignId: string) {
  const ocid = accountId.replace(/-/g, "");
  return `https://ads.google.com/aw/campaigns?ocid=${encodeURIComponent(ocid)}&campaignId=${encodeURIComponent(campaignId)}`;
}

function groupedHandoffPlan(recommendation: GoogleRecommendation) {
  switch (recommendation.type) {
    case "brand_leakage":
      return {
        orderedHandoffSteps: [
          "Audit the growth lane collecting branded demand first.",
          "Apply brand negatives or exclusions in the leaking non-brand or PMax lane.",
          "Re-check branded query capture before scaling the growth lane again.",
        ],
        coreStepIds: ["audit_leakage_lane", "apply_brand_controls"],
        estimatedOperatorMinutes: 8,
      };
    case "search_shopping_overlap":
      return {
        orderedHandoffSteps: [
          "Review the overlapping Search and Shopping entities for the same SKU demand.",
          "Choose the primary owning lane for the SKU-specific traffic.",
          "Reduce duplicate capture in the secondary lane, then validate post-change efficiency.",
        ],
        coreStepIds: ["review_overlap", "choose_lane_owner"],
        estimatedOperatorMinutes: 12,
      };
    case "orphaned_non_brand_demand":
      return {
        orderedHandoffSteps: [
          "Build owned exact coverage for the most proven non-brand queries.",
          "Add adjacent phrase control around the recurring winners.",
          "Re-check whether PMax or mixed lanes still absorb the same demand after ownership is added.",
        ],
        coreStepIds: ["build_exact_coverage", "add_phrase_control"],
        estimatedOperatorMinutes: 10,
      };
    default:
      return {
        orderedHandoffSteps: [],
        coreStepIds: [],
        estimatedOperatorMinutes: null,
      };
  }
}

export function decorateAdvisorRecommendationsForExecution(input: {
  recommendations: GoogleRecommendation[];
  accountId?: string | null;
  selectedCampaigns?: Array<CampaignPerformanceRow & Record<string, unknown>>;
  selectedSearchTerms?: Array<SearchTermPerformanceRow & Record<string, unknown>>;
  selectedProducts?: Array<ProductPerformanceRow & Record<string, unknown>>;
  selectedAssets?: Array<AssetPerformanceRow & Record<string, unknown>>;
  executionCalibration?: {
    patterns?: Record<
      string,
      {
        success?: number;
        rollback?: number;
        degraded?: number;
        failure?: number;
        lastTrustBand?: string | null;
      }
    >;
  } | null;
}) {
  const normalize = (value: string | null | undefined) =>
    String(value ?? "")
      .toLowerCase()
      .trim();
  const stabilizationHoldMs = 48 * 60 * 60 * 1000;
  const minimumTrustObservations = (mutateActionType: string) =>
    mutateActionType === "adjust_campaign_budget"
      ? 6
      : mutateActionType === "pause_asset"
        ? 4
        : 3;
  const currentAccountBudget = (input.selectedCampaigns ?? []).reduce(
    (sum, campaign) => sum + Number(campaign.dailyBudget ?? 0),
    0
  );
  const currentAccountSpend = (input.selectedCampaigns ?? []).reduce(
    (sum, campaign) => sum + Number(campaign.spend ?? 0),
    0
  );
  const accountOverpacing = currentAccountBudget > 0 && currentAccountSpend > currentAccountBudget * 1.25;
  const campaignById = new Map(
    (input.selectedCampaigns ?? []).map((campaign) => [String(campaign.campaignId ?? ""), campaign])
  );
  const sharedBudgetGroups = (input.selectedCampaigns ?? []).reduce<
    Map<string, Array<CampaignPerformanceRow & Record<string, unknown>>>
  >((acc, campaign) => {
    const resourceName = String(campaign.campaignBudgetResourceName ?? "");
    if (!resourceName || campaign.budgetExplicitlyShared !== true) return acc;
    const existing = acc.get(resourceName) ?? [];
    existing.push(campaign);
    acc.set(resourceName, existing);
    return acc;
  }, new Map());
  const portfolioGroups = (input.selectedCampaigns ?? []).reduce<
    Map<string, Array<CampaignPerformanceRow & Record<string, unknown>>>
  >((acc, campaign) => {
    const resourceName = String(campaign.portfolioBidStrategyResourceName ?? "");
    if (!resourceName) return acc;
    const existing = acc.get(resourceName) ?? [];
    existing.push(campaign);
    acc.set(resourceName, existing);
    return acc;
  }, new Map());

  function uniqueByCampaignIds(
    campaigns: Array<(CampaignPerformanceRow & Record<string, unknown>) | undefined>
  ) {
    const seen = new Set<string>();
    return campaigns.filter((campaign): campaign is CampaignPerformanceRow & Record<string, unknown> => {
      if (!campaign?.campaignId) return false;
      const key = String(campaign.campaignId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const recommendationCampaignIds = (recommendation: GoogleRecommendation) => {
    const ids = new Set<string>();
    if (recommendation.level === "campaign" && recommendation.entityId) {
      ids.add(String(recommendation.entityId));
    }
    for (const campaignId of recommendation.affectedCampaignIds ?? []) {
      if (campaignId) ids.add(String(campaignId));
    }
    if (ids.size === 0 && recommendation.type === "pmax_scaling_fit") {
      for (const campaign of input.selectedCampaigns ?? []) {
        const channel = String(campaign.channel ?? "").toUpperCase();
        if (channel === "PERFORMANCE_MAX" && campaign.campaignId) {
          ids.add(String(campaign.campaignId));
        }
      }
    }
    if (ids.size === 0 && recommendation.type === "budget_reallocation") {
      for (const campaign of input.selectedCampaigns ?? []) {
        if (campaign.campaignId) ids.add(String(campaign.campaignId));
      }
    }
    return Array.from(ids);
  };

  const sharedStateContextForCampaignIds = (campaignIds: string[]) => {
    const campaigns = uniqueByCampaignIds(campaignIds.map((campaignId) => campaignById.get(campaignId)).filter(Boolean));
    const awarenessStatus: GoogleSharedStateAwarenessStatus =
      campaigns.length > 0 && campaigns.every((campaign) => typeof campaign.budgetExplicitlyShared === "boolean")
        ? "known"
        : "not_ingested";
    const sharedBudgetResourceNames = Array.from(
      new Set(
        campaigns
          .filter((campaign) => campaign.budgetExplicitlyShared === true)
          .map((campaign) => String(campaign.campaignBudgetResourceName ?? ""))
          .filter(Boolean)
      )
    );
    const coupledCampaigns = uniqueByCampaignIds(
      sharedBudgetResourceNames.flatMap((resourceName) => sharedBudgetGroups.get(resourceName) ?? [])
    );
    const portfolioCoupledCampaigns = uniqueByCampaignIds(
      Array.from(
        new Set(
          campaigns
            .map((campaign) => String(campaign.portfolioBidStrategyResourceName ?? ""))
            .filter(Boolean)
        )
      ).flatMap((resourceName) => portfolioGroups.get(resourceName) ?? [])
    );
    const portfolioStrategies = Array.from(
      new Set(
        campaigns
          .map((campaign) => String(campaign.portfolioBidStrategyResourceName ?? ""))
          .filter(Boolean)
      )
    );
    const portfolioTypes = Array.from(
      new Set(
        campaigns
          .map((campaign) => String(campaign.portfolioBidStrategyType ?? ""))
          .filter(Boolean)
      )
    );
    const governanceType: GoogleSharedStateGovernanceType =
      sharedBudgetResourceNames.length > 0 && portfolioStrategies.length > 0
        ? "shared_budget_and_portfolio"
        : sharedBudgetResourceNames.length > 0
          ? "shared_budget"
          : portfolioStrategies.length > 0
            ? "portfolio_bid_strategy"
        : campaigns.length > 0
          ? "standalone"
          : "unknown";
    const allocatorCoupled = sharedBudgetResourceNames.length > 0;
    const governedCampaignSet = allocatorCoupled
      ? coupledCampaigns
      : portfolioCoupledCampaigns.length > 0
        ? portfolioCoupledCampaigns
        : campaigns;
    const portfolioGovernedCampaigns = uniqueByCampaignIds(
      governedCampaignSet.filter((campaign) => Boolean(campaign.portfolioBidStrategyResourceName))
    );
    const portfolioCampaignShareRaw =
      governedCampaignSet.length > 0
        ? Number(((portfolioGovernedCampaigns.length / governedCampaignSet.length) * 100).toFixed(2))
        : null;
    const portfolioCampaignShare = portfolioStrategies.length > 0 ? portfolioCampaignShareRaw : null;
    const portfolioCouplingStrength =
      portfolioCampaignShare === null
        ? null
        : portfolioCampaignShare >= 60
          ? ("high" as const)
          : portfolioCampaignShare >= 25
            ? ("medium" as const)
            : ("low" as const);
    const portfolioDominance =
      portfolioCouplingStrength === "high"
        ? ("high" as const)
        : portfolioCouplingStrength === "medium"
          ? ("medium" as const)
          : portfolioCouplingStrength === "low"
            ? ("low" as const)
            : null;
    const portfolioGovernanceStatus =
      campaigns.length === 0
        ? ("unknown" as const)
        : portfolioStrategies.length === 0
          ? ("none" as const)
          : portfolioCampaignShare !== null && portfolioCampaignShare >= 60
            ? ("dominant" as const)
            : allocatorCoupled || (portfolioCampaignShare !== null && portfolioCampaignShare < 100)
              ? ("mixed_governance" as const)
              : ("present" as const);
    const rawPortfolioStatuses = unique(
      governedCampaignSet
        .map((campaign) => String(campaign.portfolioBidStrategyStatus ?? "").toLowerCase())
        .filter(Boolean)
    );
    const portfolioStrategyStatus =
      rawPortfolioStatuses.some((status) => status.includes("learn"))
        ? ("learning" as const)
        : rawPortfolioStatuses.some((status) => status.includes("limit"))
          ? ("limited" as const)
          : rawPortfolioStatuses.some((status) => status.includes("misconfig") || status.includes("invalid"))
            ? ("misconfigured" as const)
            : portfolioStrategies.length > 0
              ? ("stable" as const)
              : ("unknown" as const);
    const portfolioTargetType =
      unique(
        governedCampaignSet
          .map((campaign) => String(campaign.portfolioTargetType ?? ""))
          .filter(Boolean)
      )[0] ?? null;
    const portfolioTargetValue = governedCampaignSet.find((campaign) =>
      Number.isFinite(Number(campaign.portfolioTargetValue ?? NaN))
    )?.portfolioTargetValue;
    const portfolioContaminationSource =
      allocatorCoupled && portfolioStrategies.length > 0
        ? ("mixed_allocator_contamination" as const)
        : portfolioStrategies.length > 0
          ? ("portfolio_strategy_contamination" as const)
          : allocatorCoupled
            ? ("shared_budget_contamination" as const)
            : ("none" as const);
    const portfolioContaminationSeverity =
      portfolioContaminationSource === "mixed_allocator_contamination"
        ? portfolioCouplingStrength === "high"
          ? ("critical" as const)
          : ("high" as const)
        : portfolioContaminationSource === "portfolio_strategy_contamination"
          ? portfolioCouplingStrength === "high"
            ? ("high" as const)
            : portfolioCouplingStrength === "medium"
              ? ("medium" as const)
              : ("low" as const)
          : allocatorCoupled
            ? ("low" as const)
            : null;
    const portfolioCascadeRiskBand =
      portfolioCouplingStrength === "high"
        ? ("broad" as const)
        : portfolioCouplingStrength === "medium"
          ? ("moderate" as const)
          : portfolioCouplingStrength === "low"
            ? ("contained" as const)
            : ("unknown" as const);
    const portfolioAttributionWindowDays =
      portfolioStrategies.length > 0 ? (portfolioCouplingStrength === "high" ? 21 : 14) : null;
    const portfolioBlockedReason =
      portfolioStrategies.length === 0
        ? null
        : portfolioStrategyStatus === "learning" || portfolioStrategyStatus === "limited" || portfolioStrategyStatus === "misconfigured"
          ? "Blocked: the governing portfolio strategy is unstable, so allocator truth remains too weak for safe native budget execution."
          : portfolioGovernanceStatus === "dominant"
            ? "Blocked: portfolio-governed allocation is dominant here, so local or shared budget execution would be strategy-coupled."
            : allocatorCoupled && portfolioStrategies.length > 0
              ? "Blocked: this shared budget surface also sits under portfolio governance, so Wave 15 keeps native mutate closed."
              : null;
    const portfolioCautionReason =
      portfolioStrategies.length === 0 || portfolioBlockedReason
        ? null
        : portfolioCouplingStrength === "medium" || portfolioCouplingStrength === "high"
          ? "Caution: portfolio allocation can absorb or mask local performance changes, so move truth is less isolated here."
          : "Caution: a portfolio strategy is present, so attribution remains somewhat allocator-coupled.";
    const portfolioUnlockGuidance =
      portfolioStrategies.length === 0
        ? null
        : portfolioBlockedReason
          ? "Let the governing strategy stabilize, avoid simultaneous allocator changes, and re-check eligibility after the next attribution window."
          : "Keep other allocator changes quiet and allow the portfolio attribution window to complete before trusting this move fully.";
    return {
      sharedStateGovernanceType: governanceType,
      sharedStateAwarenessStatus: awarenessStatus,
      allocatorCoupled,
      allocatorCouplingConfidence: allocatorCoupled ? ("high" as const) : campaigns.length > 0 ? ("medium" as const) : null,
      governedEntityCount: governedCampaignSet.length || null,
      sharedBudgetResourceName: sharedBudgetResourceNames.length === 1 ? sharedBudgetResourceNames[0] : null,
      portfolioBidStrategyType: portfolioTypes[0] ?? null,
      portfolioBidStrategyResourceName: portfolioStrategies[0] ?? null,
      portfolioBidStrategyStatus: portfolioStrategyStatus,
      portfolioTargetType,
      portfolioTargetValue:
        Number.isFinite(Number(portfolioTargetValue ?? NaN)) ? Number(portfolioTargetValue) : null,
      portfolioGovernanceStatus,
      portfolioCouplingStrength,
      portfolioCampaignShare,
      portfolioDominance,
      portfolioContaminationSource,
      portfolioContaminationSeverity,
      portfolioCascadeRiskBand,
      portfolioAttributionWindowDays,
      portfolioBlockedReason,
      portfolioCautionReason,
      portfolioUnlockGuidance,
      coupledCampaignIds: governedCampaignSet.map((campaign) => String(campaign.campaignId ?? "")).filter(Boolean),
      coupledCampaignNames: governedCampaignSet.map((campaign) => String(campaign.campaignName ?? "")).filter(Boolean),
      sharedStateContaminationFlag:
        portfolioContaminationSource === "portfolio_strategy_contamination" ||
        portfolioContaminationSource === "mixed_allocator_contamination",
      sharedStateMutateBlockedReason: allocatorCoupled
        ? portfolioBlockedReason ??
          (portfolioStrategies.length > 0
            ? "This move touches a shared budget surface with portfolio-governed campaigns, so native shared-budget mutate stays blocked."
            : "This move touches a shared budget surface, so local budget mutate remains blocked until shared-state execution opens.")
        : portfolioBlockedReason
          ? portfolioBlockedReason
          : portfolioCautionReason,
    };
  };

  const sharedStateContextForRecommendation = (recommendation: GoogleRecommendation) =>
    sharedStateContextForCampaignIds(recommendationCampaignIds(recommendation));

  const policySharedStateContext = (campaignIds: string[]) =>
    (() => {
      const context = sharedStateContextForCampaignIds(campaignIds);
      return [
        context.sharedStateGovernanceType ?? "unknown",
        context.portfolioGovernanceStatus ?? "unknown",
        context.portfolioCouplingStrength ?? "none",
      ].join(":");
    })();

  const portfolioStatusIsUnstable = (status?: string | null) => {
    const normalized = String(status ?? "").toLowerCase();
    return (
      normalized.includes("learn") ||
      normalized.includes("limit") ||
      normalized.includes("misconfig") ||
      normalized.includes("invalid")
    );
  };

  const sharedBudgetGovernedCampaigns = (sharedBudgetResourceName: string) =>
    uniqueByCampaignIds(sharedBudgetGroups.get(sharedBudgetResourceName) ?? []);

  const dominantIntentClass = (rows: Array<SearchTermPerformanceRow & Record<string, unknown>>) => {
    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.intentClass ?? "unknown");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  };

  const postDependencyTraffic = (recommendation: GoogleRecommendation) => {
    const dependencyCampaignIds = new Set(
      (recommendation.dependsOnRecommendationIds ?? [])
        .map((dependencyId) => input.recommendations.find((entry) => entry.id === dependencyId))
        .flatMap((dependency) => dependency?.affectedCampaignIds ?? (dependency?.entityId ? [dependency.entityId] : []))
        .map((value) => String(value ?? ""))
        .filter(Boolean)
    );
    if (dependencyCampaignIds.size === 0) return 0;
    return (input.selectedSearchTerms ?? [])
      .filter((row) => dependencyCampaignIds.has(String(row.campaignId ?? "")))
      .reduce((sum, row) => sum + Number(row.clicks ?? 0), 0);
  };

  const dependencyState = (recommendation: GoogleRecommendation) => {
    const dependencies = (recommendation.dependsOnRecommendationIds ?? [])
      .map((dependencyId) => input.recommendations.find((entry) => entry.id === dependencyId))
      .filter((entry): entry is GoogleRecommendation => Boolean(entry));
    if (dependencies.length === 0) {
      return {
        readiness: "done_trusted" as const,
        holdUntil: null as string | null,
      };
    }
    let readiness: "not_ready" | "done_unverified" | "done_trusted" | "done_degraded" = "done_trusted";
    let holdUntil: string | null = null;
    const now = Date.now();
    for (const dependency of dependencies) {
      const skippedCore = (dependency.skippedStepIds ?? []).some((stepId) =>
        (dependency.coreStepIds ?? []).includes(stepId)
      );
      if (skippedCore || dependency.completionMode === "partial") {
        return { readiness: "done_degraded" as const, holdUntil: null };
      }
      if (
        dependency.outcomeVerdict === "degraded" &&
        dependency.executedAt &&
        now - new Date(dependency.executedAt).getTime() >= stabilizationHoldMs
      ) {
        readiness = "done_unverified";
        holdUntil = new Date(now + 24 * 60 * 60 * 1000).toISOString();
        continue;
      }
      if (dependency.completionMode !== "full" && dependency.executionStatus !== "applied") {
        return { readiness: "not_ready" as const, holdUntil: null };
      }
      if (dependency.outcomeVerdict === "degraded") {
        return { readiness: "done_degraded" as const, holdUntil: null };
      }
      const completedAt = dependency.executedAt ?? dependency.appliedAt ?? null;
      if (completedAt) {
        const completedTs = new Date(completedAt).getTime();
        const trafficReady = postDependencyTraffic(recommendation) >= 100;
        if (Number.isFinite(completedTs) && (now - completedTs < stabilizationHoldMs || !trafficReady)) {
          readiness = "done_unverified";
          const nextHold = new Date(completedTs + stabilizationHoldMs).toISOString();
          if (!holdUntil) {
            holdUntil = nextHold;
          } else if (Date.parse(nextHold) > Date.parse(holdUntil)) {
            holdUntil = nextHold;
          }
        }
      } else {
        readiness = "done_unverified";
      }
    }
    return { readiness, holdUntil };
  };

  const executionPolicy = (inputPolicy: {
    mutateActionType: string;
    recommendationType: GoogleRecommendation["type"];
    dominantIntent: string;
    overlapSeverity?: string | null;
    commerceState?: string | null;
    dependencyReadiness?: string | null;
    sharedStateContext?: string | null;
  }) => {
    const policyPatternParts = [
      inputPolicy.mutateActionType,
      inputPolicy.recommendationType,
      inputPolicy.dominantIntent || "unknown",
      inputPolicy.overlapSeverity || "none",
      inputPolicy.commerceState || "none",
      inputPolicy.dependencyReadiness || "none",
    ];
    const policyPatternKey = [...policyPatternParts, inputPolicy.sharedStateContext || "unknown"].join("|");
    const governanceOnlySharedStateContext =
      String(inputPolicy.sharedStateContext ?? "").split(":")[0] || "unknown";
    const governanceOnlyPolicyPatternKey = [...policyPatternParts, governanceOnlySharedStateContext].join("|");
    const legacyPolicyPatternKey = policyPatternParts.join("|");
    const stats =
      input.executionCalibration?.patterns?.[policyPatternKey] ??
      input.executionCalibration?.patterns?.[governanceOnlyPolicyPatternKey] ??
      input.executionCalibration?.patterns?.[legacyPolicyPatternKey];
    const success = Number(stats?.success ?? 0);
    const rollback = Number(stats?.rollback ?? 0);
    const degraded = Number(stats?.degraded ?? 0);
    const failure = Number(stats?.failure ?? 0);
    const observations = success + rollback + degraded + failure;
    const governanceContext = String(inputPolicy.sharedStateContext ?? "");
    const portfolioAwareContext =
      governanceContext.includes("portfolio_bid_strategy") ||
      governanceContext.includes("shared_budget_and_portfolio") ||
      governanceContext.includes("dominant") ||
      governanceContext.includes("mixed_governance");
    const requiredObservations =
      minimumTrustObservations(inputPolicy.mutateActionType) + (portfolioAwareContext ? 3 : 0);
    if (observations < requiredObservations) {
      return {
        policyPatternKey,
        score: null,
        band: "insufficient_data" as const,
        source: "insufficient_data_fallback" as const,
        reason: `Execution policy is using insufficient-data fallback for this action pattern (${observations}/${requiredObservations} observations).`,
      };
    }
    const rawScore = Math.max(
      0,
      Math.min(100, 60 + success * 8 - rollback * 18 - failure * 16 - degraded * 10)
    );
    const score = Math.max(0, rawScore - (portfolioAwareContext ? 8 : 0));
    const band = score >= 75 ? "high" : score >= 45 ? "medium" : "low";
    const reason =
      rollback > 0
        ? "Prior rollback activity lowered execution trust for this action pattern."
        : failure > 0
          ? "Prior execution failures lowered execution trust for this action pattern."
          : degraded > 0
            ? "Prior degraded outcomes lowered execution trust for this action pattern."
            : success > 0
              ? portfolioAwareContext
                ? "Prior successful executions improved trust, but portfolio-governed allocator ambiguity still keeps this pattern more conservative."
                : "Prior successful executions improved trust for this action pattern."
              : "No strong execution history exists yet, so this pattern stays on default trust.";
    return { policyPatternKey, score, band, source: "observed_pattern" as const, reason };
  };

  const sharedBudgetRollbackWindowMs = 72 * 60 * 60 * 1000;
  const maxGovernedSharedBudgetEntities = 5;
  const maxDirectlyAdjustedCampaigns = 4;
  const maxSharedBudgetDeltaPercent = 15;

  const sharedBudgetMutationPreview = (inputPreview: {
    sharedBudgetResourceName: string;
    currentAmount: number;
    proposedAmount: number;
    governedCampaigns: Array<CampaignPerformanceRow & Record<string, unknown>>;
  }) => {
    const deltaPercent = Number(
      (((inputPreview.proposedAmount - inputPreview.currentAmount) / Math.max(inputPreview.currentAmount, 1)) * 100).toFixed(2)
    );
    return {
      sharedBudgetResourceName: inputPreview.sharedBudgetResourceName,
      previousAmount: inputPreview.currentAmount,
      proposedAmount: inputPreview.proposedAmount,
      deltaPercent,
      governedCampaigns: inputPreview.governedCampaigns.map((campaign) => ({
        id: String(campaign.campaignId ?? ""),
        name: String(campaign.campaignName ?? "Campaign"),
      })),
      zeroSumNote: "Single shared-budget mutate changes one shared pool amount only; no multi-pool transfer is performed.",
      boundedDelta: Math.abs(deltaPercent) <= maxSharedBudgetDeltaPercent,
    };
  };

  const buildSharedBudgetMutateFields = (inputFields: {
    recommendation: GoogleRecommendation;
    targetCampaign: CampaignPerformanceRow & Record<string, unknown>;
    deltaPercent: number;
    policy: ReturnType<typeof executionPolicy>;
    dependency: ReturnType<typeof dependencyState>;
    policyReasonPrefix?: string;
  }) => {
    const sharedBudgetResourceName = String(inputFields.targetCampaign.campaignBudgetResourceName ?? "");
    const governedCampaigns = sharedBudgetGovernedCampaigns(sharedBudgetResourceName);
    if (!sharedBudgetResourceName || governedCampaigns.length === 0) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason: "shared_budget_unresolved: the governed shared budget could not be resolved safely.",
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        sharedBudgetAdjustmentPreview: null,
        rollbackSafetyState: "blocked" as const,
        rollbackAvailableUntil: null,
      };
    }
    const currentBudgetValues = unique(
      governedCampaigns
        .map((campaign) => Number(campaign.dailyBudget ?? NaN))
        .filter((value) => Number.isFinite(value))
        .map((value) => Number(value.toFixed(2)))
    );
    if (currentBudgetValues.length !== 1) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          "shared_budget_drifted: governed campaigns no longer reflect one stable shared budget amount.",
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        sharedBudgetAdjustmentPreview: null,
        rollbackSafetyState: "blocked" as const,
        rollbackAvailableUntil: null,
      };
    }
    if (governedCampaigns.length > maxGovernedSharedBudgetEntities) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          `shared_budget_scope_too_large: this shared budget governs ${governedCampaigns.length} campaigns, above the Wave 14 safety cap of ${maxGovernedSharedBudgetEntities}.`,
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        sharedBudgetAdjustmentPreview: null,
        rollbackSafetyState: "blocked" as const,
        rollbackAvailableUntil: null,
      };
    }
    if (governedCampaigns.length > maxDirectlyAdjustedCampaigns) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          `shared_budget_adjustment_scope_too_large: this shared budget would affect ${governedCampaigns.length} campaigns, above the direct adjustment cap of ${maxDirectlyAdjustedCampaigns}.`,
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        sharedBudgetAdjustmentPreview: null,
        rollbackSafetyState: "blocked" as const,
        rollbackAvailableUntil: null,
      };
    }
    const portfolioCoupledCampaigns = governedCampaigns.filter((campaign) =>
      Boolean(campaign.portfolioBidStrategyResourceName)
    );
    const unstablePortfolioCampaigns = portfolioCoupledCampaigns.filter((campaign) => {
      const status = String(campaign.portfolioBidStrategyStatus ?? "").toLowerCase();
      return status.includes("learn") || status.includes("limit") || status.includes("misconfig") || status.includes("invalid");
    });
    if (unstablePortfolioCampaigns.length > 0) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          "shared_budget_portfolio_unstable: the governing portfolio strategy is still unstable, so Wave 15 keeps native shared-budget mutate blocked.",
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        sharedBudgetAdjustmentPreview: null,
        rollbackSafetyState: "blocked" as const,
        rollbackAvailableUntil: null,
      };
    }
    if (portfolioCoupledCampaigns.length > 0) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          "shared_budget_portfolio_coupled: portfolio-governed campaigns are inside this shared budget, so Wave 15 native shared-budget mutate remains blocked until strategy-aware allocator truth is stronger.",
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        sharedBudgetAdjustmentPreview: null,
        rollbackSafetyState: "blocked" as const,
        rollbackAvailableUntil: null,
      };
    }
    const currentAmount = currentBudgetValues[0] ?? NaN;
    const proposedAmount = Number((currentAmount * (1 + inputFields.deltaPercent / 100)).toFixed(2));
    if (!Number.isFinite(currentAmount) || currentAmount <= 0 || !Number.isFinite(proposedAmount) || proposedAmount <= 0) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason: "shared_budget_amount_invalid: this shared budget does not expose a safe mutable amount.",
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        sharedBudgetAdjustmentPreview: null,
        rollbackSafetyState: "blocked" as const,
        rollbackAvailableUntil: null,
      };
    }
    if (Math.abs(inputFields.deltaPercent) > maxSharedBudgetDeltaPercent) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          `shared_budget_delta_too_large: proposed delta exceeds the Wave 14 bound of ${maxSharedBudgetDeltaPercent}%.`,
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        sharedBudgetAdjustmentPreview: null,
        rollbackSafetyState: "blocked" as const,
        rollbackAvailableUntil: null,
      };
    }
    const rollbackAvailableUntil = new Date(Date.now() + sharedBudgetRollbackWindowMs).toISOString();
    const sharedBudgetAdjustmentPreview = sharedBudgetMutationPreview({
      sharedBudgetResourceName,
      currentAmount,
      proposedAmount,
      governedCampaigns,
    });
    return {
      executionMode: "mutate_ready" as const,
      mutateActionType: "adjust_shared_budget" as const,
      mutatePayloadPreview: {
        accountId: input.accountId,
        sharedBudgetResourceName,
        previousAmount: currentAmount,
        proposedAmount,
        deltaPercent: inputFields.deltaPercent,
        policyPatternKey: inputFields.policy.policyPatternKey,
        executionTrustBand: inputFields.policy.band,
        executionTrustSource: inputFields.policy.source,
        dependencyReadiness: inputFields.dependency.readiness,
        stabilizationHoldUntil: inputFields.dependency.holdUntil,
        governedCampaignIds: governedCampaigns.map((campaign) => String(campaign.campaignId ?? "")),
        governedCampaignNames: governedCampaigns.map((campaign) => String(campaign.campaignName ?? "Campaign")),
      },
      mutateEligibilityReason: null,
      canRollback: true,
      rollbackActionType: "restore_shared_budget" as const,
      rollbackPayloadPreview: {
        campaignBudgetResourceName: sharedBudgetResourceName,
        previousAmount: currentAmount,
        governedCampaignIds: governedCampaigns.map((campaign) => String(campaign.campaignId ?? "")),
        governedCampaignNames: governedCampaigns.map((campaign) => String(campaign.campaignName ?? "Campaign")),
      },
      budgetAdjustmentPreview: {
        previousAmount: currentAmount,
        proposedAmount,
        deltaPercent: inputFields.deltaPercent,
      },
      sharedBudgetAdjustmentPreview,
      rollbackSafetyState: "safe" as const,
      rollbackAvailableUntil,
      executionTrustScore: inputFields.policy.score,
      executionTrustBand: inputFields.policy.band,
      executionTrustSource: inputFields.policy.source,
      executionPolicyReason: [
        inputFields.policyReasonPrefix,
        inputFields.policy.reason,
        "Shared-budget mutate is allowed because one governed pool is fully known, bounded, and free of portfolio coupling.",
      ]
        .filter(Boolean)
        .join(" "),
      dependencyReadiness: inputFields.dependency.readiness,
      stabilizationHoldUntil: inputFields.dependency.holdUntil,
      batchEligible: false,
      batchGroupKey: null,
      transactionId: null,
      batchStatus: null,
      batchSize: governedCampaigns.length,
      batchRollbackAvailable: true,
      reallocationPreview: null,
    };
  };

  const buildMutateFields = (recommendation: GoogleRecommendation) => {
    const dependency = dependencyState(recommendation);
    const dependenciesReady = dependency.readiness === "done_trusted";
    if (
      !input.accountId ||
      recommendation.integrityState === "blocked" ||
      recommendation.integrityState === "suppressed" ||
      recommendation.dataTrust === "low" ||
      (recommendation.conflictsWithRecommendationIds?.length ?? 0) > 0 ||
      recommendation.currentStatus === "suppressed" ||
      (recommendation.type === "pmax_scaling_fit" || recommendation.type === "geo_device_adjustment"
        ? dependency.readiness === "not_ready" ||
          dependency.readiness === "done_degraded" ||
          dependency.readiness === "done_unverified"
        : !dependenciesReady)
    ) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          !input.accountId
            ? "A single Google Ads account must be selected before native execution is allowed."
            : recommendation.integrityState === "blocked" || recommendation.integrityState === "suppressed"
              ? "This recommendation is blocked by the deterministic integrity layer."
              : recommendation.dataTrust === "low"
                ? "Data trust is too low for native execution."
                : (recommendation.conflictsWithRecommendationIds?.length ?? 0) > 0
                  ? "This recommendation still conflicts with another active recommendation."
                  : recommendation.currentStatus === "suppressed"
                    ? "Suppressed recommendations are not eligible for native execution."
                    : (recommendation.type === "pmax_scaling_fit" || recommendation.type === "geo_device_adjustment") &&
                        dependency.readiness !== "done_trusted"
                      ? dependency.readiness === "done_unverified"
                        ? `A prerequisite cleanup was completed recently and remains in stabilization until ${dependency.holdUntil?.slice(0, 10) ?? "later"}.`
                        : "A prerequisite cleanup or grouped workflow is still incomplete, so native execution remains unavailable."
                      : !dependenciesReady
                      ? "A prerequisite cleanup or grouped workflow is still incomplete, so native execution remains unavailable."
                    : "This recommendation is not eligible for native execution yet.",
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        executionTrustScore: null,
        executionTrustBand: null,
        executionTrustSource: null,
        executionPolicyReason: null,
        dependencyReadiness: dependency.readiness,
        stabilizationHoldUntil: dependency.holdUntil,
        batchEligible: false,
        batchGroupKey: null,
        transactionId: null,
        batchStatus: null,
        batchSize: null,
        batchRollbackAvailable: false,
        reallocationPreview: null,
      };
    }

    if (
      recommendation.executionStatus === "failed" ||
      recommendation.executionStatus === "rolled_back"
    ) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          recommendation.executionStatus === "rolled_back"
            ? "This recommendation was previously rolled back, so native execution now requires manual review."
            : "This recommendation previously failed during native execution, so manual review is required before retrying.",
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        executionTrustScore: null,
        executionTrustBand: null,
        executionTrustSource: null,
        executionPolicyReason: null,
        dependencyReadiness: dependency.readiness,
        stabilizationHoldUntil: dependency.holdUntil,
        batchEligible: false,
        batchGroupKey: null,
        transactionId: null,
        batchStatus: null,
        batchSize: null,
        batchRollbackAvailable: false,
        reallocationPreview: null,
      };
    }

    if (recommendation.type === "query_governance" && (recommendation.negativeQueries?.length ?? 0) > 0) {
      const matchingRows = (input.selectedSearchTerms ?? []).filter((row) =>
        (recommendation.negativeQueries ?? []).some((query) => normalize(query) === normalize(row.searchTerm))
      );
      const intentCounts = matchingRows.reduce<Record<string, number>>((acc, row) => {
        const key = String(row.intentClass ?? "unknown");
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      const riskyIntentCount =
        (intentCounts.product_specific ?? 0) +
        (intentCounts.category_high_intent ?? 0) +
        (intentCounts.brand_mixed ?? 0);
      const cleanupIntentCount =
        (intentCounts.support_or_post_purchase ?? 0) +
        (intentCounts.research_low_intent ?? 0) +
        matchingRows.filter((row) => row.ownershipClass === "weak_commercial").length;
      const dominantCleanup =
        matchingRows.length > 0 && cleanupIntentCount / matchingRows.length >= 0.6;
      if (riskyIntentCount > 0) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            "Negative-keyword mutate is blocked because the target query set still includes product-specific, high-intent, or brand-mixed demand.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
        };
      }
      if (!dominantCleanup) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            "Negative-keyword mutate is held back because the target query set is too semantically mixed for safe automatic cleanup.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
        };
      }
      const campaignIds = Array.from(
        new Set(matchingRows.map((row) => String(row.campaignId ?? "")).filter(Boolean))
      );
      const policy = executionPolicy({
        mutateActionType: "add_negative_keyword",
        recommendationType: recommendation.type,
        dominantIntent: dominantIntentClass(matchingRows),
        overlapSeverity: recommendation.overlapSeverity ?? null,
        commerceState: recommendation.commerceSignals?.stockState ?? null,
        dependencyReadiness: dependency.readiness,
        sharedStateContext: policySharedStateContext(campaignIds),
      });
      if (policy.band === "low") {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "Execution policy trust for this cleanup pattern is currently too low for native mutate.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionTrustSource: policy.source,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
          transactionId: null,
          batchStatus: null,
          batchSize: null,
          batchRollbackAvailable: false,
          reallocationPreview: null,
        };
      }
      if (campaignIds.length === 1) {
        return {
          executionMode: "mutate_ready" as const,
          mutateActionType: "add_negative_keyword" as const,
          mutatePayloadPreview: {
            accountId: input.accountId,
            campaignId: campaignIds[0],
            negativeKeywords: recommendation.negativeQueries ?? [],
            matchType: "EXACT",
            policyPatternKey: policy.policyPatternKey,
            executionTrustBand: policy.band,
            executionTrustSource: policy.source,
          },
          mutateEligibilityReason: null,
          canRollback: true,
          rollbackActionType: "remove_negative_keyword" as const,
          rollbackPayloadPreview: {
            resourceNames: [],
          },
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionTrustSource: policy.source,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: true,
          batchGroupKey: `add_negative_keyword|${recommendation.type}|${policy.policyPatternKey}`,
          transactionId: null,
          batchStatus: null,
          batchSize: recommendation.negativeQueries?.length ?? null,
          batchRollbackAvailable: true,
          reallocationPreview: null,
        };
      }
    }

    if (recommendation.type === "creative_asset_deployment" && (recommendation.replaceAssets?.length ?? 0) > 0) {
      const matchingAssets = (input.selectedAssets ?? []).filter((row) =>
        (recommendation.replaceAssets ?? []).some((asset) => normalize(asset) === normalize(row.assetName ?? row.assetText))
      );
      if (matchingAssets.length >= 1) {
        const batchableAssets = matchingAssets.filter((entry) => entry.assetId && entry.assetGroupId && entry.fieldType);
        if (batchableAssets.length >= 1) {
          const policy = executionPolicy({
            mutateActionType: "pause_asset",
            recommendationType: recommendation.type,
            dominantIntent: "asset_cleanup",
            overlapSeverity: recommendation.overlapSeverity ?? null,
            commerceState: recommendation.commerceSignals?.stockState ?? null,
            dependencyReadiness: dependency.readiness,
            sharedStateContext: "unknown",
          });
          if (policy.band === "low") {
            return {
              executionMode: "handoff" as const,
              mutateActionType: null,
              mutatePayloadPreview: null,
              mutateEligibilityReason: "Execution policy trust for this asset action is currently too low for native mutate.",
              canRollback: false,
              rollbackActionType: null,
              rollbackPayloadPreview: null,
              budgetAdjustmentPreview: null,
              executionTrustScore: policy.score,
              executionTrustBand: policy.band,
              executionTrustSource: policy.source,
              executionPolicyReason: policy.reason,
              dependencyReadiness: dependency.readiness,
              stabilizationHoldUntil: dependency.holdUntil,
              batchEligible: false,
              batchGroupKey: null,
              transactionId: null,
              batchStatus: null,
              batchSize: null,
              batchRollbackAvailable: false,
              reallocationPreview: null,
            };
          }
          const asset = batchableAssets[0] as AssetPerformanceRow & Record<string, unknown>;
          const fieldType = String(asset.fieldType ?? "");
          const resourceName = `customers/${String(input.accountId).replace(/\D/g, "")}/assetGroupAssets/${asset.assetGroupId}~${asset.assetId}~${fieldType}`;
          return {
            executionMode: "mutate_ready" as const,
            mutateActionType: "pause_asset" as const,
            mutatePayloadPreview: {
              accountId: input.accountId,
              assetId: asset.assetId,
              assetGroupId: asset.assetGroupId,
              fieldType,
              assetName: asset.assetName ?? asset.assetText ?? "Asset",
              policyPatternKey: policy.policyPatternKey,
              executionTrustBand: policy.band,
              executionTrustSource: policy.source,
            },
            mutateEligibilityReason: null,
            canRollback: true,
            rollbackActionType: "enable_asset" as const,
            rollbackPayloadPreview: {
              resourceName,
            },
            budgetAdjustmentPreview: null,
            executionTrustScore: policy.score,
            executionTrustBand: policy.band,
            executionTrustSource: policy.source,
            executionPolicyReason: policy.reason,
            dependencyReadiness: dependency.readiness,
            stabilizationHoldUntil: dependency.holdUntil,
            batchEligible: true,
            batchGroupKey: `pause_asset|${recommendation.type}|${policy.policyPatternKey}`,
            transactionId: null,
            batchStatus: null,
            batchSize: batchableAssets.length,
            batchRollbackAvailable: true,
            reallocationPreview: null,
          };
        }
      }
    }

    if (recommendation.type === "pmax_scaling_fit") {
      const sharedPmaxCandidates = (input.selectedCampaigns ?? []).filter((campaign) => {
        const channel = String(campaign.channel ?? "").toUpperCase();
        return (
          channel === "PERFORMANCE_MAX" &&
          campaign.scaleState === "scale" &&
          Number(campaign.dailyBudget ?? 0) > 0 &&
          campaign.budgetExplicitlyShared === true &&
          Boolean(campaign.campaignBudgetResourceName)
        );
      });
      const sharedBudgetScope = unique(
        sharedPmaxCandidates.map((campaign) => String(campaign.campaignBudgetResourceName ?? "")).filter(Boolean)
      );
      if (sharedPmaxCandidates.length > 0 && sharedBudgetScope.length === 1) {
        const target = sharedPmaxCandidates[0]!;
        const governedCampaigns = sharedBudgetGovernedCampaigns(sharedBudgetScope[0]!);
        const campaignTerms = (input.selectedSearchTerms ?? []).filter(
          (row) => governedCampaigns.some((campaign) => String(campaign.campaignId ?? "") === String(row.campaignId ?? ""))
        );
        const intentNeedsReview = campaignTerms.some((row) => Boolean(row.intentNeedsReview));
        if (intentNeedsReview) {
          return {
            executionMode: "handoff" as const,
            mutateActionType: null,
            mutatePayloadPreview: null,
            mutateEligibilityReason:
              "intent_uncertain: governed campaigns inside this shared budget still need manual intent review.",
            canRollback: false,
            rollbackActionType: null,
            rollbackPayloadPreview: null,
            budgetAdjustmentPreview: null,
            sharedBudgetAdjustmentPreview: null,
            rollbackSafetyState: "blocked" as const,
            rollbackAvailableUntil: null,
          };
        }
        const policy = executionPolicy({
          mutateActionType: "adjust_shared_budget",
          recommendationType: recommendation.type,
          dominantIntent: dominantIntentClass(campaignTerms),
          overlapSeverity: recommendation.overlapSeverity ?? null,
          commerceState: recommendation.commerceSignals?.stockState ?? null,
          dependencyReadiness: dependency.readiness,
          sharedStateContext: policySharedStateContext(governedCampaigns.map((campaign) => String(campaign.campaignId ?? ""))),
        });
        if (policy.band === "low" || policy.band === "insufficient_data") {
          return {
            executionMode: "handoff" as const,
            mutateActionType: null,
            mutatePayloadPreview: null,
            mutateEligibilityReason:
              "shared_budget_trust_blocked: execution trust for this shared-budget pattern is too low for native mutate.",
            canRollback: false,
            rollbackActionType: null,
            rollbackPayloadPreview: null,
            budgetAdjustmentPreview: null,
            sharedBudgetAdjustmentPreview: null,
            rollbackSafetyState: "blocked" as const,
            rollbackAvailableUntil: null,
            executionTrustScore: policy.score,
            executionTrustBand: policy.band,
            executionTrustSource: policy.source,
            executionPolicyReason: policy.reason,
            dependencyReadiness: dependency.readiness,
            stabilizationHoldUntil: dependency.holdUntil,
            batchEligible: false,
            batchGroupKey: null,
            transactionId: null,
            batchStatus: null,
            batchSize: null,
            batchRollbackAvailable: false,
            reallocationPreview: null,
          };
        }
        return buildSharedBudgetMutateFields({
          recommendation,
          targetCampaign: target,
          deltaPercent: policy.band === "high" ? 15 : 10,
          policy,
          dependency,
          policyReasonPrefix:
            "Wave 14 shared-budget mutate is opening here because one PMax-governed shared budget object is fully known and bounded.",
        });
      }
      if (sharedPmaxCandidates.length > 0 && sharedBudgetScope.length !== 1) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            "shared_budget_scope_ambiguous: more than one shared budget object is in scope, so Wave 14 native mutate remains blocked.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          sharedBudgetAdjustmentPreview: null,
          rollbackSafetyState: "blocked" as const,
          rollbackAvailableUntil: null,
        };
      }
      const pmaxCandidates = (input.selectedCampaigns ?? []).filter((campaign) => {
        const channel = String(campaign.channel ?? "").toUpperCase();
        return (
          channel === "PERFORMANCE_MAX" &&
          campaign.scaleState === "scale" &&
          Number(campaign.dailyBudget ?? 0) > 0 &&
          campaign.budgetExplicitlyShared !== true &&
          Boolean(campaign.campaignBudgetResourceName)
        );
      });
      if (pmaxCandidates.length !== 1) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            pmaxCandidates.length > 1
              ? "Budget mutate stays manual until exactly one mutate-safe PMax campaign is in scope."
              : "This recommendation does not currently resolve to one mutate-safe PMax campaign budget.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
        };
      }
      const target = pmaxCandidates[0];
      const campaignTerms = (input.selectedSearchTerms ?? []).filter(
        (row) => String(row.campaignId ?? "") === String(target.campaignId)
      );
      const intentNeedsReview = campaignTerms.some((row) => Boolean(row.intentNeedsReview));
      if (intentNeedsReview) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "intent_uncertain: dominant demand in this campaign still needs manual intent review.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
        };
      }
      const intentCounts = campaignTerms.reduce<Record<string, number>>((acc, row) => {
        const key = String(row.intentClass ?? "unknown");
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      const safeIncreaseSignals =
        (intentCounts.product_specific ?? 0) +
        (intentCounts.category_high_intent ?? 0) +
        (intentCounts.brand_core ?? 0);
      const weakIncreaseSignals =
        (intentCounts.price_sensitive ?? 0) +
        (intentCounts.research_low_intent ?? 0) +
        (intentCounts.support_or_post_purchase ?? 0) +
        (intentCounts.brand_mixed ?? 0);
      const dominantSafeIncrease =
        campaignTerms.length > 0 && safeIncreaseSignals >= weakIncreaseSignals && safeIncreaseSignals > 0;
      const dominantWeakDemand =
        campaignTerms.length > 0 && weakIncreaseSignals > safeIncreaseSignals;
      const outOfStockBlocked =
        recommendation.commerceSignals?.stockState === "out_of_stock" &&
        recommendation.commerceConfidence === "high";
      const bleedTerms = campaignTerms.filter(
        (row) => Number(row.spend ?? 0) >= 50 && Number(row.conversions ?? 0) <= 0
      );
      const persistentDegraded = recommendation.outcomeVerdict === "degraded";
      const financialBleedOverride = outOfStockBlocked || bleedTerms.length > 0 || persistentDegraded;
      const currentBudget = Number(target.dailyBudget ?? 0);
      const policy = executionPolicy({
        mutateActionType: "adjust_campaign_budget",
        recommendationType: recommendation.type,
        dominantIntent: dominantIntentClass(campaignTerms),
        overlapSeverity: recommendation.overlapSeverity ?? null,
        commerceState: recommendation.commerceSignals?.stockState ?? null,
        dependencyReadiness: dependency.readiness,
        sharedStateContext: policySharedStateContext([String(target.campaignId ?? "")]),
      });
      if (target.portfolioBidStrategyResourceName) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: portfolioStatusIsUnstable(target.portfolioBidStrategyStatus)
            ? "portfolio_strategy_unstable: the governing portfolio strategy is still learning or otherwise unstable, so native budget mutate stays blocked."
            : "portfolio_strategy_governed: this budget surface is governed by a portfolio strategy, so Wave 15 keeps native budget mutate manual.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionTrustSource: policy.source,
          executionPolicyReason:
            "Portfolio-governed budget surfaces remain manual until strategy-aware allocator truth is stronger.",
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil:
            dependency.holdUntil ??
            (portfolioStatusIsUnstable(target.portfolioBidStrategyStatus)
              ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
              : null),
          batchEligible: false,
          batchGroupKey: null,
          transactionId: null,
          batchStatus: null,
          batchSize: null,
          batchRollbackAvailable: false,
          reallocationPreview: null,
        };
      }
      if (!Number.isFinite(currentBudget) || currentBudget <= 0) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "This campaign does not expose a mutate-safe current budget amount.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
        };
      }
      if ((policy.band === "low" || policy.band === "insufficient_data") && !financialBleedOverride) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "Execution policy trust for this budget pattern is currently too low for native mutate.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionTrustSource: policy.source,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
          transactionId: null,
          batchStatus: null,
          batchSize: null,
          batchRollbackAvailable: false,
          reallocationPreview: null,
        };
      }
      if (!financialBleedOverride && recommendation.overlapSeverity === "critical") {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "critical_overlap_blocked: critical overlap must be resolved before a native budget increase is allowed.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionTrustSource: policy.source,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
          transactionId: null,
          batchStatus: null,
          batchSize: null,
          batchRollbackAvailable: false,
          reallocationPreview: null,
        };
      }
      if (!financialBleedOverride && !dominantSafeIncrease) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            dominantWeakDemand
              ? "intent_uncertain: weak, research-led, or price-sensitive demand dominates this campaign, so budget increase stays manual."
              : "This campaign does not yet show a strong enough high-intent demand mix for native budget increase.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionTrustSource: policy.source,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
          transactionId: null,
          batchStatus: null,
          batchSize: null,
          batchRollbackAvailable: false,
          reallocationPreview: null,
        };
      }
      if (
        recommendation.commerceSignals?.stockState === "out_of_stock" &&
        recommendation.commerceConfidence === "high" &&
        !financialBleedOverride
      ) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "commerce_blocked: high-confidence out-of-stock pressure blocks native budget increase.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionTrustSource: policy.source,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
          transactionId: null,
          batchStatus: null,
          batchSize: null,
          batchRollbackAvailable: false,
          reallocationPreview: null,
        };
      }
      if (!financialBleedOverride && accountOverpacing) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            "pacing_blocked: account pacing is already tight, so isolated budget increases are blocked until they resolve through zero-sum reallocation.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionTrustSource: policy.source,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
          transactionId: null,
          batchStatus: null,
          batchSize: null,
          batchRollbackAvailable: false,
          reallocationPreview: null,
        };
      }

      const deltaPercent = financialBleedOverride
        ? policy.band === "high"
          ? -15
          : -10
        : policy.band === "high"
          ? 15
          : 10;
      const proposedAmount = Number((currentBudget * (1 + deltaPercent / 100)).toFixed(2));
      return {
        executionMode: "mutate_ready" as const,
        mutateActionType: "adjust_campaign_budget" as const,
        mutatePayloadPreview: {
          accountId: input.accountId,
          campaignId: target.campaignId,
          campaignBudgetResourceName: target.campaignBudgetResourceName,
          previousAmount: currentBudget,
          proposedAmount,
          deltaPercent,
          policyPatternKey: policy.policyPatternKey,
          executionTrustBand: policy.band,
          executionTrustSource: policy.source,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
        },
        mutateEligibilityReason: null,
        canRollback: true,
        rollbackActionType: "restore_campaign_budget" as const,
        rollbackPayloadPreview: {
          campaignBudgetResourceName: target.campaignBudgetResourceName,
          previousAmount: currentBudget,
        },
        budgetAdjustmentPreview: {
          previousAmount: currentBudget,
          proposedAmount,
          deltaPercent,
        },
        executionTrustScore: policy.score,
        executionTrustBand: policy.band,
        executionTrustSource: policy.source,
        executionPolicyReason: policy.reason,
        dependencyReadiness: dependency.readiness,
        stabilizationHoldUntil: dependency.holdUntil,
        batchEligible: false,
        batchGroupKey: null,
        transactionId: null,
        batchStatus: null,
        batchSize: null,
        batchRollbackAvailable: true,
        reallocationPreview: null,
      };
    }

    if (recommendation.type === "geo_device_adjustment" && recommendation.affectedCampaignIds?.length === 1) {
      const sharedTarget = (input.selectedCampaigns ?? []).find(
        (campaign) =>
          String(campaign.campaignId ?? "") === String(recommendation.affectedCampaignIds?.[0] ?? "") &&
          campaign.budgetExplicitlyShared === true &&
          Boolean(campaign.campaignBudgetResourceName) &&
          Number(campaign.dailyBudget ?? 0) > 0
      );
      if (sharedTarget) {
        const governedCampaigns = sharedBudgetGovernedCampaigns(String(sharedTarget.campaignBudgetResourceName ?? ""));
        const policy = executionPolicy({
          mutateActionType: "adjust_shared_budget",
          recommendationType: recommendation.type,
          dominantIntent: "geo_device_skew",
          overlapSeverity: recommendation.overlapSeverity ?? null,
          commerceState: recommendation.commerceSignals?.stockState ?? null,
          dependencyReadiness: dependency.readiness,
          sharedStateContext: policySharedStateContext(governedCampaigns.map((campaign) => String(campaign.campaignId ?? ""))),
        });
        if (policy.band !== "low" && policy.band !== "insufficient_data" && !accountOverpacing) {
          return buildSharedBudgetMutateFields({
            recommendation,
            targetCampaign: sharedTarget,
            deltaPercent: policy.band === "high" ? 10 : 5,
            policy,
            dependency,
            policyReasonPrefix:
              "Wave 14 shared-budget mutate is allowed here because exactly one shared budget object governs this geo/device move.",
          });
        }
      }
      const target = (input.selectedCampaigns ?? []).find(
        (campaign) =>
          String(campaign.campaignId ?? "") === String(recommendation.affectedCampaignIds?.[0] ?? "") &&
          campaign.budgetExplicitlyShared !== true &&
          Boolean(campaign.campaignBudgetResourceName) &&
          Number(campaign.dailyBudget ?? 0) > 0
      );
      if (target) {
        const policy = executionPolicy({
          mutateActionType: "adjust_campaign_budget",
          recommendationType: recommendation.type,
          dominantIntent: "geo_device_skew",
          overlapSeverity: recommendation.overlapSeverity ?? null,
          commerceState: recommendation.commerceSignals?.stockState ?? null,
          dependencyReadiness: dependency.readiness,
          sharedStateContext: policySharedStateContext([String(target.campaignId ?? "")]),
        });
        if (target.portfolioBidStrategyResourceName) {
          return {
            executionMode: "handoff" as const,
            mutateActionType: null,
            mutatePayloadPreview: null,
            mutateEligibilityReason: portfolioStatusIsUnstable(target.portfolioBidStrategyStatus)
              ? "portfolio_strategy_unstable: the governing portfolio strategy is still learning or otherwise unstable, so native budget mutate stays blocked."
              : "portfolio_strategy_governed: this geo/device budget surface is governed by a portfolio strategy, so Wave 15 keeps native mutate manual.",
            canRollback: false,
            rollbackActionType: null,
            rollbackPayloadPreview: null,
            budgetAdjustmentPreview: null,
            executionTrustScore: policy.score,
            executionTrustBand: policy.band,
            executionTrustSource: policy.source,
            executionPolicyReason:
              "Portfolio-governed allocator state is shaping this campaign, so local budget mutate remains manual.",
            dependencyReadiness: dependency.readiness,
            stabilizationHoldUntil:
              dependency.holdUntil ??
              (portfolioStatusIsUnstable(target.portfolioBidStrategyStatus)
                ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
                : null),
            batchEligible: false,
            batchGroupKey: null,
            transactionId: null,
            batchStatus: null,
            batchSize: null,
            batchRollbackAvailable: false,
            reallocationPreview: null,
          };
        }
        if (policy.band !== "low" && policy.band !== "insufficient_data" && !accountOverpacing) {
          const currentBudget = Number(target.dailyBudget ?? 0);
          const deltaPercent = policy.band === "high" ? 10 : 5;
          const proposedAmount = Number((currentBudget * (1 + deltaPercent / 100)).toFixed(2));
          return {
            executionMode: "mutate_ready" as const,
            mutateActionType: "adjust_campaign_budget" as const,
            mutatePayloadPreview: {
              accountId: input.accountId,
              campaignId: target.campaignId,
              campaignBudgetResourceName: target.campaignBudgetResourceName,
              previousAmount: currentBudget,
              proposedAmount,
              deltaPercent,
              policyPatternKey: policy.policyPatternKey,
              executionTrustBand: policy.band,
              executionTrustSource: policy.source,
              dependencyReadiness: dependency.readiness,
              stabilizationHoldUntil: dependency.holdUntil,
            },
            mutateEligibilityReason: null,
            canRollback: true,
            rollbackActionType: "restore_campaign_budget" as const,
            rollbackPayloadPreview: {
              campaignBudgetResourceName: target.campaignBudgetResourceName,
              previousAmount: currentBudget,
            },
            budgetAdjustmentPreview: {
              previousAmount: currentBudget,
              proposedAmount,
              deltaPercent,
            },
            executionTrustScore: policy.score,
            executionTrustBand: policy.band,
            executionTrustSource: policy.source,
            executionPolicyReason: policy.reason,
            dependencyReadiness: dependency.readiness,
            stabilizationHoldUntil: dependency.holdUntil,
            batchEligible: false,
            batchGroupKey: null,
            transactionId: null,
            batchStatus: null,
            batchSize: null,
            batchRollbackAvailable: true,
            reallocationPreview: null,
          };
        }
      }
    }

    if (recommendation.type === "budget_reallocation") {
      const standaloneCampaigns = (input.selectedCampaigns ?? []).filter(
        (campaign) =>
          campaign.budgetExplicitlyShared !== true &&
          Boolean(campaign.campaignBudgetResourceName) &&
          Number(campaign.dailyBudget ?? 0) > 0
      );
      const sources = standaloneCampaigns
        .filter(
          (campaign) =>
            campaign.scaleState !== "scale" &&
            (campaign.wasteState === "waste" || campaign.servingStatus === "LIMITED")
        )
        .sort((a, b) => Number(b.dailyBudget ?? 0) - Number(a.dailyBudget ?? 0));
      const destinations = standaloneCampaigns
        .filter(
          (campaign) =>
            campaign.scaleState === "scale" &&
            campaign.wasteState !== "waste"
        )
        .sort((a, b) => Number(b.roas ?? 0) - Number(a.roas ?? 0));
      const portfolioGovernedStandalone = standaloneCampaigns.filter((campaign) =>
        Boolean(campaign.portfolioBidStrategyResourceName)
      );
      const source = sources[0];
      const destination = destinations.find(
        (campaign) => String(campaign.campaignId ?? "") !== String(source?.campaignId ?? "")
      );
      const sharedBudgetCandidates = (input.selectedCampaigns ?? []).filter(
        (campaign) =>
          campaign.budgetExplicitlyShared === true &&
          Boolean(campaign.campaignBudgetResourceName) &&
          Number(campaign.dailyBudget ?? 0) > 0
      );
      if (!source && !destination && sharedBudgetCandidates.length > 0) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            "shared_state_allocator_coupled: shared-budget-governed campaigns are in scope, so standalone budget reallocation remains manual.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: null,
          executionTrustBand: null,
          executionTrustSource: null,
          executionPolicyReason:
            "Allocator reasoning detected shared budget coupling, so this move remains handoff until shared-state mutate opens.",
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
          transactionId: null,
          batchStatus: null,
          batchSize: null,
          batchRollbackAvailable: false,
          reallocationPreview: null,
        };
      }
      if (portfolioGovernedStandalone.length > 0) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            "portfolio_strategy_allocator_coupled: portfolio-governed campaigns are in the reallocation set, so Wave 15 keeps native budget reallocation manual.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: null,
          executionTrustBand: null,
          executionTrustSource: null,
          executionPolicyReason:
            "Allocator reasoning detected portfolio-governed budget control, so this move remains manual until strategy-aware support opens.",
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil:
            portfolioGovernedStandalone.some((campaign) => portfolioStatusIsUnstable(campaign.portfolioBidStrategyStatus))
              ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
              : dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
          transactionId: null,
          batchStatus: null,
          batchSize: null,
          batchRollbackAvailable: false,
          reallocationPreview: null,
        };
      }
      if (source && destination) {
        const policy = executionPolicy({
          mutateActionType: "adjust_campaign_budget",
          recommendationType: recommendation.type,
          dominantIntent: "portfolio_reallocation",
          overlapSeverity: recommendation.overlapSeverity ?? null,
          commerceState: recommendation.commerceSignals?.stockState ?? null,
          dependencyReadiness: dependency.readiness,
          sharedStateContext: policySharedStateContext([
            String(source.campaignId ?? ""),
            String(destination.campaignId ?? ""),
          ]),
        });
        if (policy.band !== "low" && policy.band !== "insufficient_data") {
          const sourceCurrent = Number(source.dailyBudget ?? 0);
          const destinationCurrent = Number(destination.dailyBudget ?? 0);
          const sourceShift = Number((sourceCurrent * 0.1).toFixed(2));
          if (sourceShift > 0 && sourceCurrent - sourceShift > 0) {
            const sourceProposed = Number((sourceCurrent - sourceShift).toFixed(2));
            const destinationProposed = Number((destinationCurrent + sourceShift).toFixed(2));
            return {
              executionMode: "mutate_ready" as const,
              mutateActionType: "adjust_campaign_budget" as const,
              mutatePayloadPreview: {
                accountId: input.accountId,
                campaignId: destination.campaignId,
                campaignBudgetResourceName: destination.campaignBudgetResourceName,
                previousAmount: destinationCurrent,
                proposedAmount: destinationProposed,
                deltaPercent: Number(((sourceShift / destinationCurrent) * 100).toFixed(2)),
                operations: [
                  {
                    campaignId: source.campaignId,
                    campaignBudgetResourceName: source.campaignBudgetResourceName,
                    previousAmount: sourceCurrent,
                    proposedAmount: sourceProposed,
                    deltaPercent: Number(((-sourceShift / sourceCurrent) * 100).toFixed(2)),
                  },
                  {
                    campaignId: destination.campaignId,
                    campaignBudgetResourceName: destination.campaignBudgetResourceName,
                    previousAmount: destinationCurrent,
                    proposedAmount: destinationProposed,
                    deltaPercent: Number(((sourceShift / destinationCurrent) * 100).toFixed(2)),
                  },
                ],
                policyPatternKey: policy.policyPatternKey,
                executionTrustBand: policy.band,
                executionTrustSource: policy.source,
                dependencyReadiness: dependency.readiness,
                stabilizationHoldUntil: dependency.holdUntil,
                reallocationNetDelta: 0,
              },
              mutateEligibilityReason: null,
              canRollback: true,
              rollbackActionType: "restore_campaign_budget" as const,
              rollbackPayloadPreview: {
                operations: [
                  {
                    campaignBudgetResourceName: source.campaignBudgetResourceName,
                    previousAmount: sourceCurrent,
                  },
                  {
                    campaignBudgetResourceName: destination.campaignBudgetResourceName,
                    previousAmount: destinationCurrent,
                  },
                ],
              },
              budgetAdjustmentPreview: null,
              executionTrustScore: policy.score,
              executionTrustBand: policy.band,
              executionTrustSource: policy.source,
              executionPolicyReason: policy.reason,
              dependencyReadiness: dependency.readiness,
              stabilizationHoldUntil: dependency.holdUntil,
              batchEligible: false,
              batchGroupKey: null,
              transactionId: null,
              batchStatus: null,
              batchSize: 2,
              batchRollbackAvailable: true,
              reallocationPreview: {
                sourceCampaigns: [
                  { id: source.campaignId, previousAmount: sourceCurrent, proposedAmount: sourceProposed },
                ],
                destinationCampaigns: [
                  { id: destination.campaignId, previousAmount: destinationCurrent, proposedAmount: destinationProposed },
                ],
                netDelta: 0,
              },
            };
          }
        }
      }
    }

    return {
      executionMode: "handoff" as const,
      mutateActionType: null,
      mutatePayloadPreview: null,
      mutateEligibilityReason: "This recommendation does not resolve to a mutate-safe action in the current Wave 10 orchestration scope.",
      canRollback: false,
      rollbackActionType: null,
      rollbackPayloadPreview: null,
      budgetAdjustmentPreview: null,
      executionTrustScore: null,
      executionTrustBand: null,
      executionTrustSource: null,
      executionPolicyReason: null,
      dependencyReadiness: dependency.readiness,
      stabilizationHoldUntil: dependency.holdUntil,
      batchEligible: false,
      batchGroupKey: null,
      transactionId: null,
      batchStatus: null,
      batchSize: null,
      batchRollbackAvailable: false,
      reallocationPreview: null,
    };
  };

  return input.recommendations
    .map((recommendation) => {
      const campaignId =
        recommendation.level === "campaign"
          ? recommendation.entityId ?? null
          : recommendation.affectedCampaignIds?.length === 1
            ? recommendation.affectedCampaignIds[0]
            : null;
      const relatedEntities = Array.from(
        new Set([
          ...(recommendation.overlapEntities ?? []),
          ...(recommendation.affectedCampaignIds ?? []),
        ].filter(Boolean))
      );
      const deepLinkUrl =
        input.accountId && campaignId
          ? buildGoogleAdsCampaignDeepLink(input.accountId, campaignId)
          : null;
      const groupedPlan = !campaignId && relatedEntities.length > 0 ? groupedHandoffPlan(recommendation) : null;
      const mutateFields = {
        sharedBudgetAdjustmentPreview: null,
        rollbackSafetyState: null,
        rollbackAvailableUntil: null,
        ...buildMutateFields(recommendation),
      };
      const sharedState = sharedStateContextForRecommendation(recommendation);
      const budgetMutateAction =
        mutateFields.mutateActionType === "adjust_campaign_budget" ||
        mutateFields.mutateActionType === "adjust_shared_budget";
      const effectivePortfolioBlockedReason =
        budgetMutateAction || mutateFields.executionMode === "handoff"
          ? sharedState.portfolioBlockedReason
          : null;
      const effectivePortfolioCautionReason =
        sharedState.portfolioCautionReason ??
        (!effectivePortfolioBlockedReason && sharedState.portfolioGovernanceStatus !== "none" && sharedState.portfolioGovernanceStatus !== "unknown"
          ? "Caution: portfolio allocation can absorb or mask local performance changes, so attribution is less isolated here."
          : null);
      const sharedStateBlockedReason =
        mutateFields.mutateEligibilityReason?.includes("shared_budget_blocked") ||
        mutateFields.mutateEligibilityReason?.includes("shared_state_allocator_coupled") ||
        mutateFields.mutateEligibilityReason?.includes("portfolio_strategy")
          ? mutateFields.mutateEligibilityReason
          : effectivePortfolioBlockedReason
            ? sharedState.sharedStateMutateBlockedReason
            : sharedState.portfolioCautionReason ?? sharedState.sharedStateMutateBlockedReason;
      return {
        ...recommendation,
        rankScore:
          recommendation.rankScore + (recommendation.currentStatus === "escalated" ? 1.5 : 0),
        rankExplanation:
          recommendation.currentStatus === "escalated"
            ? `${recommendation.rankExplanation} Persistent unresolved condition increased its urgency.`
            : recommendation.rankExplanation,
        executionTargetType: campaignId
          ? "campaign"
          : recommendation.level === "account"
            ? "account"
            : undefined,
        executionTargetId: campaignId,
        executionMode: mutateFields.executionMode,
        mutateActionType: mutateFields.mutateActionType,
        mutatePayloadPreview: mutateFields.mutatePayloadPreview,
        mutateEligibilityReason: mutateFields.mutateEligibilityReason,
        canRollback: mutateFields.canRollback,
        rollbackActionType: mutateFields.rollbackActionType,
        rollbackPayloadPreview: mutateFields.rollbackPayloadPreview,
        budgetAdjustmentPreview: mutateFields.budgetAdjustmentPreview,
        sharedBudgetAdjustmentPreview: mutateFields.sharedBudgetAdjustmentPreview ?? null,
        rollbackSafetyState: mutateFields.rollbackSafetyState ?? null,
        rollbackAvailableUntil: mutateFields.rollbackAvailableUntil ?? null,
        executionTrustScore: mutateFields.executionTrustScore,
        executionTrustBand: mutateFields.executionTrustBand,
        executionTrustSource: mutateFields.executionTrustSource,
        executionPolicyReason: mutateFields.executionPolicyReason,
        dependencyReadiness: mutateFields.dependencyReadiness,
        stabilizationHoldUntil: mutateFields.stabilizationHoldUntil,
        batchEligible: mutateFields.batchEligible,
        batchGroupKey: mutateFields.batchGroupKey,
        transactionId: mutateFields.transactionId,
        batchStatus: mutateFields.batchStatus,
        batchSize: mutateFields.batchSize,
        batchRollbackAvailable: mutateFields.batchRollbackAvailable,
        reallocationPreview: mutateFields.reallocationPreview,
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
        portfolioBlockedReason: effectivePortfolioBlockedReason,
        portfolioCautionReason: effectivePortfolioCautionReason,
        portfolioUnlockGuidance: sharedState.portfolioUnlockGuidance,
        coupledCampaignIds: sharedState.coupledCampaignIds,
        coupledCampaignNames: sharedState.coupledCampaignNames,
        sharedStateMutateBlockedReason: sharedStateBlockedReason,
        sharedStateContaminationFlag: sharedState.sharedStateContaminationFlag,
        deepLinkUrl,
        handoffPayload: campaignId
          ? {
              campaignId,
              recommendationId: recommendation.id,
              recommendationFingerprint: recommendation.recommendationFingerprint,
            }
          : relatedEntities.length > 0
            ? {
                primaryTarget:
                  recommendation.entityName ??
                  recommendation.overlapEntities?.[0] ??
                  recommendation.affectedCampaignIds?.[0] ??
                  "Account-level workflow",
                relatedEntities,
                why: recommendation.why,
                validationChecklist: recommendation.validationChecklist,
                rollbackGuidance: recommendation.rollbackGuidance,
              }
            : null,
        orderedHandoffSteps: groupedPlan?.orderedHandoffSteps ?? recommendation.orderedHandoffSteps ?? [],
        coreStepIds: groupedPlan?.coreStepIds ?? recommendation.coreStepIds ?? [],
        estimatedOperatorMinutes: groupedPlan?.estimatedOperatorMinutes ?? recommendation.estimatedOperatorMinutes ?? null,
        handoffUnavailableReason:
          !campaignId && relatedEntities.length > 0
            ? "This recommendation spans multiple related entities, so a single safe deep link is not available."
            : null,
      };
    })
    .sort((a, b) => {
      return (
        advisorBucketWeight(a.doBucket) - advisorBucketWeight(b.doBucket) ||
        memoryStatusWeight(b.currentStatus) - memoryStatusWeight(a.currentStatus) ||
        b.rankScore - a.rankScore
      );
    });
}
