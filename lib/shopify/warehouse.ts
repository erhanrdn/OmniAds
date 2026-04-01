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
  ShopifySalesEventWarehouseRow,
  ShopifyServingStateRecord,
  ShopifyServingStateHistoryRecord,
  ShopifyServingOverrideRecord,
  ShopifyWebhookDeliveryRecord,
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

export async function upsertShopifySalesEvents(rows: ShopifySalesEventWarehouseRow[]) {
  if (rows.length <= 0) return 0;
  await runMigrations();
  const sql = getDb();
  let written = 0;

  for (const row of rows) {
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
    written += 1;
  }

  return written;
}

export async function getShopifyServingOverride(input: {
  businessId: string;
  providerAccountId: string;
  overrideKey: string;
}) {
  await runMigrations();
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
  await runMigrations();
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
  await runMigrations();
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

export async function getShopifyServingState(input: {
  businessId: string;
  providerAccountId: string;
  canaryKey: string;
}) {
  await runMigrations();
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
  await runMigrations();
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

export async function upsertShopifyServingState(input: ShopifyServingStateRecord) {
  await runMigrations();
  const sql = getDb();
  await sql`
    INSERT INTO shopify_serving_state (
      business_id,
      provider_account_id,
      canary_key,
      start_date,
      end_date,
      time_zone_basis,
      assessed_at,
      status_state,
      preferred_source,
      orders_recent_synced_at,
      orders_recent_cursor_timestamp,
      orders_recent_cursor_value,
      returns_recent_synced_at,
      returns_recent_cursor_timestamp,
      returns_recent_cursor_value,
      orders_historical_synced_at,
      orders_historical_ready_through_date,
      orders_historical_target_end,
      returns_historical_synced_at,
      returns_historical_ready_through_date,
      returns_historical_target_end,
      can_serve_warehouse,
      canary_enabled,
      decision_reasons,
      divergence,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.canaryKey},
      ${normalizeDate(input.startDate)},
      ${normalizeDate(input.endDate)},
      ${input.timeZoneBasis ?? null},
      COALESCE(${normalizeTimestamp(input.assessedAt)}, now()),
      ${input.statusState ?? null},
      ${input.preferredSource ?? null},
      ${normalizeTimestamp(input.ordersRecentSyncedAt)},
      ${normalizeTimestamp(input.ordersRecentCursorTimestamp)},
      ${input.ordersRecentCursorValue ?? null},
      ${normalizeTimestamp(input.returnsRecentSyncedAt)},
      ${normalizeTimestamp(input.returnsRecentCursorTimestamp)},
      ${input.returnsRecentCursorValue ?? null},
      ${normalizeTimestamp(input.ordersHistoricalSyncedAt)},
      ${normalizeDate(input.ordersHistoricalReadyThroughDate)},
      ${normalizeDate(input.ordersHistoricalTargetEnd)},
      ${normalizeTimestamp(input.returnsHistoricalSyncedAt)},
      ${normalizeDate(input.returnsHistoricalReadyThroughDate)},
      ${normalizeDate(input.returnsHistoricalTargetEnd)},
      ${Boolean(input.canServeWarehouse)},
      ${Boolean(input.canaryEnabled)},
      ${JSON.stringify(input.decisionReasons ?? [])}::jsonb,
      ${JSON.stringify(input.divergence ?? null)}::jsonb,
      now()
    )
    ON CONFLICT (business_id, provider_account_id, canary_key)
    DO UPDATE SET
      assessed_at = EXCLUDED.assessed_at,
      start_date = COALESCE(EXCLUDED.start_date, shopify_serving_state.start_date),
      end_date = COALESCE(EXCLUDED.end_date, shopify_serving_state.end_date),
      time_zone_basis = COALESCE(EXCLUDED.time_zone_basis, shopify_serving_state.time_zone_basis),
      status_state = EXCLUDED.status_state,
      preferred_source = EXCLUDED.preferred_source,
      orders_recent_synced_at = EXCLUDED.orders_recent_synced_at,
      orders_recent_cursor_timestamp = EXCLUDED.orders_recent_cursor_timestamp,
      orders_recent_cursor_value = EXCLUDED.orders_recent_cursor_value,
      returns_recent_synced_at = EXCLUDED.returns_recent_synced_at,
      returns_recent_cursor_timestamp = EXCLUDED.returns_recent_cursor_timestamp,
      returns_recent_cursor_value = EXCLUDED.returns_recent_cursor_value,
      orders_historical_synced_at = EXCLUDED.orders_historical_synced_at,
      orders_historical_ready_through_date = EXCLUDED.orders_historical_ready_through_date,
      orders_historical_target_end = EXCLUDED.orders_historical_target_end,
      returns_historical_synced_at = EXCLUDED.returns_historical_synced_at,
      returns_historical_ready_through_date = EXCLUDED.returns_historical_ready_through_date,
      returns_historical_target_end = EXCLUDED.returns_historical_target_end,
      can_serve_warehouse = EXCLUDED.can_serve_warehouse,
      canary_enabled = EXCLUDED.canary_enabled,
      decision_reasons = EXCLUDED.decision_reasons,
      divergence = EXCLUDED.divergence,
      updated_at = now()
  `;
  await sql`
    INSERT INTO shopify_serving_state_history (
      business_id,
      provider_account_id,
      canary_key,
      start_date,
      end_date,
      time_zone_basis,
      assessed_at,
      status_state,
      preferred_source,
      orders_recent_synced_at,
      orders_recent_cursor_timestamp,
      orders_recent_cursor_value,
      returns_recent_synced_at,
      returns_recent_cursor_timestamp,
      returns_recent_cursor_value,
      orders_historical_synced_at,
      orders_historical_ready_through_date,
      orders_historical_target_end,
      returns_historical_synced_at,
      returns_historical_ready_through_date,
      returns_historical_target_end,
      can_serve_warehouse,
      canary_enabled,
      decision_reasons,
      divergence,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.canaryKey},
      ${normalizeDate(input.startDate)},
      ${normalizeDate(input.endDate)},
      ${input.timeZoneBasis ?? null},
      COALESCE(${normalizeTimestamp(input.assessedAt)}, now()),
      ${input.statusState ?? null},
      ${input.preferredSource ?? null},
      ${normalizeTimestamp(input.ordersRecentSyncedAt)},
      ${normalizeTimestamp(input.ordersRecentCursorTimestamp)},
      ${input.ordersRecentCursorValue ?? null},
      ${normalizeTimestamp(input.returnsRecentSyncedAt)},
      ${normalizeTimestamp(input.returnsRecentCursorTimestamp)},
      ${input.returnsRecentCursorValue ?? null},
      ${normalizeTimestamp(input.ordersHistoricalSyncedAt)},
      ${normalizeDate(input.ordersHistoricalReadyThroughDate)},
      ${normalizeDate(input.ordersHistoricalTargetEnd)},
      ${normalizeTimestamp(input.returnsHistoricalSyncedAt)},
      ${normalizeDate(input.returnsHistoricalReadyThroughDate)},
      ${normalizeDate(input.returnsHistoricalTargetEnd)},
      ${Boolean(input.canServeWarehouse)},
      ${Boolean(input.canaryEnabled)},
      ${JSON.stringify(input.decisionReasons ?? [])}::jsonb,
      ${JSON.stringify(input.divergence ?? null)}::jsonb,
      now()
    )
  `;
}
