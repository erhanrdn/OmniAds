export interface GoogleAdsNamedQuery {
  name: string;
  family: string;
  resource: string;
  query: string;
  mergeKey: string;
  metrics: string[];
}

function compactQuery(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function buildDateWhereClause(startDate: string, endDate: string): string {
  return `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
}

export function buildGoogleAdsQuery(params: {
  select: string[];
  from: string;
  where?: string[];
  orderBy?: string[];
  limit?: number;
}): string {
  const parts = [
    `SELECT ${params.select.join(", ")}`,
    `FROM ${params.from}`,
  ];
  if (params.where && params.where.length > 0) {
    parts.push(`WHERE ${params.where.join(" AND ")}`);
  }
  if (params.orderBy && params.orderBy.length > 0) {
    parts.push(`ORDER BY ${params.orderBy.join(", ")}`);
  }
  if (typeof params.limit === "number") {
    parts.push(`LIMIT ${params.limit}`);
  }
  return compactQuery(parts.join(" "));
}

export function buildCustomerSummaryQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "customer_summary",
    family: "customer_summary",
    resource: "customer",
    mergeKey: "customer",
    metrics: [
      "impressions",
      "clicks",
      "ctr",
      "cost_micros",
      "conversions",
      "conversions_value",
      "average_cpc",
      "average_cost",
      "interaction_rate",
      "interactions",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
      "video_views",
      "video_view_rate",
      "average_cpv",
      "engagements",
      "engagement_rate",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "customer.id",
        "customer.descriptive_name",
        "metrics.impressions",
        "metrics.clicks",
        "metrics.ctr",
        "metrics.cost_micros",
        "metrics.conversions",
        "metrics.conversions_value",
        "metrics.average_cpc",
        "metrics.average_cost",
        "metrics.interaction_rate",
        "metrics.interactions",
        "metrics.conversion_rate",
        "metrics.cost_per_conversion",
        "metrics.value_per_conversion",
        "metrics.video_views",
        "metrics.video_view_rate",
        "metrics.average_cpv",
        "metrics.engagements",
        "metrics.engagement_rate",
      ],
      from: "customer",
      where: [buildDateWhereClause(startDate, endDate)],
    }),
  };
}

export function buildCampaignCoreQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "campaign_core",
    family: "campaign_core",
    resource: "campaign",
    mergeKey: "campaign.id",
    metrics: [
      "impressions",
      "clicks",
      "ctr",
      "cost_micros",
      "conversions",
      "conversions_value",
      "average_cpc",
      "average_cost",
      "interaction_rate",
      "interactions",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "campaign.id",
        "campaign.name",
        "campaign.status",
        "campaign.advertising_channel_type",
        "campaign.serving_status",
        "metrics.impressions",
        "metrics.clicks",
        "metrics.ctr",
        "metrics.cost_micros",
        "metrics.conversions",
        "metrics.conversions_value",
        "metrics.average_cpc",
        "metrics.average_cost",
        "metrics.interaction_rate",
        "metrics.interactions",
        "metrics.conversion_rate",
        "metrics.cost_per_conversion",
        "metrics.value_per_conversion",
      ],
      from: "campaign",
      where: [
        buildDateWhereClause(startDate, endDate),
        "campaign.status != 'REMOVED'",
      ],
      orderBy: ["metrics.cost_micros DESC"],
    }),
  };
}

export function buildCampaignShareQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "campaign_share",
    family: "campaign_share",
    resource: "campaign",
    mergeKey: "campaign.id",
    metrics: [
      "search_impression_share",
      "search_budget_lost_impression_share",
      "search_rank_lost_impression_share",
      "search_top_impression_share",
      "search_absolute_top_impression_share",
      "top_impression_percentage",
      "absolute_top_impression_percentage",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "campaign.id",
        "metrics.search_impression_share",
        "metrics.search_budget_lost_impression_share",
        "metrics.search_rank_lost_impression_share",
        "metrics.search_top_impression_share",
        "metrics.search_absolute_top_impression_share",
        "metrics.top_impression_percentage",
        "metrics.absolute_top_impression_percentage",
      ],
      from: "campaign",
      where: [
        buildDateWhereClause(startDate, endDate),
        "campaign.status != 'REMOVED'",
      ],
    }),
  };
}

export function buildCampaignBudgetQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "campaign_budget",
    family: "campaign_budget",
    resource: "campaign",
    mergeKey: "campaign.id",
    metrics: ["campaign_budget.amount_micros"],
    query: buildGoogleAdsQuery({
      select: [
        "campaign.id",
        "campaign_budget.amount_micros",
        "campaign_budget.delivery_method",
        "campaign_budget.explicitly_shared",
      ],
      from: "campaign",
      where: [
        buildDateWhereClause(startDate, endDate),
        "campaign.status != 'REMOVED'",
      ],
    }),
  };
}

export function buildSearchTermCoreQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "search_term_core",
    family: "search_term_core",
    resource: "search_term_view",
    mergeKey: "search_term_view.search_term",
    metrics: [
      "impressions",
      "clicks",
      "ctr",
      "cost_micros",
      "conversions",
      "conversions_value",
      "average_cpc",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "search_term_view.search_term",
        "search_term_view.status",
        "campaign.id",
        "campaign.name",
        "ad_group.id",
        "ad_group.name",
        "metrics.impressions",
        "metrics.clicks",
        "metrics.ctr",
        "metrics.cost_micros",
        "metrics.conversions",
        "metrics.conversions_value",
        "metrics.average_cpc",
        "metrics.conversion_rate",
        "metrics.cost_per_conversion",
        "metrics.value_per_conversion",
      ],
      from: "search_term_view",
      where: [buildDateWhereClause(startDate, endDate)],
      orderBy: ["metrics.cost_micros DESC"],
      limit: 1000,
    }),
  };
}

export function buildKeywordLookupQuery(): GoogleAdsNamedQuery {
  return {
    name: "keyword_lookup",
    family: "keyword_lookup",
    resource: "keyword_view",
    mergeKey: "ad_group_criterion.criterion_id",
    metrics: [],
    query: buildGoogleAdsQuery({
      select: [
        "ad_group_criterion.criterion_id",
        "ad_group_criterion.keyword.text",
      ],
      from: "keyword_view",
      where: ["ad_group_criterion.status != 'REMOVED'"],
      limit: 5000,
    }),
  };
}

export function buildKeywordCoreQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "keyword_core",
    family: "keyword_core",
    resource: "keyword_view",
    mergeKey: "ad_group_criterion.criterion_id",
    metrics: [
      "impressions",
      "clicks",
      "ctr",
      "cost_micros",
      "conversions",
      "conversions_value",
      "average_cpc",
      "average_cost",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
      "search_impression_share",
      "search_top_impression_share",
      "search_absolute_top_impression_share",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "ad_group_criterion.criterion_id",
        "ad_group_criterion.keyword.text",
        "ad_group_criterion.keyword.match_type",
        "ad_group_criterion.status",
        "campaign.id",
        "campaign.name",
        "ad_group.id",
        "ad_group.name",
        "metrics.impressions",
        "metrics.clicks",
        "metrics.ctr",
        "metrics.cost_micros",
        "metrics.conversions",
        "metrics.conversions_value",
        "metrics.average_cpc",
        "metrics.average_cost",
        "metrics.conversion_rate",
        "metrics.cost_per_conversion",
        "metrics.value_per_conversion",
        "metrics.search_impression_share",
        "metrics.search_top_impression_share",
        "metrics.search_absolute_top_impression_share",
      ],
      from: "keyword_view",
      where: [
        buildDateWhereClause(startDate, endDate),
        "ad_group_criterion.status != 'REMOVED'",
      ],
      orderBy: ["metrics.cost_micros DESC"],
      limit: 1500,
    }),
  };
}

export function buildKeywordQualityQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "keyword_quality",
    family: "keyword_quality",
    resource: "keyword_view",
    mergeKey: "ad_group_criterion.criterion_id",
    metrics: [
      "quality_score",
      "expected_ctr",
      "ad_relevance",
      "landing_page_experience",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "ad_group_criterion.criterion_id",
        "ad_group_criterion.quality_info.quality_score",
        "ad_group_criterion.quality_info.expected_click_through_rate",
        "ad_group_criterion.quality_info.ad_relevance",
        "ad_group_criterion.quality_info.landing_page_experience",
      ],
      from: "keyword_view",
      where: [
        buildDateWhereClause(startDate, endDate),
        "ad_group_criterion.status != 'REMOVED'",
      ],
      limit: 1500,
    }),
  };
}

export function buildAdCoreQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "ad_core",
    family: "ad_core",
    resource: "ad_group_ad",
    mergeKey: "ad_group_ad.ad.id",
    metrics: [
      "impressions",
      "clicks",
      "ctr",
      "cost_micros",
      "conversions",
      "conversions_value",
      "average_cpc",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
      "interactions",
      "interaction_rate",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "ad_group_ad.ad.id",
        "ad_group_ad.ad.name",
        "ad_group_ad.ad.type",
        "ad_group_ad.status",
        "campaign.id",
        "campaign.name",
        "ad_group.id",
        "ad_group.name",
        "metrics.impressions",
        "metrics.clicks",
        "metrics.ctr",
        "metrics.cost_micros",
        "metrics.conversions",
        "metrics.conversions_value",
        "metrics.average_cpc",
        "metrics.conversion_rate",
        "metrics.cost_per_conversion",
        "metrics.value_per_conversion",
        "metrics.interactions",
        "metrics.interaction_rate",
      ],
      from: "ad_group_ad",
      where: [
        buildDateWhereClause(startDate, endDate),
        "ad_group_ad.status != 'REMOVED'",
      ],
      orderBy: ["metrics.cost_micros DESC"],
      limit: 1000,
    }),
  };
}

export function buildAdDetailQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "ad_detail",
    family: "ad_detail",
    resource: "ad_group_ad",
    mergeKey: "ad_group_ad.ad.id",
    metrics: ["ad_strength"],
    query: buildGoogleAdsQuery({
      select: [
        "ad_group_ad.ad.id",
        "ad_group_ad.ad.responsive_search_ad.headlines",
        "ad_group_ad.ad.responsive_search_ad.descriptions",
        "ad_group_ad.ad.expanded_text_ad.headline_part1",
        "ad_group_ad.ad.expanded_text_ad.headline_part2",
        "ad_group_ad.ad.expanded_text_ad.description",
        "ad_group_ad.ad_strength",
      ],
      from: "ad_group_ad",
      where: [
        buildDateWhereClause(startDate, endDate),
        "ad_group_ad.status != 'REMOVED'",
      ],
      limit: 1000,
    }),
  };
}

export function buildAssetGroupCoreQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "asset_group_core",
    family: "asset_group_core",
    resource: "asset_group",
    mergeKey: "asset_group.id",
    metrics: [
      "impressions",
      "clicks",
      "ctr",
      "cost_micros",
      "conversions",
      "conversions_value",
      "average_cpc",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
      "interactions",
      "interaction_rate",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "asset_group.id",
        "asset_group.name",
        "asset_group.status",
        "campaign.id",
        "campaign.name",
        "metrics.impressions",
        "metrics.clicks",
        "metrics.ctr",
        "metrics.cost_micros",
        "metrics.conversions",
        "metrics.conversions_value",
        "metrics.average_cpc",
        "metrics.conversion_rate",
        "metrics.cost_per_conversion",
        "metrics.value_per_conversion",
        "metrics.interactions",
        "metrics.interaction_rate",
      ],
      from: "asset_group",
      where: [
        buildDateWhereClause(startDate, endDate),
        "asset_group.status != 'REMOVED'",
      ],
      orderBy: ["metrics.cost_micros DESC"],
      limit: 500,
    }),
  };
}

export function buildAssetGroupAssetDetailQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "asset_group_asset_detail",
    family: "asset_group_asset_detail",
    resource: "asset_group_asset",
    mergeKey: "asset_group.id",
    metrics: [],
    query: buildGoogleAdsQuery({
      select: [
        "asset_group.id",
        "asset_group_asset.field_type",
        "asset.id",
        "asset.type",
      ],
      from: "asset_group_asset",
      where: [
        buildDateWhereClause(startDate, endDate),
        "asset_group_asset.status != 'REMOVED'",
      ],
      limit: 2000,
    }),
  };
}

export function buildAudienceCoreQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "audience_core",
    family: "audience_core",
    resource: "ad_group_audience_view",
    mergeKey: "ad_group_criterion.criterion_id",
    metrics: [
      "impressions",
      "clicks",
      "ctr",
      "cost_micros",
      "conversions",
      "conversions_value",
      "average_cpc",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "ad_group_criterion.criterion_id",
        "ad_group_criterion.type",
        "campaign.id",
        "campaign.name",
        "ad_group.id",
        "ad_group.name",
        "metrics.impressions",
        "metrics.clicks",
        "metrics.ctr",
        "metrics.cost_micros",
        "metrics.conversions",
        "metrics.conversions_value",
        "metrics.average_cpc",
        "metrics.conversion_rate",
        "metrics.cost_per_conversion",
        "metrics.value_per_conversion",
      ],
      from: "ad_group_audience_view",
      where: [buildDateWhereClause(startDate, endDate)],
      orderBy: ["metrics.cost_micros DESC"],
      limit: 1000,
    }),
  };
}

export function buildGeoCoreQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "geo_core",
    family: "geo_core",
    resource: "geographic_view",
    mergeKey: "geographic_view.country_criterion_id",
    metrics: [
      "impressions",
      "clicks",
      "ctr",
      "cost_micros",
      "conversions",
      "conversions_value",
      "average_cpc",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "geographic_view.country_criterion_id",
        "geographic_view.location_type",
        "metrics.impressions",
        "metrics.clicks",
        "metrics.ctr",
        "metrics.cost_micros",
        "metrics.conversions",
        "metrics.conversions_value",
        "metrics.average_cpc",
        "metrics.conversion_rate",
        "metrics.cost_per_conversion",
        "metrics.value_per_conversion",
      ],
      from: "geographic_view",
      where: [buildDateWhereClause(startDate, endDate)],
      orderBy: ["metrics.cost_micros DESC"],
      limit: 1000,
    }),
  };
}

export function buildDeviceCoreQuery(
  startDate: string,
  endDate: string
): GoogleAdsNamedQuery {
  return {
    name: "device_core",
    family: "device_core",
    resource: "campaign",
    mergeKey: "segments.device",
    metrics: [
      "impressions",
      "clicks",
      "ctr",
      "cost_micros",
      "conversions",
      "conversions_value",
      "average_cpc",
      "conversion_rate",
      "cost_per_conversion",
      "value_per_conversion",
      "interactions",
      "interaction_rate",
      "video_views",
      "video_view_rate",
    ],
    query: buildGoogleAdsQuery({
      select: [
        "segments.device",
        "metrics.impressions",
        "metrics.clicks",
        "metrics.ctr",
        "metrics.cost_micros",
        "metrics.conversions",
        "metrics.conversions_value",
        "metrics.average_cpc",
        "metrics.conversion_rate",
        "metrics.cost_per_conversion",
        "metrics.value_per_conversion",
        "metrics.interactions",
        "metrics.interaction_rate",
        "metrics.video_views",
        "metrics.video_view_rate",
      ],
      from: "campaign",
      where: [
        buildDateWhereClause(startDate, endDate),
        "campaign.status != 'REMOVED'",
      ],
    }),
  };
}
