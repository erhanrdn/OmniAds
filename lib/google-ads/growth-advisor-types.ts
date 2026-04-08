export type GoogleAdvisorDateRange = "3" | "7" | "14" | "30" | "90" | "custom";
export type GoogleAdvisorAnalysisWindowKey =
  | "alarm_1d"
  | "alarm_3d"
  | "alarm_7d"
  | "operational_28d"
  | "query_governance_56d"
  | "baseline_84d";

export type GoogleCampaignFamily =
  | "brand_search"
  | "non_brand_search"
  | "shopping"
  | "pmax_scaling"
  | "remarketing"
  | "supporting";

export type GoogleDemandRole = "Scaling" | "Validation" | "Support" | "Test";

export type GoogleRecommendationType =
  | "operating_model_gap"
  | "non_brand_expansion"
  | "orphaned_non_brand_demand"
  | "shopping_launch_or_split"
  | "search_shopping_overlap"
  | "brand_capture_control"
  | "brand_leakage"
  | "query_governance"
  | "keyword_buildout"
  | "product_allocation"
  | "pmax_scaling_fit"
  | "asset_group_structure"
  | "creative_asset_deployment"
  | "budget_reallocation"
  | "geo_device_adjustment"
  | "diagnostic_guardrail";

export type GoogleDecisionState = "act" | "test" | "watch";

export type GoogleContributionImpact = "low" | "medium" | "high";

export type GoogleDecisionFamily =
  | "waste_control"
  | "growth_unlock"
  | "structure_repair"
  | "commercial_constraint"
  | "experimentation";

export type GoogleDoBucket = "do_now" | "do_next" | "do_later";

export type GoogleDataTrust = "high" | "medium" | "low";

export type GoogleIntegrityState = "ready" | "downgraded" | "blocked" | "suppressed";

export type GoogleSupportStrength = "weak" | "moderate" | "strong";

export type GoogleActionability = "ready_now" | "ready_after_prerequisite" | "not_ready";

export type GoogleReversibility = "high" | "medium" | "low";

export type GoogleSequenceStage = "stabilize" | "protect" | "unlock" | "expand" | "scale";

export type GoogleRecommendationMemoryStatus =
  | "new"
  | "persistent"
  | "escalated"
  | "downgraded"
  | "resolved"
  | "suppressed";

export type GoogleQueryOwnershipClass =
  | "brand"
  | "non_brand"
  | "competitor"
  | "sku_specific"
  | "weak_commercial";

export type GoogleQueryIntentClass =
  | "brand_core"
  | "brand_mixed"
  | "product_specific"
  | "category_high_intent"
  | "category_mid_intent"
  | "price_sensitive"
  | "research_low_intent"
  | "support_or_post_purchase";

export type GoogleOverlapType =
  | "brand_leakage"
  | "search_shopping_overlap"
  | "orphaned_non_brand_demand";

export type GoogleOutcomeVerdict = "improved" | "neutral" | "degraded" | "unknown";
export type GoogleMarginBand = "low" | "medium" | "high" | "unknown";
export type GoogleStockState = "in_stock" | "low_stock" | "out_of_stock" | "unknown";
export type GoogleDiscountState = "full_price" | "discounted" | "unknown";
export type GoogleCommerceConfidence = "high" | "medium" | "low";
export type GoogleOverlapSeverity = "low" | "medium" | "high" | "critical";
export type GoogleOverlapTrend = "improving" | "stable" | "worsening" | "unknown";
export type GoogleOutcomeConfidence = "low" | "medium" | "high";
export type GoogleOutcomeVerdictFailReason =
  | "insufficient_data_window"
  | "entity_not_found"
  | "weak_mapping"
  | "concurrent_changes"
  | "missing_baseline";
export type GoogleExecutionMode = "handoff" | "mutate_ready";
export type GoogleMutateActionType =
  | "add_negative_keyword"
  | "pause_asset"
  | "pause_ad"
  | "adjust_campaign_budget"
  | "adjust_shared_budget"
  | "adjust_portfolio_target";
export type GoogleRollbackActionType =
  | "remove_negative_keyword"
  | "enable_asset"
  | "enable_ad"
  | "restore_campaign_budget"
  | "restore_shared_budget"
  | "restore_portfolio_target";
export type GoogleRollbackSafetyState = "safe" | "caution" | "blocked";
export type GoogleExecutionStatus =
  | "not_started"
  | "pending"
  | "applied"
  | "failed"
  | "rolled_back"
  | "partially_applied";
export type GoogleCompletionMode = "full" | "partial" | "unknown";
export type GoogleExecutionTrustBand = "low" | "medium" | "high" | "insufficient_data";
export type GoogleDependencyReadiness =
  | "not_ready"
  | "done_unverified"
  | "done_trusted"
  | "done_degraded";
export type GoogleExecutionTrustSource = "observed_pattern" | "insufficient_data_fallback";
export type GoogleBatchStatus = "pending" | "applied" | "partially_applied" | "failed" | "rolled_back";
export type GoogleSharedStateGovernanceType =
  | "standalone"
  | "shared_budget"
  | "portfolio_bid_strategy"
  | "shared_budget_and_portfolio"
  | "unknown";
export type GoogleSharedStateAwarenessStatus = "known" | "not_ingested";
export type GooglePortfolioGovernanceStatus =
  | "none"
  | "present"
  | "mixed_governance"
  | "dominant"
  | "unknown";
export type GooglePortfolioCouplingStrength = "low" | "medium" | "high";
export type GooglePortfolioStrategyStatus = "stable" | "learning" | "limited" | "misconfigured" | "unknown";
export type GooglePortfolioContaminationSource =
  | "none"
  | "shared_budget_contamination"
  | "portfolio_strategy_contamination"
  | "mixed_allocator_contamination";
export type GooglePortfolioContaminationSeverity = "low" | "medium" | "high" | "critical";
export type GooglePortfolioCascadeRiskBand = "contained" | "moderate" | "broad" | "unknown";
export type GoogleClusterReadiness =
  | "blocked"
  | "staging"
  | "ready_unverified"
  | "ready_trusted"
  | "degraded"
  | "partially_executable";
export type GoogleClusterStatus =
  | "new"
  | "blocked"
  | "ready"
  | "stabilizing"
  | "executing"
  | "partially_completed"
  | "completed"
  | "rolled_back"
  | "degraded";
export type GoogleClusterExecutionStatus =
  | "not_started"
  | "pending"
  | "stabilizing"
  | "applied"
  | "partially_applied"
  | "failed"
  | "rolled_back"
  | "partially_rolled_back"
  | "rollback_failed";
export type GoogleClusterOutcomeState = "unvalidated" | "resolved" | "stabilizing" | "degraded" | "mixed";
export type GoogleClusterMoveValidity =
  | "valid"
  | "partially_effective"
  | "compromised"
  | "failed"
  | "reverted"
  | "inconclusive";
export type GoogleClusterRecoveryState =
  | "recoverable_retry"
  | "manual_recovery_required"
  | "accepted_partial_revert"
  | "unrecoverable_but_stable";
export type GoogleActionClusterType =
  | "cleanup_only"
  | "cleanup_then_scale"
  | "cleanup_then_reallocate"
  | "pure_reallocation"
  | "overlap_resolution"
  | "asset_cleanup";
export type GoogleActionClusterBucket = "now" | "next" | "blocked";
export type GoogleActionClusterStepType = "batch_mutate" | "mutate" | "handoff";
export type GoogleActionClusterStepCriticality =
  | "critical"
  | "supporting"
  | "validation"
  | "optional"
  | "rollback_sensitive";
export type GoogleActionClusterStepFailureBoundary =
  | "invalidate_move"
  | "degrade_move"
  | "continue_with_caution";
export type GoogleActionClusterStepValidationRole =
  | "unlock_gate"
  | "outcome_check"
  | "supporting_signal";

export interface GoogleAiCommentary {
  commentaryType: "explanation" | "brief" | "qa_response" | "scenario";
  groundedOnRecommendationIds: string[];
  narrative: string;
  limitations: string[];
  isFallback: boolean;
}

export interface GoogleRecommendationEvidence {
  label: string;
  value: string;
}

export type GoogleDecisionV2Family =
  | "measurement_trust"
  | "waste_control"
  | "demand_capture"
  | "budget_bidding"
  | "creative_feed"
  | "structure_governance"
  | "brand_governance";

export type GoogleDecisionLane =
  | "review"
  | "test"
  | "watch"
  | "suppressed"
  | "auto_hidden";

export type GoogleDecisionRiskLevel = "low" | "medium" | "high";
export type GoogleDecisionBlastRadius = "entity" | "campaign" | "account";

export interface GoogleDecisionNarrative {
  whatHappened: string;
  whyItHappened: string;
  whatToDo: string;
  risk: string;
  howToValidate: string[];
  howToRollBack: string;
}

export interface GoogleDecisionWindowsUsed {
  healthWindow: GoogleAdvisorAnalysisWindowKey;
  primaryWindow: GoogleAdvisorAnalysisWindowKey;
  queryWindow?: GoogleAdvisorAnalysisWindowKey;
  baselineWindow: GoogleAdvisorAnalysisWindowKey;
  maturityCutoffDays: number;
}

export interface GoogleDecisionSchema {
  decisionFamily: GoogleDecisionV2Family;
  lane: GoogleDecisionLane;
  riskLevel: GoogleDecisionRiskLevel;
  blastRadius: GoogleDecisionBlastRadius;
  confidence: number;
  windowsUsed: GoogleDecisionWindowsUsed;
  whyNow: string;
  whyNot: string[];
  blockers: string[];
  validationPlan: string[];
  rollbackPlan: string[];
  evidenceSummary: string;
  evidencePoints: GoogleRecommendationEvidence[];
}

export interface GoogleRecommendationTimeframeContext {
  coreVerdict: string;
  selectedRangeNote: string;
  historicalSupport: string;
}

export interface GoogleAdvisorAnalysisWindow {
  key: GoogleAdvisorAnalysisWindowKey;
  label: string;
  startDate: string;
  endDate: string;
  days: number;
  role: "health_alarm" | "operational_decision" | "query_governance" | "baseline";
}

export interface GoogleAdvisorExecutionSurface {
  mode: "operator_first_manual_plan";
  decisionEngineV2Enabled: boolean;
  writebackEnabled: boolean;
  mutateVerified: false;
  rollbackVerified: false;
  capabilityGateReason: string;
  summary: string;
}

export interface GooglePotentialContribution {
  label: string;
  impact: GoogleContributionImpact;
  summary: string;
  estimatedRevenueLiftRange?: string;
  estimatedWasteRecoveryRange?: string;
  estimatedEfficiencyLiftRange?: string;
}

export interface GoogleCampaignRoleRow {
  campaignId: string;
  campaignName: string;
  family: GoogleCampaignFamily;
  familyLabel: string;
  role: GoogleDemandRole;
  roleLabel: string;
  recommendationCount: number;
  topActionHint: string | null;
}

export interface GoogleRecommendationCommerceSignals {
  marginBand: GoogleMarginBand;
  stockState: GoogleStockState;
  discountState: GoogleDiscountState;
  heroSku: boolean | null;
}

export interface GoogleActionClusterStep {
  stepId: string;
  title: string;
  stepType: GoogleActionClusterStepType;
  required: boolean;
  stepCriticality: GoogleActionClusterStepCriticality;
  stepFailureBoundary: GoogleActionClusterStepFailureBoundary;
  stepValidationRole: GoogleActionClusterStepValidationRole;
  executionMode: GoogleExecutionMode | "handoff";
  mutateActionType?: GoogleMutateActionType | null;
  recommendationIds: string[];
  recommendationFingerprints: string[];
  batchGroupKey?: string | null;
  executionTrustBand?: GoogleExecutionTrustBand | null;
  dependencyReadiness?: GoogleDependencyReadiness | null;
  stabilizationHoldUntil?: string | null;
  waitReason?: string | null;
  sequenceKey?: string | null;
  transactionIds?: string[];
  batchItems?: Array<{
    recommendationFingerprint: string;
    mutateActionType: "add_negative_keyword" | "pause_asset";
    mutatePayloadPreview: Record<string, unknown>;
    rollbackActionType?: "remove_negative_keyword" | "enable_asset" | null;
    rollbackPayloadPreview?: Record<string, unknown> | null;
    executionTrustBand?: GoogleExecutionTrustBand | null;
    batchGroupKey?: string | null;
  }> | null;
  mutateItem?: {
    recommendationFingerprint: string;
    mutateActionType: GoogleMutateActionType;
    mutatePayloadPreview: Record<string, unknown>;
    rollbackActionType?: GoogleRollbackActionType | null;
    rollbackPayloadPreview?: Record<string, unknown> | null;
    executionTrustBand?: GoogleExecutionTrustBand | null;
    dependencyReadiness?: GoogleDependencyReadiness | null;
    stabilizationHoldUntil?: string | null;
    waitReason?: string | null;
    sequenceKey?: string | null;
  } | null;
}

export interface GoogleActionCluster {
  clusterId: string;
  clusterType: GoogleActionClusterType;
  clusterObjective: string;
  clusterBucket: GoogleActionClusterBucket;
  memberRecommendationIds: string[];
  memberRecommendationFingerprints: string[];
  clusterReadiness: GoogleClusterReadiness;
  clusterTrustBand: GoogleExecutionTrustBand | null;
  clusterRankScore: number;
  clusterRankReason: string;
  clusterStatus: GoogleClusterStatus;
  clusterMoveValidity: GoogleClusterMoveValidity;
  clusterMoveValidityReason: string;
  clusterMoveConfidence: GoogleOutcomeConfidence | null;
  sharedStateGovernanceType?: GoogleSharedStateGovernanceType | null;
  sharedStateAwarenessStatus?: GoogleSharedStateAwarenessStatus | null;
  allocatorCoupled?: boolean | null;
  allocatorCouplingConfidence?: GoogleOutcomeConfidence | null;
  governedEntityCount?: number | null;
  sharedBudgetResourceName?: string | null;
  portfolioBidStrategyType?: string | null;
  portfolioBidStrategyResourceName?: string | null;
  portfolioBidStrategyStatus?: GooglePortfolioStrategyStatus | null;
  portfolioTargetType?: string | null;
  portfolioTargetValue?: number | null;
  portfolioGovernanceStatus?: GooglePortfolioGovernanceStatus | null;
  portfolioCouplingStrength?: GooglePortfolioCouplingStrength | null;
  portfolioCampaignShare?: number | null;
  portfolioDominance?: GoogleOutcomeConfidence | null;
  portfolioContaminationSource?: GooglePortfolioContaminationSource | null;
  portfolioContaminationSeverity?: GooglePortfolioContaminationSeverity | null;
  portfolioCascadeRiskBand?: GooglePortfolioCascadeRiskBand | null;
  portfolioAttributionWindowDays?: number | null;
  portfolioBlockedReason?: string | null;
  portfolioCautionReason?: string | null;
  portfolioUnlockGuidance?: string | null;
  coupledCampaignIds?: string[];
  coupledCampaignNames?: string[];
  sharedStateMutateBlockedReason?: string | null;
  sharedStateContaminationFlag?: boolean | null;
  dependsOnClusterIds: string[];
  unlocksClusterIds: string[];
  conflictsWithClusterIds: string[];
  recoveryState?: GoogleClusterRecoveryState | null;
  recoveryRecommendedAction?: string | null;
  recoveryFailedChildStepIds?: string[];
  rollbackRecoveryAvailable?: boolean | null;
  executionSummary: {
    clusterExecutionId: string | null;
    clusterExecutionStatus: GoogleClusterExecutionStatus;
    childExecutionOrder: string[];
    childTransactionIds: string[];
    completedChildStepIds: string[];
    failedChildStepIds: string[];
    currentStepId: string | null;
    waitingChildStepId?: string | null;
    nextEligibleAt?: string | null;
    stopReason: string | null;
    retryEligibleFailedChildStepIds?: string[];
    manualRecoveryInstructions?: string[];
  };
  validationPlan: string[];
  outcomeState: {
    verdict: GoogleClusterOutcomeState;
    confidence: GoogleOutcomeConfidence | null;
    failReason: string | null;
    lastValidationCheckAt: string | null;
    reason: string | null;
    contaminationFlags?: string[];
    reallocationNetImpact?: {
      sourceDelta: number | null;
      destinationDelta: number | null;
      netDelta: number | null;
    } | null;
  };
  steps: GoogleActionClusterStep[];
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  lastExecutedAt?: string | null;
  lastRolledBackAt?: string | null;
}

export interface GoogleRecommendation {
  id: string;
  level: "account" | "campaign" | "query_cluster" | "product_cluster" | "asset_group";
  entityId?: string;
  entityName?: string;
  type: GoogleRecommendationType;
  strategyLayer:
    | "Operating Model"
    | "Search Governance"
    | "Non-Brand Expansion"
    | "Shopping & Products"
    | "PMax Scaling"
    | "Budget Moves"
    | "Assets & Testing"
    | "Diagnostics";
  decisionState: GoogleDecisionState;
  decisionFamily: GoogleDecisionFamily;
  doBucket: GoogleDoBucket;
  priority: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  dataTrust: GoogleDataTrust;
  integrityState: GoogleIntegrityState;
  supportStrength: GoogleSupportStrength;
  actionability: GoogleActionability;
  reversibility: GoogleReversibility;
  comparisonCohort?: string;
  title: string;
  summary: string;
  why: string;
  decision: GoogleDecisionSchema;
  decisionNarrative: GoogleDecisionNarrative;
  whyNow: string;
  whatChanged?: string | null;
  reasonCodes: string[];
  confidenceExplanation: string;
  confidenceDegradationReasons: string[];
  recommendedAction: string;
  potentialContribution: GooglePotentialContribution;
  impactBand: GoogleContributionImpact;
  effortScore: "low" | "medium" | "high";
  rollbackGuidance?: string | null;
  validationChecklist: string[];
  blockers: string[];
  blockedByRecommendationIds?: string[];
  conflictsWithRecommendationIds?: string[];
  dependsOnRecommendationIds?: string[];
  sequenceStage?: GoogleSequenceStage;
  rankScore: number;
  rankExplanation: string;
  impactScore: number;
  recommendationFingerprint: string;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  priorStatus?: GoogleRecommendationMemoryStatus | null;
  currentStatus?: GoogleRecommendationMemoryStatus;
  seenCount?: number;
  userAction?: "applied" | "dismissed" | "ignored" | null;
  dismissReason?: string | null;
  suppressUntil?: string | null;
  appliedAt?: string | null;
  outcomeCheckAt?: string | null;
  outcomeVerdict?: GoogleOutcomeVerdict | null;
  outcomeMetric?: string | null;
  outcomeDelta?: number | null;
  outcomeCheckWindowDays?: number | null;
  outcomeVerdictFailReason?: GoogleOutcomeVerdictFailReason | null;
  outcomeConfidence?: GoogleOutcomeConfidence | null;
  executionStatus?: GoogleExecutionStatus | null;
  executedAt?: string | null;
  executionError?: string | null;
  rollbackAvailable?: boolean | null;
  rollbackExecutedAt?: string | null;
  completionMode?: GoogleCompletionMode | null;
  completedStepCount?: number | null;
  totalStepCount?: number | null;
  executionTargetType?: "campaign" | "asset_group" | "asset" | "search_term" | "account";
  executionTargetId?: string | null;
  deepLinkUrl?: string | null;
  handoffPayload?: Record<string, unknown> | null;
  handoffUnavailableReason?: string | null;
  executionMode?: GoogleExecutionMode;
  mutateActionType?: GoogleMutateActionType | null;
  mutatePayloadPreview?: Record<string, unknown> | null;
  mutateEligibilityReason?: string | null;
  sequentialExecutionCandidate?: {
    mutateActionType: GoogleMutateActionType;
    mutatePayloadPreview: Record<string, unknown>;
    rollbackActionType?: GoogleRollbackActionType | null;
    rollbackPayloadPreview?: Record<string, unknown> | null;
    executionTrustBand?: GoogleExecutionTrustBand | null;
    dependencyReadiness?: GoogleDependencyReadiness | null;
    stabilizationHoldUntil?: string | null;
    waitReason?: string | null;
  } | null;
  jointExecutionSequence?: Array<{
    stepKey: string;
    title: string;
    mutateActionType: GoogleMutateActionType;
    mutatePayloadPreview: Record<string, unknown>;
    rollbackActionType?: GoogleRollbackActionType | null;
    rollbackPayloadPreview?: Record<string, unknown> | null;
    executionTrustBand?: GoogleExecutionTrustBand | null;
    dependencyReadiness?: GoogleDependencyReadiness | null;
    stabilizationHoldUntil?: string | null;
    waitReason?: string | null;
    transactionIds?: string[];
    executionStatus?: GoogleExecutionStatus | null;
  }> | null;
  jointAllocatorAdjustmentPreview?: {
    budgetActionType: "adjust_campaign_budget" | "adjust_shared_budget";
    budgetPreviousAmount: number;
    budgetProposedAmount: number;
    budgetDeltaPercent: number;
    portfolioTargetType: "tROAS" | "tCPA";
    portfolioPreviousValue: number;
    portfolioProposedValue: number;
    portfolioDeltaPercent: number;
    combinedShockPercent: number;
    executionOrder: string[];
    governedCampaigns: Array<{ id: string; name: string }>;
    boundedDelta: boolean;
    attributionWindowDays: number | null;
  } | null;
  jointAllocatorBlockedReason?: string | null;
  jointAllocatorCautionReason?: string | null;
  canRollback?: boolean;
  rollbackActionType?: GoogleRollbackActionType | null;
  rollbackPayloadPreview?: Record<string, unknown> | null;
  budgetAdjustmentPreview?: {
    previousAmount: number;
    proposedAmount: number;
    deltaPercent: number;
  } | null;
  sharedBudgetAdjustmentPreview?: {
    sharedBudgetResourceName: string;
    previousAmount: number;
    proposedAmount: number;
    deltaPercent: number;
    deltaCapPercent?: number | null;
    governedCampaigns: Array<{ id: string; name: string }>;
    zeroSumNote: string | null;
    boundedDelta: boolean;
    mixedGovernance?: boolean | null;
  } | null;
  portfolioTargetAdjustmentPreview?: {
    portfolioBidStrategyResourceName: string;
    portfolioBidStrategyType: string | null;
    targetType: string;
    previousValue: number;
    proposedValue: number;
    deltaPercent: number;
    governedCampaigns: Array<{ id: string; name: string }>;
    boundedDelta: boolean;
    attributionWindowDays: number | null;
  } | null;
  rollbackSafetyState?: GoogleRollbackSafetyState | null;
  rollbackAvailableUntil?: string | null;
  executionTrustScore?: number | null;
  executionTrustBand?: GoogleExecutionTrustBand | null;
  executionTrustSource?: GoogleExecutionTrustSource | null;
  executionPolicyReason?: string | null;
  dependencyReadiness?: GoogleDependencyReadiness | null;
  stabilizationHoldUntil?: string | null;
  batchEligible?: boolean;
  batchGroupKey?: string | null;
  transactionId?: string | null;
  batchStatus?: GoogleBatchStatus | null;
  batchSize?: number | null;
  batchRollbackAvailable?: boolean | null;
  clusterId?: string | null;
  clusterExecutionId?: string | null;
  clusterStepId?: string | null;
  clusterMoveValidity?: GoogleClusterMoveValidity | null;
  recoveryState?: GoogleClusterRecoveryState | null;
  recoveryRecommendedAction?: string | null;
  rollbackRecoveryAvailable?: boolean | null;
  sharedStateGovernanceType?: GoogleSharedStateGovernanceType | null;
  sharedStateAwarenessStatus?: GoogleSharedStateAwarenessStatus | null;
  allocatorCoupled?: boolean | null;
  allocatorCouplingConfidence?: GoogleOutcomeConfidence | null;
  governedEntityCount?: number | null;
  sharedBudgetResourceName?: string | null;
  portfolioBidStrategyType?: string | null;
  portfolioBidStrategyResourceName?: string | null;
  portfolioBidStrategyStatus?: GooglePortfolioStrategyStatus | null;
  portfolioTargetType?: string | null;
  portfolioTargetValue?: number | null;
  portfolioGovernanceStatus?: GooglePortfolioGovernanceStatus | null;
  portfolioCouplingStrength?: GooglePortfolioCouplingStrength | null;
  portfolioCampaignShare?: number | null;
  portfolioDominance?: GoogleOutcomeConfidence | null;
  portfolioContaminationSource?: GooglePortfolioContaminationSource | null;
  portfolioContaminationSeverity?: GooglePortfolioContaminationSeverity | null;
  portfolioCascadeRiskBand?: GooglePortfolioCascadeRiskBand | null;
  portfolioAttributionWindowDays?: number | null;
  portfolioBlockedReason?: string | null;
  portfolioCautionReason?: string | null;
  portfolioUnlockGuidance?: string | null;
  coupledCampaignIds?: string[];
  coupledCampaignNames?: string[];
  sharedStateMutateBlockedReason?: string | null;
  sharedStateContaminationFlag?: boolean | null;
  reallocationPreview?: {
    sourceCampaigns: Array<{ id: string; previousAmount: number; proposedAmount: number }>;
    destinationCampaigns: Array<{ id: string; previousAmount: number; proposedAmount: number }>;
    netDelta: number;
  } | null;
  baselineSnapshot?: Record<string, unknown> | null;
  overlapType?: GoogleOverlapType | null;
  overlapEntities?: string[];
  overlapSeverity?: GoogleOverlapSeverity | null;
  overlapTrend?: GoogleOverlapTrend | null;
  commerceSignals?: GoogleRecommendationCommerceSignals | null;
  commerceConfidence?: GoogleCommerceConfidence | null;
  orderedHandoffSteps?: string[];
  coreStepIds?: string[];
  completedStepIds?: string[];
  skippedStepIds?: string[];
  estimatedOperatorMinutes?: number | null;
  evidence: GoogleRecommendationEvidence[];
  timeframeContext: GoogleRecommendationTimeframeContext;
  aiCommentary?: GoogleAiCommentary | null;
  affectedFamilies?: GoogleCampaignFamily[];
  affectedCampaignIds?: string[];
  seedQueriesExact?: string[];
  seedQueriesPhrase?: string[];
  seedThemesBroad?: string[];
  negativeGuardrails?: string[];
  negativeClusters?: string[];
  negativeQueries?: string[];
  promoteToExact?: string[];
  promoteToPhrase?: string[];
  broadDiscoveryThemes?: string[];
  launchMode?: "new_control_shopping" | "category_split" | "hero_sku_shopping";
  startingSkuClusters?: string[];
  shoppingRationale?: string;
  scaleSkuClusters?: string[];
  reduceSkuClusters?: string[];
  hiddenWinnerSkuClusters?: string[];
  heroSkuClusters?: string[];
  scaleReadyAssets?: string[];
  testOnlyAssets?: string[];
  replaceAssets?: string[];
  replacementAngles?: string[];
  weakAssetGroups?: string[];
  keepSeparateAssetGroups?: string[];
  reallocationBand?: string;
  diagnosticFlags?: string[];
  prerequisites?: string[];
  playbookSteps?: string[];
}

export interface GoogleRecommendationSection {
  id: string;
  title:
    | "Operating Model"
    | "Search Governance"
    | "Non-Brand Expansion"
    | "Shopping & Products"
    | "PMax Scaling"
    | "Budget Moves"
    | "Assets & Testing"
    | "Diagnostics";
  recommendations: GoogleRecommendation[];
}

export interface GoogleDecisionSummary {
  headline: string;
  operatorNote: string;
  demandMap: string;
  topPriority: string;
  totalRecommendations: number;
  actRecommendationCount: number;
  accountState:
    | "scaling_ready"
    | "budget_constrained"
    | "quality_degraded"
    | "structural_decline"
    | "data_insufficient";
  accountOperatingMode: string;
  topConstraint: string;
  topGrowthLever: string;
  recommendedFocusToday: string;
  watchouts: string[];
  dataTrustSummary: string;
  campaignRoles: GoogleCampaignRoleRow[];
}

export interface GoogleAdvisorHistoricalSupport {
  source: "platform_aggregate" | "warehouse_aggregate";
  available: boolean;
  coverageDays: number;
  campaigns: {
    entityCount: number;
    spend: number;
    revenue: number;
    conversions: number;
  };
  searchTerms: {
    entityCount: number;
    spend: number;
    revenue: number;
    conversions: number;
  };
  products: {
    entityCount: number;
    spend: number;
    revenue: number;
    conversions: number;
  };
}

export interface GoogleAdvisorMetadata {
  analysisMode: "snapshot" | "debug_custom";
  asOfDate: string;
  decisionEngineVersion: "v2";
  snapshotModel?: "decision_snapshot_v2";
  selectedWindowKey: "operational_28d" | "custom";
  primaryWindowKey?: "operational_28d";
  queryWindowKey?: "query_governance_56d";
  baselineWindowKey?: "baseline_84d";
  maturityCutoffDays?: number;
  lagAdjustedEndDate?: {
    available: boolean;
    value: string | null;
    note: string | null;
  } | null;
  selectedRangeRole?: "contextual_only";
  analysisWindows: {
    healthAlarmWindows: GoogleAdvisorAnalysisWindow[];
    operationalWindow: GoogleAdvisorAnalysisWindow;
    queryGovernanceWindow: GoogleAdvisorAnalysisWindow;
    baselineWindow: GoogleAdvisorAnalysisWindow;
  };
  executionSurface: GoogleAdvisorExecutionSurface;
  historicalSupportAvailable: boolean;
  historicalSupport?: GoogleAdvisorHistoricalSupport | null;
  decisionSummaryTotals?: {
    windowKey: "operational_28d";
    windowLabel: string;
    spend: number;
    revenue: number;
    conversions: number;
    roas: number;
  } | null;
  canonicalWindowTotals?: {
    spend: number;
    revenue: number;
    conversions: number;
    roas: number;
  } | null;
  selectedRangeContext?: {
    eligible: boolean;
    state: "aligned" | "stronger" | "softer" | "volatile" | "hidden";
    label: string;
    summary: string;
    selectedRangeStart: string;
    selectedRangeEnd: string;
    deltaPercent?: number | null;
    metricKey?: "roas" | "cpa" | "revenue" | "conversions" | null;
  } | null;
}

export interface GoogleAdvisorResponse {
  summary: GoogleDecisionSummary;
  recommendations: GoogleRecommendation[];
  sections: GoogleRecommendationSection[];
  clusters: GoogleActionCluster[];
  metadata?: GoogleAdvisorMetadata;
}
