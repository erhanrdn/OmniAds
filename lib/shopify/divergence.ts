import type { ShopifyOverviewAggregate } from "@/lib/shopify/overview";
import type { ShopifyRevenueLedgerAggregate } from "@/lib/shopify/revenue-ledger";
import type { ShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percentDelta(base: number, delta: number) {
  const normalizedBase = Math.abs(base);
  const normalizedDelta = Math.abs(delta);
  if (normalizedBase > 0) {
    return round2((normalizedDelta / normalizedBase) * 100);
  }
  return normalizedDelta === 0 ? 0 : 100;
}

function explainedRefundLikeAdjustment(adjustmentRevenue: number) {
  return round2(Math.abs(Math.min(adjustmentRevenue, 0)));
}

function pickClosestToZero(candidates: number[]) {
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate) < Math.abs(best) ? candidate : best,
  );
}

export interface ShopifyAggregateDivergence {
  liveRevenue: number;
  warehouseRevenue: number;
  revenueDelta: number;
  revenueDeltaPercent: number | null;
  livePurchases: number;
  warehousePurchases: number;
  purchaseDelta: number;
  liveAov: number | null;
  warehouseAov: number | null;
  aovDelta: number | null;
  maxDailyRevenueDeltaPercent: number | null;
  maxDailyPurchaseDelta: number | null;
  withinThreshold: boolean;
}

export interface ShopifyLedgerConsistency {
  warehouseRevenue: number;
  ledgerRevenue: number;
  revenueDelta: number;
  revenueDeltaPercent: number | null;
  warehousePurchases: number;
  ledgerPurchases: number;
  purchaseDelta: number;
  warehouseRefundedRevenue: number;
  ledgerRefundedRevenue: number;
  refundedRevenueDelta: number;
  warehouseReturnEvents: number;
  ledgerReturnEvents: number;
  returnEventDelta: number;
  currentOrderRevenue: number | null;
  grossMinusRefundsOrderRevenue: number | null;
  preferredOrderRevenueBasis: "current_total_price" | "gross_minus_total_refunded" | null;
  orderRevenueTruthDelta: number | null;
  transactionNetRevenue: number | null;
  transactionRevenueDelta: number | null;
  transactionCoveredOrders: number;
  transactionCoveredRevenue: number | null;
  transactionCoverageRate: number | null;
  transactionCoverageAmountRate: number | null;
  ledgerAdjustmentRevenue: number;
  adjustmentRevenueDelta: number;
  refundPressureDelta: number;
  maxDailyRevenueDeltaPercent: number | null;
  maxDailyPurchaseDelta: number | null;
  maxDailyRefundPressureDelta: number | null;
  maxDailyAdjustmentDelta: number | null;
  maxDailySemanticDrift: number | null;
  consistencyScore: number;
  failureReasons: string[];
  withinThreshold: boolean;
}

export function compareShopifyAggregates(input: {
  live: ShopifyOverviewAggregate;
  warehouse: ShopifyWarehouseOverviewAggregate;
  ledger?: ShopifyRevenueLedgerAggregate | null;
  maxRevenueDeltaPercent?: number;
  maxPurchaseDelta?: number;
  maxAovDelta?: number;
  maxDailyRevenueDeltaPercent?: number;
  maxDailyPurchaseDelta?: number;
}) {
  const currentOrderRevenue =
    typeof input.ledger?.currentOrderRevenue === "number"
      ? round2(input.ledger.currentOrderRevenue)
      : null;
  const grossMinusRefundsOrderRevenue =
    typeof input.ledger?.grossMinusRefundsOrderRevenue === "number"
      ? round2(input.ledger.grossMinusRefundsOrderRevenue)
      : null;
  const comparisonWarehouseRevenue =
    currentOrderRevenue !== null || grossMinusRefundsOrderRevenue !== null
      ? pickClosestToZero(
          [currentOrderRevenue, grossMinusRefundsOrderRevenue].filter(
            (value): value is number => value !== null,
          ).map((value) => round2(value - input.live.revenue)),
        ) + input.live.revenue
      : round2(input.warehouse.revenue);
  const compareAgainstOrderRevenue =
    comparisonWarehouseRevenue !== round2(input.warehouse.revenue);
  const revenueDelta = round2(comparisonWarehouseRevenue - input.live.revenue);
  const revenueDeltaPercent = percentDelta(input.live.revenue, revenueDelta);
  const purchaseDelta = input.warehouse.purchases - input.live.purchases;
  const aovDelta =
    input.live.averageOrderValue !== null && input.warehouse.averageOrderValue !== null
      ? round2(input.warehouse.averageOrderValue - input.live.averageOrderValue)
      : null;
  const maxRevenueDeltaPercent = input.maxRevenueDeltaPercent ?? 3;
  const maxPurchaseDelta = input.maxPurchaseDelta ?? 3;
  const maxAovDelta = input.maxAovDelta ?? 10;
  const maxDailyRevenueDeltaPercent = input.maxDailyRevenueDeltaPercent ?? 10;
  const maxDailyPurchaseDelta = input.maxDailyPurchaseDelta ?? 2;

  const liveDailyByDate = new Map(input.live.dailyTrends.map((row) => [row.date, row]));
  const warehouseDailyByDate = new Map(input.warehouse.daily.map((row) => [row.date, row]));
  const allDates = new Set([
    ...input.live.dailyTrends.map((row) => row.date),
    ...input.warehouse.daily.map((row) => row.date),
  ]);
  let observedMaxDailyRevenueDeltaPercent: number | null = null;
  let observedMaxDailyPurchaseDelta: number | null = null;

  for (const date of allDates) {
    const liveRow = liveDailyByDate.get(date);
    const warehouseRow = warehouseDailyByDate.get(date);
    const liveRevenue = round2(liveRow?.revenue ?? 0);
    const warehouseRevenue = round2(
      compareAgainstOrderRevenue
        ? warehouseRow?.orderRevenue ?? 0
        : warehouseRow?.netRevenue ?? 0,
    );
    const revenueDeltaForDay = round2(warehouseRevenue - liveRevenue);
    const revenueDeltaPercentForDay = percentDelta(liveRevenue, revenueDeltaForDay);
    if (
      observedMaxDailyRevenueDeltaPercent === null ||
      revenueDeltaPercentForDay > observedMaxDailyRevenueDeltaPercent
    ) {
      observedMaxDailyRevenueDeltaPercent = revenueDeltaPercentForDay;
    }

    const purchaseDeltaForDay = Math.abs((warehouseRow?.orders ?? 0) - (liveRow?.purchases ?? 0));
    if (
      observedMaxDailyPurchaseDelta === null ||
      purchaseDeltaForDay > observedMaxDailyPurchaseDelta
    ) {
      observedMaxDailyPurchaseDelta = purchaseDeltaForDay;
    }
  }

  return {
    liveRevenue: round2(input.live.revenue),
    warehouseRevenue: round2(comparisonWarehouseRevenue),
    revenueDelta,
    revenueDeltaPercent,
    livePurchases: input.live.purchases,
    warehousePurchases: input.warehouse.purchases,
    purchaseDelta,
    liveAov: input.live.averageOrderValue,
    warehouseAov: input.warehouse.averageOrderValue,
    aovDelta,
    maxDailyRevenueDeltaPercent: observedMaxDailyRevenueDeltaPercent,
    maxDailyPurchaseDelta: observedMaxDailyPurchaseDelta,
    withinThreshold:
      (revenueDeltaPercent === null || revenueDeltaPercent <= maxRevenueDeltaPercent) &&
      Math.abs(purchaseDelta) <= maxPurchaseDelta &&
      (aovDelta === null || Math.abs(aovDelta) <= maxAovDelta) &&
      (observedMaxDailyRevenueDeltaPercent === null ||
        observedMaxDailyRevenueDeltaPercent <= maxDailyRevenueDeltaPercent) &&
      (observedMaxDailyPurchaseDelta === null ||
        observedMaxDailyPurchaseDelta <= maxDailyPurchaseDelta),
  } satisfies ShopifyAggregateDivergence;
}

export function compareShopifyWarehouseAndLedger(input: {
  warehouse: ShopifyWarehouseOverviewAggregate;
  ledger: ShopifyRevenueLedgerAggregate;
  maxRevenueDeltaPercent?: number;
  maxPurchaseDelta?: number;
  maxRefundedRevenueDelta?: number;
  maxReturnEventDelta?: number;
  maxAdjustmentRevenueDelta?: number;
  maxDailyRevenueDeltaPercent?: number;
  maxDailyPurchaseDelta?: number;
  maxDailyRefundPressureDelta?: number;
  maxDailyAdjustmentDelta?: number;
  maxDailySemanticDrift?: number;
  maxOrderRevenueTruthDelta?: number;
  maxTransactionRevenueDelta?: number;
  minTransactionCoverageRate?: number;
}) {
  const revenueDelta = round2(input.ledger.revenue - input.warehouse.revenue);
  const revenueDeltaPercent = percentDelta(input.warehouse.revenue, revenueDelta);
  const purchaseDelta = input.ledger.purchases - input.warehouse.purchases;
  const explainedAdjustmentRefunds = explainedRefundLikeAdjustment(
    input.ledger.adjustmentRevenue ?? 0
  );
  const refundedRevenueDelta = pickClosestToZero([
    round2(input.ledger.refundedRevenue - input.warehouse.refundedRevenue),
    round2(
      input.ledger.refundedRevenue -
        input.warehouse.refundedRevenue -
        explainedAdjustmentRefunds
    ),
  ]);
  const returnEventDelta = input.ledger.returnEvents - input.warehouse.returnEvents;
  const adjustmentRevenueDelta =
    revenueDelta === 0 && refundedRevenueDelta === 0
      ? 0
      : round2(input.ledger.adjustmentRevenue ?? 0);
  const currentOrderRevenue =
    typeof input.ledger.currentOrderRevenue === "number"
      ? round2(input.ledger.currentOrderRevenue)
      : null;
  const carryoverRefundRevenue = round2(input.ledger.carryoverRefundRevenue ?? 0);
  const normalizedCurrentOrderRevenue =
    currentOrderRevenue === null ? null : round2(currentOrderRevenue - carryoverRefundRevenue);
  const grossMinusRefundsOrderRevenue =
    typeof input.ledger.grossMinusRefundsOrderRevenue === "number"
      ? round2(input.ledger.grossMinusRefundsOrderRevenue)
      : null;
  const normalizedGrossMinusRefundsOrderRevenue =
    grossMinusRefundsOrderRevenue === null
      ? null
      : round2(grossMinusRefundsOrderRevenue - carryoverRefundRevenue);
  const currentOrderTruthDelta =
    normalizedCurrentOrderRevenue === null
      ? null
      : round2(input.ledger.revenue - normalizedCurrentOrderRevenue);
  const grossMinusRefundsTruthDelta =
    normalizedGrossMinusRefundsOrderRevenue === null
      ? null
      : round2(input.ledger.revenue - normalizedGrossMinusRefundsOrderRevenue);
  let preferredOrderRevenueBasis: ShopifyLedgerConsistency["preferredOrderRevenueBasis"] = null;
  let orderRevenueTruthDelta: number | null = null;
  if (currentOrderTruthDelta !== null || grossMinusRefundsTruthDelta !== null) {
    const currentAbs = currentOrderTruthDelta === null ? Number.POSITIVE_INFINITY : Math.abs(currentOrderTruthDelta);
    const grossMinusRefundsAbs =
      grossMinusRefundsTruthDelta === null ? Number.POSITIVE_INFINITY : Math.abs(grossMinusRefundsTruthDelta);
    if (currentAbs <= grossMinusRefundsAbs) {
      preferredOrderRevenueBasis = currentOrderTruthDelta === null ? null : "current_total_price";
      orderRevenueTruthDelta = currentOrderTruthDelta;
    } else {
      preferredOrderRevenueBasis =
        grossMinusRefundsTruthDelta === null ? null : "gross_minus_total_refunded";
      orderRevenueTruthDelta = grossMinusRefundsTruthDelta;
    }
  }
  const transactionNetRevenue =
    typeof input.ledger.transactionNetRevenue === "number"
      ? round2(input.ledger.transactionNetRevenue)
      : null;
  const normalizedTransactionNetRevenue =
    transactionNetRevenue === null
      ? null
      : round2(transactionNetRevenue - carryoverRefundRevenue);
  const transactionRevenueDelta =
    normalizedTransactionNetRevenue === null
      ? null
      : round2(input.ledger.revenue - normalizedTransactionNetRevenue);
  const transactionCoveredOrders = Math.max(0, Math.trunc(input.ledger.transactionCoveredOrders ?? 0));
  const transactionCoveredRevenue =
    typeof input.ledger.transactionCoveredRevenue === "number"
      ? round2(input.ledger.transactionCoveredRevenue)
      : null;
  const transactionCoverageRate =
    typeof input.ledger.transactionCoverageRate === "number"
      ? round2(input.ledger.transactionCoverageRate)
      : null;
  const transactionCoverageAmountRate =
    typeof input.ledger.transactionCoverageAmountRate === "number"
      ? round2(input.ledger.transactionCoverageAmountRate)
      : null;
  const refundPressureDelta = pickClosestToZero([
    round2(
      (input.ledger.refundPressure ?? input.ledger.refundedRevenue) -
        input.warehouse.refundedRevenue
    ),
    round2(
      (input.ledger.refundPressure ?? input.ledger.refundedRevenue) -
        input.warehouse.refundedRevenue -
        explainedAdjustmentRefunds
    ),
  ]);
  const maxRevenueDeltaPercent = input.maxRevenueDeltaPercent ?? 2;
  const maxPurchaseDelta = input.maxPurchaseDelta ?? 2;
  const maxRefundedRevenueDelta = input.maxRefundedRevenueDelta ?? 25;
  const maxReturnEventDelta = input.maxReturnEventDelta ?? 1;
  const maxAdjustmentRevenueDelta = input.maxAdjustmentRevenueDelta ?? 50;
  const maxDailyRevenueDeltaPercent = input.maxDailyRevenueDeltaPercent ?? 5;
  const maxDailyPurchaseDelta = input.maxDailyPurchaseDelta ?? 2;
  const maxDailyRefundPressureDelta = input.maxDailyRefundPressureDelta ?? 35;
  const maxDailyAdjustmentDelta = input.maxDailyAdjustmentDelta ?? 40;
  const maxDailySemanticDrift = input.maxDailySemanticDrift ?? 75;
  const maxOrderRevenueTruthDelta = input.maxOrderRevenueTruthDelta ?? 25;
  const maxTransactionRevenueDelta = input.maxTransactionRevenueDelta ?? 35;
  const minTransactionCoverageRate = input.minTransactionCoverageRate ?? 60;
  const warehouseDailyByDate = new Map(input.warehouse.daily.map((row) => [row.date, row]));
  const ledgerDailyByDate = new Map(input.ledger.daily.map((row) => [row.date, row]));
  const allDates = new Set([
    ...input.warehouse.daily.map((row) => row.date),
    ...input.ledger.daily.map((row) => row.date),
  ]);
  let observedMaxDailyRevenueDeltaPercent: number | null = null;
  let observedMaxDailyPurchaseDelta: number | null = null;
  let observedMaxDailyRefundPressureDelta: number | null = null;
  let observedMaxDailyAdjustmentDelta: number | null = null;
  let observedMaxDailySemanticDrift: number | null = null;

  for (const date of allDates) {
    const ledgerRow = ledgerDailyByDate.get(date);
    const warehouseRow = warehouseDailyByDate.get(date);
    const warehouseRevenue = round2(warehouseRow?.netRevenue ?? 0);
    const ledgerRevenue = round2(ledgerRow?.netRevenue ?? 0);
    const dailyRevenueDelta = round2(ledgerRevenue - warehouseRevenue);
    const dailyRevenueDeltaPercent = percentDelta(warehouseRevenue, dailyRevenueDelta);
    if (
      observedMaxDailyRevenueDeltaPercent === null ||
      dailyRevenueDeltaPercent > observedMaxDailyRevenueDeltaPercent
    ) {
      observedMaxDailyRevenueDeltaPercent = dailyRevenueDeltaPercent;
    }

    const dailyPurchaseDelta = Math.abs((ledgerRow?.orders ?? 0) - (warehouseRow?.orders ?? 0));
    if (
      observedMaxDailyPurchaseDelta === null ||
      dailyPurchaseDelta > observedMaxDailyPurchaseDelta
    ) {
      observedMaxDailyPurchaseDelta = dailyPurchaseDelta;
    }

    const explainedDailyAdjustmentRefunds = explainedRefundLikeAdjustment(
      ledgerRow?.adjustmentRevenue ?? 0
    );
    const dailyRefundPressureDelta = Math.abs(
      pickClosestToZero([
        round2(
          (ledgerRow?.refundPressure ?? ledgerRow?.refundedRevenue ?? 0) -
            (warehouseRow?.refundedRevenue ?? 0)
        ),
        round2(
          (ledgerRow?.refundPressure ?? ledgerRow?.refundedRevenue ?? 0) -
            (warehouseRow?.refundedRevenue ?? 0) -
            explainedDailyAdjustmentRefunds
        ),
      ])
    );
    if (
      observedMaxDailyRefundPressureDelta === null ||
      dailyRefundPressureDelta > observedMaxDailyRefundPressureDelta
    ) {
      observedMaxDailyRefundPressureDelta = dailyRefundPressureDelta;
    }
    const dailyAdjustmentDelta =
      dailyRevenueDelta === 0 && dailyRefundPressureDelta === 0
        ? 0
        : Math.abs(round2(ledgerRow?.adjustmentRevenue ?? 0));
    if (
      observedMaxDailyAdjustmentDelta === null ||
      dailyAdjustmentDelta > observedMaxDailyAdjustmentDelta
    ) {
      observedMaxDailyAdjustmentDelta = dailyAdjustmentDelta;
    }
    const semanticDrift = round2(
      Math.abs(dailyRevenueDelta) + dailyRefundPressureDelta + dailyAdjustmentDelta
    );
    if (
      observedMaxDailySemanticDrift === null ||
      semanticDrift > observedMaxDailySemanticDrift
    ) {
      observedMaxDailySemanticDrift = semanticDrift;
    }
  }

  const failureReasons: string[] = [];
  if (revenueDeltaPercent !== null && revenueDeltaPercent > maxRevenueDeltaPercent) {
    failureReasons.push("revenue_delta_percent_above_threshold");
  }
  if (Math.abs(purchaseDelta) > maxPurchaseDelta) {
    failureReasons.push("purchase_delta_above_threshold");
  }
  if (Math.abs(refundedRevenueDelta) > maxRefundedRevenueDelta) {
    failureReasons.push("refunded_revenue_delta_above_threshold");
  }
  if (Math.abs(returnEventDelta) > maxReturnEventDelta) {
    failureReasons.push("return_event_delta_above_threshold");
  }
  if (Math.abs(adjustmentRevenueDelta) > maxAdjustmentRevenueDelta) {
    failureReasons.push("adjustment_revenue_delta_above_threshold");
  }
  if (orderRevenueTruthDelta !== null && Math.abs(orderRevenueTruthDelta) > maxOrderRevenueTruthDelta) {
    failureReasons.push("order_revenue_truth_delta_above_threshold");
  }
  if (Math.abs(refundPressureDelta) > maxRefundedRevenueDelta) {
    failureReasons.push("refund_pressure_delta_above_threshold");
  }
  if (
    transactionRevenueDelta !== null &&
    (transactionCoverageRate ?? 0) >= minTransactionCoverageRate &&
    Math.abs(transactionRevenueDelta) > maxTransactionRevenueDelta
  ) {
    failureReasons.push("transaction_revenue_delta_above_threshold");
  }
  if (
    observedMaxDailyRevenueDeltaPercent !== null &&
    observedMaxDailyRevenueDeltaPercent > maxDailyRevenueDeltaPercent
  ) {
    failureReasons.push("daily_revenue_delta_percent_above_threshold");
  }
  if (
    observedMaxDailyPurchaseDelta !== null &&
    observedMaxDailyPurchaseDelta > maxDailyPurchaseDelta
  ) {
    failureReasons.push("daily_purchase_delta_above_threshold");
  }
  if (
    observedMaxDailyRefundPressureDelta !== null &&
    observedMaxDailyRefundPressureDelta > maxDailyRefundPressureDelta
  ) {
    failureReasons.push("daily_refund_pressure_delta_above_threshold");
  }
  if (
    observedMaxDailyAdjustmentDelta !== null &&
    observedMaxDailyAdjustmentDelta > maxDailyAdjustmentDelta
  ) {
    failureReasons.push("daily_adjustment_delta_above_threshold");
  }
  if (
    observedMaxDailySemanticDrift !== null &&
    observedMaxDailySemanticDrift > maxDailySemanticDrift
  ) {
    failureReasons.push("daily_semantic_drift_above_threshold");
  }

  const normalizedPenalty =
    (revenueDeltaPercent ?? 0) / maxRevenueDeltaPercent +
    Math.abs(purchaseDelta) / maxPurchaseDelta +
    Math.abs(refundedRevenueDelta) / maxRefundedRevenueDelta +
    Math.abs(returnEventDelta) / maxReturnEventDelta +
    Math.abs(adjustmentRevenueDelta) / maxAdjustmentRevenueDelta +
    Math.abs(orderRevenueTruthDelta ?? 0) / maxOrderRevenueTruthDelta +
    Math.abs(refundPressureDelta) / maxRefundedRevenueDelta +
    ((transactionCoverageRate ?? 0) >= minTransactionCoverageRate
      ? Math.abs(transactionRevenueDelta ?? 0) / maxTransactionRevenueDelta
      : 0) +
    (observedMaxDailyRevenueDeltaPercent ?? 0) / maxDailyRevenueDeltaPercent +
    (observedMaxDailyPurchaseDelta ?? 0) / maxDailyPurchaseDelta +
    (observedMaxDailyRefundPressureDelta ?? 0) / maxDailyRefundPressureDelta +
    (observedMaxDailyAdjustmentDelta ?? 0) / maxDailyAdjustmentDelta +
    (observedMaxDailySemanticDrift ?? 0) / maxDailySemanticDrift;
  const consistencyScore = Math.max(0, round2(100 - normalizedPenalty * 10));
  const withinThreshold = failureReasons.length === 0;

  return {
    warehouseRevenue: round2(input.warehouse.revenue),
    ledgerRevenue: round2(input.ledger.revenue),
    revenueDelta,
    revenueDeltaPercent,
    warehousePurchases: input.warehouse.purchases,
    ledgerPurchases: input.ledger.purchases,
    purchaseDelta,
    warehouseRefundedRevenue: round2(input.warehouse.refundedRevenue),
    ledgerRefundedRevenue: round2(input.ledger.refundedRevenue),
    refundedRevenueDelta,
    warehouseReturnEvents: input.warehouse.returnEvents,
    ledgerReturnEvents: input.ledger.returnEvents,
    returnEventDelta,
    currentOrderRevenue: normalizedCurrentOrderRevenue,
    grossMinusRefundsOrderRevenue: normalizedGrossMinusRefundsOrderRevenue,
    preferredOrderRevenueBasis,
    orderRevenueTruthDelta,
    transactionNetRevenue,
    transactionRevenueDelta,
    transactionCoveredOrders,
    transactionCoveredRevenue,
    transactionCoverageRate,
    transactionCoverageAmountRate,
    ledgerAdjustmentRevenue: round2(input.ledger.adjustmentRevenue ?? 0),
    adjustmentRevenueDelta,
    refundPressureDelta,
    maxDailyRevenueDeltaPercent: observedMaxDailyRevenueDeltaPercent,
    maxDailyPurchaseDelta: observedMaxDailyPurchaseDelta,
    maxDailyRefundPressureDelta: observedMaxDailyRefundPressureDelta,
    maxDailyAdjustmentDelta: observedMaxDailyAdjustmentDelta,
    maxDailySemanticDrift: observedMaxDailySemanticDrift,
    consistencyScore,
    failureReasons,
    withinThreshold,
  } satisfies ShopifyLedgerConsistency;
}
