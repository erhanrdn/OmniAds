import { describe, expect, it } from "vitest";

import { compareShopifyAggregates } from "@/lib/shopify/divergence";

describe("compareShopifyAggregates", () => {
  it("marks aggregates within threshold when revenue and orders are close", () => {
    const result = compareShopifyAggregates({
      live: {
        revenue: 1000,
        purchases: 10,
        averageOrderValue: 100,
        sessions: null,
        conversionRate: null,
        newCustomers: null,
        returningCustomers: null,
        dailyTrends: [
          {
            date: "2026-03-01",
            revenue: 1000,
            purchases: 10,
            sessions: null,
            conversionRate: null,
            newCustomers: null,
            returningCustomers: null,
          },
        ],
      },
      warehouse: {
        revenue: 1018,
        grossRevenue: 1050,
        refundedRevenue: 32,
        purchases: 11,
        returnEvents: 0,
        averageOrderValue: 95.45,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 1050,
            refundedRevenue: 32,
            netRevenue: 1018,
            orders: 11,
            returnEvents: 0,
          },
        ],
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        revenueDelta: 18,
        revenueDeltaPercent: 1.8,
        purchaseDelta: 1,
        maxDailyRevenueDeltaPercent: 1.8,
        maxDailyPurchaseDelta: 1,
        withinThreshold: true,
      })
    );
  });

  it("fails threshold when divergence is too large", () => {
    const result = compareShopifyAggregates({
      live: {
        revenue: 1000,
        purchases: 10,
        averageOrderValue: 100,
        sessions: null,
        conversionRate: null,
        newCustomers: null,
        returningCustomers: null,
        dailyTrends: [
          {
            date: "2026-03-01",
            revenue: 1000,
            purchases: 10,
            sessions: null,
            conversionRate: null,
            newCustomers: null,
            returningCustomers: null,
          },
        ],
      },
      warehouse: {
        revenue: 700,
        grossRevenue: 800,
        refundedRevenue: 100,
        purchases: 4,
        returnEvents: 1,
        averageOrderValue: 175,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 800,
            refundedRevenue: 100,
            netRevenue: 700,
            orders: 4,
            returnEvents: 1,
          },
        ],
      },
    });

    expect(result.withinThreshold).toBe(false);
    expect(result.revenueDeltaPercent).toBe(30);
    expect(result.purchaseDelta).toBe(-6);
    expect(result.maxDailyPurchaseDelta).toBe(6);
  });
});
