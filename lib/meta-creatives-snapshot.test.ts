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

const { persistMetaCreativesSnapshot } = await import("@/lib/meta-creatives-snapshot");

describe("meta creatives snapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sql.mockResolvedValue([]);
  });

  it("writes canonical business refs", async () => {
    await persistMetaCreativesSnapshot({
      businessId: "biz-1",
      assignedAccountIds: ["act_1"],
      start: "2026-04-01",
      end: "2026-04-02",
      groupBy: "ad",
      format: "table",
      sort: "spend_desc",
      payload: {},
      snapshotLevel: "metadata",
      rowCount: 1,
      previewReadyCount: 1,
    });

    const query = String(sql.mock.calls[0]?.[0]?.join(" ") ?? "");
    expect(query).toContain("business_ref_id");
  });
});
