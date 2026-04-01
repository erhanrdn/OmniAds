import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shopify/admin", () => ({
  resolveShopifyAdminCredentials: vi.fn(),
}));

vi.mock("@/lib/shopify/commerce-sync", () => ({
  syncShopifyOrdersWindow: vi.fn(),
  syncShopifyReturnsWindow: vi.fn(),
}));

vi.mock("@/lib/shopify/sync-state", () => ({
  getShopifySyncState: vi.fn(),
  upsertShopifySyncState: vi.fn(),
}));

const admin = await import("@/lib/shopify/admin");
const commerceSync = await import("@/lib/shopify/commerce-sync");
const syncState = await import("@/lib/shopify/sync-state");
const { syncShopifyCommerceReports } = await import("@/lib/sync/shopify-sync");

describe("syncShopifyCommerceReports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(admin.resolveShopifyAdminCredentials).mockResolvedValue({
      businessId: "biz_1",
      shopId: "test-shop.myshopify.com",
      accessToken: "shpat_test",
      scopes: "read_orders,read_all_orders",
      metadata: { iana_timezone: "America/New_York" },
    });
    vi.mocked(syncState.getShopifySyncState).mockResolvedValue(null);
    vi.mocked(syncState.upsertShopifySyncState).mockResolvedValue(undefined);
    vi.mocked(commerceSync.syncShopifyOrdersWindow).mockResolvedValue({
      success: true,
      reason: "ok",
      orders: 4,
      orderLines: 7,
      refunds: 1,
      transactions: 4,
      pages: 1,
    } as never);
    vi.mocked(commerceSync.syncShopifyReturnsWindow).mockResolvedValue({
      success: true,
      reason: "ok",
      returns: 2,
      pages: 1,
      maxUpdatedAt: "2026-03-31T22:00:00Z",
    } as never);
  });

  it("runs a bounded commerce sync and records sync state", async () => {
    const result = await syncShopifyCommerceReports("biz_1");

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        orders: 4,
        refunds: 1,
        returns: 2,
      })
    );
    expect(commerceSync.syncShopifyOrdersWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
      })
    );
    expect(syncState.upsertShopifySyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        providerAccountId: "test-shop.myshopify.com",
        syncTarget: "commerce_orders_recent",
        latestSyncStatus: "running",
      })
    );
    expect(syncState.upsertShopifySyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        providerAccountId: "test-shop.myshopify.com",
        syncTarget: "commerce_returns_recent",
        latestSyncStatus: "running",
      })
    );
    expect(syncState.upsertShopifySyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        providerAccountId: "test-shop.myshopify.com",
        syncTarget: "commerce_orders_recent",
        latestSyncStatus: "succeeded",
      })
    );
    expect(syncState.upsertShopifySyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        providerAccountId: "test-shop.myshopify.com",
        syncTarget: "commerce_returns_recent",
        latestSyncStatus: "succeeded",
      })
    );
  });
});
