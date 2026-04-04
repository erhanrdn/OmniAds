import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

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

import {
  logGoogleAdsCompletionOutcome,
  maybeBackfillGoogleAdsCompletionSuccess,
} from "@/lib/sync/google-ads-sync";

describe("maybeBackfillGoogleAdsCompletionSuccess", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    backfillRunsMock.mockReset();
    backfillCheckpointsMock.mockReset();
    warnSpy.mockClear();
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

  afterEach(() => {
    warnSpy.mockClear();
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

  it("logs weak close warnings for success outcomes that will trigger backfill", () => {
    logGoogleAdsCompletionOutcome({
      partitionId: "partition-1",
      runId: "run-1",
      recoveredRunId: null,
      workerId: "worker-1",
      lane: "extended",
      scope: "geo_daily",
      partitionStatus: "succeeded",
      outcome: {
        ok: true,
        closedRunningRunCount: 0,
        callerRunIdWasClosed: false,
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "[google-ads-sync] google_ads_completion_outcome",
      expect.objectContaining({
        partitionId: "partition-1",
        ok: true,
        closedRunningRunCount: 0,
        callerRunIdWasClosed: false,
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[google-ads-sync] google_ads_completion_weak_close_detected",
      expect.objectContaining({
        partitionId: "partition-1",
        successBackfillWillTrigger: true,
      }),
    );
  });

  it("logs failure outcomes with denial classification and backfill intent", () => {
    logGoogleAdsCompletionOutcome({
      partitionId: "partition-2",
      runId: "run-2",
      recoveredRunId: null,
      workerId: "worker-2",
      lane: "core",
      scope: "campaign_daily",
      partitionStatus: "failed",
      outcome: {
        ok: false,
        reason: "lease_conflict",
      },
      denialClassification: "already_terminal",
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "[google-ads-sync] google_ads_completion_outcome",
      expect.objectContaining({
        partitionId: "partition-2",
        ok: false,
        reason: "lease_conflict",
        denialClassification: "already_terminal",
        failureBackfillWillTrigger: true,
      }),
    );
  });
});
