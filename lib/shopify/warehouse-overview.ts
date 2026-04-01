import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

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
  await runMigrations();
  const sql = getDb();
  const orderRows = (await sql`
    SELECT
      order_created_at::date::text AS date,
      COALESCE(SUM(total_price), 0) AS order_revenue,
      COUNT(*) AS orders
    FROM shopify_orders
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND order_created_at::date >= ${input.startDate}::date
      AND order_created_at::date <= ${input.endDate}::date
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<Record<string, unknown>>;

  const refundRows = (await sql`
    SELECT
      refunded_at::date::text AS date,
      COALESCE(SUM(refunded_sales + refunded_shipping + refunded_taxes), 0) AS refunded_revenue
    FROM shopify_refunds
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND refunded_at::date >= ${input.startDate}::date
      AND refunded_at::date <= ${input.endDate}::date
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<Record<string, unknown>>;
  const returnRows = (await sql`
    SELECT
      created_at_provider::date::text AS date,
      COUNT(*) AS return_events
    FROM shopify_returns
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND created_at_provider::date >= ${input.startDate}::date
      AND created_at_provider::date <= ${input.endDate}::date
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<Record<string, unknown>>;

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

  return summarizeShopifyWarehouseDailyRows(
    [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  );
}
