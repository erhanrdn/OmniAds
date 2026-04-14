import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMetaRetentionPolicy = vi.fn();
const getMetaRetentionCanaryRuntimeStatus = vi.fn();
const getMetaRetentionRuntimeStatus = vi.fn();

vi.mock("@/lib/meta/warehouse-retention", () => ({
  executeMetaRetentionPolicy,
  getMetaRetentionCanaryRuntimeStatus,
  getMetaRetentionDeleteScope: vi.fn((row: { summaryKey: string }) =>
    row.summaryKey.startsWith("meta_authoritative_slice_versions")
      ? "orphaned_stale_artifact"
      : "horizon_outside_residue",
  ),
  getMetaRetentionRuntimeStatus,
  summarizeMetaRetentionRunRows: vi.fn((rows: Array<{ protectedRows?: number | null; retainedRows?: number | null; eligibleRows?: number | null }>) => ({
    observedTables: rows.length,
    tablesWithDeletableRows: rows.filter((row) => (row.eligibleRows ?? 0) > 0).length,
    tablesWithProtectedRows: rows.filter((row) => (row.protectedRows ?? 0) > 0).length,
    deletableRows: rows.reduce((sum, row) => sum + Math.max(0, row.eligibleRows ?? 0), 0),
    retainedRows: rows.reduce((sum, row) => sum + Math.max(0, row.retainedRows ?? 0), 0),
    protectedRows: rows.reduce((sum, row) => sum + Math.max(0, row.protectedRows ?? 0), 0),
  })),
}));

const retentionCanary = await import("@/lib/meta/retention-canary");

describe("runMetaRetentionCanary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getMetaRetentionRuntimeStatus.mockReturnValue({
      runtimeAvailable: true,
      executionEnabled: false,
      mode: "dry_run",
      gateReason:
        "Meta retention execution is disabled by default. Dry-run remains available.",
    });
  });

  it("stays gated by default even when execute is requested", async () => {
    getMetaRetentionCanaryRuntimeStatus.mockReturnValue({
      runtimeAvailable: true,
      globalExecutionEnabled: false,
      businessId: "biz",
      executeRequested: true,
      executeAllowed: false,
      mode: "dry_run",
      gateReason:
        "META_RETENTION_EXECUTION_ENABLED is disabled. Set it to true to allow globally enabled execute mode.",
    });
    executeMetaRetentionPolicy.mockResolvedValue({
      mode: "dry_run",
      executionDisposition: "gated_scoped_execute",
      skippedDueToActiveLease: false,
      totalDeletedRows: 0,
      errorMessage: null,
      rows: [
        {
          tier: "core_authoritative",
          tableName: "meta_account_daily",
          summaryKey: "meta_account_daily",
          retentionDays: 761,
          cutoffDate: "2024-03-13",
          protectedRows: 8,
          protectedDistinctDays: 2,
          latestProtectedValue: "2026-04-12",
          eligibleRows: 4,
          eligibleDistinctDays: 1,
          oldestEligibleValue: "2024-03-01",
          newestEligibleValue: "2024-03-12",
          retainedRows: 20,
          latestRetainedValue: "2026-04-12",
          deletedRows: 0,
        },
      ],
    });

    const result = await retentionCanary.runMetaRetentionCanary({
      businessId: "biz",
      asOfDate: "2026-04-13",
      execute: true,
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain(
      "META_RETENTION_EXECUTION_ENABLED is disabled. Set it to true to allow globally enabled execute mode.",
    );
    expect(result.globalRetentionRuntime.defaultExecutionDisabled).toBe(true);
    expect(result.run).toMatchObject({
      mode: "dry_run",
      executionDisposition: "gated_scoped_execute",
      totalDeletedRows: 0,
    });
    expect(result.protectionProof).toMatchObject({
      protectedRows: 8,
      deletableRows: 4,
      tablesWithDeletedRows: 0,
    });
    expect(result.tables[0]).toMatchObject({
      tableName: "meta_account_daily",
      deleteScope: "horizon_outside_residue",
      deletedRows: 0,
      protectedRows: 8,
    });
  });

  it("reports protected truth and deleted orphaned residue for a scoped execute run", async () => {
    getMetaRetentionCanaryRuntimeStatus.mockReturnValue({
      runtimeAvailable: true,
      globalExecutionEnabled: true,
      businessId: "biz",
      executeRequested: true,
      executeAllowed: true,
      mode: "execute",
      gateReason:
        "Meta retention execute mode is globally enabled. The scoped command will execute only the requested business slice.",
    });
    executeMetaRetentionPolicy.mockResolvedValue({
      mode: "execute",
      executionDisposition: "scoped_execute",
      skippedDueToActiveLease: false,
      totalDeletedRows: 5,
      errorMessage: null,
      rows: [
        {
          tier: "core_authoritative",
          tableName: "meta_account_daily",
          summaryKey: "meta_account_daily",
          retentionDays: 761,
          cutoffDate: "2024-03-13",
          protectedRows: 6,
          protectedDistinctDays: 2,
          latestProtectedValue: "2026-04-12",
          eligibleRows: 3,
          eligibleDistinctDays: 1,
          oldestEligibleValue: "2024-03-01",
          newestEligibleValue: "2024-03-12",
          retainedRows: 24,
          latestRetainedValue: "2026-04-12",
          deletedRows: 3,
        },
        {
          tier: "core_authoritative",
          tableName: "meta_authoritative_slice_versions",
          summaryKey: "meta_authoritative_slice_versions:core",
          retentionDays: 761,
          cutoffDate: "2024-03-13",
          protectedRows: 2,
          protectedDistinctDays: 1,
          latestProtectedValue: "2026-04-12",
          eligibleRows: 2,
          eligibleDistinctDays: 1,
          oldestEligibleValue: "2023-12-01",
          newestEligibleValue: "2024-01-15",
          retainedRows: 6,
          latestRetainedValue: "2026-04-12",
          deletedRows: 2,
        },
      ],
    });

    const result = await retentionCanary.runMetaRetentionCanary({
      businessId: "biz",
      asOfDate: "2026-04-13",
      execute: true,
    });

    expect(result.passed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.run).toMatchObject({
      mode: "execute",
      executionDisposition: "scoped_execute",
      totalDeletedRows: 5,
    });
    expect(result.protectionProof).toMatchObject({
      protectedRows: 8,
      deletableRows: 5,
      tablesWithDeletedRows: 2,
    });
    expect(result.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "meta_account_daily",
          deleteScope: "horizon_outside_residue",
          deletedRows: 3,
        }),
        expect.objectContaining({
          tableName: "meta_authoritative_slice_versions",
          deleteScope: "orphaned_stale_artifact",
          deletedRows: 2,
        }),
      ]),
    );
  });
});
