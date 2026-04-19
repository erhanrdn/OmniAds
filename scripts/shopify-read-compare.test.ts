import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shopify/read-adapter", () => ({
  getShopifyOverviewSummaryReadCandidate: vi.fn(),
}));

vi.mock("@/lib/overview-service", () => ({
  getShopifyOverviewServingData: vi.fn(),
}));

const readAdapter = await import("@/lib/shopify/read-adapter");
const overviewService = await import("@/lib/overview-service");
const {
  buildExpectedShopifyOverviewServingData,
  buildShopifyReadCompareArtifact,
  parseShopifyReadCompareArgs,
} = await import("@/scripts/shopify-read-compare");

describe("shopify read compare", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("parses required cli args", () => {
    expect(
      parseShopifyReadCompareArgs([
        "--business-id",
        "biz-1",
        "--start-date",
        "2026-03-01",
        "--end-date",
        "2026-03-31",
      ]),
    ).toEqual({
      businessId: "biz-1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      jsonOut: null,
    });
  });

  it("builds the expected ledger-backed serving aggregate", () => {
    const expected = buildExpectedShopifyOverviewServingData({
      preferredSource: "ledger",
      live: {
        revenue: 1000,
        purchases: 10,
        averageOrderValue: 100,
        sessions: 20,
        conversionRate: 0.5,
        newCustomers: 2,
        returningCustomers: 8,
        dailyTrends: [
          {
            date: "2026-03-01",
            revenue: 1000,
            purchases: 10,
            sessions: 20,
            conversionRate: 0.5,
            newCustomers: 2,
            returningCustomers: 8,
          },
        ],
      },
      warehouse: null,
      ledger: {
        revenue: 1001,
        grossRevenue: 1020,
        refundedRevenue: 19,
        purchases: 10,
        returnEvents: 0,
        averageOrderValue: 100.1,
        daily: [
          {
            date: "2026-03-01",
            orderRevenue: 1020,
            refundedRevenue: 19,
            netRevenue: 1001,
            orders: 10,
            returnEvents: 0,
            orderEventCount: 10,
            adjustmentEventCount: 0,
            refundEventCount: 0,
            adjustmentRevenue: 0,
            refundPressure: 19,
            dailySemanticDrift: 0,
          },
        ],
        ledgerRows: 1,
        orderEventCount: 10,
        adjustmentEventCount: 0,
        refundEventCount: 0,
        adjustmentRevenue: 0,
        refundPressure: 19,
        dailySemanticDrift: 0,
        currentOrderRevenue: null,
        grossMinusRefundsOrderRevenue: null,
        transactionCapturedRevenue: null,
        transactionRefundedRevenue: null,
        transactionNetRevenue: null,
        transactionCoveredOrders: 0,
        transactionCoveredRevenue: null,
        transactionCoverageRate: null,
        transactionCoverageAmountRate: null,
      },
      canaryEnabled: true,
      canServeWarehouse: true,
      decisionReasons: [],
      divergence: null,
      ledgerConsistency: null,
      override: null,
      servingMetadata: {
        source: "ledger",
        provider: "shopify",
        trustState: "trusted",
        fallbackReason: null,
        lastSyncedAt: null,
        coverageStatus: "recent_ready",
        productionMode: "auto",
        pendingRepair: false,
        pendingRepairStartedAt: null,
        pendingRepairLastTopic: null,
        pendingRepairLastReceivedAt: null,
        selectedRevenueTruthBasis: null,
        basisSelectionReason: null,
        transactionCoverageOrderRate: null,
        transactionCoverageAmountRate: null,
        explainedAdjustmentRevenue: null,
        unexplainedAdjustmentRevenue: null,
      },
      status: {
        state: "ready",
        connected: true,
        shopId: "shop-1",
        warehouse: null,
        sync: null,
        serving: null,
        reconciliation: null,
        issues: [],
      },
    } as never);

    expect(expected.aggregate?.revenue).toBe(1001);
    expect(expected.aggregate?.dailyTrends[0]).toEqual(
      expect.objectContaining({
        revenue: 1001,
        grossRevenue: 1020,
        refundedRevenue: 19,
        sessions: 20,
      }),
    );
  });

  it("reports no diffs when actual serving matches the selected source", async () => {
    vi.mocked(readAdapter.getShopifyOverviewSummaryReadCandidate).mockResolvedValue({
      preferredSource: "live",
      live: null,
      warehouse: null,
      ledger: null,
      canaryEnabled: false,
      canServeWarehouse: false,
      decisionReasons: ["warehouse_read_canary_disabled"],
      divergence: null,
      ledgerConsistency: null,
      override: null,
      servingMetadata: {
        source: "live",
        provider: "shopify",
        trustState: "live_fallback",
        fallbackReason: "warehouse_read_canary_disabled",
        lastSyncedAt: null,
        coverageStatus: "recent_only",
        productionMode: "auto",
        pendingRepair: false,
        pendingRepairStartedAt: null,
        pendingRepairLastTopic: null,
        pendingRepairLastReceivedAt: null,
        selectedRevenueTruthBasis: null,
        basisSelectionReason: null,
        transactionCoverageOrderRate: null,
        transactionCoverageAmountRate: null,
        explainedAdjustmentRevenue: null,
        unexplainedAdjustmentRevenue: null,
      },
      status: {
        state: "partial",
        connected: true,
        shopId: "shop-1",
        warehouse: null,
        sync: null,
        serving: null,
        reconciliation: null,
        issues: [],
      },
    } as never);
    vi.mocked(overviewService.getShopifyOverviewServingData).mockResolvedValue({
      aggregate: null,
      serving: {
        source: "live",
        provider: "shopify",
        trustState: "live_fallback",
        fallbackReason: "warehouse_read_canary_disabled",
        lastSyncedAt: null,
        coverageStatus: "recent_only",
        productionMode: "auto",
        pendingRepair: false,
        pendingRepairStartedAt: null,
        pendingRepairLastTopic: null,
        pendingRepairLastReceivedAt: null,
        selectedRevenueTruthBasis: null,
        basisSelectionReason: null,
        transactionCoverageOrderRate: null,
        transactionCoverageAmountRate: null,
        explainedAdjustmentRevenue: null,
        unexplainedAdjustmentRevenue: null,
      },
    } as never);

    const artifact = buildShopifyReadCompareArtifact({
      businessId: "biz-1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      candidate: await readAdapter.getShopifyOverviewSummaryReadCandidate({
        businessId: "biz-1",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      }),
      actual: await overviewService.getShopifyOverviewServingData({
        businessId: "biz-1",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      }),
    });

    expect(artifact.blockingDiffCount).toBe(0);
    expect(artifact.blockingDiffs).toEqual([]);
  });
});
