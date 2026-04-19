import { describe, expect, it } from "vitest";

import { compareShopifyAggregates, compareShopifyWarehouseAndLedger } from "@/lib/shopify/divergence";

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

  it("treats warehouse-only daily rows as divergence instead of ignoring them", () => {
    const result = compareShopifyAggregates({
      live: {
        revenue: 0,
        purchases: 0,
        averageOrderValue: null,
        sessions: null,
        conversionRate: null,
        newCustomers: null,
        returningCustomers: null,
        dailyTrends: [],
      },
      warehouse: {
        revenue: 120,
        grossRevenue: 120,
        refundedRevenue: 0,
        purchases: 1,
        returnEvents: 0,
        averageOrderValue: 120,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 120,
            refundedRevenue: 0,
            netRevenue: 120,
            orders: 1,
            returnEvents: 0,
          },
        ],
      },
    });

    expect(result.revenueDeltaPercent).toBe(100);
    expect(result.maxDailyRevenueDeltaPercent).toBe(100);
    expect(result.maxDailyPurchaseDelta).toBe(1);
    expect(result.withinThreshold).toBe(false);
  });

  it("uses carryover-aware order truth when comparing live and warehouse aggregates", () => {
    const result = compareShopifyAggregates({
      live: {
        revenue: 20310.43,
        purchases: 104,
        averageOrderValue: 195.29,
        sessions: null,
        conversionRate: null,
        newCustomers: null,
        returningCustomers: null,
        dailyTrends: [
          {
            date: "2026-04-12",
            revenue: 3495.86,
            purchases: 16,
            sessions: null,
            conversionRate: null,
            newCustomers: null,
            returningCustomers: null,
          },
          {
            date: "2026-04-18",
            revenue: 2137.55,
            purchases: 16,
            sessions: null,
            conversionRate: null,
            newCustomers: null,
            returningCustomers: null,
          },
        ],
      },
      warehouse: {
        revenue: 19591.82,
        grossRevenue: 20460.22,
        refundedRevenue: 868.4,
        purchases: 105,
        returnEvents: 0,
        averageOrderValue: 194.86,
        daily: [
          {
            date: "2026-04-12",
            orderRevenue: 3495.86,
            refundedRevenue: 67.12,
            netRevenue: 3428.74,
            orders: 16,
            returnEvents: 0,
          },
          {
            date: "2026-04-18",
            orderRevenue: 2287.34,
            refundedRevenue: 102.23,
            netRevenue: 2185.11,
            orders: 17,
            returnEvents: 0,
          },
        ],
      },
      ledger: {
        revenue: 19591.82,
        grossRevenue: 20460.22,
        refundedRevenue: 868.4,
        purchases: 105,
        returnEvents: 0,
        averageOrderValue: 186.59,
        currentOrderRevenue: 20238.5,
        grossMinusRefundsOrderRevenue: 20238.5,
        transactionCapturedRevenue: 20460.26,
        transactionRefundedRevenue: 233.4,
        transactionNetRevenue: 20226.86,
        transactionCoveredOrders: 105,
        transactionCoveredRevenue: 20460.26,
        transactionCoverageRate: 100,
        transactionCoverageAmountRate: 100,
        daily: [
          {
            date: "2026-04-12",
            orderRevenue: 3495.86,
            refundedRevenue: 67.12,
            netRevenue: 3428.74,
            orders: 16,
            returnEvents: 0,
            orderEventCount: 16,
            adjustmentEventCount: 1,
            refundEventCount: 1,
            adjustmentRevenue: -67.12,
            refundPressure: 67.12,
            dailySemanticDrift: 134.24,
          },
          {
            date: "2026-04-18",
            orderRevenue: 2287.34,
            refundedRevenue: 102.23,
            netRevenue: 2185.11,
            orders: 17,
            returnEvents: 0,
            orderEventCount: 17,
            adjustmentEventCount: 2,
            refundEventCount: 2,
            adjustmentRevenue: -59.35,
            refundPressure: 102.23,
            dailySemanticDrift: 161.58,
          },
        ],
        ledgerRows: 7,
        orderEventCount: 105,
        adjustmentEventCount: 8,
        refundEventCount: 9,
        adjustmentRevenue: -825.52,
        refundPressure: 868.4,
        dailySemanticDrift: 1693.92,
        carryoverRefundRevenue: 646.68,
      },
    });

    expect(result.revenueDelta).toBe(-71.93);
    expect(result.revenueDeltaPercent).toBe(0.35);
    expect(result.purchaseDelta).toBe(1);
    expect(result.maxDailyRevenueDeltaPercent).toBe(7.01);
    expect(result.maxDailyPurchaseDelta).toBe(1);
    expect(result.withinThreshold).toBe(true);
  });

  it("flags ledger consistency drift when warehouse and ledger semantics diverge too far", () => {
    const result = compareShopifyWarehouseAndLedger({
      warehouse: {
        revenue: 1000,
        grossRevenue: 1100,
        refundedRevenue: 100,
        purchases: 10,
        returnEvents: 1,
        averageOrderValue: 110,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 1100,
            refundedRevenue: 100,
            netRevenue: 1000,
            orders: 10,
            returnEvents: 1,
          },
        ],
      },
      ledger: {
        revenue: 930,
        grossRevenue: 1100,
        refundedRevenue: 170,
        purchases: 7,
        returnEvents: 1,
        averageOrderValue: 157.14,
        currentOrderRevenue: 930,
        grossMinusRefundsOrderRevenue: 930,
        transactionCapturedRevenue: 1100,
        transactionRefundedRevenue: 170,
        transactionNetRevenue: 930,
        transactionCoveredOrders: 7,
        transactionCoveredRevenue: 930,
        transactionCoverageRate: 70,
        transactionCoverageAmountRate: 84.55,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 1100,
            refundedRevenue: 170,
            netRevenue: 930,
            orders: 7,
            returnEvents: 1,
            orderEventCount: 7,
            adjustmentEventCount: 2,
            refundEventCount: 1,
            adjustmentRevenue: -45,
            refundPressure: 170,
            dailySemanticDrift: 215,
          },
        ],
        ledgerRows: 3,
        orderEventCount: 7,
        adjustmentEventCount: 2,
        refundEventCount: 1,
        adjustmentRevenue: -45,
        refundPressure: 170,
        dailySemanticDrift: 215,
      },
    });

    expect(result.withinThreshold).toBe(false);
    expect(result.revenueDeltaPercent).toBe(7);
    expect(result.purchaseDelta).toBe(-3);
    expect(result.refundedRevenueDelta).toBe(25);
    expect(result.returnEventDelta).toBe(0);
    expect(result.orderRevenueTruthDelta).toBe(0);
    expect(result.transactionRevenueDelta).toBe(0);
    expect(result.adjustmentRevenueDelta).toBe(-45);
    expect(result.failureReasons).toContain("revenue_delta_percent_above_threshold");
    expect(result.failureReasons).toContain("purchase_delta_above_threshold");
    expect(result.failureReasons).toContain("daily_semantic_drift_above_threshold");
    expect(result.maxDailySemanticDrift).toBe(140);
    expect(result.consistencyScore).toBeLessThan(100);
  });

  it("does not fail ledger trust on explained negative adjustment refunds when net revenue matches", () => {
    const result = compareShopifyWarehouseAndLedger({
      warehouse: {
        revenue: 105,
        grossRevenue: 120,
        refundedRevenue: 0,
        purchases: 1,
        returnEvents: 0,
        averageOrderValue: 120,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 120,
            refundedRevenue: 0,
            netRevenue: 105,
            orders: 1,
            returnEvents: 0,
          },
        ],
      },
      ledger: {
        revenue: 105,
        grossRevenue: 120,
        refundedRevenue: 15,
        purchases: 1,
        returnEvents: 0,
        averageOrderValue: 105,
        currentOrderRevenue: 105,
        grossMinusRefundsOrderRevenue: 120,
        transactionCapturedRevenue: 120,
        transactionRefundedRevenue: 15,
        transactionNetRevenue: 105,
        transactionCoveredOrders: 1,
        transactionCoveredRevenue: 105,
        transactionCoverageRate: 100,
        transactionCoverageAmountRate: 87.5,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 120,
            refundedRevenue: 15,
            netRevenue: 105,
            orders: 1,
            returnEvents: 0,
            orderEventCount: 1,
            adjustmentEventCount: 1,
            refundEventCount: 0,
            adjustmentRevenue: -15,
            refundPressure: 15,
            dailySemanticDrift: 30,
          },
        ],
        ledgerRows: 2,
        orderEventCount: 1,
        adjustmentEventCount: 1,
        refundEventCount: 0,
        adjustmentRevenue: -15,
        refundPressure: 15,
        dailySemanticDrift: 30,
      },
    });

    expect(result.revenueDelta).toBe(0);
    expect(result.refundedRevenueDelta).toBe(0);
    expect(result.refundPressureDelta).toBe(0);
    expect(result.adjustmentRevenueDelta).toBe(0);
    expect(result.maxDailyRefundPressureDelta).toBe(0);
    expect(result.maxDailyAdjustmentDelta).toBe(0);
    expect(result.maxDailySemanticDrift).toBe(0);
    expect(result.failureReasons).toEqual([]);
    expect(result.withinThreshold).toBe(true);
  });

  it("normalizes carryover refunds from out-of-window orders when evaluating order and transaction truth", () => {
    const result = compareShopifyWarehouseAndLedger({
      warehouse: {
        revenue: 19343.03,
        grossRevenue: 20211.43,
        refundedRevenue: 868.4,
        purchases: 103,
        returnEvents: 0,
        averageOrderValue: 196.23,
        daily: [
          {
            date: "2026-04-12",
            orderRevenue: 3495.86,
            refundedRevenue: 67.12,
            netRevenue: 3428.74,
            orders: 16,
            returnEvents: 0,
          },
          {
            date: "2026-04-17",
            orderRevenue: 2642.47,
            refundedRevenue: 411.26,
            netRevenue: 2231.21,
            orders: 18,
            returnEvents: 0,
          },
        ],
      },
      ledger: {
        revenue: 19343.03,
        grossRevenue: 20211.43,
        refundedRevenue: 868.4,
        purchases: 103,
        returnEvents: 0,
        averageOrderValue: 187.8,
        carryoverRefundRevenue: 646.68,
        currentOrderRevenue: 19989.71,
        grossMinusRefundsOrderRevenue: 19989.71,
        transactionCapturedRevenue: 20211.47,
        transactionRefundedRevenue: 233.4,
        transactionNetRevenue: 19978.07,
        transactionCoveredOrders: 103,
        transactionCoveredRevenue: 20211.47,
        transactionCoverageRate: 100,
        transactionCoverageAmountRate: 100,
        daily: [
          {
            date: "2026-04-12",
            orderRevenue: 3495.86,
            refundedRevenue: 67.12,
            netRevenue: 3428.74,
            orders: 16,
            returnEvents: 0,
            orderEventCount: 16,
            adjustmentEventCount: 1,
            refundEventCount: 1,
            adjustmentRevenue: -67.12,
            refundPressure: 67.12,
            dailySemanticDrift: 134.24,
          },
          {
            date: "2026-04-17",
            orderRevenue: 2642.47,
            refundedRevenue: 411.26,
            netRevenue: 2231.21,
            orders: 18,
            returnEvents: 0,
            orderEventCount: 18,
            adjustmentEventCount: 3,
            refundEventCount: 4,
            adjustmentRevenue: -411.26,
            refundPressure: 411.26,
            dailySemanticDrift: 822.52,
          },
        ],
        ledgerRows: 7,
        orderEventCount: 103,
        adjustmentEventCount: 8,
        refundEventCount: 9,
        adjustmentRevenue: -825.52,
        refundPressure: 868.4,
        dailySemanticDrift: 1693.92,
      },
    });

    expect(result.revenueDelta).toBe(0);
    expect(result.refundedRevenueDelta).toBe(0);
    expect(result.orderRevenueTruthDelta).toBe(0);
    expect(result.transactionRevenueDelta).toBeCloseTo(11.64, 2);
    expect(result.failureReasons).toEqual([]);
    expect(result.withinThreshold).toBe(true);
  });

  it("fails ledger trust when both order basis and transaction basis disagree at meaningful coverage", () => {
    const result = compareShopifyWarehouseAndLedger({
      warehouse: {
        revenue: 100,
        grossRevenue: 100,
        refundedRevenue: 0,
        purchases: 1,
        returnEvents: 0,
        averageOrderValue: 100,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 100,
            refundedRevenue: 0,
            netRevenue: 100,
            orders: 1,
            returnEvents: 0,
          },
        ],
      },
      ledger: {
        revenue: 160,
        grossRevenue: 160,
        refundedRevenue: 0,
        purchases: 1,
        returnEvents: 0,
        averageOrderValue: 160,
        currentOrderRevenue: 100,
        grossMinusRefundsOrderRevenue: 100,
        transactionCapturedRevenue: 100,
        transactionRefundedRevenue: 0,
        transactionNetRevenue: 100,
        transactionCoveredOrders: 1,
        transactionCoveredRevenue: 100,
        transactionCoverageRate: 100,
        transactionCoverageAmountRate: 62.5,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 160,
            refundedRevenue: 0,
            netRevenue: 160,
            orders: 1,
            returnEvents: 0,
            orderEventCount: 1,
            adjustmentEventCount: 0,
            refundEventCount: 0,
            adjustmentRevenue: 0,
            refundPressure: 0,
            dailySemanticDrift: 60,
          },
        ],
        ledgerRows: 1,
        orderEventCount: 1,
        adjustmentEventCount: 0,
        refundEventCount: 0,
        adjustmentRevenue: 0,
        refundPressure: 0,
        dailySemanticDrift: 60,
      },
    });

    expect(result.orderRevenueTruthDelta).toBe(60);
    expect(result.transactionRevenueDelta).toBe(60);
    expect(result.failureReasons).toContain("order_revenue_truth_delta_above_threshold");
    expect(result.failureReasons).toContain("transaction_revenue_delta_above_threshold");
    expect(result.withinThreshold).toBe(false);
  });
});
