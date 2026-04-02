import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shopify/admin", () => ({
  resolveShopifyAdminCredentials: vi.fn(),
  hasShopifyScope: vi.fn((scopes: string | null | undefined, scope: string) =>
    (scopes ?? "")
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .includes(scope)
  ),
}));

vi.mock("@/lib/integrations", () => ({
  mergeIntegrationMetadata: vi.fn(),
}));

vi.mock("@/lib/shopify/read-adapter", () => ({
  getShopifyOverviewReadCandidate: vi.fn(),
}));

vi.mock("@/lib/shopify/status", () => ({
  getShopifyStatus: vi.fn(),
}));

vi.mock("@/lib/shopify/webhooks", () => ({
  registerShopifySyncWebhooks: vi.fn(),
  verifyShopifySyncWebhooks: vi.fn(),
}));

vi.mock("@/lib/shopify/commerce-sync", () => ({
  syncShopifyOrdersWindow: vi.fn(),
  syncShopifyReturnsWindow: vi.fn(),
}));

vi.mock("@/lib/shopify/sync-state", () => ({
  getShopifySyncState: vi.fn(),
  upsertShopifySyncState: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse-overview", () => ({
  getShopifyWarehouseOverviewAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/revenue-ledger", () => ({
  getShopifyRevenueLedgerAggregate: vi.fn(),
}));

const admin = await import("@/lib/shopify/admin");
const integrations = await import("@/lib/integrations");
const commerceSync = await import("@/lib/shopify/commerce-sync");
const readAdapter = await import("@/lib/shopify/read-adapter");
const shopifyStatus = await import("@/lib/shopify/status");
const webhooks = await import("@/lib/shopify/webhooks");
const syncState = await import("@/lib/shopify/sync-state");
const warehouseOverview = await import("@/lib/shopify/warehouse-overview");
const revenueLedger = await import("@/lib/shopify/revenue-ledger");
const { syncShopifyCommerceReports, ensureShopifyProviderReady } = await import("@/lib/sync/shopify-sync");

describe("syncShopifyCommerceReports", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.SHOPIFY_HISTORICAL_SYNC_ENABLED;
    vi.mocked(admin.resolveShopifyAdminCredentials).mockResolvedValue({
      businessId: "biz_1",
      shopId: "test-shop.myshopify.com",
      accessToken: "shpat_test",
      scopes: "read_orders,read_all_orders",
      metadata: { iana_timezone: "America/New_York" },
    });
    vi.mocked(syncState.getShopifySyncState).mockResolvedValue(null);
    vi.mocked(syncState.upsertShopifySyncState).mockResolvedValue(undefined);
    vi.mocked(integrations.mergeIntegrationMetadata).mockResolvedValue(undefined);
    vi.mocked(readAdapter.getShopifyOverviewReadCandidate).mockResolvedValue({
      preferredSource: "live",
      servingMetadata: {
        trustState: "live_fallback",
        fallbackReason: "pending_repair",
      },
    } as never);
    vi.mocked(shopifyStatus.getShopifyStatus).mockResolvedValue({
      state: "partial",
      issues: [],
    } as never);
    vi.mocked(webhooks.verifyShopifySyncWebhooks).mockResolvedValue({
      desiredTopics: ["ORDERS_CREATE"],
      existingTopics: ["ORDERS_CREATE"],
      missingTopics: [],
      extraTopics: [],
      callbackUrl: "https://app.example.com/api/webhooks/shopify/sync",
    } as never);
    vi.mocked(webhooks.registerShopifySyncWebhooks).mockResolvedValue({
      desiredTopics: ["ORDERS_CREATE"],
      existingTopics: ["ORDERS_CREATE"],
      missingTopics: [],
      extraTopics: [],
      created: [],
      callbackUrl: "https://app.example.com/api/webhooks/shopify/sync",
    } as never);
    vi.mocked(warehouseOverview.getShopifyWarehouseOverviewAggregate).mockResolvedValue({
      revenue: 999,
      grossRevenue: 1100,
      refundedRevenue: 101,
      purchases: 4,
      averageOrderValue: 275,
      daily: [],
    } as never);
    vi.mocked(revenueLedger.getShopifyRevenueLedgerAggregate).mockResolvedValue({
      revenue: 998,
      grossRevenue: 1100,
      refundedRevenue: 102,
      purchases: 4,
      averageOrderValue: 274.5,
      returnEvents: 2,
      daily: [],
      ledgerRows: 6,
    } as never);
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
        historical: null,
      })
    );
    expect(syncState.upsertShopifySyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        syncTarget: "commerce_orders_recent",
        lastResultSummary: expect.objectContaining({
          warehouseShadow: expect.objectContaining({
            revenue: 999,
            purchases: 4,
          }),
        }),
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

  it("runs one historical chunk when enabled", async () => {
    process.env.SHOPIFY_HISTORICAL_SYNC_ENABLED = "true";
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await syncShopifyCommerceReports("biz_1");

    expect(commerceSync.syncShopifyOrdersWindow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        businessId: "biz_1",
      })
    );
    expect(commerceSync.syncShopifyReturnsWindow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        businessId: "biz_1",
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        historical: expect.objectContaining({
          orders: 4,
          returns: 2,
        }),
      })
    );
    expect(syncState.upsertShopifySyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        syncTarget: "commerce_orders_historical",
      })
    );
    delete process.env.SHOPIFY_HISTORICAL_SYNC_ENABLED;
  });

  it("can narrow webhook-triggered sync to orders only without historical backfill", async () => {
    process.env.SHOPIFY_HISTORICAL_SYNC_ENABLED = "true";

    const result = await syncShopifyCommerceReports("biz_1", {
      recentWindowDays: 3,
      triggerReason: "webhook:orders:update",
      recentTargets: {
        orders: true,
        returns: false,
      },
      allowHistorical: false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        returns: 0,
        historical: null,
        reconciliation: expect.objectContaining({
          triggerReason: "webhook:orders:update",
          recentTargets: {
            orders: true,
            returns: false,
          },
          historicalTriggered: false,
        }),
      })
    );
    expect(commerceSync.syncShopifyReturnsWindow).not.toHaveBeenCalled();
    expect(syncState.upsertShopifySyncState).not.toHaveBeenCalledWith(
      expect.objectContaining({
        syncTarget: "commerce_returns_recent",
        latestSyncStatus: "running",
      })
    );
    expect(syncState.upsertShopifySyncState).not.toHaveBeenCalledWith(
      expect.objectContaining({
        syncTarget: "commerce_orders_historical",
      })
    );
    delete process.env.SHOPIFY_HISTORICAL_SYNC_ENABLED;
  });

  it("orchestrates provider readiness and persists readiness summary", async () => {
    const result = await ensureShopifyProviderReady({
      businessId: "biz_1",
      recentWindowDays: 30,
      preferredVisibleWindowDays: 90,
      runHistoricalBootstrap: false,
      triggerReason: "admin:run_recent_bootstrap",
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        servingWindow: expect.objectContaining({
          startDate: expect.any(String),
          endDate: expect.any(String),
        }),
      })
    );
    expect(webhooks.verifyShopifySyncWebhooks).toHaveBeenCalled();
    expect(webhooks.registerShopifySyncWebhooks).toHaveBeenCalled();
    expect(readAdapter.getShopifyOverviewReadCandidate).toHaveBeenCalled();
    expect(integrations.mergeIntegrationMetadata).toHaveBeenCalled();
  });
});
