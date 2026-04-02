import { describe, expect, it } from "vitest";
import {
  buildProviderHeartbeatWorkerId,
  createRunnerLeaseGuard,
  prioritizeBusinessesForAdapter,
  runAdapterLifecycleTick,
  resolveAdapterLifecycleSnapshot,
} from "@/lib/sync/worker-runtime";

describe("prioritizeBusinessesForAdapter", () => {
  const businesses = [
    { id: "biz-1", name: "One" },
    { id: "biz-2", name: "Two" },
    { id: "biz-3", name: "Three" },
  ];

  it("prioritizes meta businesses from META_DEBUG_PRIORITY_BUSINESS_IDS", () => {
    const previous = process.env.META_DEBUG_PRIORITY_BUSINESS_IDS;
    process.env.META_DEBUG_PRIORITY_BUSINESS_IDS = "biz-3,biz-1";
    const result = prioritizeBusinessesForAdapter("meta", businesses);
    expect(result.map((row) => row.id)).toEqual(["biz-3", "biz-1", "biz-2"]);
    process.env.META_DEBUG_PRIORITY_BUSINESS_IDS = previous;
  });

  it("keeps other providers in original order without matching debug ids", () => {
    const result = prioritizeBusinessesForAdapter("other", businesses);
    expect(result.map((row) => row.id)).toEqual(["biz-1", "biz-2", "biz-3"]);
  });
});

describe("buildProviderHeartbeatWorkerId", () => {
  it("keeps the base worker id for all-scope heartbeats", () => {
    expect(buildProviderHeartbeatWorkerId("worker-1", "all")).toBe("worker-1");
  });

  it("suffixes provider-specific heartbeats", () => {
    expect(buildProviderHeartbeatWorkerId("worker-1", "meta")).toBe("worker-1:meta");
    expect(buildProviderHeartbeatWorkerId("worker-1", "google_ads")).toBe("worker-1:google_ads");
  });
});

describe("createRunnerLeaseGuard", () => {
  it("tracks the first lease-loss reason and stays sticky", () => {
    const guard = createRunnerLeaseGuard();

    expect(guard.isLeaseLost()).toBe(false);
    expect(guard.getLeaseLossReason()).toBeNull();

    guard.markLeaseLost("runner_lease_conflict");
    guard.markLeaseLost("ignored_second_reason");

    expect(guard.isLeaseLost()).toBe(true);
    expect(guard.getLeaseLossReason()).toBe("runner_lease_conflict");
  });
});

describe("resolveAdapterLifecycleSnapshot", () => {
  it("returns null when the adapter has no readiness hook", async () => {
    const snapshot = await resolveAdapterLifecycleSnapshot({
      adapter: {
        providerScope: "meta",
        planPartitions: async () => ({ partitions: [] }),
        leasePartitions: async () => [],
        getCheckpoint: async () => null,
        fetchChunk: async () => ({}),
        persistChunk: async () => {},
        transformChunk: async () => {},
        writeFacts: async () => {},
        advanceCheckpoint: async () => {},
        completePartition: async () => {},
        classifyFailure: () => "x",
        consumeBusiness: async () => null,
      },
      businessId: "biz-1",
    });

    expect(snapshot).toBeNull();
  });

  it("surfaces shared lifecycle readiness when available", async () => {
    const snapshot = await resolveAdapterLifecycleSnapshot({
      adapter: {
        providerScope: "google_ads",
        planPartitions: async () => ({ partitions: [] }),
        leasePartitions: async () => [],
        getCheckpoint: async () => null,
        fetchChunk: async () => ({}),
        persistChunk: async () => {},
        transformChunk: async () => {},
        writeFacts: async () => {},
        advanceCheckpoint: async () => {},
        completePartition: async () => {},
        classifyFailure: () => "x",
        getReadiness: async () => ({
          readinessLevel: "usable",
          checkpointHealth: {
            latestCheckpointScope: "campaign_daily",
            latestCheckpointPhase: "fetch_raw",
            latestCheckpointStatus: "running",
            latestCheckpointUpdatedAt: "2026-04-02T10:00:00.000Z",
            checkpointLagMinutes: 3,
            lastSuccessfulPageIndex: 2,
            resumeCapable: true,
            checkpointFailures: 0,
          },
          domainReadiness: null,
        }),
        consumeBusiness: async () => null,
      },
      businessId: "biz-1",
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        readinessLevel: "usable",
        checkpointHealth: expect.objectContaining({
          latestCheckpointScope: "campaign_daily",
        }),
      })
    );
  });
});

describe("runAdapterLifecycleTick", () => {
  it("drives the shared lifecycle methods when a partition is leased", async () => {
    const calls: string[] = [];
    const leasePartitions = async (input: { plan?: { kind: string } | null }) => {
      calls.push(`lease:${input.plan?.kind ?? "none"}`);
      return [
        {
          partitionId: "part-1",
          businessId: "biz-1",
          providerAccountId: "act_1",
          scope: "account_daily",
          partitionDate: "2026-04-01",
          lane: "core",
        },
      ];
    };
    const result = await runAdapterLifecycleTick({
      adapter: {
        providerScope: "meta",
        planPartitions: async () => ({ partitions: [] }),
        leasePartitions,
        getCheckpoint: async () => {
          calls.push("getCheckpoint");
          return null;
        },
        fetchChunk: async () => {
          calls.push("fetchChunk");
          return { payload: "chunk" };
        },
        persistChunk: async () => {
          calls.push("persistChunk");
        },
        transformChunk: async () => {
          calls.push("transformChunk");
        },
        advanceCheckpoint: async () => {
          calls.push("advanceCheckpoint");
        },
        writeFacts: async () => {
          calls.push("writeFacts");
        },
        completePartition: async () => {
          calls.push("completePartition");
        },
        classifyFailure: () => "x",
        consumeBusiness: async () => null,
      },
      businessId: "biz-1",
      workerId: "worker-1",
      leaseLimit: 1,
      leasePlan: {
        kind: "meta_policy_lease_plan",
        requestedLimit: 1,
        steps: [],
      },
    });

    expect(result).toMatchObject({
      attempted: 1,
      succeeded: 1,
      failed: 0,
      lastPartitionId: "part-1",
      laneLeaseCounts: { core: 1 },
    });
    expect(calls).toEqual([
      "lease:meta_policy_lease_plan",
      "getCheckpoint",
      "fetchChunk",
      "persistChunk",
      "transformChunk",
      "advanceCheckpoint",
      "writeFacts",
      "completePartition",
    ]);
  });

  it("returns without work when no partitions are leased", async () => {
    const result = await runAdapterLifecycleTick({
      adapter: {
        providerScope: "google_ads",
        planPartitions: async () => ({ partitions: [] }),
        leasePartitions: async () => [],
        getCheckpoint: async () => null,
        fetchChunk: async () => ({ payload: null }),
        persistChunk: async () => {},
        transformChunk: async () => {},
        advanceCheckpoint: async () => {},
        writeFacts: async () => {},
        completePartition: async () => {},
        classifyFailure: () => "x",
        consumeBusiness: async () => null,
      },
      businessId: "biz-1",
      workerId: "worker-1",
      leaseLimit: 1,
    });

    expect(result).toMatchObject({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      leasedPartitionIds: [],
    });
  });
});
