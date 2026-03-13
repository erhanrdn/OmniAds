export type GoogleAdsTabId =
  | "overview"
  | "campaigns"
  | "search-terms"
  | "keywords"
  | "ads"
  | "creatives"
  | "audiences"
  | "geo"
  | "devices"
  | "budget"
  | "opportunities";

export interface GoogleAdsMetricsMatrixEntry {
  tab: GoogleAdsTabId;
  primaryResource: string;
  mergeKey: string;
  queryFamilies: string[];
  primaryDimensions: string[];
  primaryMetrics: string[];
  fallbackMetrics?: string[];
  unavailableByDesign?: string[];
}

export const GOOGLE_ADS_METRICS_MATRIX: Record<
  GoogleAdsTabId,
  GoogleAdsMetricsMatrixEntry
> = {
  overview: {
    tab: "overview",
    primaryResource: "customer + campaign",
    mergeKey: "campaign.id",
    queryFamilies: ["customer_summary", "campaign_core_basic", "campaign_share"],
    primaryDimensions: ["customer.id", "campaign.id", "campaign.name", "campaign.channel"],
    primaryMetrics: [
      "impressions",
      "clicks",
      "cost_micros",
      "conversions",
      "conversions_value",
      "interactions",
      "search_impression_share",
      "search_budget_lost_impression_share",
      "search_rank_lost_impression_share",
      "search_top_impression_share",
      "search_absolute_top_impression_share",
      "top_impression_percentage",
      "absolute_top_impression_percentage",
    ],
    fallbackMetrics: [
      "ctr",
      "average_cpc",
      "average_cost",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
      "roas",
    ],
  },
  campaigns: {
    tab: "campaigns",
    primaryResource: "campaign",
    mergeKey: "campaign.id",
    queryFamilies: ["campaign_core_basic", "campaign_share", "campaign_budget"],
    primaryDimensions: [
      "campaign.id",
      "campaign.name",
      "campaign.status",
      "campaign.advertising_channel_type",
      "campaign.serving_status",
    ],
    primaryMetrics: [
      "impressions",
      "clicks",
      "cost_micros",
      "conversions",
      "conversions_value",
      "interactions",
    ],
    fallbackMetrics: [
      "search_impression_share",
      "search_budget_lost_impression_share",
      "search_rank_lost_impression_share",
      "search_top_impression_share",
      "search_absolute_top_impression_share",
      "top_impression_percentage",
      "absolute_top_impression_percentage",
    ],
  },
  "search-terms": {
    tab: "search-terms",
    primaryResource: "search_term_view",
    mergeKey: "search_term_view.search_term + campaign.id + ad_group.id",
    queryFamilies: ["search_term_core", "keyword_lookup"],
    primaryDimensions: [
      "search_term_view.search_term",
      "campaign.id",
      "campaign.name",
      "ad_group.id",
      "ad_group.name",
    ],
    primaryMetrics: [
      "impressions",
      "clicks",
      "cost_micros",
      "conversions",
      "conversions_value",
    ],
    fallbackMetrics: ["ctr", "average_cpc", "conversion_rate", "cost_per_conversion", "value_per_conversion", "roas"],
  },
  keywords: {
    tab: "keywords",
    primaryResource: "keyword_view",
    mergeKey: "ad_group_criterion.criterion_id",
    queryFamilies: ["keyword_core", "keyword_quality"],
    primaryDimensions: [
      "ad_group_criterion.criterion_id",
      "ad_group_criterion.keyword.text",
      "ad_group_criterion.keyword.match_type",
      "campaign.id",
      "campaign.name",
      "ad_group.id",
      "ad_group.name",
    ],
    primaryMetrics: [
      "impressions",
      "clicks",
      "cost_micros",
      "conversions",
      "conversions_value",
      "interactions",
      "search_impression_share",
      "search_top_impression_share",
      "search_absolute_top_impression_share",
      "quality_score",
      "expected_ctr",
      "ad_relevance",
      "landing_page_experience",
    ],
    fallbackMetrics: ["ctr", "average_cpc", "average_cost", "conversion_rate", "cost_per_conversion", "value_per_conversion", "roas"],
  },
  ads: {
    tab: "ads",
    primaryResource: "ad_group_ad",
    mergeKey: "ad_group_ad.ad.id",
    queryFamilies: ["ad_core", "ad_detail"],
    primaryDimensions: [
      "ad_group_ad.ad.id",
      "ad_group_ad.ad.type",
      "campaign.id",
      "campaign.name",
      "ad_group.id",
      "ad_group.name",
    ],
    primaryMetrics: [
      "impressions",
      "clicks",
      "cost_micros",
      "conversions",
      "conversions_value",
      "interactions",
      "ad_strength",
    ],
    fallbackMetrics: ["ctr", "average_cpc", "conversion_rate", "cost_per_conversion", "value_per_conversion", "roas"],
  },
  creatives: {
    tab: "creatives",
    primaryResource: "asset_group + asset_group_asset",
    mergeKey: "asset_group.id",
    queryFamilies: ["asset_group_core", "asset_group_asset_detail"],
    primaryDimensions: [
      "asset_group.id",
      "asset_group.name",
      "campaign.id",
      "campaign.name",
      "asset_group_asset.field_type",
      "asset.id",
      "asset.type",
    ],
    primaryMetrics: [
      "impressions",
      "clicks",
      "cost_micros",
      "conversions",
      "conversions_value",
      "interactions",
    ],
    fallbackMetrics: ["ctr", "average_cpc", "conversion_rate", "cost_per_conversion", "value_per_conversion", "roas"],
    unavailableByDesign: [
      "creative_thumbnail",
      "visual_asset_level_spend",
      "asset_level_conversion_value",
    ],
  },
  audiences: {
    tab: "audiences",
    primaryResource: "ad_group_audience_view",
    mergeKey: "ad_group_criterion.criterion_id",
    queryFamilies: ["audience_core"],
    primaryDimensions: [
      "ad_group_criterion.criterion_id",
      "ad_group_criterion.type",
      "campaign.id",
      "campaign.name",
      "ad_group.id",
      "ad_group.name",
    ],
    primaryMetrics: [
      "impressions",
      "clicks",
      "cost_micros",
      "conversions",
      "conversions_value",
      "interactions",
    ],
    fallbackMetrics: ["ctr", "average_cpc", "conversion_rate", "cost_per_conversion", "value_per_conversion", "roas"],
    unavailableByDesign: ["stable_audience_display_name"],
  },
  geo: {
    tab: "geo",
    primaryResource: "geographic_view",
    mergeKey: "geographic_view.country_criterion_id",
    queryFamilies: ["geo_core"],
    primaryDimensions: [
      "geographic_view.country_criterion_id",
      "geographic_view.location_type",
    ],
    primaryMetrics: [
      "impressions",
      "clicks",
      "cost_micros",
      "conversions",
      "conversions_value",
      "interactions",
    ],
    fallbackMetrics: ["ctr", "average_cpc", "conversion_rate", "cost_per_conversion", "value_per_conversion", "roas"],
  },
  devices: {
    tab: "devices",
    primaryResource: "campaign segmented by device",
    mergeKey: "segments.device",
    queryFamilies: ["device_core"],
    primaryDimensions: ["segments.device"],
    primaryMetrics: [
      "impressions",
      "clicks",
      "cost_micros",
      "conversions",
      "conversions_value",
      "interactions",
    ],
    fallbackMetrics: ["ctr", "average_cpc", "conversion_rate", "cost_per_conversion", "value_per_conversion", "roas"],
  },
  budget: {
    tab: "budget",
    primaryResource: "campaign + campaign_budget",
    mergeKey: "campaign.id",
    queryFamilies: [
      "campaign_budget",
      "campaign_share",
      "campaign_core_basic",
    ],
    primaryDimensions: [
      "campaign.id",
      "campaign.name",
      "campaign_budget.amount_micros",
      "campaign.serving_status",
    ],
    primaryMetrics: [
      "cost_micros",
      "conversions",
      "conversions_value",
      "search_impression_share",
      "search_budget_lost_impression_share",
      "search_rank_lost_impression_share",
      "top_impression_percentage",
      "absolute_top_impression_percentage",
    ],
  },
  opportunities: {
    tab: "opportunities",
    primaryResource: "derived from campaign + keyword + search term + ad + device + audience families",
    mergeKey: "derived",
    queryFamilies: [
      "campaign_core_basic",
      "campaign_share",
      "keyword_core",
      "keyword_quality",
      "search_term_core",
      "ad_core",
      "device_core",
      "audience_core",
    ],
    primaryDimensions: ["derived"],
    primaryMetrics: [
      "all_supported_core_metrics_consumed_from_other_tabs",
    ],
  },
};
