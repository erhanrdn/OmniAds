import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations", () => ({
  getIntegrationMetadata: vi.fn(),
}));

vi.mock("@/lib/shopify/sync-state", () => ({
  getShopifySyncState: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse", () => ({
  listShopifyReconciliationRuns: vi.fn(),
  getShopifyServingState: vi.fn(),
}));

const integrations = await import("@/lib/integrations");
const syncState = await import("@/lib/shopify/sync-state");
const db = await import("@/lib/db");
const warehouse = await import("@/lib/shopify/warehouse");
const { getShopifyStatus } = await import("@/lib/shopify/status");

describe("getShopifyStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reports not_connected when no Shopify integration exists", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue(null);

    const status = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(status).toEqual({
      state: "not_connected",
      connected: false,
      shopId: null,
      warehouse: null,
      sync: null,
      serving: null,
      reconciliation: null,
      issues: [],
    });
  });

  it("reports partial when recent sync is healthy but historical backfill is incomplete", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: new Date().toISOString(),
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: new Date().toISOString(),
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        readyThroughDate: "2026-03-15",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        readyThroughDate: "2026-03-15",
        historicalTargetEnd: "2026-03-31",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue(null as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const status = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(status.state).toBe("partial");
    expect(status.connected).toBe(true);
    expect(status.warehouse?.orderRowCount).toBe(10);
    expect(status.issues).toContain("Historical Shopify backfill is not complete yet.");
  });

  it("blocks ready state when canary trust is failing", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: new Date().toISOString(),
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: new Date().toISOString(),
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue({
      canaryEnabled: true,
      canServeWarehouse: false,
      preferredSource: "live",
      decisionReasons: ["divergence_above_threshold"],
    } as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const status = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(status.state).toBe("partial");
    expect(status.issues).toContain("Shopify warehouse canary is blocked by trust checks.");
  });

  it("marks status partial when canary trust is stale relative to recent sync", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    const now = new Date();
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now.toISOString(),
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now.toISOString(),
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue({
      canaryEnabled: true,
      canServeWarehouse: true,
      assessedAt: new Date(now.getTime() - 60 * 60_000).toISOString(),
      preferredSource: "warehouse",
      decisionReasons: [],
    } as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const status = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(status.state).toBe("partial");
    expect(status.issues).toContain("Shopify warehouse canary trust is stale relative to recent sync.");
  });

  it("ignores stale trust during fresh canary assessment mode", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    const now = new Date();
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now.toISOString(),
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now.toISOString(),
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue({
      canaryEnabled: true,
      canServeWarehouse: false,
      assessedAt: new Date(now.getTime() - 60 * 60_000).toISOString(),
      preferredSource: "live",
      decisionReasons: ["divergence_above_threshold"],
    } as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const status = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      ignoreServingTrust: true,
    });

    expect(status.state).toBe("ready");
    expect(status.issues).not.toContain("Shopify warehouse canary trust is stale relative to recent sync.");
    expect(status.issues).not.toContain("Shopify warehouse canary is blocked by trust checks.");
  });

  it("treats unsupported returns as optional when core commerce readiness is healthy", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    const now = new Date().toISOString();
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now,
        cursorTimestamp: now,
        cursorValue: "orders_cursor",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now,
        lastError: "returns_api_unavailable",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        lastError: "returns_api_unavailable",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue(null as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "0" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const status = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(status.state).toBe("ready");
    expect(status.issues).not.toContain("Recent returns sync error: returns_api_unavailable");
    expect(status.issues).not.toContain("Historical Shopify backfill is not complete yet.");
  });

  it("marks status partial when canary trust no longer matches the latest sync watermark state", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    const now = new Date();
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now.toISOString(),
        cursorTimestamp: now.toISOString(),
        cursorValue: "orders_cursor_new",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now.toISOString(),
        cursorTimestamp: now.toISOString(),
        cursorValue: "returns_cursor_new",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue({
      canaryEnabled: true,
      canServeWarehouse: true,
      assessedAt: now.toISOString(),
      preferredSource: "warehouse",
      ordersRecentSyncedAt: now.toISOString(),
      ordersRecentCursorTimestamp: now.toISOString(),
      ordersRecentCursorValue: "orders_cursor_old",
      returnsRecentSyncedAt: now.toISOString(),
      returnsRecentCursorTimestamp: now.toISOString(),
      returnsRecentCursorValue: "returns_cursor_old",
      decisionReasons: [],
    } as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const status = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(status.state).toBe("partial");
    expect(status.issues).toContain(
      "Shopify warehouse canary trust no longer matches the latest sync watermark state."
    );
  });

  it("does not invalidate canary trust basis when returns are unsupported", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    const now = new Date().toISOString();
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now,
        cursorTimestamp: now,
        cursorValue: "orders_cursor",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now,
        lastError: "returns_api_unavailable",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        latestSuccessfulSyncAt: now,
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        lastError: "returns_api_unavailable",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue({
      canaryEnabled: true,
      canServeWarehouse: true,
      assessedAt: now,
      preferredSource: "ledger",
      ordersRecentSyncedAt: now,
      ordersRecentCursorTimestamp: now,
      ordersRecentCursorValue: "orders_cursor",
      returnsRecentSyncedAt: "2026-01-01T00:00:00.000Z",
      returnsRecentCursorTimestamp: "2026-01-01T00:00:00.000Z",
      returnsRecentCursorValue: "old_returns_cursor",
      ordersHistoricalSyncedAt: now,
      ordersHistoricalReadyThroughDate: "2026-03-31",
      ordersHistoricalTargetEnd: "2026-03-31",
      returnsHistoricalSyncedAt: "2026-01-01T00:00:00.000Z",
      returnsHistoricalReadyThroughDate: "2026-01-01",
      returnsHistoricalTargetEnd: "2026-01-31",
      decisionReasons: [],
    } as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "0" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const status = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(status.state).toBe("ready");
    expect(status.issues).not.toContain(
      "Shopify warehouse canary trust no longer matches the latest sync watermark state."
    );
    expect(status.issues).not.toContain(
      "Shopify warehouse canary trust no longer matches the latest historical backfill state."
    );
  });

  it("marks status partial when canary trust no longer matches the latest historical backfill state", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    const now = new Date();
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now.toISOString(),
        cursorTimestamp: now.toISOString(),
        cursorValue: "orders_cursor",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now.toISOString(),
        cursorTimestamp: now.toISOString(),
        cursorValue: "returns_cursor",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        latestSuccessfulSyncAt: now.toISOString(),
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        latestSuccessfulSyncAt: now.toISOString(),
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue({
      canaryEnabled: true,
      canServeWarehouse: true,
      assessedAt: now.toISOString(),
      preferredSource: "warehouse",
      ordersRecentSyncedAt: now.toISOString(),
      ordersRecentCursorTimestamp: now.toISOString(),
      ordersRecentCursorValue: "orders_cursor",
      returnsRecentSyncedAt: now.toISOString(),
      returnsRecentCursorTimestamp: now.toISOString(),
      returnsRecentCursorValue: "returns_cursor",
      ordersHistoricalSyncedAt: now.toISOString(),
      ordersHistoricalReadyThroughDate: "2026-03-30",
      ordersHistoricalTargetEnd: "2026-03-31",
      returnsHistoricalSyncedAt: now.toISOString(),
      returnsHistoricalReadyThroughDate: "2026-03-30",
      returnsHistoricalTargetEnd: "2026-03-31",
      decisionReasons: [],
    } as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const status = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(status.state).toBe("partial");
    expect(status.issues).toContain(
      "Shopify warehouse canary trust no longer matches the latest historical backfill state."
    );
  });

  it("marks status partial when default cutover is enabled but reconciliation history is not yet stable", async () => {
    process.env.SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER = "true";
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    const now = new Date().toISOString();
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now,
        cursorTimestamp: now,
        cursorValue: "orders_cursor",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now,
        cursorTimestamp: now,
        cursorValue: "returns_cursor",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        latestSuccessfulSyncAt: now,
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        latestSuccessfulSyncAt: now,
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue(null as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([
      {
        recordedAt: now,
        canServeWarehouse: false,
        preferredSource: "live",
        divergence: { withinThreshold: false },
      },
    ] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.state).toBe("partial");
    expect(result.reconciliation?.defaultCutoverEligible).toBe(false);
    expect(result.issues).toContain("Shopify warehouse default cutover gate has not been satisfied yet.");
    delete process.env.SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER;
  });

  it("counts ledger-backed stable runs toward the default cutover gate", async () => {
    process.env.SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER = "true";
    process.env.SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER_MIN_STABLE_RUNS = "2";
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
    } as never);
    const now = new Date().toISOString();
    vi.mocked(syncState.getShopifySyncState)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now,
        cursorTimestamp: now,
        cursorValue: "orders_cursor",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "succeeded",
        latestSuccessfulSyncAt: now,
        cursorTimestamp: now,
        cursorValue: "returns_cursor",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        latestSuccessfulSyncAt: now,
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never)
      .mockResolvedValueOnce({
        latestSyncStatus: "ready",
        latestSuccessfulSyncAt: now,
        readyThroughDate: "2026-03-31",
        historicalTargetEnd: "2026-03-31",
      } as never);
    vi.mocked(warehouse.getShopifyServingState).mockResolvedValue(null as never);
    vi.mocked(warehouse.listShopifyReconciliationRuns).mockResolvedValue([
      {
        recordedAt: now,
        canServeWarehouse: true,
        preferredSource: "ledger",
        divergence: {
          withinThreshold: true,
          ledgerConsistency: { withinThreshold: true },
        },
      },
      {
        recordedAt: now,
        canServeWarehouse: true,
        preferredSource: "ledger",
        divergence: {
          withinThreshold: true,
          ledgerConsistency: { withinThreshold: true },
        },
      },
    ] as never);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await getShopifyStatus({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.state).toBe("ready");
    expect(result.reconciliation).toEqual(
      expect.objectContaining({
        stableRunCount: 2,
        stableLedgerRunCount: 2,
        stableWarehouseRunCount: 0,
        defaultCutoverEligible: true,
      })
    );

    delete process.env.SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER;
    delete process.env.SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER_MIN_STABLE_RUNS;
  });
});
