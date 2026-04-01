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
const { cleanupMetaPartitionOrchestration, replayMetaDeadLetterPartitions, upsertMetaSyncCheckpoint } = await import(
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
            has_active_runner_lease: true,
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
    expect(result.reclaimReasons.stalledReclaimable).toEqual([]);
  });

  it("reclaims expired partitions when progress is stale and no runner lease remains", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
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
            has_active_runner_lease: false,
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
    expect(result.aliveSlowCount).toBe(0);
    expect(result.reclaimReasons.stalledReclaimable).toEqual(["lease_expired_no_progress"]);
  });
});
