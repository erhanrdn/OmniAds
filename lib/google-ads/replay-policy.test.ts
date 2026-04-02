import { describe, expect, it } from "vitest";
import {
  resolveGoogleReplayReasonCode,
  resolvePhaseAwareReplayDecision,
  shouldCountGoogleAdsReplayChunkAsFetched,
  validateGoogleReplayCompleteness,
} from "@/lib/sync/google-ads-sync";

describe("Google replay policy", () => {
  it("resumes finalize-only replay when lineage and counts are complete", () => {
    const decision = resolvePhaseAwareReplayDecision({
      checkpoint: {
        partitionId: "p1",
        businessId: "b1",
        providerAccountId: "a1",
        checkpointScope: "campaign_daily",
        phase: "finalize",
        status: "failed",
        pageIndex: 3,
        rawSnapshotIds: ["s1", "s2", "s3", "s4"],
        rowsFetched: 400,
        rowsWritten: 400,
        attemptCount: 1,
      },
      existingSnapshots: [
        { id: "s1", page_index: 0, payload_json: [] },
        { id: "s2", page_index: 1, payload_json: [] },
        { id: "s3", page_index: 2, payload_json: [] },
        { id: "s4", page_index: 3, payload_json: [] },
      ],
      totalChunks: 4,
    });

    expect(decision.finalizeOnly).toBe(true);
    expect(decision.startChunkIndex).toBe(4);
    expect(decision.replayReasonCode).toBe("reclaim_replay");
  });

  it("falls back to chunk replay when finalize lineage is incomplete", () => {
    const decision = resolvePhaseAwareReplayDecision({
      checkpoint: {
        partitionId: "p1",
        businessId: "b1",
        providerAccountId: "a1",
        checkpointScope: "campaign_daily",
        phase: "finalize",
        status: "failed",
        pageIndex: 2,
        rawSnapshotIds: ["s1", "s2", "missing"],
        rowsFetched: 300,
        rowsWritten: 250,
        attemptCount: 2,
      },
      existingSnapshots: [
        { id: "s1", page_index: 0, payload_json: [] },
        { id: "s2", page_index: 1, payload_json: [] },
      ],
      totalChunks: 3,
    });

    expect(decision.finalizeOnly).toBe(false);
    expect(decision.startChunkIndex).toBe(2);
    expect(decision.continuityBroken).toBe(true);
  });

  it("detects completeness mismatches before finalize succeeds", () => {
    const result = validateGoogleReplayCompleteness({
      totalChunks: 3,
      finalRawSnapshotIds: ["s1", "s2", "s3"],
      storedSnapshotIds: ["s1", "s2"],
      rowsFetched: 100,
      rowsWritten: 120,
    });

    expect(result.ok).toBe(false);
    expect(result.snapshotCoverageBroken).toBe(true);
    expect(result.rowCountBroken).toBe(true);
  });

  it("treats multi-chunk stored snapshot coverage as complete when all chunk snapshots exist", () => {
    const result = validateGoogleReplayCompleteness({
      totalChunks: 3,
      finalRawSnapshotIds: ["s1", "s2", "s3"],
      storedSnapshotIds: ["s1", "s2", "s3"],
      rowsFetched: 300,
      rowsWritten: 300,
    });

    expect(result.ok).toBe(true);
    expect(result.snapshotCoverageBroken).toBe(false);
    expect(result.rowCountBroken).toBe(false);
  });

  it("counts replayed persisted chunks beyond the failed checkpoint page toward fetched rows", () => {
    expect(
      shouldCountGoogleAdsReplayChunkAsFetched({
        pageIndex: 2,
        checkpointPageIndex: 1,
        replayingPersistedChunk: true,
      })
    ).toBe(true);

    expect(
      shouldCountGoogleAdsReplayChunkAsFetched({
        pageIndex: 1,
        checkpointPageIndex: 1,
        replayingPersistedChunk: true,
      })
    ).toBe(false);

    expect(
      shouldCountGoogleAdsReplayChunkAsFetched({
        pageIndex: 1,
        checkpointPageIndex: 1,
        replayingPersistedChunk: false,
      })
    ).toBe(true);
  });

  it("classifies replay reasons deterministically", () => {
    expect(
      resolveGoogleReplayReasonCode({
        checkpointStatus: "failed",
        checkpointPhase: "transform",
      })
    ).toBe("transform_failure_replay");

    expect(
      resolveGoogleReplayReasonCode({
        checkpointStatus: "failed",
        checkpointPhase: "bulk_upsert",
      })
    ).toBe("flush_verification_mismatch");

    expect(
      resolveGoogleReplayReasonCode({
        checkpointStatus: "failed",
        checkpointPhase: "fetch_raw",
        retryAfterAt: new Date().toISOString(),
      })
    ).toBe("quota_retry");
  });
});
