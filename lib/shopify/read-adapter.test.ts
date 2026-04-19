import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildShopifyOverviewCanaryKey, SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS } from "@/lib/shopify/serving";

vi.mock("@/lib/integrations", () => ({
  getIntegrationMetadata: vi.fn(),
}));

vi.mock("@/lib/shopify/overview", () => ({
  getShopifyOverviewAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/status", () => ({
  getShopifyStatus: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse-overview", () => ({
  getShopifyWarehouseOverviewAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/revenue-ledger", () => ({
  getShopifyRevenueLedgerAggregate: vi.fn(),
}));

vi.mock("@/lib/shopify/warehouse", () => ({
  getShopifyServingState: vi.fn(),
  getShopifyServingOverride: vi.fn(),
  listShopifyReconciliationRuns: vi.fn(),
}));

const overview = await import("@/lib/shopify/overview");
const status = await import("@/lib/shopify/status");
const warehouse = await import("@/lib/shopify/warehouse-overview");
const revenueLedger = await import("@/lib/shopify/revenue-ledger");
const warehouseState = await import("@/lib/shopify/warehouse");
const integrations = await import("@/lib/integrations");
const {
  getShopifyOverviewReadCandidate,
  getShopifyOverviewSummaryReadCandidate,
} = await import("@/lib/shopify/read-adapter");

describe("getShopifyOverviewReadCandidate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.SHOPIFY_WAREHOUSE_READ_CANARY;
    delete process.env.SHOPIFY_WAREHOUSE_PREVIEW_CANARY_BUSINESSES;
    delete process.env.SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER;
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      metadata: { shopifyProductionServingMode: "auto" },
      scopes: "read_orders,read_all_orders,read_returns",
      status: "connected",
      provider_account_id: "shop",
    } as never);
    vi.mocked(warehouseState.getShopifyServingState).mockResolvedValue(null as never);
    vi.mocked(warehouseState.getShopifyServingOverride).mockResolvedValue(null as never);
    vi.mocked(warehouseState.listShopifyReconciliationRuns).mockResolvedValue([] as never);
    vi.mocked(revenueLedger.getShopifyRevenueLedgerAggregate).mockResolvedValue({
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
    } as never);
  });

  it("prefers ledger truth even when warehouse canary is disabled", async () => {
    vi.mocked(status.getShopifyStatus).mockResolvedValue({
      state: "ready",
      connected: true,
      shopId: "shop",
      warehouse: null,
      sync: {
        ordersRecent: {
          latestSuccessfulSyncAt: "2026-04-02T10:00:00.000Z",
          cursorTimestamp: "2026-04-02T09:59:00.000Z",
          cursorValue: "orders_cursor",
        },
        returnsRecent: {
          latestSuccessfulSyncAt: "2026-04-02T10:00:00.000Z",
          cursorTimestamp: "2026-04-02T09:58:00.000Z",
          cursorValue: "returns_cursor",
        },
        ordersHistorical: null,
        returnsHistorical: null,
      },
      serving: null,
      reconciliation: null,
      issues: [],
    } as never);
    vi.mocked(overview.getShopifyOverviewAggregate).mockResolvedValue({
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
          revenue: 1001,
          purchases: 10,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
      ],
    } as never);
    vi.mocked(warehouse.getShopifyWarehouseOverviewAggregate).mockResolvedValue({
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
        },
      ],
    } as never);

    const result = await getShopifyOverviewReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.preferredSource).toBe("ledger");
    expect(result.canServeWarehouse).toBe(true);
    expect(result.divergence?.withinThreshold).toBe(true);
    expect(result.decisionReasons).toEqual([]);
    expect(result.servingMetadata.source).toBe("ledger");
    expect(result.servingMetadata.trustState).toBe("trusted");
    expect(result.servingMetadata.productionMode).toBe("auto");
    expect(warehouseState.getShopifyServingState).not.toHaveBeenCalled();
    expect(status.getShopifyStatus).toHaveBeenCalledWith({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      ignoreServingTrust: true,
    });
  });

  it("uses persisted live fallback for summary reads without running full status resolution", async () => {
    vi.mocked(warehouseState.getShopifyServingState).mockResolvedValue({
      businessId: "biz_1",
      providerAccountId: "shop",
      canaryKey: buildShopifyOverviewCanaryKey({
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
      }),
      preferredSource: "live",
      trustState: "live_fallback",
      fallbackReason: "pending_repair",
      coverageStatus: "historical_incomplete",
      productionMode: "auto",
      pendingRepair: true,
      assessedAt: "2026-04-02T10:00:00.000Z",
      decisionReasons: ["pending_repair"],
    } as never);
    vi.mocked(overview.getShopifyOverviewAggregate).mockResolvedValue({
      revenue: 1000,
      purchases: 10,
      averageOrderValue: 100,
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [],
    } as never);

    const result = await getShopifyOverviewSummaryReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.preferredSource).toBe("live");
    expect(result.live?.revenue).toBe(1000);
    expect(result.servingMetadata.trustState).toBe("live_fallback");
    expect(result.servingMetadata.fallbackReason).toBe("pending_repair");
    expect(status.getShopifyStatus).not.toHaveBeenCalled();
    expect(revenueLedger.getShopifyRevenueLedgerAggregate).not.toHaveBeenCalled();
  });

  it("uses fresh trusted reconciliation evidence for summary reads without live fallback", async () => {
    const now = new Date().toISOString();
    vi.mocked(warehouseState.getShopifyServingState).mockResolvedValue(null as never);
    vi.mocked(warehouseState.listShopifyReconciliationRuns).mockResolvedValue([
      {
        recordedAt: now,
        canServeWarehouse: true,
        preferredSource: "ledger",
        divergence: {
          withinThreshold: true,
          ledgerConsistency: {
            withinThreshold: true,
          },
          selectedRevenueTruthBasis: "gross_minus_total_refunded",
          basisSelectionReason: "closest_gross_minus_refunds_revenue",
        },
      },
    ] as never);
    vi.mocked(revenueLedger.getShopifyRevenueLedgerAggregate).mockResolvedValue({
      revenue: 1001,
      grossRevenue: 1020,
      refundedRevenue: 19,
      purchases: 10,
      returnEvents: 0,
      averageOrderValue: 100.1,
      daily: [],
      ledgerRows: 1,
    } as never);

    const result = await getShopifyOverviewSummaryReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.preferredSource).toBe("ledger");
    expect(result.live).toBeNull();
    expect(result.ledger?.revenue).toBe(1001);
    expect(result.servingMetadata.trustState).toBe("trusted");
    expect(result.servingMetadata.source).toBe("ledger");
    expect(result.servingMetadata.selectedRevenueTruthBasis).toBe(
      "gross_minus_total_refunded",
    );
    expect(overview.getShopifyOverviewAggregate).not.toHaveBeenCalled();
    expect(status.getShopifyStatus).not.toHaveBeenCalled();
  });

  it("allows warehouse canary when status is ready and divergence is within threshold", async () => {
    process.env.SHOPIFY_WAREHOUSE_READ_CANARY = "true";
    vi.mocked(status.getShopifyStatus).mockResolvedValue({
      state: "ready",
      connected: true,
      shopId: "shop",
      warehouse: null,
      sync: {
        ordersRecent: {
          latestSuccessfulSyncAt: "2026-04-02T10:00:00.000Z",
          cursorTimestamp: "2026-04-02T09:59:00.000Z",
          cursorValue: "orders_cursor",
        },
        returnsRecent: {
          latestSuccessfulSyncAt: "2026-04-02T10:00:00.000Z",
          cursorTimestamp: "2026-04-02T09:58:00.000Z",
          cursorValue: "returns_cursor",
        },
        ordersHistorical: null,
        returnsHistorical: null,
      },
      serving: null,
      reconciliation: null,
      issues: [],
    } as never);
    vi.mocked(overview.getShopifyOverviewAggregate).mockResolvedValue({
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
    } as never);
    vi.mocked(warehouse.getShopifyWarehouseOverviewAggregate).mockResolvedValue({
      revenue: 1005,
      grossRevenue: 1030,
      refundedRevenue: 25,
      purchases: 10,
      returnEvents: 0,
      averageOrderValue: 100.5,
      daily: [
        {
          date: "2026-03-01",
          orderRevenue: 1030,
          refundedRevenue: 25,
          netRevenue: 1005,
          orders: 10,
          returnEvents: 0,
        },
      ],
    } as never);

    const result = await getShopifyOverviewReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.preferredSource).toBe("ledger");
    expect(result.canServeWarehouse).toBe(true);
    expect(result.decisionReasons).toEqual([]);
    expect(result.servingMetadata.source).toBe("ledger");
    expect(result.servingMetadata.trustState).toBe("trusted");
    expect(result.servingMetadata.pendingRepair).toBe(false);
  });

  it("blocks warehouse canary when preview allowlist excludes the business", async () => {
    process.env.SHOPIFY_WAREHOUSE_READ_CANARY = "true";
    process.env.SHOPIFY_WAREHOUSE_PREVIEW_CANARY_BUSINESSES = "biz_other";
    vi.mocked(status.getShopifyStatus).mockResolvedValue({
      state: "ready",
      connected: true,
      shopId: "shop",
      warehouse: null,
      sync: {
        ordersRecent: null,
        returnsRecent: null,
        ordersHistorical: null,
        returnsHistorical: null,
      },
      serving: null,
      reconciliation: null,
      issues: [],
    } as never);
    vi.mocked(overview.getShopifyOverviewAggregate).mockResolvedValue({
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
          revenue: 1001,
          purchases: 10,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
      ],
    } as never);
    vi.mocked(warehouse.getShopifyWarehouseOverviewAggregate).mockResolvedValue({
      revenue: 1001,
      grossRevenue: 1020,
      refundedRevenue: 19,
      purchases: 10,
      returnEvents: 0,
      averageOrderValue: 100.1,
      daily: [],
    } as never);

    const result = await getShopifyOverviewReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.canServeWarehouse).toBe(false);
    expect(result.decisionReasons).toContain("preview_canary_not_allowed_for_business");
  });

  it("allows broader serving when default cutover gate is satisfied from reconciliation history", async () => {
    process.env.SHOPIFY_WAREHOUSE_READ_CANARY = "true";
    process.env.SHOPIFY_WAREHOUSE_DEFAULT_CUTOVER = "true";
    process.env.SHOPIFY_WAREHOUSE_PREVIEW_CANARY_BUSINESSES = "biz_other";
    vi.mocked(status.getShopifyStatus).mockResolvedValue({
      state: "ready",
      connected: true,
      shopId: "shop",
      warehouse: null,
      sync: {
        ordersRecent: null,
        returnsRecent: null,
        ordersHistorical: null,
        returnsHistorical: null,
      },
      serving: null,
      reconciliation: {
        latestRecordedAt: "2026-04-02T10:00:00.000Z",
        stableRunCount: 5,
        unstableRunCount: 0,
        defaultCutoverEligible: true,
      },
      issues: [],
    } as never);
    vi.mocked(overview.getShopifyOverviewAggregate).mockResolvedValue({
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
          revenue: 1001,
          purchases: 10,
          sessions: null,
          conversionRate: null,
          newCustomers: null,
          returningCustomers: null,
        },
      ],
    } as never);
    vi.mocked(warehouse.getShopifyWarehouseOverviewAggregate).mockResolvedValue({
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
        },
      ],
    } as never);

    const result = await getShopifyOverviewReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.canServeWarehouse).toBe(true);
    expect(result.preferredSource).toBe("ledger");
    expect(result.decisionReasons).not.toContain("preview_canary_not_allowed_for_business");
    expect(result.decisionReasons).not.toContain("default_cutover_gate_not_met");
  });

  it("blocks warehouse when ledger consistency is above threshold", async () => {
    process.env.SHOPIFY_WAREHOUSE_READ_CANARY = "true";
    vi.mocked(status.getShopifyStatus).mockResolvedValue({
      state: "ready",
      connected: true,
      shopId: "shop",
      warehouse: null,
      sync: {
        ordersRecent: null,
        returnsRecent: null,
        ordersHistorical: null,
        returnsHistorical: null,
      },
      serving: null,
      reconciliation: null,
      issues: [],
    } as never);
    vi.mocked(overview.getShopifyOverviewAggregate).mockResolvedValue({
      revenue: 1000,
      purchases: 10,
      averageOrderValue: 100,
      sessions: null,
      conversionRate: null,
      newCustomers: null,
      returningCustomers: null,
      dailyTrends: [],
    } as never);
    vi.mocked(warehouse.getShopifyWarehouseOverviewAggregate).mockResolvedValue({
      revenue: 1000,
      grossRevenue: 1100,
      refundedRevenue: 100,
      purchases: 10,
      returnEvents: 1,
      averageOrderValue: 110,
      daily: [],
    } as never);
    vi.mocked(revenueLedger.getShopifyRevenueLedgerAggregate).mockResolvedValue({
      revenue: 930,
      grossRevenue: 1100,
      refundedRevenue: 170,
      purchases: 7,
      returnEvents: 1,
      averageOrderValue: 157.14,
      daily: [],
      ledgerRows: 3,
    } as never);

    const result = await getShopifyOverviewReadCandidate({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.canServeWarehouse).toBe(false);
    expect(result.decisionReasons).toContain("ledger_semantics_above_threshold");
  });
});
