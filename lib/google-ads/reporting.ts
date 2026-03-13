import {
  executeGaqlForAccounts,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  getGoogleAdsFailureMessage,
  type GoogleAdsAccountQueryFailure,
} from "@/lib/google-ads-gaql";
import { GOOGLE_ADS_METRICS_MATRIX, type GoogleAdsTabId } from "@/lib/google-ads/metrics-matrix";
import {
  buildAdCoreQuery,
  buildAdDetailQuery,
  buildAssetGroupAssetDetailQuery,
  buildAssetGroupCoreQuery,
  buildAudienceCoreQuery,
  buildCampaignBudgetQuery,
  buildCampaignCoreBasicQuery,
  buildCampaignShareQuery,
  buildCustomerSummaryQuery,
  buildDeviceCoreQuery,
  buildGeoCoreQuery,
  buildKeywordCoreQuery,
  buildKeywordLookupQuery,
  buildKeywordQualityQuery,
  buildSearchTermCoreQuery,
  type GoogleAdsNamedQuery,
} from "@/lib/google-ads/query-builders";
import {
  asInteger,
  asNumber,
  asRatio,
  asString,
  createEmptyMeta,
  getCompatObject,
  getCompatValue,
  normalizeCampaignRow,
  toMetricSet,
  type GoogleAdsReportMeta,
} from "@/lib/google-ads/normalizers";
import {
  classifySearchIntent,
  classifySearchTerms,
  generateBudgetRecommendations,
  generateOpportunities,
  type GadsCampaignRow,
  type GadsOpportunity,
  generateOverviewInsights,
  getCampaignBadges,
} from "@/lib/google-ads-intelligence";
import { normalizeChannelType, normalizeStatus } from "@/lib/google-ads-gaql";

type DateRange = "7" | "14" | "30" | "custom";

type RawRow = Record<string, unknown>;

interface QueryExecution {
  rows: RawRow[];
  failures: GoogleAdsAccountQueryFailure[];
  query: GoogleAdsNamedQuery;
}

interface ReportContext {
  businessId: string;
  customerIds: string[];
  dateRange: DateRange;
  debug: boolean;
}

interface ReportResult<Row extends object> {
  rows: Row[];
  summary?: Record<string, unknown>;
  insights?: unknown;
  meta: GoogleAdsReportMeta;
}

interface OverviewReportResult {
  kpis: Record<string, unknown>;
  topCampaigns: Array<GadsCampaignRow & { badges: string[] }>;
  insights: unknown[];
  meta: GoogleAdsReportMeta;
  summary?: Record<string, unknown>;
}

type AssetTypeSummary = Record<string, number>;

const COUNTRY_MAP: Record<number, string> = {
  2840: "United States",
  2826: "United Kingdom",
  2276: "Germany",
  2250: "France",
  2380: "Italy",
  2724: "Spain",
  2036: "Australia",
  2124: "Canada",
  2392: "Japan",
  2076: "Brazil",
  2484: "Mexico",
  2528: "Netherlands",
  2756: "Switzerland",
  2752: "Sweden",
  2578: "Norway",
  2208: "Denmark",
  2246: "Finland",
  2040: "Austria",
  2056: "Belgium",
  2620: "Portugal",
  2616: "Poland",
  2203: "Czech Republic",
  2348: "Hungary",
  2642: "Romania",
  2792: "Turkey",
  2356: "India",
  2156: "China",
  2410: "South Korea",
  2702: "Singapore",
  2764: "Thailand",
};

function mergeFailures(meta: GoogleAdsReportMeta, execution: QueryExecution) {
  meta.query_names.push(execution.query.name);
  meta.row_counts[execution.query.name] = execution.rows.length;
  if (execution.failures.length === 0) return;

  meta.partial = true;
  meta.unavailable_metrics.push(...execution.query.metrics);
  meta.failed_queries.push(
    ...execution.failures.map((failure) => ({
      query: execution.query.name,
      family: execution.query.family,
      customerId: failure.customerId,
      message: failure.message,
      status: failure.status,
      apiStatus: failure.apiStatus,
      apiErrorCode: failure.apiErrorCode,
    }))
  );
  meta.warnings.push(
    `${execution.query.name}: ${getGoogleAdsFailureMessage(execution.failures)}`
  );
}

async function runNamedQuery(
  context: ReportContext,
  query: GoogleAdsNamedQuery
): Promise<QueryExecution> {
  const { results, failures } = await executeGaqlForAccounts({
    businessId: context.businessId,
    customerIds: context.customerIds,
    query: query.query,
  });

  return {
    rows: results.flatMap((result) => (result.results ?? []) as RawRow[]),
    failures,
    query,
  };
}

async function resolveContext(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug: boolean;
}): Promise<
  | { ok: true; context: ReportContext; startDate: string; endDate: string }
  | { ok: false; payload: { rows: []; meta: GoogleAdsReportMeta; summary?: Record<string, unknown> } }
> {
  const { businessId, accountId, dateRange, debug } = params;
  const assignedAccounts = await getAssignedGoogleAccounts(businessId);
  const accountsToQuery =
    accountId && accountId !== "all" ? [accountId] : assignedAccounts;
  const { startDate, endDate } = getDateRangeForQuery(dateRange);

  if (accountsToQuery.length === 0) {
    return {
      ok: false,
      payload: {
        rows: [],
        summary: { totalAccounts: 0 },
        meta: {
          ...createEmptyMeta(debug),
          warnings: ["No Google Ads account is assigned to this business."],
          debug: debug
            ? {
                accounts_requested: accountId ?? "all",
                assigned_accounts: assignedAccounts,
                date_range: { startDate, endDate },
              }
            : undefined,
        },
      },
    };
  }

  return {
    ok: true,
    context: {
      businessId,
      customerIds: accountsToQuery,
      dateRange,
      debug,
    },
    startDate,
    endDate,
  };
}

function addDebugMeta(
  meta: GoogleAdsReportMeta,
  tab: GoogleAdsTabId,
  context: ReportContext,
  extra: Record<string, unknown> = {}
) {
  if (!context.debug) return;
  meta.debug = {
    tab,
    matrix: GOOGLE_ADS_METRICS_MATRIX[tab],
    customerIds: context.customerIds,
    ...extra,
  };
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildCampaignMap(
  coreRows: RawRow[],
  shareRows: RawRow[],
  budgetRows: RawRow[]
) {
  const map = new Map<string, Record<string, unknown>>();

  for (const row of coreRows) {
    const normalized = normalizeCampaignRow(row);
    if (normalized.id === "unknown") continue;
    map.set(normalized.id, normalized);
  }

  for (const row of shareRows) {
    const campaign = getCompatObject(row, "campaign");
    const metrics = getCompatObject(row, "metrics");
    const id = asString(getCompatValue(campaign, "id"));
    if (!id || !map.has(id)) continue;
    Object.assign(map.get(id)!, {
      impressionShare: asRatio(getCompatValue(metrics, "search_impression_share")),
      lostIsBudget: asRatio(getCompatValue(metrics, "search_budget_lost_impression_share")),
      lostIsRank: asRatio(getCompatValue(metrics, "search_rank_lost_impression_share")),
      searchTopImpressionShare: asRatio(getCompatValue(metrics, "search_top_impression_share")),
      searchAbsoluteTopImpressionShare: asRatio(
        getCompatValue(metrics, "search_absolute_top_impression_share")
      ),
      topImpressionPercentage: asRatio(getCompatValue(metrics, "top_impression_percentage")),
      absoluteTopImpressionPercentage: asRatio(
        getCompatValue(metrics, "absolute_top_impression_percentage")
      ),
    });
  }

  for (const row of budgetRows) {
    const campaign = getCompatObject(row, "campaign");
    const campaignBudget = getCompatObject(row, "campaign_budget");
    const id = asString(getCompatValue(campaign, "id"));
    if (!id || !map.has(id)) continue;
    Object.assign(map.get(id)!, {
      dailyBudget:
        asNumber(getCompatValue(campaignBudget, "amount_micros")) !== null
          ? Number(
              (
                (asNumber(getCompatValue(campaignBudget, "amount_micros")) ?? 0) / 1_000_000
              ).toFixed(2)
            )
          : null,
      budgetDeliveryMethod: asString(getCompatValue(campaignBudget, "delivery_method")),
      budgetExplicitlyShared:
        typeof getCompatValue(campaignBudget, "explicitly_shared") === "boolean"
          ? (getCompatValue(campaignBudget, "explicitly_shared") as boolean)
          : null,
    });
  }

  return Array.from(map.values()) as Array<Record<string, unknown>>;
}

function aggregateOverviewKpis(customerRows: RawRow[]) {
  const totals = {
    spend: 0,
    conversions: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    interactions: 0,
    videoViews: 0,
    engagements: 0,
  };

  const rates = {
    ctr: [] as Array<number | null>,
    cpc: [] as Array<number | null>,
    avgCost: [] as Array<number | null>,
    interactionRate: [] as Array<number | null>,
    conversionRate: [] as Array<number | null>,
    costPerConversion: [] as Array<number | null>,
    valuePerConversion: [] as Array<number | null>,
    videoViewRate: [] as Array<number | null>,
    averageCpv: [] as Array<number | null>,
    engagementRate: [] as Array<number | null>,
  };

  for (const row of customerRows) {
    const metrics = getCompatObject(row, "metrics");
    const set = toMetricSet(metrics);
    totals.spend += set.spend;
    totals.conversions += set.conversions;
    totals.revenue += set.conversionValue;
    totals.impressions += set.impressions;
    totals.clicks += set.clicks;
    totals.interactions += set.interactions;
    totals.videoViews += set.videoViews;
    totals.engagements += set.engagements;
    rates.ctr.push(set.ctr);
    rates.cpc.push(set.averageCpc);
    rates.avgCost.push(set.averageCost);
    rates.interactionRate.push(set.interactionRate);
    rates.conversionRate.push(set.conversionRate);
    rates.costPerConversion.push(set.costPerConversion);
    rates.valuePerConversion.push(set.valuePerConversion);
    rates.videoViewRate.push(set.videoViewRate);
    rates.averageCpv.push(set.averageCpv);
    rates.engagementRate.push(set.engagementRate);
  }

  const spend = Number(totals.spend.toFixed(2));
  const revenue = Number(totals.revenue.toFixed(2));
  const conversions = Number(totals.conversions.toFixed(2));
  const clicks = totals.clicks;
  const impressions = totals.impressions;

  return {
    spend,
    conversions,
    revenue,
    roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : 0,
    cpa: conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
    impressions,
    clicks,
    interactions: totals.interactions,
    interactionRate:
      totals.interactions > 0 && impressions > 0
        ? Number(((totals.interactions / impressions) * 100).toFixed(2))
        : null,
    convRate: clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(2)) : 0,
    valuePerConversion:
      conversions > 0 ? Number((revenue / conversions).toFixed(2)) : null,
    costPerConversion:
      conversions > 0 ? Number((spend / conversions).toFixed(2)) : null,
    videoViews: totals.videoViews,
    videoViewRate:
      totals.videoViews > 0 && totals.impressions > 0
        ? Number(((totals.videoViews / totals.impressions) * 100).toFixed(2))
        : null,
    engagements: totals.engagements,
    engagementRate:
      totals.engagements > 0 && totals.impressions > 0
        ? Number(((totals.engagements / totals.impressions) * 100).toFixed(2))
        : null,
  };
}

export async function getGoogleAdsOverviewReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<OverviewReportResult> {
  const resolved = await resolveContext({
    businessId: params.businessId,
    accountId: params.accountId,
    dateRange: params.dateRange,
    debug: Boolean(params.debug),
  });
  if (!resolved.ok) {
    return {
      kpis: {},
      topCampaigns: [],
      insights: [],
      meta: resolved.payload.meta,
      summary: resolved.payload.summary,
    };
  }

  const { context, startDate, endDate } = resolved;
  const meta = createEmptyMeta(context.debug);

  const [customerSummary, campaignCore, campaignShare] = await Promise.all([
    runNamedQuery(context, buildCustomerSummaryQuery(startDate, endDate)),
    runNamedQuery(context, buildCampaignCoreBasicQuery(startDate, endDate)),
    runNamedQuery(context, buildCampaignShareQuery(startDate, endDate)),
  ]);

  mergeFailures(meta, customerSummary);
  mergeFailures(meta, campaignCore);
  mergeFailures(meta, campaignShare);

  const campaigns = buildCampaignMap(campaignCore.rows, campaignShare.rows, [])
    .map((campaign) => ({
      ...(campaign as GadsCampaignRow & Record<string, unknown>),
      badges: [] as string[],
    }))
    .sort((a, b) => Number((b.spend as number) ?? 0) - Number((a.spend as number) ?? 0));

  const kpis = aggregateOverviewKpis(customerSummary.rows);
  const accountAvgRoas = Number(kpis.roas ?? 0);
  const accountAvgCpa = Number(kpis.cpa ?? 0);

  const enrichedCampaigns = campaigns.map((campaign) => ({
    ...campaign,
    badges: getCampaignBadges(
      {
        id: String(campaign.id),
        name: String(campaign.name),
        status: String(campaign.status ?? "paused"),
        channel: String(campaign.channel ?? "Unknown"),
        spend: Number(campaign.spend ?? 0),
        conversions: Number(campaign.conversions ?? 0),
        revenue: Number(campaign.revenue ?? 0),
        roas: Number(campaign.roas ?? 0),
        cpa: Number(campaign.cpa ?? 0),
        ctr: Number(campaign.ctr ?? 0),
        impressions: Number(campaign.impressions ?? 0),
        clicks: Number(campaign.clicks ?? 0),
        impressionShare:
          typeof campaign.impressionShare === "number"
            ? campaign.impressionShare
            : undefined,
        lostIsBudget:
          typeof campaign.lostIsBudget === "number" ? campaign.lostIsBudget : undefined,
        lostIsRank:
          typeof campaign.lostIsRank === "number" ? campaign.lostIsRank : undefined,
      },
      accountAvgRoas,
      accountAvgCpa
    ),
  }));

  addDebugMeta(meta, "overview", context, {
    date_range: { startDate, endDate },
  });

  return {
    kpis,
    topCampaigns: enrichedCampaigns.slice(0, 5),
    insights: generateOverviewInsights({
      campaigns: enrichedCampaigns,
      totalSpend: Number(kpis.spend ?? 0),
      totalConversions: Number(kpis.conversions ?? 0),
      totalRevenue: Number(kpis.revenue ?? 0),
      roas: Number(kpis.roas ?? 0),
      cpa: Number(kpis.cpa ?? 0),
    }),
    summary: {
      topCampaignCount: enrichedCampaigns.length,
      resource: GOOGLE_ADS_METRICS_MATRIX.overview.primaryResource,
    },
    meta,
  };
}

export async function getGoogleAdsCampaignsReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const resolved = await resolveContext({
    businessId: params.businessId,
    accountId: params.accountId,
    dateRange: params.dateRange,
    debug: Boolean(params.debug),
  });
  if (!resolved.ok) return resolved.payload;

  const { context, startDate, endDate } = resolved;
  const meta = createEmptyMeta(context.debug);
  const [campaignCoreBasic, campaignShare, campaignBudget] = await Promise.all([
    runNamedQuery(context, buildCampaignCoreBasicQuery(startDate, endDate)),
    runNamedQuery(context, buildCampaignShareQuery(startDate, endDate)),
    runNamedQuery(context, buildCampaignBudgetQuery(startDate, endDate)),
  ]);

  mergeFailures(meta, campaignCoreBasic);
  mergeFailures(meta, campaignShare);
  mergeFailures(meta, campaignBudget);

  const campaigns = buildCampaignMap(
    campaignCoreBasic.rows,
    campaignShare.rows,
    campaignBudget.rows
  );

  const totalSpend = campaigns.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const totalRevenue = campaigns.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const totalConversions = campaigns.reduce(
    (sum, row) => sum + Number(row.conversions ?? 0),
    0
  );
  const accountAvgRoas = totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(2)) : 0;
  const accountAvgCpa =
    totalConversions > 0 ? Number((totalSpend / totalConversions).toFixed(2)) : 0;

  const rows = campaigns.map((campaign) => ({
    ...campaign,
    badges: getCampaignBadges(
      {
        id: String(campaign.id),
        name: String(campaign.name),
        status: String(campaign.status ?? "paused"),
        channel: String(campaign.channel ?? "Unknown"),
        spend: Number(campaign.spend ?? 0),
        conversions: Number(campaign.conversions ?? 0),
        revenue: Number(campaign.revenue ?? 0),
        roas: Number(campaign.roas ?? 0),
        cpa: Number(campaign.cpa ?? 0),
        ctr: Number(campaign.ctr ?? 0),
        impressions: Number(campaign.impressions ?? 0),
        clicks: Number(campaign.clicks ?? 0),
        impressionShare:
          typeof campaign.impressionShare === "number"
            ? campaign.impressionShare
            : undefined,
        lostIsBudget:
          typeof campaign.lostIsBudget === "number" ? campaign.lostIsBudget : undefined,
        lostIsRank:
          typeof campaign.lostIsRank === "number" ? campaign.lostIsRank : undefined,
        budget:
          typeof campaign.dailyBudget === "number" ? campaign.dailyBudget : undefined,
      },
      accountAvgRoas,
      accountAvgCpa
    ),
  }));
  addDebugMeta(meta, "campaigns", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows,
    summary: {
      accountAvgRoas,
      accountAvgCpa,
      rowCount: rows.length,
    },
    meta,
  };
}

export async function getGoogleAdsSearchTermsReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  filter?: string;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const resolved = await resolveContext({
    businessId: params.businessId,
    accountId: params.accountId,
    dateRange: params.dateRange,
    debug: Boolean(params.debug),
  });
  if (!resolved.ok) return resolved.payload;

  const { context, startDate, endDate } = resolved;
  const meta = createEmptyMeta(context.debug);
  const [core, lookup] = await Promise.all([
    runNamedQuery(context, buildSearchTermCoreQuery(startDate, endDate)),
    runNamedQuery(context, buildKeywordLookupQuery()),
  ]);

  mergeFailures(meta, core);
  mergeFailures(meta, lookup);

  const keywordSet = new Set(
    lookup.rows
      .map((row) => {
        const criterion = getCompatObject(row, "ad_group_criterion");
        const keyword = getCompatObject(criterion, "keyword");
        return (asString(getCompatValue(keyword, "text")) ?? "").toLowerCase();
      })
      .filter(Boolean)
  );

  const filter = (params.filter ?? "").trim().toLowerCase();
  const rows = core.rows
    .map((row) => {
      const metrics = getCompatObject(row, "metrics");
      const campaign = getCompatObject(row, "campaign");
      const adGroup = getCompatObject(row, "ad_group");
      const searchTermView = getCompatObject(row, "search_term_view");
      const searchTerm = asString(getCompatValue(searchTermView, "search_term")) ?? "";
      const data = toMetricSet(metrics);
      return {
        key: `${asString(getCompatValue(campaign, "id")) ?? "campaign"}:${asString(getCompatValue(adGroup, "id")) ?? "adgroup"}:${searchTerm}`,
        searchTerm,
        status: asString(getCompatValue(searchTermView, "status")) ?? "UNKNOWN",
        campaignId: asString(getCompatValue(campaign, "id")),
        campaign: asString(getCompatValue(campaign, "name")) ?? "",
        adGroupId: asString(getCompatValue(adGroup, "id")),
        adGroup: asString(getCompatValue(adGroup, "name")) ?? "",
        impressions: data.impressions,
        clicks: data.clicks,
        spend: data.spend,
        conversions: data.conversions,
        revenue: data.conversionValue,
        roas: data.roas,
        cpa: data.cpa,
        ctr: data.ctr ?? 0,
        cpc: data.averageCpc,
        conversionRate: data.conversionRate,
        valuePerConversion: data.valuePerConversion,
        costPerConversion: data.costPerConversion,
        intent: classifySearchIntent(searchTerm),
        isKeyword: keywordSet.has(searchTerm.toLowerCase()),
      };
    })
    .filter((row) => row.searchTerm.length > 0)
    .filter((row) => !filter || row.searchTerm.toLowerCase().includes(filter));

  const classified = classifySearchTerms(rows as never);
  addDebugMeta(meta, "search-terms", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows,
    summary: {
      wastefulCount: classified.wasteful.length,
      negativeKeywordCandidates: classified.negativeKeywordCandidates.length,
      highPerformingCount: classified.highPerforming.length,
      keywordOpportunities: classified.keywordOpportunities.length,
      wastefulSpend: Number(
        classified.wasteful.reduce((sum, term) => sum + term.spend, 0).toFixed(2)
      ),
    },
    meta,
  };
}

function normalizeMatchType(raw: string | null): string {
  if (!raw) return "Unknown";
  const lower = raw.toLowerCase();
  if (lower.includes("exact")) return "Exact";
  if (lower.includes("phrase")) return "Phrase";
  if (lower.includes("broad")) return "Broad";
  return raw;
}

export async function getGoogleAdsKeywordsReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const resolved = await resolveContext({
    businessId: params.businessId,
    accountId: params.accountId,
    dateRange: params.dateRange,
    debug: Boolean(params.debug),
  });
  if (!resolved.ok) return resolved.payload;

  const { context, startDate, endDate } = resolved;
  const meta = createEmptyMeta(context.debug);
  const [core, quality] = await Promise.all([
    runNamedQuery(context, buildKeywordCoreQuery(startDate, endDate)),
    runNamedQuery(context, buildKeywordQualityQuery(startDate, endDate)),
  ]);

  mergeFailures(meta, core);
  mergeFailures(meta, quality);

  const qualityMap = new Map<string, Record<string, unknown>>();
  for (const row of quality.rows) {
    const criterion = getCompatObject(row, "ad_group_criterion");
    const id = asString(getCompatValue(criterion, "criterion_id"));
    if (!id) continue;
    qualityMap.set(id, criterion);
  }

  const rows = core.rows
    .map((row) => {
      const criterion = getCompatObject(row, "ad_group_criterion");
      const campaign = getCompatObject(row, "campaign");
      const adGroup = getCompatObject(row, "ad_group");
      const metrics = getCompatObject(row, "metrics");
      const keyword = getCompatObject(criterion, "keyword");
      const qualityInfo =
        getCompatObject(
          qualityMap.get(asString(getCompatValue(criterion, "criterion_id")) ?? "") ?? criterion,
          "quality_info"
        );
      const data = toMetricSet(metrics);
      return {
        criterionId: asString(getCompatValue(criterion, "criterion_id")),
        keyword: asString(getCompatValue(keyword, "text")) ?? "",
        matchType: normalizeMatchType(
          asString(getCompatValue(keyword, "match_type"))
        ),
        status: normalizeStatus(asString(getCompatValue(criterion, "status")) ?? undefined),
        qualityScore: asNumber(getCompatValue(qualityInfo, "quality_score")),
        expectedCtr: asString(getCompatValue(qualityInfo, "expected_click_through_rate")),
        adRelevance: asString(getCompatValue(qualityInfo, "ad_relevance")),
        landingPageExperience: asString(getCompatValue(qualityInfo, "landing_page_experience")),
        adGroupId: asString(getCompatValue(adGroup, "id")),
        adGroup: asString(getCompatValue(adGroup, "name")) ?? "",
        campaignId: asString(getCompatValue(campaign, "id")),
        campaign: asString(getCompatValue(campaign, "name")) ?? "",
        impressions: data.impressions,
        clicks: data.clicks,
        spend: data.spend,
        conversions: data.conversions,
        revenue: data.conversionValue,
        roas: data.roas,
        cpa: data.cpa,
        ctr: data.ctr ?? 0,
        cpc: data.averageCpc,
        conversionRate: data.conversionRate,
        valuePerConversion: data.valuePerConversion,
        costPerConversion: data.costPerConversion,
        impressionShare: asRatio(getCompatValue(metrics, "search_impression_share")),
        searchTopImpressionShare: asRatio(getCompatValue(metrics, "search_top_impression_share")),
        searchAbsoluteTopImpressionShare: asRatio(
          getCompatValue(metrics, "search_absolute_top_impression_share")
        ),
      };
    })
    .filter((row) => row.keyword.length > 0);

  addDebugMeta(meta, "keywords", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows,
    summary: {
      highCtrLowConvCount: rows.filter(
        (keyword) => keyword.ctr > 5 && keyword.conversions === 0 && keyword.clicks >= 20
      ).length,
      highConvLowBudgetCount: rows.filter(
        (keyword) =>
          keyword.conversions >= 3 &&
          typeof keyword.impressionShare === "number" &&
          keyword.impressionShare < 0.4
      ).length,
      deserveOwnAdGroupCount: rows.filter(
        (keyword) => keyword.conversions >= 5 && keyword.spend > 100
      ).length,
    },
    meta,
  };
}

function buildAdHeadline(ad: Record<string, unknown>): string {
  const rsa = getCompatObject(ad, "responsive_search_ad");
  const headlinesValue = getCompatValue(rsa, "headlines");
  const headlines = Array.isArray(headlinesValue) ? headlinesValue : [];
  const expanded = getCompatObject(ad, "expanded_text_ad");
  if (headlines.length > 0) {
    return headlines
      .slice(0, 3)
        .map((item) => asString(getCompatValue(item as Record<string, unknown>, "text")) ?? "")
      .filter(Boolean)
      .join(" | ");
  }
  return (
    asString(getCompatValue(ad, "name")) ??
    asString(getCompatValue(expanded, "headline_part1")) ??
    asString(getCompatValue(expanded, "headline_part2")) ??
    "Ad"
  );
}

function buildAdDescription(ad: Record<string, unknown>): string {
  const rsa = getCompatObject(ad, "responsive_search_ad");
  const descriptionsValue = getCompatValue(rsa, "descriptions");
  const descriptions = Array.isArray(descriptionsValue) ? descriptionsValue : [];
  const expanded = getCompatObject(ad, "expanded_text_ad");
  if (descriptions.length > 0) {
    return asString(getCompatValue(descriptions[0] as Record<string, unknown>, "text")) ?? "";
  }
  return asString(getCompatValue(expanded, "description")) ?? "";
}

function normalizeAdStrength(value: string | null): string | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper.includes("EXCELLENT") || upper.includes("BEST")) return "Best";
  if (upper.includes("GOOD")) return "Good";
  if (upper.includes("AVERAGE") || upper.includes("LEARNING") || upper.includes("PENDING")) {
    return "Learning";
  }
  if (upper.includes("POOR") || upper.includes("LOW")) return "Low";
  return value;
}

export async function getGoogleAdsAdsReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const resolved = await resolveContext({
    businessId: params.businessId,
    accountId: params.accountId,
    dateRange: params.dateRange,
    debug: Boolean(params.debug),
  });
  if (!resolved.ok) return resolved.payload;

  const { context, startDate, endDate } = resolved;
  const meta = createEmptyMeta(context.debug);
  const [core, detail] = await Promise.all([
    runNamedQuery(context, buildAdCoreQuery(startDate, endDate)),
    runNamedQuery(context, buildAdDetailQuery(startDate, endDate)),
  ]);
  mergeFailures(meta, core);
  mergeFailures(meta, detail);

  const detailMap = new Map<string, RawRow>();
  for (const row of detail.rows) {
    const adGroupAd = getCompatObject(row, "ad_group_ad");
    const ad = getCompatObject(adGroupAd, "ad");
    const id = asString(getCompatValue(ad, "id"));
    if (id) detailMap.set(id, row);
  }

  const rows = core.rows
    .map((row) => {
      const adGroupAd = getCompatObject(row, "ad_group_ad");
      const ad = getCompatObject(adGroupAd, "ad");
      const campaign = getCompatObject(row, "campaign");
      const adGroup = getCompatObject(row, "ad_group");
      const metrics = getCompatObject(row, "metrics");
      const detailRow = detailMap.get(asString(getCompatValue(ad, "id")) ?? "");
      const detailRoot = detailRow ? getCompatObject(detailRow, "ad_group_ad") : adGroupAd;
      const detailAd = getCompatObject(detailRoot, "ad");
      const data = toMetricSet(metrics);
      return {
        id: asString(getCompatValue(ad, "id")) ?? "unknown",
        headline: buildAdHeadline(detailAd),
        description: buildAdDescription(detailAd),
        type: asString(getCompatValue(ad, "type")) ?? "unknown",
        adStrength: normalizeAdStrength(asString(getCompatValue(detailRoot, "ad_strength"))),
        status: normalizeStatus(asString(getCompatValue(adGroupAd, "status")) ?? undefined),
        campaignId: asString(getCompatValue(campaign, "id")),
        campaign: asString(getCompatValue(campaign, "name")) ?? "",
        adGroupId: asString(getCompatValue(adGroup, "id")),
        adGroup: asString(getCompatValue(adGroup, "name")) ?? "",
        impressions: data.impressions,
        clicks: data.clicks,
        spend: data.spend,
        conversions: data.conversions,
        revenue: data.conversionValue,
        roas: data.roas,
        cpa: data.cpa,
        ctr: data.ctr ?? 0,
        cpc: data.averageCpc,
        conversionRate: data.conversionRate,
        valuePerConversion: data.valuePerConversion,
        costPerConversion: data.costPerConversion,
      };
    })
    .filter((row) => row.id !== "unknown");

  const sorted = [...rows].sort((a, b) => b.conversions - a.conversions);
  const topQuartile = sorted.slice(0, Math.max(1, Math.ceil(rows.length * 0.25)));
  const bottomQuartile = sorted.slice(Math.floor(rows.length * 0.75));

  addDebugMeta(meta, "ads", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows,
    summary: {
      topPerformerCtr:
        topQuartile.length > 0
          ? Number(
              (
                topQuartile.reduce((sum, row) => sum + row.ctr, 0) / topQuartile.length
              ).toFixed(2)
            )
          : 0,
      bottomPerformerCtr:
        bottomQuartile.length > 0
          ? Number(
              (
                bottomQuartile.reduce((sum, row) => sum + row.ctr, 0) /
                bottomQuartile.length
              ).toFixed(2)
            )
          : 0,
      bestAd: topQuartile[0] ?? null,
      worstAd: bottomQuartile[bottomQuartile.length - 1] ?? null,
    },
    meta,
  };
}

function normalizeAudienceType(raw: string | null): string {
  if (!raw) return "Unknown";
  const lower = raw.toLowerCase();
  if (lower.includes("user_list") || lower.includes("remarketing")) return "Remarketing";
  if (lower.includes("user_interest") || lower.includes("affinity")) return "Affinity";
  if (lower.includes("in_market")) return "In-Market";
  if (lower.includes("life_event")) return "Life Events";
  if (lower.includes("custom")) return "Custom";
  if (lower.includes("similar")) return "Similar Audiences";
  return raw.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

export async function getGoogleAdsAudiencesReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const resolved = await resolveContext({
    businessId: params.businessId,
    accountId: params.accountId,
    dateRange: params.dateRange,
    debug: Boolean(params.debug),
  });
  if (!resolved.ok) return resolved.payload;

  const { context, startDate, endDate } = resolved;
  const meta = createEmptyMeta(context.debug);
  const core = await runNamedQuery(context, buildAudienceCoreQuery(startDate, endDate));
  mergeFailures(meta, core);

  const rows = core.rows.map((row) => {
    const criterion = getCompatObject(row, "ad_group_criterion");
    const campaign = getCompatObject(row, "campaign");
    const adGroup = getCompatObject(row, "ad_group");
    const metrics = getCompatObject(row, "metrics");
    const data = toMetricSet(metrics);
    return {
      criterionId: asString(getCompatValue(criterion, "criterion_id")) ?? "",
      name: asString(getCompatValue(criterion, "criterion_id")) ?? "Unknown audience",
      type: normalizeAudienceType(asString(getCompatValue(criterion, "type"))),
      campaignId: asString(getCompatValue(campaign, "id")),
      campaign: asString(getCompatValue(campaign, "name")) ?? "",
      adGroupId: asString(getCompatValue(adGroup, "id")),
      adGroup: asString(getCompatValue(adGroup, "name")) ?? "",
      impressions: data.impressions,
      clicks: data.clicks,
      spend: data.spend,
      conversions: data.conversions,
      revenue: data.conversionValue,
      roas: data.roas,
      cpa: data.cpa,
      ctr: data.ctr ?? 0,
      cpc: data.averageCpc,
      conversionRate: data.conversionRate,
      valuePerConversion: data.valuePerConversion,
      costPerConversion: data.costPerConversion,
    };
  });

  const byType = new Map<string, { conversions: number; spend: number; revenue: number }>();
  for (const row of rows) {
    const current = byType.get(row.type) ?? { conversions: 0, spend: 0, revenue: 0 };
    byType.set(row.type, {
      conversions: current.conversions + row.conversions,
      spend: current.spend + row.spend,
      revenue: current.revenue + row.revenue,
    });
  }

  addDebugMeta(meta, "audiences", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows: rows.sort((a, b) => b.spend - a.spend),
    summary: {
      byType: Array.from(byType.entries()).map(([type, stats]) => ({
        type,
        conversions: stats.conversions,
        spend: Number(stats.spend.toFixed(2)),
        roas: stats.spend > 0 ? Number((stats.revenue / stats.spend).toFixed(2)) : 0,
      })),
    },
    insights: [],
    meta,
  };
}

export async function getGoogleAdsGeoReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const resolved = await resolveContext({
    businessId: params.businessId,
    accountId: params.accountId,
    dateRange: params.dateRange,
    debug: Boolean(params.debug),
  });
  if (!resolved.ok) return resolved.payload;

  const { context, startDate, endDate } = resolved;
  const meta = createEmptyMeta(context.debug);
  const core = await runNamedQuery(context, buildGeoCoreQuery(startDate, endDate));
  mergeFailures(meta, core);

  const geoMap = new Map<
    number,
    {
      impressions: number;
      clicks: number;
      spend: number;
      conversions: number;
      revenue: number;
    }
  >();

  for (const row of core.rows) {
    const geo = getCompatObject(row, "geographic_view");
    const metrics = getCompatObject(row, "metrics");
    const id = asInteger(getCompatValue(geo, "country_criterion_id"));
    if (!id) continue;
    const current = geoMap.get(id) ?? {
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      revenue: 0,
    };
    const data = toMetricSet(metrics);
    geoMap.set(id, {
      impressions: current.impressions + data.impressions,
      clicks: current.clicks + data.clicks,
      spend: Number((current.spend + data.spend).toFixed(2)),
      conversions: current.conversions + data.conversions,
      revenue: Number((current.revenue + data.conversionValue).toFixed(2)),
    });
  }

  const totalSpend = Array.from(geoMap.values()).reduce((sum, row) => sum + row.spend, 0);
  const totalConversions = Array.from(geoMap.values()).reduce(
    (sum, row) => sum + row.conversions,
    0
  );
  const avgCpa =
    totalConversions > 0 ? Number((totalSpend / totalConversions).toFixed(2)) : null;

  const rows = Array.from(geoMap.entries())
    .map(([criterionId, metrics]) => ({
      criterionId,
      country: COUNTRY_MAP[criterionId] ?? `Country #${criterionId}`,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      spend: metrics.spend,
      conversions: metrics.conversions,
      revenue: metrics.revenue,
      roas: metrics.spend > 0 ? Number((metrics.revenue / metrics.spend).toFixed(2)) : 0,
      cpa:
        metrics.conversions > 0 ? Number((metrics.spend / metrics.conversions).toFixed(2)) : 0,
      ctr:
        metrics.impressions > 0
          ? Number(((metrics.clicks / metrics.impressions) * 100).toFixed(2))
          : 0,
      conversionRate:
        metrics.clicks > 0
          ? Number(((metrics.conversions / metrics.clicks) * 100).toFixed(2))
          : 0,
      vsAvgCpa:
        avgCpa && metrics.conversions > 0
          ? Number((((metrics.spend / metrics.conversions) / avgCpa - 1) * 100).toFixed(0))
          : null,
    }))
    .sort((a, b) => b.spend - a.spend);

  addDebugMeta(meta, "geo", context, {
    date_range: { startDate, endDate },
  });

  return { rows, summary: { avgCpa }, insights: [], meta };
}

export async function getGoogleAdsDevicesReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const resolved = await resolveContext({
    businessId: params.businessId,
    accountId: params.accountId,
    dateRange: params.dateRange,
    debug: Boolean(params.debug),
  });
  if (!resolved.ok) return resolved.payload;

  const { context, startDate, endDate } = resolved;
  const meta = createEmptyMeta(context.debug);
  const core = await runNamedQuery(context, buildDeviceCoreQuery(startDate, endDate));
  mergeFailures(meta, core);

  const deviceMap = new Map<
    string,
    {
      impressions: number;
      clicks: number;
      spend: number;
      conversions: number;
      revenue: number;
      videoViews: number;
    }
  >();

  for (const row of core.rows) {
    const segments = (row.segments as Record<string, unknown> | undefined) ?? {};
    const metrics = (row.metrics as Record<string, unknown> | undefined) ?? {};
    const device = asString(segments.device) ?? "UNKNOWN";
    const current = deviceMap.get(device) ?? {
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      revenue: 0,
      videoViews: 0,
    };
    const data = toMetricSet(metrics);
    deviceMap.set(device, {
      impressions: current.impressions + data.impressions,
      clicks: current.clicks + data.clicks,
      spend: Number((current.spend + data.spend).toFixed(2)),
      conversions: current.conversions + data.conversions,
      revenue: Number((current.revenue + data.conversionValue).toFixed(2)),
      videoViews: current.videoViews + data.videoViews,
    });
  }

  const rows = Array.from(deviceMap.entries()).map(([device, metrics]) => ({
    device,
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    spend: metrics.spend,
    conversions: metrics.conversions,
    revenue: metrics.revenue,
    roas: metrics.spend > 0 ? Number((metrics.revenue / metrics.spend).toFixed(2)) : 0,
    cpa:
      metrics.conversions > 0 ? Number((metrics.spend / metrics.conversions).toFixed(2)) : 0,
    ctr:
      metrics.impressions > 0
        ? Number(((metrics.clicks / metrics.impressions) * 100).toFixed(2))
        : 0,
    conversionRate:
      metrics.clicks > 0
        ? Number(((metrics.conversions / metrics.clicks) * 100).toFixed(2))
        : 0,
    videoViews: metrics.videoViews,
  }));

  addDebugMeta(meta, "devices", context, {
    date_range: { startDate, endDate },
  });

  return { rows: rows.sort((a, b) => b.spend - a.spend), insights: [], meta };
}

export async function getGoogleAdsBudgetReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const report = await getGoogleAdsCampaignsReport(params);
  const rows = report.rows.map((row) => ({
    id: row.id,
    name: row.name,
    dailyBudget: row.dailyBudget ?? null,
    spend: row.spend,
    conversions: row.conversions,
    revenue: row.revenue,
    roas: row.roas,
    cpa: row.cpa,
    impressions: row.impressions,
    clicks: row.clicks,
    impressionShare: row.impressionShare ?? null,
    lostIsBudget: row.lostIsBudget ?? null,
    lostIsRank: row.lostIsRank ?? null,
    status: row.status,
    channel: row.channel,
    ctr: row.ctr,
  }));

  const totalSpend = rows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const accountAvgRoas = totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(2)) : 0;

  return {
    rows,
    summary: {
      totalSpend: Number(totalSpend.toFixed(2)),
      accountAvgRoas,
    },
    insights: generateBudgetRecommendations(
      rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        status: String(row.status ?? "paused"),
        channel: String(row.channel ?? "Unknown"),
        spend: Number(row.spend ?? 0),
        conversions: Number(row.conversions ?? 0),
        revenue: Number(row.revenue ?? 0),
        roas: Number(row.roas ?? 0),
        cpa: Number(row.cpa ?? 0),
        ctr: Number(row.ctr ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        impressionShare:
          typeof row.impressionShare === "number" ? row.impressionShare : undefined,
        lostIsBudget:
          typeof row.lostIsBudget === "number" ? row.lostIsBudget : undefined,
        lostIsRank:
          typeof row.lostIsRank === "number" ? row.lostIsRank : undefined,
        budget:
          typeof row.dailyBudget === "number" ? row.dailyBudget : undefined,
      })),
      accountAvgRoas
    ),
    meta: report.meta,
  };
}

export async function getGoogleAdsCreativesReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const resolved = await resolveContext({
    businessId: params.businessId,
    accountId: params.accountId,
    dateRange: params.dateRange,
    debug: Boolean(params.debug),
  });
  if (!resolved.ok) return resolved.payload;

  const { context, startDate, endDate } = resolved;
  const meta = createEmptyMeta(context.debug);
  const [core, detail] = await Promise.all([
    runNamedQuery(context, buildAssetGroupCoreQuery(startDate, endDate)),
    runNamedQuery(context, buildAssetGroupAssetDetailQuery(startDate, endDate)),
  ]);
  mergeFailures(meta, core);
  mergeFailures(meta, detail);

  const assetBreakdown = new Map<string, AssetTypeSummary>();
  for (const row of detail.rows) {
    const assetGroup = getCompatObject(row, "asset_group");
    const asset = getCompatObject(row, "asset");
    const id = asString(getCompatValue(assetGroup, "id"));
    if (!id) continue;
    const current = assetBreakdown.get(id) ?? {};
    const fieldType = asString(
      getCompatValue(getCompatObject(row, "asset_group_asset"), "field_type")
    );
    const assetType = asString(getCompatValue(asset, "type"));
    const label = dedupeStrings([fieldType ?? "", assetType ?? "asset"]).join(":");
    current[label] = (current[label] ?? 0) + 1;
    assetBreakdown.set(id, current);
  }

  const rows = core.rows.map((row) => {
    const assetGroup = getCompatObject(row, "asset_group");
    const campaign = getCompatObject(row, "campaign");
    const metrics = getCompatObject(row, "metrics");
    const data = toMetricSet(metrics);
    const id = asString(getCompatValue(assetGroup, "id")) ?? "unknown";
    const assetMix = assetBreakdown.get(id) ?? {};
    return {
      id,
      name: asString(getCompatValue(assetGroup, "name")) ?? "Unnamed Asset Group",
      type: "Performance Max",
      status: normalizeStatus(asString(getCompatValue(assetGroup, "status")) ?? undefined),
      campaignId: asString(getCompatValue(campaign, "id")),
      campaign: asString(getCompatValue(campaign, "name")) ?? "",
      impressions: data.impressions,
      clicks: data.clicks,
      spend: data.spend,
      conversions: data.conversions,
      revenue: data.conversionValue,
      roas: data.roas,
      cpa: data.cpa,
      ctr: data.ctr ?? 0,
      cpc: data.averageCpc,
      conversionRate: data.conversionRate,
      assetCount: Object.values(assetMix).reduce((sum, count) => sum + count, 0),
      assetMix,
    };
  });

  if (detail.failures.length > 0) {
    meta.warnings.push(
      "Asset metadata could not be loaded for all customers. Performance metrics are still shown."
    );
  }
  meta.unavailable_metrics = dedupeStrings(
    meta.unavailable_metrics.concat([
      ...(GOOGLE_ADS_METRICS_MATRIX.creatives.unavailableByDesign ?? []),
    ])
  );

  addDebugMeta(meta, "creatives", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows,
    summary: {
      supportedView: "asset_group performance + asset mix",
    },
    insights: [],
    meta,
  };
}

export async function getGoogleAdsOpportunitiesReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<GadsOpportunity>> {
  const [campaigns, keywords, searchTerms, ads, devices, audiences] = await Promise.all([
    getGoogleAdsCampaignsReport(params),
    getGoogleAdsKeywordsReport(params),
    getGoogleAdsSearchTermsReport(params),
    getGoogleAdsAdsReport(params),
    getGoogleAdsDevicesReport(params),
    getGoogleAdsAudiencesReport(params),
  ]);

  const meta = createEmptyMeta(Boolean(params.debug));
  const reportMetas = [
    campaigns.meta,
    keywords.meta,
    searchTerms.meta,
    ads.meta,
    devices.meta,
    audiences.meta,
  ];
  for (const childMeta of reportMetas) {
    meta.partial = meta.partial || childMeta.partial;
    meta.warnings.push(...childMeta.warnings);
    meta.failed_queries.push(...childMeta.failed_queries);
    meta.unavailable_metrics.push(...childMeta.unavailable_metrics);
    meta.query_names.push(...childMeta.query_names);
    Object.assign(meta.row_counts, childMeta.row_counts);
  }
  meta.warnings = dedupeStrings(meta.warnings);
  meta.unavailable_metrics = dedupeStrings(meta.unavailable_metrics);
  meta.query_names = dedupeStrings(meta.query_names);

  const totalSpend = campaigns.rows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const totalRevenue = campaigns.rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const totalConversions = campaigns.rows.reduce(
    (sum, row) => sum + Number(row.conversions ?? 0),
    0
  );
  const accountAvgRoas = totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(2)) : 0;
  const accountAvgCpa =
    totalConversions > 0 ? Number((totalSpend / totalConversions).toFixed(2)) : 0;

  const rows: GadsOpportunity[] = generateOpportunities({
    campaigns: campaigns.rows as never,
    keywords: keywords.rows as never,
    searchTerms: searchTerms.rows as never,
    ads: ads.rows as never,
    accountAvgRoas,
    accountAvgCpa,
  });

  if (devices.rows.length > 0) {
    const mobile = devices.rows.find((row) => String(row.device).toLowerCase().includes("mobile"));
    const desktop = devices.rows.find((row) => String(row.device).toLowerCase().includes("desktop"));
    if (mobile && desktop && Number(desktop.roas ?? 0) > Number(mobile.roas ?? 0) * 1.5) {
      rows.push({
        id: "device_desktop_outperformance",
        type: "bid_adjustment",
        title: "Desktop outperforms mobile on ROAS",
        whyItMatters: "Device mix shows stronger efficiency on desktop than mobile.",
        evidence: `Desktop ROAS ${desktop.roas}x vs mobile ${mobile.roas}x`,
        expectedImpact: "Improve blended efficiency with device bid adjustments",
        effort: "low",
        priority: "medium",
      });
    }
  }

  if (audiences.rows.length > 0) {
    const weakAudience = audiences.rows.find(
      (row) => Number(row.spend ?? 0) > 50 && Number(row.conversions ?? 0) === 0
    );
    if (weakAudience) {
      rows.push({
        id: "audience_underperformance",
        type: "audience_expansion",
        title: `Review ${weakAudience.type} audience targeting`,
        whyItMatters: "Audience segment is consuming spend without producing conversions.",
        evidence: `${weakAudience.type} spent $${weakAudience.spend} with 0 conversions`,
        expectedImpact: "Reduce wasted spend and improve audience mix",
        effort: "medium",
        priority: "medium",
      });
    }
  }

  if (params.debug) {
    meta.debug = {
      child_reports: ["campaigns", "keywords", "search-terms", "ads", "devices", "audiences"],
    };
  }

  return {
    rows,
    summary: {
      accountAvgRoas,
      accountAvgCpa,
    },
    meta,
  };
}
