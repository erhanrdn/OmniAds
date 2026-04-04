import { beforeEach, describe, expect, it, vi } from "vitest";
import { dedupeGoogleAdsWarehouseRows } from "@/lib/google-ads/warehouse";
import type { GoogleAdsWarehouseDailyRow } from "@/lib/google-ads/warehouse-types";

function buildRow(
  overrides: Partial<GoogleAdsWarehouseDailyRow> = {},
): GoogleAdsWarehouseDailyRow {
  return {
    businessId: "biz_1",
    providerAccountId: "acct_1",
    date: "2026-03-30",
    accountTimezone: "UTC",
    accountCurrency: "USD",
    entityKey: "entity_1",
    entityLabel: "Entity",
    campaignId: "cmp_1",
    campaignName: "Campaign",
    adGroupId: null,
    adGroupName: null,
    status: "enabled",
    channel: "search",
    classification: "brand",
    payloadJson: { source: "first" },
    spend: 1,
    revenue: 2,
    conversions: 3,
    impressions: 4,
    clicks: 5,
    ctr: 6,
    cpc: 7,
    cpa: 8,
    roas: 9,
    conversionRate: 10,
    interactionRate: 11,
    sourceSnapshotId: "snap_1",
    ...overrides,
  };
}

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
  getDbWithTimeout: vi.fn(),
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
  backfillGoogleAdsRunningCheckpointsForTerminalPartition,
  backfillGoogleAdsRunningRunsForTerminalPartition,
  cleanupGoogleAdsPartitionOrchestration,
  completeGoogleAdsPartitionAttempt,
  heartbeatGoogleAdsPartitionLease,
  markGoogleAdsPartitionRunning,
  replayGoogleAdsDeadLetterPartitions,
  upsertGoogleAdsSyncCheckpoint,
} = await import("@/lib/google-ads/warehouse");

describe("dedupeGoogleAdsWarehouseRows", () => {
  it("keeps the last conflicting row for a warehouse conflict key", () => {
    const rows = [
      buildRow({
        entityKey: "entity_1",
        payloadJson: { source: "first" },
        spend: 1,
      }),
      buildRow({
        entityKey: "entity_2",
        payloadJson: { source: "middle" },
        spend: 2,
      }),
      buildRow({
        entityKey: "entity_1",
        payloadJson: { source: "last" },
        spend: 99,
      }),
    ];

    const result = dedupeGoogleAdsWarehouseRows(rows);

    expect(result.duplicateCount).toBe(1);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.entityKey)).toEqual([
      "entity_2",
      "entity_1",
    ]);
    expect(result.rows.find((row) => row.entityKey === "entity_1")?.spend).toBe(
      99,
    );
    expect(
      result.rows.find((row) => row.entityKey === "entity_1")?.payloadJson,
    ).toEqual({
      source: "last",
    });
  });
});

describe("google ads warehouse ownership safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(workerHealth.recordSyncReclaimEvents).mockResolvedValue(
      undefined,
    );
  });

  it("returns null when checkpoint upsert loses partition ownership", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const checkpointId = await upsertGoogleAdsSyncCheckpoint({
      partitionId: "partition-1",
      businessId: "biz-1",
      providerAccountId: "acct-1",
      checkpointScope: "campaign_daily",
      phase: "bulk_upsert",
      status: "running",
      pageIndex: 0,
      attemptCount: 1,
      leaseOwner: "worker-1",
    });

    expect(checkpointId).toBeNull();
  });

  it("extends the running lease using the requested lease minutes", async () => {
    const calls: unknown[][] = [];
    const sql = vi.fn(
      async (_strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push(values);
        return [{ id: "partition-1" }];
      },
    );
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await markGoogleAdsPartitionRunning({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseMinutes: 15,
    });

    expect(result).toBe(true);
    expect(calls.at(0)).toContain(15);
  });

  it("requires an active owned lease to write an owned checkpoint update", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [{ id: "checkpoint-1" }];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const checkpointId = await upsertGoogleAdsSyncCheckpoint({
      partitionId: "partition-1",
      businessId: "biz-1",
      providerAccountId: "acct-1",
      checkpointScope: "campaign_daily",
      phase: "bulk_upsert",
      status: "running",
      pageIndex: 0,
      attemptCount: 1,
      leaseOwner: "worker-1",
    });

    expect(checkpointId).toBe("checkpoint-1");
    expect(
      queries.some(
        (query) =>
          query.includes("WITH owner_guard AS") &&
          query.includes("lease_owner =") &&
          query.includes(
            "COALESCE(lease_expires_at, now() - interval '1 second') > now()",
          ),
      ),
    ).toBe(true);
  });

  it("keeps active leased dead-letter partitions out of replay", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await replayGoogleAdsDeadLetterPartitions({
      businessId: "biz-1",
      scope: "campaign_daily",
    });

    expect(result.outcome).toBe("no_matching_partitions");
    expect(
      queries.some((query) =>
        query.includes(
          "COALESCE(lease_expires_at, now() - interval '1 second') > now()",
        ),
      ),
    ).toBe(true);
    expect(
      queries.some((query) =>
        query.includes(
          "COALESCE(lease_expires_at, now() - interval '1 second') <= now()",
        ),
      ),
    ).toBe(true);
  });

  it("returns skipped_active_lease when only actively leased partitions match replay", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ id: "partition-1" }])
      .mockResolvedValueOnce([{ id: "partition-1" }])
      .mockResolvedValueOnce([]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await replayGoogleAdsDeadLetterPartitions({
      businessId: "biz-1",
      scope: "campaign_daily",
    });

    expect(result.outcome).toBe("skipped_active_lease");
    expect(result.matchedCount).toBe(1);
    expect(result.changedCount).toBe(0);
    expect(result.skippedActiveLeaseCount).toBe(1);
  });

  it("keeps recently progressing partitions leased during cleanup", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (
        query.includes("FROM google_ads_sync_partitions partition") &&
        query.includes("same_phase_failures")
      ) {
        return [
          {
            id: "partition-1",
            scope: "campaign_daily",
            lane: "core",
            status: "leased",
            attempt_count: 1,
            updated_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
            checkpoint_scope: "campaign_daily",
            phase: "bulk_upsert",
            page_index: 0,
            checkpoint_attempt_count: 1,
            checkpoint_status: "running",
            progress_updated_at: new Date().toISOString(),
            poisoned_at: null,
            poison_reason: null,
            same_phase_failures: 0,
            has_active_runner_lease: true,
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await cleanupGoogleAdsPartitionOrchestration({
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
      if (
        query.includes("FROM google_ads_sync_partitions partition") &&
        query.includes("same_phase_failures")
      ) {
        return [
          {
            id: "partition-1",
            scope: "campaign_daily",
            lane: "core",
            status: "leased",
            attempt_count: 1,
            updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            lease_expires_at: new Date(Date.now() - 2 * 60_000).toISOString(),
            checkpoint_scope: "campaign_daily",
            phase: "bulk_upsert",
            page_index: 0,
            checkpoint_attempt_count: 1,
            checkpoint_status: "running",
            progress_updated_at: new Date(
              Date.now() - 10 * 60_000,
            ).toISOString(),
            poisoned_at: null,
            poison_reason: null,
            same_phase_failures: 0,
            has_active_runner_lease: false,
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await cleanupGoogleAdsPartitionOrchestration({
      businessId: "biz-1",
      staleLeaseMinutes: 8,
    });

    expect(result.stalePartitionCount).toBe(1);
    expect(result.aliveSlowCount).toBe(0);
    expect(result.reclaimReasons.stalledReclaimable).toEqual([
      "worker_offline_no_progress",
    ]);
  });

  it("completes a partition attempt only when worker ownership and lease are current", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [
        {
          completed: true,
          run_updated: true,
          closed_running_run_count: 2,
          caller_run_id_was_closed: true,
          closed_running_run_ids: ["run-1", "run-2"],
          closed_checkpoint_groups: [
            {
              checkpointScope: "campaign_daily",
              previousPhase: "fetch_raw",
              count: 1,
            },
          ],
        },
      ];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const completed = await completeGoogleAdsPartitionAttempt({
      partitionId: "partition-1",
      workerId: "worker-1",
      partitionStatus: "succeeded",
      runId: "run-1",
      runStatus: "succeeded",
    });

    expect(completed).toEqual({
      ok: true,
      runUpdated: true,
      closedRunningRunCount: 2,
      callerRunIdWasClosed: true,
      closedRunningRunIds: ["run-1", "run-2"],
      closedCheckpointGroups: [
        {
          checkpointScope: "campaign_daily",
          previousPhase: "fetch_raw",
          count: 1,
        },
      ],
    });
    expect(
      queries.some(
        (query) =>
          query.includes("UPDATE google_ads_sync_partitions partition") &&
          query.includes("AND partition.lease_owner =") &&
          query.includes("COALESCE(partition.lease_expires_at, now()) > now()"),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (query) =>
          query.includes("UPDATE google_ads_sync_runs run") &&
          query.includes("run.status = 'running'"),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (query) =>
          query.includes("UPDATE google_ads_sync_checkpoints checkpoint") &&
          query.includes("checkpoint.status = 'running'"),
      ),
    ).toBe(true);
  });

  it("allows same-owner late heartbeat renewal without requiring an unexpired partition lease", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [{ id: "partition-1" }];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const renewed = await heartbeatGoogleAdsPartitionLease({
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseMinutes: 5,
    });

    expect(renewed).toBe(true);
    expect(
      queries.some(
        (query) =>
          query.includes("UPDATE google_ads_sync_partitions") &&
          query.includes("lease_expires_at = now() +") &&
          query.includes("COALESCE(lease_expires_at, now()) > now()"),
      ),
    ).toBe(false);
  });

  it("backfills running runs and checkpoints under terminal parents", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([
        {
          partition_status: "dead_letter",
          closed_running_run_count: 2,
          caller_run_id_was_closed: true,
          closed_running_run_ids: ["run-1", "run-2"],
        },
      ])
      .mockResolvedValueOnce([
        {
          closed_checkpoint_groups: [
            {
              checkpointScope: "campaign_daily",
              previousPhase: "transform",
              count: 2,
            },
          ],
        },
      ]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const runResult = await backfillGoogleAdsRunningRunsForTerminalPartition({
      partitionId: "partition-1",
      runId: "run-1",
    });
    const checkpointResult =
      await backfillGoogleAdsRunningCheckpointsForTerminalPartition({
        partitionId: "partition-1",
      });

    expect(runResult).toEqual({
      partitionStatus: "dead_letter",
      closedRunningRunCount: 2,
      callerRunIdWasClosed: true,
      closedRunningRunIds: ["run-1", "run-2"],
    });
    expect(checkpointResult).toEqual({
      closedCheckpointGroups: [
        {
          checkpointScope: "campaign_daily",
          previousPhase: "transform",
          count: 2,
        },
      ],
      closedRunningCheckpointCount: 2,
    });
  });

  it("reconciles terminal-parent children before stale reclaim cleanup", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      if (queries.length === 1) {
        return [{ id: "partition-1" }];
      }
      if (queries.length === 2) {
        return [
          {
            partition_status: "succeeded",
            closed_running_run_count: 2,
            caller_run_id_was_closed: null,
            closed_running_run_ids: ["run-1", "run-2"],
          },
        ];
      }
      if (queries.length === 3) {
        return [
          {
            closed_checkpoint_groups: [
              {
                checkpointScope: "campaign_daily",
                previousPhase: "fetch_raw",
                count: 1,
              },
            ],
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await cleanupGoogleAdsPartitionOrchestration({
      businessId: "biz-1",
      staleLeaseMinutes: 8,
    });

    expect(result.closedTerminalRunningRunCount).toBe(2);
    expect(result.closedTerminalRunningCheckpointCount).toBe(1);
    expect(queries[0]).toContain("candidate_terminal_partitions");
    expect(queries[1]).toContain("UPDATE google_ads_sync_runs run");
    expect(queries[2]).toContain(
      "UPDATE google_ads_sync_checkpoints checkpoint",
    );
    expect(
      queries.some(
        (query) =>
          query.includes("candidate_terminal_partitions") &&
          query.includes("LIMIT"),
      ),
    ).toBe(true);
    expect(
      queries.some((query) =>
        query.includes("UPDATE google_ads_sync_runs run") &&
        query.includes("run.id AS run_id_uuid"),
      ),
    ).toBe(true);
  });

  it("caps terminal-parent cleanup to a bounded partition batch", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      queries.push(query);
      if (query.includes("candidate_terminal_partitions")) {
        return [{ id: "partition-1" }, { id: "partition-2" }];
      }
      if (query.includes("UPDATE google_ads_sync_runs run")) {
        return [
          {
            partition_status: "failed",
            closed_running_run_count: 3,
            caller_run_id_was_closed: null,
            closed_running_run_ids: ["run-a", "run-b", "run-c"],
          },
        ];
      }
      if (query.includes("UPDATE google_ads_sync_checkpoints checkpoint")) {
        return [
          {
            closed_checkpoint_groups: [
              {
                checkpointScope: "campaign_daily",
                previousPhase: "transform",
                count: 2,
              },
            ],
          },
        ];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await cleanupGoogleAdsPartitionOrchestration({
      businessId: "biz-1",
      staleLeaseMinutes: 8,
    });

    expect(result.closedTerminalRunningRunCount).toBe(6);
    expect(result.closedTerminalRunningCheckpointCount).toBe(4);
    expect(queries[0]).toContain("candidate_terminal_partitions");
    expect(queries[0]).toContain("LIMIT");
    expect(
      queries.filter(
        (query) =>
          query.includes("UPDATE google_ads_sync_runs run") &&
          query.includes("run.id AS run_id_uuid"),
      ),
    ).toHaveLength(2);
    expect(
      queries.filter((query) =>
        query.includes("UPDATE google_ads_sync_checkpoints checkpoint") &&
        query.includes("candidate.previous_phase"),
      ),
    ).toHaveLength(2);
  });

  it("uses integer stale-run thresholds in cleanup SQL", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    await cleanupGoogleAdsPartitionOrchestration({
      businessId: "biz-1",
      staleRunMinutesByLane: {
        core: 11,
        maintenance: 17,
        extended: 29,
      },
    });

    const staleRunQuery = queries.find((query) =>
      query.includes("stale_threshold_minutes"),
    );
    expect(staleRunQuery).toBeTruthy();
    expect(staleRunQuery).toContain("THEN ");
    expect(staleRunQuery).toContain("::int");
    expect(staleRunQuery).not.toContain("THEN $");
  });
});
