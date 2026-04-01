import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

const db = await import("@/lib/db");

describe("backfillIntegrationSecretsEncryption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues scanning after already-encrypted rows and updates later plaintext rows", async () => {
    vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_KEY", "test-master-key");
    const selects = [
      [
        { id: "2", access_token: "legacy-access", refresh_token: null },
      ],
      [],
    ];
    const updates: Array<{ id: string; accessToken: string | null; refreshToken: string | null }> =
      [];
    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ");
      if (query.includes("SELECT id, access_token, refresh_token")) {
        return selects.shift() ?? [];
      }
      if (query.includes("UPDATE integrations")) {
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
});
