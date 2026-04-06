import { beforeEach, describe, expect, it, vi } from "vitest";

const queueGoogleAdsSyncPartition = vi.fn();
const leaseGoogleAdsSyncPartitions = vi.fn();
const getGoogleAdsSyncCheckpoint = vi.fn();
const upsertGoogleAdsSyncCheckpoint = vi.fn();
const getGoogleAdsCheckpointHealth = vi.fn();
const getAssignedGoogleAccounts = vi.fn();
const processGoogleAdsLifecyclePartition = vi.fn();
const buildGoogleAdsWorkerLeasePlan = vi.fn();

const resolveMetaCredentials = vi.fn();
const getMetaCheckpointHealth = vi.fn();
const getMetaSyncCheckpoint = vi.fn();
const upsertMetaSyncCheckpoint = vi.fn();
const processMetaLifecyclePartition = vi.fn();
const leaseMetaSyncPartitions = vi.fn();
const queueMetaSyncPartition = vi.fn();
const buildMetaWorkerLeasePlan = vi.fn();
const runMetaRepairCycle = vi.fn();
const runGoogleAdsRepairCycle = vi.fn();

vi.mock("@/lib/google-ads-gaql", () => ({
  getAssignedGoogleAccounts,
}));

vi.mock("@/lib/google-ads/warehouse", () => ({
  getGoogleAdsCheckpointHealth,
  getGoogleAdsSyncCheckpoint,
  leaseGoogleAdsSyncPartitions,
  queueGoogleAdsSyncPartition,
  upsertGoogleAdsSyncCheckpoint,
}));

vi.mock("@/lib/api/meta", () => ({
  resolveMetaCredentials,
}));

vi.mock("@/lib/meta/warehouse", () => ({
  getMetaCheckpointHealth,
  getMetaSyncCheckpoint,
  leaseMetaSyncPartitions,
  queueMetaSyncPartition,
  upsertMetaSyncCheckpoint,
}));

vi.mock("@/lib/sync/google-ads-sync", () => ({
  syncGoogleAdsReports: vi.fn(),
  processGoogleAdsLifecyclePartition,
  buildGoogleAdsWorkerLeasePlan,
}));

vi.mock("@/lib/sync/meta-sync", () => ({
  consumeMetaQueuedWork: vi.fn(),
  processMetaLifecyclePartition,
  buildMetaWorkerLeasePlan,
}));

vi.mock("@/lib/sync/provider-repair-engine", () => ({
  runMetaRepairCycle,
  runGoogleAdsRepairCycle,
}));

vi.mock("@/lib/sync/shopify-sync", () => ({
  syncShopifyCommerceReports: vi.fn(),
}));

describe("provider-worker-adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues Google core partitions through the shared adapter plan contract", async () => {
    getAssignedGoogleAccounts.mockResolvedValue(["acct-1"]);
    queueGoogleAdsSyncPartition.mockResolvedValue({ id: "queued-1", status: "queued" });

    const { googleAdsWorkerAdapter } = await import("@/lib/sync/provider-worker-adapters");
    const result = await googleAdsWorkerAdapter.planPartitions({
      businessId: "biz-1",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
    });

    expect(queueGoogleAdsSyncPartition).toHaveBeenCalledTimes(4);
    expect(result.partitions).toHaveLength(4);
    expect(result.partitions[0]).toMatchObject({
      businessId: "biz-1",
      providerAccountId: "acct-1",
      scope: "account_daily",
      partitionDate: "2026-03-01",
    });
  });

  it("leases Google partitions through the shared adapter lifecycle contract", async () => {
    leaseGoogleAdsSyncPartitions.mockResolvedValue([
      {
        id: "part-1",
        businessId: "biz-1",
        providerAccountId: "acct-1",
        lane: "core",
        scope: "campaign_daily",
        partitionDate: "2026-03-01",
        status: "leased",
        priority: 200,
        source: "selected_range",
        leaseOwner: "worker-1",
        leaseExpiresAt: "2026-03-01T00:05:00.000Z",
        attemptCount: 1,
        nextRetryAt: null,
        lastError: null,
      },
    ]);

    const { googleAdsWorkerAdapter } = await import("@/lib/sync/provider-worker-adapters");
    const leased = await googleAdsWorkerAdapter.leasePartitions({
      businessId: "biz-1",
      workerId: "worker-1",
      limit: 1,
    });

    expect(leased[0]).toMatchObject({
      partitionId: "part-1",
      businessId: "biz-1",
      providerAccountId: "acct-1",
      scope: "campaign_daily",
    });
  });

  it("applies Google lease-plan steps on the dominant lifecycle path", async () => {
    leaseGoogleAdsSyncPartitions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "part-2",
          businessId: "biz-1",
          providerAccountId: "acct-1",
          lane: "extended",
          scope: "campaign_daily",
          partitionDate: "2026-03-01",
          status: "leased",
          priority: 190,
          source: "historical",
          leaseOwner: "worker-1",
          leaseExpiresAt: "2026-03-01T00:05:00.000Z",
          attemptCount: 1,
          nextRetryAt: null,
          lastError: null,
        },
      ]);

    const { googleAdsWorkerAdapter } = await import("@/lib/sync/provider-worker-adapters");
    const leased = await googleAdsWorkerAdapter.leasePartitions({
      businessId: "biz-1",
      workerId: "worker-1",
      limit: 1,
      plan: {
        kind: "google_ads_policy_lease_plan",
        requestedLimit: 1,
        steps: [
          { key: "core", lane: "core", limit: 1 },
          {
            key: "historical_fairness",
            lane: "extended",
            limit: 1,
            sourceFilter: "historical_only",
          },
        ],
      },
    });

    expect(leaseGoogleAdsSyncPartitions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        lane: "extended",
        sourceFilter: "historical_only",
      })
    );
    expect(leased).toHaveLength(1);
  });

  it("runs Meta auto-heal through the shared repair engine", async () => {
    runMetaRepairCycle.mockResolvedValue({
      repair: {
        reclaimed: 1,
        replayed: 2,
        requeued: 3,
        blocked: false,
        blockingReasons: [],
        repairableActions: [],
      },
    });

    const { metaWorkerAdapter } = await import("@/lib/sync/provider-worker-adapters");
    const repair = await metaWorkerAdapter.runAutoHeal?.("biz-1");

    expect(runMetaRepairCycle).toHaveBeenCalledWith("biz-1", {
      enqueueScheduledWork: false,
      metaDeadLetterSources: [
        "historical",
        "historical_recovery",
        "initial_connect",
        "request_runtime",
      ],
    });
    expect(repair).toEqual(
      expect.objectContaining({
        reclaimed: 1,
        replayed: 2,
        requeued: 3,
      })
    );
  });

  it("routes Meta writeFacts through the legacy partition processor", async () => {
    processMetaLifecyclePartition.mockResolvedValue(true);

    const { metaWorkerAdapter } = await import("@/lib/sync/provider-worker-adapters");
    await metaWorkerAdapter.writeFacts({
      partition: {
        partitionId: "part-1",
        businessId: "biz-1",
        providerAccountId: "act_1",
        scope: "account_daily",
        partitionDate: "2026-04-01",
        lane: "core",
        leaseOwner: "worker-1",
        attemptCount: 0,
        source: "historical",
      } as never,
      chunk: {},
    });

    expect(processMetaLifecyclePartition).toHaveBeenCalledWith({
      partition: expect.objectContaining({
        id: "part-1",
        businessId: "biz-1",
        scope: "account_daily",
      }),
      workerId: "worker-1",
    });
  });

  it("routes Google writeFacts through the legacy partition processor", async () => {
    processGoogleAdsLifecyclePartition.mockResolvedValue(true);

    const { googleAdsWorkerAdapter } = await import("@/lib/sync/provider-worker-adapters");
    await googleAdsWorkerAdapter.writeFacts({
      partition: {
        partitionId: "part-1",
        businessId: "biz-1",
        providerAccountId: "acct-1",
        scope: "campaign_daily",
        partitionDate: "2026-04-01",
        lane: "core",
        leaseOwner: "worker-1",
        attemptCount: 1,
        source: "selected_range",
      } as never,
      chunk: {},
    });

    expect(processGoogleAdsLifecyclePartition).toHaveBeenCalledWith({
      partition: expect.objectContaining({
        id: "part-1",
        businessId: "biz-1",
        scope: "campaign_daily",
      }),
      workerId: "worker-1",
    });
  });

  it("advances Google checkpoints through the shared adapter contract", async () => {
    getGoogleAdsSyncCheckpoint.mockResolvedValue(null);
    upsertGoogleAdsSyncCheckpoint.mockResolvedValue("checkpoint-1");

    const { googleAdsWorkerAdapter } = await import("@/lib/sync/provider-worker-adapters");
    await googleAdsWorkerAdapter.advanceCheckpoint({
      partition: {
        partitionId: "part-1",
        businessId: "biz-1",
        providerAccountId: "acct-1",
        scope: "campaign_daily",
        partitionDate: "2026-03-01",
        leaseOwner: "worker-1",
      } as never,
      chunk: {
        pageIndex: 2,
        nextCursor: "token-2",
        rowsFetched: 25,
        rowsWritten: 25,
        status: "running",
      },
    });

    expect(upsertGoogleAdsSyncCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionId: "part-1",
        businessId: "biz-1",
        providerAccountId: "acct-1",
        checkpointScope: "campaign_daily",
        pageIndex: 2,
        nextPageToken: "token-2",
        rowsFetched: 25,
        rowsWritten: 25,
        leaseOwner: "worker-1",
      })
    );
  });

  it("derives Meta readiness from shared checkpoint health", async () => {
    resolveMetaCredentials.mockResolvedValue({
      businessId: "biz-1",
      accountIds: ["act_1"],
      accessToken: "token",
      currency: "USD",
      accountProfiles: {},
    });
    getMetaCheckpointHealth.mockResolvedValue({
      latestCheckpointScope: "account_daily",
      latestCheckpointPhase: "fetch_raw",
      latestCheckpointStatus: "running",
      latestCheckpointUpdatedAt: "2026-04-02T10:00:00.000Z",
      checkpointLagMinutes: 5,
      lastSuccessfulPageIndex: 2,
      resumeCapable: true,
      checkpointFailures: 0,
    });

    const { metaWorkerAdapter } = await import("@/lib/sync/provider-worker-adapters");
    const readiness = await metaWorkerAdapter.getReadiness?.({
      businessId: "biz-1",
      providerAccountId: "act_1",
    });

    expect(readiness).toMatchObject({
      readinessLevel: "ready",
      checkpointHealth: expect.objectContaining({
        latestCheckpointScope: "account_daily",
      }),
    });
  });
});
