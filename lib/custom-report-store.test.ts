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
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `business-ref-${businessId}`] as const),
    );
  }),
}));

const { createCustomReport } = await import("@/lib/custom-report-store");

describe("custom report store", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sql.mockResolvedValue([
      {
        id: "report-1",
        business_id: "biz-1",
        name: "Report",
        description: null,
        template_id: null,
        definition: {},
        created_at: "2026-04-17T00:00:00.000Z",
        updated_at: "2026-04-17T00:00:00.000Z",
      },
    ]);
  });

  it("writes canonical business refs", async () => {
    await createCustomReport({
      businessId: "biz-1",
      name: "Report",
      definition: {
        id: "report-1",
        version: 1,
        sections: [],
      } as never,
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
  });
});
