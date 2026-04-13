import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn();
const getDbWithTimeout = vi.fn();
const assertDbSchemaReady = vi.fn();
const getDbSchemaReadiness = vi.fn();
const acquireSyncRunnerLease = vi.fn();
const releaseSyncRunnerLease = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb,
  getDbWithTimeout,
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  assertDbSchemaReady,
  getDbSchemaReadiness,
}));

vi.mock("@/lib/sync/worker-health", () => ({
  acquireSyncRunnerLease,
  releaseSyncRunnerLease,
}));

const retention = await import("@/lib/meta/warehouse-retention");

describe("Meta warehouse retention policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.DATABASE_URL;
    delete process.env.META_RETENTION_EXECUTION_ENABLED;
    delete process.env.META_RETENTION_BATCH_SIZE;
    delete process.env.META_RETENTION_LEASE_MINUTES;
    delete process.env.META_RETENTION_QUERY_TIMEOUT_MS;
    vi.mocked(assertDbSchemaReady).mockResolvedValue({
      ready: true,
      missingTables: [],
      checkedAt: "2026-04-13T00:00:00.000Z",
    });
    vi.mocked(getDbSchemaReadiness).mockResolvedValue({
      ready: false,
      missingTables: [],
      checkedAt: "2026-04-13T00:00:00.000Z",
    });
    vi.mocked(acquireSyncRunnerLease).mockResolvedValue(true);
    vi.mocked(releaseSyncRunnerLease).mockResolvedValue(undefined);
  });

  it("uses the approved authoritative retention tiers", () => {
    const policy = retention.META_RETENTION_POLICY;
    expect(
      policy.filter((entry) => entry.tier === "core_authoritative"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "meta_account_daily",
          retentionDays: 761,
        }),
        expect.objectContaining({
          tableName: "meta_authoritative_day_state",
          summaryKey: "meta_authoritative_day_state:core",
        }),
      ]),
    );
    expect(
      policy.filter((entry) => entry.tier === "breakdown_authoritative"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "meta_breakdown_daily",
          retentionDays: 394,
        }),
        expect.objectContaining({
          tableName: "meta_authoritative_publication_pointers",
          summaryKey: "meta_authoritative_publication_pointers:breakdown",
        }),
      ]),
    );
  });

  it("keeps retention execution disabled by default and produces a dry run", async () => {
    expect(retention.isMetaRetentionExecutionEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      retention.getMetaRetentionRuntimeStatus({} as NodeJS.ProcessEnv),
    ).toMatchObject({
      runtimeAvailable: false,
      executionEnabled: false,
      mode: "dry_run",
    });

    const result = await retention.executeMetaRetentionPolicyDryRunOnly({
      asOfDate: "2026-04-13",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(result.executionEnabled).toBe(false);
    expect(result.dryRun).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "meta_breakdown_daily",
          cutoffDate: "2025-03-15",
          executionEnabled: false,
        }),
        expect.objectContaining({
          summaryKey: "meta_authoritative_day_state:core",
          cutoffDate: "2024-03-13",
        }),
      ]),
    );
  });

  it("skips runtime execution when another retention lease is active", async () => {
    process.env.DATABASE_URL = "postgres://example";
    vi.mocked(acquireSyncRunnerLease).mockResolvedValue(false);
    getDbWithTimeout.mockReturnValue({ query: vi.fn() } as never);

    const result = await retention.executeMetaRetentionPolicy({
      asOfDate: "2026-04-13",
    });

    expect(result).toMatchObject({
      mode: "dry_run",
      skippedDueToActiveLease: true,
      totalDeletedRows: 0,
    });
    expect(getDbWithTimeout).toHaveBeenCalledTimes(1);
    expect(releaseSyncRunnerLease).not.toHaveBeenCalled();
  });

  it("deletes retained rows in batches when execution is enabled and records a run", async () => {
    process.env.DATABASE_URL = "postgres://example";
    process.env.META_RETENTION_EXECUTION_ENABLED = "true";
    process.env.META_RETENTION_BATCH_SIZE = "2";
    vi.mocked(getDbSchemaReadiness).mockResolvedValue({
      ready: true,
      missingTables: [],
      checkedAt: "2026-04-13T00:00:00.000Z",
    });

    const sqlQuery = vi
      .fn()
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValue([{ count: 0 }]);
    getDbWithTimeout.mockReturnValue({ query: sqlQuery } as never);
    getDb.mockReturnValue(
      Object.assign(
        vi.fn(async () => [{ id: "meta_retention_run_1" }]),
        { query: vi.fn(async () => []) },
      ) as never,
    );

    const result = await retention.executeMetaRetentionPolicy({
      asOfDate: "2026-04-13",
    });

    expect(result).toMatchObject({
      runId: "meta_retention_run_1",
      mode: "execute",
      executionEnabled: true,
      skippedDueToActiveLease: false,
      totalDeletedRows: 3,
    });
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "meta_account_daily",
          deletedRows: 3,
          mode: "execute",
        }),
      ]),
    );
    expect(sqlQuery).toHaveBeenCalled();
    expect(releaseSyncRunnerLease).toHaveBeenCalledTimes(1);
  });
});
