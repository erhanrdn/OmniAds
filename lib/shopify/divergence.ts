import type { ShopifyOverviewAggregate } from "@/lib/shopify/overview";
import type { ShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

export function compareShopifyAggregates(input: {
  live: ShopifyOverviewAggregate;
  warehouse: ShopifyWarehouseOverviewAggregate;
  maxRevenueDeltaPercent?: number;
  maxPurchaseDelta?: number;
  maxAovDelta?: number;
  maxDailyRevenueDeltaPercent?: number;
  maxDailyPurchaseDelta?: number;
}) {
  const revenueDelta = round2(input.warehouse.revenue - input.live.revenue);
  const revenueDeltaPercent =
    Math.abs(input.live.revenue) > 0
      ? round2((Math.abs(revenueDelta) / Math.abs(input.live.revenue)) * 100)
      : null;
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

  const dailyByDate = new Map(
    input.warehouse.daily.map((row) => [row.date, row])
  );
  let observedMaxDailyRevenueDeltaPercent: number | null = null;
  let observedMaxDailyPurchaseDelta: number | null = null;

  for (const liveRow of input.live.dailyTrends) {
    const warehouseRow = dailyByDate.get(liveRow.date);
    if (!warehouseRow) continue;
    const revenueBase = Math.abs(liveRow.revenue);
    const revenueDeltaForDay = Math.abs(round2(warehouseRow.netRevenue - liveRow.revenue));
    const revenueDeltaPercentForDay =
      revenueBase > 0 ? round2((revenueDeltaForDay / revenueBase) * 100) : null;
    if (
      revenueDeltaPercentForDay !== null &&
      (observedMaxDailyRevenueDeltaPercent === null ||
        revenueDeltaPercentForDay > observedMaxDailyRevenueDeltaPercent)
    ) {
      observedMaxDailyRevenueDeltaPercent = revenueDeltaPercentForDay;
    }

    const purchaseDeltaForDay = Math.abs(warehouseRow.orders - liveRow.purchases);
    if (
      observedMaxDailyPurchaseDelta === null ||
      purchaseDeltaForDay > observedMaxDailyPurchaseDelta
    ) {
      observedMaxDailyPurchaseDelta = purchaseDeltaForDay;
    }
  }

  return {
    liveRevenue: round2(input.live.revenue),
    warehouseRevenue: round2(input.warehouse.revenue),
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
