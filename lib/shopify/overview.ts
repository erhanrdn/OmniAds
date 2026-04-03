import { getBusinessTimezone } from "@/lib/account-store";
import { getIntegration } from "@/lib/integrations";
import { enumerateDays, round2 } from "@/lib/overview-service-support";
import { getCachedReport, getReportingDateRangeKey, setCachedReport } from "@/lib/reporting-cache";

const SHOPIFY_OVERVIEW_CACHE_TTL_MINUTES = 15;
const SHOPIFY_ANALYTICS_API_VERSION = process.env.SHOPIFY_ANALYTICS_API_VERSION ?? "2025-10";
const SHOPIFY_OVERVIEW_REPORT_TYPE = "overview_shopify_orders_aggregate_v6";
const SHOPIFY_ORDER_PAGE_SIZE = 250;
const SHOPIFY_ORDER_PAGE_LIMIT = 40;

export interface ShopifyOverviewAggregate {
  revenue: number;
  purchases: number;
  averageOrderValue: number | null;
  grossRevenue?: number | null;
  refundedRevenue?: number | null;
  returnEvents?: number | null;
  sessions: number | null;
  conversionRate: number | null;
  newCustomers: number | null;
  returningCustomers: number | null;
  dailyTrends: Array<{
    date: string;
    revenue: number;
    purchases: number;
    grossRevenue?: number | null;
    refundedRevenue?: number | null;
    returnEvents?: number | null;
    sessions: number | null;
    conversionRate: number | null;
    newCustomers: number | null;
    returningCustomers: number | null;
  }>;
}

function hasScope(scopes: string | null | undefined, scope: string) {
  return (scopes ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(scope);
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function toTimeZoneIsoDate(value: string, timeZone?: string | null) {
  if (!timeZone) return normalizeDate(value);
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return normalizeDate(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function parseTimeZoneOffsetMinutes(value: string) {
  const match = value.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2] ?? "0", 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const offsetPart = formatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  return offsetPart ? parseTimeZoneOffsetMinutes(offsetPart) : null;
}

function shiftIsoDate(date: string, dayDelta: number) {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayDelta);
  return base.toISOString().slice(0, 10);
}

function localDateBoundaryToUtcIso(input: {
  date: string;
  timeZone: string;
  endOfDay?: boolean;
}) {
  const [year, month, day] = input.date.split("-").map((part) => Number.parseInt(part, 10));
  const utcMillis = Date.UTC(year, month - 1, day, input.endOfDay ? 23 : 0, input.endOfDay ? 59 : 0, input.endOfDay ? 59 : 0);
  let instant = new Date(utcMillis);
  let offset = getTimeZoneOffsetMinutes(input.timeZone, instant);
  if (offset === null) return instant.toISOString();
  instant = new Date(utcMillis - offset * 60_000);
  const correctedOffset = getTimeZoneOffsetMinutes(input.timeZone, instant);
  if (correctedOffset !== null && correctedOffset !== offset) {
    instant = new Date(utcMillis - correctedOffset * 60_000);
  }
  return instant.toISOString();
}

function resolveShopLocalWindow(input: {
  startDate: string;
  endDate: string;
  timeZone?: string | null;
}) {
  if (!input.timeZone) {
    return {
      startIso: `${input.startDate}T00:00:00Z`,
      endIso: `${input.endDate}T23:59:59Z`,
    };
  }

  const nextDay = shiftIsoDate(input.endDate, 1);
  const startIso = localDateBoundaryToUtcIso({
    date: input.startDate,
    timeZone: input.timeZone,
  });
  const nextDayStartIso = localDateBoundaryToUtcIso({
    date: nextDay,
    timeZone: input.timeZone,
  });
  const endIso = new Date(new Date(nextDayStartIso).getTime() - 1000).toISOString();

  return {
    startIso,
    endIso,
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

interface ShopifyAdminGraphqlOrderEdge {
  node?: {
    createdAt?: string | null;
    processedAt?: string | null;
    test?: boolean | null;
    cancelledAt?: string | null;
    displayFinancialStatus?: string | null;
    totalPriceSet?: {
      shopMoney?: {
        amount?: string | null;
      } | null;
    } | null;
    totalRefundedSet?: {
      shopMoney?: {
        amount?: string | null;
      } | null;
    } | null;
    currentTotalPriceSet?: {
      shopMoney?: {
        amount?: string | null;
      } | null;
    } | null;
  } | null;
}

interface ShopifyOrdersPagePayload {
  orders?: {
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
    edges?: ShopifyAdminGraphqlOrderEdge[] | null;
  } | null;
}

async function shopifyAdminGraphql<T>(input: {
  shopId: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(
    `https://${input.shopId}/admin/api/${SHOPIFY_ANALYTICS_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": input.accessToken,
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        variables: input.variables ?? {},
      }),
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; errors?: Array<{ message?: string }> }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.errors?.[0]?.message ?? `Shopify GraphQL query failed (${response.status}).`
    );
  }

  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "Shopify GraphQL query failed.");
  }

  if (!payload?.data) {
    throw new Error("Shopify GraphQL response missing data.");
  }

  return payload.data;
}

async function getShopifyOrderCommerceMetrics(input: {
  shopId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  dates: string[];
  timeZone?: string | null;
  businessTimeZone?: string | null;
}) {
  const query = `
    query ShopifyOverviewCommerceOrders($query: String!, $cursor: String) {
      orders(first: ${SHOPIFY_ORDER_PAGE_SIZE}, after: $cursor, sortKey: CREATED_AT, query: $query) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            createdAt
            processedAt
            test
            cancelledAt
            displayFinancialStatus
            totalPriceSet {
              shopMoney {
                amount
              }
            }
            totalRefundedSet {
              shopMoney {
                amount
              }
            }
            currentTotalPriceSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
    }
  `;

  const dailyRevenue = new Map<string, number>();
  const dailyPurchases = new Map<string, number>();
  const expandedStartDate = shiftIsoDate(input.startDate, -1);
  const expandedEndDate = shiftIsoDate(input.endDate, 1);
  const diagnosticDates = enumerateDays(expandedStartDate, expandedEndDate);
  const diagnosticCreatedShopRevenue = new Map<string, number>();
  const diagnosticCreatedBusinessRevenue = new Map<string, number>();
  const diagnosticProcessedShopRevenue = new Map<string, number>();
  let totalCurrentRevenue = 0;
  let totalGrossMinusRefundsRevenue = 0;
  let cancelledOrders = 0;
  let refundedOrders = 0;
  let testOrders = 0;
  for (const date of input.dates) {
    dailyRevenue.set(date, 0);
    dailyPurchases.set(date, 0);
  }
  for (const date of diagnosticDates) {
    diagnosticCreatedShopRevenue.set(date, 0);
    diagnosticCreatedBusinessRevenue.set(date, 0);
    diagnosticProcessedShopRevenue.set(date, 0);
  }

  const orderWindow = resolveShopLocalWindow({
    startDate: expandedStartDate,
    endDate: expandedEndDate,
    timeZone: input.timeZone,
  });
  const ordersQuery = `created_at:>=${orderWindow.startIso} created_at:<=${orderWindow.endIso} status:any test:false`;
  let cursor: string | null = null;
  let pageCount = 0;

  while (pageCount < SHOPIFY_ORDER_PAGE_LIMIT) {
    pageCount += 1;
    const payload: ShopifyOrdersPagePayload = await shopifyAdminGraphql<ShopifyOrdersPagePayload>({
      shopId: input.shopId,
      accessToken: input.accessToken,
      query,
      variables: {
        query: ordersQuery,
        cursor,
      },
    });

    const edges = Array.isArray(payload.orders?.edges) ? payload.orders.edges : [];
    for (const edge of edges) {
      const node = edge.node;
      if (node?.test) testOrders += 1;
      if (node?.cancelledAt) cancelledOrders += 1;
      if ((toNumber(node?.totalRefundedSet?.shopMoney?.amount) ?? 0) > 0) refundedOrders += 1;

      const currentTotalRevenue = toNumber(node?.currentTotalPriceSet?.shopMoney?.amount);
      const preReturnRevenue = toNumber(node?.totalPriceSet?.shopMoney?.amount);
      const grossMinusRefundsRevenue = round2(
        toNumber(node?.totalPriceSet?.shopMoney?.amount) -
          toNumber(node?.totalRefundedSet?.shopMoney?.amount)
      );
      totalCurrentRevenue += currentTotalRevenue;
      totalGrossMinusRefundsRevenue += grossMinusRefundsRevenue;

      const createdShopDate =
        typeof node?.createdAt === "string"
          ? toTimeZoneIsoDate(node.createdAt, input.timeZone)
          : null;
      const createdBusinessDate =
        typeof node?.createdAt === "string"
          ? toTimeZoneIsoDate(node.createdAt, input.businessTimeZone)
          : null;
      const processedShopDate =
        typeof node?.processedAt === "string"
          ? toTimeZoneIsoDate(node.processedAt, input.timeZone)
          : null;

      if (createdShopDate && diagnosticCreatedShopRevenue.has(createdShopDate)) {
        diagnosticCreatedShopRevenue.set(
          createdShopDate,
          round2((diagnosticCreatedShopRevenue.get(createdShopDate) ?? 0) + preReturnRevenue)
        );
      }
      if (createdBusinessDate && diagnosticCreatedBusinessRevenue.has(createdBusinessDate)) {
        diagnosticCreatedBusinessRevenue.set(
          createdBusinessDate,
          round2((diagnosticCreatedBusinessRevenue.get(createdBusinessDate) ?? 0) + preReturnRevenue)
        );
      }
      if (processedShopDate && diagnosticProcessedShopRevenue.has(processedShopDate)) {
        diagnosticProcessedShopRevenue.set(
          processedShopDate,
          round2((diagnosticProcessedShopRevenue.get(processedShopDate) ?? 0) + preReturnRevenue)
        );
      }

      if (!createdShopDate || !dailyRevenue.has(createdShopDate) || !dailyPurchases.has(createdShopDate)) continue;

      dailyRevenue.set(
        createdShopDate,
        round2((dailyRevenue.get(createdShopDate) ?? 0) + preReturnRevenue)
      );
      dailyPurchases.set(createdShopDate, (dailyPurchases.get(createdShopDate) ?? 0) + 1);
    }

    const pageInfo = payload.orders?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
      break;
    }
    cursor = pageInfo.endCursor;
  }

  if (cursor && pageCount >= SHOPIFY_ORDER_PAGE_LIMIT) {
    console.warn("[shopify-overview] orders_page_limit_reached", {
      shopId: input.shopId,
      startDate: input.startDate,
      endDate: input.endDate,
      pageLimit: SHOPIFY_ORDER_PAGE_LIMIT,
    });
    return {
      success: false,
      revenue: null,
      purchases: null,
      byDate: new Map<string, { revenue: number | null; purchases: number | null }>(),
    };
  }

  let revenue = 0;
  let purchases = 0;

  const byDate = new Map<string, { revenue: number; purchases: number }>();
  for (const date of input.dates) {
    const dayRevenue = round2(dailyRevenue.get(date) ?? 0);
    const dayPurchases = dailyPurchases.get(date) ?? 0;
    revenue += dayRevenue;
    purchases += dayPurchases;
    byDate.set(date, {
      revenue: dayRevenue,
      purchases: dayPurchases,
    });
  }

  const currentRevenueRounded = round2(totalCurrentRevenue);
  const preReturnRevenueRounded = round2(revenue);
  const grossMinusRefundsRounded = round2(totalGrossMinusRefundsRevenue);
  const shopDateBasis = input.timeZone ?? "UTC";
  const businessDateBasis = input.businessTimeZone ?? "UTC";
  const leakageDiagnostic = diagnosticDates.map((date) => ({
    date,
    createdShopRevenue: round2(diagnosticCreatedShopRevenue.get(date) ?? 0),
    createdBusinessRevenue: round2(diagnosticCreatedBusinessRevenue.get(date) ?? 0),
    processedShopRevenue: round2(diagnosticProcessedShopRevenue.get(date) ?? 0),
  }));
  const selectedAndAdjacentDays = leakageDiagnostic.filter(
    (row) => row.date >= expandedStartDate && row.date <= expandedEndDate
  );
  if (
    Math.abs(currentRevenueRounded - preReturnRevenueRounded) >= 0.01 ||
    Math.abs(preReturnRevenueRounded - grossMinusRefundsRounded) >= 0.01
  ) {
    console.info("[shopify-overview] revenue_semantic_delta", {
      shopId: input.shopId,
      startDate: input.startDate,
      endDate: input.endDate,
      revenueBasis: "created_at",
      bucketBasis: "created_at",
      timezoneBasis: shopDateBasis,
      currentRevenue: currentRevenueRounded,
      preReturnRevenue: preReturnRevenueRounded,
      grossMinusRefundsRevenue: grossMinusRefundsRounded,
      currentVsPreReturnDelta: round2(currentRevenueRounded - preReturnRevenueRounded),
      preReturnVsGrossMinusRefundsDelta: round2(preReturnRevenueRounded - grossMinusRefundsRounded),
      cancelledOrders,
      refundedOrders,
      testOrders,
    });
  }

  const hasAdjacentLeakageSignal = selectedAndAdjacentDays.some((row) => {
    return (
      Math.abs(row.createdShopRevenue - row.createdBusinessRevenue) >= 0.01 ||
      Math.abs(row.createdShopRevenue - row.processedShopRevenue) >= 0.01
    );
  });
  if (hasAdjacentLeakageSignal) {
    console.info("[shopify-overview] daily_attribution_shadow", {
      shopId: input.shopId,
      startDate: input.startDate,
      endDate: input.endDate,
      publicRevenueBasis: "created_at",
      publicTimezoneBasis: shopDateBasis,
      businessTimezoneBasis: businessDateBasis,
      days: selectedAndAdjacentDays,
    });
  }

  return {
    success: true,
    revenue: round2(revenue),
    purchases: Math.round(purchases),
    byDate,
  };
}

export async function getShopifyOverviewAggregate(params: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<ShopifyOverviewAggregate | null> {
  const integration = await getIntegration(params.businessId, "shopify");
  if (
    !integration ||
    integration.status !== "connected" ||
    !integration.provider_account_id ||
    !integration.access_token
  ) {
    return null;
  }

  const canReadOrders =
    hasScope(integration.scopes, "read_orders") || hasScope(integration.scopes, "read_all_orders");

  if (!canReadOrders) {
    console.warn("[shopify-overview] missing_read_orders_scope", {
      businessId: params.businessId,
      shopId: integration.provider_account_id,
    });
    return null;
  }

  const dateRangeKey = getReportingDateRangeKey(params.startDate, params.endDate);
  const cached = await getCachedReport<ShopifyOverviewAggregate>({
    businessId: params.businessId,
    provider: "shopify",
    reportType: SHOPIFY_OVERVIEW_REPORT_TYPE,
    dateRangeKey,
    maxAgeMinutes: SHOPIFY_OVERVIEW_CACHE_TTL_MINUTES,
  });
  if (cached) return cached;

  const dates = enumerateDays(params.startDate, params.endDate);
  const trendsByDate = new Map<
    string,
    {
      revenue: number;
      purchases: number;
      sessions: number | null;
      newCustomers: number | null;
      returningCustomers: number | null;
    }
  >();
  for (const date of dates) {
    trendsByDate.set(date, {
      revenue: 0,
      purchases: 0,
      sessions: null,
      newCustomers: null,
      returningCustomers: null,
    });
  }

  let revenue = 0;
  let purchases = 0;
  let sessions: number | null = null;
  let newCustomers: number | null = null;
  let returningCustomers: number | null = null;
  let hasCommerceMetrics = false;
  const businessTimeZone = await getBusinessTimezone(params.businessId).catch(() => null);
  try {
    const commerceMetrics = await getShopifyOrderCommerceMetrics({
      shopId: integration.provider_account_id,
      accessToken: integration.access_token,
      startDate: params.startDate,
      endDate: params.endDate,
      dates,
      timeZone:
        typeof integration.metadata?.iana_timezone === "string"
          ? integration.metadata.iana_timezone
          : null,
      businessTimeZone,
    });
    if (commerceMetrics.success && commerceMetrics.revenue !== null && commerceMetrics.purchases !== null) {
      hasCommerceMetrics = true;
      revenue = commerceMetrics.revenue;
      purchases = commerceMetrics.purchases;
    }
    for (const [date, metrics] of commerceMetrics.byDate.entries()) {
      const totals = trendsByDate.get(date);
      if (!totals) continue;
      totals.revenue = round2(metrics.revenue ?? 0);
      totals.purchases = Math.round(metrics.purchases ?? 0);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[shopify-overview] commerce_metrics_request_failed", {
      businessId: params.businessId,
      shopId: integration.provider_account_id,
      startDate: params.startDate,
      endDate: params.endDate,
      message,
    });
  }

  if (!hasCommerceMetrics) {
    return null;
  }

  const conversionRate =
    sessions !== null && sessions > 0 ? round2((purchases / sessions) * 100) : null;

  const payload: ShopifyOverviewAggregate = {
    revenue: round2(revenue),
    purchases: Math.round(purchases),
    averageOrderValue: purchases > 0 ? round2(revenue / purchases) : null,
    grossRevenue: null,
    refundedRevenue: null,
    returnEvents: null,
    sessions,
    conversionRate,
    newCustomers,
    returningCustomers,
    dailyTrends: Array.from(trendsByDate.entries()).map(([date, totals]) => ({
      date,
      revenue: round2(totals.revenue),
      purchases: Math.round(totals.purchases),
      grossRevenue: null,
      refundedRevenue: null,
      returnEvents: null,
      sessions: totals.sessions,
      conversionRate:
        totals.sessions !== null && totals.sessions > 0
          ? round2((totals.purchases / totals.sessions) * 100)
          : null,
      newCustomers: totals.newCustomers,
      returningCustomers: totals.returningCustomers,
    })),
  };

  await setCachedReport({
    businessId: params.businessId,
    provider: "shopify",
    reportType: SHOPIFY_OVERVIEW_REPORT_TYPE,
    dateRangeKey,
    payload,
  });

  return payload;
}
