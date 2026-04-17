import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `business-ref-${businessId}`] as const),
    );
  }),
}));

const { redeemDiscountCode } = await import("@/lib/discount-codes");

describe("discount codes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sql.mockResolvedValue([]);
  });

  it("writes canonical business refs for redemptions", async () => {
    await redeemDiscountCode({
      codeId: "code-1",
      userId: "user-1",
      businessId: "biz-1",
      planId: "pro",
      amountOff: 10,
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
  });
});
