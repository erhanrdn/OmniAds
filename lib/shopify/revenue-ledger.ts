import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
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
  currentOrderRevenue: number | null;
  grossMinusRefundsOrderRevenue: number | null;
  transactionCapturedRevenue: number | null;
  transactionRefundedRevenue: number | null;
  transactionNetRevenue: number | null;
  transactionCoveredOrders: number;
  transactionCoveredRevenue: number | null;
  transactionCoverageRate: number | null;
  transactionCoverageAmountRate: number | null;
  daily: ShopifyRevenueLedgerDailyAggregate[];
}

export async function getShopifyRevenueLedgerAggregate(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  const readiness = await getDbSchemaReadiness({
    tables: ["shopify_sales_events", "shopify_orders", "shopify_order_transactions"],
  }).catch(() => null);
  if (!readiness?.ready) {
    return {
      revenue: 0,
      grossRevenue: 0,
      refundedRevenue: 0,
      purchases: 0,
      returnEvents: 0,
      averageOrderValue: null,
      daily: [],
      ledgerRows: 0,
      orderEventCount: 0,
      adjustmentEventCount: 0,
      refundEventCount: 0,
      adjustmentRevenue: 0,
      refundPressure: 0,
      dailySemanticDrift: 0,
      currentOrderRevenue: null,
      grossMinusRefundsOrderRevenue: null,
      transactionCapturedRevenue: null,
      transactionRefundedRevenue: null,
      transactionNetRevenue: null,
      transactionCoveredOrders: 0,
      transactionCoveredRevenue: null,
      transactionCoverageRate: null,
      transactionCoverageAmountRate: null,
    } satisfies ShopifyRevenueLedgerAggregate;
  }
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
  const [orderBasisRow] = (await sql`
    SELECT
      COALESCE(
        SUM(COALESCE(current_total_price, total_price, original_total_price)),
        0
      ) AS current_order_revenue,
      COALESCE(
        SUM(COALESCE(total_price, original_total_price, current_total_price)),
        0
      ) AS gross_order_revenue,
      COALESCE(SUM(COALESCE(total_refunded, 0)), 0) AS total_refunded,
      COUNT(*) AS order_count
    FROM shopify_orders
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND COALESCE(order_created_date_local, order_created_at::date) >= ${input.startDate}::date
      AND COALESCE(order_created_date_local, order_created_at::date) <= ${input.endDate}::date
  `) as Array<Record<string, unknown>>;
  const [transactionBasisRow] = (await sql`
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN lower(COALESCE(tx.kind, '')) IN ('sale', 'capture')
              AND lower(COALESCE(tx.status, 'success')) NOT IN ('failure', 'failed', 'error')
            THEN tx.amount
            ELSE 0
          END
        ),
        0
      ) AS captured_revenue,
      COALESCE(
        SUM(
          CASE
            WHEN lower(COALESCE(tx.kind, '')) = 'refund'
              AND lower(COALESCE(tx.status, 'success')) NOT IN ('failure', 'failed', 'error')
            THEN tx.amount
            ELSE 0
          END
        ),
        0
      ) AS refunded_revenue,
      COUNT(DISTINCT tx.order_id) FILTER (
        WHERE lower(COALESCE(tx.kind, '')) IN ('sale', 'capture', 'refund')
          AND lower(COALESCE(tx.status, 'success')) NOT IN ('failure', 'failed', 'error')
      ) AS covered_orders
    FROM shopify_order_transactions tx
    INNER JOIN shopify_orders orders
      ON orders.business_id = tx.business_id
      AND orders.provider_account_id = tx.provider_account_id
      AND orders.shop_id = tx.shop_id
      AND orders.order_id = tx.order_id
    WHERE tx.business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR tx.provider_account_id = ${input.providerAccountId ?? null})
      AND COALESCE(orders.order_created_date_local, orders.order_created_at::date) >= ${input.startDate}::date
      AND COALESCE(orders.order_created_date_local, orders.order_created_at::date) <= ${input.endDate}::date
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
  const orderCount = Math.trunc(toNumber(orderBasisRow?.order_count));
  const currentOrderRevenue = round2(toNumber(orderBasisRow?.current_order_revenue));
  const grossOrderRevenue = round2(toNumber(orderBasisRow?.gross_order_revenue));
  const totalRefundedFromOrders = round2(toNumber(orderBasisRow?.total_refunded));
  const grossMinusRefundsOrderRevenue = round2(grossOrderRevenue - totalRefundedFromOrders);
  const transactionCapturedRevenue = round2(toNumber(transactionBasisRow?.captured_revenue));
  const transactionRefundedRevenue = round2(toNumber(transactionBasisRow?.refunded_revenue));
  const transactionNetRevenue = round2(transactionCapturedRevenue - transactionRefundedRevenue);
  const transactionCoveredOrders = Math.trunc(toNumber(transactionBasisRow?.covered_orders));
  const transactionCoveredRevenue = transactionCoveredOrders > 0 ? transactionCapturedRevenue : null;
  const transactionCoverageRate =
    orderCount > 0 ? round2((transactionCoveredOrders / orderCount) * 100) : null;
  const transactionCoverageAmountRate =
    grossOrderRevenue > 0 && transactionCoveredRevenue !== null
      ? round2((Math.abs(transactionCoveredRevenue) / grossOrderRevenue) * 100)
      : null;

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
    currentOrderRevenue: orderCount > 0 ? currentOrderRevenue : null,
    grossMinusRefundsOrderRevenue: orderCount > 0 ? grossMinusRefundsOrderRevenue : null,
    transactionCapturedRevenue: transactionCoveredOrders > 0 ? transactionCapturedRevenue : null,
    transactionRefundedRevenue: transactionCoveredOrders > 0 ? transactionRefundedRevenue : null,
    transactionNetRevenue: transactionCoveredOrders > 0 ? transactionNetRevenue : null,
    transactionCoveredOrders,
    transactionCoveredRevenue,
    transactionCoverageRate,
    transactionCoverageAmountRate,
  } satisfies ShopifyRevenueLedgerAggregate;
}
