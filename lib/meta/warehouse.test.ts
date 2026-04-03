import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/lib/sync/worker-health", () => ({
  recordSyncReclaimEvents: vi.fn().mockResolvedValue(undefined),
}));

const db = await import("@/lib/db");
const workerHealth = await import("@/lib/sync/worker-health");
const {
  cleanupMetaPartitionOrchestration,
  markMetaPartitionRunning,
  replayMetaDeadLetterPartitions,
  upsertMetaSyncCheckpoint,
} = await import(
  "@/lib/meta/warehouse"
);

describe("meta warehouse ownership safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(workerHealth.recordSyncReclaimEvents).mockResolvedValue(undefined);
  });

  it("returns null when checkpoint upsert loses partition ownership", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const checkpointId = await upsertMetaSyncCheckpoint({
      partitionId: "partition-1",
      businessId: "biz-1",
      providerAccountId: "acct-1",
      checkpointScope: "breakdown:age",
      phase: "fetch_raw",
      status: "running",
      pageIndex: 0,
      attemptCount: 1,
      leaseOwner: "worker-1",
    });

    expect(checkpointId).toBeNull();
  });

  it("extends the running lease using the requested lease minutes", async () => {
    const calls: unknown[][] = [];
    const sql = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push(values);
      return [{ id: "partition-1" }];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await markMetaPartitionRunning({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseMinutes: 15,
    });

    expect(result).toBe(true);
    expect(calls.at(0)).toContain(15);
  });

  it("keeps active leased dead-letter partitions out of replay", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await replayMetaDeadLetterPartitions({
      businessId: "biz-1",
      scope: "ad_daily",
    });

    expect(result.outcome).toBe("no_matching_partitions");
    expect(queries.some((query) => query.includes("COALESCE(lease_expires_at, now() - interval '1 second') > now()"))).toBe(true);
    expect(queries.some((query) => query.includes("COALESCE(lease_expires_at, now() - interval '1 second') <= now()"))).toBe(true);
  });

  it("returns skipped_active_lease when only actively leased partitions match replay", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ id: "partition-1" }])
      .mockResolvedValueOnce([{ id: "partition-1" }])
      .mockResolvedValueOnce([]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await replayMetaDeadLetterPartitions({
      businessId: "biz-1",
      scope: "ad_daily",
    });

    expect(result.outcome).toBe("skipped_active_lease");
    expect(result.matchedCount).toBe(1);
    expect(result.changedCount).toBe(0);
    expect(result.skippedActiveLeaseCount).toBe(1);
  });

  it("keeps recently progressing partitions leased during cleanup", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("FROM meta_sync_partitions partition") && query.includes("partition.status IN ('leased', 'running')")) {
        return [
          {
            id: "partition-1",
            lane: "core",
            scope: "account_daily",
            updated_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
            checkpoint_scope: "account_daily",
            phase: "fetch_raw",
            page_index: 0,
            checkpoint_updated_at: new Date().toISOString(),
            has_matching_runner_lease: true,
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await cleanupMetaPartitionOrchestration({
      businessId: "biz-1",
      staleLeaseMinutes: 8,
    });

    expect(result.stalePartitionCount).toBe(0);
    expect(result.candidateCount).toBe(1);
    expect(result.aliveSlowCount).toBe(1);
    expect(result.preservedByReason).toEqual({
      recentCheckpointProgress: 1,
      matchingRunnerLeasePresent: 0,
      leaseNotExpired: 0,
    });
    expect(result.reclaimReasons.stalledReclaimable).toEqual([]);
  });

  it("reclaims expired partitions when progress is stale and no matching runner lease remains", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      queries.push(query);
      if (query.includes("FROM meta_sync_partitions partition") && query.includes("partition.status IN ('leased', 'running')")) {
        return [
          {
            id: "partition-1",
            lane: "core",
            scope: "account_daily",
            updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            lease_expires_at: new Date(Date.now() - 2 * 60_000).toISOString(),
            checkpoint_scope: "account_daily",
            phase: "fetch_raw",
            page_index: 0,
            checkpoint_updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            has_matching_runner_lease: false,
          },
        ];
      }
      if (query.includes("UPDATE meta_sync_runs run") && query.includes("partitionReclaimed")) {
        return [{ id: "run-1" }];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await cleanupMetaPartitionOrchestration({
      businessId: "biz-1",
      staleLeaseMinutes: 8,
    });

    expect(result.stalePartitionCount).toBe(1);
    expect(result.aliveSlowCount).toBe(0);
    expect(result.reconciledRunCount).toBe(1);
    expect(result.preservedByReason).toEqual({
      recentCheckpointProgress: 0,
      matchingRunnerLeasePresent: 0,
      leaseNotExpired: 0,
    });
    expect(result.reclaimReasons.stalledReclaimable).toEqual(["lease_expired_no_progress"]);
    expect(
      queries.some((query) => query.includes("lease.lease_owner = partition.lease_owner"))
    ).toBe(true);
    expect(
      queries.some((query) => query.includes("AND run.partition_id = ANY(") && query.includes("partitionReclaimed"))
    ).toBe(true);
  });

  it("does not let an unrelated active runner lease protect a stale partition", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      queries.push(query);
      if (query.includes("FROM meta_sync_partitions partition") && query.includes("partition.status IN ('leased', 'running')")) {
        return [
          {
            id: "partition-1",
            lane: "maintenance",
            scope: "adset_daily",
            updated_at: new Date(Date.now() - 20 * 60_000).toISOString(),
            started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
            lease_owner: "meta-worker:old",
            lease_expires_at: new Date(Date.now() - 5 * 60_000).toISOString(),
            checkpoint_scope: "adset_daily",
            phase: "fetch_raw",
            page_index: 1,
            checkpoint_updated_at: new Date(Date.now() - 20 * 60_000).toISOString(),
            has_matching_runner_lease: false,
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await cleanupMetaPartitionOrchestration({
      businessId: "biz-1",
      staleLeaseMinutes: 8,
    });

    expect(result.stalePartitionCount).toBe(1);
    expect(
      queries.some((query) => query.includes("lease.lease_owner = partition.lease_owner"))
    ).toBe(true);
  });

  it("preserves partitions whose lease has not expired yet", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("FROM meta_sync_partitions partition") && query.includes("partition.status IN ('leased', 'running')")) {
        return [
          {
            id: "partition-1",
            lane: "extended",
            scope: "creative_daily",
            updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            lease_owner: "sync-worker:1",
            lease_expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
            checkpoint_scope: "creative_daily",
            phase: "fetch_raw",
            page_index: 0,
            checkpoint_updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            has_matching_runner_lease: false,
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await cleanupMetaPartitionOrchestration({
      businessId: "biz-1",
      staleLeaseMinutes: 8,
    });

    expect(result.stalePartitionCount).toBe(0);
    expect(result.aliveSlowCount).toBe(1);
    expect(result.preservedByReason).toEqual({
      recentCheckpointProgress: 0,
      matchingRunnerLeasePresent: 0,
      leaseNotExpired: 1,
    });
  });
});
