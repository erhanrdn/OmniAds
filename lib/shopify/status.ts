import { getDb } from "@/lib/db";
import { getIntegrationMetadata } from "@/lib/integrations";
import { getShopifySyncState } from "@/lib/shopify/sync-state";

export interface ShopifyStatusResponse {
  state:
    | "not_connected"
    | "syncing"
    | "partial"
    | "stale"
    | "action_required"
    | "ready";
  connected: boolean;
  shopId: string | null;
  warehouse: {
    orderRowCount: number;
    refundRowCount: number;
    returnRowCount: number;
    firstOrderDate: string | null;
    lastOrderDate: string | null;
  } | null;
  sync: {
    ordersRecent: Awaited<ReturnType<typeof getShopifySyncState>>;
    returnsRecent: Awaited<ReturnType<typeof getShopifySyncState>>;
    ordersHistorical: Awaited<ReturnType<typeof getShopifySyncState>>;
    returnsHistorical: Awaited<ReturnType<typeof getShopifySyncState>>;
  } | null;
  issues: string[];
}

function isFreshTimestamp(value: string | null | undefined, maxAgeHours: number) {
  if (!value) return false;
  const ageMs = Date.now() - new Date(value).getTime();
  return Number.isFinite(ageMs) && ageMs <= maxAgeHours * 60 * 60_000;
}

export async function getShopifyStatus(businessId: string): Promise<ShopifyStatusResponse> {
  const integration = await getIntegrationMetadata(businessId, "shopify").catch(() => null);
  if (
    !integration ||
    integration.status !== "connected" ||
    !integration.provider_account_id
  ) {
    return {
      state: "not_connected",
      connected: false,
      shopId: null,
      warehouse: null,
      sync: null,
      issues: [],
    };
  }

  const [ordersRecent, returnsRecent, ordersHistorical, returnsHistorical] = await Promise.all([
    getShopifySyncState({
      businessId,
      providerAccountId: integration.provider_account_id,
      syncTarget: "commerce_orders_recent",
    }).catch(() => null),
    getShopifySyncState({
      businessId,
      providerAccountId: integration.provider_account_id,
      syncTarget: "commerce_returns_recent",
    }).catch(() => null),
    getShopifySyncState({
      businessId,
      providerAccountId: integration.provider_account_id,
      syncTarget: "commerce_orders_historical",
    }).catch(() => null),
    getShopifySyncState({
      businessId,
      providerAccountId: integration.provider_account_id,
      syncTarget: "commerce_returns_historical",
    }).catch(() => null),
  ]);

  const sql = getDb();
  const [orderStatsRow] = (await sql`
    SELECT
      COUNT(*) AS row_count,
      MIN(order_created_at::date)::text AS first_date,
      MAX(order_created_at::date)::text AS last_date
    FROM shopify_orders
    WHERE business_id = ${businessId}
      AND provider_account_id = ${integration.provider_account_id}
  `) as Array<Record<string, unknown>>;
  const [refundStatsRow] = (await sql`
    SELECT COUNT(*) AS row_count
    FROM shopify_refunds
    WHERE business_id = ${businessId}
      AND provider_account_id = ${integration.provider_account_id}
  `) as Array<Record<string, unknown>>;
  const [returnStatsRow] = (await sql`
    SELECT COUNT(*) AS row_count
    FROM shopify_returns
    WHERE business_id = ${businessId}
      AND provider_account_id = ${integration.provider_account_id}
  `) as Array<Record<string, unknown>>;

  const warehouse = {
    orderRowCount: Number(orderStatsRow?.row_count ?? 0),
    refundRowCount: Number(refundStatsRow?.row_count ?? 0),
    returnRowCount: Number(returnStatsRow?.row_count ?? 0),
    firstOrderDate: orderStatsRow?.first_date ? String(orderStatsRow.first_date) : null,
    lastOrderDate: orderStatsRow?.last_date ? String(orderStatsRow.last_date) : null,
  };

  const issues: string[] = [];
  const sync = { ordersRecent, returnsRecent, ordersHistorical, returnsHistorical };

  const recentHealthy =
    ordersRecent?.latestSyncStatus === "succeeded" &&
    returnsRecent?.latestSyncStatus === "succeeded" &&
    isFreshTimestamp(ordersRecent.latestSuccessfulSyncAt, 6) &&
    isFreshTimestamp(returnsRecent.latestSuccessfulSyncAt, 6);

  const historicalReady =
    (ordersHistorical?.latestSyncStatus === "ready" ||
      ordersHistorical?.readyThroughDate === ordersHistorical?.historicalTargetEnd) &&
    (returnsHistorical?.latestSyncStatus === "ready" ||
      returnsHistorical?.readyThroughDate === returnsHistorical?.historicalTargetEnd);

  if (!ordersRecent || !returnsRecent) {
    issues.push("Recent Shopify sync has not produced state yet.");
  }
  if (ordersRecent?.lastError) {
    issues.push(`Recent orders sync error: ${ordersRecent.lastError}`);
  }
  if (returnsRecent?.lastError) {
    issues.push(`Recent returns sync error: ${returnsRecent.lastError}`);
  }
  if (warehouse.orderRowCount <= 0) {
    issues.push("Shopify warehouse has no order rows yet.");
  }
  if (!recentHealthy && warehouse.orderRowCount > 0) {
    issues.push("Recent Shopify sync is stale or incomplete.");
  }
  if (!historicalReady) {
    issues.push("Historical Shopify backfill is not complete yet.");
  }

  const state: ShopifyStatusResponse["state"] =
    warehouse.orderRowCount <= 0
      ? "syncing"
      : recentHealthy && historicalReady
        ? "ready"
        : recentHealthy
          ? "partial"
          : issues.some((issue) => issue.toLowerCase().includes("error"))
            ? "action_required"
            : "stale";

  return {
    state,
    connected: true,
    shopId: integration.provider_account_id,
    warehouse,
    sync,
    issues,
  };
}
