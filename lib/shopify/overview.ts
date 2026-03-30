import { getIntegration } from "@/lib/integrations";
import { enumerateDays, round2 } from "@/lib/overview-service-support";
import { getCachedReport, getReportingDateRangeKey, setCachedReport } from "@/lib/reporting-cache";

const SHOPIFY_OVERVIEW_CACHE_TTL_MINUTES = 15;
const SHOPIFY_ANALYTICS_API_VERSION = process.env.SHOPIFY_ANALYTICS_API_VERSION ?? "2025-10";
const SHOPIFY_OVERVIEW_REPORT_TYPE = "overview_shopifyql_aggregate_v1";

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
  dailyTrends: Array<{
    date: string;
    revenue: number;
    purchases: number;
  }>;
}

function hasScope(scopes: string | null | undefined, scope: string) {
  return (scopes ?? "")
    .split(",")
    .map((entry) => entry.trim())
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

  if (!hasScope(integration.scopes, "read_reports")) {
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

  let response: ShopifyqlQueryPayload["shopifyqlQuery"] | null;
  try {
    response = await shopifyAnalyticsQuery({
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
    return null;
  }

  if (response?.parseErrors?.length) {
    console.warn("[shopify-overview] shopifyql_parse_error", {
      businessId: params.businessId,
      shopId: integration.provider_account_id,
      startDate: params.startDate,
      endDate: params.endDate,
      query: dailyQuery,
      parseErrors: response.parseErrors,
    });
    return null;
  }

  const rows = normalizeTableRows(response?.tableData);
  if (rows.length === 0) {
    return null;
  }

  const trendsByDate = new Map<string, { revenue: number; purchases: number }>();
  for (const date of enumerateDays(params.startDate, params.endDate)) {
    trendsByDate.set(date, { revenue: 0, purchases: 0 });
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

  if (revenue <= 0 && purchases <= 0) {
    return null;
  }

  const payload: ShopifyOverviewAggregate = {
    revenue: round2(revenue),
    purchases: Math.round(purchases),
    averageOrderValue: purchases > 0 ? round2(revenue / purchases) : null,
    dailyTrends: Array.from(trendsByDate.entries()).map(([date, totals]) => ({
      date,
      revenue: round2(totals.revenue),
      purchases: Math.round(totals.purchases),
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
