import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/meta/config-snapshots", () => ({
  appendMetaConfigSnapshots: vi.fn(),
  readLatestMetaConfigSnapshots: vi.fn(),
  readPreviousDifferentMetaConfigDiffs: vi.fn(),
}));

vi.mock("@/lib/meta/configuration", () => ({
  buildConfigSnapshotPayload: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  buildMetaSyncCheckpointHash: vi.fn(() => "checkpoint-hash"),
  getMetaSyncCheckpoint: vi.fn(),
  heartbeatMetaPartitionLease: vi.fn().mockResolvedValue(true),
  listMetaRawSnapshotsForPartition: vi.fn().mockResolvedValue([]),
  buildMetaRawSnapshotHash: vi.fn(() => "snapshot-hash"),
  createMetaSyncJob: vi.fn(),
  persistMetaRawSnapshot: vi.fn().mockResolvedValue("snapshot-id"),
  upsertMetaSyncCheckpoint: vi.fn().mockResolvedValue("checkpoint-id"),
  updateMetaSyncJob: vi.fn(),
  upsertMetaAccountDailyRows: vi.fn().mockResolvedValue(undefined),
  upsertMetaAdDailyRows: vi.fn().mockResolvedValue(undefined),
  upsertMetaAdSetDailyRows: vi.fn().mockResolvedValue(undefined),
  upsertMetaCampaignDailyRows: vi.fn().mockResolvedValue(undefined),
}));

const warehouse = await import("@/lib/meta/warehouse");
const { syncMetaAccountCoreWarehouseDay } = await import("@/lib/api/meta");

describe("syncMetaAccountCoreWarehouseDay", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(warehouse.heartbeatMetaPartitionLease).mockResolvedValue(true);
    vi.mocked(warehouse.listMetaRawSnapshotsForPartition).mockResolvedValue([]);
    vi.mocked(warehouse.persistMetaRawSnapshot).mockResolvedValue("snapshot-id");
    vi.mocked(warehouse.upsertMetaAccountDailyRows).mockResolvedValue(undefined);
    vi.mocked(warehouse.upsertMetaCampaignDailyRows).mockResolvedValue(undefined);
    vi.mocked(warehouse.upsertMetaAdSetDailyRows).mockResolvedValue(undefined);
    vi.mocked(warehouse.upsertMetaAdDailyRows).mockResolvedValue(undefined);
    vi.mocked(warehouse.buildMetaSyncCheckpointHash).mockReturnValue("checkpoint-hash");
    vi.mocked(warehouse.upsertMetaSyncCheckpoint).mockResolvedValue("checkpoint-id");
    vi.unstubAllGlobals();
  });

  it("finalizes derived account_daily, adset_daily, and ad_daily checkpoints after core writes", async () => {
    vi.mocked(warehouse.getMetaSyncCheckpoint).mockImplementation(async ({ checkpointScope }) => {
      if (checkpointScope === "core_ad_insights") {
        return null;
      }
      if (checkpointScope === "account_daily") {
        return { startedAt: "2026-04-03T20:44:30.156Z" } as never;
      }
      if (checkpointScope === "adset_daily") {
        return { startedAt: "2026-04-03T20:44:30.200Z" } as never;
      }
      if (checkpointScope === "ad_daily") {
        return { startedAt: "2026-04-03T20:44:30.240Z" } as never;
      }
      return null;
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/insights")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                campaign_id: "cmp-1",
                campaign_name: "Campaign 1",
                adset_id: "adset-1",
                adset_name: "Adset 1",
                ad_id: "ad-1",
                ad_name: "Ad 1",
                spend: "12.50",
                impressions: "100",
                clicks: "4",
                reach: "90",
                frequency: "1.11",
                ctr: "4.0",
                cpm: "125.0",
                actions: [],
                action_values: [],
                purchase_roas: [],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/campaigns")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "cmp-1", effective_status: "ACTIVE", status: "ACTIVE" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncMetaAccountCoreWarehouseDay({
      credentials: {
        businessId: "biz-1",
        accessToken: "token-1",
        accountIds: ["act_1"],
        currency: "USD",
        accountProfiles: {
          act_1: {
            currency: "USD",
            timezone: "UTC",
            name: "Account 1",
          },
        },
      },
      accountId: "act_1",
      day: "2026-04-03",
      partitionId: "partition-1",
      workerId: "worker-1",
      leaseEpoch: 11,
      attemptCount: 1,
      leaseMinutes: 15,
    });

    const checkpointCalls = vi.mocked(warehouse.upsertMetaSyncCheckpoint).mock.calls.map(([arg]) => arg);
    const accountFinalize = checkpointCalls.find(
      (call) => call.checkpointScope === "account_daily" && call.phase === "finalize"
    );
    const adsetFinalize = checkpointCalls.find(
      (call) => call.checkpointScope === "adset_daily" && call.phase === "finalize"
    );
    const adFinalize = checkpointCalls.find(
      (call) => call.checkpointScope === "ad_daily" && call.phase === "finalize"
    );
    const coreFinalize = checkpointCalls.find(
      (call) => call.checkpointScope === "core_ad_insights" && call.phase === "finalize"
    );

    expect(accountFinalize).toMatchObject({
      checkpointScope: "account_daily",
      phase: "finalize",
      status: "succeeded",
      rowsFetched: 1,
      rowsWritten: 1,
      startedAt: "2026-04-03T20:44:30.156Z",
    });
    expect(adsetFinalize).toMatchObject({
      checkpointScope: "adset_daily",
      phase: "finalize",
      status: "succeeded",
      rowsFetched: 1,
      rowsWritten: 1,
      lastSuccessfulEntityKey: "adset-1",
      startedAt: "2026-04-03T20:44:30.200Z",
    });
    expect(adFinalize).toMatchObject({
      checkpointScope: "ad_daily",
      phase: "finalize",
      status: "succeeded",
      rowsFetched: 1,
      rowsWritten: 1,
      lastSuccessfulEntityKey: "ad-1",
      startedAt: "2026-04-03T20:44:30.240Z",
    });
    expect(coreFinalize).toMatchObject({
      checkpointScope: "core_ad_insights",
      phase: "finalize",
      status: "succeeded",
      rowsFetched: 1,
      leaseEpoch: 11,
    });
    expect(checkpointCalls.every((call) => call.leaseEpoch === 11)).toBe(true);
    const heartbeatOrder = vi.mocked(warehouse.heartbeatMetaPartitionLease).mock.invocationCallOrder;
    const accountUpsertOrder = vi.mocked(warehouse.upsertMetaAccountDailyRows).mock.invocationCallOrder[0]!;
    const campaignUpsertOrder = vi.mocked(warehouse.upsertMetaCampaignDailyRows).mock.invocationCallOrder[0]!;
    const adsetUpsertOrder = vi.mocked(warehouse.upsertMetaAdSetDailyRows).mock.invocationCallOrder[0]!;
    const adUpsertOrder = vi.mocked(warehouse.upsertMetaAdDailyRows).mock.invocationCallOrder[0]!;
    const derivedFinalizeOrder = vi
      .mocked(warehouse.upsertMetaSyncCheckpoint)
      .mock.calls.map(([call], index) => ({
        call,
        order: vi.mocked(warehouse.upsertMetaSyncCheckpoint).mock.invocationCallOrder[index]!,
      }))
      .find(({ call }) => call.checkpointScope === "account_daily" && call.phase === "finalize")?.order;

    expect(heartbeatOrder.every((order) => Number.isFinite(order))).toBe(true);
    expect(heartbeatOrder.some((order) => order < accountUpsertOrder)).toBe(true);
    expect(heartbeatOrder.some((order) => order > accountUpsertOrder && order < campaignUpsertOrder)).toBe(
      true
    );
    expect(heartbeatOrder.some((order) => order > campaignUpsertOrder && order < adsetUpsertOrder)).toBe(
      true
    );
    expect(heartbeatOrder.some((order) => order > adsetUpsertOrder && order < adUpsertOrder)).toBe(true);
    expect(
      heartbeatOrder.some((order) => derivedFinalizeOrder != null && order > adUpsertOrder && order < derivedFinalizeOrder)
    ).toBe(true);
    expect(
      vi.mocked(warehouse.heartbeatMetaPartitionLease).mock.calls.every(
        ([input]) => input.leaseEpoch === 11
      )
    ).toBe(true);
  });

  it("marks derived checkpoints succeeded even when adset rows are empty", async () => {
    vi.mocked(warehouse.getMetaSyncCheckpoint).mockImplementation(async ({ checkpointScope }) => {
      if (checkpointScope === "core_ad_insights") return null;
      return null;
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/insights")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                campaign_id: "cmp-1",
                campaign_name: "Campaign 1",
                adset_id: null,
                adset_name: null,
                ad_id: "ad-1",
                ad_name: "Ad 1",
                spend: "0",
                impressions: "0",
                clicks: "0",
                reach: "0",
                frequency: "0",
                ctr: "0",
                cpm: "0",
                actions: [],
                action_values: [],
                purchase_roas: [],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/campaigns")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "cmp-1", effective_status: "ACTIVE", status: "ACTIVE" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncMetaAccountCoreWarehouseDay({
      credentials: {
        businessId: "biz-1",
        accessToken: "token-1",
        accountIds: ["act_1"],
        currency: "USD",
        accountProfiles: {
          act_1: {
            currency: "USD",
            timezone: "UTC",
            name: "Account 1",
          },
        },
      },
      accountId: "act_1",
      day: "2026-04-03",
      partitionId: "partition-2",
      workerId: "worker-1",
      leaseEpoch: 17,
      attemptCount: 1,
      leaseMinutes: 15,
    });

    const checkpointCalls = vi.mocked(warehouse.upsertMetaSyncCheckpoint).mock.calls.map(([arg]) => arg);
    const adsetFinalize = checkpointCalls.find(
      (call) => call.checkpointScope === "adset_daily" && call.phase === "finalize"
    );

    expect(adsetFinalize).toMatchObject({
      checkpointScope: "adset_daily",
      phase: "finalize",
      status: "succeeded",
      rowsFetched: 1,
      rowsWritten: 0,
      lastSuccessfulEntityKey: null,
      leaseEpoch: 17,
    });
  });
});
