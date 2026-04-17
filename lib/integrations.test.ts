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

vi.mock("@/lib/business-timezone", () => ({
  recomputeBusinessDerivedTimezone: vi.fn().mockResolvedValue(undefined),
}));

const db = await import("@/lib/db");
const businessTimezone = await import("@/lib/business-timezone");

describe("backfillIntegrationSecretsEncryption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues scanning after already-encrypted rows and updates later plaintext rows", async () => {
    vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_KEY", "test-master-key");
    const selects = [
      [
        {
          id: "2",
          business_id: "biz_1",
          provider: "google",
          access_token: "legacy-access",
          refresh_token: null,
        },
      ],
      [],
    ];
    const updates: Array<{ id: string; accessToken: string | null; refreshToken: string | null }> =
      [];
    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ");
      if (query.includes("FROM integration_credentials ic")) {
        return selects.shift() ?? [];
      }
      if (query.includes("UPDATE integration_credentials")) {
        updates.push({
          accessToken: values[0] as string | null,
          refreshToken: values[1] as string | null,
          id: values[2] as string,
        });
        return [];
      }
      throw new Error(`Unexpected query: ${query}`);
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const { backfillIntegrationSecretsEncryption } = await import("@/lib/integrations");
    const result = await backfillIntegrationSecretsEncryption({ batchSize: 1 });

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.id).toBe("2");
    expect(updates[0]?.accessToken).toMatch(/^enc:v1:/);
  });

  it("writes canonical business refs for provider connections", async () => {
    vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_KEY", "test-master-key");
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      queries.push(query);
      if (query.includes("INSERT INTO provider_accounts")) {
        return [{ id: "provider-account-ref-1" }];
      }
      if (query.includes("INSERT INTO provider_connections")) {
        return [
          {
            id: "connection-1",
            business_id: "biz_1",
            provider: "google",
            status: "connected",
            provider_account_id: "acct_1",
            provider_account_name: "Account 1",
            access_token: null,
            refresh_token: null,
            token_expires_at: null,
            scopes: null,
            error_message: null,
            metadata: {},
            connected_at: "2026-01-01T00:00:00.000Z",
            disconnected_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ];
      }
      if (query.includes("INSERT INTO integration_credentials")) {
        return [
          {
            provider_connection_id: "connection-1",
            access_token: null,
            refresh_token: null,
            token_expires_at: null,
            scopes: null,
            error_message: null,
            metadata: {},
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const { upsertIntegration } = await import("@/lib/integrations");
    await upsertIntegration({
      businessId: "biz_1",
      provider: "google",
      status: "connected",
      providerAccountId: "acct_1",
      providerAccountName: "Account 1",
    });

    expect(queries.join("\n")).toContain("INSERT INTO provider_connections");
    expect(queries.join("\n")).toContain("INSERT INTO integration_credentials");
    expect(queries.join("\n")).toContain("business_ref_id");
  });

  it("recomputes timezone for every business disconnected from canonical integrations", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("SELECT DISTINCT business_id") && query.includes("FROM provider_connections")) {
        return [
          { business_id: "biz_1" },
          { business_id: "biz_1" },
          { business_id: "biz_2" },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const { disconnectAllIntegrationsForProvider } = await import("@/lib/integrations");
    await disconnectAllIntegrationsForProvider("ga4");

    expect(vi.mocked(businessTimezone.recomputeBusinessDerivedTimezone).mock.calls).toEqual([
      ["biz_1"],
      ["biz_2"],
    ]);
  });
});
