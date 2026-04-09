import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { measurePerf } from "@/lib/perf";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface ShopifyWarehouseDailyAggregate {
  date: string;
  orderRevenue: number;
  refundedRevenue: number;
  netRevenue: number;
  orders: number;
  returnEvents: number;
}

export interface ShopifyWarehouseOverviewAggregate {
  revenue: number;
  grossRevenue: number;
  refundedRevenue: number;
  purchases: number;
  returnEvents: number;
  averageOrderValue: number | null;
  daily: ShopifyWarehouseDailyAggregate[];
}

export function summarizeShopifyWarehouseDailyRows(rows: ShopifyWarehouseDailyAggregate[]) {
  const totalGrossRevenue = round2(rows.reduce((sum, row) => sum + row.orderRevenue, 0));
  const totalRefundedRevenue = round2(rows.reduce((sum, row) => sum + row.refundedRevenue, 0));
  const purchases = rows.reduce((sum, row) => sum + row.orders, 0);
  const returnEvents = rows.reduce((sum, row) => sum + row.returnEvents, 0);
  const revenue = round2(totalGrossRevenue - totalRefundedRevenue);
  return {
    revenue,
    grossRevenue: totalGrossRevenue,
    refundedRevenue: totalRefundedRevenue,
    purchases,
    returnEvents,
    averageOrderValue: purchases > 0 ? round2(totalGrossRevenue / purchases) : null,
    daily: rows.map((row) => ({
      ...row,
      orderRevenue: round2(row.orderRevenue),
      refundedRevenue: round2(row.refundedRevenue),
      netRevenue: round2(row.orderRevenue - row.refundedRevenue),
    })),
  } satisfies ShopifyWarehouseOverviewAggregate;
}

export async function getShopifyWarehouseOverviewAggregate(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  const readiness = await getDbSchemaReadiness({
    tables: ["shopify_orders", "shopify_refunds", "shopify_returns"],
  }).catch(() => null);
  if (!readiness?.ready) {
    return summarizeShopifyWarehouseDailyRows([]);
  }
  const sql = getDb();
  const providerAccountId = input.providerAccountId ?? null;
  const [orderRows, refundRows, returnRows] = await measurePerf(
    "shopify_warehouse_overview_read",
    {
      businessId: input.businessId,
      providerAccountId,
      startDate: input.startDate,
      endDate: input.endDate,
      dateSpanDays:
        Math.floor(
          (new Date(`${input.endDate}T00:00:00Z`).getTime() -
            new Date(`${input.startDate}T00:00:00Z`).getTime()) /
            86_400_000,
        ) + 1,
    },
    async () =>
      Promise.all([
        sql.query(
          `
            SELECT
              CASE
                WHEN order_created_date_local IS NOT NULL THEN order_created_date_local::text
                ELSE order_created_at::date::text
              END AS date,
              COALESCE(SUM(total_price), 0) AS order_revenue,
              COUNT(*) AS orders
            FROM shopify_orders
            WHERE business_id = $1
              AND ($2::text IS NULL OR provider_account_id = $2)
              AND (
                (order_created_date_local IS NOT NULL
                  AND order_created_date_local >= $3::date
                  AND order_created_date_local <= $4::date)
                OR
                (order_created_date_local IS NULL
                  AND order_created_at::date >= $3::date
                  AND order_created_at::date <= $4::date)
              )
            GROUP BY 1
            ORDER BY 1 ASC
          `,
          [input.businessId, providerAccountId, input.startDate, input.endDate],
        ) as Promise<Array<Record<string, unknown>>>,
        sql.query(
          `
            SELECT
              CASE
                WHEN refunded_date_local IS NOT NULL THEN refunded_date_local::text
                ELSE refunded_at::date::text
              END AS date,
              COALESCE(SUM(refunded_sales + refunded_shipping + refunded_taxes), 0) AS refunded_revenue
            FROM shopify_refunds
            WHERE business_id = $1
              AND ($2::text IS NULL OR provider_account_id = $2)
              AND (
                (refunded_date_local IS NOT NULL
                  AND refunded_date_local >= $3::date
                  AND refunded_date_local <= $4::date)
                OR
                (refunded_date_local IS NULL
                  AND refunded_at::date >= $3::date
                  AND refunded_at::date <= $4::date)
              )
            GROUP BY 1
            ORDER BY 1 ASC
          `,
          [input.businessId, providerAccountId, input.startDate, input.endDate],
        ) as Promise<Array<Record<string, unknown>>>,
        sql.query(
          `
            SELECT
              CASE
                WHEN created_date_local IS NOT NULL THEN created_date_local::text
                ELSE created_at_provider::date::text
              END AS date,
              COUNT(*) AS return_events
            FROM shopify_returns
            WHERE business_id = $1
              AND ($2::text IS NULL OR provider_account_id = $2)
              AND (
                (created_date_local IS NOT NULL
                  AND created_date_local >= $3::date
                  AND created_date_local <= $4::date)
                OR
                (created_date_local IS NULL
                  AND created_at_provider::date >= $3::date
                  AND created_at_provider::date <= $4::date)
              )
            GROUP BY 1
            ORDER BY 1 ASC
          `,
          [input.businessId, providerAccountId, input.startDate, input.endDate],
        ) as Promise<Array<Record<string, unknown>>>,
      ]),
  );

  const byDate = new Map<string, ShopifyWarehouseDailyAggregate>();
  for (const row of orderRows) {
    const date = String(row.date ?? "");
    if (!date) continue;
    byDate.set(date, {
      date,
      orderRevenue: toNumber(row.order_revenue),
      refundedRevenue: 0,
      netRevenue: 0,
      orders: Math.trunc(toNumber(row.orders)),
      returnEvents: 0,
    });
  }

  for (const row of refundRows) {
    const date = String(row.date ?? "");
    if (!date) continue;
    const existing = byDate.get(date) ?? {
      date,
      orderRevenue: 0,
      refundedRevenue: 0,
      netRevenue: 0,
      orders: 0,
      returnEvents: 0,
    };
    existing.refundedRevenue = toNumber(row.refunded_revenue);
    byDate.set(date, existing);
  }

  for (const row of returnRows) {
    const date = String(row.date ?? "");
    if (!date) continue;
    const existing = byDate.get(date) ?? {
      date,
      orderRevenue: 0,
      refundedRevenue: 0,
      netRevenue: 0,
      orders: 0,
      returnEvents: 0,
    };
    existing.returnEvents = Math.trunc(toNumber(row.return_events));
    byDate.set(date, existing);
  }

  const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return summarizeShopifyWarehouseDailyRows(daily);
}
