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

export const GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION = "google_ads_advisor_action_v2" as const;
type GoogleAdvisorActionCardDraft = Omit<GoogleAdvisorActionCard, "assistMode">;

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

function summarizeActionCounts(parts: Array<{ count: number; label: string }>) {
  const active = parts.filter((part) => part.count > 0);
  if (active.length === 0) return null;
  if (active.length === 1) return `${active[0]?.count} ${active[0]?.label}`;
  if (active.length === 2) {
    return `${active[0]?.count} ${active[0]?.label} and ${active[1]?.count} ${active[1]?.label}`;
  }
  const leading = active.slice(0, -1).map((part) => `${part.count} ${part.label}`);
  const trailing = active.at(-1);
  return `${leading.join(", ")}, and ${trailing?.count} ${trailing?.label}`;
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

function formatTargetValue(targetType: "tROAS" | "tCPA" | null, value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "unknown";
  }
  const numeric = Number(value);
  if (targetType === "tCPA") return formatCurrency(numeric);
  return `${Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(2))}`;
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

  if (estimationModeOverride === "heuristic_only") {
    return {
      summary: recommendation.potentialContribution.summary,
      estimationMode: "heuristic_only",
      estimateLabel: null,
      note: "The move direction is supported, but the exact business impact remains heuristic only.",
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

function defaultToneForKind(kind: GoogleAdvisorActionListBlock["kind"]): GoogleAdvisorActionListBlock["tone"] {
  switch (kind) {
    case "blocker":
    case "suppressed":
      return "danger";
    case "guardrail":
      return "muted";
    case "preview":
      return "primary";
    default:
      return "default";
  }
}

function buildListBlock(
  label: string,
  items: string[],
  emptyLabel?: string,
  options?: {
    kind?: GoogleAdvisorActionListBlock["kind"];
    tone?: GoogleAdvisorActionListBlock["tone"];
  }
): GoogleAdvisorActionListBlock {
  const kind = options?.kind ?? "change";
  return {
    label,
    items,
    emptyLabel,
    kind,
    tone: options?.tone ?? defaultToneForKind(kind),
  };
}

function asDeterministicActionCard(card: GoogleAdvisorActionCardDraft): GoogleAdvisorActionCard {
  return {
    ...card,
    assistMode: "deterministic",
  };
}

function shouldPreserveExistingActionCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource
) {
  return (
    recommendation.operatorActionCard?.contractVersion === GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION &&
    recommendation.operatorActionCard?.contractSource === source &&
    (recommendation.operatorActionCard?.assistMode === "deterministic" ||
      recommendation.operatorActionCard?.assistMode === "ai_structured_assist")
  );
}

function buildQueryGovernanceCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource,
  blockedBecause: string[]
): GoogleAdvisorActionCardDraft {
  const addNow = nonEmpty(recommendation.negativeQueries);
  const suppressed = nonEmpty(recommendation.suppressedQueries);
  const negativeGuardrails = nonEmpty(recommendation.negativeGuardrails);
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
        : suppressed.length > 0
          ? `Do not add negatives yet. ${pluralize(suppressed.length, "query")} is suppressed from action.`
          : "No exact negative action is ready in this snapshot.",
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Add exact negatives now",
        addNow,
        "No exact negatives are eligible in this snapshot.",
        { kind: "change", tone: "primary" }
      ),
      buildListBlock(
        "Suppressed from negative action",
        suppressed,
        "No suppressed queries were surfaced for this recommendation.",
        { kind: "suppressed" }
      ),
      buildListBlock(
        "Suppression reasons",
        suppressionReasonLabels,
        "No suppression reasons were recorded.",
        { kind: "suppressed" }
      ),
      buildListBlock(
        "Negative guardrails",
        negativeGuardrails,
        "No extra guardrails were attached.",
        { kind: "guardrail" }
      ),
    ],
    exactChangePayload: {
      kind: "negative_keyword_cleanup",
      matchType: recommendation.negativeKeywordPolicy?.requiredMatchType ?? "exact",
      addNow,
      suppressed,
      suppressionReasonLabels,
      negativeGuardrails,
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
): GoogleAdvisorActionCardDraft {
  const addAsExact = nonEmpty(recommendation.promoteToExact ?? recommendation.seedQueriesExact);
  const addAsPhrase = nonEmpty(recommendation.promoteToPhrase ?? recommendation.seedQueriesPhrase);
  const keepAsBroadTheme = nonEmpty(recommendation.broadDiscoveryThemes ?? recommendation.seedThemesBroad);
  const seedExact = nonEmpty(recommendation.seedQueriesExact);
  const seedPhrase = nonEmpty(recommendation.seedQueriesPhrase);
  const seedBroadThemes = nonEmpty(recommendation.seedThemesBroad);
  const negativeGuardrails = nonEmpty(recommendation.negativeGuardrails);
  const doNotPromoteYet = uniqueStrings(
    [...seedExact, ...seedPhrase].filter(
      (query) => !addAsExact.includes(query) && !addAsPhrase.includes(query)
    )
  );
  const actionSummary =
    summarizeActionCounts([
      { count: addAsExact.length, label: "exact addition" },
      { count: addAsPhrase.length, label: "phrase addition" },
      { count: keepAsBroadTheme.length, label: "broad discovery theme" },
    ]) ?? "No structured keyword promotion move is ready yet";
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction:
      recommendation.type === "non_brand_expansion"
        ? `Launch the non-brand buildout with ${actionSummary}.`
        : `Promote proven search terms with ${actionSummary}.`,
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock("Add as exact", addAsExact, "No exact additions were attached.", {
        kind: "change",
        tone: "primary",
      }),
      buildListBlock("Add as phrase", addAsPhrase, "No phrase additions were attached.", {
        kind: "change",
      }),
      buildListBlock(
        "Keep as broad discovery theme",
        keepAsBroadTheme,
        "No broad discovery themes were attached.",
        { kind: "preview" }
      ),
      buildListBlock(
        "Do not promote yet",
        doNotPromoteYet,
        "No explicit holdback query list was attached to this recommendation.",
        { kind: "suppressed" }
      ),
      buildListBlock(
        "Negative guardrails",
        negativeGuardrails,
        "No shared negative guardrails were attached.",
        { kind: "guardrail" }
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
      negativeGuardrails,
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
): GoogleAdvisorActionCardDraft {
  const isolateClusters = uniqueStrings([
    ...(recommendation.heroSkuClusters ?? []),
    ...(recommendation.startingSkuClusters ?? []),
  ]);
  const scaleClusters = nonEmpty(recommendation.scaleSkuClusters);
  const reduceClusters = nonEmpty(recommendation.reduceSkuClusters);
  const hiddenWinnerClusters = nonEmpty(recommendation.hiddenWinnerSkuClusters);
  const heroClusters = nonEmpty(recommendation.heroSkuClusters);
  const startingClusters = nonEmpty(recommendation.startingSkuClusters);
  const estimationState =
    recommendation.potentialContribution.estimatedRevenueLiftRange ||
    recommendation.potentialContribution.estimatedEfficiencyLiftRange ||
    recommendation.potentialContribution.estimatedWasteRecoveryRange
      ? "bounded"
      : isolateClusters.length > 0 || recommendation.launchMode
        ? "deterministic"
        : recommendation.shoppingRationale
          ? "directional_only"
          : "not_confidently_estimable";
  const actionSummary =
    summarizeActionCounts([
      { count: isolateClusters.length, label: "cluster to isolate" },
      { count: scaleClusters.length, label: "cluster to scale" },
      { count: reduceClusters.length, label: "cluster to reduce" },
    ]) ?? "no explicit cluster move";
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction: `${shoppingStructureLabel(recommendation.launchMode)} Focus on ${actionSummary}.`,
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Recommended shopping structure",
        [shoppingStructureLabel(recommendation.launchMode)],
        "No shopping structure was attached.",
        { kind: "preview", tone: "primary" }
      ),
      buildListBlock("Products / clusters to isolate", isolateClusters, "No isolate list was attached.", {
        kind: "change",
      }),
      buildListBlock(
        "Hero SKU clusters",
        heroClusters,
        "No hero SKU clusters were attached.",
        { kind: "change" }
      ),
      buildListBlock(
        "Starting SKU clusters",
        startingClusters,
        "No starting SKU clusters were attached.",
        { kind: "change" }
      ),
      buildListBlock("Products / clusters to scale", scaleClusters, "No scale list was attached.", {
        kind: "change",
      }),
      buildListBlock("Products / clusters to reduce", reduceClusters, "No reduce list was attached.", {
        kind: "suppressed",
      }),
      buildListBlock(
        "Hidden winner clusters",
        hiddenWinnerClusters,
        "No hidden-winner list was attached.",
        { kind: "preview" }
      ),
      buildListBlock(
        "Shopping rationale",
        recommendation.shoppingRationale ? [recommendation.shoppingRationale] : [],
        "No explicit shopping rationale was attached.",
        { kind: "informational" }
      ),
    ],
    exactChangePayload: {
      kind: "shopping_structure",
      launchMode: recommendation.launchMode ?? null,
      recommendedStructure: shoppingStructureLabel(recommendation.launchMode),
      isolateClusters,
      heroClusters,
      startingClusters,
      scaleClusters,
      reduceClusters,
      hiddenWinnerClusters,
      shoppingRationale: recommendation.shoppingRationale ?? null,
      estimationState,
    },
    expectedEffect: buildExpectedEffect(
      recommendation,
      blockedBecause,
      estimationState === "bounded" ? undefined : "directional_only"
    ),
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
): GoogleAdvisorActionCardDraft {
  const isolateClusters = uniqueStrings([
    ...(recommendation.heroSkuClusters ?? []),
    ...(recommendation.hiddenWinnerSkuClusters ?? []),
  ]);
  const scaleClusters = nonEmpty(recommendation.scaleSkuClusters);
  const reduceClusters = nonEmpty(recommendation.reduceSkuClusters);
  const hiddenWinnerClusters = nonEmpty(recommendation.hiddenWinnerSkuClusters);
  const actionSummary =
    summarizeActionCounts([
      { count: isolateClusters.length, label: "cluster to isolate" },
      { count: scaleClusters.length, label: "cluster to scale" },
      { count: reduceClusters.length, label: "cluster to reduce" },
    ]) ?? "no explicit product allocation move";
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction: `Separate winners, hidden winners, and laggards with ${actionSummary}.`,
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock("Products / clusters to isolate", isolateClusters, "No isolate list was attached.", {
        kind: "change",
        tone: "primary",
      }),
      buildListBlock("Products / clusters to scale", scaleClusters, "No scale list was attached.", {
        kind: "change",
      }),
      buildListBlock("Products / clusters to reduce", reduceClusters, "No reduce list was attached.", {
        kind: "suppressed",
      }),
      buildListBlock(
        "Hidden winner clusters",
        hiddenWinnerClusters,
        "No hidden-winner list was attached.",
        { kind: "preview" }
      ),
    ],
    exactChangePayload: {
      kind: "product_allocation",
      isolateClusters,
      scaleClusters,
      reduceClusters,
      hiddenWinnerClusters,
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause, "directional_only"),
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
): GoogleAdvisorActionCardDraft {
  const splitAssetGroups = nonEmpty(recommendation.weakAssetGroups);
  const keepSeparateAssetGroups = nonEmpty(recommendation.keepSeparateAssetGroups);
  const replaceAssets = nonEmpty(recommendation.replaceAssets);
  const replacementAngles = nonEmpty(recommendation.replacementAngles);
  const actionSummary =
    summarizeActionCounts([
      { count: splitAssetGroups.length, label: "asset group to split" },
      { count: keepSeparateAssetGroups.length, label: "asset group to keep separate" },
      { count: replaceAssets.length, label: "asset to replace" },
    ]) ?? "no explicit asset restructure move";
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction:
      recommendation.type === "creative_asset_deployment"
        ? `Replace weak assets and keep test inventory separate with ${actionSummary}.`
        : `Split weak asset groups and keep low-signal groups separate with ${actionSummary}.`,
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Asset groups to split",
        splitAssetGroups,
        "No split list was attached.",
        { kind: "change", tone: "primary" }
      ),
      buildListBlock(
        "Asset groups to keep separate",
        keepSeparateAssetGroups,
        "No keep-separate list was attached.",
        { kind: "change" }
      ),
      buildListBlock("Assets to replace", replaceAssets, "No replacement asset list was attached.", {
        kind: "change",
      }),
      buildListBlock(
        "New angle directions",
        replacementAngles,
        "No replacement-angle directions were attached.",
        { kind: "preview" }
      ),
    ],
    exactChangePayload: {
      kind: "asset_group_restructure",
      splitAssetGroups,
      keepSeparateAssetGroups,
      replaceAssets,
      replacementAngles,
    },
    expectedEffect: buildExpectedEffect(recommendation, blockedBecause, "directional_only"),
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
): GoogleAdvisorActionCardDraft {
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
        "Campaign-level source preview is not safely available.",
        { kind: "change", tone: "primary" }
      ),
      buildListBlock(
        "Destination lane / campaign",
        destinationCampaigns.map(describeCampaignDelta),
        "Campaign-level destination preview is not safely available.",
        { kind: "change" }
      ),
      buildListBlock(
        "Budget move",
        uniqueStrings([
          recommendation.reallocationBand ? `${recommendation.reallocationBand} directional budget band` : null,
          estimateMode === "bounded_preview"
            ? "Preview is bounded by the exact campaign budget amounts shown here."
            : "Preview is heuristic only. No exact campaign budget move is safely previewable.",
        ]),
        "No budget movement details were attached.",
        { kind: estimateMode === "bounded_preview" ? "preview" : "informational" }
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
    expectedEffect: buildExpectedEffect(
      recommendation,
      blockedBecause,
      estimateMode === "bounded_preview" ? undefined : "heuristic_only"
    ),
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
): GoogleAdvisorActionCardDraft {
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
    recommendation.jointExecutionSequence?.length && (jointPreview?.executionOrder?.length ?? 0) > 0
      ? `Execution order is explicit: ${jointPreview?.executionOrder.join(" -> ")}.`
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
        ? proposedTargetValue !== null && currentTargetType
          ? `Change ${currentTargetType} from ${formatTargetValue(currentTargetType, currentTargetValue)} to ${formatTargetValue(currentTargetType, proposedTargetValue)} across ${pluralize(governedScope.length || 1, "governed campaign")}.`
          : `Review the ${currentTargetType ?? "target"} preview before making the manual target change.`
        : state === "blocked"
          ? `Do not change the ${currentTargetType ?? "portfolio"} target yet. Resolve the blocker first.`
          : `Treat the ${currentTargetType ?? "portfolio"} target adjustment as directional only until an exact preview is available.`,
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Current target",
        currentTargetType ? [`${currentTargetType} ${formatTargetValue(currentTargetType, currentTargetValue)}`] : [],
        "Current target is not known.",
        { kind: "preview", tone: "primary" }
      ),
      buildListBlock(
        "Proposed target",
        proposedTargetValue !== null && currentTargetType
          ? [`${currentTargetType} ${formatTargetValue(currentTargetType, proposedTargetValue)} (${formatDeltaPercent(deltaPercent)})`]
          : [],
        "Exact preview is unavailable. Treat this recommendation as directional only.",
        { kind: state === "blocked" ? "blocker" : "preview" }
      ),
      buildListBlock(
        "Budget move",
        jointPreview
          ? [
              `${jointPreview.budgetActionType === "adjust_shared_budget" ? "Shared budget" : "Campaign budget"} ${formatCurrency(jointPreview.budgetPreviousAmount)} -> ${formatCurrency(jointPreview.budgetProposedAmount)} (${formatDeltaPercent(jointPreview.budgetDeltaPercent)})`,
            ]
          : [],
        "No paired budget change is attached.",
        { kind: jointPreview ? "preview" : "informational" }
      ),
      buildListBlock(
        "Governed scope",
        governedScope.map((entry) => entry.name),
        "Governed scope is not fully known.",
        { kind: "change" }
      ),
      buildListBlock("Why safe", safeBecause, "No explicit preview safety note is available.", {
        kind: "preview",
      }),
    ],
    exactChangePayload: {
      kind: "target_strategy_adjustment",
      state,
      previewState: state,
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
      validationWindowDays:
        jointPreview?.attributionWindowDays ?? targetPreview?.attributionWindowDays ?? null,
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
): GoogleAdvisorActionCardDraft {
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction: "Do not apply this move yet. Resolve the blocker first.",
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock("Blocked because", blockedBecause, "No explicit blocker was attached.", {
        kind: "blocker",
      }),
    ],
    exactChangePayload: {
      kind: "blocked_or_insufficient_evidence",
      state: "blocked",
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
): GoogleAdvisorActionCardDraft {
  const exactSteps = nonEmpty([
    ...(recommendation.playbookSteps ?? []),
    ...(recommendation.orderedHandoffSteps ?? []),
  ]);
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction: recommendation.recommendedAction,
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Exact changes",
        exactSteps,
        "No deterministic exact-change list was attached.",
        { kind: "change", tone: "primary" }
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

function buildInsufficientEvidenceCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource
): GoogleAdvisorActionCardDraft {
  const reasons = uniqueStrings([
    ...(recommendation.decision?.whyNot ?? []),
    ...(recommendation.confidenceDegradationReasons ?? []),
    ...(recommendation.prerequisites ?? []),
    "This snapshot does not include deterministic exact-change fields for this recommendation.",
  ]);
  return {
    contractVersion: GOOGLE_ADVISOR_ACTION_CONTRACT_VERSION,
    contractSource: source,
    recommendationType: recommendation.type,
    primaryAction: "Hold this as a watch item. No deterministic change is specified yet.",
    scope: buildScope(recommendation),
    exactChanges: [
      buildListBlock(
        "Insufficient evidence",
        reasons,
        "No deterministic exact-change fields are attached to this recommendation.",
        { kind: "blocker", tone: "muted" }
      ),
    ],
    exactChangePayload: {
      kind: "blocked_or_insufficient_evidence",
      state: "insufficient_evidence",
      reasons,
    },
    expectedEffect: buildExpectedEffect(recommendation, [], "not_confidently_estimable"),
    whyThisNow: recommendation.decision?.whyNow ?? recommendation.whyNow ?? recommendation.why,
    evidence: recommendation.decision?.evidencePoints ?? recommendation.evidence,
    validation: buildValidation(recommendation),
    rollback: buildRollback(recommendation),
    blockedBecause: [],
    coachNote: recommendation.aiCommentary?.narrative ?? null,
  };
}

function hasTargetStrategyMove(recommendation: GoogleRecommendation) {
  const targetTypePresent =
    recommendation.portfolioTargetType === "tROAS" || recommendation.portfolioTargetType === "tCPA";
  const targetBlockedReasonPresent =
    (targetTypePresent && String(recommendation.mutateEligibilityReason ?? "").includes("portfolio_target")) ||
    Boolean(recommendation.jointAllocatorBlockedReason);
  return (
    recommendation.mutateActionType === "adjust_portfolio_target" ||
    recommendation.sequentialExecutionCandidate?.mutateActionType === "adjust_portfolio_target" ||
    Boolean(recommendation.portfolioTargetAdjustmentPreview) ||
    Boolean(recommendation.jointAllocatorAdjustmentPreview) ||
    targetBlockedReasonPresent ||
    Boolean(
      recommendation.jointExecutionSequence?.some(
        (step) => step.mutateActionType === "adjust_portfolio_target"
      )
    )
  );
}

export function buildGoogleAdsOperatorActionCard(
  recommendation: GoogleRecommendation,
  source: GoogleAdvisorActionContractSource
): GoogleAdvisorActionCard {
  const blockedBecause = buildBlockedReasons(recommendation);

  if (recommendation.type === "query_governance") {
    return asDeterministicActionCard(buildQueryGovernanceCard(recommendation, source, blockedBecause));
  }

  if (hasTargetStrategyMove(recommendation)) {
    return asDeterministicActionCard(buildTargetStrategyCard(recommendation, source, blockedBecause));
  }

  if (
    recommendation.type === "keyword_buildout" ||
    recommendation.type === "non_brand_expansion" ||
    recommendation.type === "orphaned_non_brand_demand"
  ) {
    return asDeterministicActionCard(buildKeywordBuildoutCard(recommendation, source, blockedBecause));
  }

  if (recommendation.type === "shopping_launch_or_split") {
    return asDeterministicActionCard(buildShoppingStructureCard(recommendation, source, blockedBecause));
  }

  if (recommendation.type === "product_allocation") {
    return asDeterministicActionCard(buildProductAllocationCard(recommendation, source, blockedBecause));
  }

  if (
    recommendation.type === "asset_group_structure" ||
    recommendation.type === "creative_asset_deployment"
  ) {
    return asDeterministicActionCard(buildAssetStructureCard(recommendation, source, blockedBecause));
  }

  if (
    recommendation.type === "budget_reallocation" ||
    recommendation.reallocationPreview ||
    recommendation.reallocationBand
  ) {
    return asDeterministicActionCard(buildBudgetReallocationCard(recommendation, source, blockedBecause));
  }

  if (blockedBecause.length > 0) {
    return asDeterministicActionCard(buildBlockedCard(recommendation, source, blockedBecause));
  }

  if (nonEmpty([...(recommendation.playbookSteps ?? []), ...(recommendation.orderedHandoffSteps ?? [])]).length > 0) {
    return asDeterministicActionCard(buildGenericCard(recommendation, source, blockedBecause));
  }

  return asDeterministicActionCard(buildInsufficientEvidenceCard(recommendation, source));
}

export function attachGoogleAdsAdvisorActionContract(input: {
  advisorPayload: GoogleAdvisorResponse;
  source: GoogleAdvisorActionContractSource;
}) {
  const recommendations = input.advisorPayload.recommendations.map((recommendation) => ({
    ...recommendation,
    operatorActionCard: shouldPreserveExistingActionCard(recommendation, input.source)
      ? recommendation.operatorActionCard
      : buildGoogleAdsOperatorActionCard(recommendation, input.source),
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
