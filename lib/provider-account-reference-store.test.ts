import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

const db = await import("@/lib/db");

describe("provider account reference store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts provider accounts and returns canonical ref ids", async () => {
    const queries: string[] = [];
    const sql = {
      query: vi.fn(async (query: string, values?: unknown[]) => {
        queries.push(query);
        if (query.includes("SELECT\n          id::text AS provider_account_ref_id")) {
          return [
            {
              provider_account_ref_id: "provider-account-ref-1",
              external_account_id: "acc-1",
            },
          ];
        }
        if (query.includes("INSERT INTO provider_accounts")) {
          expect(values?.[1]).toBe("google");
          return [];
        }
        throw new Error(`Unexpected query: ${query}`);
      }),
    };
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const { ensureProviderAccountReferenceIds } = await import(
      "@/lib/provider-account-reference-store"
    );
    const result = await ensureProviderAccountReferenceIds({
      provider: "google",
      accounts: [
        {
          externalAccountId: "acc-1",
          accountName: "Primary account",
          metadata: { source: "test" },
        },
      ],
    });

    expect(result.get("acc-1")).toBe("provider-account-ref-1");
    expect(queries.join("\n")).toContain("INSERT INTO provider_accounts");
  });

  it("resolves business reference ids by text business id", async () => {
    const sql = {
      query: vi.fn(async (query: string) => {
        if (query.includes("FROM businesses")) {
          return [
            {
              business_id: "biz-1",
              business_ref_id: "biz-1",
            },
          ];
        }
        throw new Error(`Unexpected query: ${query}`);
      }),
    };
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const { resolveBusinessReferenceIds } = await import(
      "@/lib/provider-account-reference-store"
    );
    const result = await resolveBusinessReferenceIds(["biz-1"]);

    expect(result.get("biz-1")).toBe("biz-1");
  });
});
