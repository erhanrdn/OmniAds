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
});
