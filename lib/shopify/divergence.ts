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
  withinThreshold: boolean;
}

export function compareShopifyAggregates(input: {
  live: ShopifyOverviewAggregate;
  warehouse: ShopifyWarehouseOverviewAggregate;
  maxRevenueDeltaPercent?: number;
  maxPurchaseDelta?: number;
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
    withinThreshold:
      (revenueDeltaPercent === null || revenueDeltaPercent <= maxRevenueDeltaPercent) &&
      Math.abs(purchaseDelta) <= maxPurchaseDelta,
  } satisfies ShopifyAggregateDivergence;
}
