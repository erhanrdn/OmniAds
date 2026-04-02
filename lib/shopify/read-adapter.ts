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
  const [status, live, warehouse, ledger] = await Promise.all([
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
  if (forcedLive) {
    decisionReasons.push("override_force_live");
  }
  if (forcedWarehouse) {
    decisionReasons.push("override_force_warehouse");
  }

  const canServeWarehouse =
    forcedWarehouse
      ? Boolean(warehouse)
      : !forcedLive &&
        canaryEnabled &&
        (previewAllowed || defaultCutoverEligible) &&
        status.state === "ready" &&
        divergence?.withinThreshold === true &&
        (ledgerConsistency === null || ledgerConsistency.withinThreshold === true);
  const preferredWarehouseSource =
    canServeWarehouse && ledger && ledgerConsistency?.withinThreshold === true
      ? "ledger"
      : "warehouse";

  const preferredSource = canServeWarehouse
    ? preferredWarehouseSource
    : forcedLive
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
    divergence:
      divergence || ledgerConsistency
        ? {
            ...(divergence ? { ...divergence } : {}),
            ...(ledgerConsistency ? { ledgerConsistency } : {}),
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
  } as const;
}
