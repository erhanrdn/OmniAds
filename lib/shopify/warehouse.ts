import { createHash } from "node:crypto";

import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import type {
  ShopifyOrderTransactionWarehouseRow,
  ShopifyCustomerEventWarehouseRow,
  ShopifyOrderLineWarehouseRow,
  ShopifyOrderWarehouseRow,
  ShopifyRawSnapshotRecord,
  ShopifyRefundWarehouseRow,
  ShopifyReturnWarehouseRow,
} from "@/lib/shopify/warehouse-types";

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
  await runMigrations();
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
  await runMigrations();
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
          order_updated_at,
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
          ${normalizeTimestamp(row.orderUpdatedAt)},
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
          order_updated_at = EXCLUDED.order_updated_at,
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
  await runMigrations();
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
  await runMigrations();
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

export async function upsertShopifyOrderTransactions(rows: ShopifyOrderTransactionWarehouseRow[]) {
  if (rows.length <= 0) return 0;
  await runMigrations();
  const sql = getDb();
  let written = 0;

  for (const row of rows) {
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
    written += 1;
  }

  return written;
}

export async function upsertShopifyReturns(rows: ShopifyReturnWarehouseRow[]) {
  if (rows.length <= 0) return 0;
  await runMigrations();
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
        updated_at_provider,
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
        ${normalizeTimestamp(row.updatedAt)},
        ${JSON.stringify(row.payloadJson ?? {})}::jsonb,
        ${row.sourceSnapshotId ?? null},
        now()
      )
      ON CONFLICT (business_id, provider_account_id, shop_id, return_id)
      DO UPDATE SET
        order_id = EXCLUDED.order_id,
        status = EXCLUDED.status,
        created_at_provider = EXCLUDED.created_at_provider,
        updated_at_provider = EXCLUDED.updated_at_provider,
        payload_json = EXCLUDED.payload_json,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        updated_at = now()
    `;
    written += 1;
  }

  return written;
}

export async function upsertShopifyCustomerEvents(rows: ShopifyCustomerEventWarehouseRow[]) {
  if (rows.length <= 0) return 0;
  await runMigrations();
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
