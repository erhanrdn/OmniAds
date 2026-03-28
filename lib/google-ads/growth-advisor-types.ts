export type GoogleAdvisorDateRange = "3" | "7" | "14" | "30" | "90" | "custom";

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
  | "adjust_campaign_budget";
export type GoogleRollbackActionType =
  | "remove_negative_keyword"
  | "enable_asset"
  | "enable_ad"
  | "restore_campaign_budget";
export type GoogleExecutionStatus =
  | "not_started"
  | "pending"
  | "applied"
  | "failed"
  | "rolled_back"
  | "partially_applied";
export type GoogleCompletionMode = "full" | "partial" | "unknown";
export type GoogleExecutionTrustBand = "low" | "medium" | "high";
export type GoogleDependencyReadiness =
  | "not_ready"
  | "done_unverified"
  | "done_trusted"
  | "done_degraded";

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

export interface GoogleRecommendationTimeframeContext {
  coreVerdict: string;
  selectedRangeNote: string;
  historicalSupport: string;
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
  canRollback?: boolean;
  rollbackActionType?: GoogleRollbackActionType | null;
  rollbackPayloadPreview?: Record<string, unknown> | null;
  budgetAdjustmentPreview?: {
    previousAmount: number;
    proposedAmount: number;
    deltaPercent: number;
  } | null;
  executionTrustScore?: number | null;
  executionTrustBand?: GoogleExecutionTrustBand | null;
  executionPolicyReason?: string | null;
  dependencyReadiness?: GoogleDependencyReadiness | null;
  stabilizationHoldUntil?: string | null;
  batchEligible?: boolean;
  batchGroupKey?: string | null;
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

export interface GoogleAdvisorResponse {
  summary: GoogleDecisionSummary;
  recommendations: GoogleRecommendation[];
  sections: GoogleRecommendationSection[];
}
