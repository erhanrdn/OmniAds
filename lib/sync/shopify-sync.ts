import { mergeIntegrationMetadata } from "@/lib/integrations";
import { hasShopifyScope, resolveShopifyAdminCredentials } from "@/lib/shopify/admin";
import { getShopifyOverviewReadCandidate } from "@/lib/shopify/read-adapter";
import {
  buildShopifyOverviewCanaryKey,
  SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
} from "@/lib/shopify/serving";
import {
  persistShopifyOverviewServingState,
  recordShopifyOverviewReconciliationRun,
} from "@/lib/shopify/overview-materializer";
import { syncShopifyOrdersWindow, syncShopifyReturnsWindow } from "@/lib/shopify/commerce-sync";
import { getShopifyRevenueLedgerAggregate } from "@/lib/shopify/revenue-ledger";
import { getShopifyStatus } from "@/lib/shopify/status";
import { registerShopifySyncWebhooks, verifyShopifySyncWebhooks } from "@/lib/shopify/webhooks";
import { getShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";
import { getShopifySyncState, upsertShopifySyncState } from "@/lib/shopify/sync-state";
import {
  shouldAutoWarmShopifyOverviewSnapshot,
} from "@/lib/sync/report-warmer-boundaries";
import type { RunnerLeaseGuard } from "@/lib/sync/worker-runtime";
import { warmShopifyOverviewReportCache } from "@/lib/user-facing-report-cache-owners";

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envFlag(name: string) {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function orchestrationStamp(step: string, status: "running" | "succeeded" | "failed" | "skipped", summary?: Record<string, unknown>) {
  return {
    step,
    status,
    recordedAt: new Date().toISOString(),
    ...(summary ? { summary } : {}),
  };
}

function getTodayIsoForTimeZoneServer(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function classifyShopifySyncWindow(
  credentials: Awaited<ReturnType<typeof resolveShopifyAdminCredentials>>,
  input?: { recentWindowDays?: number }
) {
  const timeZone =
    typeof credentials?.metadata?.iana_timezone === "string"
      ? credentials.metadata.iana_timezone
      : "UTC";
  const today = getTodayIsoForTimeZoneServer(timeZone);
  const historyDays = input?.recentWindowDays ?? envNumber("SHOPIFY_COMMERCE_SYNC_DAYS", 7);
  const end = new Date(`${today}T00:00:00Z`);
  const start = addDays(end, -(historyDays - 1));
  return {
    startDate: toIsoDate(start),
    endDate: today,
    today,
    timeZone,
  };
}

function classifyShopifyHistoricalWindow(
  credentials: Awaited<ReturnType<typeof resolveShopifyAdminCredentials>>
) {
  const timeZone =
    typeof credentials?.metadata?.iana_timezone === "string"
      ? credentials.metadata.iana_timezone
      : "UTC";
  const today = getTodayIsoForTimeZoneServer(timeZone);
  const historyDays = envNumber("SHOPIFY_HISTORICAL_SYNC_DAYS", 365);
  const chunkDays = envNumber("SHOPIFY_HISTORICAL_SYNC_CHUNK_DAYS", 14);
  const yesterday = addDays(new Date(`${today}T00:00:00Z`), -1);
  const start = addDays(yesterday, -(historyDays - 1));
  return {
    targetStartDate: toIsoDate(start),
    targetEndDate: toIsoDate(yesterday),
    chunkDays,
    today,
    timeZone,
  };
}

function addDaysToIsoDate(value: string, days: number) {
  return toIsoDate(addDays(new Date(`${value}T00:00:00Z`), days));
}

function minIsoDate(a: string, b: string) {
  return a <= b ? a : b;
}

function computeHistoricalChunk(input: {
  targetStartDate: string;
  targetEndDate: string;
  chunkDays: number;
  existingCursorValue?: string | null;
}) {
  const startDate = input.existingCursorValue
    ? addDaysToIsoDate(input.existingCursorValue, 1)
    : input.targetStartDate;
  if (startDate > input.targetEndDate) return null;
  const endDate = minIsoDate(addDaysToIsoDate(startDate, input.chunkDays - 1), input.targetEndDate);
  return { startDate, endDate };
}

function toSerializableRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

async function materializeShopifyOverviewAfterSync(input: {
  businessId: string;
  providerAccountId: string;
  startDate: string;
  endDate: string;
}) {
  const assessedAt = new Date().toISOString();
  const canaryKey = buildShopifyOverviewCanaryKey({
    startDate: input.startDate,
    endDate: input.endDate,
    timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
  });
  const candidate = await getShopifyOverviewReadCandidate({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const previousValidations = candidate.status.serving?.consecutiveCleanValidations ?? 0;
  const consecutiveCleanValidations =
    candidate.servingMetadata.pendingRepair
      ? previousValidations
      : candidate.servingMetadata.trustState === "trusted"
        ? Math.max(
            1,
            previousValidations + (candidate.status.serving?.pendingRepair ? 1 : 0),
          )
        : 0;
  const divergenceSnapshot = {
    aggregateDivergence: candidate.divergence ?? null,
    ledgerConsistency: candidate.ledgerConsistency ?? null,
    withinThreshold: candidate.divergence?.withinThreshold === true,
    selectedRevenueTruthBasis: candidate.servingMetadata.selectedRevenueTruthBasis,
    basisSelectionReason: candidate.servingMetadata.basisSelectionReason,
    transactionCoverageOrderRate: candidate.servingMetadata.transactionCoverageOrderRate,
    transactionCoverageAmountRate: candidate.servingMetadata.transactionCoverageAmountRate,
    explainedAdjustmentRevenue: candidate.servingMetadata.explainedAdjustmentRevenue,
    unexplainedAdjustmentRevenue: candidate.servingMetadata.unexplainedAdjustmentRevenue,
  } satisfies Record<string, unknown>;

  await persistShopifyOverviewServingState({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    canaryKey,
    startDate: input.startDate,
    endDate: input.endDate,
    timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
    assessedAt,
    statusState: candidate.status.state,
    preferredSource: candidate.preferredSource,
    productionMode: candidate.servingMetadata.productionMode,
    trustState: candidate.servingMetadata.trustState,
    fallbackReason: candidate.servingMetadata.fallbackReason,
    coverageStatus: candidate.servingMetadata.coverageStatus,
    pendingRepair: candidate.servingMetadata.pendingRepair,
    pendingRepairStartedAt: candidate.servingMetadata.pendingRepairStartedAt,
    pendingRepairLastTopic: candidate.servingMetadata.pendingRepairLastTopic,
    pendingRepairLastReceivedAt: candidate.servingMetadata.pendingRepairLastReceivedAt,
    consecutiveCleanValidations,
    ordersRecentSyncedAt: candidate.status.sync?.ordersRecent?.latestSuccessfulSyncAt ?? null,
    ordersRecentCursorTimestamp: candidate.status.sync?.ordersRecent?.cursorTimestamp ?? null,
    ordersRecentCursorValue: candidate.status.sync?.ordersRecent?.cursorValue ?? null,
    returnsRecentSyncedAt: candidate.status.sync?.returnsRecent?.latestSuccessfulSyncAt ?? null,
    returnsRecentCursorTimestamp: candidate.status.sync?.returnsRecent?.cursorTimestamp ?? null,
    returnsRecentCursorValue: candidate.status.sync?.returnsRecent?.cursorValue ?? null,
    ordersHistoricalSyncedAt:
      candidate.status.sync?.ordersHistorical?.latestSuccessfulSyncAt ?? null,
    ordersHistoricalReadyThroughDate:
      candidate.status.sync?.ordersHistorical?.readyThroughDate ?? null,
    ordersHistoricalTargetEnd:
      candidate.status.sync?.ordersHistorical?.historicalTargetEnd ?? null,
    returnsHistoricalSyncedAt:
      candidate.status.sync?.returnsHistorical?.latestSuccessfulSyncAt ?? null,
    returnsHistoricalReadyThroughDate:
      candidate.status.sync?.returnsHistorical?.readyThroughDate ?? null,
    returnsHistoricalTargetEnd:
      candidate.status.sync?.returnsHistorical?.historicalTargetEnd ?? null,
    canServeWarehouse: candidate.canServeWarehouse,
    canaryEnabled: candidate.canaryEnabled,
    decisionReasons: candidate.decisionReasons,
    divergence: divergenceSnapshot,
  });

  await recordShopifyOverviewReconciliationRun({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    reconciliationKey: canaryKey,
    startDate: input.startDate,
    endDate: input.endDate,
    preferredSource: candidate.preferredSource,
    canServeWarehouse: candidate.canServeWarehouse,
    selectedRevenueTruthBasis: candidate.servingMetadata.selectedRevenueTruthBasis,
    basisSelectionReason: candidate.servingMetadata.basisSelectionReason,
    transactionCoverageOrderRate: candidate.servingMetadata.transactionCoverageOrderRate,
    transactionCoverageAmountRate: candidate.servingMetadata.transactionCoverageAmountRate,
    orderRevenueTruthDelta: candidate.ledgerConsistency?.orderRevenueTruthDelta ?? null,
    transactionRevenueDelta: candidate.ledgerConsistency?.transactionRevenueDelta ?? null,
    explainedAdjustmentRevenue: candidate.servingMetadata.explainedAdjustmentRevenue,
    unexplainedAdjustmentRevenue: candidate.servingMetadata.unexplainedAdjustmentRevenue,
    divergence: divergenceSnapshot,
    warehouseAggregate: toSerializableRecord(candidate.warehouse),
    ledgerAggregate: toSerializableRecord(candidate.ledger),
    liveAggregate: toSerializableRecord(candidate.live),
    recordedAt: assessedAt,
  });

  return {
    preferredSource: candidate.preferredSource,
    trustState: candidate.servingMetadata.trustState,
    fallbackReason: candidate.servingMetadata.fallbackReason,
    pendingRepair: candidate.servingMetadata.pendingRepair,
    canServeWarehouse: candidate.canServeWarehouse,
    recordedAt: assessedAt,
  };
}

export async function syncShopifyCommerceReports(
  businessId: string,
  input?: {
    runtimeLeaseGuard?: RunnerLeaseGuard;
    recentWindowDays?: number;
    triggerReason?: string;
    recentTargets?: {
      orders?: boolean;
      returns?: boolean;
    };
    allowHistorical?: boolean;
    materializeOverviewState?: boolean;
  }
) {
  const credentials = await resolveShopifyAdminCredentials(businessId).catch(() => null);
  if (!credentials) {
    return {
      success: false,
      reason: "not_connected" as const,
      orders: 0,
      orderLines: 0,
      refunds: 0,
      transactions: 0,
      returns: 0,
      pages: 0,
      returnPages: 0,
    };
  }

  const window = classifyShopifySyncWindow(credentials, {
    recentWindowDays: input?.recentWindowDays,
  });
  const runOrdersRecent = input?.recentTargets?.orders !== false;
  const runReturnsRecent = input?.recentTargets?.returns !== false;
  const allowHistorical = input?.allowHistorical !== false;
  const shouldMaterializeOverviewState = shouldAutoWarmShopifyOverviewSnapshot(input);
  const historical = classifyShopifyHistoricalWindow(credentials);
  const existingOrdersState = await getShopifySyncState({
    businessId,
    providerAccountId: credentials.shopId,
    syncTarget: "commerce_orders_recent",
  }).catch(() => null);
  const existingReturnsState = await getShopifySyncState({
    businessId,
    providerAccountId: credentials.shopId,
    syncTarget: "commerce_returns_recent",
  }).catch(() => null);
  const existingHistoricalOrdersState = await getShopifySyncState({
    businessId,
    providerAccountId: credentials.shopId,
    syncTarget: "commerce_orders_historical",
  }).catch(() => null);
  const existingHistoricalReturnsState = await getShopifySyncState({
    businessId,
    providerAccountId: credentials.shopId,
    syncTarget: "commerce_returns_historical",
  }).catch(() => null);

  if (runOrdersRecent) {
    await upsertShopifySyncState({
      businessId,
      providerAccountId: credentials.shopId,
      syncTarget: "commerce_orders_recent",
      historicalTargetStart: existingOrdersState?.historicalTargetStart ?? window.startDate,
      historicalTargetEnd: existingOrdersState?.historicalTargetEnd ?? window.endDate,
      latestSyncStartedAt: new Date().toISOString(),
      latestSyncStatus: "running",
      latestSyncWindowStart: window.startDate,
      latestSyncWindowEnd: window.endDate,
      lastError: null,
    });
  }
  if (runReturnsRecent) {
    await upsertShopifySyncState({
      businessId,
      providerAccountId: credentials.shopId,
      syncTarget: "commerce_returns_recent",
      historicalTargetStart: existingReturnsState?.historicalTargetStart ?? window.startDate,
      historicalTargetEnd: existingReturnsState?.historicalTargetEnd ?? window.endDate,
      latestSyncStartedAt: new Date().toISOString(),
      latestSyncStatus: "running",
      latestSyncWindowStart: window.startDate,
      latestSyncWindowEnd: window.endDate,
      lastError: null,
    });
  }

  if (input?.runtimeLeaseGuard?.isLeaseLost()) {
    if (runOrdersRecent) {
      await upsertShopifySyncState({
        businessId,
        providerAccountId: credentials.shopId,
        syncTarget: "commerce_orders_recent",
        latestSyncStatus: "cancelled",
        latestSyncWindowStart: window.startDate,
        latestSyncWindowEnd: window.endDate,
        lastError: input.runtimeLeaseGuard.getLeaseLossReason(),
      });
    }
    if (runReturnsRecent) {
      await upsertShopifySyncState({
        businessId,
        providerAccountId: credentials.shopId,
        syncTarget: "commerce_returns_recent",
        latestSyncStatus: "cancelled",
        latestSyncWindowStart: window.startDate,
        latestSyncWindowEnd: window.endDate,
        lastError: input.runtimeLeaseGuard.getLeaseLossReason(),
      });
    }
    return {
      success: false,
      reason: "lease_lost" as const,
      orders: 0,
      orderLines: 0,
      refunds: 0,
      transactions: 0,
      returns: 0,
      pages: 0,
      returnPages: 0,
    };
  }

  try {
    const [ordersSettled, returnsSettled] = await Promise.allSettled([
      runOrdersRecent
        ? syncShopifyOrdersWindow({
            businessId,
            startDate: window.startDate,
            endDate: window.endDate,
            queryField: "updated_at",
          })
        : Promise.resolve({
            success: true as const,
            reason: "skipped" as const,
            orders: 0,
            orderLines: 0,
            refunds: 0,
            transactions: 0,
            pages: 0,
            maxUpdatedAt: null,
          }),
      runReturnsRecent
        ? syncShopifyReturnsWindow({
            businessId,
            startDate: window.startDate,
            endDate: window.endDate,
          })
        : Promise.resolve({
            success: true as const,
            reason: "skipped" as const,
            returns: 0,
            pages: 0,
            maxUpdatedAt: null,
          }),
    ]);
    const ordersResult =
      ordersSettled.status === "fulfilled"
        ? ordersSettled.value
        : {
            success: false as const,
            reason:
              ordersSettled.reason instanceof Error
                ? ordersSettled.reason.message
                : String(ordersSettled.reason),
            orders: 0,
            orderLines: 0,
            refunds: 0,
            transactions: 0,
            pages: 0,
            maxUpdatedAt: null,
          };
    const returnsResult =
      returnsSettled.status === "fulfilled"
        ? returnsSettled.value
        : {
            success: false as const,
            reason:
              returnsSettled.reason instanceof Error
                ? returnsSettled.reason.message
                : String(returnsSettled.reason),
            returns: 0,
            pages: 0,
            maxUpdatedAt: null,
          };
    if (!ordersResult.success) {
      if (runOrdersRecent) {
        await upsertShopifySyncState({
          businessId,
          providerAccountId: credentials.shopId,
          syncTarget: "commerce_orders_recent",
          latestSyncStatus: ordersResult.reason,
          latestSyncWindowStart: window.startDate,
          latestSyncWindowEnd: window.endDate,
          lastError: ordersResult.reason,
        });
      }
      return ordersResult;
    }
    if (!returnsResult.success) {
      if (runReturnsRecent) {
        await upsertShopifySyncState({
          businessId,
          providerAccountId: credentials.shopId,
          syncTarget: "commerce_returns_recent",
          latestSyncStatus: returnsResult.reason,
          latestSyncWindowStart: window.startDate,
          latestSyncWindowEnd: window.endDate,
          lastError: returnsResult.reason,
        });
      }
    }

    const warehouseShadow = await getShopifyWarehouseOverviewAggregate({
      businessId,
      providerAccountId: credentials.shopId,
      startDate: window.startDate,
      endDate: window.endDate,
    }).catch(() => null);
    const ledgerShadow = await getShopifyRevenueLedgerAggregate({
      businessId,
      providerAccountId: credentials.shopId,
      startDate: window.startDate,
      endDate: window.endDate,
    }).catch(() => null);

    const result = {
      success: true as const,
      reason: "ok" as const,
      orders: ordersResult.orders,
      orderLines: ordersResult.orderLines,
      refunds: ordersResult.refunds,
      transactions: ordersResult.transactions,
      returns: returnsResult.success ? returnsResult.returns : 0,
      pages: ordersResult.pages,
      returnPages: returnsResult.success ? returnsResult.pages : 0,
      reconciliation: {
        orderRows: ordersResult.orders,
        refundRows: ordersResult.refunds,
        transactionRows: ordersResult.transactions,
        returnRows: returnsResult.success ? returnsResult.returns : 0,
        orderPages: ordersResult.pages,
        returnPages: returnsResult.success ? returnsResult.pages : 0,
        warehouseShadow: warehouseShadow
          ? {
              revenue: warehouseShadow.revenue,
              grossRevenue: warehouseShadow.grossRevenue,
              refundedRevenue: warehouseShadow.refundedRevenue,
              purchases: warehouseShadow.purchases,
              returnEvents: warehouseShadow.returnEvents,
            }
          : null,
        ledgerShadow: ledgerShadow
          ? {
              revenue: ledgerShadow.revenue,
              grossRevenue: ledgerShadow.grossRevenue,
              refundedRevenue: ledgerShadow.refundedRevenue,
              purchases: ledgerShadow.purchases,
              returnEvents: ledgerShadow.returnEvents,
              ledgerRows: ledgerShadow.ledgerRows,
            }
          : null,
        triggerReason: input?.triggerReason ?? null,
        windowDays: input?.recentWindowDays ?? null,
        recentTargets: {
          orders: runOrdersRecent,
          returns: runReturnsRecent,
        },
        historicalTriggered: allowHistorical,
        returnsSyncReason: returnsResult.success ? null : returnsResult.reason,
      },
    };

    let historicalResult: null | {
      orders: number;
      orderLines: number;
      refunds: number;
      transactions: number;
      returns: number;
      pages: number;
      returnPages: number;
      chunkStartDate: string;
      chunkEndDate: string;
    } = null;

    if (allowHistorical && envFlag("SHOPIFY_HISTORICAL_SYNC_ENABLED") && hasShopifyScope(credentials.scopes, "read_all_orders")) {
      const ordersChunk = computeHistoricalChunk({
        targetStartDate: historical.targetStartDate,
        targetEndDate: historical.targetEndDate,
        chunkDays: historical.chunkDays,
        existingCursorValue: existingHistoricalOrdersState?.cursorValue,
      });
      const returnsChunk = computeHistoricalChunk({
        targetStartDate: historical.targetStartDate,
        targetEndDate: historical.targetEndDate,
        chunkDays: historical.chunkDays,
        existingCursorValue: existingHistoricalReturnsState?.cursorValue,
      });

      if (ordersChunk && returnsChunk) {
        await upsertShopifySyncState({
          businessId,
          providerAccountId: credentials.shopId,
          syncTarget: "commerce_orders_historical",
          historicalTargetStart: historical.targetStartDate,
          historicalTargetEnd: historical.targetEndDate,
          latestSyncStartedAt: new Date().toISOString(),
          latestSyncStatus: "running",
          latestSyncWindowStart: ordersChunk.startDate,
          latestSyncWindowEnd: ordersChunk.endDate,
          lastError: null,
        });
        await upsertShopifySyncState({
          businessId,
          providerAccountId: credentials.shopId,
          syncTarget: "commerce_returns_historical",
          historicalTargetStart: historical.targetStartDate,
          historicalTargetEnd: historical.targetEndDate,
          latestSyncStartedAt: new Date().toISOString(),
          latestSyncStatus: "running",
          latestSyncWindowStart: returnsChunk.startDate,
          latestSyncWindowEnd: returnsChunk.endDate,
          lastError: null,
        });

        const [historicalOrdersResult, historicalReturnsResult] = await Promise.all([
          syncShopifyOrdersWindow({
            businessId,
            startDate: ordersChunk.startDate,
            endDate: ordersChunk.endDate,
            queryField: "created_at",
          }),
          syncShopifyReturnsWindow({
            businessId,
            startDate: returnsChunk.startDate,
            endDate: returnsChunk.endDate,
          }),
        ]);

        if (historicalOrdersResult.success && historicalReturnsResult.success) {
          await upsertShopifySyncState({
            businessId,
            providerAccountId: credentials.shopId,
            syncTarget: "commerce_orders_historical",
            historicalTargetStart: historical.targetStartDate,
            historicalTargetEnd: historical.targetEndDate,
            readyThroughDate: ordersChunk.endDate,
            cursorTimestamp:
              historicalOrdersResult.maxUpdatedAt ?? `${ordersChunk.endDate}T23:59:59.000Z`,
            cursorValue: ordersChunk.endDate,
            latestSuccessfulSyncAt: new Date().toISOString(),
            latestSyncStatus:
              ordersChunk.endDate >= historical.targetEndDate ? "ready" : "succeeded",
            latestSyncWindowStart: ordersChunk.startDate,
            latestSyncWindowEnd: ordersChunk.endDate,
            lastError: null,
            lastResultSummary: {
              orderRows: historicalOrdersResult.orders,
              refundRows: historicalOrdersResult.refunds,
              transactionRows: historicalOrdersResult.transactions,
              pages: historicalOrdersResult.pages,
            },
          });
          await upsertShopifySyncState({
            businessId,
            providerAccountId: credentials.shopId,
            syncTarget: "commerce_returns_historical",
            historicalTargetStart: historical.targetStartDate,
            historicalTargetEnd: historical.targetEndDate,
            readyThroughDate: returnsChunk.endDate,
            cursorTimestamp: historicalReturnsResult.maxUpdatedAt ?? `${returnsChunk.endDate}T23:59:59.000Z`,
            cursorValue: returnsChunk.endDate,
            latestSuccessfulSyncAt: new Date().toISOString(),
            latestSyncStatus:
              returnsChunk.endDate >= historical.targetEndDate ? "ready" : "succeeded",
            latestSyncWindowStart: returnsChunk.startDate,
            latestSyncWindowEnd: returnsChunk.endDate,
            lastError: null,
            lastResultSummary: {
              returnRows: historicalReturnsResult.returns,
              pages: historicalReturnsResult.pages,
            },
          });

          historicalResult = {
            orders: historicalOrdersResult.orders,
            orderLines: historicalOrdersResult.orderLines,
            refunds: historicalOrdersResult.refunds,
            transactions: historicalOrdersResult.transactions,
            returns: historicalReturnsResult.returns,
            pages: historicalOrdersResult.pages,
            returnPages: historicalReturnsResult.pages,
            chunkStartDate: ordersChunk.startDate,
            chunkEndDate: ordersChunk.endDate,
          };
        } else {
          await upsertShopifySyncState({
            businessId,
            providerAccountId: credentials.shopId,
            syncTarget: "commerce_orders_historical",
            historicalTargetStart: historical.targetStartDate,
            historicalTargetEnd: historical.targetEndDate,
            latestSyncStatus: historicalOrdersResult.success ? "skipped" : historicalOrdersResult.reason,
            latestSyncWindowStart: ordersChunk.startDate,
            latestSyncWindowEnd: ordersChunk.endDate,
            lastError: historicalOrdersResult.success ? null : historicalOrdersResult.reason,
          });
          await upsertShopifySyncState({
            businessId,
            providerAccountId: credentials.shopId,
            syncTarget: "commerce_returns_historical",
            historicalTargetStart: historical.targetStartDate,
            historicalTargetEnd: historical.targetEndDate,
            latestSyncStatus: historicalReturnsResult.success ? "skipped" : historicalReturnsResult.reason,
            latestSyncWindowStart: returnsChunk.startDate,
            latestSyncWindowEnd: returnsChunk.endDate,
            lastError: historicalReturnsResult.success ? null : historicalReturnsResult.reason,
          });
        }
      }
    }

    if (runOrdersRecent) {
      await upsertShopifySyncState({
        businessId,
        providerAccountId: credentials.shopId,
        syncTarget: "commerce_orders_recent",
        historicalTargetStart: existingOrdersState?.historicalTargetStart ?? window.startDate,
        historicalTargetEnd: existingOrdersState?.historicalTargetEnd ?? window.endDate,
        readyThroughDate: window.endDate,
        cursorTimestamp: ordersResult.maxUpdatedAt ?? `${window.endDate}T23:59:59.000Z`,
        cursorValue: ordersResult.maxUpdatedAt ?? window.endDate,
        latestSyncStartedAt: new Date().toISOString(),
        latestSuccessfulSyncAt: new Date().toISOString(),
        latestSyncStatus: "succeeded",
        latestSyncWindowStart: window.startDate,
        latestSyncWindowEnd: window.endDate,
        lastError: null,
        lastResultSummary: result.reconciliation,
      });
    }
    if (runReturnsRecent) {
      await upsertShopifySyncState({
        businessId,
        providerAccountId: credentials.shopId,
        syncTarget: "commerce_returns_recent",
        historicalTargetStart: existingReturnsState?.historicalTargetStart ?? window.startDate,
        historicalTargetEnd: existingReturnsState?.historicalTargetEnd ?? window.endDate,
        readyThroughDate: window.endDate,
        cursorTimestamp:
          returnsResult.success
            ? returnsResult.maxUpdatedAt ?? `${window.endDate}T23:59:59.000Z`
            : existingReturnsState?.cursorTimestamp ?? null,
        cursorValue:
          returnsResult.success
            ? returnsResult.maxUpdatedAt ?? window.endDate
            : existingReturnsState?.cursorValue ?? null,
        latestSyncStartedAt: new Date().toISOString(),
        latestSuccessfulSyncAt:
          returnsResult.success ? new Date().toISOString() : existingReturnsState?.latestSuccessfulSyncAt ?? null,
        latestSyncStatus: returnsResult.success ? "succeeded" : "failed",
        latestSyncWindowStart: window.startDate,
        latestSyncWindowEnd: window.endDate,
        lastError: returnsResult.success ? null : returnsResult.reason,
        lastResultSummary: result.reconciliation,
      });
    }

    let materialization:
      | null
      | {
          preferredSource: string;
          trustState: string;
          fallbackReason: string | null;
          pendingRepair: boolean;
          canServeWarehouse: boolean;
          recordedAt: string;
          skipped?: boolean;
          reason?: string;
        } = null;
    if (shouldMaterializeOverviewState) {
      try {
        materialization = await materializeShopifyOverviewAfterSync({
          businessId,
          providerAccountId: credentials.shopId,
          startDate: window.startDate,
          endDate: window.endDate,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[shopify-sync] overview_materialization_failed", {
          businessId,
          providerAccountId: credentials.shopId,
          startDate: window.startDate,
          endDate: window.endDate,
          message,
        });
        materialization = {
          preferredSource: "none",
          trustState: "no_data",
          fallbackReason: "materialization_failed",
          pendingRepair: false,
          canServeWarehouse: false,
          recordedAt: new Date().toISOString(),
          reason: message,
        };
      }
    } else {
      materialization = {
        preferredSource: "none",
        trustState: "no_data",
        fallbackReason: null,
        pendingRepair: false,
        canServeWarehouse: false,
        recordedAt: new Date().toISOString(),
        skipped: true,
        reason: "disabled_for_call_site",
      };
    }

    if (shouldMaterializeOverviewState) {
      try {
        await warmShopifyOverviewReportCache({
          businessId,
          startDate: window.startDate,
          endDate: window.endDate,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[shopify-sync] overview_snapshot_warm_failed", {
          businessId,
          providerAccountId: credentials.shopId,
          startDate: window.startDate,
          endDate: window.endDate,
          message,
        });
      }
    }

    return {
      ...result,
      historical: historicalResult,
      materialization,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runOrdersRecent) {
      await upsertShopifySyncState({
        businessId,
        providerAccountId: credentials.shopId,
        syncTarget: "commerce_orders_recent",
        latestSyncStatus: "failed",
        latestSyncWindowStart: window.startDate,
        latestSyncWindowEnd: window.endDate,
        lastError: message,
      });
    }
    if (runReturnsRecent) {
      await upsertShopifySyncState({
        businessId,
        providerAccountId: credentials.shopId,
        syncTarget: "commerce_returns_recent",
        latestSyncStatus: "failed",
        latestSyncWindowStart: window.startDate,
        latestSyncWindowEnd: window.endDate,
        lastError: message,
      });
    }
    throw error;
  }
}

export async function ensureShopifyProviderReady(input: {
  businessId: string;
  recentWindowDays?: number;
  preferredVisibleWindowDays?: number;
  runHistoricalBootstrap?: boolean;
  triggerReason?: string;
}) {
  const startedAt = new Date().toISOString();
  const recentWindowDays = Math.max(1, input.recentWindowDays ?? 30);
  const visibleWindowDays = Math.max(
    recentWindowDays,
    input.preferredVisibleWindowDays ?? recentWindowDays
  );
  const writeProgress = async (patch: Record<string, unknown>) =>
    mergeIntegrationMetadata({
      businessId: input.businessId,
      provider: "shopify",
      metadata: {
        shopifyProviderReadiness: {
          startedAt,
          updatedAt: new Date().toISOString(),
          ...patch,
        },
      },
    }).catch(() => {});

  await writeProgress({
    status: "running",
    visibleWindowDays,
    recentWindowDays,
    triggerReason: input.triggerReason ?? null,
    steps: [orchestrationStamp("start", "running")],
  });

  const credentials = await resolveShopifyAdminCredentials(input.businessId).catch(() => null);
  if (!credentials) {
    await writeProgress({
      status: "failed",
      steps: [orchestrationStamp("auth", "failed", { reason: "not_connected" })],
      lastError: "not_connected",
    });
    return { success: false as const, reason: "not_connected" };
  }

  const steps: Array<Record<string, unknown>> = [];
  steps.push(
    orchestrationStamp("auth", "succeeded", {
      shopId: credentials.shopId,
      hasReadAllOrders: hasShopifyScope(credentials.scopes, "read_all_orders"),
      hasReadReturns: hasShopifyScope(credentials.scopes, "read_returns"),
    })
  );

  const webhookVerification = await verifyShopifySyncWebhooks({
    shopId: credentials.shopId,
    accessToken: credentials.accessToken,
  }).catch((error) => ({
    callbackUrl: null,
    desiredTopics: [] as string[],
    existingTopics: [] as string[],
    missingTopics: [] as string[],
    extraTopics: [] as string[],
    error: error instanceof Error ? error.message : String(error),
  }));
  if ("error" in webhookVerification) {
    steps.push(orchestrationStamp("webhooks_verify", "failed", { error: webhookVerification.error }));
  } else {
    const registration = await registerShopifySyncWebhooks({
      shopId: credentials.shopId,
      accessToken: credentials.accessToken,
    }).catch((error) => ({
      ...webhookVerification,
      created: [] as string[],
      error: error instanceof Error ? error.message : String(error),
    }));
    steps.push(
      "error" in registration
        ? orchestrationStamp("webhooks_register", "failed", { error: registration.error })
        : orchestrationStamp("webhooks_register", "succeeded", registration)
    );
  }

  const recentSync = await syncShopifyCommerceReports(input.businessId, {
    recentWindowDays,
    allowHistorical: input.runHistoricalBootstrap ?? true,
    triggerReason: input.triggerReason ?? "manual:ensure_provider_ready",
    recentTargets: { orders: true, returns: true },
  });
  steps.push(
    orchestrationStamp(
      "recent_bootstrap",
      recentSync.success ? "succeeded" : "failed",
      recentSync as unknown as Record<string, unknown>
    )
  );

  const today = getTodayIsoForTimeZoneServer(
    typeof credentials.metadata?.iana_timezone === "string"
      ? credentials.metadata.iana_timezone
      : "UTC"
  );
  const startDate = toIsoDate(addDays(new Date(`${today}T00:00:00Z`), -(visibleWindowDays - 1)));
  const servingCandidate = await getShopifyOverviewReadCandidate({
    businessId: input.businessId,
    startDate,
    endDate: today,
  }).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
  steps.push(
    "error" in servingCandidate
      ? orchestrationStamp("serving_refresh", "failed", { error: servingCandidate.error })
      : orchestrationStamp("serving_refresh", "succeeded", {
          preferredSource: servingCandidate.preferredSource,
          trustState: servingCandidate.servingMetadata.trustState,
          fallbackReason: servingCandidate.servingMetadata.fallbackReason,
        })
  );

  const status = await getShopifyStatus({
    businessId: input.businessId,
    startDate,
    endDate: today,
  }).catch(() => null);

  await writeProgress({
    status: recentSync.success ? "succeeded" : "failed",
    visibleWindowDays,
    recentWindowDays,
    latestSummary: recentSync,
    servingWindow: { startDate, endDate: today },
    steps,
    healthState: status?.state ?? null,
    completedAt: new Date().toISOString(),
    historicalCoverageIncomplete:
      !hasShopifyScope(credentials.scopes, "read_all_orders") || status?.issues.some((issue) => issue.includes("Historical Shopify backfill")) === true,
  });

  return {
    success: recentSync.success,
    recentSync,
    status,
    servingWindow: { startDate, endDate: today },
    webhookCoverage:
      "error" in webhookVerification
        ? null
        : {
            desiredTopics: webhookVerification.desiredTopics,
            existingTopics: webhookVerification.existingTopics,
            missingTopics: webhookVerification.missingTopics,
            extraTopics: webhookVerification.extraTopics,
          },
  };
}
