import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  assertDbSchemaReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `${businessId}-ref`] as const),
    );
  }),
}));

const locks = await import("@/lib/sync/provider-job-lock");

describe("provider job lock canonical refs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes business_ref_id when acquiring a lock", async () => {
    sql.mockResolvedValueOnce([{ already_running: false, acquired: true }]);

    await locks.acquireProviderJobLock({
      businessId: "biz-1",
      provider: "meta",
      reportType: "report",
      dateRangeKey: "2026-04-01:2026-04-07",
      ownerToken: "worker-1",
    });

    expect(String((sql.mock.calls[0]?.[0] as TemplateStringsArray).join(" "))).toContain(
      "business_ref_id",
    );
  });

  it("preserves business_ref_id on renew and release", async () => {
    sql.mockResolvedValue([{ id: "job-1" }]);

    await locks.renewProviderJobLock({
      businessId: "biz-1",
      provider: "meta",
      reportType: "report",
      dateRangeKey: "2026-04-01:2026-04-07",
      ownerToken: "worker-1",
    });

    await locks.releaseProviderJobLock({
      businessId: "biz-1",
      provider: "meta",
      reportType: "report",
      dateRangeKey: "2026-04-01:2026-04-07",
      ownerToken: "worker-1",
      status: "done",
    });

    const joined = sql.mock.calls
      .map(([strings]) => String((strings as TemplateStringsArray).join(" ")))
      .join("\n");
    expect(joined).toContain("business_ref_id = COALESCE");
  });
});
