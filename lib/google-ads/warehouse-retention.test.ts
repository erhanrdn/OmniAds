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

const retention = await import("@/lib/google-ads/warehouse-retention");

describe("Google Ads warehouse retention policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.DATABASE_URL;
    delete process.env.GOOGLE_ADS_RETENTION_EXECUTION_ENABLED;
    delete process.env.GOOGLE_ADS_RETENTION_BATCH_SIZE;
    delete process.env.GOOGLE_ADS_RETENTION_LEASE_MINUTES;
    delete process.env.GOOGLE_ADS_RETENTION_QUERY_TIMEOUT_MS;
    vi.mocked(assertDbSchemaReady).mockResolvedValue({
      ready: true,
      missingTables: [],
      checkedAt: "2026-04-10T00:00:00.000Z",
    });
    vi.mocked(getDbSchemaReadiness).mockResolvedValue({
      ready: false,
      missingTables: [],
      checkedAt: "2026-04-10T00:00:00.000Z",
    });
    vi.mocked(acquireSyncRunnerLease).mockResolvedValue(true);
    vi.mocked(releaseSyncRunnerLease).mockResolvedValue(undefined);
  });

  it("uses the approved retention tiers", () => {
    expect(retention.GOOGLE_ADS_RETENTION_POLICY.core_daily.retentionDays).toBeGreaterThan(700);
    expect(retention.GOOGLE_ADS_RETENTION_POLICY.breakdown_daily.retentionDays).toBeGreaterThan(390);
    expect(retention.GOOGLE_ADS_RETENTION_POLICY.creative_daily.retentionDays).toBe(180);
    expect(retention.GOOGLE_ADS_RETENTION_POLICY.raw_search_terms_hot.retentionDays).toBe(120);
    expect(retention.GOOGLE_ADS_RETENTION_POLICY.top_queries_weekly.retentionDays).toBe(365);
  });

  it("keeps retention execution disabled by default and produces a dry run", async () => {
    expect(retention.isGoogleAdsRetentionExecutionEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      retention.getGoogleAdsRetentionRuntimeStatus({} as NodeJS.ProcessEnv)
    ).toMatchObject({
      runtimeAvailable: false,
      executionEnabled: false,
      mode: "dry_run",
    });

    const result = await retention.executeGoogleAdsRetentionPolicyDryRunOnly({
      asOfDate: "2026-04-08",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(result.executionEnabled).toBe(false);
    expect(result.dryRun).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tier: "raw_search_terms_hot",
          tableName: "google_ads_search_query_hot_daily",
          executionEnabled: false,
        }),
      ])
    );
  });

  it("builds cutoff dates for every retention table", () => {
    const rows = retention.buildGoogleAdsRetentionDryRun("2026-04-08");

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "google_ads_top_query_weekly",
          cutoffDate: "2025-04-08",
        }),
        expect.objectContaining({
          tableName: "google_ads_decision_action_outcome_logs",
          executionEnabled: false,
        }),
      ])
    );
  });

  it("skips runtime execution when another retention lease is active", async () => {
    process.env.DATABASE_URL = "postgres://example";
    vi.mocked(acquireSyncRunnerLease).mockResolvedValue(false);
    getDbWithTimeout.mockReturnValue({ query: vi.fn() } as never);

    const result = await retention.executeGoogleAdsRetentionPolicy({
      asOfDate: "2026-04-10",
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
    process.env.GOOGLE_ADS_RETENTION_EXECUTION_ENABLED = "true";
    process.env.GOOGLE_ADS_RETENTION_BATCH_SIZE = "2";
    vi.mocked(getDbSchemaReadiness).mockResolvedValue({
      ready: true,
      missingTables: [],
      checkedAt: "2026-04-10T00:00:00.000Z",
    });

    const sqlQuery = vi
      .fn()
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValue(Array.from({ length: 20 }, () => [{ count: 0 }])[0]);
    getDbWithTimeout.mockReturnValue({ query: sqlQuery } as never);
    getDb.mockReturnValue(
      Object.assign(
        vi.fn(async () => [{ id: "run_1" }]),
        { query: vi.fn(async () => []) }
      ) as never
    );

    const result = await retention.executeGoogleAdsRetentionPolicy({
      asOfDate: "2026-04-10",
    });

    expect(result).toMatchObject({
      runId: "run_1",
      mode: "execute",
      executionEnabled: true,
      skippedDueToActiveLease: false,
      totalDeletedRows: 3,
    });
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "google_ads_account_daily",
          deletedRows: 3,
          mode: "execute",
        }),
      ])
    );
    expect(sqlQuery).toHaveBeenCalled();
    expect(releaseSyncRunnerLease).toHaveBeenCalledTimes(1);
  });
});
