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

const integrations = await import("@/lib/integrations");
const syncState = await import("@/lib/shopify/sync-state");
const db = await import("@/lib/db");
const { getShopifyStatus } = await import("@/lib/shopify/status");

describe("getShopifyStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reports not_connected when no Shopify integration exists", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue(null);

    const status = await getShopifyStatus("biz_1");

    expect(status).toEqual({
      state: "not_connected",
      connected: false,
      shopId: null,
      warehouse: null,
      sync: null,
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
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ row_count: "10", first_date: "2026-03-01", last_date: "2026-03-31" }])
      .mockResolvedValueOnce([{ row_count: "2" }])
      .mockResolvedValueOnce([{ row_count: "1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const status = await getShopifyStatus("biz_1");

    expect(status.state).toBe("partial");
    expect(status.connected).toBe(true);
    expect(status.warehouse?.orderRowCount).toBe(10);
    expect(status.issues).toContain("Historical Shopify backfill is not complete yet.");
  });
});
