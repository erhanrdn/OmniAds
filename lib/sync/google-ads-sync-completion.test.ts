import { beforeEach, describe, expect, it, vi } from "vitest";

const { backfillRunsMock, backfillCheckpointsMock } = vi.hoisted(() => ({
  backfillRunsMock: vi.fn(),
  backfillCheckpointsMock: vi.fn(),
}));

vi.mock("@/lib/google-ads/warehouse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-ads/warehouse")>();
  return {
    ...actual,
    backfillGoogleAdsRunningRunsForTerminalPartition: backfillRunsMock,
    backfillGoogleAdsRunningCheckpointsForTerminalPartition:
      backfillCheckpointsMock,
  };
});

import { maybeBackfillGoogleAdsCompletionSuccess } from "@/lib/sync/google-ads-sync";

describe("maybeBackfillGoogleAdsCompletionSuccess", () => {
  beforeEach(() => {
    backfillRunsMock.mockReset();
    backfillCheckpointsMock.mockReset();
    backfillRunsMock.mockResolvedValue({
      partitionStatus: "succeeded",
      closedRunningRunCount: 2,
      callerRunIdWasClosed: true,
      closedRunningRunIds: ["run-1", "run-2"],
    });
    backfillCheckpointsMock.mockResolvedValue({
      closedCheckpointGroups: [],
      closedRunningCheckpointCount: 0,
    });
  });

  it("triggers backfill when completion succeeds with zero closed running runs", async () => {
    await maybeBackfillGoogleAdsCompletionSuccess({
      partitionId: "partition-1",
      runId: "run-1",
      recoveredRunId: null,
      workerId: "worker-1",
      lane: "extended",
      scope: "geo_daily",
      completionResult: {
        ok: true,
        closedRunningRunCount: 0,
        callerRunIdWasClosed: true,
      },
    });

    expect(backfillRunsMock).toHaveBeenCalledTimes(1);
    expect(backfillCheckpointsMock).toHaveBeenCalledTimes(1);
  });

  it("triggers backfill when completion succeeds but caller run was not closed", async () => {
    await maybeBackfillGoogleAdsCompletionSuccess({
      partitionId: "partition-1",
      runId: "run-1",
      recoveredRunId: null,
      workerId: "worker-1",
      lane: "core",
      scope: "campaign_daily",
      completionResult: {
        ok: true,
        closedRunningRunCount: 3,
        callerRunIdWasClosed: false,
      },
    });

    expect(backfillRunsMock).toHaveBeenCalledTimes(1);
    expect(backfillCheckpointsMock).toHaveBeenCalledTimes(1);
  });

  it("does not trigger backfill when completion closed running runs and caller run was closed", async () => {
    await maybeBackfillGoogleAdsCompletionSuccess({
      partitionId: "partition-1",
      runId: "run-1",
      recoveredRunId: null,
      workerId: "worker-1",
      lane: "maintenance",
      scope: "campaign_daily",
      completionResult: {
        ok: true,
        closedRunningRunCount: 2,
        callerRunIdWasClosed: true,
      },
    });

    expect(backfillRunsMock).not.toHaveBeenCalled();
    expect(backfillCheckpointsMock).not.toHaveBeenCalled();
  });
});
