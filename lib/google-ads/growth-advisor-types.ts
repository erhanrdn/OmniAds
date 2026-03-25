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
  | "shopping_launch_or_split"
  | "brand_capture_control"
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
  priority: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  comparisonCohort?: string;
  title: string;
  summary: string;
  why: string;
  recommendedAction: string;
  potentialContribution: GooglePotentialContribution;
  evidence: GoogleRecommendationEvidence[];
  timeframeContext: GoogleRecommendationTimeframeContext;
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
  campaignRoles: GoogleCampaignRoleRow[];
}

export interface GoogleAdvisorResponse {
  summary: GoogleDecisionSummary;
  recommendations: GoogleRecommendation[];
  sections: GoogleRecommendationSection[];
}
