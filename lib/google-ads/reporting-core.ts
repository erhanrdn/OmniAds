import {
  executeGaqlForAccounts,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  getGoogleAdsFailureMessage,
  type GoogleAdsAccountQueryFailure,
} from "@/lib/google-ads-gaql";
import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";
import { GOOGLE_ADS_METRICS_MATRIX, type GoogleAdsTabId } from "@/lib/google-ads/metrics-matrix";
import {
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
import type { GadsCampaignRow } from "@/lib/google-ads-intelligence";
import type { CrossEntityInsight } from "@/lib/google-ads/cross-entity-intelligence";
import type { GoogleAdsOpportunity } from "@/lib/google-ads/opportunity-engine";
import type { GoogleAdsNamedQuery } from "@/lib/google-ads/query-builders";
import {
  dedupeStrings,
  type RawRow,
} from "@/lib/google-ads/reporting-support";

export type DateRange = "7" | "14" | "30" | "90" | "mtd" | "qtd" | "custom";
export type CompareMode = "none" | "previous_period" | "previous_year" | "custom";

export interface BaseReportParams {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  customStart?: string | null;
  customEnd?: string | null;
  debug?: boolean;
  source?: string;
}

export interface ComparativeReportParams extends BaseReportParams {
  compareMode?: CompareMode | null;
  compareStart?: string | null;
  compareEnd?: string | null;
}

export interface QueryExecution {
  rows: RawRow[];
  failures: GoogleAdsAccountQueryFailure[];
  query: GoogleAdsNamedQuery;
}

export type QuerySeverity = "core" | "optional";
export type QueryFailureCategory =
  | "auth_permission_context"
  | "unsupported_query_shape"
  | "unavailable_metric"
  | "bad_query_shape"
  | "optional_advanced_failure"
  | "unknown";

export interface ReportContext {
  businessId: string;
  customerIds: string[];
  dateRange: DateRange;
  debug: boolean;
  source: string;
  requestId: string;
}

export interface ReportResult<Row extends object> {
  rows: Row[];
  summary?: Record<string, unknown>;
  insights?: unknown;
  meta: GoogleAdsReportMeta;
}

export interface OverviewReportResult {
  kpis: Record<string, unknown>;
  kpiDeltas?: Record<string, number | null | undefined>;
  topCampaigns: Array<GadsCampaignRow & { badges: string[] }>;
  insights: unknown[];
  meta: GoogleAdsReportMeta;
  summary?: Record<string, unknown>;
}

export type AssetTypeSummary = Record<string, number>;

export interface SearchThemeSignal {
  text: string;
  approvalStatus: string | null;
}

const CORE_QUERY_NAMES = new Set(["customer_summary", "campaign_core_basic"]);

export function getQuerySeverity(queryName: string): QuerySeverity {
  return CORE_QUERY_NAMES.has(queryName) ? "core" : "optional";
}

export function classifyFailureCategory(input: {
  queryName: string;
  message: string;
  status?: number;
  apiStatus?: string;
  apiErrorCode?: string;
}): QueryFailureCategory {
  const text = `${input.message} ${input.apiStatus ?? ""} ${input.apiErrorCode ?? ""}`.toUpperCase();
  if (
    input.status === 401 ||
    input.status === 403 ||
    text.includes("PERMISSION_DENIED") ||
    text.includes("UNAUTHENTICATED") ||
    text.includes("LOGIN-CUSTOMER-ID") ||
    text.includes("DEVELOPER_TOKEN")
  ) {
    return "auth_permission_context";
  }
  if (
    text.includes("PROHIBITED") ||
    text.includes("UNSUPPORTED") ||
    text.includes("CANNOT SELECT") ||
    text.includes("NOT SELECTABLE") ||
    text.includes("UNRECOGNIZED_FIELD")
  ) {
    return "unsupported_query_shape";
  }
  if (
    text.includes("METRIC") &&
    (text.includes("UNAVAILABLE") || text.includes("CANNOT BE REQUESTED") || text.includes("INCOMPATIBLE"))
  ) {
    return "unavailable_metric";
  }
  if (text.includes("INVALID_ARGUMENT") || text.includes("PARSE") || text.includes("SYNTAX")) {
    return "bad_query_shape";
  }
  if (getQuerySeverity(input.queryName) === "optional") {
    return "optional_advanced_failure";
  }
  return "unknown";
}

export function getNumericShare(value: unknown) {
  const parsed = asNumber(value);
  return parsed === null ? 0 : parsed;
}

export function mergeFailures(meta: GoogleAdsReportMeta, execution: QueryExecution) {
  meta.query_names.push(execution.query.name);
  meta.row_counts[execution.query.name] = execution.rows.length;
  const familyMeta = meta.report_families[execution.query.family] ?? {
    partial: false,
    warnings: [],
    failed_queries: [],
    unavailable_metrics: [],
    query_names: [],
    row_count: 0,
  };
  familyMeta.query_names.push(execution.query.name);
  familyMeta.row_count += execution.rows.length;
  if (execution.failures.length === 0) {
    meta.report_families[execution.query.family] = {
      ...familyMeta,
      warnings: dedupeStrings(familyMeta.warnings),
      unavailable_metrics: dedupeStrings(familyMeta.unavailable_metrics),
      query_names: dedupeStrings(familyMeta.query_names),
    };
    return;
  }

  meta.partial = true;
  meta.unavailable_metrics.push(...execution.query.metrics);
  familyMeta.partial = true;
  familyMeta.unavailable_metrics.push(...execution.query.metrics);
  meta.failed_queries.push(
    ...execution.failures.map((failure) => ({
      query: execution.query.name,
      family: execution.query.family,
      customerId: failure.customerId,
      message: failure.message,
      status: failure.status,
      apiStatus: failure.apiStatus,
      apiErrorCode: failure.apiErrorCode,
      loginCustomerId: failure.loginCustomerId,
      severity: getQuerySeverity(execution.query.name),
      category: classifyFailureCategory({
        queryName: execution.query.name,
        message: failure.message,
        status: failure.status,
        apiStatus: failure.apiStatus,
        apiErrorCode: failure.apiErrorCode,
      }),
    }))
  );
  familyMeta.failed_queries.push(
    ...execution.failures.map((failure) => ({
      query: execution.query.name,
      family: execution.query.family,
      customerId: failure.customerId,
      message: failure.message,
      status: failure.status,
      apiStatus: failure.apiStatus,
      apiErrorCode: failure.apiErrorCode,
      loginCustomerId: failure.loginCustomerId,
      severity: getQuerySeverity(execution.query.name),
      category: classifyFailureCategory({
        queryName: execution.query.name,
        message: failure.message,
        status: failure.status,
        apiStatus: failure.apiStatus,
        apiErrorCode: failure.apiErrorCode,
      }),
    }))
  );
  familyMeta.warnings.push(`${execution.query.name}: ${getGoogleAdsFailureMessage(execution.failures)}`);
  meta.warnings.push(`${execution.query.name}: ${getGoogleAdsFailureMessage(execution.failures)}`);
  meta.report_families[execution.query.family] = {
    ...familyMeta,
    warnings: dedupeStrings(familyMeta.warnings),
    unavailable_metrics: dedupeStrings(familyMeta.unavailable_metrics),
    query_names: dedupeStrings(familyMeta.query_names),
  };
}

export function finalizeMeta(meta: GoogleAdsReportMeta) {
  meta.warnings = dedupeStrings(meta.warnings);
  meta.unavailable_metrics = dedupeStrings(meta.unavailable_metrics);
  meta.query_names = dedupeStrings(meta.query_names);
  meta.failed_queries = meta.failed_queries.filter((failure, index, list) => {
    const key = [
      failure.query,
      failure.family,
      failure.customerId ?? "",
      failure.loginCustomerId ?? "",
      failure.status ?? "",
      failure.apiStatus ?? "",
      failure.apiErrorCode ?? "",
      failure.message,
    ].join("|");
    return index === list.findIndex((candidate) => [
      candidate.query,
      candidate.family,
      candidate.customerId ?? "",
      candidate.loginCustomerId ?? "",
      candidate.status ?? "",
      candidate.apiStatus ?? "",
      candidate.apiErrorCode ?? "",
      candidate.message,
    ].join("|") === key);
  });
  meta.report_families = Object.fromEntries(
    Object.entries(meta.report_families).map(([family, familyMeta]) => [
      family,
      {
        ...familyMeta,
        warnings: dedupeStrings(familyMeta.warnings),
        unavailable_metrics: dedupeStrings(familyMeta.unavailable_metrics),
        query_names: dedupeStrings(familyMeta.query_names),
      },
    ])
  );
}

export function createPrerequisiteFailureMeta(
  debug: boolean,
  message: string,
  input: {
    businessId: string;
    accountId?: string | null;
    assignedAccounts: string[];
    startDate: string;
    endDate: string;
  }
): GoogleAdsReportMeta {
  return {
    ...createEmptyMeta(debug),
    partial: true,
    warnings: [message],
    failed_queries: [
      {
        query: "google_ads_prerequisite",
        family: "configuration",
        customerId: input.accountId ?? input.assignedAccounts[0] ?? "unresolved",
        message,
        severity: "core",
        category: "auth_permission_context",
      },
    ],
    debug: debug
      ? {
          businessId: input.businessId,
          assignedAccounts: input.assignedAccounts,
          requestedAccountId: input.accountId ?? "all",
          date_range: { startDate: input.startDate, endDate: input.endDate },
        }
      : undefined,
  };
}

export async function runNamedQuery(
  context: ReportContext,
  query: GoogleAdsNamedQuery
): Promise<QueryExecution> {
  console.log("[google-ads-reporting] run_named_query", {
    source: context.source,
    requestId: context.requestId,
    businessId: context.businessId,
    customerIds: context.customerIds,
    queryName: query.name,
    resource: query.resource,
    family: query.family,
    queryText: query.query,
  });
  const { results, failures } = await executeGaqlForAccounts({
    businessId: context.businessId,
    customerIds: context.customerIds,
    query: query.query,
    queryName: query.name,
    queryFamily: query.family,
    source: context.source,
    requestId: context.requestId,
  });

  const rows = results.flatMap((result) => (result.results ?? []) as RawRow[]);
  console.log("[google-ads-reporting] query_result", {
    source: context.source,
    requestId: context.requestId,
    businessId: context.businessId,
    queryName: query.name,
    customerIds: context.customerIds,
    resultSets: results.length,
    rowCount: rows.length,
    failureCount: failures.length,
    queryText: query.query,
  });

  return { rows, failures, query };
}

export async function resolveContext(params: {
  businessId: string;
  accountId?: string | null;
  dateRange: DateRange;
  customStart?: string | null;
  customEnd?: string | null;
  debug: boolean;
  source?: string;
}): Promise<
  | { ok: true; context: ReportContext; startDate: string; endDate: string }
  | { ok: false; payload: { rows: []; meta: GoogleAdsReportMeta; summary?: Record<string, unknown> } }
> {
  const { businessId, accountId, dateRange, customStart, customEnd, debug } = params;
  const assignedAccounts = await getAssignedGoogleAccounts(businessId);
  const accountsToQuery = accountId && accountId !== "all" ? [accountId] : assignedAccounts;
  const { startDate, endDate } = getDateRangeForQuery(
    dateRange,
    customStart ?? undefined,
    customEnd ?? undefined
  );

  try {
    void GOOGLE_CONFIG.developerToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[google-ads-reporting] prerequisite_failed", {
      businessId,
      requestedAccountId: accountId ?? "all",
      assignedAccounts,
      envCheck: {
        hasGoogleAdsDeveloperToken: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
        tokenLength: process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.length ?? 0,
      },
      runtime: "nodejs",
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelUrl: process.env.VERCEL_URL ?? null,
      message,
    });
    return {
      ok: false,
      payload: {
        rows: [],
        summary: {
          totalAccounts: accountsToQuery.length,
          blockedBy: "missing_google_ads_developer_token",
        },
        meta: createPrerequisiteFailureMeta(debug, message, {
          businessId,
          accountId,
          assignedAccounts,
          startDate,
          endDate,
        }),
      },
    };
  }

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

  console.log("[google-ads-reporting] resolve_context", {
    businessId,
    assignedAccounts,
    requestedAccountId: accountId ?? "all",
    accountsToQuery,
    dateRange,
    startDate,
    endDate,
  });

  return {
    ok: true,
    context: {
      businessId,
      customerIds: accountsToQuery,
      dateRange,
      debug,
      source: params.source ?? "google_ads_reporting",
      requestId: `${params.source ?? "google_ads_reporting"}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    },
    startDate,
    endDate,
  };
}

export function addDebugMeta(
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

export function mergeChildMeta(target: GoogleAdsReportMeta, child: GoogleAdsReportMeta) {
  target.partial = target.partial || child.partial;
  target.warnings.push(...child.warnings);
  target.failed_queries.push(...child.failed_queries);
  target.unavailable_metrics.push(...child.unavailable_metrics);
  target.query_names.push(...child.query_names);
  Object.assign(target.row_counts, child.row_counts);
  for (const [family, familyMeta] of Object.entries(child.report_families)) {
    const current = target.report_families[family] ?? {
      partial: false,
      warnings: [],
      failed_queries: [],
      unavailable_metrics: [],
      query_names: [],
      row_count: 0,
    };
    target.report_families[family] = {
      partial: current.partial || familyMeta.partial,
      warnings: current.warnings.concat(familyMeta.warnings),
      failed_queries: current.failed_queries.concat(familyMeta.failed_queries),
      unavailable_metrics: current.unavailable_metrics.concat(familyMeta.unavailable_metrics),
      query_names: current.query_names.concat(familyMeta.query_names),
      row_count: current.row_count + familyMeta.row_count,
    };
  }
}

export function buildCampaignMap(coreRows: RawRow[], shareRows: RawRow[], budgetRows: RawRow[]) {
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
          ? Number((((asNumber(getCompatValue(campaignBudget, "amount_micros")) ?? 0) / 1_000_000)).toFixed(2))
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

export function mapCrossEntityInsightToOpportunity(insight: CrossEntityInsight): GoogleAdsOpportunity | null {
  const primary = insight.relatedEntities[0];
  if (!primary) return null;
  return {
    id: `cross-${insight.id}`,
    type:
      insight.type === "waste_concentration" || insight.type === "revenue_dependency"
        ? "reduce"
        : insight.type === "asset_theme_alignment"
          ? "fix"
          : "scale",
    entityType:
      primary.entityType === "assetGroup"
        ? "assetGroup"
        : primary.entityType === "product"
          ? "product"
          : primary.entityType === "campaign"
            ? "campaign"
            : "searchTerm",
    entityId: primary.entityId,
    title: insight.title,
    description: insight.description,
    reasoning: insight.reasoning,
    expectedImpact: insight.impact,
    confidence: insight.confidence,
    metrics: {
      spend:
        typeof insight.metrics?.spend === "number"
          ? insight.metrics.spend
          : typeof insight.metrics?.campaignSpend === "number"
            ? Number(insight.metrics.campaignSpend)
            : undefined,
      revenue:
        typeof insight.metrics?.clusterRevenue === "number"
          ? Number(insight.metrics.clusterRevenue)
          : undefined,
      roas:
        typeof insight.metrics?.campaignRoas === "number"
          ? Number(insight.metrics.campaignRoas)
          : typeof insight.metrics?.productRoas === "number"
            ? Number(insight.metrics.productRoas)
            : undefined,
    },
  };
}

export function aggregateOverviewKpis(customerRows: RawRow[]) {
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
    valuePerConversion: conversions > 0 ? Number((revenue / conversions).toFixed(2)) : null,
    costPerConversion: conversions > 0 ? Number((spend / conversions).toFixed(2)) : null,
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
