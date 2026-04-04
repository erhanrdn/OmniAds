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
  completeMetaPartition,
  completeMetaPartitionAttempt,
  leaseMetaSyncPartitions,
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
    vi.spyOn(console, "info").mockImplementation(() => undefined);
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
      leaseEpoch: 3,
      leaseOwner: "worker-1",
    });

    expect(checkpointId).toBeNull();
  });

  it("increments lease_epoch whenever a partition is leased", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [
        {
          id: "partition-1",
          business_id: "biz-1",
          provider_account_id: "acct-1",
          lane: "extended",
          scope: "ad_daily",
          partition_date: "2026-04-03",
          status: "leased",
          priority: 55,
          source: "recent_recovery",
          lease_epoch: 4,
          lease_owner: "worker-1",
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
          attempt_count: 1,
          next_retry_at: null,
          last_error: null,
          created_at: new Date().toISOString(),
          started_at: null,
          finished_at: null,
          updated_at: new Date().toISOString(),
        },
      ];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const rows = await leaseMetaSyncPartitions({
      businessId: "biz-1",
      workerId: "worker-1",
      limit: 1,
      leaseMinutes: 15,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.leaseEpoch).toBe(4);
    expect(queries.some((query) => query.includes("lease_epoch = partition.lease_epoch + 1"))).toBe(true);
  });

  it("extends the running lease using the requested lease minutes", async () => {
    const queries: string[] = [];
    const calls: unknown[][] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push(strings.join(" "));
      calls.push(values);
      return [{ id: "partition-1" }];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await markMetaPartitionRunning({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 7,
      leaseMinutes: 15,
    });

    expect(result).toBe(true);
    expect(queries.some((query) => query.includes("AND lease_epoch = "))).toBe(true);
    expect(calls.at(0)).toContain(7);
    expect(calls.at(0)).toContain(15);
  });

  it("fails partition completion when the lease epoch is stale", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const completed = await completeMetaPartition({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 9,
      status: "succeeded",
    });

    expect(completed).toBe(false);
    expect(queries.some((query) => query.includes("partition.lease_epoch = input_values.lease_epoch"))).toBe(
      true
    );
  });

  it("closes current-epoch running checkpoints when a partition succeeds", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [
        {
          completed: true,
          closed_checkpoint_groups: [
            {
              checkpointScope: "ad_daily",
              previousPhase: "fetch_raw",
              count: 2,
            },
          ],
        },
      ];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const completed = await completeMetaPartition({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 10,
      status: "succeeded",
    });

    expect(completed).toBe(true);
    expect(queries.some((query) => query.includes("UPDATE meta_sync_checkpoints checkpoint"))).toBe(true);
    expect(queries.some((query) => query.includes("checkpoint.status = 'running'"))).toBe(true);
    expect(queries.some((query) => query.includes("phase = 'finalize'"))).toBe(true);
    expect(console.info).toHaveBeenCalledWith(
      "[meta-sync] partition_success_closed_open_checkpoints",
      expect.objectContaining({
        partitionId: "partition-1",
        workerId: "worker-1",
        leaseEpoch: 10,
        closedCheckpointGroups: [
          {
            checkpointScope: "ad_daily",
            previousPhase: "fetch_raw",
            count: 2,
          },
        ],
      })
    );
  });

  it("completes partition and current attempt run in the same success path", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [
        {
          completed: true,
          run_updated: true,
          closed_running_run_count: 2,
          caller_run_id_was_closed: true,
          closed_running_run_ids: [
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
          ],
          closed_checkpoint_groups: [],
        },
      ];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const completed = await completeMetaPartitionAttempt({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 10,
      runId: "11111111-1111-1111-1111-111111111111",
      partitionStatus: "succeeded",
      runStatus: "succeeded",
      durationMs: 1200,
      finishedAt: "2026-04-04T00:00:00.000Z",
    });

    expect(completed).toEqual(
      expect.objectContaining({
        ok: true,
        runUpdated: true,
        closedRunningRunCount: 2,
        callerRunIdWasClosed: true,
        closedRunningRunIds: [
          "11111111-1111-1111-1111-111111111111",
          "22222222-2222-2222-2222-222222222222",
        ],
        closedCheckpointGroups: [],
        observedLatestRunningRunId: null,
        callerRunIdMatchedLatestRunningRunId: null,
      })
    );
    expect(queries.some((query) => query.includes("UPDATE meta_sync_runs run"))).toBe(true);
    expect(queries.some((query) => query.includes("run.status = 'running'"))).toBe(true);
    expect(queries.some((query) => query.includes("run.partition_id = partition.id"))).toBe(true);
    expect(queries.every((query) => !query.includes("run.id = input_values.run_id"))).toBe(true);
    expect(queries[0]).not.toContain("runLeakObservability");
    expect(queries[0]).not.toContain("latest_running_run");
  });

  it("completes failed runs when all optional observability fields are null", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [
        {
          completed: true,
          run_updated: true,
          closed_running_run_count: 1,
          caller_run_id_was_closed: true,
          closed_running_run_ids: ["22222222-2222-2222-2222-222222222222"],
          closed_checkpoint_groups: [],
        },
      ];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const completed = await completeMetaPartitionAttempt({
      partitionId: "partition-2",
      workerId: "worker-1",
      leaseEpoch: 11,
      runId: "22222222-2222-2222-2222-222222222222",
      partitionStatus: "failed",
      runStatus: "failed",
      durationMs: 1400,
      errorClass: "network_error",
      errorMessage: "request failed",
      finishedAt: "2026-04-04T00:01:00.000Z",
    });

    expect(completed).toEqual(
      expect.objectContaining({
        ok: true,
        runUpdated: true,
        closedRunningRunCount: 1,
        callerRunIdWasClosed: true,
        closedRunningRunIds: ["22222222-2222-2222-2222-222222222222"],
        observedLatestRunningRunId: null,
        callerRunIdMatchedLatestRunningRunId: null,
      })
    );
    expect(queries[0]).not.toContain("runLeakObservability");
    expect(queries[0]).not.toContain("latest_running_run");
  });

  it("does not let observability write failures block completion", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sql = vi
      .fn()
      .mockResolvedValueOnce([
        {
          completed: true,
          run_updated: true,
          closed_running_run_count: 2,
          caller_run_id_was_closed: true,
          closed_running_run_ids: [
            "33333333-3333-3333-3333-333333333333",
            "77777777-7777-7777-7777-777777777777",
          ],
          closed_checkpoint_groups: [],
        },
      ])
      .mockResolvedValueOnce([{ latest_running_run_id: "33333333-3333-3333-3333-333333333333" }])
      .mockRejectedValueOnce(new Error("observability update failed"));
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const completed = await completeMetaPartitionAttempt({
      partitionId: "partition-3",
      workerId: "worker-1",
      leaseEpoch: 12,
      runId: "33333333-3333-3333-3333-333333333333",
      partitionStatus: "succeeded",
      runStatus: "succeeded",
      durationMs: 1600,
      finishedAt: "2026-04-04T00:02:00.000Z",
      lane: "core",
      scope: "account_daily",
      observabilityPath: "primary",
    });

    expect(completed).toEqual(
      expect.objectContaining({
        ok: true,
        runUpdated: true,
        closedRunningRunCount: 2,
        callerRunIdWasClosed: true,
        closedRunningRunIds: [
          "33333333-3333-3333-3333-333333333333",
          "77777777-7777-7777-7777-777777777777",
        ],
        observedLatestRunningRunId: null,
        callerRunIdMatchedLatestRunningRunId: null,
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[meta-sync] partition_completion_observability_failed",
      expect.objectContaining({
        partitionId: "partition-3",
        runId: "33333333-3333-3333-3333-333333333333",
        workerId: "worker-1",
        leaseEpoch: 12,
        lane: "core",
        scope: "account_daily",
        partitionStatus: "succeeded",
        runStatusAfter: "succeeded",
        pathKind: "primary",
        message: "observability update failed",
      })
    );
  });

  it("casts callerRunIdMatchedLatestRunningRunId explicitly in the non-blocking observability write", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      if (queries.length === 1) {
        return [
          {
            completed: true,
            run_updated: true,
            closed_running_run_count: 1,
            caller_run_id_was_closed: true,
            closed_running_run_ids: ["44444444-4444-4444-4444-444444444444"],
            closed_checkpoint_groups: [],
          },
        ];
      }
      if (queries.length === 2) {
        return [{ latest_running_run_id: "44444444-4444-4444-4444-444444444444" }];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    await completeMetaPartitionAttempt({
      partitionId: "partition-4",
      workerId: "worker-1",
      leaseEpoch: 13,
      runId: "44444444-4444-4444-4444-444444444444",
      partitionStatus: "succeeded",
      runStatus: "succeeded",
      durationMs: 1700,
      finishedAt: "2026-04-04T00:03:00.000Z",
      lane: "core",
      scope: "account_daily",
      observabilityPath: "primary",
    });

    expect(queries[2]).toContain("'callerRunIdMatchedLatestRunningRunId', ");
    expect(queries[2]).toContain("::boolean");
  });

  it("does not run child checkpoint closure when partition completion is non-success", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [
        {
          completed: true,
          run_updated: false,
          closed_running_run_count: 0,
          caller_run_id_was_closed: null,
          closed_running_run_ids: [],
          closed_checkpoint_groups: [],
        },
      ];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const completed = await completeMetaPartition({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 10,
      status: "failed",
      lastError: "network",
    });

    expect(completed).toBe(true);
    expect(console.info).not.toHaveBeenCalledWith(
      "[meta-sync] partition_success_closed_open_checkpoints",
      expect.anything()
    );
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
      queries.some((query) =>
        query.includes("COALESCE(checkpoint.lease_epoch, 0) = COALESCE(partition.lease_epoch, 0)")
      )
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

  it("mirrors succeeded parent status when cleaning invalid running runs", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      queries.push(query);
      if (query.includes("FROM meta_sync_partitions partition") && query.includes("partition.status IN ('leased', 'running')")) {
        return [];
      }
      if (query.includes("WITH stale_candidates AS")) {
        return [{ id: "run-1" }];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    await cleanupMetaPartitionOrchestration({
      businessId: "biz-1",
      staleLeaseMinutes: 8,
    });

    expect(queries.some((query) => query.includes("partition_already_succeeded"))).toBe(true);
    expect(queries.some((query) => query.includes("partition_already_dead_letter"))).toBe(true);
    expect(queries.some((query) => query.includes("THEN 'succeeded'"))).toBe(true);
    expect(queries.some((query) => query.includes("THEN 'cancelled'"))).toBe(true);
  });
});
