import { getShopifyOverviewAggregate } from "@/lib/shopify/overview";
import { compareShopifyAggregates } from "@/lib/shopify/divergence";
import { getShopifyStatus } from "@/lib/shopify/status";
import { getShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";
import { upsertShopifyServingState } from "@/lib/shopify/warehouse";

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

  const decisionReasons: string[] = [];
  const canaryEnabled = warehouseReadCanaryEnabled();
  if (!canaryEnabled) {
    decisionReasons.push("warehouse_read_canary_disabled");
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

  const canServeWarehouse =
    canaryEnabled &&
    status.state === "ready" &&
    divergence?.withinThreshold === true;

  const preferredSource = canServeWarehouse
    ? "warehouse"
    : live
      ? "live"
      : warehouse
        ? "warehouse_shadow"
        : "none";

  await upsertShopifyServingState({
    businessId: input.businessId,
    providerAccountId: status.shopId ?? "unknown",
    canaryKey: "overview_shopify",
    assessedAt: new Date().toISOString(),
    statusState: status.state,
    preferredSource,
    canServeWarehouse,
    canaryEnabled,
    decisionReasons,
    divergence: divergence ? { ...divergence } : null,
  }).catch(() => null);

  return {
    status,
    live,
    warehouse,
    divergence,
    decisionReasons,
    canaryEnabled,
    preferredSource,
    canServeWarehouse,
  } as const;
}
