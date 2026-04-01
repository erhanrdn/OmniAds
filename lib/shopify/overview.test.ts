import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
}));

vi.mock("@/lib/reporting-cache", () => ({
  getCachedReport: vi.fn(),
  getReportingDateRangeKey: vi.fn(() => "range-key"),
  setCachedReport: vi.fn(),
}));

const integrations = await import("@/lib/integrations");
const reportingCache = await import("@/lib/reporting-cache");
const { getShopifyOverviewAggregate } = await import("@/lib/shopify/overview");

describe("getShopifyOverviewAggregate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(reportingCache.getCachedReport).mockResolvedValue(null);
    vi.mocked(integrations.getIntegration).mockResolvedValue({
      id: "int_shopify",
      business_id: "biz_1",
      provider: "shopify",
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
      provider_account_name: "Test Shop",
      access_token: "shpat_test",
      refresh_token: null,
      token_expires_at: null,
      scopes: "read_reports,read_orders,read_all_orders",
      error_message: null,
      metadata: {},
      connected_at: null,
      disconnected_at: null,
      created_at: "",
      updated_at: "",
    });
  });

  it("returns Shopify-first aggregate with sessions and customer metrics", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            shopifyqlQuery: {
              parseErrors: [],
              tableData: {
                columns: [{ name: "day" }, { name: "total_sales" }, { name: "orders" }],
                rows: [
                  ["2026-03-01", "100.00", "1"],
                  ["2026-03-02", "200.00", "2"],
                ],
              },
            },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            shopifyqlQuery: {
              parseErrors: [],
              tableData: {
                columns: [{ name: "day" }, { name: "sessions" }],
                rows: [
                  ["2026-03-01", "10"],
                  ["2026-03-02", "20"],
                ],
              },
            },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            orders: {
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
              edges: [
                {
                  node: {
                    createdAt: "2026-03-01T10:00:00Z",
                    currentTotalPriceSet: { shopMoney: { amount: "100.00" } },
                    customer: { id: "gid://shopify/Customer/1" },
                    customerJourneySummary: { customerOrderIndex: 1 },
                  },
                },
                {
                  node: {
                    createdAt: "2026-03-02T10:00:00Z",
                    currentTotalPriceSet: { shopMoney: { amount: "120.00" } },
                    customer: { id: "gid://shopify/Customer/1" },
                    customerJourneySummary: { customerOrderIndex: 2 },
                  },
                },
                {
                  node: {
                    createdAt: "2026-03-02T11:00:00Z",
                    currentTotalPriceSet: { shopMoney: { amount: "80.00" } },
                    customer: { id: "gid://shopify/Customer/2" },
                    customerJourneySummary: { customerOrderIndex: 1 },
                  },
                },
                {
                  node: {
                    createdAt: "2026-03-02T12:00:00Z",
                    currentTotalPriceSet: { shopMoney: { amount: "0.00" } },
                    customer: { id: "gid://shopify/Customer/3" },
                    customerJourneySummary: { customerOrderIndex: 3 },
                  },
                },
              ],
            },
          },
        }),
      } as Response);

    const aggregate = await getShopifyOverviewAggregate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
    });

    expect(aggregate).toEqual({
      revenue: 300,
      purchases: 3,
      averageOrderValue: 100,
      sessions: 30,
      conversionRate: 10,
      newCustomers: 2,
      returningCustomers: 1,
      dailyTrends: [
        {
          date: "2026-03-01",
          revenue: 100,
          purchases: 1,
          sessions: 10,
          conversionRate: 10,
          newCustomers: 1,
          returningCustomers: 0,
        },
        {
          date: "2026-03-02",
          revenue: 200,
          purchases: 2,
          sessions: 20,
          conversionRate: 10,
          newCustomers: 1,
          returningCustomers: 2,
        },
      ],
    });
    expect(reportingCache.setCachedReport).toHaveBeenCalledTimes(1);
  });

  it("returns null when neither reports nor orders scopes are available", async () => {
    vi.mocked(integrations.getIntegration).mockResolvedValueOnce({
      id: "int_shopify",
      business_id: "biz_1",
      provider: "shopify",
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
      provider_account_name: "Test Shop",
      access_token: "shpat_test",
      refresh_token: null,
      token_expires_at: null,
      scopes: "",
      error_message: null,
      metadata: {},
      connected_at: null,
      disconnected_at: null,
      created_at: "",
      updated_at: "",
    });

    const aggregate = await getShopifyOverviewAggregate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
    });

    expect(aggregate).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to orders-based aggregate when ShopifyQL access is denied", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [
            {
              message:
                "Access denied for shopifyqlQuery field. Required access: `read_reports` access scope. Also: Level 2 access to Customer data.",
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            orders: {
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
              edges: [
                {
                  node: {
                    createdAt: "2026-03-01T10:00:00Z",
                    currentTotalPriceSet: { shopMoney: { amount: "100.00" } },
                    customer: { id: "gid://shopify/Customer/1" },
                    customerJourneySummary: { customerOrderIndex: 1 },
                  },
                },
                {
                  node: {
                    createdAt: "2026-03-02T10:00:00Z",
                    currentTotalPriceSet: { shopMoney: { amount: "200.00" } },
                    customer: { id: "gid://shopify/Customer/1" },
                    customerJourneySummary: { customerOrderIndex: 2 },
                  },
                },
              ],
            },
          },
        }),
      } as Response);

    vi.mocked(integrations.getIntegration).mockResolvedValueOnce({
      id: "int_shopify",
      business_id: "biz_1",
      provider: "shopify",
      status: "connected",
      provider_account_id: "test-shop.myshopify.com",
      provider_account_name: "Test Shop",
      access_token: "shpat_test",
      refresh_token: null,
      token_expires_at: null,
      scopes: "read_orders,read_all_orders,read_reports",
      error_message: null,
      metadata: {},
      connected_at: null,
      disconnected_at: null,
      created_at: "",
      updated_at: "",
    });

    const aggregate = await getShopifyOverviewAggregate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
    });

    expect(aggregate).toEqual({
      revenue: 300,
      purchases: 2,
      averageOrderValue: 150,
      sessions: null,
      conversionRate: null,
      newCustomers: 1,
      returningCustomers: 0,
      dailyTrends: [
        {
          date: "2026-03-01",
          revenue: 100,
          purchases: 1,
          sessions: null,
          conversionRate: null,
          newCustomers: 1,
          returningCustomers: 0,
        },
        {
          date: "2026-03-02",
          revenue: 200,
          purchases: 1,
          sessions: null,
          conversionRate: null,
          newCustomers: 0,
          returningCustomers: 1,
        },
      ],
    });
    expect(reportingCache.setCachedReport).toHaveBeenCalledTimes(1);
  });
});
