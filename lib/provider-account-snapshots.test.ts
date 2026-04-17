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

describe("provider account snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes normalized snapshot runs/items and reads them back", async () => {
    let stored = false;
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ");
      queries.push(query);

      if (query.includes("SELECT") && query.includes("FROM provider_account_snapshot_runs")) {
        if (!stored) return [];
        return [
          {
            id: "run_1",
            business_id: "biz_1",
            provider: "meta",
            fetched_at: "2026-01-01T00:00:00.000Z",
            refresh_failed: false,
            last_error: null,
            refresh_requested_at: null,
            last_refresh_attempt_at: null,
            next_refresh_after: null,
            refresh_in_progress: false,
            accounts_hash: "hash_1",
            source_reason: "manual_refresh",
            last_successful_refresh_at: "2026-01-01T00:00:00.000Z",
            refresh_failure_streak: 0,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ];
      }

      if (query.includes("SELECT") && query.includes("FROM provider_account_snapshot_items")) {
        if (!stored) return [];
        return [
          {
            snapshot_run_id: "run_1",
            provider_account_ref_id: "provider-account-1",
            provider_account_id: "acc_1",
            provider_account_name: "Account 1",
            currency: "USD",
            timezone: "UTC",
            is_manager: false,
            position: 0,
            raw_payload: { id: "acc_1", name: "Account 1" },
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ];
      }

      if (query.includes("INSERT INTO provider_account_snapshot_runs")) {
        stored = true;
        return [{ id: "run_1" }];
      }

      if (query.includes("INSERT INTO provider_account_snapshots")) {
        return [];
      }

      if (
        query.includes("INSERT INTO provider_accounts") ||
        query.includes("INSERT INTO provider_account_snapshot_items") ||
        query.includes("DELETE FROM provider_account_snapshot_items")
      ) {
        return [];
      }

      if (query.includes("SELECT") && query.includes("FROM provider_account_snapshots")) {
        return [];
      }

      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const { resolveProviderAccountSnapshot } = await import("@/lib/provider-account-snapshots");
    const snapshot = await resolveProviderAccountSnapshot({
      businessId: "biz_1",
      provider: "meta",
      liveLoader: async () => [{ id: "acc_1", name: "Account 1", currency: "USD", timezone: "UTC" }],
    });

    expect(snapshot.accounts).toEqual([
      { id: "acc_1", name: "Account 1", currency: "USD", timezone: "UTC", isManager: false },
    ]);
    expect(queries.join("\n")).toContain("provider_account_snapshot_runs");
    expect(queries.join("\n")).toContain("provider_account_snapshot_items");
    expect(queries.join("\n")).toContain("provider_account_snapshots");
    expect(queries.join("\n")).toContain("business_ref_id");
  });

  it("preserves last-known-good accounts during lifecycle-only refresh updates", async () => {
    const legacySnapshotWrites: Array<{
      accountsPayload: string;
      fetchedAt: string | null;
      refreshInProgress: boolean;
    }> = [];
    let currentSnapshot: {
      business_id: string;
      provider: string;
      accounts_payload: Array<{
        id: string;
        name: string;
        currency: string;
        timezone: string;
        isManager: boolean;
      }>;
      fetched_at: string;
      refresh_failed: boolean;
      last_error: string | null;
      refresh_requested_at: string | null;
      last_refresh_attempt_at: string | null;
      next_refresh_after: string | null;
      refresh_in_progress: boolean;
      accounts_hash: string | null;
      source_reason: string | null;
      last_successful_refresh_at: string | null;
      refresh_failure_streak: number;
      created_at: string;
      updated_at: string;
    } = {
      business_id: "biz_1",
      provider: "meta",
      accounts_payload: [
        {
          id: "acc_1",
          name: "Account 1",
          currency: "USD",
          timezone: "UTC",
          isManager: false,
        },
      ],
      fetched_at: "2026-01-01T00:00:00.000Z",
      refresh_failed: false,
      last_error: null,
      refresh_requested_at: null,
      last_refresh_attempt_at: null,
      next_refresh_after: null,
      refresh_in_progress: false,
      accounts_hash: "hash_1",
      source_reason: "manual_refresh",
      last_successful_refresh_at: "2026-01-01T00:00:00.000Z",
      refresh_failure_streak: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ");
      if (query.includes("FROM provider_account_snapshot_runs")) {
        return [];
      }
      if (query.includes("FROM provider_account_snapshots")) {
        return [currentSnapshot];
      }
      if (query.includes("INSERT INTO provider_account_snapshot_runs")) {
        return [];
      }
      if (query.includes("INSERT INTO provider_account_snapshots")) {
        const accountsPayload = String(values[3] ?? "[]");
        const fetchedAt = (values[4] as string | null) ?? null;
        const refreshInProgress = Boolean(values[10]);
        legacySnapshotWrites.push({
          accountsPayload,
          fetchedAt,
          refreshInProgress,
        });
        currentSnapshot = {
          ...currentSnapshot,
          accounts_payload: JSON.parse(accountsPayload),
          fetched_at: fetchedAt ?? currentSnapshot.fetched_at,
          refresh_failed: Boolean(values[5]),
          last_error: (values[6] as string | null) ?? null,
          refresh_requested_at: (values[7] as string | null) ?? null,
          last_refresh_attempt_at: (values[8] as string | null) ?? null,
          refresh_in_progress: refreshInProgress,
          accounts_hash: (values[11] as string | null) ?? null,
          source_reason: (values[12] as string | null) ?? null,
          last_successful_refresh_at: (values[13] as string | null) ?? null,
          refresh_failure_streak: Number(values[14] ?? 0),
          updated_at: "2026-01-02T00:00:00.000Z",
        };
        return [];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const { forceProviderAccountSnapshotRefresh } = await import("@/lib/provider-account-snapshots");
    await forceProviderAccountSnapshotRefresh({
      businessId: "biz_1",
      provider: "meta",
      freshnessMs: 60_000,
      liveLoader: async () => [
        { id: "acc_2", name: "Account 2", currency: "USD", timezone: "UTC" },
      ],
    });

    expect(legacySnapshotWrites).toHaveLength(2);
    expect(legacySnapshotWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountsPayload: expect.stringContaining("\"acc_1\""),
          fetchedAt: "2026-01-01T00:00:00.000Z",
          refreshInProgress: true,
        }),
      ]),
    );
  });
});
