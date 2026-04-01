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
      metadata: { iana_timezone: "America/New_York" },
      connected_at: null,
      disconnected_at: null,
      created_at: "",
      updated_at: "",
    });
  });

  it("returns Shopify-first aggregate with sessions and customer metrics", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
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
                },
              },
              {
                node: {
                  createdAt: "2026-03-02T10:00:00Z",
                  currentTotalPriceSet: { shopMoney: { amount: "120.00" } },
                },
              },
              {
                node: {
                  createdAt: "2026-03-02T11:00:00Z",
                  currentTotalPriceSet: { shopMoney: { amount: "80.00" } },
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
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [
        {
          date: "2026-03-01",
          revenue: 100,
          purchases: 1,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
        {
          date: "2026-03-02",
          revenue: 200,
          purchases: 2,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
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

  it("returns commerce metrics even when optional customer fields are unavailable", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
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
                },
              },
              {
                node: {
                  createdAt: "2026-03-02T10:00:00Z",
                  currentTotalPriceSet: { shopMoney: { amount: "200.00" } },
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
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [
        {
          date: "2026-03-01",
          revenue: 100,
          purchases: 1,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
        {
          date: "2026-03-02",
          revenue: 200,
          purchases: 1,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
      ],
    });
    expect(reportingCache.setCachedReport).toHaveBeenCalledTimes(1);
  });

  it("uses shop-local timezone boundaries when building the orders filter", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          orders: {
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
            edges: [],
          },
        },
      }),
    } as Response);

    await getShopifyOverviewAggregate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      variables?: { query?: string };
    };

    expect(body.variables?.query).toContain("created_at:>=2026-03-01T05:00:00.000Z");
    expect(body.variables?.query).toContain("created_at:<=2026-03-02T04:59:59.000Z");
  });

  it("buckets orders by shop-local date instead of raw UTC date", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
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
                  createdAt: "2026-03-02T04:30:00Z",
                  currentTotalPriceSet: { shopMoney: { amount: "100.00" } },
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
      endDate: "2026-03-01",
    });

    expect(aggregate).toEqual({
      revenue: 100,
      purchases: 1,
      averageOrderValue: 100,
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [
        {
          date: "2026-03-01",
          revenue: 100,
          purchases: 1,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
      ],
    });
  });

  it("keeps Shopify aggregate on zero-order windows when the query succeeds", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          orders: {
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
            edges: [],
          },
        },
      }),
    } as Response);

    const aggregate = await getShopifyOverviewAggregate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    expect(aggregate).toEqual({
      revenue: 0,
      purchases: 0,
      averageOrderValue: null,
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [
        {
          date: "2026-03-01",
          revenue: 0,
          purchases: 0,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
      ],
    });
  });
});
