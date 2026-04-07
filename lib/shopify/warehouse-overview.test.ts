import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseShopifyTotalSalesReferenceCsv } from "@/lib/shopify/reference-data";
import {
  getShopifyWarehouseOverviewAggregate,
  summarizeShopifyWarehouseDailyRows,
} from "@/lib/shopify/warehouse-overview";

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

const db = await import("@/lib/db");

describe("shopify warehouse overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("summarizes warehouse daily rows into a refund-aware aggregate", () => {
    const aggregate = summarizeShopifyWarehouseDailyRows([
      {
        date: "2026-03-29",
        orderRevenue: 4722.08,
        refundedRevenue: 111.97,
        netRevenue: 0,
        orders: 18,
        returnEvents: 1,
      },
      {
        date: "2026-03-30",
        orderRevenue: 2453.25,
        refundedRevenue: 93.63,
        netRevenue: 0,
        orders: 11,
        returnEvents: 0,
      },
    ]);

    expect(aggregate).toEqual({
      revenue: 6969.73,
      grossRevenue: 7175.33,
      refundedRevenue: 205.6,
      purchases: 29,
      returnEvents: 1,
      averageOrderValue: 247.43,
      daily: [
        {
          date: "2026-03-29",
          orderRevenue: 4722.08,
          refundedRevenue: 111.97,
          netRevenue: 4610.11,
          orders: 18,
          returnEvents: 1,
        },
        {
          date: "2026-03-30",
          orderRevenue: 2453.25,
          refundedRevenue: 93.63,
          netRevenue: 2359.62,
          orders: 11,
          returnEvents: 0,
        },
      ],
    });
  });

  it("reads warehouse order and refund facts into a shadow aggregate", async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([
        { date: "2026-03-29", order_revenue: "4722.08", orders: "18" },
        { date: "2026-03-30", order_revenue: "2453.25", orders: "11" },
      ])
      .mockResolvedValueOnce([
        { date: "2026-03-29", refunded_revenue: "111.97" },
        { date: "2026-03-30", refunded_revenue: "93.63" },
      ])
      .mockResolvedValueOnce([{ date: "2026-03-29", return_events: "1" }]);
    const sql = vi.fn();
    Object.assign(sql, {
      query: queryMock,
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const aggregate = await getShopifyWarehouseOverviewAggregate({
      businessId: "biz_1",
      providerAccountId: "test-shop.myshopify.com",
      startDate: "2026-03-29",
      endDate: "2026-03-30",
    });

    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(aggregate.revenue).toBe(6969.73);
    expect(aggregate.returnEvents).toBe(1);
    expect(aggregate.daily.map((row) => ({ date: row.date, netRevenue: row.netRevenue }))).toEqual([
      { date: "2026-03-29", netRevenue: 4610.11 },
      { date: "2026-03-30", netRevenue: 2359.62 },
    ]);
  });

  it("can match reference total-sales rows when warehouse rows represent the same daily math", () => {
    const csv = [
      "Day,Orders,Gross sales,Discounts,Returns,Net sales,Shipping charges,Duties,Additional fees,Taxes,Total sales",
      "2026-03-29,18,4722.08,-135.04,-48.12,4538.92,42.16,0,0,29.03,4610.11",
      "2026-03-30,11,2453.25,-112.42,0,2340.83,0,0,0,18.79,2359.62",
    ].join("\n");
    const rows = parseShopifyTotalSalesReferenceCsv(csv);
    const aggregate = summarizeShopifyWarehouseDailyRows([
      {
        date: "2026-03-29",
        orderRevenue: 4722.08,
        refundedRevenue: 111.97,
        netRevenue: 0,
        orders: 18,
        returnEvents: 0,
      },
      {
        date: "2026-03-30",
        orderRevenue: 2453.25,
        refundedRevenue: 93.63,
        netRevenue: 0,
        orders: 11,
        returnEvents: 0,
      },
    ]);

    expect(aggregate.daily[0]?.netRevenue).toBe(rows[0]?.totalSales);
    expect(aggregate.daily[1]?.netRevenue).toBe(rows[1]?.totalSales);
  });
});
