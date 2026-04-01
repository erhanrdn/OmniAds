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
        dailyTrends: [],
      },
      warehouse: {
        revenue: 1018,
        grossRevenue: 1050,
        refundedRevenue: 32,
        purchases: 11,
        averageOrderValue: 95.45,
        daily: [],
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        revenueDelta: 18,
        revenueDeltaPercent: 1.8,
        purchaseDelta: 1,
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
        dailyTrends: [],
      },
      warehouse: {
        revenue: 700,
        grossRevenue: 800,
        refundedRevenue: 100,
        purchases: 4,
        averageOrderValue: 175,
        daily: [],
      },
    });

    expect(result.withinThreshold).toBe(false);
    expect(result.revenueDeltaPercent).toBe(30);
    expect(result.purchaseDelta).toBe(-6);
  });
});
