import { describe, expect, it } from "vitest";
import {
  buildShopifyRolloutSummary,
  parseShopifyHealthSnapshotArgs,
  projectShopifyRepairIntentsForSnapshot,
} from "@/scripts/shopify-health-snapshot";

describe("shopify health snapshot helpers", () => {
  it("parses required cli args", () => {
    expect(
      parseShopifyHealthSnapshotArgs([
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

  it("projects repair intents to stable health snapshot fields", () => {
    expect(
      projectShopifyRepairIntentsForSnapshot([
        {
          id: "repair-1",
          businessId: "biz-1",
          providerAccountId: "shop-1",
          entityType: "order",
          entityId: "order-1",
          topic: "orders/create",
          payloadHash: "hash-1",
          status: "processed",
          attemptCount: 2,
          lastError: null,
          lastSyncResult: { ok: true },
          updatedAt: "2026-04-19T00:00:00.000Z",
        },
      ] as never),
    ).toEqual([
      {
        id: "repair-1",
        entityType: "order",
        entityId: "order-1",
        topic: "orders/create",
        payloadHash: "hash-1",
        status: "processed",
        attemptCount: 2,
        lastError: null,
        hasLastSyncResult: true,
        updatedAt: "2026-04-19T00:00:00.000Z",
      },
    ]);
  });

  it("builds rollout blockers from webhook failures and ledger inconsistency", () => {
    const summary = buildShopifyRolloutSummary({
      status: {
        state: "partial",
        connected: true,
        shopId: "shop-1",
        warehouse: null,
        sync: null,
        serving: null,
        reconciliation: {
          latestRecordedAt: null,
          stableRunCount: 0,
          stableWarehouseRunCount: 0,
          stableLedgerRunCount: 0,
          unstableRunCount: 1,
          defaultCutoverEligible: false,
        },
        issues: ["recent sync stale"],
      } as never,
      ledgerConsistency: {
        withinThreshold: false,
        consistencyScore: 42,
        failureReasons: ["revenue_delta"],
      } as never,
      override: null,
      serving: {
        decisionReasons: ["pending_repair"],
      } as never,
      history: [],
      reconciliationHistory: [],
      webhookDeliveries: [
        {
          processingState: "failed",
          topic: "orders/create",
          processedAt: "2026-04-19T00:00:00.000Z",
          errorMessage: "boom",
        },
      ],
    });

    expect(summary.blockers).toEqual(
      expect.arrayContaining([
        "recent sync stale",
        "Shopify ledger semantic consistency is above serving threshold.",
        "Ledger semantic blocker: revenue_delta.",
        "Recent Shopify webhook deliveries include failed refresh attempts.",
      ]),
    );
    expect(summary.hasRecentWebhookFailures).toBe(true);
    expect(summary.lastDecisionReasons).toEqual(["pending_repair"]);
    expect(summary.recentWebhookFailures).toEqual([
      {
        topic: "orders/create",
        errorMessage: "boom",
        processedAt: "2026-04-19T00:00:00.000Z",
      },
    ]);
  });

  it("treats stable fresh reconciliation evidence as default-cutover ready", () => {
    const now = new Date().toISOString();
    const summary = buildShopifyRolloutSummary({
      status: {
        state: "ready",
        connected: true,
        shopId: "shop-1",
        warehouse: null,
        sync: null,
        serving: null,
        reconciliation: {
          latestRecordedAt: now,
          stableRunCount: 5,
          stableWarehouseRunCount: 0,
          stableLedgerRunCount: 5,
          unstableRunCount: 0,
          defaultCutoverEligible: false,
        },
        issues: [],
      } as never,
      ledgerConsistency: { withinThreshold: true } as never,
      override: null,
      serving: null,
      history: [],
      reconciliationHistory: [],
      webhookDeliveries: [],
    });

    expect(summary.broaderLocalServingReady).toBe(true);
    expect(summary.defaultCutoverReady).toBe(true);
    expect(summary.blockers).toEqual([]);
  });
});
