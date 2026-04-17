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
  isMissingRelationError: vi.fn(() => false),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `business-ref-${businessId}`] as const),
    );
  }),
}));

const { upsertBusinessCostModel } = await import("@/lib/business-cost-model");

describe("business cost model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sql.mockResolvedValue([
      {
        business_id: "biz-1",
        cogs_percent: 25,
        shipping_percent: 10,
        fee_percent: 5,
        fixed_monthly_cost: 100,
        updated_at: "2026-04-17T00:00:00.000Z",
      },
    ]);
  });

  it("writes canonical business refs during upsert", async () => {
    await upsertBusinessCostModel({
      businessId: "biz-1",
      cogsPercent: 25,
      shippingPercent: 10,
      feePercent: 5,
      fixedCost: 100,
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
  });
});
