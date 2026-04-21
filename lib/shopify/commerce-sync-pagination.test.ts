import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shopify/admin", () => ({
  hasShopifyScope: (scopes: string | null | undefined, scope: string) =>
    String(scopes ?? "")
      .split(/[,\s]+/)
      .includes(scope),
  resolveShopifyAdminCredentials: vi.fn(),
  shopifyAdminGraphql: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse", () => ({
  buildShopifyRawSnapshotHash: vi.fn(() => "snapshot_hash"),
  insertShopifyRawSnapshot: vi.fn(async () => "snapshot_1"),
  upsertShopifyOrderLines: vi.fn(async (rows: unknown[]) => rows.length),
  upsertShopifyOrders: vi.fn(async (rows: unknown[]) => rows.length),
  upsertShopifyOrderTransactions: vi.fn(async (rows: unknown[]) => rows.length),
  upsertShopifyRefunds: vi.fn(async (rows: unknown[]) => rows.length),
  upsertShopifyReturns: vi.fn(async (rows: unknown[]) => rows.length),
  upsertShopifySalesEvents: vi.fn(async () => undefined),
}));

const admin = await import("@/lib/shopify/admin");
const { syncShopifyOrdersWindow, syncShopifyReturnsWindow } = await import("@/lib/shopify/commerce-sync");

describe("shopify commerce sync pagination limits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.SHOPIFY_ORDERS_MAX_PAGES_PER_WINDOW;
    delete process.env.SHOPIFY_RETURNS_MAX_PAGES_PER_WINDOW;
    vi.mocked(admin.resolveShopifyAdminCredentials).mockResolvedValue({
      shopId: "test-shop.myshopify.com",
      accessToken: "token",
      scopes: "read_orders,read_all_orders,read_returns",
      metadata: {},
    } as never);
  });

  it("fails the orders window instead of marking a truncated page-limited fetch successful", async () => {
    process.env.SHOPIFY_ORDERS_MAX_PAGES_PER_WINDOW = "1";
    vi.mocked(admin.shopifyAdminGraphql).mockResolvedValueOnce({
      orders: {
        edges: [],
        pageInfo: {
          hasNextPage: true,
          endCursor: "cursor_1",
        },
      },
    } as never);

    const result = await syncShopifyOrdersWindow({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        reason: "orders_page_limit_exceeded",
        pages: 1,
      })
    );
    expect(admin.shopifyAdminGraphql).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          pageSize: 250,
        }),
      })
    );
  });

  it("fails the returns window instead of marking a truncated page-limited fetch successful", async () => {
    process.env.SHOPIFY_RETURNS_MAX_PAGES_PER_WINDOW = "1";
    vi.mocked(admin.shopifyAdminGraphql).mockResolvedValueOnce({
      returns: {
        edges: [],
        pageInfo: {
          hasNextPage: true,
          endCursor: "cursor_1",
        },
      },
    } as never);

    const result = await syncShopifyReturnsWindow({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        reason: "returns_page_limit_exceeded",
        pages: 1,
      })
    );
    expect(admin.shopifyAdminGraphql).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          pageSize: 250,
        }),
      })
    );
  });
});
