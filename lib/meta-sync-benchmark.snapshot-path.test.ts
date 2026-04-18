import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sqlQuery = vi.fn();

vi.mock("@/lib/db", () => ({
  getDbWithTimeout: vi.fn(() => ({
    query: sqlQuery,
  })),
}));

vi.mock("@/lib/admin-operations-health", () => ({
  getMetaReleaseGateBusinessHealthSnapshot: vi.fn(),
}));

vi.mock("@/lib/provider-platform-date", () => ({
  getProviderPlatformDateBoundaries: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  getLatestMetaSyncHealth: vi.fn(),
  getMetaAccountDailyCoverage: vi.fn(),
  getMetaAdDailyCoverage: vi.fn(),
  getMetaAdSetDailyCoverage: vi.fn(),
  getMetaAuthoritativeBusinessOpsSnapshot: vi.fn(),
  getMetaCampaignDailyCoverage: vi.fn(),
  getMetaCreativeDailyCoverage: vi.fn(),
  getMetaQueueComposition: vi.fn(),
  getMetaQueueHealth: vi.fn(),
}));

vi.mock("@/lib/sync/meta-sync", () => ({
  getMetaSelectedRangeTruthReadiness: vi.fn(),
}));

const db = await import("@/lib/db");
const adminOps = await import("@/lib/admin-operations-health");
const warehouse = await import("@/lib/meta/warehouse");
const metaSync = await import("@/lib/sync/meta-sync");
const benchmark = await import("@/lib/meta-sync-benchmark");

function makeBusinessHealth() {
  return {
    businessId: "biz-1",
    businessName: "Benchmark Biz",
    currentDayReference: "2026-04-15",
    latestCheckpointUpdatedAt: "2026-04-15T10:00:00.000Z",
    accountReadyThroughDate: "2026-04-15",
    adsetReadyThroughDate: "2026-04-15",
    creativeReadyThroughDate: "2026-04-15",
    adReadyThroughDate: "2026-04-15",
    progressState: "syncing" as const,
    activityState: "busy" as const,
    stallFingerprints: [],
    staleLeasePartitions: 0,
    repairBacklog: 0,
    validationFailures24h: 0,
    reclaimCandidateCount: 0,
    staleRunCount24h: 0,
    lastSuccessfulPublishAt: null,
    d1FinalizeNonTerminalCount: 0,
    workerOnline: true,
    workerLastHeartbeatAt: "2026-04-15T10:00:00.000Z",
    dbConstraint: "db",
    dbBacklogState: "draining",
    latestPartitionActivityAt: "2026-04-15T10:01:00.000Z",
  };
}

function makeTruthReadiness() {
  return {
    truthReady: true,
    state: "finalized_verified",
    verificationState: "finalized_verified",
    totalDays: 7,
    completedCoreDays: 7,
    blockingReasons: [],
    reasonCounts: {},
    detectorReasonCodes: [],
    sourceFetchedAt: "2026-04-15T10:00:00.000Z",
    publishedAt: "2026-04-15T10:00:00.000Z",
    asOf: "2026-04-15T10:00:00.000Z",
  };
}

function makeCoverage() {
  return {
    completed_days: 7,
    ready_through_date: "2026-04-15",
    latest_updated_at: "2026-04-15T10:00:00.000Z",
    total_rows: 70,
  };
}

function makeAuthoritative() {
  return {
    businessId: "biz-1",
    manifestCounts: {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      running: 0,
      superseded: 0,
    },
    progression: {
      queued: 0,
      leased: 0,
      retryableFailed: 0,
      deadLetter: 0,
      staleLeases: 0,
      repairBacklog: 2,
      published: 11,
    },
    latestPublishes: [],
    recentFailures: [],
    accounts: [],
    recentCoreTruthMatrix: null,
    priorityTruthMatrix: null,
    validationFailures24h: 3,
    d1FinalizeSla: {
      totalAccounts: 0,
      breachedAccounts: 4,
      accounts: [],
    },
    lastSuccessfulPublishAt: "2026-04-15T10:00:00.000Z",
  };
}

describe("collectMetaSyncReadinessSnapshot snapshot path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlQuery.mockReset();
    sqlQuery
      .mockResolvedValueOnce([
        {
          completed_last_window: 4,
          cancelled_last_window: 0,
          dead_lettered_last_window: 0,
          created_last_window: 1,
          failed_last_window: 0,
          total_succeeded: 10,
          total_cancelled: 0,
          total_dead_lettered: 0,
          total_partitions: 12,
          latest_activity_at: "2026-04-15T10:02:00.000Z",
          reclaimed_last_window: 0,
          skipped_active_lease_last_window: 0,
        },
      ])
      .mockResolvedValueOnce([
        { lane: "core", scope: "account_daily", status: "queued", count: 2 },
      ]);
    vi.mocked(adminOps.getMetaReleaseGateBusinessHealthSnapshot).mockResolvedValue(
      makeBusinessHealth(),
    );
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 2,
      leasedPartitions: 1,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
      oldestQueuedPartition: "2026-04-14",
      latestCoreActivityAt: "2026-04-15T10:00:00.000Z",
      latestExtendedActivityAt: null,
      latestMaintenanceActivityAt: null,
      coreQueueDepth: 2,
      coreLeasedPartitions: 1,
      historicalCoreQueueDepth: 0,
      historicalCoreLeasedPartitions: 0,
      extendedQueueDepth: 0,
      extendedLeasedPartitions: 0,
      extendedRecentQueueDepth: 0,
      extendedRecentLeasedPartitions: 0,
      extendedHistoricalQueueDepth: 0,
      extendedHistoricalLeasedPartitions: 0,
      maintenanceQueueDepth: 0,
      maintenanceLeasedPartitions: 0,
    });
    vi.mocked(warehouse.getMetaQueueComposition).mockResolvedValue({
      summary: {
        historicalCoreQueued: 0,
        maintenanceQueued: 0,
        extendedRecentQueued: 0,
        extendedHistoricalQueued: 0,
      },
      statusCounts: {},
      laneSourceStatusCounts: [],
    });
    vi.mocked(warehouse.getLatestMetaSyncHealth).mockResolvedValue({
      sync_type: "today_refresh",
      scope: "account_daily",
      status: "running",
      trigger_source: "background_partition",
      triggered_at: "2026-04-15T09:59:00.000Z",
      started_at: "2026-04-15T10:00:00.000Z",
      finished_at: null,
      last_error: null,
    });
    vi.mocked(warehouse.getMetaAuthoritativeBusinessOpsSnapshot).mockResolvedValue(
      makeAuthoritative() as never,
    );
    vi.mocked(metaSync.getMetaSelectedRangeTruthReadiness).mockResolvedValue(
      makeTruthReadiness() as never,
    );
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue(makeCoverage() as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue(makeCoverage() as never);
    vi.mocked(warehouse.getMetaAdSetDailyCoverage).mockResolvedValue(makeCoverage() as never);
    vi.mocked(warehouse.getMetaCreativeDailyCoverage).mockResolvedValue(makeCoverage() as never);
    vi.mocked(warehouse.getMetaAdDailyCoverage).mockResolvedValue(makeCoverage() as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the scoped business collector and propagates the 60000ms snapshot budget", async () => {
    const snapshot = await benchmark.collectMetaSyncReadinessSnapshot({
      businessId: "biz-1",
      recentDays: 7,
      priorityWindowDays: 3,
      recentWindowMinutes: 15,
    });

    expect(adminOps.getMetaReleaseGateBusinessHealthSnapshot).toHaveBeenCalledWith({
      businessId: "biz-1",
      timeoutMs: 60_000,
    });
    expect(warehouse.getMetaQueueHealth).toHaveBeenCalledWith({
      businessId: "biz-1",
      timeoutMs: 60_000,
    });
    expect(warehouse.getMetaQueueComposition).toHaveBeenCalledWith({
      businessId: "biz-1",
      timeoutMs: 60_000,
    });
    expect(warehouse.getLatestMetaSyncHealth).toHaveBeenCalledWith({
      businessId: "biz-1",
      timeoutMs: 60_000,
    });
    expect(warehouse.getMetaAuthoritativeBusinessOpsSnapshot).toHaveBeenCalledWith({
      businessId: "biz-1",
      timeoutMs: 60_000,
    });
    expect(metaSync.getMetaSelectedRangeTruthReadiness).toHaveBeenNthCalledWith(1, {
      businessId: "biz-1",
      startDate: "2026-04-08",
      endDate: "2026-04-14",
      timeoutMs: 60_000,
    });
    expect(metaSync.getMetaSelectedRangeTruthReadiness).toHaveBeenNthCalledWith(2, {
      businessId: "biz-1",
      startDate: "2026-04-12",
      endDate: "2026-04-14",
      timeoutMs: 60_000,
    });
    expect(vi.mocked(db.getDbWithTimeout)).toHaveBeenCalledWith(60_000);
    expect(snapshot.operator.dbConstraint).toBe("db");
    expect(snapshot.authoritative.repairBacklog).toBe(2);
  });

  it("surfaces the exact stage name when a nested snapshot read fails", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(metaSync.getMetaSelectedRangeTruthReadiness)
      .mockRejectedValueOnce(new Error("timed out"));

    await expect(
      benchmark.collectMetaSyncReadinessSnapshot({
        businessId: "biz-1",
        recentDays: 7,
        priorityWindowDays: 3,
        recentWindowMinutes: 15,
      }),
    ).rejects.toThrow("snapshot.recent_truth: timed out");

    expect(infoSpy).toHaveBeenCalledWith(
      "[meta-sync-benchmark] snapshot_stage",
      expect.objectContaining({
        businessId: "biz-1",
        stage: "snapshot.recent_truth",
        ok: false,
        errorMessage: "timed out",
      }),
    );
  });
});
