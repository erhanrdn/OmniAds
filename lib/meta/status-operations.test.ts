import { describe, expect, it } from "vitest";
import { deriveMetaOperationsBlockReason } from "@/lib/meta/status-operations";

describe("deriveMetaOperationsBlockReason", () => {
  it("returns worker_offline when queue exists but worker is unhealthy", () => {
    expect(
      deriveMetaOperationsBlockReason({
        workerHealthy: false,
        queueDepth: 5,
        leasedPartitions: 0,
      })
    ).toBe("worker_offline");
  });

  it("returns lease_denied when worker is healthy but lease was denied", () => {
    expect(
      deriveMetaOperationsBlockReason({
        workerHealthy: true,
        queueDepth: 5,
        leasedPartitions: 0,
        consumeStage: "lease_denied",
      })
    ).toBe("lease_denied");
  });

  it("returns queue_backlogged when queue exists without leases and activity is stale", () => {
    expect(
      deriveMetaOperationsBlockReason({
        workerHealthy: true,
        queueDepth: 12,
        leasedPartitions: 0,
        heartbeatAgeMs: 60_000,
        latestActivityAt: "2026-03-30T16:00:00.000Z",
        nowMs: new Date("2026-03-30T17:00:00.000Z").getTime(),
      })
    ).toBe("queue_backlogged");
  });

  it("returns null when queue is actively leased", () => {
    expect(
      deriveMetaOperationsBlockReason({
        workerHealthy: true,
        queueDepth: 8,
        leasedPartitions: 2,
        consumeStage: "consume_started",
      })
    ).toBeNull();
  });
});
