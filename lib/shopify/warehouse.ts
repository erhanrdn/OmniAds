import { createHash } from "node:crypto";

import { getDb } from "@/lib/db";
import { assertDbSchemaReady } from "@/lib/db-schema-readiness";
import type {
  ShopifyOrderTransactionWarehouseRow,
  ShopifyCustomerEventWarehouseRow,
  ShopifyOrderLineWarehouseRow,
  ShopifyOrderWarehouseRow,
  ShopifyRawSnapshotRecord,
  ShopifyRefundWarehouseRow,
  ShopifyRepairIntentRecord,
  ShopifyReconciliationRunRecord,
  ShopifyReturnWarehouseRow,
  ShopifySalesEventWarehouseRow,
  ShopifyServingStateRecord,
  ShopifyServingStateHistoryRecord,
  ShopifyServingOverrideRecord,
  ShopifyWebhookDeliveryRecord,
} from "@/lib/shopify/warehouse-types";

const SHOPIFY_WAREHOUSE_TABLES = [
  "shopify_raw_snapshots",
  "shopify_orders",
  "shopify_order_lines",
  "shopify_refunds",
  "shopify_order_transactions",
  "shopify_returns",
  "shopify_sales_events",
  "shopify_serving_overrides",
  "shopify_webhook_deliveries",
  "shopify_repair_intents",
  "shopify_reconciliation_runs",
  "shopify_customer_events",
  "shopify_serving_state",
  "shopify_serving_state_history",
] as const;

async function assertShopifyWarehouseTablesReady(context: string) {
  await assertDbSchemaReady({
    tables: [...SHOPIFY_WAREHOUSE_TABLES],
    context,
  });
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text.slice(0, 10);
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return text;
}

function normalizeServingProductionMode(value: unknown) {
  if (
    value === "disabled" ||
    value === "auto" ||
    value === "force_live" ||
    value === "force_warehouse"
  ) {
    return value;
  }
  return null;
}

function normalizeServingTrustState(value: unknown) {
  if (
    value === "trusted" ||
    value === "live_fallback" ||
    value === "pending_repair" ||
    value === "disabled" ||
    value === "no_data"
  ) {
    return value;
  }
  return null;
}

function normalizeServingCoverageStatus(value: unknown) {
  if (
    value === "recent_ready" ||
    value === "recent_only" ||
    value === "historical_incomplete" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function chunkRows<T>(rows: T[], size = 100) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function sanitizeRuntimeValidationSqlCommentValue(value: unknown, fallback = "na") {
  const text = String(value ?? "").trim();
  const cleaned = text.replace(/[^a-zA-Z0-9:_-]+/g, "_").slice(0, 80);
  return cleaned || fallback;
}

export function buildShopifyRawSnapshotHash(input: {
  businessId: string;
  providerAccountId: string;
  endpointName: string;
  startDate?: string | null;
  endDate?: string | null;
  payload: unknown;
}) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        endpointName: input.endpointName,
        startDate: normalizeDate(input.startDate),
        endDate: normalizeDate(input.endDate),
        payload: input.payload,
      })
    )
    .digest("hex");
}

export async function insertShopifyRawSnapshot(input: ShopifyRawSnapshotRecord) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:insert_raw_snapshot");
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO shopify_raw_snapshots (
      business_id,
      provider_account_id,
      endpoint_name,
      entity_scope,
      start_date,
      end_date,
      payload_json,
      payload_hash,
      request_context,
      response_headers,
      provider_http_status,
      status,
      fetched_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.endpointName},
      ${input.entityScope},
      ${normalizeDate(input.startDate)},
      ${normalizeDate(input.endDate)},
      ${JSON.stringify(input.payloadJson ?? {})}::jsonb,
      ${input.payloadHash},
      ${JSON.stringify(input.requestContext ?? {})}::jsonb,
      ${JSON.stringify(input.responseHeaders ?? {})}::jsonb,
      ${input.providerHttpStatus ?? null},
      ${input.status},
      COALESCE(${normalizeTimestamp(input.fetchedAt)}, now())
    )
    RETURNING id
  `) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function upsertShopifyOrders(rows: ShopifyOrderWarehouseRow[]) {
  if (rows.length <= 0) return 0;
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_orders");
  const sql = getDb();
  let written = 0;

  for (const chunk of chunkRows(rows)) {
    for (const row of chunk) {
      await sql`
        INSERT INTO shopify_orders (
          business_id,
          provider_account_id,
          shop_id,
          order_id,
          order_name,
          customer_id,
          currency_code,
          shop_currency_code,
          order_created_at,
          order_created_date_local,
          order_updated_at,
          order_updated_date_local,
          order_processed_at,
          order_cancelled_at,
          order_closed_at,
          financial_status,
          fulfillment_status,
          customer_journey_summary,
          subtotal_price,
          total_discounts,
          total_shipping,
          total_tax,
          total_refunded,
          total_price,
          original_total_price,
          current_total_price,
          payload_json,
          source_snapshot_id,
          updated_at
        )
        VALUES (
          ${row.businessId},
          ${row.providerAccountId},
          ${row.shopId},
          ${row.orderId},
          ${row.orderName ?? null},
          ${row.customerId ?? null},
          ${row.currencyCode ?? null},
          ${row.shopCurrencyCode ?? null},
          ${normalizeTimestamp(row.orderCreatedAt)},
          ${normalizeDate(row.orderCreatedDateLocal)},
          ${normalizeTimestamp(row.orderUpdatedAt)},
          ${normalizeDate(row.orderUpdatedDateLocal)},
          ${normalizeTimestamp(row.orderProcessedAt)},
          ${normalizeTimestamp(row.orderCancelledAt)},
          ${normalizeTimestamp(row.orderClosedAt)},
          ${row.financialStatus ?? null},
          ${row.fulfillmentStatus ?? null},
          ${JSON.stringify(row.customerJourneySummary ?? {})}::jsonb,
          ${toNumber(row.subtotalPrice)},
          ${toNumber(row.totalDiscounts)},
          ${toNumber(row.totalShipping)},
          ${toNumber(row.totalTax)},
          ${toNumber(row.totalRefunded)},
          ${toNumber(row.totalPrice)},
          ${toNumber(row.originalTotalPrice)},
          ${toNumber(row.currentTotalPrice)},
          ${JSON.stringify(row.payloadJson ?? {})}::jsonb,
          ${row.sourceSnapshotId ?? null},
          now()
        )
        ON CONFLICT (business_id, provider_account_id, shop_id, order_id)
        DO UPDATE SET
          order_name = EXCLUDED.order_name,
          customer_id = EXCLUDED.customer_id,
          currency_code = EXCLUDED.currency_code,
          shop_currency_code = EXCLUDED.shop_currency_code,
          order_created_at = EXCLUDED.order_created_at,
          order_created_date_local = EXCLUDED.order_created_date_local,
          order_updated_at = EXCLUDED.order_updated_at,
          order_updated_date_local = EXCLUDED.order_updated_date_local,
          order_processed_at = EXCLUDED.order_processed_at,
          order_cancelled_at = EXCLUDED.order_cancelled_at,
          order_closed_at = EXCLUDED.order_closed_at,
          financial_status = EXCLUDED.financial_status,
          fulfillment_status = EXCLUDED.fulfillment_status,
          customer_journey_summary = EXCLUDED.customer_journey_summary,
          subtotal_price = EXCLUDED.subtotal_price,
          total_discounts = EXCLUDED.total_discounts,
          total_shipping = EXCLUDED.total_shipping,
          total_tax = EXCLUDED.total_tax,
          total_refunded = EXCLUDED.total_refunded,
          total_price = EXCLUDED.total_price,
          original_total_price = EXCLUDED.original_total_price,
          current_total_price = EXCLUDED.current_total_price,
          payload_json = EXCLUDED.payload_json,
          source_snapshot_id = EXCLUDED.source_snapshot_id,
          updated_at = now()
      `;
      written += 1;
    }
  }

  return written;
}

export async function upsertShopifyOrderLines(rows: ShopifyOrderLineWarehouseRow[]) {
  if (rows.length <= 0) return 0;
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_order_lines");
  const sql = getDb();
  let written = 0;

  for (const chunk of chunkRows(rows)) {
    for (const row of chunk) {
      await sql`
        INSERT INTO shopify_order_lines (
          business_id,
          provider_account_id,
          shop_id,
          order_id,
          line_item_id,
          product_id,
          variant_id,
          sku,
          title,
          variant_title,
          quantity,
          discounted_total,
          original_total,
          tax_total,
          payload_json,
          source_snapshot_id,
          updated_at
        )
        VALUES (
          ${row.businessId},
          ${row.providerAccountId},
          ${row.shopId},
          ${row.orderId},
          ${row.lineItemId},
          ${row.productId ?? null},
          ${row.variantId ?? null},
          ${row.sku ?? null},
          ${row.title ?? null},
          ${row.variantTitle ?? null},
          ${Math.max(0, Math.trunc(row.quantity ?? 0))},
          ${toNumber(row.discountedTotal)},
          ${toNumber(row.originalTotal)},
          ${toNumber(row.taxTotal)},
          ${JSON.stringify(row.payloadJson ?? {})}::jsonb,
          ${row.sourceSnapshotId ?? null},
          now()
        )
        ON CONFLICT (business_id, provider_account_id, shop_id, order_id, line_item_id)
        DO UPDATE SET
          product_id = EXCLUDED.product_id,
          variant_id = EXCLUDED.variant_id,
          sku = EXCLUDED.sku,
          title = EXCLUDED.title,
          variant_title = EXCLUDED.variant_title,
          quantity = EXCLUDED.quantity,
          discounted_total = EXCLUDED.discounted_total,
          original_total = EXCLUDED.original_total,
          tax_total = EXCLUDED.tax_total,
          payload_json = EXCLUDED.payload_json,
          source_snapshot_id = EXCLUDED.source_snapshot_id,
          updated_at = now()
      `;
      written += 1;
    }
  }

  return written;
}

export async function upsertShopifyRefunds(rows: ShopifyRefundWarehouseRow[]) {
  if (rows.length <= 0) return 0;
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_refunds");
  const sql = getDb();
  let written = 0;

  for (const row of rows) {
    await sql`
      INSERT INTO shopify_refunds (
        business_id,
        provider_account_id,
        shop_id,
        order_id,
        refund_id,
        refunded_at,
        refunded_date_local,
        refunded_sales,
        refunded_shipping,
        refunded_taxes,
        total_refunded,
        payload_json,
        source_snapshot_id,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${row.shopId},
        ${row.orderId},
        ${row.refundId},
        ${normalizeTimestamp(row.refundedAt)},
        ${normalizeDate(row.refundedDateLocal)},
        ${toNumber(row.refundedSales)},
        ${toNumber(row.refundedShipping)},
        ${toNumber(row.refundedTaxes)},
        ${toNumber(row.totalRefunded)},
        ${JSON.stringify(row.payloadJson ?? {})}::jsonb,
        ${row.sourceSnapshotId ?? null},
        now()
      )
      ON CONFLICT (business_id, provider_account_id, shop_id, refund_id)
      DO UPDATE SET
        order_id = EXCLUDED.order_id,
        refunded_at = EXCLUDED.refunded_at,
        refunded_date_local = EXCLUDED.refunded_date_local,
        refunded_sales = EXCLUDED.refunded_sales,
        refunded_shipping = EXCLUDED.refunded_shipping,
        refunded_taxes = EXCLUDED.refunded_taxes,
        total_refunded = EXCLUDED.total_refunded,
        payload_json = EXCLUDED.payload_json,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        updated_at = now()
    `;
    written += 1;
  }

  return written;
}

export async function upsertShopifyOrderTransactions(
  rows: ShopifyOrderTransactionWarehouseRow[],
  input?: {
    runtimeValidation?: {
      runId: string;
      pageCount?: number;
      log?: (phase: string, summary?: Record<string, unknown>) => void;
    };
  }
) {
  if (rows.length <= 0) return 0;
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_order_transactions");
  const sql = getDb();
  let written = 0;

  for (const [index, row] of rows.entries()) {
    const summary = {
      pageCount: input?.runtimeValidation?.pageCount ?? null,
      rowIndex: index + 1,
      totalBatchSize: rows.length,
      transactionId: row.transactionId,
      orderId: row.orderId,
      kind: row.kind ?? null,
      status: row.status ?? null,
    } satisfies Record<string, unknown>;
    input?.runtimeValidation?.log?.("recent_orders_transactions_row_upsert_started", summary);

    const runtimeValidationComment = input?.runtimeValidation
      ? `/* shopify_rtval_transactions run_id=${sanitizeRuntimeValidationSqlCommentValue(
          input.runtimeValidation.runId,
        )} page=${sanitizeRuntimeValidationSqlCommentValue(
          input.runtimeValidation.pageCount ?? null,
        )} row=${sanitizeRuntimeValidationSqlCommentValue(
          index + 1,
        )} total=${sanitizeRuntimeValidationSqlCommentValue(rows.length)} transaction_id=${sanitizeRuntimeValidationSqlCommentValue(
          row.transactionId,
        )} order_id=${sanitizeRuntimeValidationSqlCommentValue(
          row.orderId,
        )} kind=${sanitizeRuntimeValidationSqlCommentValue(
          row.kind ?? null,
        )} status=${sanitizeRuntimeValidationSqlCommentValue(row.status ?? null)} */`
      : null;

    if (runtimeValidationComment) {
      await sql.query(
        `${runtimeValidationComment}
        INSERT INTO shopify_order_transactions (
          business_id,
          provider_account_id,
          shop_id,
          order_id,
          transaction_id,
          kind,
          status,
          gateway,
          processed_at,
          amount,
          currency_code,
          payload_json,
          source_snapshot_id,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12::jsonb, $13, now()
        )
        ON CONFLICT (business_id, provider_account_id, shop_id, transaction_id)
        DO UPDATE SET
          order_id = EXCLUDED.order_id,
          kind = EXCLUDED.kind,
          status = EXCLUDED.status,
          gateway = EXCLUDED.gateway,
          processed_at = EXCLUDED.processed_at,
          amount = EXCLUDED.amount,
          currency_code = EXCLUDED.currency_code,
          payload_json = EXCLUDED.payload_json,
          source_snapshot_id = EXCLUDED.source_snapshot_id,
          updated_at = now()`,
        [
          row.businessId,
          row.providerAccountId,
          row.shopId,
          row.orderId,
          row.transactionId,
          row.kind ?? null,
          row.status ?? null,
          row.gateway ?? null,
          normalizeTimestamp(row.processedAt),
          toNumber(row.amount),
          row.currencyCode ?? null,
          JSON.stringify(row.payloadJson ?? {}),
          row.sourceSnapshotId ?? null,
        ]
      );
    } else {
      await sql`
        INSERT INTO shopify_order_transactions (
          business_id,
          provider_account_id,
          shop_id,
          order_id,
          transaction_id,
          kind,
          status,
          gateway,
          processed_at,
          amount,
          currency_code,
          payload_json,
          source_snapshot_id,
          updated_at
        )
        VALUES (
          ${row.businessId},
          ${row.providerAccountId},
          ${row.shopId},
          ${row.orderId},
          ${row.transactionId},
          ${row.kind ?? null},
          ${row.status ?? null},
          ${row.gateway ?? null},
          ${normalizeTimestamp(row.processedAt)},
          ${toNumber(row.amount)},
          ${row.currencyCode ?? null},
          ${JSON.stringify(row.payloadJson ?? {})}::jsonb,
          ${row.sourceSnapshotId ?? null},
          now()
        )
        ON CONFLICT (business_id, provider_account_id, shop_id, transaction_id)
        DO UPDATE SET
          order_id = EXCLUDED.order_id,
          kind = EXCLUDED.kind,
          status = EXCLUDED.status,
          gateway = EXCLUDED.gateway,
          processed_at = EXCLUDED.processed_at,
          amount = EXCLUDED.amount,
          currency_code = EXCLUDED.currency_code,
          payload_json = EXCLUDED.payload_json,
          source_snapshot_id = EXCLUDED.source_snapshot_id,
          updated_at = now()
      `;
    }
    input?.runtimeValidation?.log?.("recent_orders_transactions_row_upsert_succeeded", summary);
    written += 1;
  }

  return written;
}

export async function upsertShopifyReturns(rows: ShopifyReturnWarehouseRow[]) {
  if (rows.length <= 0) return 0;
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_returns");
  const sql = getDb();
  let written = 0;

  for (const row of rows) {
    await sql`
      INSERT INTO shopify_returns (
        business_id,
        provider_account_id,
        shop_id,
        order_id,
        return_id,
        status,
        created_at_provider,
        created_date_local,
        updated_at_provider,
        updated_date_local,
        payload_json,
        source_snapshot_id,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${row.shopId},
        ${row.orderId ?? null},
        ${row.returnId},
        ${row.status ?? null},
        ${normalizeTimestamp(row.createdAt)},
        ${normalizeDate(row.createdDateLocal)},
        ${normalizeTimestamp(row.updatedAt)},
        ${normalizeDate(row.updatedDateLocal)},
        ${JSON.stringify(row.payloadJson ?? {})}::jsonb,
        ${row.sourceSnapshotId ?? null},
        now()
      )
      ON CONFLICT (business_id, provider_account_id, shop_id, return_id)
      DO UPDATE SET
        order_id = EXCLUDED.order_id,
        status = EXCLUDED.status,
        created_at_provider = EXCLUDED.created_at_provider,
        created_date_local = EXCLUDED.created_date_local,
        updated_at_provider = EXCLUDED.updated_at_provider,
        updated_date_local = EXCLUDED.updated_date_local,
        payload_json = EXCLUDED.payload_json,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        updated_at = now()
    `;
    written += 1;
  }

  return written;
}

export async function upsertShopifySalesEvents(
  rows: ShopifySalesEventWarehouseRow[],
  input?: {
    runtimeValidation?: {
      runId: string;
      pageCount?: number;
      log?: (phase: string, summary?: Record<string, unknown>) => void;
    };
  }
) {
  if (rows.length <= 0) return 0;
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_sales_events");
  const sql = getDb();
  let written = 0;

  for (const [index, row] of rows.entries()) {
    const summary = {
      pageCount: input?.runtimeValidation?.pageCount ?? null,
      rowIndex: index + 1,
      totalBatchSize: rows.length,
      eventId: row.eventId,
      sourceId: row.sourceId,
      sourceKind: row.sourceKind,
    } satisfies Record<string, unknown>;
    input?.runtimeValidation?.log?.("recent_orders_sales_events_row_upsert_started", summary);
    const runtimeValidationComment = input?.runtimeValidation
      ? `/* shopify_rtval_sales_events run_id=${sanitizeRuntimeValidationSqlCommentValue(
          input.runtimeValidation.runId,
        )} page=${sanitizeRuntimeValidationSqlCommentValue(
          input.runtimeValidation.pageCount ?? null,
        )} row=${sanitizeRuntimeValidationSqlCommentValue(
          index + 1,
        )} total=${sanitizeRuntimeValidationSqlCommentValue(rows.length)} event_id=${sanitizeRuntimeValidationSqlCommentValue(
          row.eventId,
        )} source_id=${sanitizeRuntimeValidationSqlCommentValue(
          row.sourceId,
        )} source_kind=${sanitizeRuntimeValidationSqlCommentValue(row.sourceKind)} */`
      : null;

    if (runtimeValidationComment) {
      await sql.query(
        `${runtimeValidationComment}
        INSERT INTO shopify_sales_events (
          business_id,
          provider_account_id,
          shop_id,
          event_id,
          source_kind,
          source_id,
          order_id,
          occurred_at,
          occurred_date_local,
          gross_sales,
          refunded_sales,
          refunded_shipping,
          refunded_taxes,
          net_revenue,
          currency_code,
          payload_json,
          source_snapshot_id,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16::jsonb, $17, now()
        )
        ON CONFLICT (business_id, provider_account_id, shop_id, event_id)
        DO UPDATE SET
          source_kind = EXCLUDED.source_kind,
          source_id = EXCLUDED.source_id,
          order_id = EXCLUDED.order_id,
          occurred_at = EXCLUDED.occurred_at,
          occurred_date_local = EXCLUDED.occurred_date_local,
          gross_sales = EXCLUDED.gross_sales,
          refunded_sales = EXCLUDED.refunded_sales,
          refunded_shipping = EXCLUDED.refunded_shipping,
          refunded_taxes = EXCLUDED.refunded_taxes,
          net_revenue = EXCLUDED.net_revenue,
          currency_code = EXCLUDED.currency_code,
          payload_json = EXCLUDED.payload_json,
          source_snapshot_id = EXCLUDED.source_snapshot_id,
          updated_at = now()`,
        [
          row.businessId,
          row.providerAccountId,
          row.shopId,
          row.eventId,
          row.sourceKind,
          row.sourceId,
          row.orderId ?? null,
          normalizeTimestamp(row.occurredAt),
          normalizeDate(row.occurredDateLocal),
          toNumber(row.grossSales),
          toNumber(row.refundedSales),
          toNumber(row.refundedShipping),
          toNumber(row.refundedTaxes),
          toNumber(row.netRevenue),
          row.currencyCode ?? null,
          JSON.stringify(row.payloadJson ?? {}),
          row.sourceSnapshotId ?? null,
        ]
      );
    } else {
      await sql`
        INSERT INTO shopify_sales_events (
          business_id,
          provider_account_id,
          shop_id,
          event_id,
          source_kind,
          source_id,
          order_id,
          occurred_at,
          occurred_date_local,
          gross_sales,
          refunded_sales,
          refunded_shipping,
          refunded_taxes,
          net_revenue,
          currency_code,
          payload_json,
          source_snapshot_id,
          updated_at
        )
        VALUES (
          ${row.businessId},
          ${row.providerAccountId},
          ${row.shopId},
          ${row.eventId},
          ${row.sourceKind},
          ${row.sourceId},
          ${row.orderId ?? null},
          ${normalizeTimestamp(row.occurredAt)},
          ${normalizeDate(row.occurredDateLocal)},
          ${toNumber(row.grossSales)},
          ${toNumber(row.refundedSales)},
          ${toNumber(row.refundedShipping)},
          ${toNumber(row.refundedTaxes)},
          ${toNumber(row.netRevenue)},
          ${row.currencyCode ?? null},
          ${JSON.stringify(row.payloadJson ?? {})}::jsonb,
          ${row.sourceSnapshotId ?? null},
          now()
        )
        ON CONFLICT (business_id, provider_account_id, shop_id, event_id)
        DO UPDATE SET
          source_kind = EXCLUDED.source_kind,
          source_id = EXCLUDED.source_id,
          order_id = EXCLUDED.order_id,
          occurred_at = EXCLUDED.occurred_at,
          occurred_date_local = EXCLUDED.occurred_date_local,
          gross_sales = EXCLUDED.gross_sales,
          refunded_sales = EXCLUDED.refunded_sales,
          refunded_shipping = EXCLUDED.refunded_shipping,
          refunded_taxes = EXCLUDED.refunded_taxes,
          net_revenue = EXCLUDED.net_revenue,
          currency_code = EXCLUDED.currency_code,
          payload_json = EXCLUDED.payload_json,
          source_snapshot_id = EXCLUDED.source_snapshot_id,
          updated_at = now()
      `;
    }
    input?.runtimeValidation?.log?.("recent_orders_sales_events_row_upsert_succeeded", summary);
    written += 1;
  }

  return written;
}

export async function getShopifyServingOverride(input: {
  businessId: string;
  providerAccountId: string;
  overrideKey: string;
}) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:get_serving_override");
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM shopify_serving_overrides
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND override_key = ${input.overrideKey}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    overrideKey: String(row.override_key),
    startDate: normalizeDate(row.start_date),
    endDate: normalizeDate(row.end_date),
    mode: String(row.mode) as ShopifyServingOverrideRecord["mode"],
    reason: row.reason ? String(row.reason) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    updatedAt: normalizeTimestamp(row.updated_at),
  } satisfies ShopifyServingOverrideRecord;
}

export async function upsertShopifyServingOverride(input: ShopifyServingOverrideRecord) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_serving_override");
  const sql = getDb();
  await sql`
    INSERT INTO shopify_serving_overrides (
      business_id,
      provider_account_id,
      override_key,
      start_date,
      end_date,
      mode,
      reason,
      updated_by,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.overrideKey},
      ${normalizeDate(input.startDate)},
      ${normalizeDate(input.endDate)},
      ${input.mode},
      ${input.reason ?? null},
      ${input.updatedBy ?? null},
      now()
    )
    ON CONFLICT (business_id, provider_account_id, override_key)
    DO UPDATE SET
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      mode = EXCLUDED.mode,
      reason = EXCLUDED.reason,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  `;
}

export async function upsertShopifyWebhookDelivery(input: ShopifyWebhookDeliveryRecord) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_webhook_delivery");
  const sql = getDb();
  await sql`
    INSERT INTO shopify_webhook_deliveries (
      business_id,
      provider_account_id,
      topic,
      shop_domain,
      webhook_id,
      payload_hash,
      payload_json,
      received_at,
      processed_at,
      processing_state,
      result_summary,
      error_message,
      updated_at
    )
    VALUES (
      ${input.businessId ?? null},
      ${input.providerAccountId ?? null},
      ${input.topic},
      ${input.shopDomain},
      ${input.webhookId ?? null},
      ${String(input.payloadHash)},
      ${JSON.stringify(input.payloadJson ?? {})}::jsonb,
      COALESCE(${normalizeTimestamp(input.receivedAt)}, now()),
      ${normalizeTimestamp(input.processedAt)},
      ${input.processingState},
      ${JSON.stringify(input.resultSummary ?? null)}::jsonb,
      ${input.errorMessage ?? null},
      now()
    )
    ON CONFLICT (shop_domain, topic, payload_hash)
    DO UPDATE SET
      business_id = COALESCE(EXCLUDED.business_id, shopify_webhook_deliveries.business_id),
      provider_account_id = COALESCE(EXCLUDED.provider_account_id, shopify_webhook_deliveries.provider_account_id),
      webhook_id = COALESCE(EXCLUDED.webhook_id, shopify_webhook_deliveries.webhook_id),
      processed_at = COALESCE(EXCLUDED.processed_at, shopify_webhook_deliveries.processed_at),
      processing_state = EXCLUDED.processing_state,
      result_summary = COALESCE(EXCLUDED.result_summary, shopify_webhook_deliveries.result_summary),
      error_message = EXCLUDED.error_message,
      updated_at = now()
  `;
}

export async function upsertShopifyRepairIntent(input: ShopifyRepairIntentRecord) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_repair_intent");
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO shopify_repair_intents (
      business_id,
      provider_account_id,
      entity_type,
      entity_id,
      topic,
      payload_hash,
      event_timestamp,
      event_age_days,
      escalation_level,
      status,
      attempt_count,
      last_error,
      last_sync_result,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.entityType},
      ${input.entityId},
      ${input.topic},
      ${input.payloadHash},
      ${normalizeTimestamp(input.eventTimestamp)},
      ${input.eventAgeDays ?? null},
      ${Math.max(0, Math.trunc(input.escalationLevel ?? 0))},
      ${input.status},
      ${Math.max(0, Math.trunc(input.attemptCount ?? 0))},
      ${input.lastError ?? null},
      ${JSON.stringify(input.lastSyncResult ?? null)}::jsonb,
      now()
    )
    ON CONFLICT (business_id, provider_account_id, entity_type, entity_id, topic, payload_hash)
    DO UPDATE SET
      event_timestamp = COALESCE(EXCLUDED.event_timestamp, shopify_repair_intents.event_timestamp),
      event_age_days = COALESCE(EXCLUDED.event_age_days, shopify_repair_intents.event_age_days),
      escalation_level = GREATEST(shopify_repair_intents.escalation_level, EXCLUDED.escalation_level),
      status = EXCLUDED.status,
      attempt_count = EXCLUDED.attempt_count,
      last_error = EXCLUDED.last_error,
      last_sync_result = EXCLUDED.last_sync_result,
      updated_at = now()
    RETURNING *
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  return row
    ? ({
        id: String(row.id),
        businessId: String(row.business_id),
        providerAccountId: String(row.provider_account_id),
        entityType: row.entity_type as ShopifyRepairIntentRecord["entityType"],
        entityId: String(row.entity_id),
        topic: String(row.topic),
        payloadHash: String(row.payload_hash),
        eventTimestamp: normalizeTimestamp(row.event_timestamp),
        eventAgeDays: row.event_age_days == null ? null : Number(row.event_age_days),
        escalationLevel: Number(row.escalation_level ?? 0),
        status: row.status as ShopifyRepairIntentRecord["status"],
        attemptCount: Number(row.attempt_count ?? 0),
        lastError: row.last_error ? String(row.last_error) : null,
        lastSyncResult:
          row.last_sync_result && typeof row.last_sync_result === "object"
            ? (row.last_sync_result as Record<string, unknown>)
            : null,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
      } satisfies ShopifyRepairIntentRecord)
    : null;
}

export async function listShopifyRepairIntents(input: {
  businessId: string;
  providerAccountId: string;
  limit?: number;
}) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:list_repair_intents");
  const sql = getDb();
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 10)));
  const rows = (await sql`
    SELECT *
    FROM shopify_repair_intents
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    entityType: row.entity_type as ShopifyRepairIntentRecord["entityType"],
    entityId: String(row.entity_id),
    topic: String(row.topic),
    payloadHash: String(row.payload_hash),
    eventTimestamp: normalizeTimestamp(row.event_timestamp),
    eventAgeDays: row.event_age_days == null ? null : Number(row.event_age_days),
    escalationLevel: Number(row.escalation_level ?? 0),
    status: row.status as ShopifyRepairIntentRecord["status"],
    attemptCount: Number(row.attempt_count ?? 0),
    lastError: row.last_error ? String(row.last_error) : null,
    lastSyncResult:
      row.last_sync_result && typeof row.last_sync_result === "object"
        ? (row.last_sync_result as Record<string, unknown>)
        : null,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  })) satisfies ShopifyRepairIntentRecord[];
}

export async function getShopifyWebhookDelivery(input: {
  shopDomain: string;
  topic: string;
  payloadHash: string;
}) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:get_webhook_delivery");
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM shopify_webhook_deliveries
    WHERE shop_domain = ${input.shopDomain}
      AND topic = ${input.topic}
      AND payload_hash = ${input.payloadHash}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    businessId: row.business_id ? String(row.business_id) : null,
    providerAccountId: row.provider_account_id ? String(row.provider_account_id) : null,
    topic: String(row.topic),
    shopDomain: String(row.shop_domain),
    webhookId: row.webhook_id ? String(row.webhook_id) : null,
    payloadHash: String(row.payload_hash),
    payloadJson:
      row.payload_json && typeof row.payload_json === "object"
        ? row.payload_json
        : {},
    receivedAt: normalizeTimestamp(row.received_at),
    processedAt: normalizeTimestamp(row.processed_at),
    processingState: String(row.processing_state) as ShopifyWebhookDeliveryRecord["processingState"],
    resultSummary:
      row.result_summary && typeof row.result_summary === "object"
        ? (row.result_summary as Record<string, unknown>)
        : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
  } satisfies ShopifyWebhookDeliveryRecord;
}

export async function listShopifyWebhookDeliveries(input: {
  businessId: string;
  providerAccountId?: string | null;
  limit?: number;
}) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:list_webhook_deliveries");
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM shopify_webhook_deliveries
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
    ORDER BY COALESCE(processed_at, received_at) DESC
    LIMIT ${Math.max(1, Math.min(input.limit ?? 10, 50))}
  `) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    businessId: row.business_id ? String(row.business_id) : null,
    providerAccountId: row.provider_account_id ? String(row.provider_account_id) : null,
    topic: String(row.topic),
    shopDomain: String(row.shop_domain),
    webhookId: row.webhook_id ? String(row.webhook_id) : null,
    payloadHash: String(row.payload_hash),
    payloadJson: row.payload_json ?? null,
    receivedAt: normalizeTimestamp(row.received_at),
    processedAt: normalizeTimestamp(row.processed_at),
    processingState: String(row.processing_state) as ShopifyWebhookDeliveryRecord["processingState"],
    resultSummary:
      row.result_summary && typeof row.result_summary === "object"
        ? (row.result_summary as Record<string, unknown>)
        : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
  })) satisfies ShopifyWebhookDeliveryRecord[];
}

export async function listShopifyReconciliationRuns(input: {
  businessId: string;
  providerAccountId: string;
  reconciliationKey?: string;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
}) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:list_reconciliation_runs");
  const sql = getDb();
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 10)));
  const rows = (await sql`
    SELECT *
    FROM shopify_reconciliation_runs
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND (${input.reconciliationKey ?? null}::text IS NULL OR reconciliation_key = ${input.reconciliationKey ?? null})
      AND (${normalizeDate(input.startDate) ?? null}::date IS NULL OR start_date = ${normalizeDate(input.startDate) ?? null})
      AND (${normalizeDate(input.endDate) ?? null}::date IS NULL OR end_date = ${normalizeDate(input.endDate) ?? null})
    ORDER BY recorded_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    reconciliationKey: String(row.reconciliation_key),
    startDate: normalizeDate(row.start_date),
    endDate: normalizeDate(row.end_date),
    preferredSource: row.preferred_source ? String(row.preferred_source) : null,
    canServeWarehouse: Boolean(row.can_serve_warehouse),
    selectedRevenueTruthBasis: row.selected_revenue_truth_basis
      ? String(row.selected_revenue_truth_basis)
      : null,
    basisSelectionReason: row.basis_selection_reason ? String(row.basis_selection_reason) : null,
    transactionCoverageOrderRate:
      row.transaction_coverage_order_rate == null ? null : Number(row.transaction_coverage_order_rate),
    transactionCoverageAmountRate:
      row.transaction_coverage_amount_rate == null ? null : Number(row.transaction_coverage_amount_rate),
    orderRevenueTruthDelta:
      row.order_revenue_truth_delta == null ? null : Number(row.order_revenue_truth_delta),
    transactionRevenueDelta:
      row.transaction_revenue_delta == null ? null : Number(row.transaction_revenue_delta),
    explainedAdjustmentRevenue:
      row.explained_adjustment_revenue == null ? null : Number(row.explained_adjustment_revenue),
    unexplainedAdjustmentRevenue:
      row.unexplained_adjustment_revenue == null ? null : Number(row.unexplained_adjustment_revenue),
    divergence:
      row.divergence && typeof row.divergence === "object"
        ? (row.divergence as Record<string, unknown>)
        : null,
    warehouseAggregate:
      row.warehouse_aggregate && typeof row.warehouse_aggregate === "object"
        ? (row.warehouse_aggregate as Record<string, unknown>)
        : null,
    ledgerAggregate:
      row.ledger_aggregate && typeof row.ledger_aggregate === "object"
        ? (row.ledger_aggregate as Record<string, unknown>)
        : null,
    liveAggregate:
      row.live_aggregate && typeof row.live_aggregate === "object"
        ? (row.live_aggregate as Record<string, unknown>)
        : null,
    recordedAt: normalizeTimestamp(row.recorded_at),
    createdAt: normalizeTimestamp(row.created_at),
  })) satisfies ShopifyReconciliationRunRecord[];
}

export async function upsertShopifyCustomerEvents(rows: ShopifyCustomerEventWarehouseRow[]) {
  if (rows.length <= 0) return 0;
  await assertShopifyWarehouseTablesReady("shopify_warehouse:upsert_customer_events");
  const sql = getDb();
  let written = 0;

  for (const row of rows) {
    await sql`
      INSERT INTO shopify_customer_events (
        business_id,
        provider_account_id,
        shop_id,
        event_id,
        event_type,
        occurred_at,
        customer_id,
        session_id,
        page_type,
        page_url,
        consent_state,
        payload_json,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${row.shopId},
        ${row.eventId},
        ${row.eventType},
        ${normalizeTimestamp(row.occurredAt)},
        ${row.customerId ?? null},
        ${row.sessionId ?? null},
        ${row.pageType ?? null},
        ${row.pageUrl ?? null},
        ${row.consentState ?? null},
        ${JSON.stringify(row.payloadJson ?? {})}::jsonb,
        now()
      )
      ON CONFLICT (business_id, provider_account_id, shop_id, event_id)
      DO UPDATE SET
        event_type = EXCLUDED.event_type,
        occurred_at = EXCLUDED.occurred_at,
        customer_id = EXCLUDED.customer_id,
        session_id = EXCLUDED.session_id,
        page_type = EXCLUDED.page_type,
        page_url = EXCLUDED.page_url,
        consent_state = EXCLUDED.consent_state,
        payload_json = EXCLUDED.payload_json,
        updated_at = now()
    `;
    written += 1;
  }

  return written;
}

export async function getShopifyServingState(input: {
  businessId: string;
  providerAccountId: string;
  canaryKey: string;
}) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:get_serving_state");
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM shopify_serving_state
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND canary_key = ${input.canaryKey}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    canaryKey: String(row.canary_key),
    startDate: normalizeDate(row.start_date),
    endDate: normalizeDate(row.end_date),
    timeZoneBasis: row.time_zone_basis ? String(row.time_zone_basis) : null,
    assessedAt: normalizeTimestamp(row.assessed_at),
    statusState: row.status_state ? String(row.status_state) : null,
    preferredSource: row.preferred_source ? String(row.preferred_source) : null,
    productionMode: normalizeServingProductionMode(row.production_mode),
    trustState: normalizeServingTrustState(row.trust_state),
    fallbackReason: row.fallback_reason ? String(row.fallback_reason) : null,
    coverageStatus: normalizeServingCoverageStatus(row.coverage_status),
    pendingRepair: Boolean(row.pending_repair),
    pendingRepairStartedAt: normalizeTimestamp(row.pending_repair_started_at),
    pendingRepairLastTopic: row.pending_repair_last_topic
      ? String(row.pending_repair_last_topic)
      : null,
    pendingRepairLastReceivedAt: normalizeTimestamp(row.pending_repair_last_received_at),
    consecutiveCleanValidations: Number(row.consecutive_clean_validations ?? 0) || 0,
    ordersRecentSyncedAt: normalizeTimestamp(row.orders_recent_synced_at),
    ordersRecentCursorTimestamp: normalizeTimestamp(row.orders_recent_cursor_timestamp),
    ordersRecentCursorValue: row.orders_recent_cursor_value ? String(row.orders_recent_cursor_value) : null,
    returnsRecentSyncedAt: normalizeTimestamp(row.returns_recent_synced_at),
    returnsRecentCursorTimestamp: normalizeTimestamp(row.returns_recent_cursor_timestamp),
    returnsRecentCursorValue: row.returns_recent_cursor_value ? String(row.returns_recent_cursor_value) : null,
    ordersHistoricalSyncedAt: normalizeTimestamp(row.orders_historical_synced_at),
    ordersHistoricalReadyThroughDate: normalizeDate(row.orders_historical_ready_through_date),
    ordersHistoricalTargetEnd: normalizeDate(row.orders_historical_target_end),
    returnsHistoricalSyncedAt: normalizeTimestamp(row.returns_historical_synced_at),
    returnsHistoricalReadyThroughDate: normalizeDate(row.returns_historical_ready_through_date),
    returnsHistoricalTargetEnd: normalizeDate(row.returns_historical_target_end),
    canServeWarehouse: Boolean(row.can_serve_warehouse),
    canaryEnabled: Boolean(row.canary_enabled),
    decisionReasons: Array.isArray(row.decision_reasons)
      ? row.decision_reasons.map((value) => String(value))
      : [],
    divergence:
      row.divergence && typeof row.divergence === "object"
        ? (row.divergence as Record<string, unknown>)
        : null,
  } satisfies ShopifyServingStateRecord;
}

export async function listShopifyServingStateHistory(input: {
  businessId: string;
  providerAccountId: string;
  canaryKey?: string;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
}) {
  await assertShopifyWarehouseTablesReady("shopify_warehouse:list_serving_state_history");
  const sql = getDb();
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 10)));
  const rows = (await sql`
    SELECT *
    FROM shopify_serving_state_history
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND (${input.canaryKey ?? null}::text IS NULL OR canary_key = ${input.canaryKey ?? null})
      AND (${normalizeDate(input.startDate) ?? null}::date IS NULL OR start_date = ${normalizeDate(input.startDate) ?? null})
      AND (${normalizeDate(input.endDate) ?? null}::date IS NULL OR end_date = ${normalizeDate(input.endDate) ?? null})
    ORDER BY assessed_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    canaryKey: String(row.canary_key),
    startDate: normalizeDate(row.start_date),
    endDate: normalizeDate(row.end_date),
    timeZoneBasis: row.time_zone_basis ? String(row.time_zone_basis) : null,
    assessedAt: normalizeTimestamp(row.assessed_at),
    statusState: row.status_state ? String(row.status_state) : null,
    preferredSource: row.preferred_source ? String(row.preferred_source) : null,
    productionMode: normalizeServingProductionMode(row.production_mode),
    trustState: normalizeServingTrustState(row.trust_state),
    fallbackReason: row.fallback_reason ? String(row.fallback_reason) : null,
    coverageStatus: normalizeServingCoverageStatus(row.coverage_status),
    pendingRepair: Boolean(row.pending_repair),
    pendingRepairStartedAt: normalizeTimestamp(row.pending_repair_started_at),
    pendingRepairLastTopic: row.pending_repair_last_topic
      ? String(row.pending_repair_last_topic)
      : null,
    pendingRepairLastReceivedAt: normalizeTimestamp(row.pending_repair_last_received_at),
    consecutiveCleanValidations: Number(row.consecutive_clean_validations ?? 0) || 0,
    ordersRecentSyncedAt: normalizeTimestamp(row.orders_recent_synced_at),
    ordersRecentCursorTimestamp: normalizeTimestamp(row.orders_recent_cursor_timestamp),
    ordersRecentCursorValue: row.orders_recent_cursor_value ? String(row.orders_recent_cursor_value) : null,
    returnsRecentSyncedAt: normalizeTimestamp(row.returns_recent_synced_at),
    returnsRecentCursorTimestamp: normalizeTimestamp(row.returns_recent_cursor_timestamp),
    returnsRecentCursorValue: row.returns_recent_cursor_value ? String(row.returns_recent_cursor_value) : null,
    ordersHistoricalSyncedAt: normalizeTimestamp(row.orders_historical_synced_at),
    ordersHistoricalReadyThroughDate: normalizeDate(row.orders_historical_ready_through_date),
    ordersHistoricalTargetEnd: normalizeDate(row.orders_historical_target_end),
    returnsHistoricalSyncedAt: normalizeTimestamp(row.returns_historical_synced_at),
    returnsHistoricalReadyThroughDate: normalizeDate(row.returns_historical_ready_through_date),
    returnsHistoricalTargetEnd: normalizeDate(row.returns_historical_target_end),
    canServeWarehouse: Boolean(row.can_serve_warehouse),
    canaryEnabled: Boolean(row.canary_enabled),
    decisionReasons: Array.isArray(row.decision_reasons)
      ? row.decision_reasons.map((value) => String(value))
      : [],
    divergence:
      row.divergence && typeof row.divergence === "object"
        ? (row.divergence as Record<string, unknown>)
        : null,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  })) satisfies ShopifyServingStateHistoryRecord[];
}
