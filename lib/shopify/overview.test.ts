import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
}));

vi.mock("@/lib/account-store", () => ({
  getBusinessTimezone: vi.fn(),
}));

vi.mock("@/lib/reporting-cache", () => ({
  getCachedReport: vi.fn(),
  getReportingDateRangeKey: vi.fn(() => "range-key"),
  setCachedReport: vi.fn(),
}));

const accountStore = await import("@/lib/account-store");
const integrations = await import("@/lib/integrations");
const reportingCache = await import("@/lib/reporting-cache");
const { getShopifyOverviewAggregate } = await import("@/lib/shopify/overview");

describe("getShopifyOverviewAggregate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(reportingCache.getCachedReport).mockResolvedValue(null);
    vi.mocked(accountStore.getBusinessTimezone).mockResolvedValue("Europe/Istanbul");
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
                  processedAt: "2026-03-01T10:05:00Z",
                  totalPriceSet: { shopMoney: { amount: "100.00" } },
                  currentTotalPriceSet: { shopMoney: { amount: "100.00" } },
                },
              },
              {
                node: {
                  createdAt: "2026-03-02T10:00:00Z",
                  processedAt: "2026-03-02T10:05:00Z",
                  totalPriceSet: { shopMoney: { amount: "120.00" } },
                  currentTotalPriceSet: { shopMoney: { amount: "120.00" } },
                },
              },
              {
                node: {
                  createdAt: "2026-03-02T11:00:00Z",
                  processedAt: "2026-03-02T11:10:00Z",
                  totalPriceSet: { shopMoney: { amount: "80.00" } },
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
      grossRevenue: null,
      refundedRevenue: null,
      returnEvents: null,
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
          grossRevenue: null,
          refundedRevenue: null,
          returnEvents: null,
          purchases: 1,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
        {
          date: "2026-03-02",
          revenue: 200,
          grossRevenue: null,
          refundedRevenue: null,
          returnEvents: null,
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
                  processedAt: "2026-03-01T10:05:00Z",
                  totalPriceSet: { shopMoney: { amount: "100.00" } },
                  currentTotalPriceSet: { shopMoney: { amount: "100.00" } },
                },
              },
              {
                node: {
                  createdAt: "2026-03-02T10:00:00Z",
                  processedAt: "2026-03-02T10:05:00Z",
                  totalPriceSet: { shopMoney: { amount: "200.00" } },
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
      grossRevenue: null,
      refundedRevenue: null,
      returnEvents: null,
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
          grossRevenue: null,
          refundedRevenue: null,
          returnEvents: null,
          purchases: 1,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
        {
          date: "2026-03-02",
          revenue: 200,
          grossRevenue: null,
          refundedRevenue: null,
          returnEvents: null,
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

  it("uses created_at shop-local boundaries and excludes test orders", async () => {
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

    expect(body.variables?.query).toContain("created_at:>=2026-02-28T05:00:00.000Z");
    expect(body.variables?.query).toContain("created_at:<=2026-03-03T04:59:59.000Z");
    expect(body.variables?.query).toContain("test:false");
  });

  it("buckets and sums revenue by createdAt using pre-return totals", async () => {
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
                  processedAt: "2026-03-02T04:30:00Z",
                  totalPriceSet: { shopMoney: { amount: "120.00" } },
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
      revenue: 120,
      grossRevenue: null,
      refundedRevenue: null,
      returnEvents: null,
      purchases: 1,
      averageOrderValue: 120,
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [
        {
          date: "2026-03-01",
          revenue: 120,
          grossRevenue: null,
          refundedRevenue: null,
          returnEvents: null,
          purchases: 1,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
      ],
    });
  });

  it("logs a semantic delta when current totals diverge from gross minus refunds", async () => {
    const fetchMock = vi.mocked(fetch);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
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
                  processedAt: "2026-03-01T10:10:00Z",
                  currentTotalPriceSet: { shopMoney: { amount: "80.00" } },
                  totalPriceSet: { shopMoney: { amount: "100.00" } },
                  totalRefundedSet: { shopMoney: { amount: "10.00" } },
                  cancelledAt: null,
                  test: false,
                },
              },
            ],
          },
        },
      }),
    } as Response);

    await getShopifyOverviewAggregate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    expect(infoSpy).toHaveBeenCalledWith(
      "[shopify-overview] revenue_semantic_delta",
      expect.objectContaining({
        currentRevenue: 80,
        preReturnRevenue: 100,
        grossMinusRefundsRevenue: 90,
        currentVsPreReturnDelta: -20,
        preReturnVsGrossMinusRefundsDelta: 10,
        refundedOrders: 1,
      })
    );
    infoSpy.mockRestore();
  });

  it("logs adjacent-day attribution shadow data when timezone or event bases diverge", async () => {
    const fetchMock = vi.mocked(fetch);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
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
                  createdAt: "2026-03-02T03:30:00Z",
                  processedAt: "2026-03-02T05:30:00Z",
                  totalPriceSet: { shopMoney: { amount: "100.00" } },
                  currentTotalPriceSet: { shopMoney: { amount: "100.00" } },
                  totalRefundedSet: { shopMoney: { amount: "0.00" } },
                  cancelledAt: null,
                  test: false,
                },
              },
            ],
          },
        },
      }),
    } as Response);

    await getShopifyOverviewAggregate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-01",
    });

    expect(infoSpy).toHaveBeenCalledWith(
      "[shopify-overview] daily_attribution_shadow",
      expect.objectContaining({
        publicRevenueBasis: "created_at",
        publicTimezoneBasis: "America/New_York",
        days: expect.arrayContaining([
          expect.objectContaining({
            date: "2026-03-01",
            createdShopRevenue: 100,
            processedShopRevenue: 0,
          }),
          expect.objectContaining({
            date: "2026-03-02",
            createdShopRevenue: 0,
            processedShopRevenue: 100,
          }),
        ]),
      })
    );
    infoSpy.mockRestore();
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
      grossRevenue: null,
      refundedRevenue: null,
      returnEvents: null,
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
          grossRevenue: null,
          refundedRevenue: null,
          returnEvents: null,
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
