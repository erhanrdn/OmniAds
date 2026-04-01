import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { summarizeShopifyWarehouseDailyRows, type ShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
      COUNT(*) FILTER (WHERE source_kind = 'return') AS return_events
    FROM shopify_sales_events
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND COALESCE(occurred_date_local, occurred_at::date) >= ${input.startDate}::date
      AND COALESCE(occurred_date_local, occurred_at::date) <= ${input.endDate}::date
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<Record<string, unknown>>;

  const aggregate = summarizeShopifyWarehouseDailyRows(
    rows.map((row) => ({
      date: String(row.date ?? ""),
      orderRevenue: toNumber(row.gross_revenue),
      refundedRevenue: toNumber(row.refunded_revenue),
      netRevenue: toNumber(row.net_revenue),
      orders: Math.trunc(toNumber(row.orders)),
      returnEvents: Math.trunc(toNumber(row.return_events)),
    }))
  );

  return {
    ...aggregate,
    ledgerRows: rows.length,
  } satisfies ShopifyWarehouseOverviewAggregate & { ledgerRows: number };
}
