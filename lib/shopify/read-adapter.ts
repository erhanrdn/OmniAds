import { getIntegrationMetadata } from "@/lib/integrations";
import { getShopifyOverviewAggregate } from "@/lib/shopify/overview";
import { compareShopifyAggregates, compareShopifyWarehouseAndLedger } from "@/lib/shopify/divergence";
import {
  buildShopifyOverviewCanaryKey,
  buildShopifyOverviewOverrideKey,
  SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
} from "@/lib/shopify/serving";
import { getShopifyStatus } from "@/lib/shopify/status";
import { getShopifyRevenueLedgerAggregate } from "@/lib/shopify/revenue-ledger";
import { getShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";
import {
  getShopifyServingOverride,
  insertShopifyReconciliationRun,
  upsertShopifyServingState,
} from "@/lib/shopify/warehouse";

export type ShopifyProductionServingMode = "disabled" | "auto" | "force_live" | "force_warehouse";
export type ShopifyServingTrustState =
  | "trusted"
  | "live_fallback"
  | "pending_repair"
  | "disabled"
  | "no_data";
export type ShopifyServingCoverageStatus =
  | "recent_ready"
  | "recent_only"
  | "historical_incomplete"
  | "unknown";

export interface ShopifyOverviewServingMetadata {
  source: "warehouse" | "live" | "none";
  provider: "shopify";
  trustState: ShopifyServingTrustState;
  fallbackReason: string | null;
  lastSyncedAt: string | null;
  coverageStatus: ShopifyServingCoverageStatus;
  productionMode: ShopifyProductionServingMode;
  pendingRepair: boolean;
  pendingRepairStartedAt: string | null;
  pendingRepairLastTopic: string | null;
  pendingRepairLastReceivedAt: string | null;
  selectedRevenueTruthBasis: string | null;
  basisSelectionReason: string | null;
  transactionCoverageOrderRate: number | null;
  transactionCoverageAmountRate: number | null;
  explainedAdjustmentRevenue: number | null;
  unexplainedAdjustmentRevenue: number | null;
}

function resolveProductionMode(raw: unknown): ShopifyProductionServingMode {
  if (
    raw === "disabled" ||
    raw === "auto" ||
    raw === "force_live" ||
    raw === "force_warehouse"
  ) {
    return raw;
  }
  return "disabled";
}

function pickFallbackReason(reasons: string[]) {
  return reasons[0] ?? null;
}

function pickLatestTimestamp(values: Array<string | null | undefined>) {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms) && ms > latestMs) {
      latest = value;
      latestMs = ms;
    }
  }
  return latest;
}

function resolveCoverageStatus(status: Awaited<ReturnType<typeof getShopifyStatus>>): ShopifyServingCoverageStatus {
  if (!status.sync) return "unknown";
  const ordersHistoricalReady = Boolean(status.sync.ordersHistorical?.readyThroughDate);
  const returnsHistoricalReady = Boolean(status.sync.returnsHistorical?.readyThroughDate);
  const ordersRecentReady = Boolean(status.sync.ordersRecent?.latestSuccessfulSyncAt);
  const returnsRecentReady = Boolean(status.sync.returnsRecent?.latestSuccessfulSyncAt);

  if (ordersHistoricalReady && returnsHistoricalReady) return "recent_ready";
  if (ordersRecentReady && returnsRecentReady) return "historical_incomplete";
  if (ordersRecentReady || returnsRecentReady) return "recent_only";
  return "unknown";
}

function warehouseReadCanaryEnabled() {
  const raw = process.env.SHOPIFY_WAREHOUSE_READ_CANARY?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function isPreviewCanaryBusiness(businessId: string) {
  const raw = process.env.SHOPIFY_WAREHOUSE_PREVIEW_CANARY_BUSINESSES?.trim();
  if (!raw) return true;
  const set = new Set(
    raw
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return set.has(businessId);
}

function defaultCutoverEnabled() {
  const raw = process.env.SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export async function getShopifyOverviewReadCandidate(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const [integration, status, live, warehouse, ledger] = await Promise.all([
    getIntegrationMetadata(input.businessId, "shopify").catch(() => null),
    getShopifyStatus({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      ignoreServingTrust: true,
    }),
    getShopifyOverviewAggregate(input),
    getShopifyWarehouseOverviewAggregate({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
    getShopifyRevenueLedgerAggregate({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
  ]);
  const override =
    status.shopId
      ? await getShopifyServingOverride({
          businessId: input.businessId,
          providerAccountId: status.shopId,
          overrideKey: buildShopifyOverviewOverrideKey({
            startDate: input.startDate,
            endDate: input.endDate,
            timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
          }),
        }).catch(() => null)
      : null;

  const divergence =
    live && warehouse
      ? compareShopifyAggregates({
          live,
          warehouse,
        })
      : null;
  const ledgerConsistency =
    warehouse && ledger
      ? compareShopifyWarehouseAndLedger({
          warehouse,
          ledger,
        })
      : null;
  const persistedServing = status.serving;
  const productionMode = resolveProductionMode(
    integration?.metadata?.shopifyProductionServingMode
  );

  const decisionReasons: string[] = [];
  const canaryEnabled = warehouseReadCanaryEnabled();
  const previewAllowed = isPreviewCanaryBusiness(input.businessId);
  const defaultCutoverEligible = status.reconciliation?.defaultCutoverEligible === true;
  if (!canaryEnabled) {
    decisionReasons.push("warehouse_read_canary_disabled");
  }
  if (!previewAllowed && !defaultCutoverEligible) {
    decisionReasons.push("preview_canary_not_allowed_for_business");
  }
  if (defaultCutoverEnabled() && !defaultCutoverEligible && !previewAllowed) {
    decisionReasons.push("default_cutover_gate_not_met");
  }
  if (status.state !== "ready") {
    decisionReasons.push(`status_${status.state}`);
  }
  if (!warehouse) {
    decisionReasons.push("warehouse_aggregate_unavailable");
  }
  if (!live) {
    decisionReasons.push("live_aggregate_unavailable");
  }
  if (live && warehouse && divergence?.withinThreshold !== true) {
    decisionReasons.push("divergence_above_threshold");
  }
  if (warehouse && ledger && ledgerConsistency?.withinThreshold !== true) {
    decisionReasons.push("ledger_semantics_above_threshold");
    if (ledgerConsistency?.failureReasons?.length) {
      decisionReasons.push(
        ...ledgerConsistency.failureReasons.map((reason) => `ledger_${reason}`)
      );
    }
  }

  const forcedLive = override?.mode === "force_live";
  const forcedWarehouse = override?.mode === "force_warehouse";
  const shopForcedLive = productionMode === "force_live";
  const shopForcedWarehouse = productionMode === "force_warehouse";
  const shopDisabled = productionMode === "disabled";
  if (forcedLive) {
    decisionReasons.push("override_force_live");
  }
  if (forcedWarehouse) {
    decisionReasons.push("override_force_warehouse");
  }
  if (shopForcedLive) {
    decisionReasons.push("shop_force_live");
  }
  if (shopForcedWarehouse) {
    decisionReasons.push("shop_force_warehouse");
  }
  if (shopDisabled) {
    decisionReasons.push("shop_production_serving_disabled");
  }

  const rawCanServeWarehouse =
    forcedWarehouse || shopForcedWarehouse
      ? Boolean(warehouse)
      : !forcedLive &&
        !shopForcedLive &&
        !shopDisabled &&
        canaryEnabled &&
        (previewAllowed || defaultCutoverEligible) &&
        status.state === "ready" &&
        divergence?.withinThreshold === true &&
        (ledgerConsistency === null || ledgerConsistency.withinThreshold === true);
  const preferredWarehouseSource =
    rawCanServeWarehouse && ledger && ledgerConsistency?.withinThreshold === true
      ? "ledger"
      : "warehouse";

  const pendingRepair = persistedServing?.pendingRepair === true;
  const canRecoverFromPendingRepair = rawCanServeWarehouse;
  const nextConsecutiveCleanValidations =
    pendingRepair && canRecoverFromPendingRepair
      ? (persistedServing?.consecutiveCleanValidations ?? 0) + 1
      : rawCanServeWarehouse
        ? Math.max(1, persistedServing?.consecutiveCleanValidations ?? 0)
        : 0;
  const recoveryUnlocked =
    pendingRepair && canRecoverFromPendingRepair && nextConsecutiveCleanValidations >= 2;
  const shouldHoldLiveForPendingRepair = pendingRepair && !recoveryUnlocked;
  if (shouldHoldLiveForPendingRepair) {
    decisionReasons.push("pending_repair");
  }

  const canServeWarehouse = rawCanServeWarehouse && !shouldHoldLiveForPendingRepair;
  const preferredSource = canServeWarehouse
    ? preferredWarehouseSource
    : forcedLive || shopForcedLive || shopDisabled
      ? live
        ? "live"
        : warehouse
          ? "warehouse_shadow"
          : "none"
      : live
      ? "live"
      : warehouse
        ? "warehouse_shadow"
        : "none";

  const selectedRevenueTruthBasis = ledgerConsistency?.preferredOrderRevenueBasis ?? null;
  const ledgerAdjustmentRevenue =
    typeof ledgerConsistency?.ledgerAdjustmentRevenue === "number"
      ? ledgerConsistency.ledgerAdjustmentRevenue
      : 0;
  const explainedAdjustmentRevenue =
    ledgerAdjustmentRevenue < 0
      ? Math.abs(ledgerAdjustmentRevenue)
      : 0;
  const unexplainedAdjustmentRevenue =
    ledgerAdjustmentRevenue > 0
      ? ledgerAdjustmentRevenue
      : 0;
  const transactionCoverageAmountRate = ledgerConsistency?.transactionCoverageAmountRate ?? null;
  const fallbackReason =
    canServeWarehouse
      ? null
      : shopDisabled
        ? "production_serving_disabled"
        : shouldHoldLiveForPendingRepair
          ? "pending_repair"
          : pickFallbackReason(decisionReasons);
  const trustState: ShopifyServingTrustState =
    canServeWarehouse
      ? "trusted"
      : preferredSource === "none"
        ? "no_data"
        : shouldHoldLiveForPendingRepair
          ? "pending_repair"
          : shopDisabled
            ? "disabled"
            : "live_fallback";
  const coverageStatus = resolveCoverageStatus(status);
  const lastSyncedAt = pickLatestTimestamp([
    status.sync?.ordersRecent?.latestSuccessfulSyncAt ?? null,
    status.sync?.returnsRecent?.latestSuccessfulSyncAt ?? null,
    status.sync?.ordersHistorical?.latestSuccessfulSyncAt ?? null,
    status.sync?.returnsHistorical?.latestSuccessfulSyncAt ?? null,
  ]);

  const canaryKey = buildShopifyOverviewCanaryKey({
    startDate: input.startDate,
    endDate: input.endDate,
    timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
  });

  await upsertShopifyServingState({
    businessId: input.businessId,
    providerAccountId: status.shopId ?? "unknown",
    canaryKey,
    startDate: input.startDate,
    endDate: input.endDate,
    timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
    assessedAt: new Date().toISOString(),
    statusState: status.state,
    preferredSource,
    productionMode,
    trustState,
    fallbackReason,
    coverageStatus,
    pendingRepair: shouldHoldLiveForPendingRepair,
    pendingRepairStartedAt:
      shouldHoldLiveForPendingRepair
        ? persistedServing?.pendingRepairStartedAt ?? new Date().toISOString()
        : null,
    pendingRepairLastTopic:
      shouldHoldLiveForPendingRepair
        ? persistedServing?.pendingRepairLastTopic ?? null
        : null,
    pendingRepairLastReceivedAt:
      shouldHoldLiveForPendingRepair
        ? persistedServing?.pendingRepairLastReceivedAt ?? null
        : null,
    consecutiveCleanValidations: canServeWarehouse ? nextConsecutiveCleanValidations : 0,
    ordersRecentSyncedAt: status.sync?.ordersRecent?.latestSuccessfulSyncAt ?? null,
    ordersRecentCursorTimestamp: status.sync?.ordersRecent?.cursorTimestamp ?? null,
    ordersRecentCursorValue: status.sync?.ordersRecent?.cursorValue ?? null,
    returnsRecentSyncedAt: status.sync?.returnsRecent?.latestSuccessfulSyncAt ?? null,
    returnsRecentCursorTimestamp: status.sync?.returnsRecent?.cursorTimestamp ?? null,
    returnsRecentCursorValue: status.sync?.returnsRecent?.cursorValue ?? null,
    ordersHistoricalSyncedAt: status.sync?.ordersHistorical?.latestSuccessfulSyncAt ?? null,
    ordersHistoricalReadyThroughDate: status.sync?.ordersHistorical?.readyThroughDate ?? null,
    ordersHistoricalTargetEnd: status.sync?.ordersHistorical?.historicalTargetEnd ?? null,
    returnsHistoricalSyncedAt: status.sync?.returnsHistorical?.latestSuccessfulSyncAt ?? null,
    returnsHistoricalReadyThroughDate: status.sync?.returnsHistorical?.readyThroughDate ?? null,
    returnsHistoricalTargetEnd: status.sync?.returnsHistorical?.historicalTargetEnd ?? null,
    canServeWarehouse,
    canaryEnabled,
    decisionReasons,
    divergence: divergence
      ? {
          ...divergence,
          ledgerConsistency,
          servingMetadata: {
            selectedRevenueTruthBasis,
            basisSelectionReason:
              selectedRevenueTruthBasis === "current_total_price"
                ? "closest_current_order_revenue"
                : selectedRevenueTruthBasis === "gross_minus_total_refunded"
                  ? "closest_gross_minus_refunds_revenue"
                  : null,
            transactionCoverageAmountRate,
            transactionCoverageOrderRate: ledgerConsistency?.transactionCoverageRate ?? null,
            explainedAdjustmentRevenue,
            unexplainedAdjustmentRevenue,
          },
          ledgerRevenue: ledger?.revenue ?? null,
          ledgerGrossRevenue: ledger?.grossRevenue ?? null,
          ledgerRefundedRevenue: ledger?.refundedRevenue ?? null,
          ledgerPurchases: ledger?.purchases ?? null,
          ledgerRows: ledger?.ledgerRows ?? null,
        }
      : ledger
        ? {
            ledgerRevenue: ledger.revenue,
            ledgerGrossRevenue: ledger.grossRevenue,
            ledgerRefundedRevenue: ledger.refundedRevenue,
            ledgerPurchases: ledger.purchases,
            ledgerRows: ledger.ledgerRows,
          }
        : null,
  }).catch(() => null);
  await insertShopifyReconciliationRun({
    businessId: input.businessId,
    providerAccountId: status.shopId ?? "unknown",
    reconciliationKey: canaryKey,
    startDate: input.startDate,
    endDate: input.endDate,
    preferredSource,
    canServeWarehouse,
    selectedRevenueTruthBasis,
    basisSelectionReason:
      selectedRevenueTruthBasis === "current_total_price"
        ? "closest_current_order_revenue"
        : selectedRevenueTruthBasis === "gross_minus_total_refunded"
          ? "closest_gross_minus_refunds_revenue"
          : null,
    transactionCoverageOrderRate: ledgerConsistency?.transactionCoverageRate ?? null,
    transactionCoverageAmountRate,
    orderRevenueTruthDelta: ledgerConsistency?.orderRevenueTruthDelta ?? null,
    transactionRevenueDelta: ledgerConsistency?.transactionRevenueDelta ?? null,
    explainedAdjustmentRevenue,
    unexplainedAdjustmentRevenue,
    divergence:
      divergence || ledgerConsistency
        ? {
            ...(divergence ? { ...divergence } : {}),
            ...(ledgerConsistency ? { ledgerConsistency } : {}),
            selectedRevenueTruthBasis,
            basisSelectionReason:
              selectedRevenueTruthBasis === "current_total_price"
                ? "closest_current_order_revenue"
                : selectedRevenueTruthBasis === "gross_minus_total_refunded"
                  ? "closest_gross_minus_refunds_revenue"
                  : null,
            transactionCoverageAmountRate,
            transactionCoverageOrderRate: ledgerConsistency?.transactionCoverageRate ?? null,
            orderRevenueTruthDelta: ledgerConsistency?.orderRevenueTruthDelta ?? null,
            transactionRevenueDelta: ledgerConsistency?.transactionRevenueDelta ?? null,
            explainedAdjustmentRevenue,
            unexplainedAdjustmentRevenue,
          }
        : null,
    warehouseAggregate: warehouse ? { ...warehouse } : null,
    ledgerAggregate: ledger ? { ...ledger } : null,
    liveAggregate: live ? { ...live } : null,
    recordedAt: new Date().toISOString(),
  }).catch(() => null);

  return {
    status,
    live,
    warehouse,
    ledger,
    override,
    divergence,
    ledgerConsistency,
    decisionReasons,
    canaryEnabled,
    preferredSource,
    canServeWarehouse,
    servingMetadata: {
      source: canServeWarehouse ? "warehouse" : preferredSource === "none" ? "none" : "live",
      provider: "shopify",
      trustState,
      fallbackReason,
      lastSyncedAt,
      coverageStatus,
      productionMode,
      pendingRepair: shouldHoldLiveForPendingRepair,
      pendingRepairStartedAt:
        shouldHoldLiveForPendingRepair ? persistedServing?.pendingRepairStartedAt ?? new Date().toISOString() : null,
      pendingRepairLastTopic:
        shouldHoldLiveForPendingRepair ? persistedServing?.pendingRepairLastTopic ?? null : null,
      pendingRepairLastReceivedAt:
        shouldHoldLiveForPendingRepair ? persistedServing?.pendingRepairLastReceivedAt ?? null : null,
      selectedRevenueTruthBasis,
      basisSelectionReason:
        selectedRevenueTruthBasis === "current_total_price"
          ? "closest_current_order_revenue"
          : selectedRevenueTruthBasis === "gross_minus_total_refunded"
            ? "closest_gross_minus_refunds_revenue"
            : null,
      transactionCoverageOrderRate: ledgerConsistency?.transactionCoverageRate ?? null,
      transactionCoverageAmountRate,
      explainedAdjustmentRevenue,
      unexplainedAdjustmentRevenue,
    },
  } as const;
}
