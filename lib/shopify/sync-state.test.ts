import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  assertDbSchemaReady: vi.fn().mockResolvedValue(undefined),
  getDbSchemaReadiness: vi.fn().mockResolvedValue({
    ready: true,
    missingTables: [],
    checkedAt: "2026-04-17T00:00:00.000Z",
  }),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  ensureProviderAccountReferenceIds: vi.fn(async ({ accounts }: { accounts: Array<{ externalAccountId: string }> }) => {
    return new Map(
      accounts.map((account) => [account.externalAccountId, `${account.externalAccountId}-ref`] as const),
    );
  }),
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `${businessId}-ref`] as const),
    );
  }),
}));

const syncState = await import("@/lib/shopify/sync-state");

describe("shopify sync state canonical refs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sql.mockResolvedValue([]);
  });

  it("writes canonical ref ids during upsert", async () => {
    await syncState.upsertShopifySyncState({
      businessId: "biz-1",
      providerAccountId: "shop-1",
      syncTarget: "orders_recent",
      latestSyncStatus: "running",
    });

    const query = String((sql.mock.calls[0]?.[0] as TemplateStringsArray).join(" "));
    expect(query).toContain("business_ref_id");
    expect(query).toContain("provider_account_ref_id");
  });
});
