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
  getShopifyServingState,
  getShopifyServingOverride,
  insertShopifyReconciliationRun,
  upsertShopifyServingState,
} from "@/lib/shopify/warehouse";

export type ShopifyProductionServingMode = "disabled" | "auto" | "force_live" | "force_warehouse";
export type ShopifyPreferredOverviewSource =
  | "ledger"
  | "warehouse"
  | "live"
  | "warehouse_shadow"
  | "none";
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
  source: "ledger" | "warehouse" | "live" | "none";
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
  const ordersRecentReady = Boolean(status.sync.ordersRecent?.latestSuccessfulSyncAt);
  const returnsHistoricalUnavailable =
    status.sync.returnsHistorical?.lastError === "returns_api_unavailable";
  const returnsRecentUnavailable =
    status.sync.returnsRecent?.lastError === "returns_api_unavailable";
  const returnsHistoricalReady =
    returnsHistoricalUnavailable || Boolean(status.sync.returnsHistorical?.readyThroughDate);
  const returnsRecentReady =
    returnsRecentUnavailable || Boolean(status.sync.returnsRecent?.latestSuccessfulSyncAt);

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

function buildServingMetadataFromPersisted(input: {
  persistedServing: Awaited<ReturnType<typeof getShopifyServingState>> | null;
  preferredSource: ShopifyPreferredOverviewSource;
}) {
  const persistedServing = input.persistedServing;
  return {
    source:
      input.preferredSource === "ledger"
        ? "ledger"
        : input.preferredSource === "warehouse"
          ? "warehouse"
          : input.preferredSource === "none"
            ? "none"
            : "live",
    provider: "shopify" as const,
    trustState: persistedServing?.trustState ?? (input.preferredSource === "none" ? "no_data" : "live_fallback"),
    fallbackReason: persistedServing?.fallbackReason ?? null,
    lastSyncedAt: persistedServing?.assessedAt ?? null,
    coverageStatus: persistedServing?.coverageStatus ?? "unknown",
    productionMode: persistedServing?.productionMode ?? "disabled",
    pendingRepair: persistedServing?.pendingRepair === true,
    pendingRepairStartedAt: persistedServing?.pendingRepairStartedAt ?? null,
    pendingRepairLastTopic: persistedServing?.pendingRepairLastTopic ?? null,
    pendingRepairLastReceivedAt: persistedServing?.pendingRepairLastReceivedAt ?? null,
    selectedRevenueTruthBasis:
      typeof persistedServing?.divergence?.selectedRevenueTruthBasis === "string"
        ? persistedServing.divergence.selectedRevenueTruthBasis
        : null,
    basisSelectionReason:
      typeof persistedServing?.divergence?.basisSelectionReason === "string"
        ? persistedServing.divergence.basisSelectionReason
        : null,
    transactionCoverageOrderRate:
      typeof persistedServing?.divergence?.transactionCoverageOrderRate === "number"
        ? persistedServing.divergence.transactionCoverageOrderRate
        : null,
    transactionCoverageAmountRate:
      typeof persistedServing?.divergence?.transactionCoverageAmountRate === "number"
        ? persistedServing.divergence.transactionCoverageAmountRate
        : null,
    explainedAdjustmentRevenue:
      typeof persistedServing?.divergence?.explainedAdjustmentRevenue === "number"
        ? persistedServing.divergence.explainedAdjustmentRevenue
        : null,
    unexplainedAdjustmentRevenue:
      typeof persistedServing?.divergence?.unexplainedAdjustmentRevenue === "number"
        ? persistedServing.divergence.unexplainedAdjustmentRevenue
        : null,
  } satisfies ShopifyOverviewServingMetadata;
}

export async function getShopifyOverviewSummaryReadCandidate(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const integration = await getIntegrationMetadata(input.businessId, "shopify").catch(() => null);
  const providerAccountId =
    integration?.status === "connected" && integration.provider_account_id
      ? integration.provider_account_id
      : null;
  const canaryKey = providerAccountId
    ? buildShopifyOverviewCanaryKey({
        startDate: input.startDate,
        endDate: input.endDate,
        timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
      })
    : null;
  const persistedServing =
    providerAccountId && canaryKey
      ? await getShopifyServingState({
          businessId: input.businessId,
          providerAccountId,
          canaryKey,
        }).catch(() => null)
      : null;

  let live = null;
  let warehouse = null;
  let ledger = null;
  let preferredSource: ShopifyPreferredOverviewSource = "none";

  const persistedPreferredSource =
    persistedServing?.preferredSource === "ledger" || persistedServing?.preferredSource === "warehouse"
      ? (persistedServing.preferredSource as ShopifyPreferredOverviewSource)
      : "live";
  const persistedTrusted = persistedServing?.trustState === "trusted";

  if (persistedTrusted && persistedPreferredSource === "ledger") {
    ledger = await getShopifyRevenueLedgerAggregate({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null);
    if (ledger) preferredSource = "ledger";
  }

  if (preferredSource === "none" && persistedTrusted && persistedPreferredSource === "warehouse") {
    warehouse = await getShopifyWarehouseOverviewAggregate({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null);
    if (warehouse) preferredSource = "warehouse";
  }

  if (preferredSource === "none") {
    live = await getShopifyOverviewAggregate(input).catch(() => null);
    if (live) {
      preferredSource = "live";
    } else if (!warehouse && persistedPreferredSource === "warehouse") {
      warehouse = await getShopifyWarehouseOverviewAggregate({
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
      }).catch(() => null);
      preferredSource = warehouse ? "warehouse_shadow" : "none";
    } else {
      preferredSource = "none";
    }
  }

  return {
    status: {
      state:
        integration?.status === "connected"
          ? preferredSource === "none"
            ? "partial"
            : "ready"
          : "not_connected",
      connected: integration?.status === "connected",
      shopId: providerAccountId,
      warehouse: null,
      sync: null,
      serving: persistedServing,
      reconciliation: null,
      issues: [],
    },
    live,
    warehouse,
    ledger,
    override: null,
    divergence: null,
    ledgerConsistency: null,
    decisionReasons: persistedServing?.decisionReasons ?? [],
    canaryEnabled: persistedServing?.canaryEnabled === true,
    preferredSource,
    canServeWarehouse: preferredSource === "ledger" || preferredSource === "warehouse",
    servingMetadata: buildServingMetadataFromPersisted({
      persistedServing,
      preferredSource,
    }),
  } as const;
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

  const baseTrustedReadEligible =
    !forcedLive &&
    !shopForcedLive &&
    !shopDisabled &&
    status.state === "ready" &&
    divergence?.withinThreshold === true;
  const ledgerTrusted =
    forcedWarehouse || shopForcedWarehouse
      ? Boolean(ledger && ledger.ledgerRows > 0)
      : baseTrustedReadEligible &&
        Boolean(ledger && ledger.ledgerRows > 0) &&
        ledgerConsistency?.withinThreshold === true;
  const warehouseTrusted =
    forcedWarehouse || shopForcedWarehouse
      ? Boolean(warehouse)
      : baseTrustedReadEligible &&
        canaryEnabled &&
        (previewAllowed || defaultCutoverEligible) &&
        Boolean(warehouse) &&
        (ledgerConsistency === null || ledgerConsistency.withinThreshold === true);

  if (!ledgerTrusted) {
    if (!canaryEnabled) {
      decisionReasons.push("warehouse_read_canary_disabled");
    }
    if (!previewAllowed && !defaultCutoverEligible) {
      decisionReasons.push("preview_canary_not_allowed_for_business");
    }
    if (defaultCutoverEnabled() && !defaultCutoverEligible && !previewAllowed) {
      decisionReasons.push("default_cutover_gate_not_met");
    }
  }

  const pendingRepair = persistedServing?.pendingRepair === true;
  const rawCanServeTrustedShopify = ledgerTrusted || warehouseTrusted;
  const canRecoverFromPendingRepair = rawCanServeTrustedShopify;
  const nextConsecutiveCleanValidations =
    pendingRepair && canRecoverFromPendingRepair
      ? (persistedServing?.consecutiveCleanValidations ?? 0) + 1
      : rawCanServeTrustedShopify
        ? Math.max(1, persistedServing?.consecutiveCleanValidations ?? 0)
        : 0;
  const recoveryUnlocked =
    pendingRepair && canRecoverFromPendingRepair && nextConsecutiveCleanValidations >= 2;
  const shouldHoldLiveForPendingRepair = pendingRepair && !recoveryUnlocked;
  if (shouldHoldLiveForPendingRepair) {
    decisionReasons.push("pending_repair");
  }

  const canServeTrustedShopify = rawCanServeTrustedShopify && !shouldHoldLiveForPendingRepair;
  const preferredSource: ShopifyPreferredOverviewSource = canServeTrustedShopify
    ? ledgerTrusted
      ? "ledger"
      : "warehouse"
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
    canServeTrustedShopify
      ? null
      : shopDisabled
        ? "production_serving_disabled"
        : shouldHoldLiveForPendingRepair
          ? "pending_repair"
          : pickFallbackReason(decisionReasons);
  const trustState: ShopifyServingTrustState =
    canServeTrustedShopify
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
    consecutiveCleanValidations: canServeTrustedShopify ? nextConsecutiveCleanValidations : 0,
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
    canServeWarehouse: canServeTrustedShopify,
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
    canServeWarehouse: canServeTrustedShopify,
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
    canServeWarehouse: canServeTrustedShopify,
    servingMetadata: {
      source:
        preferredSource === "ledger"
          ? "ledger"
          : preferredSource === "warehouse"
            ? "warehouse"
            : preferredSource === "none"
              ? "none"
              : "live",
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
