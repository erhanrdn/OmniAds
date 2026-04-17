import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `business-ref-${businessId}`] as const),
    );
  }),
}));

const db = await import("@/lib/db");

describe("provider account assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes canonical assignment rows and reads back the aggregate", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      queries.push(query);
      if (query.includes("FROM business_provider_accounts")) {
        return [
          {
            id: "assignment-1",
            business_id: "biz_1",
            provider: "google",
            account_ids: ["acc_1", "acc_2"],
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const { upsertProviderAccountAssignments } = await import("@/lib/provider-account-assignments");
    const result = await upsertProviderAccountAssignments({
      businessId: "biz_1",
      provider: "google",
      accountIds: ["acc_1", "acc_2"],
    });

    expect(result.id).toBe("assignment-1");
    expect(queries.join("\n")).toContain("INSERT INTO provider_accounts");
    expect(queries.join("\n")).toContain("INSERT INTO business_provider_accounts");
    expect(queries.join("\n")).toContain("business_ref_id");
  });

  it("reads aggregated assignments from normalized rows", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      queries.push(query);
      if (query.includes("FROM business_provider_accounts")) {
        return [
          {
            id: "assignment-1",
            business_id: "biz_1",
            provider: "meta",
            account_ids: ["acc_1", "acc_2"],
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const { getProviderAccountAssignments } = await import("@/lib/provider-account-assignments");
    const row = await getProviderAccountAssignments("biz_1", "meta");

    expect(row).toEqual({
      id: "assignment-1",
      business_id: "biz_1",
      provider: "meta",
      account_ids: ["acc_1", "acc_2"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    expect(queries.join("\n")).toContain("(ARRAY_AGG(bpa.id ORDER BY bpa.position, bpa.id))[1] AS id");
  });
});
