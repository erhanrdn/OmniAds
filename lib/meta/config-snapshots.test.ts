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
      accounts.map((account) => [account.externalAccountId, `provider-ref-${account.externalAccountId}`] as const),
    );
  }),
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `business-ref-${businessId}`] as const),
    );
  }),
}));

const { appendMetaConfigSnapshots } = await import("@/lib/meta/config-snapshots");

describe("meta config snapshots", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sql.mockResolvedValue([]);
  });

  it("writes canonical business and provider refs", async () => {
    await appendMetaConfigSnapshots([
      {
        businessId: "biz-1",
        accountId: "act_1",
        entityLevel: "campaign",
        entityId: "cmp_1",
        payload: {
          optimizationGoal: null,
          bidStrategyType: null,
          bidStrategyLabel: null,
          manualBidAmount: null,
          bidValue: null,
          bidValueFormat: null,
          dailyBudget: null,
          lifetimeBudget: null,
        },
      },
    ]);

    const query = String(sql.mock.calls[0]?.[0]?.join(" ") ?? "");
    expect(query).toContain("business_ref_id");
    expect(query).toContain("provider_account_ref_id");
    expect(query).toContain("business_ref_id uuid");
    expect(query).toContain("provider_account_ref_id uuid");
  });
});
