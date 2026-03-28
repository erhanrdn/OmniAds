export interface GoogleAdsRawMetrics {
  impressions: number;
  clicks: number;
  interactions?: number | null;
  spend: number;
  revenue: number;
  conversions: number;
}

export interface GoogleAdsDerivedMetrics {
  ctr: number;
  cpc?: number | null;
  cpa: number;
  roas: number;
  conversionRate?: number | null;
  interactionRate?: number | null;
}

export interface CampaignPerformanceRow
  extends GoogleAdsRawMetrics,
    GoogleAdsDerivedMetrics {
  campaignId: string;
  campaignName: string;
  status: string;
  channel: string;
  servingStatus: string | null;
  dailyBudget: number | null;
  campaignBudgetResourceName?: string | null;
  budgetDeliveryMethod: string | null;
  budgetExplicitlyShared: boolean | null;
  impressionShare: number | null;
  lostIsBudget: number | null;
  lostIsRank: number | null;
  searchTopImpressionShare: number | null;
  searchAbsoluteTopImpressionShare: number | null;
  topImpressionPercentage: number | null;
  absoluteTopImpressionPercentage: number | null;
  spendShare: number;
  revenueShare: number;
  roasDeltaVsAccount: number;
  scaleState: "scale" | "monitor";
  wasteState: "waste" | "healthy";
}

export interface SearchTermPerformanceRow
  extends GoogleAdsRawMetrics,
    GoogleAdsDerivedMetrics {
  searchTerm: string;
  campaignId: string | null;
  campaignName: string;
  adGroupId: string | null;
  adGroupName: string;
  intentClass: string;
  intentConfidence?: "high" | "medium" | "low";
  intentReason?: string;
  intentNeedsReview?: boolean;
  wasteFlag: boolean;
  keywordOpportunityFlag: boolean;
  negativeKeywordFlag: boolean;
  clusterId: string;
  ownershipClass?: "brand" | "non_brand" | "competitor" | "sku_specific" | "weak_commercial";
  ownershipConfidence?: "high" | "medium" | "low";
  ownershipReason?: string;
  ownershipNeedsReview?: boolean;
}

export interface KeywordPerformanceRow
  extends GoogleAdsRawMetrics,
    GoogleAdsDerivedMetrics {
  criterionId: string | null;
  keywordText: string;
  matchType: string;
  campaignId: string | null;
  campaignName: string;
  adGroupId: string | null;
  adGroupName: string;
  impressionShare: number | null;
  qualityScore?: number | null;
  expectedCtr?: string | null;
  adRelevance?: string | null;
  landingPageExperience?: string | null;
  keywordState: "scale" | "weak" | "negative_candidate";
  scaleFlag: boolean;
  negativeCandidateFlag: boolean;
}

export interface AssetPerformanceRow
  extends GoogleAdsRawMetrics,
    GoogleAdsDerivedMetrics {
  assetId: string;
  assetType: string;
  assetText: string | null;
  assetName: string | null;
  imageUrl: string | null;
  campaignId: string | null;
  campaignName: string;
  assetGroupId: string | null;
  assetGroupName: string;
  assetState: "top" | "average" | "underperforming";
  spendShareWithinGroup: number;
  revenueShareWithinGroup: number;
  wasteFlag: boolean;
  expandFlag: boolean;
}

export interface AssetGroupPerformanceRow
  extends GoogleAdsRawMetrics,
    GoogleAdsDerivedMetrics {
  assetGroupId: string;
  assetGroupName: string;
  campaignId: string | null;
  campaignName: string;
  status: string;
  adStrength: string | null;
  finalUrls: string[];
  assetCountByType: Record<string, number>;
  missingAssetTypes: string[];
  audienceSignals: string[];
  searchThemesConfigured: string[];
  spendShare: number;
  revenueShare: number;
  scaleState: "scale" | "monitor";
  weakState: "weak" | "healthy";
  coverageRisk: boolean;
  messagingAlignmentScore: number;
}

export interface ProductPerformanceRow
  extends GoogleAdsRawMetrics,
    GoogleAdsDerivedMetrics {
  productItemId: string;
  productTitle: string;
  merchantCenterId?: string | null;
  feedPrice?: number | null;
  campaignIds?: string[];
  campaignNames?: string[];
  spendShare: number;
  revenueShare: number;
  contributionProxy: number;
  scaleState: "scale" | "monitor";
  underperformingState: "underperforming" | "healthy";
  hiddenWinnerState: "hidden_winner" | "visible";
}

export interface AudiencePerformanceRow
  extends GoogleAdsRawMetrics,
    GoogleAdsDerivedMetrics {
  audienceKey: string;
  audienceNameBestEffort: string;
  audienceType: string;
  campaignId: string | null;
  campaignName: string;
  adGroupId: string | null;
  adGroupName: string;
  audienceState: "strong" | "weak" | "monitor";
  weakSegmentFlag: boolean;
  strongSegmentFlag: boolean;
}

export interface GeoPerformanceRow extends GoogleAdsRawMetrics, GoogleAdsDerivedMetrics {
  geoId: number;
  geoName: string;
  geoState: "scale" | "reduce" | "monitor";
  scaleFlag: boolean;
  reduceFlag: boolean;
}

export interface DevicePerformanceRow
  extends GoogleAdsRawMetrics,
    GoogleAdsDerivedMetrics {
  device: string;
  deviceState: "scale" | "weak" | "monitor";
  scaleFlag: boolean;
  weakFlag: boolean;
}

export interface GoogleAdsReportFamilyMeta {
  partial: boolean;
  warnings: string[];
  failed_queries: Array<{
    query: string;
    family: string;
    customerId: string;
    message: string;
    status?: number;
    apiStatus?: string;
    apiErrorCode?: string;
    loginCustomerId?: string;
    severity?: "core" | "optional";
    category?:
      | "auth_permission_context"
      | "unsupported_query_shape"
      | "unavailable_metric"
      | "bad_query_shape"
      | "optional_advanced_failure"
      | "unknown";
  }>;
  unavailable_metrics: string[];
  query_names: string[];
  row_count: number;
}
