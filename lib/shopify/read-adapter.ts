import { getShopifyOverviewAggregate } from "@/lib/shopify/overview";
import { compareShopifyAggregates } from "@/lib/shopify/divergence";
import { getShopifyStatus } from "@/lib/shopify/status";
import { getShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";

function warehouseReadCanaryEnabled() {
  const raw = process.env.SHOPIFY_WAREHOUSE_READ_CANARY?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export async function getShopifyOverviewReadCandidate(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const [status, live, warehouse] = await Promise.all([
    getShopifyStatus(input.businessId),
    getShopifyOverviewAggregate(input),
    getShopifyWarehouseOverviewAggregate({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
  ]);

  const divergence =
    live && warehouse
      ? compareShopifyAggregates({
          live,
          warehouse,
        })
      : null;

  const canServeWarehouse =
    warehouseReadCanaryEnabled() &&
    status.state === "ready" &&
    divergence?.withinThreshold === true;

  return {
    status,
    live,
    warehouse,
    divergence,
    preferredSource: canServeWarehouse ? "warehouse" : live ? "live" : warehouse ? "warehouse_shadow" : "none",
    canServeWarehouse,
  } as const;
}
