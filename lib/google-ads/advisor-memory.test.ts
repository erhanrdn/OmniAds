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

const { logAdvisorExecutionEvent, updateAdvisorExecutionState } = await import(
  "@/lib/google-ads/advisor-memory"
);

describe("google ads advisor memory writes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DATABASE_URL = "postgres://example";
    sql.mockResolvedValue([]);
  });

  it("writes canonical refs for advisor execution logs", async () => {
    await logAdvisorExecutionEvent({
      businessId: "biz-1",
      accountId: "acct-1",
      recommendationFingerprint: "fingerprint-1",
      mutateActionType: "apply_budget",
      operation: "mutate",
      status: "success",
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("provider_account_ref_id");
  });

  it("fills canonical refs when updating advisor memory rows", async () => {
    await updateAdvisorExecutionState({
      businessId: "biz-1",
      accountId: "acct-1",
      recommendationFingerprint: "fingerprint-1",
      executionStatus: "applied",
      executionMetadata: { mutateActionType: "apply_budget" },
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id = COALESCE");
    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("provider_account_ref_id = COALESCE");
  });
});
