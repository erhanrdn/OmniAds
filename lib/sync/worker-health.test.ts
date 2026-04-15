import { describe, expect, it } from "vitest";
import {
  getProviderScopeWorkerObservation,
  selectProviderWorkerForBusiness,
} from "@/lib/sync/worker-health";

describe("selectProviderWorkerForBusiness", () => {
  it("prefers the active lease owner when available", () => {
    const worker = selectProviderWorkerForBusiness({
      businessId: "grandmix",
      activeLeaseOwner: "worker-2",
      workers: [
        {
          workerId: "worker-1",
          lastBusinessId: "other-biz",
          lastConsumedBusinessId: "other-biz",
          metaJson: { currentBusinessId: "other-biz" },
        },
        {
          workerId: "worker-2",
          lastBusinessId: "grandmix",
          lastConsumedBusinessId: "grandmix",
          metaJson: { currentBusinessId: "grandmix" },
        },
      ],
    });

    expect(worker?.workerId).toBe("worker-2");
  });

  it("matches provider-scoped heartbeat rows to the base lease owner", () => {
    const worker = selectProviderWorkerForBusiness({
      businessId: "grandmix",
      activeLeaseOwner: "worker-2",
      workers: [
        {
          workerId: "worker-1:meta",
          lastBusinessId: "other-biz",
          lastConsumedBusinessId: "other-biz",
          metaJson: { currentBusinessId: "other-biz" },
        },
        {
          workerId: "worker-2:meta",
          lastBusinessId: "grandmix",
          lastConsumedBusinessId: "grandmix",
          metaJson: { currentBusinessId: "grandmix" },
        },
      ],
    });

    expect(worker?.workerId).toBe("worker-2:meta");
  });

  it("falls back to current or batched business matches before the newest unrelated worker", () => {
    const worker = selectProviderWorkerForBusiness({
      businessId: "grandmix",
      workers: [
        {
          workerId: "worker-1",
          lastBusinessId: "other-biz",
          lastConsumedBusinessId: "other-biz",
          metaJson: { currentBusinessId: "other-biz" },
        },
        {
          workerId: "worker-2",
          lastBusinessId: "another-biz",
          lastConsumedBusinessId: "another-biz",
          metaJson: { batchBusinessIds: ["foo", "grandmix", "bar"] },
        },
      ],
    });

    expect(worker?.workerId).toBe("worker-2");
  });

  it("does not fall back to the newest unrelated worker when no business match exists", () => {
    const worker = selectProviderWorkerForBusiness({
      businessId: "grandmix",
      workers: [
        {
          workerId: "worker-1",
          lastBusinessId: "other-biz",
          lastConsumedBusinessId: "other-biz",
          metaJson: { currentBusinessId: "other-biz" },
        },
        {
          workerId: "worker-2",
          lastBusinessId: "another-biz",
          lastConsumedBusinessId: "another-biz",
          metaJson: { batchBusinessIds: ["foo", "bar"] },
        },
      ],
    });

    expect(worker).toBeNull();
  });
});

describe("getProviderScopeWorkerObservation", () => {
  it("returns the freshest worker heartbeat for the provider scope", () => {
    const observation = getProviderScopeWorkerObservation({
      providerScope: "meta",
      staleThresholdMs: 3 * 60_000,
      nowMs: new Date("2026-04-15T10:00:00.000Z").getTime(),
      workers: [
        {
          workerId: "worker-1:meta",
          providerScope: "meta",
          workerFreshnessState: "stale",
          lastHeartbeatAt: "2026-04-15T09:40:00.000Z",
          metaJson: {},
        },
        {
          workerId: "worker-2:meta",
          providerScope: "meta",
          workerFreshnessState: "online",
          lastHeartbeatAt: "2026-04-15T09:59:30.000Z",
          metaJson: {},
        },
        {
          workerId: "worker-3:google_ads",
          providerScope: "google_ads",
          workerFreshnessState: "online",
          lastHeartbeatAt: "2026-04-15T09:59:45.000Z",
          metaJson: {},
        },
      ],
    });

    expect(observation).toMatchObject({
      workerId: "worker-2:meta",
      hasFreshHeartbeat: true,
      lastHeartbeatAt: "2026-04-15T09:59:30.000Z",
      workerFreshnessState: "online",
    });
  });
});
