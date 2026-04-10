import type {
  GoogleAdvisorActionCampaignDelta,
  GoogleAdvisorActionCard,
  GoogleAdvisorActionContract,
  GoogleAdvisorActionContractSource,
  GoogleAdvisorActionListBlock,
  GoogleAdvisorExpectedEffect,
  GoogleAdvisorResponse,
  GoogleRecommendation,
} from "@/lib/google-ads/growth-advisor-types";

export const GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION = "google_ads_advisor_action_v1" as const;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatCurrency(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return "Unknown";
  return currencyFormatter.format(Number(value));
}

function formatDeltaPercent(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return "Unknown";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(Math.abs(numeric) >= 10 ? 0 : 2)}%`;
}

function formatDeltaAmount(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return "Unknown";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${formatCurrency(numeric)}`;
}

function nonEmpty(items?: string[] | null) {
  return uniqueStrings(items ?? []);
}

function suppressionReasonLabel(value: string) {
  switch (value) {
    case "branded_query":
      return "Branded query";
    case "sku_specific_query":
      return "SKU-specific query";
    case "product_specific_query":
      return "Product-specific query";
    case "low_confidence":
      return "Low classification confidence";
    case "ambiguous_intent":
      return "Ambiguous intent";
    case "non_exact_negative_required":
      return "Would require non-exact negative coverage";
    case "insufficient_evidence_depth":
      return "Insufficient evidence depth";
    default:
      return labelize(value);
  }
}

function estimateLabels(recommendation: GoogleRecommendation) {
  const labels: string[] = [];
  if (recommendation.potentialContribution.estimatedRevenueLiftRange) {
    labels.push(`Revenue: ${recommendation.potentialContribution.estimatedRevenueLiftRange}`);
  }
  if (recommendation.potentialContribution.estimatedWasteRecoveryRange) {
    labels.push(`Waste recovery: ${recommendation.potentialContribution.estimatedWasteRecoveryRange}`);
  }
  if (recommendation.potentialContribution.estimatedEfficiencyLiftRange) {
    labels.push(`Efficiency: ${recommendation.potentialContribution.estimatedEfficiencyLiftRange}`);
  }
  return labels;
}

function buildBlockedReasons(recommendation: GoogleRecommendation) {
  return uniqueStrings([
    ...(recommendation.blockers ?? []),
    ...(recommendation.decision?.blockers ?? []),
    ...(recommendation.decision?.whyNot ?? []),
    recommendation.mutateEligibilityReason,
    recommendation.jointAllocatorBlockedReason,
    recommendation.portfolioBlockedReason,
    recommendation.handoffUnavailableReason,
  ]);
}

function buildExpectedEffect(
  recommendation: GoogleRecommendation,
  blockedBecause: string[],
  estimationModeOverride?: GoogleAdvisorExpectedEffect["estimationMode"]
): GoogleAdvisorExpectedEffect {
  const labels = estimateLabels(recommendation);
  if (labels.length > 0) {
    return {
      summary: recommendation.potentialContribution.summary,
      estimationMode: estimationModeOverride ?? "bounded_range",
      estimateLabel: labels.join(" · "),
      note: "Effect sizing is bounded by existing product logic and surfaced as a range.",
    };
  }

  if (estimationModeOverride === "directional_only") {
    return {
      summary: recommendation.potentialContribution.summary,
      estimationMode: "directional_only",
      estimateLabel: null,
      note: "Exact change preview is available or direction is clear, but business impact is not confidently estimable.",
    };
  }

  if (blockedBecause.length > 0) {
    return {
      summary: recommendation.potentialContribution.summary,
      estimationMode: "blocked",
      estimateLabel: null,
      note: "The move is blocked, so no effect estimate should be treated as actionable.",
    };
  }

  return {
    summary: recommendation.potentialContribution.summary,
    estimationMode: estimationModeOverride ?? "not_confidently_estimable",
    estimateLabel: null,
    note: "Business impact is not confidently estimable from the current code and data.",
  };
}

function buildValidation(recommendation: GoogleRecommendation) {
  return uniqueStrings([
    ...(recommendation.decision?.validationPlan ?? []),
    ...(recommendation.validationChecklist ?? []),
    ...(recommendation.decisionNarrative?.howToValidate ?? []),
  ]);
}

function buildRollback(recommendation: GoogleRecommendation) {
  return uniqueStrings([
    ...(recommendation.decision?.rollbackPlan ?? []),
    recommendation.rollbackGuidance,
    recommendation.decisionNarrative?.howToRollBack,
  ]);
}

function buildScope(recommendation: GoogleRecommendation) {
  const jointScope = recommendation.jointAllocatorAdjustmentPreview?.governedCampaigns ?? [];
  if (jointScope.length > 0) {
    return {
      level: recommendation.level,
      label: `${pluralize(jointScope.length, "governed campaign")} under ${recommendation.jointAllocatorAdjustmentPreview?.portfolioTargetType ?? "target"} control`,
      entityName: recommendation.entityName ?? null,
      governedEntityCount: jointScope.length,
    } as const;
  }

  const portfolioScope = recommendation.portfolioTargetAdjustmentPreview?.governedCampaigns ?? [];
  if (portfolioScope.length > 0) {
    return {
      level: recommendation.level,
      label: `${pluralize(portfolioScope.length, "governed campaign")} on ${recommendation.portfolioTargetAdjustmentPreview?.targetType ?? "portfolio target"}`,
      entityName: recommendation.entityName ?? null,
      governedEntityCount: portfolioScope.length,
    } as const;
  }

  const sharedBudgetScope = recommendation.sharedBudgetAdjustmentPreview?.governedCampaigns ?? [];
  if (sharedBudgetScope.length > 0) {
    return {
      level: recommendation.level,
      label: `${pluralize(sharedBudgetScope.length, "shared-budget campaign")}`,
      entityName: recommendation.entityName ?? null,
      governedEntityCount: sharedBudgetScope.length,
    } as const;
  }

  const reallocationScopeCount =
    (recommendation.reallocationPreview?.sourceCampaigns.length ?? 0) +
    (recommendation.reallocationPreview?.destinationCampaigns.length ?? 0);
  if (reallocationScopeCount > 0) {
    return {
      level: recommendation.level,
      label: `${pluralize(reallocationScopeCount, "campaign budget")} in one zero-sum move`,
      entityName: recommendation.entityName ?? null,
      governedEntityCount: reallocationScopeCount,
    } as const;
  }

  if (recommendation.level === "account") {
    return {
      level: recommendation.level,
      label: `${labelize(recommendation.strategyLayer)} across the account`,
      entityName: null,
      governedEntityCount: recommendation.affectedCampaignIds?.length ?? null,
    } as const;
  }

  return {
    level: recommendation.level,
    label: recommendation.entityName ?? labelize(recommendation.level),
    entityName: recommendation.entityName ?? null,
    governedEntityCount: recommendation.affectedCampaignIds?.length ?? null,
  } as const;
}

function buildContract(source: GoogleAdvisorActionContractSource): GoogleAdvisorActionContract {
  return {
    version: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    source,
    note:
      source === "native"
        ? "Structured operator cards are the source of truth for this snapshot."
        : "Structured operator cards were derived from legacy snapshot fields. Refresh Decision Snapshot for the native action contract.",
  };
}

function buildListBlock(label: string, items: string[], emptyLabel?: string): GoogleAdvisorActionListBlock {
  return { label, items, emptyLabel };
}

function buildQueryGovernanceCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCard {
  const addNow = nonEmpty(recommendation.negativeQueries);
  const suppressed = nonEmpty(recommendation.suppressedQueries);
  const suppressionReasonLabels = uniqueStrings([
    ...(recommendation.suppressionReasons ?? []).map(suppressionReasonLabel),
    ...((recommendation.negativeKeywordPolicy?.suppressionReasons ?? []).map(suppressionReasonLabel)),
  ]);
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction:
      addNow.length > 0
        ? `Add ${pluralize(addNow.length, "exact negative keyword")} now.`
        : "Do not add negative keywords from this set yet.",
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock("Add exact negatives now", addNow, "No exact negatives are eligible in this snapshot."),
      buildListBlock(
        "Suppressed from negative action",
        suppressed,
        "No suppressed queries were surfaced for this recommendation."
      ),
      buildListBlock(
        "Suppression reasons",
        suppressionReasonLabels,
        "No suppression reasons were recorded."
      ),
      buildListBlock(
        "Negative guardrails",
        nonEmpty(recommendation.negativeGuardrails),
        "No extra guardrails were attached."
      ),
    ],
    exactChangePayload: {
      kind: "negative_keyword_cleanup",
      matchType: recommendation.negativeKeywordPolicy?.requiredMatchType ?? "exact",
      addNow,
      suppressed,
      suppressionReasonLabels,
      negativeGuardrails: nonEmpty(recommendation.negativeGuardrails),
      policy: recommendation.negativeKeywordPolicy ?? null,
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause,
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

function buildKeywordBuildoutCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCard {
  const addAsExact = nonEmpty(recommendation.promoteToExact ?? recommendation.seedQueriesExact);
  const addAsPhrase = nonEmpty(recommendation.promoteToPhrase ?? recommendation.seedQueriesPhrase);
  const keepAsBroadTheme = nonEmpty(recommendation.broadDiscoveryThemes ?? recommendation.seedThemesBroad);
  const seedExact = nonEmpty(recommendation.seedQueriesExact);
  const seedPhrase = nonEmpty(recommendation.seedQueriesPhrase);
  const seedBroadThemes = nonEmpty(recommendation.seedThemesBroad);
  const doNotPromoteYet = uniqueStrings(
    [...seedExact, ...seedPhrase].filter(
      (query) => !addAsExact.includes(query) && !addAsPhrase.includes(query)
    )
  );
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction:
      recommendation.type === "non_brand_expansion"
        ? "Launch the non-brand buildout with exact first, phrase second, and broad only as controlled discovery."
        : "Promote proven search terms into exact and phrase control.",
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock("Add as exact", addAsExact, "No exact additions were attached."),
      buildListBlock("Add as phrase", addAsPhrase, "No phrase additions were attached."),
      buildListBlock(
        "Keep as broad discovery theme",
        keepAsBroadTheme,
        "No broad discovery themes were attached."
      ),
      buildListBlock(
        "Do not promote yet",
        doNotPromoteYet,
        "No explicit holdback query list was attached to this recommendation."
      ),
      buildListBlock(
        "Negative guardrails",
        nonEmpty(recommendation.negativeGuardrails),
        "No shared negative guardrails were attached."
      ),
    ],
    exactChangePayload: {
      kind: "keyword_buildout",
      addAsExact,
      addAsPhrase,
      keepAsBroadTheme,
      doNotPromoteYet,
      seedExact,
      seedPhrase,
      seedBroadThemes,
      negativeGuardrails: nonEmpty(recommendation.negativeGuardrails),
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause,
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

function shoppingStructureLabel(launchMode: GoogleRecommendation["launchMode"]) {
  switch (launchMode) {
    case "hero_sku_shopping":
      return "Launch a hero-SKU Shopping control campaign.";
    case "category_split":
      return "Split Shopping by category or winner cluster.";
    case "new_control_shopping":
      return "Launch a lightweight Shopping control campaign.";
    default:
      return "Launch Shopping with explicit product ownership.";
  }
}

function buildShoppingStructureCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCard {
  const isolateClusters = uniqueStrings([
    ...(recommendation.heroSkuClusters ?? []),
    ...(recommendation.startingSkuClusters ?? []),
  ]);
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction: shoppingStructureLabel(recommendation.launchMode),
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Recommended shopping structure",
        [shoppingStructureLabel(recommendation.launchMode)],
        "No shopping structure was attached."
      ),
      buildListBlock("Products / clusters to isolate", isolateClusters, "No isolate list was attached."),
      buildListBlock(
        "Hero SKU clusters",
        nonEmpty(recommendation.heroSkuClusters),
        "No hero SKU clusters were attached."
      ),
      buildListBlock(
        "Starting SKU clusters",
        nonEmpty(recommendation.startingSkuClusters),
        "No starting SKU clusters were attached."
      ),
    ],
    exactChangePayload: {
      kind: "shopping_structure",
      launchMode: recommendation.launchMode ?? null,
      recommendedStructure: shoppingStructureLabel(recommendation.launchMode),
      isolateClusters,
      heroClusters: nonEmpty(recommendation.heroSkuClusters),
      startingClusters: nonEmpty(recommendation.startingSkuClusters),
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause,
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

function buildProductAllocationCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCard {
  const isolateClusters = uniqueStrings([
    ...(recommendation.heroSkuClusters ?? []),
    ...(recommendation.hiddenWinnerSkuClusters ?? []),
  ]);
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction: "Separate winners, hidden winners, and laggards before moving more product budget.",
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock("Products / clusters to isolate", isolateClusters, "No isolate list was attached."),
      buildListBlock("Products / clusters to scale", nonEmpty(recommendation.scaleSkuClusters), "No scale list was attached."),
      buildListBlock("Products / clusters to reduce", nonEmpty(recommendation.reduceSkuClusters), "No reduce list was attached."),
      buildListBlock(
        "Hidden winner clusters",
        nonEmpty(recommendation.hiddenWinnerSkuClusters),
        "No hidden-winner list was attached."
      ),
    ],
    exactChangePayload: {
      kind: "product_allocation",
      isolateClusters,
      scaleClusters: nonEmpty(recommendation.scaleSkuClusters),
      reduceClusters: nonEmpty(recommendation.reduceSkuClusters),
      hiddenWinnerClusters: nonEmpty(recommendation.hiddenWinnerSkuClusters),
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause,
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

function buildAssetStructureCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCard {
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction:
      recommendation.type === "creative_asset_deployment"
        ? "Replace weak assets and keep testing separate from scaling inventory."
        : "Split weak asset groups and keep low-signal groups separate.",
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Asset groups to split",
        nonEmpty(recommendation.weakAssetGroups),
        "No split list was attached."
      ),
      buildListBlock(
        "Asset groups to keep separate",
        nonEmpty(recommendation.keepSeparateAssetGroups),
        "No keep-separate list was attached."
      ),
      buildListBlock("Assets to replace", nonEmpty(recommendation.replaceAssets), "No replacement asset list was attached."),
      buildListBlock(
        "New angle directions",
        nonEmpty(recommendation.replacementAngles),
        "No replacement-angle directions were attached."
      ),
    ],
    exactChangePayload: {
      kind: "asset_group_restructure",
      splitAssetGroups: nonEmpty(recommendation.weakAssetGroups),
      keepSeparateAssetGroups: nonEmpty(recommendation.keepSeparateAssetGroups),
      replaceAssets: nonEmpty(recommendation.replaceAssets),
      replacementAngles: nonEmpty(recommendation.replacementAngles),
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause,
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

function toCampaignDelta(entry: {
  id: string;
  name?: string | null;
  previousAmount: number;
  proposedAmount: number;
}): GoogleAdvisorActionCampaignDelta {
  const previousAmount = Number(entry.previousAmount ?? 0);
  const proposedAmount = Number(entry.proposedAmount ?? 0);
  const deltaAmount = Number((proposedAmount - previousAmount).toFixed(2));
  const deltaPercent =
    previousAmount > 0
      ? Number((((proposedAmount - previousAmount) / previousAmount) * 100).toFixed(2))
      : 0;
  return {
    id: String(entry.id),
    name: entry.name ?? null,
    previousAmount,
    proposedAmount,
    deltaAmount,
    deltaPercent,
  };
}

function describeCampaignDelta(entry: GoogleAdvisorActionCampaignDelta) {
  return `${entry.name ?? entry.id}: ${formatCurrency(entry.previousAmount)} -> ${formatCurrency(entry.proposedAmount)} (${formatDeltaPercent(entry.deltaPercent)}, ${formatDeltaAmount(entry.deltaAmount)})`;
}

function buildBudgetReallocationCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCard {
  const sourceCampaigns = (recommendation.reallocationPreview?.sourceCampaigns ?? []).map(toCampaignDelta);
  const destinationCampaigns = (recommendation.reallocationPreview?.destinationCampaigns ?? []).map(toCampaignDelta);
  const estimateMode = sourceCampaigns.length > 0 || destinationCampaigns.length > 0 ? "bounded_preview" : "heuristic_only";
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction:
      estimateMode === "bounded_preview"
        ? "Move budget from the lower-priority source campaign into the destination campaign shown below."
        : recommendation.reallocationBand
          ? `Move ${recommendation.reallocationBand} of budget directionally; campaign-level source and destination remain manual.`
          : "Reallocate budget directionally; campaign-level preview is unavailable.",
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Source lane / campaign",
        sourceCampaigns.map(describeCampaignDelta),
        "Campaign-level source preview is not safely available."
      ),
      buildListBlock(
        "Destination lane / campaign",
        destinationCampaigns.map(describeCampaignDelta),
        "Campaign-level destination preview is not safely available."
      ),
      buildListBlock(
        "Budget move",
        uniqueStrings([
          recommendation.reallocationBand ? `${recommendation.reallocationBand} directional budget band` : null,
          estimateMode === "bounded_preview"
            ? "Preview is bounded by the exact campaign budget amounts shown here."
            : "Preview is heuristic only. No exact campaign budget move is safely previewable.",
        ]),
        "No budget movement details were attached."
      ),
    ],
    exactChangePayload: {
      kind: "budget_reallocation",
      sourceCampaigns,
      destinationCampaigns,
      budgetBand: recommendation.reallocationBand ?? null,
      estimateMode,
      netDelta:
        typeof recommendation.reallocationPreview?.netDelta === "number"
          ? recommendation.reallocationPreview.netDelta
          : null,
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause,
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

function buildTargetStrategyCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCard {
  const jointPreview = recommendation.jointAllocatorAdjustmentPreview;
  const targetPreview = recommendation.portfolioTargetAdjustmentPreview;
  const currentTargetType =
    jointPreview?.portfolioTargetType ??
    (targetPreview?.targetType === "tROAS" || targetPreview?.targetType === "tCPA"
      ? targetPreview.targetType
      : recommendation.portfolioTargetType === "tROAS" || recommendation.portfolioTargetType === "tCPA"
        ? recommendation.portfolioTargetType
        : null);
  const currentTargetValue =
    jointPreview?.portfolioPreviousValue ??
    targetPreview?.previousValue ??
    (typeof recommendation.portfolioTargetValue === "number" ? recommendation.portfolioTargetValue : null);
  const proposedTargetValue = jointPreview?.portfolioProposedValue ?? targetPreview?.proposedValue ?? null;
  const deltaPercent = jointPreview?.portfolioDeltaPercent ?? targetPreview?.deltaPercent ?? null;
  const governedScope =
    jointPreview?.governedCampaigns ??
    targetPreview?.governedCampaigns ??
    (recommendation.coupledCampaignIds ?? []).map((id, index) => ({
      id,
      name: recommendation.coupledCampaignNames?.[index] ?? id,
    }));
  const safeBecause = uniqueStrings([
    jointPreview?.boundedDelta || targetPreview?.boundedDelta ? "Preview stays within bounded delta guardrails." : null,
    governedScope.length > 0 ? `Governed scope is explicit: ${pluralize(governedScope.length, "campaign")}.` : null,
    recommendation.jointExecutionSequence?.length
      ? `Execution order is explicit: ${(jointPreview?.executionOrder ?? []).join(" -> ")}.`
      : null,
  ]);
  const state =
    jointPreview || targetPreview
      ? blockedBecause.length > 0
        ? "blocked"
        : "preview_available"
      : blockedBecause.length > 0
        ? "blocked"
        : "directional_only";
  const previewMode =
    jointPreview ? "joint_allocator" : targetPreview ? "portfolio_target" : "directional_only";

  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction:
      state === "preview_available"
        ? previewMode === "joint_allocator"
          ? `Review the joint allocator preview before making the manual ${currentTargetType ?? "target"} change.`
          : `Review the ${currentTargetType ?? "target"} preview before making the manual target change.`
        : state === "blocked"
          ? `Do not change the ${currentTargetType ?? "portfolio"} target yet. Resolve the blocker first.`
          : `Treat the ${currentTargetType ?? "portfolio"} target adjustment as directional only until an exact preview is available.`,
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Current target",
        currentTargetType ? [`${currentTargetType} ${currentTargetValue ?? "unknown"}`] : [],
        "Current target is not known."
      ),
      buildListBlock(
        "Proposed target",
        proposedTargetValue !== null && currentTargetType
          ? [`${currentTargetType} ${proposedTargetValue} (${formatDeltaPercent(deltaPercent)})`]
          : [],
        "Exact preview is unavailable. Treat this recommendation as directional only."
      ),
      buildListBlock(
        "Budget move",
        jointPreview
          ? [
              `${jointPreview.budgetActionType === "adjust_shared_budget" ? "Shared budget" : "Campaign budget"} ${formatCurrency(jointPreview.budgetPreviousAmount)} -> ${formatCurrency(jointPreview.budgetProposedAmount)} (${formatDeltaPercent(jointPreview.budgetDeltaPercent)})`,
            ]
          : [],
        "No paired budget change is attached."
      ),
      buildListBlock(
        "Governed scope",
        governedScope.map((entry) => entry.name),
        "Governed scope is not fully known."
      ),
      buildListBlock("Why safe", safeBecause, "No explicit preview safety note is available."),
    ],
    exactChangePayload: {
      kind: "target_strategy_adjustment",
      state,
      previewMode,
      currentTargetType,
      currentTargetValue,
      proposedTargetValue,
      deltaPercent,
      governedScope,
      budgetActionType: jointPreview?.budgetActionType ?? null,
      budgetPreviousAmount: jointPreview?.budgetPreviousAmount ?? null,
      budgetProposedAmount: jointPreview?.budgetProposedAmount ?? null,
      budgetDeltaPercent: jointPreview?.budgetDeltaPercent ?? null,
      boundedDelta: jointPreview?.boundedDelta ?? targetPreview?.boundedDelta ?? false,
      safeBecause,
      blockedBecause,
    },
    expectedEffect: buildExpectedEffect(
      recommendation,
      blockedBecause,
      state === "preview_available" || state === "directional_only" ? "directional_only" : "blocked"
    ),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause,
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

function buildBlockedCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCard {
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction: recommendation.recommendedAction,
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock("Blocked because", blockedBecause, "No explicit blocker was attached."),
    ],
    exactChangePayload: {
      kind: "blocked_or_insufficient_evidence",
      reasons: blockedBecause,
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause, "blocked"),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause,
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

function buildGenericCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCard {
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction: recommendation.recommendedAction,
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Exact changes",
        nonEmpty(recommendation.playbookSteps),
        "No deterministic exact-change list was attached."
      ),
    ],
    exactChangePayload: {
      kind: "generic_manual_action",
      recommendedAction: recommendation.recommendedAction,
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause,
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

export function buildGoogleAdsOperatorActionCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource
): GoogleAdvisorActionCard {
  const blockedBecause = buildBlockedReasons(recommendation);

  if (recommendation.type === "query_governance") {
    return buildQueryGovernanceCard(recommendation, source, blockedBecause);
  }

  if (
    recommendation.portfolioTargetAdjustmentPreview ||
    recommendation.jointAllocatorAdjustmentPreview ||
    recommendation.portfolioTargetType === "tROAS" ||
    recommendation.portfolioTargetType === "tCPA"
  ) {
    return buildTargetStrategyCard(recommendation, source, blockedBecause);
  }

  if (
    recommendation.type === "keyword_buildout" ||
    recommendation.type === "non_brand_expansion" ||
    recommendation.type === "orphaned_non_brand_demand"
  ) {
    return buildKeywordBuildoutCard(recommendation, source, blockedBecause);
  }

  if (recommendation.type === "shopping_launch_or_split") {
    return buildShoppingStructureCard(recommendation, source, blockedBecause);
  }

  if (recommendation.type === "product_allocation") {
    return buildProductAllocationCard(recommendation, source, blockedBecause);
  }

  if (
    recommendation.type === "asset_group_structure" ||
    recommendation.type === "creative_asset_deployment"
  ) {
    return buildAssetStructureCard(recommendation, source, blockedBecause);
  }

  if (
    recommendation.type === "budget_reallocation" ||
    recommendation.reallocationPreview ||
    recommendation.reallocationBand
  ) {
    return buildBudgetReallocationCard(recommendation, source, blockedBecause);
  }

  if (blockedBecause.length > 0) {
    return buildBlockedCard(recommendation, source, blockedBecause);
  }

  return buildGenericCard(recommendation, source, blockedBecause);
}

export function attachGoogleAdsAdvisorActionContract(input: {
  advisorPayload: GoogleAdvisorResponse;
  source: GoogleAdvisorActionContractSource;
}) {
  const recommendations = input.advisorPayload.recommendations.map((recommendation) => ({
    ...recommendation,
    operatorActionCard: buildGoogleAdsOperatorActionCard(recommendation, input.source),
  }));
  const recommendationsById = new Map(recommendations.map((recommendation) => [recommendation.id, recommendation]));
  return {
    ...input.advisorPayload,
    recommendations,
    sections: input.advisorPayload.sections.map((section) => ({
      ...section,
      recommendations: section.recommendations.map(
        (recommendation) => recommendationsById.get(recommendation.id) ?? recommendation
      ),
    })),
    metadata: input.advisorPayload.metadata
      ? {
          ...input.advisorPayload.metadata,
          actionContract: buildContract(input.source),
        }
      : undefined,
  };
}
