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
  buildAssetGroupSignalQuery,
  buildAssetGroupAssetDetailQuery,
  buildAssetGroupCoreQuery,
  buildAssetPerformanceCoreQuery,
  buildAssetTextDetailQuery,
  buildAudienceCoreQuery,
  buildCampaignSearchTermCoreQuery,
  buildCampaignBudgetQuery,
  buildCampaignCoreBasicQuery,
  buildCampaignShareQuery,
  buildCustomerSummaryQuery,
  buildDeviceCoreQuery,
  buildGeoCoreQuery,
  buildKeywordCoreQuery,
  buildKeywordLookupQuery,
  buildKeywordQualityQuery,
  buildProductPerformanceQuery,
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
  kpiDeltas?: Record<string, number | null>;
  topCampaigns: Array<GadsCampaignRow & { badges: string[] }>;
  insights: unknown[];
  meta: GoogleAdsReportMeta;
  summary?: Record<string, unknown>;
}

type AssetTypeSummary = Record<string, number>;

interface TrendMetrics {
  spendChange: number | null;
  revenueChange: number | null;
  conversionsChange: number | null;
  roasChange: number | null;
  ctrChange: number | null;
}

interface SearchThemeSignal {
  text: string;
  approvalStatus: string | null;
}

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

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "best",
  "buy",
  "for",
  "from",
  "in",
  "near",
  "of",
  "on",
  "review",
  "reviews",
  "sale",
  "shop",
  "the",
  "to",
  "vs",
  "with",
]);

function parseIsoDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatIsoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function getPreviousDateWindow(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const daySpan =
    Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (daySpan - 1));

  return {
    startDate: formatIsoDate(previousStart),
    endDate: formatIsoDate(previousEnd),
  };
}

function pctDelta(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function roundOrNull(value: number | null, digits = 2) {
  if (value === null) return null;
  return Number(value.toFixed(digits));
}

function buildTrendMetrics(
  current: {
    spend: number;
    revenue: number;
    conversions: number;
    roas: number;
    ctr: number;
  },
  previous?: Partial<typeof current>
): TrendMetrics {
  return {
    spendChange: pctDelta(current.spend, Number(previous?.spend ?? 0)),
    revenueChange: pctDelta(current.revenue, Number(previous?.revenue ?? 0)),
    conversionsChange: pctDelta(current.conversions, Number(previous?.conversions ?? 0)),
    roasChange: pctDelta(current.roas, Number(previous?.roas ?? 0)),
    ctrChange: pctDelta(current.ctr, Number(previous?.ctr ?? 0)),
  };
}

function normalizeAssetPerformanceLabel(value: string | null): "top" | "average" | "underperforming" {
  if (!value) return "average";
  const lower = value.toLowerCase();
  if (lower.includes("best")) return "top";
  if (lower.includes("low")) return "underperforming";
  return "average";
}

function getNumericShare(value: unknown) {
  const parsed = asNumber(value);
  return parsed === null ? 0 : parsed;
}

function slugifyQueryCluster(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 3)
    .join(" ");
}

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

function mergeChildMeta(target: GoogleAdsReportMeta, child: GoogleAdsReportMeta) {
  target.partial = target.partial || child.partial;
  target.warnings.push(...child.warnings);
  target.failed_queries.push(...child.failed_queries);
  target.unavailable_metrics.push(...child.unavailable_metrics);
  target.query_names.push(...child.query_names);
  Object.assign(target.row_counts, child.row_counts);
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
  const previousWindow = getPreviousDateWindow(startDate, endDate);

  const [
    customerSummary,
    campaignCore,
    campaignShare,
    previousCustomerSummary,
    previousCampaignCore,
    previousCampaignShare,
  ] = await Promise.all([
    runNamedQuery(context, buildCustomerSummaryQuery(startDate, endDate)),
    runNamedQuery(context, buildCampaignCoreBasicQuery(startDate, endDate)),
    runNamedQuery(context, buildCampaignShareQuery(startDate, endDate)),
    runNamedQuery(
      context,
      buildCustomerSummaryQuery(previousWindow.startDate, previousWindow.endDate)
    ),
    runNamedQuery(
      context,
      buildCampaignCoreBasicQuery(previousWindow.startDate, previousWindow.endDate)
    ),
    runNamedQuery(
      context,
      buildCampaignShareQuery(previousWindow.startDate, previousWindow.endDate)
    ),
  ]);

  mergeFailures(meta, customerSummary);
  mergeFailures(meta, campaignCore);
  mergeFailures(meta, campaignShare);
  mergeFailures(meta, previousCustomerSummary);
  mergeFailures(meta, previousCampaignCore);
  mergeFailures(meta, previousCampaignShare);

  const campaigns = buildCampaignMap(campaignCore.rows, campaignShare.rows, [])
    .map((campaign) => ({
      ...(campaign as GadsCampaignRow & Record<string, unknown>),
      badges: [] as string[],
    }))
    .sort((a, b) => Number((b.spend as number) ?? 0) - Number((a.spend as number) ?? 0));

  const kpis = aggregateOverviewKpis(customerSummary.rows);
  const previousKpis = aggregateOverviewKpis(previousCustomerSummary.rows);
  const accountAvgRoas = Number(kpis.roas ?? 0);
  const accountAvgCpa = Number(kpis.cpa ?? 0);
  const previousCampaignMap = new Map(
    buildCampaignMap(previousCampaignCore.rows, previousCampaignShare.rows, []).map((campaign) => [
      String(campaign.id),
      campaign,
    ])
  );

  const enrichedCampaigns = campaigns.map((campaign) => ({
    ...campaign,
    ...buildTrendMetrics(
      {
        spend: Number(campaign.spend ?? 0),
        revenue: Number(campaign.revenue ?? 0),
        conversions: Number(campaign.conversions ?? 0),
        roas: Number(campaign.roas ?? 0),
        ctr: Number(campaign.ctr ?? 0),
      },
      {
        spend: Number(previousCampaignMap.get(String(campaign.id))?.spend ?? 0),
        revenue: Number(previousCampaignMap.get(String(campaign.id))?.revenue ?? 0),
        conversions: Number(previousCampaignMap.get(String(campaign.id))?.conversions ?? 0),
        roas: Number(previousCampaignMap.get(String(campaign.id))?.roas ?? 0),
        ctr: Number(previousCampaignMap.get(String(campaign.id))?.ctr ?? 0),
      }
    ),
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
    previous_date_range: previousWindow,
  });

  return {
    kpis,
    kpiDeltas: {
      spend: pctDelta(Number(kpis.spend ?? 0), Number(previousKpis.spend ?? 0)),
      revenue: pctDelta(Number(kpis.revenue ?? 0), Number(previousKpis.revenue ?? 0)),
      roas: pctDelta(Number(kpis.roas ?? 0), Number(previousKpis.roas ?? 0)),
      conversions: pctDelta(
        Number(kpis.conversions ?? 0),
        Number(previousKpis.conversions ?? 0)
      ),
      cpa: pctDelta(Number(kpis.cpa ?? 0), Number(previousKpis.cpa ?? 0)),
    },
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
  const previousWindow = getPreviousDateWindow(startDate, endDate);
  const [
    campaignCoreBasic,
    campaignShare,
    campaignBudget,
    previousCampaignCoreBasic,
    previousCampaignShare,
  ] = await Promise.all([
    runNamedQuery(context, buildCampaignCoreBasicQuery(startDate, endDate)),
    runNamedQuery(context, buildCampaignShareQuery(startDate, endDate)),
    runNamedQuery(context, buildCampaignBudgetQuery(startDate, endDate)),
    runNamedQuery(
      context,
      buildCampaignCoreBasicQuery(previousWindow.startDate, previousWindow.endDate)
    ),
    runNamedQuery(
      context,
      buildCampaignShareQuery(previousWindow.startDate, previousWindow.endDate)
    ),
  ]);

  mergeFailures(meta, campaignCoreBasic);
  mergeFailures(meta, campaignShare);
  mergeFailures(meta, campaignBudget);
  mergeFailures(meta, previousCampaignCoreBasic);
  mergeFailures(meta, previousCampaignShare);

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
  const previousCampaignMap = new Map(
    buildCampaignMap(previousCampaignCoreBasic.rows, previousCampaignShare.rows, []).map(
      (campaign) => [String(campaign.id), campaign]
    )
  );

  const rows = campaigns.map((campaign) => {
    const spend = Number(campaign.spend ?? 0);
    const revenue = Number(campaign.revenue ?? 0);
    const conversions = Number(campaign.conversions ?? 0);
    const roas = Number(campaign.roas ?? 0);
    const ctr = Number(campaign.ctr ?? 0);
    const previous = previousCampaignMap.get(String(campaign.id));
    const spendShare = totalSpend > 0 ? Number(((spend / totalSpend) * 100).toFixed(1)) : 0;
    const revenueShare =
      totalRevenue > 0 ? Number(((revenue / totalRevenue) * 100).toFixed(1)) : 0;

    let actionState: "scale" | "optimize" | "test" | "reduce" = "optimize";
    if (roas >= accountAvgRoas * 1.15 && getNumericShare(campaign.lostIsBudget) > 0.1) {
      actionState = "scale";
    } else if (spend > Math.max(100, totalSpend * 0.08) && roas < accountAvgRoas * 0.7) {
      actionState = "reduce";
    } else if (conversions === 0 && spend > 0) {
      actionState = "test";
    }

    const performanceLabel =
      roas >= accountAvgRoas * 1.25
        ? "leader"
        : roas >= accountAvgRoas * 0.9
        ? "stable"
        : roas > 0
        ? "watch"
        : "at-risk";

    return {
      ...campaign,
      spendShare,
      revenueShare,
      performanceLabel,
      actionState,
      ...buildTrendMetrics(
        {
          spend,
          revenue,
          conversions,
          roas,
          ctr,
        },
        {
          spend: Number(previous?.spend ?? 0),
          revenue: Number(previous?.revenue ?? 0),
          conversions: Number(previous?.conversions ?? 0),
          roas: Number(previous?.roas ?? 0),
          ctr: Number(previous?.ctr ?? 0),
        }
      ),
      badges: getCampaignBadges(
        {
          id: String(campaign.id),
          name: String(campaign.name),
          status: String(campaign.status ?? "paused"),
          channel: String(campaign.channel ?? "Unknown"),
          spend,
          conversions,
          revenue,
          roas,
          cpa: Number(campaign.cpa ?? 0),
          ctr,
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
    };
  });
  addDebugMeta(meta, "campaigns", context, {
    date_range: { startDate, endDate },
    previous_date_range: previousWindow,
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
  const qualityAvailable = quality.failures.length === 0;

  const qualityMap = new Map<string, Record<string, unknown>>();
  for (const row of qualityAvailable ? quality.rows : []) {
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
      const qualityInfo = qualityAvailable
        ? getCompatObject(
            qualityMap.get(asString(getCompatValue(criterion, "criterion_id")) ?? "") ?? {},
            "quality_info"
          )
        : {};
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

function classifySearchAction(row: {
  isKeyword: boolean;
  conversions: number;
  spend: number;
  clicks: number;
  roas: number;
  conversionRate: number | null;
}) {
  if (!row.isKeyword && row.conversions >= 2) return "Add as exact keyword";
  if (row.clicks >= 20 && row.conversions === 0 && row.spend > 10) {
    return "Add as negative keyword";
  }
  if (row.roas >= 3 && row.conversions >= 2) return "Promote in headlines";
  if ((row.conversionRate ?? 0) < 1 && row.clicks >= 20) return "Review landing page";
  return "Monitor";
}

function classifyClusterState(cluster: {
  spend: number;
  conversions: number;
  roas: number;
}) {
  if (cluster.spend >= 100 && cluster.conversions === 0) return "Waste";
  if (cluster.conversions >= 5 && cluster.roas >= 3) return "Top driver";
  if (cluster.conversions >= 2 || cluster.roas >= 1.5) return "Promising";
  return "Neutral";
}

function buildSearchClusters(
  rows: Array<{
    searchTerm: string;
    campaign: string;
    intent: string;
    spend: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: number;
    isKeyword: boolean;
  }>
) {
  const clusters = new Map<
    string,
    {
      key: string;
      label: string;
      intent: string;
      campaigns: Set<string>;
      examples: string[];
      spend: number;
      clicks: number;
      conversions: number;
      revenue: number;
      keywordBackedCount: number;
    }
  >();

  for (const row of rows) {
    const key = slugifyQueryCluster(row.searchTerm) || row.searchTerm.toLowerCase();
    const current = clusters.get(key) ?? {
      key,
      label: key || row.searchTerm,
      intent: row.intent,
      campaigns: new Set<string>(),
      examples: [],
      spend: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      keywordBackedCount: 0,
    };
    current.campaigns.add(row.campaign);
    if (current.examples.length < 3 && !current.examples.includes(row.searchTerm)) {
      current.examples.push(row.searchTerm);
    }
    current.spend += row.spend;
    current.clicks += row.clicks;
    current.conversions += row.conversions;
    current.revenue += row.revenue;
    current.keywordBackedCount += row.isKeyword ? 1 : 0;
    clusters.set(key, current);
  }

  return Array.from(clusters.values())
    .map((cluster) => {
      const roas = cluster.spend > 0 ? Number((cluster.revenue / cluster.spend).toFixed(2)) : 0;
      return {
        cluster: cluster.label,
        intent: cluster.intent,
        campaigns: Array.from(cluster.campaigns),
        spend: Number(cluster.spend.toFixed(2)),
        clicks: cluster.clicks,
        conversions: Number(cluster.conversions.toFixed(2)),
        revenue: Number(cluster.revenue.toFixed(2)),
        roas,
        coverage: cluster.keywordBackedCount > 0 ? "covered" : "open",
        examples: cluster.examples,
        state: classifyClusterState({
          spend: cluster.spend,
          conversions: cluster.conversions,
          roas,
        }),
        recommendation:
          cluster.conversions >= 3 && cluster.keywordBackedCount === 0
            ? "Build exact-match coverage"
            : cluster.spend >= 100 && cluster.conversions === 0
            ? "Add negatives or tighten intent"
            : roas >= 3
            ? "Reflect this language in assets"
            : "Keep watching",
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

export async function getGoogleAdsSearchIntelligenceReport(params: {
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
  const [core, lookup, campaignSearchTerms] = await Promise.all([
    runNamedQuery(context, buildSearchTermCoreQuery(startDate, endDate)),
    runNamedQuery(context, buildKeywordLookupQuery()),
    runNamedQuery(context, buildCampaignSearchTermCoreQuery(startDate, endDate)),
  ]);

  mergeFailures(meta, core);
  mergeFailures(meta, lookup);
  mergeFailures(meta, campaignSearchTerms);

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
  const baseRows = core.rows.map((row) => {
    const metrics = getCompatObject(row, "metrics");
    const campaign = getCompatObject(row, "campaign");
    const adGroup = getCompatObject(row, "ad_group");
    const searchTermView = getCompatObject(row, "search_term_view");
    const searchTerm = asString(getCompatValue(searchTermView, "search_term")) ?? "";
    const data = toMetricSet(metrics);
    return {
      key: `${asString(getCompatValue(campaign, "id")) ?? "campaign"}:${searchTerm}`,
      searchTerm,
      campaignId: asString(getCompatValue(campaign, "id")),
      campaign: asString(getCompatValue(campaign, "name")) ?? "",
      adGroupId: asString(getCompatValue(adGroup, "id")),
      adGroup: asString(getCompatValue(adGroup, "name")) ?? "",
      matchSource: "SEARCH",
      source: "search_term_view",
      impressions: data.impressions,
      clicks: data.clicks,
      spend: data.spend,
      conversions: data.conversions,
      revenue: data.conversionValue,
      roas: data.roas,
      cpa: data.cpa,
      ctr: data.ctr ?? 0,
      conversionRate: data.conversionRate,
      intent: classifySearchIntent(searchTerm),
      isKeyword: keywordSet.has(searchTerm.toLowerCase()),
    };
  });

  const campaignScopeRows = campaignSearchTerms.rows.map((row) => {
    const metrics = getCompatObject(row, "metrics");
    const campaign = getCompatObject(row, "campaign");
    const view = getCompatObject(row, "campaign_search_term_view");
    const segments = getCompatObject(row, "segments");
    const searchTerm = asString(getCompatValue(view, "search_term")) ?? "";
    const data = toMetricSet(metrics);
    return {
      key: `${asString(getCompatValue(campaign, "id")) ?? "campaign"}:${searchTerm}:campaign_scope`,
      searchTerm,
      campaignId: asString(getCompatValue(campaign, "id")),
      campaign: asString(getCompatValue(campaign, "name")) ?? "",
      adGroupId: null,
      adGroup: "Campaign scope",
      matchSource: asString(getCompatValue(segments, "search_term_match_source")) ?? "UNKNOWN",
      source: "campaign_search_term_view",
      impressions: data.impressions,
      clicks: data.clicks,
      spend: data.spend,
      conversions: data.conversions,
      revenue: data.conversionValue,
      roas: data.roas,
      cpa: data.cpa,
      ctr: data.ctr ?? 0,
      conversionRate: data.conversionRate,
      intent: classifySearchIntent(searchTerm),
      isKeyword: keywordSet.has(searchTerm.toLowerCase()),
    };
  });

  const rows = [...baseRows, ...campaignScopeRows]
    .filter((row) => row.searchTerm.length > 0)
    .filter((row) => !filter || row.searchTerm.toLowerCase().includes(filter))
    .map((row) => ({
      ...row,
      clusterKey: slugifyQueryCluster(row.searchTerm),
      recommendation: classifySearchAction(row),
      classification:
        row.spend > 20 && row.conversions === 0
          ? "waste"
          : !row.isKeyword && row.conversions >= 2
          ? "keyword_opportunity"
          : row.roas >= 3
          ? "top_driver"
          : "monitor",
    }))
    .sort((a, b) => b.spend - a.spend);

  const clusters = buildSearchClusters(rows);
  const keywordCandidates = rows.filter(
    (row) => row.recommendation === "Add as exact keyword"
  );
  const negativeCandidates = rows.filter(
    (row) => row.recommendation === "Add as negative keyword"
  );
  const promotionCandidates = rows.filter(
    (row) => row.recommendation === "Promote in headlines"
  );

  if (campaignSearchTerms.rows.length > 0) {
    meta.warnings.push(
      "Campaign-scope search terms are included where available to broaden Search Intelligence beyond standard search_term_view coverage."
    );
  }

  addDebugMeta(meta, "search-intelligence", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows,
    summary: {
      wastefulSpend: Number(
        negativeCandidates.reduce((sum, row) => sum + row.spend, 0).toFixed(2)
      ),
      keywordOpportunityCount: keywordCandidates.length,
      negativeKeywordCount: negativeCandidates.length,
      promotionSuggestionCount: promotionCandidates.length,
      clusterCount: clusters.length,
    },
    insights: {
      keywordCandidates: keywordCandidates.slice(0, 8),
      negativeCandidates: negativeCandidates.slice(0, 8),
      promotionCandidates: promotionCandidates.slice(0, 8),
      clusters: clusters.slice(0, 12),
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

function normalizeAssetKind(fieldType: string | null, assetType: string | null) {
  const source = `${fieldType ?? ""} ${assetType ?? ""}`.toLowerCase();
  if (source.includes("headline")) return "Headline";
  if (source.includes("description")) return "Description";
  if (source.includes("image")) return "Image";
  if (source.includes("video")) return "Video";
  if (source.includes("logo")) return "Logo";
  return assetType?.replace(/_/g, " ") ?? "Asset";
}

function buildAssetPreview(params: {
  fieldType: string | null;
  assetType: string | null;
  name: string | null;
  text: string | null;
  videoTitle: string | null;
}) {
  return (
    params.text ??
    params.videoTitle ??
    params.name ??
    `${normalizeAssetKind(params.fieldType, params.assetType)} asset`
  );
}

export async function getGoogleAdsAssetsReport(params: {
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
    runNamedQuery(context, buildAssetPerformanceCoreQuery(startDate, endDate)),
    runNamedQuery(context, buildAssetTextDetailQuery()),
  ]);

  mergeFailures(meta, core);
  mergeFailures(meta, detail);

  const detailMap = new Map<
    string,
    {
      name: string | null;
      text: string | null;
      videoTitle: string | null;
      videoId: string | null;
      type: string | null;
    }
  >();

  for (const row of detail.rows) {
    const asset = getCompatObject(row, "asset");
    const textAsset = getCompatObject(asset, "text_asset");
    const youtubeAsset = getCompatObject(asset, "youtube_video_asset");
    const id = asString(getCompatValue(asset, "id"));
    if (!id) continue;
    detailMap.set(id, {
      name: asString(getCompatValue(asset, "name")),
      text: asString(getCompatValue(textAsset, "text")),
      videoTitle: asString(getCompatValue(youtubeAsset, "youtube_video_title")),
      videoId: asString(getCompatValue(youtubeAsset, "youtube_video_id")),
      type: asString(getCompatValue(asset, "type")),
    });
  }

  const rows = core.rows
    .map((row) => {
      const assetGroup = getCompatObject(row, "asset_group");
      const campaign = getCompatObject(row, "campaign");
      const asset = getCompatObject(row, "asset");
      const aga = getCompatObject(row, "asset_group_asset");
      const metrics = getCompatObject(row, "metrics");
      const data = toMetricSet(metrics);
      const assetId = asString(getCompatValue(asset, "id")) ?? "unknown";
      const details = detailMap.get(assetId);
      const fieldType = asString(getCompatValue(aga, "field_type"));
      const assetType = asString(getCompatValue(asset, "type")) ?? details?.type ?? null;
      return {
        id: `${asString(getCompatValue(assetGroup, "id")) ?? "group"}:${assetId}`,
        assetId,
        assetGroupId: asString(getCompatValue(assetGroup, "id")),
        assetGroup: asString(getCompatValue(assetGroup, "name")) ?? "Unknown asset group",
        campaignId: asString(getCompatValue(campaign, "id")),
        campaign: asString(getCompatValue(campaign, "name")) ?? "",
        fieldType,
        type: normalizeAssetKind(fieldType, assetType),
        assetType,
        name: details?.name ?? asString(getCompatValue(asset, "name")),
        text: details?.text ?? null,
        preview: buildAssetPreview({
          fieldType,
          assetType,
          name: details?.name ?? asString(getCompatValue(asset, "name")),
          text: details?.text ?? null,
          videoTitle: details?.videoTitle ?? null,
        }),
        videoId: details?.videoId ?? null,
        performanceLabel: normalizeAssetPerformanceLabel(
          asString(getCompatValue(aga, "performance_label"))
        ),
        impressions: data.impressions,
        clicks: data.clicks,
        interactions: data.interactions,
        interactionRate: data.interactionRate,
        spend: data.spend,
        conversions: data.conversions,
        revenue: data.conversionValue,
        roas: data.roas,
        ctr: data.ctr,
        conversionRate: data.conversionRate,
        valuePerConversion: data.valuePerConversion,
      };
    })
    .filter((row) => row.assetId !== "unknown");

  const avgInteractionRate =
    rows.length > 0
      ? Number(
          (
            rows.reduce((sum, row) => sum + Number(row.interactionRate ?? 0), 0) / rows.length
          ).toFixed(2)
        )
      : 0;
  const avgConversionRate =
    rows.length > 0
      ? Number(
          (
            rows.reduce((sum, row) => sum + Number(row.conversionRate ?? 0), 0) / rows.length
          ).toFixed(2)
        )
      : 0;

  const enrichedRows = rows.map((row) => ({
    ...row,
    hint:
      Number(row.interactionRate ?? 0) < avgInteractionRate * 0.7 && row.impressions >= 100
        ? "Low interaction rate versus account average"
        : row.interactions >= 20 && row.conversions === 0
        ? "High interaction but weak post-click conversion"
        : Number(row.conversionRate ?? 0) < avgConversionRate * 0.7 && row.clicks >= 15
        ? "Clicks are coming through but message or landing page may be misaligned"
        : row.performanceLabel === "top"
        ? "High-value asset to reuse in new variants"
        : "",
  }));

  if (detail.failures.length > 0) {
    meta.warnings.push(
      "Some asset previews are unavailable. Performance metrics still use stable asset_group_asset reporting."
    );
  }

  addDebugMeta(meta, "assets", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows: enrichedRows.sort((a, b) => b.spend - a.spend),
    summary: {
      topPerformingCount: enrichedRows.filter((row) => row.performanceLabel === "top").length,
      underperformingCount: enrichedRows.filter(
        (row) => row.performanceLabel === "underperforming"
      ).length,
      lowCtrCount: enrichedRows.filter(
        (row) => Number(row.interactionRate ?? row.ctr ?? 0) < avgInteractionRate * 0.7
      ).length,
      typeBreakdown: Array.from(
        enrichedRows.reduce((map, row) => {
          map.set(row.type, (map.get(row.type) ?? 0) + 1);
          return map;
        }, new Map<string, number>())
      ).map(([type, count]) => ({ type, count })),
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

const ASSET_GROUP_REQUIRED_FIELDS = [
  "HEADLINE",
  "DESCRIPTION",
  "MARKETING_IMAGE",
  "LOGO",
  "BUSINESS_NAME",
];

function getAssetGroupCoverageScore(assetMix: AssetTypeSummary) {
  const covered = ASSET_GROUP_REQUIRED_FIELDS.filter((field) => (assetMix[field] ?? 0) > 0);
  return Number(((covered.length / ASSET_GROUP_REQUIRED_FIELDS.length) * 100).toFixed(0));
}

function isThemeAligned(theme: string, corpus: string) {
  const tokens = slugifyQueryCluster(theme).split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.some((token) => corpus.includes(token));
}

export async function getGoogleAdsAssetGroupsReport(params: {
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
  const [core, detail, signals, assetDetails] = await Promise.all([
    runNamedQuery(context, buildAssetGroupCoreQuery(startDate, endDate)),
    runNamedQuery(context, buildAssetGroupAssetDetailQuery(startDate, endDate)),
    runNamedQuery(context, buildAssetGroupSignalQuery()),
    runNamedQuery(context, buildAssetTextDetailQuery()),
  ]);

  mergeFailures(meta, core);
  mergeFailures(meta, detail);
  mergeFailures(meta, signals);
  mergeFailures(meta, assetDetails);

  const detailMap = new Map<string, { text: string | null }>();
  for (const row of assetDetails.rows) {
    const asset = getCompatObject(row, "asset");
    const textAsset = getCompatObject(asset, "text_asset");
    const id = asString(getCompatValue(asset, "id"));
    if (!id) continue;
    detailMap.set(id, {
      text: asString(getCompatValue(textAsset, "text")),
    });
  }

  const assetBreakdown = new Map<string, AssetTypeSummary>();
  const textCorpusByGroup = new Map<string, string[]>();
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
    current[fieldType ?? label] = (current[fieldType ?? label] ?? 0) + 1;
    assetBreakdown.set(id, current);

    const assetId = asString(getCompatValue(asset, "id"));
    const detailEntry = assetId ? detailMap.get(assetId) : null;
    if (detailEntry?.text) {
      const corpus = textCorpusByGroup.get(id) ?? [];
      corpus.push(detailEntry.text.toLowerCase());
      textCorpusByGroup.set(id, corpus);
    }
  }

  const searchThemesByGroup = new Map<string, SearchThemeSignal[]>();
  for (const row of signals.rows) {
    const assetGroup = getCompatObject(row, "asset_group");
    const signal = getCompatObject(row, "asset_group_signal");
    const searchTheme = getCompatObject(signal, "search_theme");
    const groupId = asString(getCompatValue(assetGroup, "id"));
    const text = asString(getCompatValue(searchTheme, "text"));
    if (!groupId || !text) continue;
    const current = searchThemesByGroup.get(groupId) ?? [];
    current.push({
      text,
      approvalStatus: asString(getCompatValue(signal, "approval_status")),
    });
    searchThemesByGroup.set(groupId, current);
  }

  const totalSpend = core.rows.reduce((sum, row) => {
    const metrics = getCompatObject(row, "metrics");
    return sum + toMetricSet(metrics).spend;
  }, 0);
  const totalRevenue = core.rows.reduce((sum, row) => {
    const metrics = getCompatObject(row, "metrics");
    return sum + toMetricSet(metrics).conversionValue;
  }, 0);
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const rows = core.rows.map((row) => {
    const assetGroup = getCompatObject(row, "asset_group");
    const campaign = getCompatObject(row, "campaign");
    const metrics = getCompatObject(row, "metrics");
    const data = toMetricSet(metrics);
    const id = asString(getCompatValue(assetGroup, "id")) ?? "unknown";
    const assetMix = assetBreakdown.get(id) ?? {};
    const coverageScore = getAssetGroupCoverageScore(assetMix);
    const searchThemes = searchThemesByGroup.get(id) ?? [];
    const corpus = (textCorpusByGroup.get(id) ?? []).join(" ").toLowerCase();
    const alignedThemes = searchThemes.filter((theme) => isThemeAligned(theme.text, corpus));
    const spendShare = totalSpend > 0 ? Number(((data.spend / totalSpend) * 100).toFixed(1)) : 0;
    const revenueShare =
      totalRevenue > 0 ? Number(((data.conversionValue / totalRevenue) * 100).toFixed(1)) : 0;
    const state =
      data.roas >= avgRoas * 1.15 && coverageScore >= 70
        ? "strong"
        : data.spend > 100 && data.roas < avgRoas * 0.75
        ? "weak"
        : "watch";

    return {
      id,
      name: asString(getCompatValue(assetGroup, "name")) ?? "Unnamed Asset Group",
      status: normalizeStatus(asString(getCompatValue(assetGroup, "status")) ?? undefined),
      campaignId: asString(getCompatValue(campaign, "id")),
      campaign: asString(getCompatValue(campaign, "name")) ?? "",
      impressions: data.impressions,
      clicks: data.clicks,
      interactions: data.interactions,
      spend: data.spend,
      conversions: data.conversions,
      revenue: data.conversionValue,
      roas: data.roas,
      cpa: data.cpa,
      conversionRate: data.conversionRate,
      spendShare,
      revenueShare,
      coverageScore,
      assetCount: Object.values(assetMix).reduce((sum, count) => sum + count, 0),
      assetMix,
      state,
      adStrength: null,
      audienceSignalsSummary: null,
      searchThemes: searchThemes.map((theme) => ({
        ...theme,
        alignedMessaging: isThemeAligned(theme.text, corpus),
      })),
      searchThemeSummary: searchThemes.map((theme) => theme.text).slice(0, 3).join(", "),
      searchThemeCount: searchThemes.length,
      searchThemeAlignedCount: alignedThemes.length,
      missingAssetFields: ASSET_GROUP_REQUIRED_FIELDS.filter(
        (field) => (assetMix[field] ?? 0) === 0
      ),
    };
  });

  meta.warnings.push(
    "Search themes are shown as configured asset-group signals. Google Ads does not consistently expose asset-group-level theme performance metrics, so alignment is based on configured themes plus available asset messaging."
  );
  if (assetDetails.failures.length > 0) {
    meta.warnings.push(
      "Theme-to-message alignment is partial because some asset text details could not be loaded."
    );
  }

  addDebugMeta(meta, "asset-groups", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows: rows.sort((a, b) => b.spend - a.spend),
    summary: {
      strongCount: rows.filter((row) => row.state === "strong").length,
      weakCount: rows.filter((row) => row.state === "weak").length,
      coverageGaps: rows.filter((row) => row.coverageScore < 70).length,
      searchThemeCount: rows.reduce((sum, row) => sum + row.searchThemeCount, 0),
    },
    insights: {
      scaleCandidates: rows
        .filter((row) => row.state === "strong")
        .slice(0, 5),
      reduceCandidates: rows
        .filter((row) => row.state === "weak")
        .slice(0, 5),
    },
    meta,
  };
}

export async function getGoogleAdsProductsReport(params: {
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
  const products = await runNamedQuery(context, buildProductPerformanceQuery(startDate, endDate));
  mergeFailures(meta, products);

  const productMap = new Map<
    string,
    {
      itemId: string;
      title: string;
      brand: string | null;
      feedPrice: number | null;
      impressions: number;
      clicks: number;
      spend: number;
      conversions: number;
      revenue: number;
    }
  >();

  for (const row of products.rows) {
    const product = getCompatObject(row, "shopping_product");
    const metrics = getCompatObject(row, "metrics");
    const itemId = asString(getCompatValue(product, "item_id")) ?? "unknown";
    const current = productMap.get(itemId) ?? {
      itemId,
      title: asString(getCompatValue(product, "title")) ?? "Unknown product",
      brand: asString(getCompatValue(product, "brand")),
      feedPrice: asNumber(getCompatValue(product, "custom_attribute0")),
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      revenue: 0,
    };
    const data = toMetricSet(metrics);
    productMap.set(itemId, {
      ...current,
      impressions: current.impressions + data.impressions,
      clicks: current.clicks + data.clicks,
      spend: Number((current.spend + data.spend).toFixed(2)),
      conversions: Number((current.conversions + data.conversions).toFixed(2)),
      revenue: Number((current.revenue + data.conversionValue).toFixed(2)),
    });
  }

  const rows = Array.from(productMap.values())
    .filter((row) => row.itemId !== "unknown")
    .map((row) => {
      const roas = row.spend > 0 ? Number((row.revenue / row.spend).toFixed(2)) : 0;
      const cpa =
        row.conversions > 0 ? Number((row.spend / row.conversions).toFixed(2)) : 0;
      const contributionProxy = Number((row.revenue - row.spend).toFixed(2));
      const spendPerOrder =
        row.conversions > 0 ? Number((row.spend / row.conversions).toFixed(2)) : null;
      const avgOrderValue =
        row.conversions > 0 ? Number((row.revenue / row.conversions).toFixed(2)) : null;

      return {
        ...row,
        roas,
        cpa,
        ctr:
          row.impressions > 0 ? Number(((row.clicks / row.impressions) * 100).toFixed(2)) : 0,
        avgOrderValue,
        spendPerOrder,
        valuePerClick: row.clicks > 0 ? Number((row.revenue / row.clicks).toFixed(2)) : null,
        contributionProxy,
        contributionState:
          contributionProxy > 0 ? "positive" : contributionProxy < 0 ? "negative" : "neutral",
        statusLabel:
          roas >= 3 ? "scale" : roas >= 1.5 ? "stable" : row.spend > 25 ? "reduce" : "test",
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);

  addDebugMeta(meta, "products", context, {
    date_range: { startDate, endDate },
  });

  return {
    rows,
    summary: {
      totalSpend: Number(totalSpend.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      scaleCandidates: rows.filter((row) => row.statusLabel === "scale").length,
      reduceCandidates: rows.filter((row) => row.statusLabel === "reduce").length,
      spendConcentrationTop3: Number(
        rows
          .slice(0, 3)
          .reduce((sum, row) => sum + (totalSpend > 0 ? row.spend / totalSpend : 0), 0)
          .toFixed(2)
      ),
    },
    insights: {
      topRevenueProducts: [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      lowRoasProducts: rows.filter((row) => row.roas < 1.5 && row.spend > 25).slice(0, 5),
      spendWithoutReturn: rows.filter((row) => row.conversions === 0 && row.spend > 20).slice(0, 5),
    },
    meta,
  };
}

export async function getGoogleAdsDiagnosticsReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<Record<string, unknown>>> {
  const reports = await Promise.all([
    getGoogleAdsOverviewReport(params),
    getGoogleAdsCampaignsReport(params),
    getGoogleAdsSearchIntelligenceReport(params),
    getGoogleAdsKeywordsReport(params),
    getGoogleAdsAssetsReport(params),
    getGoogleAdsAssetGroupsReport(params),
    getGoogleAdsProductsReport(params),
    getGoogleAdsAudiencesReport(params),
    getGoogleAdsGeoReport(params),
    getGoogleAdsDevicesReport(params),
    getGoogleAdsBudgetReport(params),
    getGoogleAdsOpportunitiesReport(params),
  ]);

  const [overview, campaigns, searchIntelligence, keywords, assets, assetGroups, products, audiences, geo, devices, budget, opportunities] =
    reports;

  const meta = createEmptyMeta(Boolean(params.debug));
  for (const child of reports) {
    mergeChildMeta(meta, child.meta);
  }
  meta.warnings = dedupeStrings(meta.warnings);
  meta.unavailable_metrics = dedupeStrings(meta.unavailable_metrics);
  meta.query_names = dedupeStrings(meta.query_names);

  const sections = [
    { label: "Overview", meta: overview.meta, rows: 1 },
    { label: "Campaigns", meta: campaigns.meta, rows: campaigns.rows.length },
    {
      label: "Search Intelligence",
      meta: searchIntelligence.meta,
      rows: searchIntelligence.rows.length,
    },
    { label: "Keywords", meta: keywords.meta, rows: keywords.rows.length },
    { label: "Assets", meta: assets.meta, rows: assets.rows.length },
    { label: "Asset Groups", meta: assetGroups.meta, rows: assetGroups.rows.length },
    { label: "Products", meta: products.meta, rows: products.rows.length },
    { label: "Audience Intelligence", meta: audiences.meta, rows: audiences.rows.length },
    { label: "Geo", meta: geo.meta, rows: geo.rows.length },
    { label: "Devices", meta: devices.meta, rows: devices.rows.length },
    { label: "Budget & Scaling", meta: budget.meta, rows: budget.rows.length },
    { label: "Opportunities", meta: opportunities.meta, rows: opportunities.rows.length },
  ].map((section) => ({
    ...section,
    partial: section.meta.partial,
    warningCount: section.meta.warnings.length,
    failureCount: section.meta.failed_queries.length,
    unavailableMetricCount: section.meta.unavailable_metrics.length,
  }));

  return {
    rows: sections,
    summary: {
      loadedSections: sections.length,
      healthySections: sections.filter(
        (section) =>
          !section.partial && section.warningCount === 0 && section.failureCount === 0
      ).length,
      totalWarnings: sections.reduce((sum, section) => sum + section.warningCount, 0),
      totalFailures: sections.reduce((sum, section) => sum + section.failureCount, 0),
      generatedAt: new Date().toISOString(),
    },
    insights: {
      limitations: [
        "Asset-group-level search theme performance metrics are not consistently exposed by Google Ads API; configured themes and messaging alignment are shown instead.",
        "Keyword quality metrics depend on Google Ads quality_info availability and may be absent for some criteria.",
        "Product contribution is a value-minus-spend proxy, not a true margin model.",
      ],
    },
    meta,
  };
}

export async function getGoogleAdsOpportunitiesReport(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  debug?: boolean;
}): Promise<ReportResult<GadsOpportunity>> {
  const [
    campaigns,
    keywords,
    searchIntelligence,
    ads,
    assets,
    assetGroups,
    products,
    devices,
    audiences,
  ] = await Promise.all([
    getGoogleAdsCampaignsReport(params),
    getGoogleAdsKeywordsReport(params),
    getGoogleAdsSearchIntelligenceReport(params),
    getGoogleAdsAdsReport(params),
    getGoogleAdsAssetsReport(params),
    getGoogleAdsAssetGroupsReport(params),
    getGoogleAdsProductsReport(params),
    getGoogleAdsDevicesReport(params),
    getGoogleAdsAudiencesReport(params),
  ]);

  const meta = createEmptyMeta(Boolean(params.debug));
  for (const childMeta of [
    campaigns.meta,
    keywords.meta,
    searchIntelligence.meta,
    ads.meta,
    assets.meta,
    assetGroups.meta,
    products.meta,
    devices.meta,
    audiences.meta,
  ]) {
    mergeChildMeta(meta, childMeta);
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
    searchTerms: searchIntelligence.rows as never,
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
        impact: "Efficiency lift",
        confidence: "medium",
        effort: "low",
        priority: "medium",
        recommendedAction: "Apply mobile bid moderation or isolate desktop winners into their own tests.",
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
        impact: "Waste reduction",
        confidence: "medium",
        effort: "medium",
        priority: "medium",
        recommendedAction: "Tighten or exclude the weak audience segment and redirect budget to stronger segments.",
      });
    }
  }

  const weakAsset = assets.rows.find(
    (row) =>
      String(row.performanceLabel) === "underperforming" &&
      Number(row.spend ?? 0) > 20
  );
  if (weakAsset) {
    rows.push({
      id: "asset_refresh_underperformer",
      type: "asset_refresh",
      title: `Refresh ${weakAsset.type} assets in ${weakAsset.assetGroup}`,
      whyItMatters: "Asset performance signals show this creative element is dragging the group down.",
      evidence: `${weakAsset.preview} spent $${Number(weakAsset.spend ?? 0).toFixed(0)} at ${Number(weakAsset.roas ?? 0).toFixed(2)}x ROAS`,
      expectedImpact: "Lift interaction quality and downstream conversion efficiency",
      impact: "Creative lift",
      confidence: "medium",
      effort: "medium",
      priority: "medium",
      recommendedAction:
        String(weakAsset.hint ?? "").length > 0
          ? String(weakAsset.hint)
          : "Replace the weakest asset with a sharper value proposition and stronger variety.",
    });
  }

  const weakAssetGroup = assetGroups.rows.find(
    (row) =>
      (String(row.state) === "weak" || Number(row.coverageScore ?? 0) < 70) &&
      Number(row.spend ?? 0) > 25
  );
  if (weakAssetGroup) {
    rows.push({
      id: "asset_group_fix",
      type: "asset_group_fix",
      title: `Improve asset group ${weakAssetGroup.name}`,
      whyItMatters: "This asset group is consuming spend without matching asset coverage or return quality.",
      evidence: `${weakAssetGroup.name} coverage ${weakAssetGroup.coverageScore}% with ${weakAssetGroup.roas}x ROAS`,
      expectedImpact: "Stronger PMax coverage and better budget efficiency",
      impact: "PMax quality lift",
      confidence: "medium",
      effort: "medium",
      priority: "medium",
      recommendedAction:
        Array.isArray(weakAssetGroup.missingAssetFields) &&
        weakAssetGroup.missingAssetFields.length > 0
          ? `Add missing ${weakAssetGroup.missingAssetFields.join(", ").toLowerCase()} assets and tighten search themes.`
          : "Rebuild the asset mix and audience/search theme signals for this group.",
    });
  }

  const scaleProduct = products.rows.find(
    (row) => String(row.statusLabel) === "scale" && Number(row.spend ?? 0) > 15
  );
  if (scaleProduct) {
    rows.push({
      id: "product_scale",
      type: "product_scale",
      title: `Scale spend behind ${scaleProduct.title}`,
      whyItMatters: "This product is turning spend into value efficiently and can likely absorb more demand.",
      evidence: `${scaleProduct.title} ROAS ${scaleProduct.roas}x with ${scaleProduct.conversions} orders`,
      expectedImpact: "Incremental product revenue from a proven winner",
      impact: "Revenue growth",
      confidence: "medium",
      effort: "low",
      priority: "high",
      recommendedAction:
        "Increase bids or budget share on campaigns and asset groups where this product is already converting efficiently.",
    });
  }

  const reduceProduct = products.rows.find(
    (row) => String(row.statusLabel) === "reduce" && Number(row.spend ?? 0) > 20
  );
  if (reduceProduct) {
    rows.push({
      id: "product_reduce",
      type: "product_reduce",
      title: `Reduce poor-product spend on ${reduceProduct.title}`,
      whyItMatters: "Budget is concentrated on a product that is not producing enough return.",
      evidence: `${reduceProduct.title} spent $${Number(reduceProduct.spend ?? 0).toFixed(0)} at ${Number(reduceProduct.roas ?? 0).toFixed(2)}x ROAS`,
      expectedImpact: "Lower waste and free budget for stronger SKUs",
      impact: "Waste reduction",
      confidence: "medium",
      effort: "low",
      priority: "high",
      recommendedAction:
        "Lower bids, restrict product group exposure, or shift emphasis toward higher-return products.",
    });
  }

  const themeMismatch = assetGroups.rows.find(
    (row) =>
      Number(row.searchThemeCount ?? 0) > 0 &&
      Number(row.searchThemeAlignedCount ?? 0) < Number(row.searchThemeCount ?? 0)
  );
  if (themeMismatch) {
    rows.push({
      id: "search_theme_mismatch",
      type: "search_theme_alignment",
      title: `Align search themes with messaging in ${themeMismatch.name}`,
      whyItMatters: "Configured search themes are broader than the current asset messaging, which can dilute relevance.",
      evidence: `${themeMismatch.searchThemeAlignedCount}/${themeMismatch.searchThemeCount} configured themes appear in current asset messaging`,
      expectedImpact: "Tighter PMax relevance and stronger theme-to-asset coherence",
      impact: "Relevance lift",
      confidence: "low",
      effort: "medium",
      priority: "medium",
      recommendedAction:
        "Rewrite headlines and descriptions so the highest-value search themes show up directly in the asset copy.",
    });
  }

  if (params.debug) {
    meta.debug = {
      child_reports: [
        "campaigns",
        "keywords",
        "search-intelligence",
        "ads",
        "assets",
        "asset-groups",
        "products",
        "devices",
        "audiences",
      ],
    };
  }

  return {
    rows: rows.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }),
    summary: {
      accountAvgRoas,
      accountAvgCpa,
    },
    meta,
  };
}
