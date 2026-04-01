import { getIntegration } from "@/lib/integrations";
import { enumerateDays, round2 } from "@/lib/overview-service-support";
import { getCachedReport, getReportingDateRangeKey, setCachedReport } from "@/lib/reporting-cache";

const SHOPIFY_OVERVIEW_CACHE_TTL_MINUTES = 15;
const SHOPIFY_ANALYTICS_API_VERSION = process.env.SHOPIFY_ANALYTICS_API_VERSION ?? "2025-10";
const SHOPIFY_OVERVIEW_REPORT_TYPE = "overview_shopifyql_aggregate_v2";
const SHOPIFY_ORDER_PAGE_SIZE = 250;
const SHOPIFY_ORDER_PAGE_LIMIT = 40;

interface ShopifyqlTableDataColumn {
  name?: string | null;
  dataType?: string | null;
  displayName?: string | null;
}

interface ShopifyqlTableData {
  columns?: ShopifyqlTableDataColumn[] | null;
  rows?: unknown;
}

interface ShopifyqlQueryPayload {
  shopifyqlQuery?: {
    parseErrors?: string[] | null;
    tableData?: ShopifyqlTableData | null;
  } | null;
}

export interface ShopifyOverviewAggregate {
  revenue: number;
  purchases: number;
  averageOrderValue: number | null;
  sessions: number | null;
  conversionRate: number | null;
  newCustomers: number | null;
  returningCustomers: number | null;
  dailyTrends: Array<{
    date: string;
    revenue: number;
    purchases: number;
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

function buildShopifyqlDateLiteral(date: string) {
  return date;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeTableRows(tableData: ShopifyqlTableData | null | undefined) {
  const columns = Array.isArray(tableData?.columns) ? tableData.columns : [];
  const columnNames = columns.map((column) => column.name?.trim() ?? "");
  const rows = tableData?.rows;

  if (!Array.isArray(rows)) return [] as Array<Record<string, unknown>>;

  return rows
    .map((row) => {
      if (Array.isArray(row)) {
        return Object.fromEntries(
          columnNames.map((name, index) => [name || `col_${index}`, row[index] ?? null])
        );
      }
      if (row && typeof row === "object") {
        return row as Record<string, unknown>;
      }
      return null;
    })
    .filter((row): row is Record<string, unknown> => Boolean(row));
}

async function shopifyAnalyticsQuery(input: {
  shopId: string;
  accessToken: string;
  query: string;
}): Promise<ShopifyqlQueryPayload["shopifyqlQuery"] | null> {
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
        query: `
          query ShopifyOverviewQuery($query: String!) {
            shopifyqlQuery(query: $query) {
              parseErrors
              tableData {
                columns {
                  name
                  dataType
                  displayName
                }
                rows
              }
            }
          }
        `,
        variables: { query: input.query },
      }),
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShopifyqlQueryPayload;
        errors?: Array<{ message?: string; extensions?: { code?: string; requiredAccess?: string } }>;
      }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.errors?.[0]?.message ??
        `Shopify analytics query failed (${response.status}).`
    );
  }

  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "Shopify analytics query failed.");
  }

  return payload?.data?.shopifyqlQuery ?? null;
}

interface ShopifyAdminGraphqlOrderEdge {
  node?: {
    createdAt?: string | null;
    currentTotalPriceSet?: {
      shopMoney?: {
        amount?: string | null;
      } | null;
    } | null;
    customer?: { id?: string | null } | null;
    customerJourneySummary?: {
      customerOrderIndex?: number | null;
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

async function getShopifyOrderMetrics(input: {
  shopId: string;
  accessToken: string;
  startDate: string;
  endDate: string;
  dates: string[];
}) {
  const query = `
    query ShopifyOverviewOrders($query: String!, $cursor: String) {
      orders(first: ${SHOPIFY_ORDER_PAGE_SIZE}, after: $cursor, sortKey: CREATED_AT, query: $query) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            createdAt
            currentTotalPriceSet {
              shopMoney {
                amount
              }
            }
            customer {
              id
            }
            customerJourneySummary {
              customerOrderIndex
            }
          }
        }
      }
    }
  `;

  const customerMinIndex = new Map<string, number>();
  const dailyNewCustomers = new Map<string, Set<string>>();
  const dailyReturningCustomers = new Map<string, Set<string>>();
  const dailyRevenue = new Map<string, number>();
  const dailyPurchases = new Map<string, number>();
  for (const date of input.dates) {
    dailyNewCustomers.set(date, new Set());
    dailyReturningCustomers.set(date, new Set());
    dailyRevenue.set(date, 0);
    dailyPurchases.set(date, 0);
  }

  const ordersQuery = `created_at:>=${input.startDate}T00:00:00Z created_at:<=${input.endDate}T23:59:59Z status:any`;
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
      const date = normalizeDate(node?.createdAt);
      if (!date || !dailyRevenue.has(date) || !dailyPurchases.has(date)) continue;

      dailyRevenue.set(
        date,
        round2((dailyRevenue.get(date) ?? 0) + toNumber(node?.currentTotalPriceSet?.shopMoney?.amount))
      );
      dailyPurchases.set(date, (dailyPurchases.get(date) ?? 0) + 1);

      const customerId = node?.customer?.id?.trim();
      const orderIndex = node?.customerJourneySummary?.customerOrderIndex;
      if (!customerId) continue;
      if (typeof orderIndex !== "number" || !Number.isFinite(orderIndex) || orderIndex < 1) continue;

      customerMinIndex.set(
        customerId,
        Math.min(customerMinIndex.get(customerId) ?? Number.POSITIVE_INFINITY, orderIndex)
      );

      if (orderIndex === 1) {
        dailyNewCustomers.get(date)!.add(customerId);
        dailyReturningCustomers.get(date)!.delete(customerId);
        continue;
      }

      if (!dailyNewCustomers.get(date)!.has(customerId)) {
        dailyReturningCustomers.get(date)!.add(customerId);
      }
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
      revenue: null,
      purchases: null,
      newCustomers: null,
      returningCustomers: null,
      byDate: new Map<
        string,
        {
          revenue: number | null;
          purchases: number | null;
          newCustomers: number | null;
          returningCustomers: number | null;
        }
      >(),
    };
  }

  let revenue = 0;
  let purchases = 0;
  let newCustomers = 0;
  let returningCustomers = 0;
  for (const minIndex of customerMinIndex.values()) {
    if (minIndex === 1) {
      newCustomers += 1;
    } else if (minIndex > 1) {
      returningCustomers += 1;
    }
  }

  const byDate = new Map<
    string,
    { revenue: number; purchases: number; newCustomers: number; returningCustomers: number }
  >();
  for (const date of input.dates) {
    const dayRevenue = round2(dailyRevenue.get(date) ?? 0);
    const dayPurchases = dailyPurchases.get(date) ?? 0;
    revenue += dayRevenue;
    purchases += dayPurchases;
    byDate.set(date, {
      revenue: dayRevenue,
      purchases: dayPurchases,
      newCustomers: dailyNewCustomers.get(date)?.size ?? 0,
      returningCustomers: dailyReturningCustomers.get(date)?.size ?? 0,
    });
  }

  return {
    revenue: round2(revenue),
    purchases: Math.round(purchases),
    newCustomers,
    returningCustomers,
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

  const canReadReports = hasScope(integration.scopes, "read_reports");
  const canReadOrders =
    hasScope(integration.scopes, "read_orders") || hasScope(integration.scopes, "read_all_orders");

  if (!canReadReports && !canReadOrders) {
    console.warn("[shopify-overview] missing_read_reports_scope", {
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

  const dailyQuery =
    "FROM sales " +
    "SHOW total_sales, orders " +
    `SINCE ${buildShopifyqlDateLiteral(params.startDate)} ` +
    `UNTIL ${buildShopifyqlDateLiteral(params.endDate)} ` +
    "GROUP BY day " +
    "ORDER BY day";
  const sessionsQuery =
    "FROM sessions " +
    "SHOW sessions " +
    `SINCE ${buildShopifyqlDateLiteral(params.startDate)} ` +
    `UNTIL ${buildShopifyqlDateLiteral(params.endDate)} ` +
    "GROUP BY day " +
    "ORDER BY day";

  let salesResponse: ShopifyqlQueryPayload["shopifyqlQuery"] | null = null;
  if (canReadReports) {
    try {
      salesResponse = await shopifyAnalyticsQuery({
        shopId: integration.provider_account_id,
        accessToken: integration.access_token,
        query: dailyQuery,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[shopify-overview] shopifyql_request_failed", {
        businessId: params.businessId,
        shopId: integration.provider_account_id,
        startDate: params.startDate,
        endDate: params.endDate,
        message,
      });
    }
  } else {
    console.warn("[shopify-overview] missing_read_reports_scope", {
      businessId: params.businessId,
      shopId: integration.provider_account_id,
    });
  }

  const rows = normalizeTableRows(salesResponse?.tableData);
  if (salesResponse?.parseErrors?.length) {
    console.warn("[shopify-overview] shopifyql_parse_error", {
      businessId: params.businessId,
      shopId: integration.provider_account_id,
      startDate: params.startDate,
      endDate: params.endDate,
      query: dailyQuery,
      parseErrors: salesResponse.parseErrors,
    });
  }

  const canUseShopifyQl = rows.length > 0;
  let sessionRows: Array<Record<string, unknown>> = [];
  if (canUseShopifyQl) {
    try {
      const sessionsResponse = await shopifyAnalyticsQuery({
        shopId: integration.provider_account_id,
        accessToken: integration.access_token,
        query: sessionsQuery,
      });
      if (sessionsResponse?.parseErrors?.length) {
        console.warn("[shopify-overview] shopifyql_sessions_parse_error", {
          businessId: params.businessId,
          shopId: integration.provider_account_id,
          startDate: params.startDate,
          endDate: params.endDate,
          query: sessionsQuery,
          parseErrors: sessionsResponse.parseErrors,
        });
      } else {
        sessionRows = normalizeTableRows(sessionsResponse?.tableData);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[shopify-overview] shopifyql_sessions_request_failed", {
        businessId: params.businessId,
        shopId: integration.provider_account_id,
        startDate: params.startDate,
        endDate: params.endDate,
        message,
      });
    }
  }

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

  for (const row of rows) {
    const date =
      normalizeDate(row.day) ??
      normalizeDate(row.date) ??
      normalizeDate(row.period) ??
      normalizeDate(row["Day"]);
    if (!date || !trendsByDate.has(date)) continue;

    const dayRevenue =
      toNumber(row.total_sales) ||
      toNumber(row.gross_sales) ||
      toNumber(row.net_sales) ||
      toNumber(row["Total sales"]);
    const dayOrders =
      toNumber(row.orders) ||
      toNumber(row.order_count) ||
      toNumber(row["Orders"]);

    const totals = trendsByDate.get(date)!;
    totals.revenue = round2(dayRevenue);
    totals.purchases = Math.round(dayOrders);

    revenue += dayRevenue;
    purchases += dayOrders;
  }

  let sessions: number | null = null;
  if (sessionRows.length > 0) {
    sessions = 0;
    for (const row of sessionRows) {
      const date =
        normalizeDate(row.day) ??
        normalizeDate(row.date) ??
        normalizeDate(row.period) ??
        normalizeDate(row["Day"]);
      if (!date || !trendsByDate.has(date)) continue;
      const daySessions = Math.round(
        toNumber(row.sessions) || toNumber(row.online_store_sessions) || toNumber(row["Sessions"])
      );
      const totals = trendsByDate.get(date)!;
      totals.sessions = daySessions;
      sessions += daySessions;
    }
  }

  let newCustomers: number | null = null;
  let returningCustomers: number | null = null;
  if (canReadOrders) {
    try {
      const orderMetrics = await getShopifyOrderMetrics({
        shopId: integration.provider_account_id,
        accessToken: integration.access_token,
        startDate: params.startDate,
        endDate: params.endDate,
        dates,
      });
      if (rows.length === 0 && orderMetrics.revenue !== null && orderMetrics.purchases !== null) {
        revenue = orderMetrics.revenue;
        purchases = orderMetrics.purchases;
      }
      newCustomers = orderMetrics.newCustomers;
      returningCustomers = orderMetrics.returningCustomers;
      for (const [date, metrics] of orderMetrics.byDate.entries()) {
        const totals = trendsByDate.get(date);
        if (!totals) continue;
        if (rows.length === 0 && metrics.revenue !== null && metrics.purchases !== null) {
          totals.revenue = round2(metrics.revenue);
          totals.purchases = Math.round(metrics.purchases);
        }
        totals.newCustomers = metrics.newCustomers;
        totals.returningCustomers = metrics.returningCustomers;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[shopify-overview] customer_metrics_request_failed", {
        businessId: params.businessId,
        shopId: integration.provider_account_id,
        startDate: params.startDate,
        endDate: params.endDate,
        message,
      });
    }
  }

  if (revenue <= 0 && purchases <= 0) {
    return null;
  }

  const conversionRate =
    sessions !== null && sessions > 0 ? round2((purchases / sessions) * 100) : null;

  const payload: ShopifyOverviewAggregate = {
    revenue: round2(revenue),
    purchases: Math.round(purchases),
    averageOrderValue: purchases > 0 ? round2(revenue / purchases) : null,
    sessions,
    conversionRate,
    newCustomers,
    returningCustomers,
    dailyTrends: Array.from(trendsByDate.entries()).map(([date, totals]) => ({
      date,
      revenue: round2(totals.revenue),
      purchases: Math.round(totals.purchases),
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
