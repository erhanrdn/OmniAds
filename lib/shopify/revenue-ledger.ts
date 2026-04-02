import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import type { ShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface ShopifyRevenueLedgerDailyAggregate {
  date: string;
  orderRevenue: number;
  refundedRevenue: number;
  netRevenue: number;
  orders: number;
  returnEvents: number;
  orderEventCount: number;
  adjustmentEventCount: number;
  refundEventCount: number;
  adjustmentRevenue: number;
  refundPressure: number;
  dailySemanticDrift: number;
}

export interface ShopifyRevenueLedgerAggregate extends ShopifyWarehouseOverviewAggregate {
  ledgerRows: number;
  orderEventCount: number;
  adjustmentEventCount: number;
  refundEventCount: number;
  adjustmentRevenue: number;
  refundPressure: number;
  dailySemanticDrift: number;
  daily: ShopifyRevenueLedgerDailyAggregate[];
}

export async function getShopifyRevenueLedgerAggregate(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT
      COALESCE(occurred_date_local, occurred_at::date)::text AS date,
      COALESCE(SUM(gross_sales), 0) AS gross_revenue,
      COALESCE(SUM(refunded_sales + refunded_shipping + refunded_taxes), 0) AS refunded_revenue,
      COALESCE(SUM(net_revenue), 0) AS net_revenue,
      COUNT(*) FILTER (WHERE source_kind = 'order') AS orders,
      COUNT(*) FILTER (WHERE source_kind = 'return') AS return_events,
      COUNT(*) FILTER (WHERE source_kind = 'order') AS order_event_count,
      COUNT(*) FILTER (WHERE source_kind = 'adjustment') AS adjustment_event_count,
      COUNT(*) FILTER (WHERE source_kind = 'refund') AS refund_event_count,
      COALESCE(SUM(CASE WHEN source_kind = 'adjustment' THEN net_revenue ELSE 0 END), 0) AS adjustment_revenue
    FROM shopify_sales_events
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND COALESCE(occurred_date_local, occurred_at::date) >= ${input.startDate}::date
      AND COALESCE(occurred_date_local, occurred_at::date) <= ${input.endDate}::date
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<Record<string, unknown>>;

  const daily = rows.map((row) => {
    const orderRevenue = round2(toNumber(row.gross_revenue));
    const refundedRevenue = round2(toNumber(row.refunded_revenue));
    const netRevenue = round2(toNumber(row.net_revenue));
    const adjustmentRevenue = round2(toNumber(row.adjustment_revenue));
    const refundPressure = refundedRevenue;
    const dailySemanticDrift = round2(Math.abs(adjustmentRevenue) + refundPressure);

    return {
      date: String(row.date ?? ""),
      orderRevenue,
      refundedRevenue,
      netRevenue,
      orders: Math.trunc(toNumber(row.orders)),
      returnEvents: Math.trunc(toNumber(row.return_events)),
      orderEventCount: Math.trunc(toNumber(row.order_event_count)),
      adjustmentEventCount: Math.trunc(toNumber(row.adjustment_event_count)),
      refundEventCount: Math.trunc(toNumber(row.refund_event_count)),
      adjustmentRevenue,
      refundPressure,
      dailySemanticDrift,
    } satisfies ShopifyRevenueLedgerDailyAggregate;
  });

  const revenue = round2(daily.reduce((sum, row) => sum + row.netRevenue, 0));
  const grossRevenue = round2(daily.reduce((sum, row) => sum + row.orderRevenue, 0));
  const refundedRevenue = round2(daily.reduce((sum, row) => sum + row.refundedRevenue, 0));
  const purchases = daily.reduce((sum, row) => sum + row.orders, 0);
  const returnEvents = daily.reduce((sum, row) => sum + row.returnEvents, 0);
  const orderEventCount = daily.reduce((sum, row) => sum + row.orderEventCount, 0);
  const adjustmentEventCount = daily.reduce((sum, row) => sum + row.adjustmentEventCount, 0);
  const refundEventCount = daily.reduce((sum, row) => sum + row.refundEventCount, 0);
  const adjustmentRevenue = round2(daily.reduce((sum, row) => sum + row.adjustmentRevenue, 0));
  const refundPressure = round2(daily.reduce((sum, row) => sum + row.refundPressure, 0));
  const dailySemanticDrift = round2(daily.reduce((sum, row) => sum + row.dailySemanticDrift, 0));

  return {
    revenue,
    grossRevenue,
    refundedRevenue,
    purchases,
    returnEvents,
    averageOrderValue: purchases > 0 ? round2(revenue / purchases) : null,
    daily,
    ledgerRows: rows.length,
    orderEventCount,
    adjustmentEventCount,
    refundEventCount,
    adjustmentRevenue,
    refundPressure,
    dailySemanticDrift,
  } satisfies ShopifyRevenueLedgerAggregate;
}
