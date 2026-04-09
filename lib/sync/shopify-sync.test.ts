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

vi.mock("@/lib/shopify/overview-materializer", () => ({
  persistShopifyOverviewServingState: vi.fn(),
  recordShopifyOverviewReconciliationRun: vi.fn(),
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

vi.mock("@/lib/user-facing-report-cache-owners", () => ({
  warmShopifyOverviewReportCache: vi.fn(),
}));

const admin = await import("@/lib/shopify/admin");
const integrations = await import("@/lib/integrations");
const commerceSync = await import("@/lib/shopify/commerce-sync");
const readAdapter = await import("@/lib/shopify/read-adapter");
const overviewMaterializer = await import("@/lib/shopify/overview-materializer");
const shopifyStatus = await import("@/lib/shopify/status");
const webhooks = await import("@/lib/shopify/webhooks");
const syncState = await import("@/lib/shopify/sync-state");
const warehouseOverview = await import("@/lib/shopify/warehouse-overview");
const revenueLedger = await import("@/lib/shopify/revenue-ledger");
const cacheOwners = await import("@/lib/user-facing-report-cache-owners");
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
      preferredSource: "warehouse",
      canServeWarehouse: true,
      canaryEnabled: true,
      decisionReasons: ["warehouse_ready"],
      warehouse: {
        revenue: 999,
        purchases: 4,
      },
      ledger: {
        revenue: 998,
        purchases: 4,
      },
      live: {
        revenue: 997,
        purchases: 4,
      },
      divergence: {
        withinThreshold: true,
      },
      ledgerConsistency: {
        orderRevenueTruthDelta: 1,
        transactionRevenueDelta: 0,
      },
      servingMetadata: {
        productionMode: "auto",
        trustState: "trusted",
        fallbackReason: null,
        coverageStatus: "recent_ready",
        pendingRepair: false,
        pendingRepairStartedAt: null,
        pendingRepairLastTopic: null,
        pendingRepairLastReceivedAt: null,
        selectedRevenueTruthBasis: "warehouse",
        basisSelectionReason: "warehouse_consistent",
        transactionCoverageOrderRate: 1,
        transactionCoverageAmountRate: 1,
        explainedAdjustmentRevenue: 0,
        unexplainedAdjustmentRevenue: 0,
      },
      status: {
        state: "ready",
        serving: {
          consecutiveCleanValidations: 2,
          pendingRepair: false,
        },
        sync: {
          ordersRecent: {
            latestSuccessfulSyncAt: "2026-04-09T00:00:00.000Z",
            cursorTimestamp: "2026-04-09T00:00:00.000Z",
            cursorValue: "2026-04-09T00:00:00.000Z",
          },
          returnsRecent: {
            latestSuccessfulSyncAt: "2026-04-09T00:00:00.000Z",
            cursorTimestamp: "2026-04-09T00:00:00.000Z",
            cursorValue: "2026-04-09T00:00:00.000Z",
          },
          ordersHistorical: {
            latestSuccessfulSyncAt: "2026-04-09T00:00:00.000Z",
            readyThroughDate: "2026-04-09",
            historicalTargetEnd: "2026-04-09",
          },
          returnsHistorical: {
            latestSuccessfulSyncAt: "2026-04-09T00:00:00.000Z",
            readyThroughDate: "2026-04-09",
            historicalTargetEnd: "2026-04-09",
          },
        },
      },
    } as never);
    vi.mocked(overviewMaterializer.persistShopifyOverviewServingState).mockResolvedValue(
      undefined,
    );
    vi.mocked(overviewMaterializer.recordShopifyOverviewReconciliationRun).mockResolvedValue(
      undefined,
    );
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
    vi.mocked(cacheOwners.warmShopifyOverviewReportCache).mockResolvedValue({
      reportType: "overview_shopify_orders_aggregate_v6",
      wrote: true,
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
        materialization: expect.objectContaining({
          trustState: "trusted",
          canServeWarehouse: true,
        }),
      })
    );
    expect(overviewMaterializer.persistShopifyOverviewServingState).toHaveBeenCalledTimes(1);
    expect(overviewMaterializer.recordShopifyOverviewReconciliationRun).toHaveBeenCalledTimes(1);
    expect(cacheOwners.warmShopifyOverviewReportCache).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        startDate: expect.any(String),
        endDate: expect.any(String),
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

  it("can skip overview materialization for call sites that must stay lightweight", async () => {
    const result = await syncShopifyCommerceReports("biz_1", {
      materializeOverviewState: false,
      allowHistorical: false,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        materialization: expect.objectContaining({
          skipped: true,
          reason: "disabled_for_call_site",
        }),
      }),
    );
    expect(overviewMaterializer.persistShopifyOverviewServingState).not.toHaveBeenCalled();
    expect(overviewMaterializer.recordShopifyOverviewReconciliationRun).not.toHaveBeenCalled();
    expect(cacheOwners.warmShopifyOverviewReportCache).not.toHaveBeenCalled();
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
    expect(integrations.mergeIntegrationMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        provider: "shopify",
        metadata: expect.objectContaining({
          shopifyProviderReadiness: expect.objectContaining({
            recentWindowDays: 30,
            visibleWindowDays: 90,
          }),
        }),
      })
    );
    expect(commerceSync.syncShopifyOrdersWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
      })
    );
    expect(commerceSync.syncShopifyReturnsWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
      })
    );
  });

  it("logs and continues when overview snapshot warming fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(cacheOwners.warmShopifyOverviewReportCache).mockRejectedValue(
      new Error("snapshot warm failed"),
    );

    const result = await syncShopifyCommerceReports("biz_1");

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[shopify-sync] overview_snapshot_warm_failed",
      expect.objectContaining({
        businessId: "biz_1",
      }),
    );
    warnSpy.mockRestore();
  });
});
