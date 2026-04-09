import { getDb } from "@/lib/db";
import { assertDbSchemaReady } from "@/lib/db-schema-readiness";
import type {
  ShopifyReconciliationRunRecord,
  ShopifyServingStateRecord,
} from "@/lib/shopify/warehouse-types";

const SHOPIFY_OVERVIEW_MATERIALIZATION_TABLES = [
  "shopify_reconciliation_runs",
  "shopify_serving_state",
  "shopify_serving_state_history",
] as const;

async function assertShopifyOverviewMaterializationTablesReady(context: string) {
  await assertDbSchemaReady({
    tables: [...SHOPIFY_OVERVIEW_MATERIALIZATION_TABLES],
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
  return null;
}

/**
 * Explicit owner for Shopify overview serving-state transitions and reconciliation evidence.
 * Shared read helpers must stay on lib/shopify/read-adapter.ts and lib/shopify/warehouse.ts.
 */
export async function recordShopifyOverviewReconciliationRun(
  input: ShopifyReconciliationRunRecord,
) {
  await assertShopifyOverviewMaterializationTablesReady(
    "shopify_overview_materializer:record_reconciliation_run",
  );
  const sql = getDb();
  await sql`
    INSERT INTO shopify_reconciliation_runs (
      business_id,
      provider_account_id,
      reconciliation_key,
      start_date,
      end_date,
      preferred_source,
      can_serve_warehouse,
      selected_revenue_truth_basis,
      basis_selection_reason,
      transaction_coverage_order_rate,
      transaction_coverage_amount_rate,
      order_revenue_truth_delta,
      transaction_revenue_delta,
      explained_adjustment_revenue,
      unexplained_adjustment_revenue,
      divergence,
      warehouse_aggregate,
      ledger_aggregate,
      live_aggregate,
      recorded_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.reconciliationKey},
      ${normalizeDate(input.startDate)},
      ${normalizeDate(input.endDate)},
      ${input.preferredSource ?? null},
      ${Boolean(input.canServeWarehouse)},
      ${input.selectedRevenueTruthBasis ?? null},
      ${input.basisSelectionReason ?? null},
      ${input.transactionCoverageOrderRate ?? null},
      ${input.transactionCoverageAmountRate ?? null},
      ${input.orderRevenueTruthDelta ?? null},
      ${input.transactionRevenueDelta ?? null},
      ${input.explainedAdjustmentRevenue ?? null},
      ${input.unexplainedAdjustmentRevenue ?? null},
      ${JSON.stringify(input.divergence ?? null)}::jsonb,
      ${JSON.stringify(input.warehouseAggregate ?? null)}::jsonb,
      ${JSON.stringify(input.ledgerAggregate ?? null)}::jsonb,
      ${JSON.stringify(input.liveAggregate ?? null)}::jsonb,
      COALESCE(${normalizeTimestamp(input.recordedAt)}, now())
    )
  `;
}

export async function persistShopifyOverviewServingState(
  input: ShopifyServingStateRecord,
) {
  await assertShopifyOverviewMaterializationTablesReady(
    "shopify_overview_materializer:persist_serving_state",
  );
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
      production_mode,
      trust_state,
      fallback_reason,
      coverage_status,
      pending_repair,
      pending_repair_started_at,
      pending_repair_last_topic,
      pending_repair_last_received_at,
      consecutive_clean_validations,
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
      ${input.productionMode ?? null},
      ${input.trustState ?? null},
      ${input.fallbackReason ?? null},
      ${input.coverageStatus ?? null},
      ${Boolean(input.pendingRepair)},
      ${normalizeTimestamp(input.pendingRepairStartedAt)},
      ${input.pendingRepairLastTopic ?? null},
      ${normalizeTimestamp(input.pendingRepairLastReceivedAt)},
      ${Math.max(0, Math.trunc(input.consecutiveCleanValidations ?? 0))},
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
      production_mode = EXCLUDED.production_mode,
      trust_state = EXCLUDED.trust_state,
      fallback_reason = EXCLUDED.fallback_reason,
      coverage_status = EXCLUDED.coverage_status,
      pending_repair = EXCLUDED.pending_repair,
      pending_repair_started_at = EXCLUDED.pending_repair_started_at,
      pending_repair_last_topic = EXCLUDED.pending_repair_last_topic,
      pending_repair_last_received_at = EXCLUDED.pending_repair_last_received_at,
      consecutive_clean_validations = EXCLUDED.consecutive_clean_validations,
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
      production_mode,
      trust_state,
      fallback_reason,
      coverage_status,
      pending_repair,
      pending_repair_started_at,
      pending_repair_last_topic,
      pending_repair_last_received_at,
      consecutive_clean_validations,
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
      ${input.productionMode ?? null},
      ${input.trustState ?? null},
      ${input.fallbackReason ?? null},
      ${input.coverageStatus ?? null},
      ${Boolean(input.pendingRepair)},
      ${normalizeTimestamp(input.pendingRepairStartedAt)},
      ${input.pendingRepairLastTopic ?? null},
      ${normalizeTimestamp(input.pendingRepairLastReceivedAt)},
      ${Math.max(0, Math.trunc(input.consecutiveCleanValidations ?? 0))},
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
