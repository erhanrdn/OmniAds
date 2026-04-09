import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbWithTimeout = vi.fn();
const runMigrations = vi.fn();
const acquireSyncRunnerLease = vi.fn();
const releaseSyncRunnerLease = vi.fn();

vi.mock("@/lib/db", () => ({
  getDbWithTimeout,
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations,
}));

vi.mock("@/lib/sync/worker-health", () => ({
  acquireSyncRunnerLease,
  releaseSyncRunnerLease,
}));

const retention = await import("@/lib/sync/retention");

describe("pruneSyncLifecycleData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(runMigrations).mockResolvedValue(undefined);
    delete process.env.SYNC_RETENTION_QUERY_TIMEOUT_MS;
    delete process.env.SYNC_RETENTION_BATCH_SIZE;
    delete process.env.SYNC_RETENTION_LEASE_MINUTES;
  });

  it("skips pruning when another retention lease is active", async () => {
    const sql = vi.fn();
    vi.mocked(getDbWithTimeout).mockReturnValue(sql as never);
    vi.mocked(acquireSyncRunnerLease).mockResolvedValue(false);

    const result = await retention.pruneSyncLifecycleData();

    expect(result).toEqual(
      expect.objectContaining({
        googleRawSnapshotsDeleted: 0,
        googleCheckpointsDeleted: 0,
        metaRawSnapshotsDeleted: 0,
        metaCheckpointsDeleted: 0,
        reclaimEventsDeleted: 0,
        skippedDueToActiveLease: true,
      }),
    );
    expect(sql).not.toHaveBeenCalled();
    expect(releaseSyncRunnerLease).not.toHaveBeenCalled();
  });

  it("batches deletes and releases the retention lease when pruning completes", async () => {
    process.env.SYNC_RETENTION_BATCH_SIZE = "2";
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 1 }]);
    vi.mocked(getDbWithTimeout).mockReturnValue(sql as never);
    vi.mocked(acquireSyncRunnerLease).mockResolvedValue(true);
    vi.mocked(releaseSyncRunnerLease).mockResolvedValue(undefined);

    const result = await retention.pruneSyncLifecycleData();

    expect(result).toEqual(
      expect.objectContaining({
        googleRawSnapshotsDeleted: 3,
        googleCheckpointsDeleted: 1,
        metaRawSnapshotsDeleted: 0,
        metaCheckpointsDeleted: 0,
        reclaimEventsDeleted: 3,
        skippedDueToActiveLease: false,
      }),
    );
    expect(sql).toHaveBeenCalledTimes(7);
    expect(releaseSyncRunnerLease).toHaveBeenCalledTimes(1);
  });
});
