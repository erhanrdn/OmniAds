import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = Object.assign(vi.fn(), {
  query: vi.fn(),
});

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  assertDbSchemaReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  ensureProviderAccountReferenceIds: vi.fn(
    async ({ accounts }: { accounts: Array<{ externalAccountId: string }> }) =>
      new Map(
        accounts.map((account) => [
          account.externalAccountId,
          `${account.externalAccountId}-ref`,
        ] as const),
      ),
  ),
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `${businessId}-ref`] as const),
    );
  }),
}));

const warehouse = await import("@/lib/shopify/warehouse");

describe("shopify warehouse payload archives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sql.mockResolvedValue([]);
    sql.query.mockResolvedValue([]);
  });

  it("writes order payloads to shopify_entity_payload_archives", async () => {
    await warehouse.upsertShopifyOrders([
      {
        businessId: "biz-1",
        providerAccountId: "shop-1.myshopify.com",
        shopId: "shop-1",
        orderId: "order-1",
        orderCreatedAt: "2026-04-19T00:00:00.000Z",
        orderUpdatedAt: "2026-04-19T01:00:00.000Z",
        payloadJson: { id: "gid://shopify/Order/1" },
      },
    ]);

    const orderInsertSql = sql.mock.calls
      .map(([strings]) => String((strings as TemplateStringsArray).join(" ")))
      .find((statement) => statement.includes("INSERT INTO shopify_orders"));
    const archiveSql = sql.query.mock.calls
      .map(([statement]) => String(statement))
      .find((statement) => statement.includes("INSERT INTO shopify_entity_payload_archives"));

    expect(orderInsertSql).toBeTruthy();
    expect(orderInsertSql).not.toContain("payload_json");
    expect(archiveSql).toContain("shopify_entity_payload_archives");
    expect(archiveSql).toContain("payload_json");
    expect(archiveSql).toContain("payload_hash");
  });

  it("writes transaction and sales-event payloads to shopify_entity_payload_archives", async () => {
    await warehouse.upsertShopifyOrderTransactions([
      {
        businessId: "biz-1",
        providerAccountId: "shop-1.myshopify.com",
        shopId: "shop-1",
        orderId: "order-1",
        transactionId: "txn-1",
        payloadJson: { id: "gid://shopify/OrderTransaction/1" },
      },
    ]);

    await warehouse.upsertShopifySalesEvents([
      {
        businessId: "biz-1",
        providerAccountId: "shop-1.myshopify.com",
        shopId: "shop-1",
        eventId: "event-1",
        sourceKind: "order",
        sourceId: "order-1",
        orderId: "order-1",
        occurredAt: "2026-04-19T01:00:00.000Z",
        payloadJson: { kind: "order" },
      },
    ]);

    const querySql = sql.query.mock.calls
      .map(([statement]) => String(statement))
      .join("\n");
    const templateSql = sql.mock.calls
      .map(([strings]) => String((strings as TemplateStringsArray).join(" ")))
      .join("\n");

    expect(querySql).toContain("shopify_entity_payload_archives");
    expect(templateSql).toContain("INSERT INTO shopify_sales_events");
    expect(templateSql).not.toContain("INSERT INTO shopify_sales_events (\n          business_id,\n          business_ref_id,\n          provider_account_id,\n          provider_account_ref_id,\n          shop_id,\n          event_id,\n          source_kind,\n          source_id,\n          order_id,\n          occurred_at,\n          occurred_date_local,\n          gross_sales,\n          refunded_sales,\n          refunded_shipping,\n          refunded_taxes,\n          net_revenue,\n          currency_code,\n          payload_json");
  });
});
