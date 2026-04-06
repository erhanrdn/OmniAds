import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/meta", () => ({
  resolveMetaCredentials: vi.fn(),
  syncMetaAccountBreakdownWarehouseDay: vi.fn(),
  syncMetaAccountCoreWarehouseDay: vi.fn(),
}));

vi.mock("@/lib/meta/creatives-warehouse", () => ({
  syncMetaCreativesWarehouseDay: vi.fn(),
}));

vi.mock("@/lib/meta/core-config", () => ({
  META_PRODUCT_CORE_PARTITION_SCOPE: "account_daily",
  META_CORE_PARTITION_SCOPES: ["account_daily", "campaign_daily", "adset_daily", "ad_daily"],
  META_EXTENDED_SCOPES: ["breakdown_age"],
  META_PRODUCT_CORE_COVERAGE_SCOPES: ["account_daily", "campaign_daily", "adset_daily", "ad_daily"],
  META_RUNTIME_STATE_SCOPES: ["account_daily", "campaign_daily", "adset_daily", "creative_daily", "ad_daily"],
  isMetaProductCoreCoverageScope: vi.fn(() => true),
}));

vi.mock("@/lib/meta/history", () => ({
  META_WAREHOUSE_HISTORY_DAYS: 365,
  dayCountInclusive: vi.fn(() => 365),
  getCreativeMediaRetentionStart: vi.fn(() => "2026-01-01"),
}));

vi.mock("@/lib/sync/provider-status-truth", () => ({
  buildProviderProgressEvidence: vi.fn(),
  deriveProviderStallFingerprints: vi.fn(() => []),
  hasRecentProviderAdvancement: vi.fn(() => false),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  backfillMetaRunningRunsForTerminalPartition: vi.fn(),
  cancelObsoleteMetaCoreScopePartitions: vi.fn().mockResolvedValue([]),
  cleanupMetaPartitionOrchestration: vi.fn(),
  completeMetaPartitionAttempt: vi.fn(),
  createMetaSyncJob: vi.fn(),
  createMetaSyncRun: vi.fn(),
  expireStaleMetaSyncJobs: vi.fn(),
  getMetaPartitionCompletionDenialSnapshot: vi.fn(),
  getLatestRunningMetaSyncRunIdForPartition: vi.fn(),
  getLatestMetaCheckpointForPartition: vi.fn(),
  heartbeatMetaPartitionLease: vi.fn(),
  getLatestMetaSyncHealth: vi.fn(),
  getMetaAdDailyCoverage: vi.fn().mockResolvedValue({ completed_days: 0, ready_through_date: null, latest_updated_at: null }),
  getMetaAdSetDailyCoverage: vi.fn().mockResolvedValue({ completed_days: 0, ready_through_date: null, latest_updated_at: null }),
  getMetaAccountDailyCoverage: vi.fn().mockResolvedValue({ completed_days: 0, ready_through_date: null, latest_updated_at: null }),
  getMetaCampaignDailyCoverage: vi.fn().mockResolvedValue({ completed_days: 0, ready_through_date: null, latest_updated_at: null }),
  getMetaCreativeDailyCoverage: vi.fn().mockResolvedValue({ completed_days: 0, ready_through_date: null, latest_updated_at: null }),
  getMetaDirtyRecentDates: vi.fn().mockResolvedValue([]),
  getMetaIncompleteCoreDates: vi.fn().mockResolvedValue([]),
  getMetaPartitionStatesForDate: vi.fn().mockResolvedValue(new Map()),
  getMetaQueueComposition: vi.fn(),
  getMetaPartitionHealth: vi.fn().mockResolvedValue({ latestActivityAt: null, deadLetterPartitions: 0 }),
  getMetaQueueHealth: vi.fn().mockResolvedValue({
    queueDepth: 0,
    leasedPartitions: 0,
    historicalCoreQueueDepth: 0,
    historicalCoreLeasedPartitions: 0,
    maintenanceQueueDepth: 0,
    maintenanceLeasedPartitions: 0,
  }),
  getMetaRawSnapshotCoverageByEndpoint: vi.fn(),
  getMetaSyncCheckpoint: vi.fn(),
  getMetaSyncState: vi.fn(),
  leaseMetaSyncPartitions: vi.fn(),
  markMetaPartitionRunning: vi.fn(),
  queueMetaSyncPartition: vi.fn(async (input) => ({ id: `${input.providerAccountId}:${input.partitionDate}:${input.scope}`, status: "queued", ...input })),
  replayMetaDeadLetterPartitions: vi.fn(),
  requeueMetaRetryableFailedPartitions: vi.fn(),
  updateMetaSyncJob: vi.fn(),
  updateMetaSyncRun: vi.fn(),
  upsertMetaSyncState: vi.fn(),
  upsertMetaSyncCheckpoint: vi.fn(),
}));

const apiMeta = await import("@/lib/api/meta");
const warehouse = await import("@/lib/meta/warehouse");
const { enqueueMetaScheduledWork } = await import("@/lib/sync/meta-sync");

describe("enqueueMetaScheduledWork", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiMeta.resolveMetaCredentials).mockResolvedValue({
      businessId: "biz-1",
      accessToken: "token",
      accountIds: ["act_1"],
      currency: "USD",
      accountProfiles: {
        act_1: { currency: "USD", timezone: "America/Anchorage", name: "Account 1" },
      },
    });
    vi.mocked(warehouse.cancelObsoleteMetaCoreScopePartitions).mockResolvedValue([]);
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 0,
      leasedPartitions: 0,
      historicalCoreQueueDepth: 0,
      historicalCoreLeasedPartitions: 0,
      maintenanceQueueDepth: 0,
      maintenanceLeasedPartitions: 0,
    } as never);
    vi.mocked(warehouse.getMetaIncompleteCoreDates).mockResolvedValue([]);
    vi.mocked(warehouse.getMetaPartitionStatesForDate).mockResolvedValue(new Map());
    vi.mocked(warehouse.queueMetaSyncPartition).mockImplementation(async (input: never) => ({
      id: `${input.providerAccountId}:${input.partitionDate}:${input.scope}`,
      status: "queued",
      ...input,
    }));
  });

  it("returns a structured result for scheduled Meta work", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T09:00:00.000Z"));

    const result = await enqueueMetaScheduledWork("biz-1");

    expect(result.businessId).toBe("biz-1");
    expect(result.queueDepth).toBe(0);
    expect(result.leasedPartitions).toBe(0);
    expect(result.cancelledObsoletePartitions).toBe(0);
    expect(typeof result.queuedCore).toBe("number");
    expect(typeof result.queuedMaintenance).toBe("number");

    vi.useRealTimers();
  });
});
